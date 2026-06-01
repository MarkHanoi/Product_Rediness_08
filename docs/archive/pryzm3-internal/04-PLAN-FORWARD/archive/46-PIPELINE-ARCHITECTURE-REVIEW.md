# PRYZM Pipeline Architecture Review
**Date**: 2026-05-07  
**Scope**: CW/Slab batch pipeline, plan-view projection subsystem, command dispatch layer  
**Status**: Analysis complete — no code changes made  
**Files reviewed** (fully read):
- `CreateCurtainWallsOnAllSlabsCommand.ts` (1009 lines)
- `BatchCoordinator.ts` (1413 lines)
- `CurtainWallBuilder.ts` (1490 lines)
- `EdgeProjectorService.ts` (2221 lines)
- `CurtainWallStore.ts` (409 lines)
- `ViewDependencyTracker.ts` (400 lines)
- `CommandManager.ts` (385 lines)
- `CurtainWallInstanceManager.ts` (313 lines)
- `RemoteCommandDispatcher.ts` (178 lines)
- `ElementRegistry.ts` (148 lines)
- `StoreEventBus.ts` (18-line shim)
- `global-window.d.ts` (473 lines)

---

## Executive Summary

All five phases of the CW/Slab batch implementation plan (doc 45) are confirmed complete with zero TypeScript errors. The pipeline is functionally correct and handles the primary performance concerns (GPU LONGTASKs, shadow deferral, per-layer rAF yielding, CW projection caching). The remaining issues are **structural** — they create maintenance risk, latent correctness bugs under edge-case load, and a ceiling on further scalability. None require immediate hotfixes. They are ranked below by risk tier.

---

## Tier 1 — Correctness Risk (fix before next major feature)

### I-1: Redo path bypasses `runBatch` — no batch protection on redo

**Location**: `CreateCurtainWallsOnAllSlabsCommand.ts` — `redo()` method  
**Symptom**: `redo()` calls `_processSlabs()` directly. `_processSlabsInner()` calls `batchCoordinator.registerElement()` inside a plain loop, but `runBatch()` is never called. The `StoreEventBus` outer bracket is not opened, `__wallRebuildControl.pause()` is not called, and `__curtainWallRebuildControl.pause()` is not called.

**Consequence**: On a redo with ≥1 slab:
1. Each `curtainWallStore.add()` fires a live `bim-curtainwall-added` window event immediately (not deferred).
2. `CurtainWallBuilder` receives N individual build triggers (no coalesced drain).
3. `WallFragmentBuilder` is not paused, so wall-join events interleave.
4. The render-suppress overlay never shows — the scene is visually unstable for the duration of N individual builds.
5. For a 294-wall redo this produces ≈294 individual Three.js group constructions with no inter-frame yield, likely a LONGTASK.

**Root cause**: The command was written to optimise the `execute()` path; the `redo()` path was left as a passthrough to `_processSlabs()` without the same batch wrapper.

**Risk**: High on large projects. A user with 6 slabs × 49 walls per slab who presses Ctrl+Z then Ctrl+Y experiences the full unprotected load.

**Recommended fix plan**:
- Extract the `runBatch(...)` call wrapper from `execute()` into a private `_executeWithBatch(context)` helper.
- Have both `execute()` and `redo()` delegate to `_executeWithBatch()`.
- Ensure `redo()` also calls `_collectSlabs()` fresh (slab geometry may have changed since original execute).

---

### I-2: `CurtainWallStore.addMany()` silent-continue on missing `addManyPaused`

**Location**: `CurtainWallStore.ts` — `addMany()` fallback branch (lines ~200–240)  
**Symptom**: When `addManyPaused` is unavailable on the builder (`window.__curtainWallRebuildControl?.addManyPaused` resolves to `undefined`), the code logs an error and calls plain `add()` per wall. This fires N individual `bim-curtainwall-added` events — the same unprotected path as I-1 — while the `BatchCoordinator` believes its batch is still running (it opened the `StoreEventBus` bracket and set `isBatching = true`).

