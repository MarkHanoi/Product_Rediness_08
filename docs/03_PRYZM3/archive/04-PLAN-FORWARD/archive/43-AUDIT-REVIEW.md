# 43 — Independent Review of PRYZM-CurtainWall-Batch-Audit.md

> **Scope**: Five-dimensional review of `PRYZM-CurtainWall-Batch-Audit.md` (hereafter "the Audit").
> Dimensions assessed: (1) Architectural Soundness, (2) Alignment with existing docs/contracts/vision,
> (3) Correctness of findings, (4) Factual accuracy, (5) Completeness.
>
> **Method**: Full read of the Audit; full read of all documents it cites
> (`40-CW-PIPELINE-TRACE.md`, `41-BATCH-ERROS.md`); full source read of all 9 primary files
> listed in the Audit's scope (`BatchCoordinator.ts` 1,386 lines, `CreateCurtainWallsOnAllSlabsCommand.ts`
> 993 lines, `CurtainWallStore.ts` 371 lines, `CurtainWallBuilder.ts` 1,337 lines,
> `ElementRegistry.ts` 74 lines, and five others); cross-reference with
> `42-DEEP-PIPELINE-ANALYSIS.md`, `C01`, `C11`, `01-VISION.md`, `02-ARCHITECTURE.md`.
>
> **Status**: ANALYSIS ONLY — no code changes.
> **Date**: 2026-05-07

---

## Verdict Summary

| Dimension | Rating | One-line summary |
|-----------|--------|-----------------|
| Architectural Soundness | **Partial** | Several proposals are valid directions; others would actively break the existing architecture. |
| Alignment with docs/contracts/vision | **Partial** | Layer boundary awareness is good; proposes APIs that duplicate already-existing mechanisms. |
| Correctness | **Partial** | About half the findings describe real problems; half misdiagnose solved problems or propose wrong fixes. |
| Factual Accuracy | **Poor** | Three of its five P0 priority items are factually incorrect descriptions of the current codebase. |
| Completeness | **Partial** | Covers symptoms well; misses the two highest-value remaining problems entirely. |

**Bottom line**: The Audit reads like it was written against an earlier version of the codebase — roughly the state before the 2026-05-04/05/06 performance sprint documented in `41-BATCH-ERROS.md`. Many problems it calls "CRITICAL" were fixed in that sprint. Its proposed fixes sometimes conflict with mechanisms that already exist and are working. It is useful as a catalogue of symptoms but should not be used as a work plan without heavy revision.

---

## 1. Architectural Soundness

### 1.1 Sound proposals

**§1.4 / §12.1 — `registerSemanticOrReplace` and `unregisterIfPresent`**

`ElementRegistry.registerSemantic()` does throw on duplicate (confirmed: line 36 of
`ElementRegistry.ts`). The proposal to add `unregisterIfPresent(id)` and `registerSemanticOrReplace(id, type)` as safe variants is architecturally clean, matches the existing `clear()` pattern, and is genuinely useful for the undo/redo race described.

**§8.2 — Prune `ViewDependencyTracker` on unregister**

`elementRegistry.onUnregister` does not appear to exist, but the underlying concern — phantom element IDs accumulating in the dependency graph after undo — is architecturally valid. The proposed `elementRegistry.onUnregister(id => this.removeDependency(id))` hook pattern is correct and consistent with C01 §2.3 (explicit lifecycle).

**§10.2 — Collaboration ordering via `seqNo`**

The concern about causal ordering in `replayCatchUp` is valid and the `seqNo` sort fix is correct.

**§13.1 / §13.2 — Observability improvements**

Threading a `batchId` through diagnostic logs and replacing `Date.now()` with `performance.now()` are low-risk, high-value observability improvements with no architectural concerns.

**§12.2 — `WeakRef` in `ElementRegistry`**

Architecturally valid. `unregisterRoot()` exists but is not always called on undo paths. `WeakRef` is the correct mitigation.

---

### 1.2 Architecturally problematic proposals

**§3.1 — "Batch work must be cooperatively scheduled by the frame loop"**

The proposed fix moves `_processSlabs()` into a `UnifiedFrameLoop.enqueueBatchWork()` queue, yielding between slabs via `await yieldToFrame()`.