**Consequence**:
- `CurtainWallBuilder` processes each wall's `bim-curtainwall-added` event one at a time but `isBatching` is still true, so each build sets `_batchShadowPending` and defers shadows.
- The registration drain in `BatchCoordinator._drainRegistrations()` never fires shadow reactivation for walls built through this fallback path because those walls are not in `_batchShadowPending` at the right time relative to the drain sequence.
- Walls built via the fallback will have `shadowDeferred = true` permanently (no reactivation) unless the 30-second timer covers them.

**Root cause**: The fallback was added as a safety net during Phase B development. The "addManyPaused unavailable" scenario was expected to be transient but is possible if `CurtainWallBuilder` is not yet wired (e.g. first load race condition).

**Risk**: Medium. Observed only in race-condition scenarios, but when it triggers, affected walls silently never cast/receive shadows.

**Recommended fix plan**:
- Wrap the fallback path in a `requestAnimationFrame` drain loop (max N walls per frame) so the fallback doesn't cause a synchronous LONGTASK.
- After the fallback loop completes, explicitly call `this._batchShadowPending.add(id)` for each wall so the 30-second drain can cover them.
- Add a `console.error` with a `batchId` tag so production logs make this visible.

---

### I-3: `invalidateCwElement()` is O(n) per wall — O(n²) on batch undo

**Location**: `EdgeProjectorService.ts` — `invalidateCwElement()` method (lines ~1132–1150)  
**Symptom**: The method iterates the full `_cwProjectionCache` Map to find all keys matching `elementId`. The Map key format is `"${elementId}:${viewId}"` but the lookup uses a string-prefix scan rather than a direct keyed delete.

**Consequence**: For a project with V open views and W curtain walls, each `invalidateCwElement()` call is O(V × W). On undo of a 294-wall batch:
- 294 `remove()` calls × each calling `invalidateCwElement()`.
- Each call iterates the full cache (up to 294 walls × V views entries).
- Total iterations: 294 × (294 × V) = ~86,436 iterations at V=1 view, ~259,308 at V=3 views.
- All synchronous, on the main thread, during the undo handler.

**Root cause**: Cache key design. Using a composite `elementId:viewId` key requires a prefix scan on delete-by-element because `Map` has no prefix-delete API. The correct data structure is a two-level Map: `Map<elementId, Map<viewId, CacheEntry>>`.

**Risk**: Medium-high. Undo of large batches is visibly slow on projects with multiple open views. At 500+ walls it crosses the LONGTASK threshold.

**Recommended fix plan** (two-level Map refactor):
- Change `_cwProjectionCache` from `Map<string, CacheEntry>` to `Map<string, Map<string, CacheEntry>>` (outer key = `elementId`, inner key = `viewId`).
- `_getCwCached(elementId, viewId)` → `_cwProjectionCache.get(elementId)?.get(viewId)?.layers ?? null`
- `_putCwCache(elementId, viewId, ...)` → upsert into inner Map.
- `invalidateCwElement(elementId)` → `_cwProjectionCache.delete(elementId)` — O(1).
- `invalidateCwView(viewId)` → iterate outer Map once, delete matching inner entries — O(W).
- `clearAll()` → `_cwProjectionCache.clear()` — O(1).

---

## Tier 2 — Architectural Debt (address in next cleanup wave)

### II-1: `CommandManager` is deprecated but has 101 call-site files

**Location**: `CommandManager.ts` — class-level `@deprecated` JSDoc (line 32); `global-window.d.ts` `window.commandManager?: any`; migration plan in `33-PHASE-E5X-COMMANDMANAGER-FULL-MIGRATION.md`  
**Symptom**: `commandManager.execute()` is deprecated in favour of `runtime.bus.executeCommand()`. The grep count is 101 TypeScript files still importing or calling `commandManager` directly.

**Current state of migration**:
- `BatchCoordinator` has a dual path: tries `rt.bus.executeCommand('rooms.redetect', ...)` first, falls back to `cm.execute(new ReDetectRoomsCommand(...))` when `runtime` is not injected or the handler is not registered.
- `RemoteCommandDispatcher` fires and forgets to both `runtime.bus` and `commandManager` on remote commands — double-dispatch is silent if both succeed.

**Risks from dual-dispatch**:
- Remote undo/redo commands could be applied twice if both `runtime.bus` and `commandManager` handlers both execute state mutations for the same command type.
- Error handling is asymmetric: `commandManager.execute()` returns a `CommandResult`; `runtime.bus.executeCommand()` returns `void` or `Promise<void>` depending on handler. Callers that check `result.success` only see the `commandManager` result.

**Recommended fix plan** (references doc 33):
- Phase E5.x is already planned. This review confirms the 101-file count and double-dispatch pattern as the two highest-priority items within that phase.
- Prioritise: (a) remove double-dispatch from `RemoteCommandDispatcher`; (b) migrate `BatchCoordinator` to require `runtime` injection (remove legacy fallback); (c) sweep remaining 99 files in batches of 20.

---

### II-2: `window.__wallRebuildControl` / `__curtainWallRebuildControl` / `__slabRebuildControl` — temporal coupling via globals

**Location**: `BatchCoordinator.ts` — `_setupBatch()`, `_executeFinalSweep()`, `forceReset()`, `runBatch()`; `global-window.d.ts` §9  
**Symptom**: Three builder pause/resume surfaces are accessed via `window.__*RebuildControl` globals. There is no type-safe guarantee that the builders have registered themselves before `BatchCoordinator.runBatch()` fires.

**Current mitigations**:
- All three are optional-chained (`?.pause()`, `?.resumeAndFlush()`, etc.).
- `forceReset()` also optional-chains them.
- `global-window.d.ts` documents the assignment order (builders wire in `engineLauncher.ts`).

**Latent risks**:
- If `engineLauncher.ts` assignment order changes (e.g. lazy loading), `pause()` silently no-ops and builders are not paused during batch. The batch then produces N individual build events rather than a coalesced drain — no error, no warning.
- `window.__curtainWallRebuildControl.addManyPaused` is typed as optional (`?`) even though it is the primary batch path — `addMany()` fallback path (I-2 above) is triggered by its absence.
- The typed shape in `global-window.d.ts` line 427 uses an inline `import()` type reference inside a `.d.ts` global declaration — this is fragile across monorepo package boundary changes.

**Recommended fix plan**:
- Introduce a `BatchCoordinator.registerBuilderControls(wall, cw, slab)` injection method called from `engineLauncher.ts` after all builders are initialised.
- Store the controls as private typed fields (not window globals).
- `window.__*RebuildControl` can remain as a DEV-only debug surface (gated behind `import.meta.env.DEV`) but should not be the primary coupling mechanism.

---

### II-3: `CurtainWallBuilder` single-callback pattern — silent overwrite on multi-instance

**Location**: `CurtainWallBuilder.ts` constructor — `batchCoordinator.setShadowReactivationCallback(this._reactivateShadows.bind(this))`  
**Symptom**: `BatchCoordinator._shadowReactivationCallback` is a single function slot. The constructor of each `CurtainWallBuilder` overwrites the previous callback. If two `CurtainWallBuilder` instances exist simultaneously (e.g. during project switch overlap, or if the builder is re-instantiated before the previous one is disposed), only the last-registered instance receives the shadow reactivation trigger.

**Consequence**: Walls built by the first builder instance will have `shadowDeferred = true` permanently. This is silent — no error, no warning.

**Root cause**: Single-callback design was acceptable when there was one builder per session. The project-switch teardown (wave 35) creates a window where old and new builders can coexist briefly.

**Recommended fix plan**:
- Change `setShadowReactivationCallback` to `addShadowReactivationCallback` (or use a `Set<() => void>`).
- `BatchCoordinator._drainRegistrations()` iterates the set, calling all registered callbacks.
- Builders call `removeShadowReactivationCallback(cb)` in their `dispose()`.