This would break the existing architecture in a fundamental way. The `BatchCoordinator.runBatch()` design is explicitly synchronous for a reason documented at the top of `BatchCoordinator.ts` (P1.2 comments):

> "Depth flow: runBatch() calls storeEventBus.beginBatch() → depth: 0→1. runBatch() calls storeEventBus.batch(fn) → depth: 1→2. fn() runs — all store.add() calls buffered at depth 2."

If `fn()` is split across rAF frames, the `storeEventBus.batch()` inner bracket (depth 2) would need to stay open across multiple frames. The depth-counting invariant — that depth 2 means "inside synchronous mutation, no flush possible" — would be broken. Any subscriber that reads store state between yield points would see a partially-constructed batch. The event ordering guarantees in C01 §5 ("No Event Drops") would require redesign from scratch.

The actual fix for jank during batch execution is already implemented: `PERF-DEFER-RESUME-FLUSH` defers the expensive `resumeAndFlush()` calls to the next `pre-render` FrameScheduler slot, so `runBatch()` returns quickly and the main thread is freed.

**§2.1 — `BatchResult<T>` with async `runBatch`**

The Audit proposes replacing `runBatch` with an async function that collects `successes[]` and `failures[]`. But `runBatch<T>(fn: () => T, opts: BatchOptions): T` is synchronous by design (the mutation phase must be atomic). Making it async would require the same depth-counting architecture redesign described above. The proposed API signature is incompatible with the existing contract.

The legitimate concern — that errors inside `fn()` are not surfaced to the caller — is already partially addressed: `runBatch()` does rethrow via its `catch(err) { throw err }` block. The real gap is that the `_processSlabs()` function itself catches individual slab errors. That is a narrower fix than the full async `BatchResult<T>` redesign.

**§6.2 — Post-batch geometry merge into a single draw call**

The Audit proposes merging all N curtain wall elements' projection geometries into one `THREE.Mesh` after the batch. This would make it impossible to:
- Select individual curtain walls in the drawing view (GPU picking needs per-element draw calls)
- Hide/show individual elements via `ViewDependencyTracker`
- Apply per-element visibility overrides (VG layer system)
- Export per-element DXF data (each element needs its own edge geometry)

This is a fundamental misunderstanding of why the per-element projection structure exists. It is not a performance mistake — it is the architecture.

**§2.2 — "No concurrency limit / no back-pressure" (Promise.all claim)**

See §4 (Factual Accuracy) for why this finding is factually wrong. Architecturally, proposing a `batchWithConcurrency` fix for a function that is synchronous is not a meaningful proposal.

---

## 2. Alignment with Existing Docs, Contracts, and Vision

### 2.1 Well-aligned

The Audit correctly identifies:
- The layer boundary (stores do not call builders, builders do not call stores) per C01 §2.7
- The command responsibility for spatial registration per C11 §4
- The need for `skipRedetectRooms` gating (C11 §3.1 — room topology is wall-domain, not CW-domain)
- The `StoreEventBus` as the authoritative event channel (C01 §3.8)

### 2.2 Misaligned with existing mechanisms

**§2.3 / §11.1 — `StoreEventBus.setSuppressMode()`**

The Audit says `setSuppressMode()` "does not exist on the canonical StoreEventBus" and proposes adding it. But the canonical StoreEventBus in `@pryzm/core-app-model` already has `beginBatch()/endBatch()/endBatchYielded()`, which provides exactly this suppression via depth-counting. The `BatchCoordinator.runBatch()` header documents this mechanism in full.

Proposing `setSuppressMode(true/false)` as the fix for §2.3 is proposing to build a second suppression API on top of the one that already exists and is already in use. `41-BATCH-ERROS.md` documents `P1.4 — §BATCH-EVENT-YIELD: Yielded event drain` as already implemented.

**§9.1 — Batch transaction mode in `CommandManager`**

The Audit proposes `CommandManager.beginBatch()` / `CommandManager.endBatch()` to defer `command-executed` events. This would duplicate the role of `storeEventBus.beginBatch()`. The `BatchCoordinator` already handles this: the `storeEventBus.beginBatch()` call in `runBatch()` buffers all events emitted during the batch, including those from any command dispatch path that goes through `storeEventBus.emit()`. Adding a separate deferral in `CommandManager` without coordinating with the existing `StoreEventBus` depth counter would create two independent suppression systems with no guarantee of ordering.

**§4.1 / §5.1 — RoomTopologyObserver and TopologySpatialIndex**

The Audit's criticism that "40 full topology rebuilds" fire during a CW batch is written as if the internal store listeners (`this.listeners.forEach`) are called per-item during `addMany()`. In the fast batch path (which is active whenever `batchCoordinator.isBatching === true`), the internal listener loop is **skipped entirely** — only `addManyPaused()` and `storeEventBus.emit()` (buffered at depth 2) fire. The `CurtainWallStore.ts` comment at line ~208 is explicit: "Internal listeners (RoomTopologyObserver, etc.) are NOT called per-item during a batch." The topology rebuild concern is pre-empted by the fast batch path.

Additionally, `skipRedetectRooms: true` is set in the `BatchOptions` for all CW batches, so `RoomTopologyObserver` is never triggered by the final sweep either.

---

## 3. Correctness of Findings

### 3.1 Findings that are correct

| Finding | Status | Notes |
|---------|--------|-------|
| §1.4 / §12.1 — `registerSemantic()` throws on duplicate | **Correct** | Confirmed: `ElementRegistry.ts` line 36 throws unconditionally. `unregisterIfPresent` is a valid fix. |
| §8.2 — Phantom entries in `ViewDependencyTracker` after undo | **Correct** | `onUnregister` hook doesn't exist; phantom accumulation is plausible. |
| §10.2 — `replayCatchUp` ordering without `seqNo` | **Correct** | Causal ordering gap is real. |
| §13.1/13.2 — `batchId` threading, `performance.now()` | **Correct** | Both are valid observability gaps. |
| §12.2 — Strong references in `ElementRegistry.idToRootMap` | **Correct** | `WeakRef` is the right fix. |
| §3.3 — No frame-pressure signal from `UnifiedFrameLoop` | **Correct** | `framePressure` getter is a valid addition; not yet implemented. |

### 3.2 Findings that describe already-solved problems

| Finding | What Audit Says | What Is Actually True |
|---------|----------------|----------------------|
| §2.3 — Per-element events | "storeEventBus.setSuppressMode() needed" | `beginBatch()/endBatchYielded()` already does this. All events buffered until final yielded flush. `41-BATCH-ERROS.md` §P1.4 documents implementation. |
| §3.1 — Batch outside frame loop | "Batch blocks main thread; must be integrated into UnifiedFrameLoop" | `PERF-DEFER-RESUME-FLUSH` already defers `resumeAndFlush()` to next `pre-render` slot. `runBatch()` returns quickly. The synchronous store-mutation phase is intentionally atomic. |
| §4.1 — 40 topology rebuilds | "RoomTopologyObserver fires 40 times during batch" | Fast batch path in `addMany()` skips `this.listeners` entirely when `batchCoordinator.isBatching`. Zero topology rebuilds during `addMany()`. `skipRedetectRooms: true` prevents final sweep. |
| §7.1 — EPS runs 40 times | "Subscribes to every element event; runs full pipeline 40 times" | `viewDependencyTracker.setSuppressed(true)` is called in `_setupBatch()`, blocking EPS during the entire batch. One deferred `markLevelsDirty()` fires post-batch. |
| §9.1 — CommandManager 40 events | "command-executed fires per child command" | `StoreEventBus.beginBatch()` is already open at depth ≥ 1 during the batch. All bus events are buffered. |

### 3.3 Findings with the right symptom but wrong fix

| Finding | Symptom | Proposed Fix | Problem with Fix |
|---------|---------|-------------|-----------------|
| §2.1 — Error propagation | Per-slab errors are silenced | Async `BatchResult<T>` | `runBatch` is synchronous by design. Async would break depth-counting invariant. Correct fix: propagate errors from `_processSlabs()`. |
| §6.1 — TypedArray pressure | GC pauses from small Float32Array allocations | `Float32Pool` in `EdgeProjectorService` | `EdgesGeometry` allocates internally in Three.js — application code cannot pool those buffers. The pool would need to be inside `THREE.EdgesGeometry`, which is a library concern. Correct fix: cache projected geometry per `(elementId, viewId, wallVersion)` — see `42-DEEP-PIPELINE-ANALYSIS.md` INE-03/04. |
| §2.3 — Event coalescing | Individual events per element slow things down | `setSuppressMode(true/false)` | `beginBatch()/endBatchYielded()` already does this. No new API needed. |