---

### II-4: `EdgeProjectorService` god-file — 2221 lines, mixed concerns

**Location**: `EdgeProjectorService.ts`  
**Symptom**: A single file contains:
1. Source A — OBC fragments projection pipeline
2. Source B — native element mesh projection (with CW InstancedMesh proxy expansion, EdgesGeometry allocation, layer classification, cut/proj/beyond classification, mergeGeometries, toDrawingSpace, suppressor calls)
3. Source C — IFC scene mesh projection
4. All symbol injectors called inline (door, sofa, bed, wardrobe, chair, kitchen, tree, window, stair, roof-slope, column)
5. The `_cwProjectionCache` with its own get/put/invalidate/clear methods
6. `resolveClipRange()` — a pure ViewDefinition utility
7. `getDirectionForView()` — another pure utility
8. HLR (`removeHiddenLines`) called at the end of `project()`

**Specific concerns**:
- The `project()` method is itself a single `async` method of ~1600 lines. It cannot be unit-tested in isolation — the only way to test Source B projection is to invoke the full pipeline.
- Source C (IFC) has **no caching** equivalent to the CW projection cache. On each projection, every visible IFC mesh goes through `new THREE.EdgesGeometry(mesh.geometry)` + `toDrawingSpace()` synchronously (no rAF yield, no cache). For large IFC models this will produce a LONGTASK.
- The per-layer rAF yield (`_hasCWElements` guard, line 1731) is a heuristic — it fires only when the current projection batch contains CW elements. A mixed batch (walls + CW + IFC) may still block if the IFC segment runs before the guard is checked.
- Symbol injectors are called as side-effects on the `drawing` object. If any injector throws, the drawing is returned in a partially-injected state (try/catch is absent around individual injectors).

**Recommended fix plan** (multi-wave refactor, not a single change):
- Extract `_CwProjectionCache` to its own class in a separate file.
- Extract `_projectNativeElements()` (Source B) as a standalone async method.
- Extract `_projectIfcElements()` (Source C) as a standalone async method; add CW-style rAF chunking and a basic version-keyed cache.
- Extract `resolveClipRange()` and `getDirectionForView()` to a `ViewClipResolver` utility class.
- Wrap each symbol injector call in its own try/catch with a descriptive warning.
- This decomposition reduces the file to a coordinator (~400 lines) and makes each source independently testable.

---

### II-5: 30-second shadow delay — UX regression risk and no cancellation on project switch

**Location**: `CurtainWallBuilder.ts` — `_reactivateShadows()` (lines 1239–1269)  
**Symptom**: Shadow reactivation is scheduled via `setTimeout(drainSlice, 30000)`. The comment documents the rationale: the 30s delay avoids a collision with the post-batch LONGTASK storm (~13s observed peak).

**Issues**:
1. **No cancellation on project switch**: `forceReset()` in `BatchCoordinator` calls `resumeAndFlush()` on `__curtainWallRebuildControl` but does not cancel pending shadow `setTimeout` handles. If the user switches projects within 30 seconds, the shadow drain fires for Project A walls on Project B's scene. Because `_reactivateShadows()` uses `this.roots.get(cwId)` to find the group, and Project A's roots Map was cleared by `dispose()`, most lookups return `undefined` and are silently skipped — but this is a fragile guarantee that depends on `dispose()` order.
2. **No user feedback**: From the user's perspective, curtain walls are rendered without shadows for ~30s after creation, with no indication that shadows are pending.
3. **Hardcoded timing assumption**: The 30s value embeds a measurement from a specific hardware/scene-size combination. A faster machine (where the LONGTASK storm is shorter) wastes UX time; a slower machine (where the storm runs longer) may still collide.