---

## 4. Factual Accuracy

This is the weakest dimension of the Audit. Several findings contain statements about the current codebase that are verifiably false when reading the source.

### 4.1 Critical factual errors

**§2.2 — "BatchCoordinator fires all work items in parallel via `Promise.all()`"**

This is false. `BatchCoordinator.runBatch<T>(fn: () => T, opts: BatchOptions): T` has return type `T` (not `Promise<T>`). It calls `storeEventBus.batch(fn)` which is synchronous. There is no `Promise.all()` anywhere in `BatchCoordinator`. The proposed fix — a `batchWithConcurrency(items, fn, concurrency=4)` async pool — solves a concurrency problem that does not exist. The "960 allocations from 40 concurrent geometry-build tasks" described in the finding is a fabrication; slab processing is sequential (one tight loop, no parallelism).

This is the Audit's single most damaging factual error because §2.2 is rated HIGH and its proposed fix would require gutting the existing synchronous architecture.

**§3.1 — "RAF_DRAIN built=5 remaining=5 — CW geometry is built synchronously without a frame budget"**

The Audit states CW geometry "is built synchronously without a frame budget" as a current problem. But `CurtainWallBuilder._drainBuildQueue()` uses an adaptive budget system with `MAX_BUILDS_PER_FRAME=20`, cap 30, floor 5, described in detail in `41-BATCH-ERROS.md §Fix 3`. The trace line `RAF_DRAIN built=5 remaining=5` is from an old trace; the current code builds 20 walls in the first drain frame and adapts upward.

**§4.1 — "A 40-element batch triggers 40 full topology rebuilds"**

The Audit derives this from §2.3 (per-element events trigger `RoomTopologyObserver`). But as established above: (a) the fast batch path in `addMany()` skips `this.listeners` entirely, so `RoomTopologyObserver` receives zero per-element calls during `addMany()`; and (b) `storeEventBus.beginBatch()` buffers all bus events at depth ≥ 1, so even the buffered `storeEventBus.emit()` calls never reach `RoomTopologyObserver` until `endBatchYielded()` runs. The "40 full topology rebuilds" never happen.

**§7.1 — "EPS trace repeats for every curtain wall element in the batch"**

The Audit says EdgeProjectorService `runs 40 times during one user action`. But `viewDependencyTracker.setSuppressed(true)` is called at batch start (confirmed: `BatchCoordinator._setupBatch()` comment "kills EdgeProjector 300ms debounce; no plan-view reprojection fires while batch data is being written"). EPS fires exactly once, post-batch, after `markLevelsDirty()`.

**§6.2 — "With 40 curtain walls, mergeGeometries is called 40 times"**

Correct symptom, wrong cause. The actual concern (documented in `42-DEEP-PIPELINE-ANALYSIS.md` INE-05) is that `mergeGeometries` runs once per group, not 40 times — but each group has 30-98 proxy meshes expanded from InstancedMesh instances. The fix is not a post-batch merge (which breaks per-element selection) but projection caching.

### 4.2 Factual errors confirmed by `41-BATCH-ERROS.md`

Document `41` explicitly marks two Audit-adjacent proposals as rejected:

**Claim A** (proposed fix using `buildSingle`, `_slabs` — non-existent methods): **REJECTED** with documented reason.

**Claim D** (`VGSceneApplicator.applyToProjectionLayers()` iterating 409 geometry objects): **REJECTED**. The actual function iterates `~14 VG categories` at O(1) each. The 400ms LONGTASK at that timestamp has a different cause.

### 4.3 Accurate factual statements

- `ElementRegistry.registerSemantic()` throws on duplicate: **TRUE** (line 36, `ElementRegistry.ts`)
- `storeEventBus` is a re-export shim from `@pryzm/core-app-model`: **TRUE**
- `remoteSuppressRef.value = true` pattern in `RemoteCommandDispatcher`: plausible concern; not verified against source (file not read)
- §13.2 timing precision: `allocMs=0.10ms` values are consistent with `Date.now()` 1ms granularity: **TRUE**

---

## 5. Completeness

### 5.1 What the Audit covers well

- **Symptom catalogue**: The Audit identifies real symptoms across the pipeline even if it misdiagnoses some causes.
- **undo/redo correctness**: §1.1, §1.4, §9.2, §12.1 together form a coherent set of concerns about partial-failure states during undo. These are real, even if the proposed fixes need adjustment.
- **Collaboration correctness**: §10.1, §10.2 are valid concerns not addressed elsewhere in the doc corpus.
- **Observability**: §13.1/13.2 are genuinely missing from the current instrumentation.

### 5.2 Critical gaps

**The two highest-value remaining problems are not in the Audit at all.**

**[Missing] INE-03/04: Projected geometry caching**
(`42-DEEP-PIPELINE-ANALYSIS.md` §2, INE-03 and INE-04)

`NativeElementMeshExporter.exportForView()` expands every `InstancedMesh` into N individual `THREE.Mesh` proxy objects — one per instance. For a single CW wall with a 3-level mullion/panel grid this produces ~98 proxies. For 294 walls: ~28,812 proxy objects created synchronously. Each proxy then receives a `new THREE.EdgesGeometry()` call (O(F log F) per mesh). For 28,812 proxy meshes at 0.1ms each: ~2,881ms of EdgesGeometry allocation — this is the dominant cost of Phase 6 (EdgeProjector), which at present takes ~3.4–3.7 seconds for a 294-wall batch. **Caching projected geometry per `(elementId, viewId, wallVersion)` — where `version` is already stamped on `group.userData.version` — would reduce Phase 6 from ~3.5s to near-zero for unchanged walls on subsequent view refreshes.**

The Audit has no mention of this problem.

**[Missing] INE-01: No panel geometry/material cache in CurtainWallInstanceManager**
(`42-DEEP-PIPELINE-ANALYSIS.md` §2, INE-01)

`CurtainWallInstanceManager.buildInstancedMeshes()` allocates `new THREE.BoxGeometry(1, 1, panelThickness)` and `new THREE.MeshStandardMaterial(...)` fresh on every `build()` call — 294 walls × 2 panel types = 588 fresh allocations. Unlike mullion geometry (`mullionGeometryCache` exists in `CurtainWallBuilder`), there is no panel cache. Estimated cost: ~141ms of unnecessary allocation per batch. Simple fix mirrors the existing mullion pattern.

**[Missing] The timing cost model**

The Audit has no phase-timing table. `42-DEEP-PIPELINE-ANALYSIS.md` provides one:

| Phase | Mechanism | Estimated calendar time |
|-------|-----------|------------------------|
| 0 · Prewarm | 3× rpm.render(0) | 90–150ms (once) |
| 1/1.5 · Batch setup + addMany | Synchronous | 20–40ms |
| 2 · Deferred resume | 1 rAF slot | ~17ms |
| 3 · rAF build drain | 13–15 frames | 210–960ms |
| 4 · Registration drain | Synchronous | 5–15ms |
| 5 · endBatchYielded | 2 chunks | ~33ms |
| **6 · EdgeProjector** | 17 groups × 3 layers × rAF | **3,400–3,700ms** |
| 7 · Shadow reactivation | T+30s one-shot | 1 frame |

Without this model, the Audit cannot prioritise its P0 items correctly. Phase 6 (EdgeProjector) is the dominant cost and the Audit barely mentions it (§7.1 calls it a subscriber problem, not a projection cost problem).

**[Missing] The real fix for CHUNK_SIZE**

`41-BATCH-ERROS.md` §Claim B documents that the EdgeProjector CW detection was fixed via a case-insensitive `elementType` discriminator on exported mesh group `userData`, setting `CHUNK_SIZE=1` for CW batches vs `CHUNK_SIZE=4` for wall/slab batches. The Audit proposes subscribing to a coalesced batch event as the fix for §7.1 — but the actual bottleneck is per-group traverse cost (250ms/group for CW), not the number of EPS invocations.

**[Missing] The actual state of the 168-wall fourth-pass fixes**