**Recommended fix plan**:
- Store the `setTimeout` handle in `_batchShadowTimeoutHandle: ReturnType<typeof setTimeout> | null`.
- In `dispose()` and in the project-switch path, call `clearTimeout(this._batchShadowTimeoutHandle)`.
- Consider a dynamic delay: measure when `BatchCoordinator._drainRegistrations()` completes (T_drain), then schedule shadows at T_drain + 20s (replacing the fixed 30s from construction time).
- Add a subtle status indicator ("Shadows loading…") in the plan-view overlay that clears when the final shadow slice completes.

---

### II-6: UUID pre-generation (2000 IDs) at command construction time

**Location**: `CreateCurtainWallsOnAllSlabsCommand.ts` — constructor  
**Symptom**: The constructor generates 2000 UUIDs via `Array.from({ length: 2000 }, () => crypto.randomUUID())` before `execute()` is called. This happens synchronously on the main thread at the moment the command is instantiated (i.e. when the user clicks "Create Curtain Walls on All Slabs" in the UI).

**Issues**:
1. `crypto.randomUUID()` × 2000 is fast (~1–2ms) on V8 but occupies the main thread before the user interaction completes.
2. If the project has fewer than 2000 walls (the common case), 1950+ UUIDs are allocated and never used, creating minor GC pressure.
3. The pool-overflow fallback (calls `crypto.randomUUID()` inline during `execute()`) is inconsistent — the command has two UUID-generation paths with different performance characteristics and no single point of control.

**Recommended fix plan**:
- Remove upfront pre-generation from the constructor.
- Use a lazy UUID generator inside `execute()`: `_nextId = () => this._idPool.pop() ?? crypto.randomUUID()`.
- Fill the pool lazily to `Math.min(slabCount × avgWallsPerSlab × 1.1, 500)` after `_collectSlabs()` has run (so the pool is right-sized).
- This eliminates the 2000-UUID allocation on construction and ensures a single unified code path.

---

## Tier 3 — Latency / Observability (schedule as housekeeping)

### III-1: `ViewDependencyTracker` serial flush — N views projected sequentially

**Location**: `ViewDependencyTracker.ts` — `_flush()` method  
**Symptom**: `_flush()` iterates dirty views with `for...of` and `await`s each `edgeProjectorService.project(viewDef)` call. For a project with 4 open views, all four are re-projected one after another in a single async chain.

**Impact**: Total flush time = sum of per-view projection times. With the per-layer rAF yielding in EPS, each CW view projection takes approximately `17 CW groups × 3 layers × 16ms` ≈ 816ms of elapsed time. Four views = 3.26 seconds of elapsed latency from the 300ms debounce trigger to all views being fully up-to-date.

**Recommended fix plan**:
- Identify which views are independent (no shared drawing resources). Most are — each `ViewDefinition` writes to its own `ViewTechnicalDrawingCache` entry.
- Use `Promise.all(dirtyViews.map(v => this._projectView(v)))` for independent views.
- For views that share a drawing (split-view pairs), preserve serial order.
- This compresses N independent view flushes from serial to parallel, reducing total elapsed time from `N × T_view` to `max(T_view_1, ..., T_view_N)`.

---

### III-2: `DEBOUNCE_MS = 300` adds latency on first mark-dirty after batch

**Location**: `ViewDependencyTracker.ts` — `DEBOUNCE_MS` constant  
**Symptom**: After `BatchCoordinator._executeFinalSweep()` calls `markLevelsDirty()`, the view projection is delayed by 300ms before `_flush()` fires. This is correct for interactive edits (prevents thrashing during rapid property changes) but adds unnecessary latency after a one-shot batch operation.

**Impact**: 300ms of dead time between batch completion (overlay dismissed) and plan-view update starting.

**Recommended fix plan**:
- Add a `markLevelsDirtyImmediate(levelIds)` method that bypasses the debounce and calls `_flush()` synchronously (or via `requestAnimationFrame`).
- `BatchCoordinator` calls `markLevelsDirtyImmediate()` at the end of `_executeFinalSweep()` for batch operations.
- Regular property edits continue to use the debounced `markLevelsDirty()`.