`41-BATCH-ERROS.md` §Fourth-Pass describes:
- `BN-01`: `addManyPaused()` fast batch path (1,220ms → ~5ms)
- `BN-02`: 3-pass prewarm for scale-variant PSO compile
- `BN-03`: `setTimeout(30000)` shadow scheduling (confirmed in `CurtainWallBuilder.ts` Modification Declaration)

All three are already in source. None are acknowledged in the Audit.

---

## 6. Section-by-Section Verdict Table

| Section | Finding | Accurate? | Fix valid? | Status |
|---------|---------|-----------|-----------|--------|
| §1.1 MacroCommand | Undo cursor concern | Partially true | Fix is valid direction | Open; `createdIdsBySlabId` mitigates but doesn't fully solve |
| §1.2 canExecute topology | Double traversal | Likely true | Fix is correct | Open |
| §1.3 No AbortSignal | Real gap | Fix adds complexity | Design decision needed | Open |
| §1.4 registerSemantic throws | **TRUE** | Fix is correct | **Open — priority** |
| §2.1 Silent error swallowing | Partially true | Async fix is **wrong** | Sync fix needed instead | Open |
| §2.2 Promise.all concurrency | **FALSE** — no Promise.all | Fix solves nonexistent problem | — |
| §2.3 Per-element events | Historically true; **already fixed** | `setSuppressMode` redundant | **Closed** — `beginBatch/endBatchYielded` |
| §2.4 No idempotency key | Real gap | Fix is correct | Open |
| §3.1 Batch outside frame loop | **FALSE** — `PERF-DEFER-RESUME-FLUSH` in place | Proposed fix would break architecture | **Closed** |
| §3.2 SlabFragmentBuilder racing | Partially true; mitigated by suppression | GeometryScheduler is valid direction | Low priority |
| §3.3 No frame-pressure signal | Real gap | Fix is correct | Open (low priority) |
| §4.1 40 topology rebuilds | **FALSE** — fast batch path skips listeners | Proposed debounce is redundant | **Closed** |
| §4.2 Topology cache per slab | Valid concern | Fix is correct | Open |
| §4.3 Observer holds strong store refs | Valid | Fix is correct | Low priority |
| §5.1 Full index rebuild | Partially valid (for future batches); mitigated by `skipRedetectRooms` | Incremental fix is correct long-term | Low priority |
| §5.2 No AABB cache | Valid | Fix is correct | Open |
| §5.3 Query result cache | Valid | Fix is correct | Low priority |
| §6.1 No TypedArray pool | Valid symptom; wrong abstraction level | Pool inside Three.js not possible | Alternative: projection cache (INE-03/04) |
| §6.2 Per-element geometry merge | Valid symptom; **fix breaks selection/export** | Fix is architecturally wrong | Alternative: projection cache |
| §6.3 traverseMs too high | **TRUE** | Off-thread fix hard; caching fixes it | Open (via INE-03/04) |
| §7.1 EPS runs 40 times | **FALSE** — EPS runs once post-batch | Proposed fix is correct pattern for different scenario | **Closed** — `setSuppressed(true)` |
| §7.2 toDrawingSpace alloc | Valid | Fix is correct | Open |
| §7.3 Layer name strings | Valid (minor) | Fix is correct | Open |
| §8.1 ViewDependencyTracker 40 invalidations | **FALSE** — suppressed during batch | Proposed fix redundant | **Closed** |
| §8.2 Phantom entries after unregister | **TRUE** | Fix is correct | **Open — priority** |
| §9.1 CommandManager batch mode | Redundant with StoreEventBus | Fix would create duplicate mechanism | **Closed** — bus already handles this |
| §9.2 Undo stack on partial failure | **TRUE** | Fix is correct | **Open** |
| §10.1 suppressBroadcastRef not threaded | Plausible | Fix direction is correct | Open |
| §10.2 replayCatchUp ordering | **TRUE** | Fix is correct | **Open** |
| §11.1 setSuppressMode missing | **FALSE** — `beginBatch/endBatch` exists | Fix is redundant | **Closed** |
| §11.2 registerAllStores log | True (minor) | Fix is correct | Low priority |
| §12.1 clear() vs unregisterIfPresent | **TRUE** | Fix is correct | **Open — priority** |
| §12.2 Strong refs in ElementRegistry | **TRUE** | Fix is correct | Open |
| §13.1 No batchId in logs | **TRUE** | Fix is correct | **Open** |
| §13.2 Date.now() precision | **TRUE** | Fix is correct | Open |

---

## 7. Recommended Corrections to the Audit

If the Audit is to be used as a work plan, the following corrections are required before any implementation begins:

### Remove entirely (solved or wrong)
- **§2.2** (Promise.all concurrency): Remove. The architecture is synchronous. No fix needed.
- **§2.3** (setSuppressMode): Remove. `beginBatch()/endBatchYielded()` already exists and works.
- **§3.1** (Batch into frame loop): Remove. The proposed fix would break the depth-counting invariant. The actual fix (`PERF-DEFER-RESUME-FLUSH`) is already in place.
- **§4.1** (40 topology rebuilds): Remove. Fast batch path prevents all per-item listener calls.
- **§7.1** (EPS runs 40 times): Remove. `viewDependencyTracker.setSuppressed(true)` prevents this.
- **§8.1** (ViewDependencyTracker 40 invalidations): Remove. Same fix as §7.1.
- **§9.1** (CommandManager batch mode): Remove. Already handled by `StoreEventBus.beginBatch()`.
- **§11.1** (setSuppressMode missing): Remove. `beginBatch/endBatch` exists and is documented.
- **§6.2** (Post-batch geometry merge): Remove. Breaks per-element selection, picking, and DXF export.

### Revise significantly
- **§2.1**: Change from async `BatchResult<T>` proposal to synchronous error propagation from `_processSlabs()`. Keep the partial-failure UX goal.
- **§6.1**: Change target from application-level `Float32Pool` to the projection geometry cache (INE-03/04). TypedArray pool at application level cannot intercept Three.js internal allocations.
- **§P0 Priority Table**: Remove §2.3 and §5.1 as P0. Re-rank INE-03/04 (projection geometry caching) as the new P0 — it eliminates ~3.5s of Phase 6 cost.

### Add (highest-value missing items)
- **INE-01**: Panel geometry/material cache in `CurtainWallInstanceManager` (Easy, ~141ms saving)
- **INE-03/04**: Projected geometry cache per `(elementId, viewId, wallVersion)` (Hard, eliminates ~3.5s Phase 6 cost on subsequent projections)
- **INE-09**: Reuse `_mullionDummy` `Object3D` as class field (Trivial)
- **INE-10**: Cache `computeCurtainCells` result (Medium, ~59ms saving)
- **INE-13**: Warn on missing `addManyPaused` (Easy, correctness)

---

## 8. What Remains Open (Validated Work Items)

These are findings the Audit identified that are not yet fixed and are correctly described:

| Priority | Item | Source | Effort |
|----------|------|--------|--------|
| High | `unregisterIfPresent` + `registerSemanticOrReplace` in `ElementRegistry` | §1.4, §12.1 | Easy |
| High | Prune `ViewDependencyTracker` on element unregister | §8.2 | Easy |
| High | Undo stack not pushed on partial batch failure (§9.2) | §9.2 | Medium |
| High | Projected geometry cache per `(elementId, viewId, version)` | INE-03/04 (not in Audit) | Hard |
| Medium | Panel geometry/material cache in `CurtainWallInstanceManager` | INE-01 (not in Audit) | Easy |
| Medium | `replayCatchUp` `seqNo` ordering | §10.2 | Medium |
| Medium | `canExecute()` topology double-traversal | §1.2 | Easy |
| Medium | `toDrawingSpace` output buffer reuse | §7.2 | Easy |
| Medium | `computeCurtainCells` cache | INE-10 (not in Audit) | Medium |
| Low | `batchId` threading in diagnostic logs | §13.1 | Easy |
| Low | `performance.now()` for timing | §13.2 | Easy |
| Low | Reuse `_mullionDummy` as class field | INE-09 (not in Audit) | Trivial |
| Low | `idempotencyKey` in `BatchCoordinator` | §2.4 | Medium |
| Low | `framePressure` signal from `UnifiedFrameLoop` | §3.3 | Easy |
| Low | `WeakRef` in `ElementRegistry.idToRootMap` | §12.2 | Medium |

---

*Review produced: 2026-05-07 — PURE ANALYSIS — no code changes made.*
*Evidence base: Audit (729 lines), all cited documents, source of all 9 primary files.*