---

### III-3: Source C (IFC) projection has no cache and no rAF chunking

**Location**: `EdgeProjectorService.ts` — Source C block (lines ~1816–1972)  
**Symptom**: IFC scene meshes are projected synchronously on every `project()` call with no version-keyed cache equivalent to the CW projection cache. For a model with 1000 IFC elements, each plan-view reprojection after any dirty trigger allocates and processes 1000 `EdgesGeometry` objects synchronously.

**Impact**: Users who import IFC files will experience a LONGTASK on every plan-view reprojection, regardless of what changed. The CW cache (introduced in Phase C) specifically exempts IFC elements from caching.

**Recommended fix plan**:
- Assign a version counter to each IFC element group (or use the IFC model's modification timestamp).
- Cache the projection result per (elementId, viewId, version) using the same `Map<elementId, Map<viewId, CacheEntry>>` structure from fix I-3.
- Add the same per-group rAF yield pattern used for CW elements (the `_hasCWElements` guard does not cover IFC elements).

---

### III-4: `global-window.d.ts` has 157 `any`-typed globals — no injection progress metric

**Location**: `global-window.d.ts` — all 157 properties declared as `any`  
**Symptom**: The file was introduced in Wave 5 as a typed shim to replace raw `(window as any).X` casts. The TODO at line 26 notes progressive narrowing is scheduled for Wave 6/7. As of Wave 35, all 157 properties remain `any`.

**Impact**:
- TypeScript cannot catch type mismatches between writers and readers of window globals.
- The migration plan (doc 23 E5.x) depends on narrowing `window.runtime` to `PryzmRuntime | null` as a gate for CommandManager migration completion. This narrowing cannot happen while the property is `any`.
- The file serves as a catalogue of architectural debt — each `any` entry is a singleton that should eventually become an injected dependency.

**Recommended fix plan**:
- Add a count metric to the Wave 6/7 DoD: "window globals narrowed from any: N / 157."
- Prioritise narrowing the five properties that are on the critical path for doc 33 (CommandManager migration): `window.runtime`, `window.commandManager`, `window.commandContext`, `window.bimManager`, `window.storeEventBus` (currently a re-export shim).
- Track remaining `any` entries in doc 13 (Risk Register) with a quarterly decay target.

---

### III-5: `StoreEventBus` is still a re-export shim — migration incomplete

**Location**: `src/engine/subsystems/core/StoreEventBus.ts`  
**Symptom**: The file is a 17-line re-export shim pointing to `@pryzm/core-app-model`. The comment says this is "a temporary strangler-fig shim" introduced in Wave 10 Task W10-A. The shim means all importers of the old path continue to compile, masking the fact that the canonical path is in the package.

**Impact**:
- `BatchCoordinator` imports `storeEventBus` from the relative `../core/StoreEventBus` path (through the shim). New code should import from `@pryzm/core-app-model` directly — but the shim makes both paths equivalent, hiding which callers have been migrated.
- The shim is itself a module with exports, so tree-shaking tools may emit it in the bundle unnecessarily.

**Recommended fix plan**:
- Audit all importers of `../core/StoreEventBus` (relative path).
- Update them to import from `@pryzm/core-app-model` directly.
- Delete the shim file once all importers are migrated.
- Add a TypeScript path alias guard in `tsconfig.json` to make future imports of the old path a compile error.

---

## Tier 4 — Observation-Only (log these; no action required immediately)

### IV-1: Verbose diagnostic logging in production code paths

All five major pipeline files (`BatchCoordinator`, `CurtainWallBuilder`, `EdgeProjectorService`, `ViewDependencyTracker`, `CreateCurtainWallsOnAllSlabsCommand`) contain dense `console.log` instrumentation tagged with `§TRACE`, `§DIAG`, `§PERF`, `§SHADOW`, etc. These were introduced during performance investigation sprints and are valuable for diagnosing production issues.

**Observation**: The logging volume during a 49-wall batch is significant:
- `BatchCoordinator`: ~40–60 lines per batch (§TRACE ON-BATCH-START through §TRACE ON-BATCH-END-DONE)
- `CurtainWallBuilder`: 49 × `§DIAG-BUILD-01` lines (one per wall, always-on when `isBatching`)
- `EdgeProjectorService`: per-group §DIAG-EPS-01/02/03/04 lines (34 meshes × 3 layers per CW)

At 49 walls × 34 meshes × 3 layers = 4,998 §DIAG log lines per projection run. This adds measurable V8 string allocation and `console` overhead in production.

**Not a bug** — the tagging scheme is correct and the logs are the primary diagnostic tool for post-session analysis. No action required until a structured logging/sampling strategy is defined (see doc 24 OTel plan).

---

### IV-2: `removeHiddenLines()` runs after every symbol injection pass

**Location**: `EdgeProjectorService.ts` — line 2078  
**Symptom**: HLR runs at the end of `project()` after all symbol injectors have run. Symbol injectors (`doorPlanSymbolBuilder.inject()`, etc.) add `LineSegments` to the drawing without going through the HLR pass — they are always visible regardless of occlusion.

**Observation**: This is the current documented behaviour (Contract 23 §9 note: "Must run AFTER all symbol injections"). Whether door swings and stair symbols should participate in HLR depends on product decisions (they typically should not — they are 2D AEC conventions, not 3D geometry projections). No correctness issue; documenting for awareness.

---

## Implementation Priority Order

| # | Item | Tier | Effort | Risk if deferred |
|---|------|------|--------|-----------------|
| 1 | I-1: Redo path missing `runBatch` | Correctness | Small (extract helper) | High — LONGTASK on large redo |
| 2 | I-3: `invalidateCwElement` O(n²) | Correctness | Medium (two-level Map) | Medium — slow undo on large projects |
| 3 | I-2: `addMany` fallback shadow orphan | Correctness | Small (explicit shadow enqueue) | Medium — silent shadow bug |
| 4 | II-5: Shadow cancel on project switch | Arch Debt | Small (store handle) | Medium — stale callback risk |
| 5 | II-2: Replace window globals with injection | Arch Debt | Large (multi-file) | Low — silent no-op if order changes |
| 6 | II-1: CommandManager dual-dispatch | Arch Debt | Large (doc 33 wave) | Medium — double-apply on remote undo |
| 7 | II-3: Single shadow callback overwrite | Arch Debt | Small (Set pattern) | Low — only on multi-builder overlap |
| 8 | II-6: UUID pre-generation | Arch Debt | Small | Low — minor GC pressure |
| 9 | III-1: Serial view flush → parallel | Latency | Medium | Low — 4× elapsed time on 4 views |
| 10 | III-2: Debounce bypass for batch | Latency | Small | Low — 300ms dead time |
| 11 | III-3: IFC projection cache | Latency | Large | Low (no IFC users yet) |
| 12 | II-4: EPS god-file decomposition | Arch Debt | Large (multi-wave) | Low — maintainability only |
| 13 | III-4: global-window.d.ts narrowing | Observability | Large (ongoing) | Low — blocks doc 33 gate |
| 14 | III-5: StoreEventBus shim deletion | Housekeeping | Small | Low — bundle size only |

---

## Suggested Next Steps

**Sprint 1 (1–2 days)**: Items 1, 3, 8 — all small, correctness improvements with no architectural risk.

**Sprint 2 (2–3 days)**: Items 2, 4, 7 — the cache O(n²) refactor plus two small defensive hardening items.

**Sprint 3 (1 week)**: Items 5, 9, 10 — injection refactor, parallel flush, debounce bypass.

**Wave (ongoing)**: Items 6, 12, 13, 14 — these are multi-week structural migrations already tracked in their respective plan documents (docs 23, 33).

---

*Document produced from full code read of all listed files. No changes were made to any source file during this analysis.*
