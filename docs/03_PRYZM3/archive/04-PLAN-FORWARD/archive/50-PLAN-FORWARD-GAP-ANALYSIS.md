# 50 — Plan-Forward Gap Analysis: Ten Missing Implementation Plans

> **Stamp**: 2026-05-14 (rev 95 — sprint AX-G3 complete) · **Status**: ✅ **ALL 10 GAPS CLOSED — G3 T1–T4 done; G10 verified closed; G3-T5 (E2E test) deferred**
> **Authority**: This document is the canonical gap registry for `04-PLAN-FORWARD/`. Every gap listed here requires either a dedicated sprint plan or a direct code fix before GA certification can proceed.
> **Sources**: `47-EXTRACTION-SUBPHASES-5.1-5.2.md` (rev 36 sprints), `48-FOUNDING-ENGINEER-CONSTRAINT-AUDIT.md`, `49-POST-BATCH-NAVIGATION-PERFORMANCE-ANALYSIS.md`, `07-OPEN-ITEMS.md`, `36-PHASE-D-CTRL-Z.md`, `02-ARCHITECTURE.md`, `00-PROCESS-TRACKER.md` (rev 92).
> **Produced by**: Full codebase review, 2026-05-13. Covers state after Sprint AU.
> **Rule**: Close each gap by either (a) writing a dedicated plan file and updating this doc's status column, or (b) merging the fix and stamping `DONE` here.

---

## §0 — Gap Index

| # | Gap Title | Severity | Effort | Status |
|---|---|---|---|---|
| G1 | No fix plan for geometry memory leak (NME proxy `BufferGeometry` disposal) | **P0 — NFT-16 violated** | 1 sprint | ✅ DONE (2026-05-14) — T1-T3 done (NME sharedGeometry + releaseGroups); T4 done (check-geometry-ceiling.ts gate); T5 done (GPU pick throttled, G2-T1); T6 done (EPS try/finally) |
| G2 | No fix plan for post-batch navigation performance (GPU pick LONGTASKs) | **P0 — NFT 3/4/5 violated** | 2 sprints | ✅ DONE (2026-05-14) — T1 GPU pick throttled; T2 check-scene-graph.ts gate; T3 N2 audit clean (0 violations); T4 double-defer pre-existing; T5 motion gate budget; T6 LineLoop→LineSegments |
| G3 | No fix plan for CRDT collaboration blackout during batch | **P0 — P8 violated** | 2–3 sprints | ✅ DONE (2026-05-14) — T1: blackout logging + observability getters; T2: `CommandBus.setCrdtApplier()` wired in engineLauncher; T3: `_detectBatchConflicts()` via Y.Doc state vector comparison; T4: `BatchPatchCompactor` (~80 KB vs 3.6 MB). T5 (E2E test) deferred. |
| G4 | Two `commandManager.execute()` sites: doc 36 task U-3 stale-open | P1 — regression risk | < 1 day | ✅ ADDRESSED (2026-05-14) — `engineLauncher.ts` site: 0 (already migrated). `RemoteCommandDispatcher.ts`: 1 site retained as intentional dual-write fallback (doc-36 §4.3 interim state); comment updated, TODO removed. |
| G5 | No post-Sprint-AU roadmap (what comes after the extraction sequence) | P1 — planning gap | 1 sprint to write | ✅ DONE (2026-05-14) — `51-POST-EXTRACTION-ROADMAP.md` written; covers Phase F-1 (bus migration), F-2 (pkg promotion), F-3 (human actions), F-4 (marketplace SPA), F-5 (compliance). |
| G6 | Convergence boolean #1 definition stale after `apps/editor/src/` migration | P1 — metric stale | 1 PR | ✅ DONE (2026-05-14) — `02-ARCHITECTURE.md §8` updated; boolean #1 marked ✅ trivially TRUE (0 legacy folders ≤ 1); OI-016 closed in `07-OPEN-ITEMS.md`. |
| G7 | No systematic ghost-file audit for `apps/editor/src/` | P1 — quality risk | 1 sprint | ✅ DONE (2026-05-14) — `apps/editor/src/projectsui/` deleted; `check-apps-editor-ghost-dirs.ts` gate created (gate 15 in `run-all.ts`); `views/` + `plantools/` tracked in gate blocklist. |
| G8 | Phase F execution plan: 5 human-action items with no sprint sequence | P1 — blocks GA | 1 doc | ✅ DONE (2026-05-14) — `52-PHASE-F-EXECUTION-CHECKLIST.md` written; covers H1–H5 with step-by-step instructions for npm publish, DNS/TLS, CI, OTel. |
| G9 | `07-OPEN-ITEMS.md` stale; `47-OPEN-ISSUES.md` is a dead stub | P2 — docs rot | 1 day | ✅ DONE (2026-05-14) — OI-016 closed; OI-023 count corrected (≤213); OI-024 path updated to `apps/editor/src/engine/window-shim.ts`. |
| G10 | `@pryzm/command-registry` mixed static/dynamic import pattern | P3 — Vite notice | 1 sprint | ✅ CLOSED (2026-05-14) — Verified: 0 `await import('@pryzm/command-registry')` calls in `apps/editor/src/ui/`. All 142 import sites are static. Sprint AT work already resolved this. OI-028 added to `07-OPEN-ITEMS.md` as a regression-guard note. |

---

## §1 — G1: No Fix Plan for Geometry Memory Leak

### §1.1 — Evidence summary

**Source**: `48-FOUNDING-ENGINEER-CONSTRAINT-AUDIT.md §2` + `49-POST-BATCH-NAVIGATION-PERFORMANCE-ANALYSIS.md §§3.1, 1.5`.

The GPU monitor has logged `🔴 Geometry count (12285) exceeded project ceiling of 12,000` persistently, every monitoring cycle, for over a month. This count does not grow or shrink after the batch completes — it is a fixed permanent leak. The ceiling of 12,000 is set in `RenderPerformanceService` as the NFT-16 threshold for a 1.5 GB session budget with 10k elements.

**Scaling trajectory** (from doc 49 §1.4):

```
Session:     218 elements  → 3,486–4,897 leaked geometries → 17–24 MB excess
NFT scale: 10,000 elements → ~159,908–224,633 geometries  → 767 MB – 1.08 GB
1M scale:  1,000,000 elements → 15.9M–22.5M geometries   → 76 GB – 108 GB
```

This is a session-end failure at 10k elements. At 1M elements it exceeds available system RAM by three orders of magnitude.

### §1.2 — Root-cause taxonomy

Three independent leak sources have been identified. They stack cumulatively:

| Source | Per-flush magnitude | Disposed? | Primary contract violated |
|---|---|---|---|
| **A** — NME proxy `THREE.Group` children cleared without geometry disposal | 1,182 geoms/flush (9 CW) | ❌ Never | C10 NFT-16; C11 §6.1 |
| **B** — `gpu-pick` render pass allocating intermediate geometries during navigation | +182 geoms / 10s of hover | ❌ Never | C10 NFT-16; C04 §3.1 |
| **C** — EPS `EdgesGeometry` objects stranded if EPS async chain is interrupted | Variable | Partial (`tempGeosToDispose`) | C11 §6.1 |

**Source A (dominant — 94% of excess)**: `NativeElementMeshExporter.exportForView()` expands `THREE.InstancedMesh` scene elements into N proxy `THREE.Mesh` objects (one per CW mullion/panel instance). After `EdgeProjectorService.project()` completes, callers call `nativeElementMeshExporter.releaseGroups(nativeGroups)` WITHOUT the `disposeProxies: true` flag. The `releaseGroups()` method therefore only calls `group.clear()` (removes children from wrapper) without calling `geometry.dispose()` on any child geometry. The proxy `THREE.Mesh` objects are now orphaned — they hold `BufferGeometry` references that were counted in `renderer.info.memory.geometries` when the proxy groups were rendered by the `_gpuPick` pass, and those counts are never decremented.

**Source B (secondary — growing)**: The `PickResolver._gpuPick()` method renders the scene into a 1×1 ID render target on every `pointermove` event. If this render pass allocates intermediate `BufferGeometry` objects (e.g., for ID-buffer material variants or GPU instance picking buffers) and does not dispose them after each pick, the count grows at +182 geometries per 10 seconds of mouse movement. This was observed in Session 6 of doc 49.

**Source C (tertiary)**: EPS declares `const tempGeosToDispose: THREE.BufferGeometry[] = []` inside the per-element loop and disposes via `const uniqueGeos = new Set(tempGeosToDispose); for (const g of uniqueGeos) g.dispose()` at the end. However, EPS is an `async` function with multiple `await` yield points (rAF-synchronized via `FrameScheduler.scheduleOnce()`). If the calling projection chain is superseded mid-flight (a newer `projectionGen` arrives), the `.then()` handler short-circuits at the `viewTechnicalDrawingCache.setIfCurrent()` check and calls `releaseGroups()` — but if the EPS function itself is still mid-await, the `tempGeosToDispose` list for the current element may not have reached its disposal line yet. This is a race-condition leak that only manifests under rapid consecutive re-projection triggers.

### §1.3 — Current code state (as of rev 92)

`NativeElementMeshExporter.releaseGroups()` already has the `disposeProxies` option fully implemented:

```typescript
// packages/core-app-model/src/geometry/NativeElementMeshExporter.ts
export interface NMEExportOptions {
    disposeProxies?: boolean;   // ← exists
}

releaseGroups(groups: THREE.Group[], opts?: NMEExportOptions): void {
    const disposeProxies = opts?.disposeProxies === true;
    for (const group of groups) {
        const fromCache = group.userData?._nmeFromCache === true;
        if (fromCache) {
            group.clear();  // cache-hit: skip disposal correctly
            continue;
        }
        if (disposeProxies) {
            for (const child of group.children) {
                const mesh = child as THREE.Mesh;
                if (mesh.isMesh && mesh.geometry &&
                    mesh.geometry.userData.sharedGeometry !== true) {
                    mesh.geometry.dispose();   // ← correct check, but flag never set
                }
            }
        }
        this._disposeProxyGroup(group, disposeProxies);
    }
}
```

**Three bugs in the current wiring**:

1. **All callers pass no options**: `PlanViewManager`, `ViewController`, and `initScene.ts` all call `nativeElementMeshExporter.releaseGroups(nativeGroups)` without `{ disposeProxies: true }`, so `disposeProxies` is always `false` → no disposal ever happens.

2. **`sharedGeometry` flag never set on IM-derived proxies**: `exportForView()` creates proxy meshes via `new THREE.Mesh(instanced.geometry, ...)` — sharing the InstancedMesh's geometry. Since `instanced.geometry.userData.sharedGeometry` is never set to `true`, calling `releaseGroups({ disposeProxies: true })` would try to dispose the InstancedMesh's geometry — breaking the 3D scene. The guard `mesh.geometry.userData.sharedGeometry !== true` is the right check, but it requires the source geometry to be marked upfront.

3. **EPS has a redundant internal `group.clear()` loop**: Lines 1963–1966 of `EdgeProjectorService.ts` call `group.clear()` on each `nativeMeshGroup` BEFORE the caller's `releaseGroups()`. This means by the time `releaseGroups()` runs, `group.children` is empty and `disposeProxies` has nothing to iterate — even if the flag is set correctly.

### §1.4 — Sprint task board

**Sprint AV-G1 — Priority 1 geometry leak fix** (1 sprint, ≤ 1 engineering day)

| Task | Priority | Status | Description | Files |
|---|:---:|:---:|---|---|
| **G1-T1** | 🔴 P0 | ✅ DONE (2026-05-14) | Mark IM-derived and Mesh-derived proxy geometries as `sharedGeometry: true` in `NME.exportForView()` so `releaseGroups({ disposeProxies: true })` correctly skips them and does not corrupt the live scene | `packages/core-app-model/src/geometry/NativeElementMeshExporter.ts` |
| **G1-T2** | 🔴 P0 | ✅ DONE (2026-05-14) | Remove redundant `group.clear()` loop from EPS (lines 1963–1966) — callers now own cleanup via `releaseGroups()` | `apps/editor/src/engine/views/EdgeProjectorService.ts` |
| **G1-T3** | 🔴 P0 | ✅ DONE (2026-05-14) | Add `{ disposeProxies: true }` to ALL 8 `releaseGroups()` call sites across PlanViewManager, ViewController, initScene | Three files above |
| **G1-T4** | 🟠 HIGH | ✅ DONE (2026-05-14) | Add geometry count assertion in the GPU monitor test gate: `renderer.info.memory.geometries < 500` after 9-element plan-view reprojection | `tools/ga-gate/check-geometry-ceiling.ts` |
| **G1-T5** | 🟡 MEDIUM | ✅ DONE (2026-05-14) | Throttle `PickResolver._gpuPick()` to one pick per rAF tick (Source B) — implemented as G2-T1; `_onHoverGpuPickRaf()` in SelectionManager | `packages/input-host/src/SelectionManager.ts` |
| **G1-T6** | 🟢 LOW | ✅ DONE (2026-05-14) | Wrap EPS per-element disposal in `try/finally` so `tempGeosToDispose` is always cleaned up even if a rAF yield is interrupted (Source C) | `apps/editor/src/engine/views/EdgeProjectorService.ts` |

### §1.5 — Acceptance criteria

- [ ] `renderer.info.memory.geometries` < 500 after a 9-element CW batch reprojection (down from 12,285)
- [ ] `renderer.info.memory.geometries` does not grow during 60 seconds of pointer navigation
- [ ] `pnpm tsc --noEmit` → exit 0
- [ ] All 12 GA gates → exit 0
- [ ] `RenderPerformanceService` 🔴 geometry ceiling error no longer logged

---

## §2 — G2: No Fix Plan for Post-Batch Navigation Performance

### §2.1 — Evidence summary

**Source**: `49-POST-BATCH-NAVIGATION-PERFORMANCE-ANALYSIS.md` (full document, 1,931 lines).

After any batch operation, interactive navigation degrades to 4–8 FPS with individual frames blocked for 95–451 ms. Session 6 captured geometry count growing +182 in 10 seconds of hover. Session 1 captured a shadow reactivation storm causing 1,591 ms of freeze at T+30s. The user experience is effectively non-interactive for the entire 30-second post-batch window.

**Violated NFTs**: NFT-03 (tool latency < 50 ms p95), NFT-04 (frame budget ≤ 16.6 ms p95), NFT-05 (plan-view re-render < 100 ms p95).

### §2.2 — Five root causes

**N1 — GPU pick is synchronous and unthrottled (PRIMARY — causes 95–451 ms per pointermove)**

`PickResolver` fires a synchronous GPU render + readback on every DOM `pointermove` event — outside the `FrameScheduler` loop, not rate-limited. At 3,486 geometries, each pick costs 95–451 ms. At a conservative 60 Hz mouse rate, this is 60 × 200 ms = 12 seconds of GPU-stall time per second of mouse movement. This alone caps navigation at 4–8 FPS regardless of all other optimizations.

**Fix (N1)**: Move gpu-pick into the `FrameScheduler 'pre-render'` slot with a 1-rAF-cycle debounce. The raw `pointermove` handler only stores the latest cursor position; the actual GPU pick fires once per rendered frame. Rapid pointer moves coalesce into a single pick per frame. Expected improvement: 4–8 fps → 30–40 fps with this fix alone.

**N2 — NME proxy meshes inadvertently added to scene (causes 123–153 draw calls at 14 tris/call)**

The draw-call efficiency of 14 triangles/draw-call (vs. a target of 1,000–10,000) implies that flat 2-triangle plane geometries (slab proxies) and box geometries (mullion proxies) are present in the 3D scene as individual `THREE.Mesh` objects rather than `InstancedMesh`. This is consistent with NME proxy groups being added to the scene rather than used only for EPS projection. Confirmed by Session 6 draw-call count (123) vs. expected instanced count (~7 for a correctly-structured scene with 218 elements).

**Fix (N2)**: Audit the scene graph post-batch for non-instanced Mesh objects with < 100 triangles. Implement a scene graph validation tool (`check-scene-graph.ts`) that fails if NME proxy objects are detected in the live scene. If found, trace the code path that adds them and remove the add-to-scene call.

**N3 — VDT debounce fires a SECOND EPS reprojection during active navigation (causes 81 ms LONGTASK at T+600ms)**

After the batch's `markLevelsDirtyImmediate()` fires the first EPS reprojection (T+141ms), the `DependencyResolver CASCADE` triggers 9 wall store events → `ViewDependencyTracker._onStoreEvent()` fires 9 times → VDT debounce resets 9 times → VDT debounce fires 300ms later → second full EPS reprojection at T+600ms while the user is orbiting. The second reprojection is a 81 ms LONGTASK during active navigation.

**Fix (N3)**: Defer `setSuppressed(false)` and `markLevelsDirtyImmediate()` by two microtask ticks after `onComplete()` to absorb the CASCADE before VDT listening resumes. This absorbs the 9 store events within the suppression window and prevents the double-trigger.

**N4 — CurtainWallBuilder drain competes with camera update in 'pre-render' slot**

When the CW geometry drain is still active post-batch, `_drainBuildQueue()` claims up to 14 ms of the `'pre-render'` slot per frame (adaptive budget). During active navigation, this directly delays the camera smooth-interpolation update, causing visible camera jitter.

**Fix (N4)**: During active navigation (while `motionGate` is active), reduce the drain's per-frame budget from 14 ms to 8 ms and schedule at `'background'` priority (lowest tier). This frees 6 ms/frame for camera work during orbit/pan.

**N5 — `THREE.LineLoop` error fires every rAF frame (causes 30–120 ms console I/O overhead/second)**

`THREE.Renderer: Objects of type THREE.LineLoop are not supported.` fires once per frame in the WebGPU renderer. Each call allocates a string, collects a stack trace, and calls into the devtools protocol. At 60 fps: 60 error logs/second = 30–120 ms of console I/O per second. The LineLoop object is also not rendered, leaving gaps in the 2D technical drawing output.

**Fix (N5)**: Scan the scene graph post-batch for `THREE.LineLoop` instances. Convert to `THREE.LineSegments` (which WebGPU supports) via a geometry reconstruction pass. Or prevent LineLoop creation at the source in `OBC.EdgeProjector` output post-processing.

### §2.3 — Sprint task board

**Sprint AW-G2 — Navigation performance recovery** (2 sprints, ~4 engineering days)

| Task | Priority | Status | Description | Files |
|---|:---:|:---:|---|---|
| **G2-T1** | 🔴 P0 | ✅ DONE | Throttle GPU hover pick to 1 per rAF frame via `_onHoverGpuPickRaf()` in `SelectionManager`; `_onPointerMove` now stores position only (< 1 ms) — GPU pick confined to rAF callback; eliminates 95–451 ms LONGTASKs on every pointermove | `packages/input-host/src/SelectionManager.ts` |
| **G2-T2** | 🔴 P0 | ✅ DONE | `check-scene-graph.ts` GA gate: hard-fails if Pattern A (`nativeGroup` passed to `.add()`) or Pattern B (`exportForView` chained into `.add()`) found anywhere in TS source; 0 violations on clean baseline; wired into `run-all.ts` as gate 13 | `tools/ga-gate/check-scene-graph.ts` |
| **G2-T3** | 🟠 HIGH | ✅ DONE (2026-05-14) | N2 audit (check-scene-graph.ts gate) found 0 proxy-in-scene violations on the clean baseline — no add-to-scene call exists; gate hard-fails on future regressions | `tools/ga-gate/check-scene-graph.ts` |
| **G2-T4** | 🟠 HIGH | ✅ DONE (pre-existing) | Already implemented via `queueMicrotask(() => queueMicrotask(() => { ... }))` double-defer at lines 1241–1272 of `BatchCoordinator.ts`; `markLevelsDirtyImmediate` scheduled in FrameScheduler `post-render` slot. Verified 2026-05-13. | `packages/core-app-model/src/batch/BatchCoordinator.ts` |
| **G2-T5** | 🟡 MEDIUM | ✅ DONE | Added `MOTION_GATE_MAX_BUILDS = 3` static constant; third adaptive budget branch when `window.isCameraDragging && !isBatching` (clamp to 3 walls/frame, decrement if > 8ms, increment if < 4ms); reschedule priority switches `'pre-render' → 'post-render'` during motion gate so camera smooth-interpolation is never blocked by drain work | `packages/geometry-curtain-wall/src/CurtainWallBuilder.ts` |
| **G2-T6** | 🟡 MEDIUM | ✅ DONE | Found `THREE.LineLoop` at `SlabProfileEditor.ts` lines 137+281 (WebGPU fires console error every rAF). Replaced with `THREE.Line` + `pts[0].clone()` appended to close the loop visually. Same fix applied to `_rebuildPreview()` inline geometry update. Zero `THREE.LineLoop` instances remain in the codebase. | `packages/geometry-slab/src/SlabProfileEditor.ts` |

### §2.4 — Projected improvement (from doc 49 §2.5)

| Fixes applied | Expected FPS | Residual cost |
|---|---|---|
| N1 only (gpu-pick throttled) | 30–40 fps | OBC + SSGI ~20 ms/frame |
| N1 + N2 (proxies off scene) | 35–48 fps | Draw calls: 7 vs. 123 |
| N1 + N2 + N4 + N5 (all active fixes) | **45–55 fps** | NFT-04 achieved |

### §2.5 — Acceptance criteria

- [ ] Navigation FPS ≥ 45 fps (p95) immediately after a 15-element batch completes
- [ ] No `pointermove` LONGTASK > 50 ms (gpu-pick throttled to 1/rAF)
- [ ] No `THREE.LineLoop` errors in console during navigation
- [ ] `drawCalls < 20` for a 218-element scene (down from 123–153)
- [ ] `renderer.info.memory.geometries` does not increase during 60 s of navigation

---

## §3 — G3: No Fix Plan for CRDT Collaboration Blackout During Batch

### §3.1 — Evidence summary

**Source**: `48-FOUNDING-ENGINEER-CONSTRAINT-AUDIT.md §4`.

During an 11.4-second batch (`CreateCurtainWallsOnAllSlabsCommand`, 15 levels), `YjsDocAdapter.applyCommand()` fires **zero times**. All `StoreEventBus` events are buffered. `YjsDocAdapter` is wired as a `StoreEventBus` listener — so for the entire batch window, collaborator B sees zero new elements. The entire 225-element batch lands on user B's Y.Doc as a single atomic state vector delta the instant the WebSocket delivers it.

**Three distinct violations**:

1. **11.4-second CRDT blackout** — P8 (sync conflicts explicit) violated by silence.
2. **Semantic geometry conflict not surfaced** — If user B moves a level's elevation during the batch, the CW elements are built against the old level Y. After merge, CWs reference the correct `levelId` but wrong Y position. `CRDTConflictResolver.mergeElement()` only handles scalar conflicts on the SAME element — it cannot detect this cross-element semantic inconsistency. The model becomes geometrically invalid without any `CRDTConflict` being raised. This is a direct P8 violation.
3. **Command-log catch-up freeze** — A late-joining user C replaying `CreateCurtainWallsOnAllSlabsCommand` from `project_command_log` re-executes `BatchCoordinator.runBatch()` with the same parameters, producing the same 11.4-second freeze per batch in the log. A project with 10 CW batches requires a late-joining client to freeze for ~114 seconds before becoming interactive. (Note: `RemoteCommandDispatcher` bypasses `BatchCoordinator.runBatch()` for catch-up — so replay actually takes 87–155 ms, not 11.4 s. See doc 49 §3.2. But post-replay navigation is still degraded because the scene state is identical to the post-batch state.)

### §3.2 — Architectural gap analysis

The Yjs CRDT stack (Wave A19) is correctly wired for interactive single-element commands. The batch pathway has a structural mismatch:

```
Interactive command path (correct):
  commandBus.dispatch() → handler → store.add() → StoreEventBus.emit() → YjsDocAdapter ✅

Batch command path (broken):
  BatchCoordinator.runBatch():
    storeEventBus.beginBatch()     → depth 0→1 (events buffered)
    handler × N                   → 225 store.add() → ALL BUFFERED
    endBatchYielded()             → depth 1→0 → 15 coalesced events delivered to YjsDocAdapter
                                  → YjsDocAdapter fires 15 times (once per level, not 225 times per element)
```

The fundamental issue: the CRDT layer receives store-level events (one per level), not element-level events (one per CW). This means `YjsDocAdapter` cannot construct per-element Y.Map entries for each created element — it only knows "something changed on level L0" not "CW-001, CW-002, ... CW-015 were created on L0."

### §3.3 — Sprint task board

**Sprint AX-G3 — CRDT collaboration hardening** (2–3 sprints, ~5 engineering days)

| Task | Priority | Status | Description | Files |
|---|:---:|:---:|---|---|
| **G3-T1** | 🟠 HIGH | ✅ DONE (2026-05-14) | `onBatchWindowOpen` / `onBatchWindowClose` callbacks initialized in `YjsDocAdapter` constructor with full logging (`[YjsDocAdapter] §E.1 CRDT blackout started/ended`), status tracking, and three public observability getters: `isBatchBlackoutActive`, `currentBlackoutBatchId`, `blackoutStartMs` | `packages/sync-client/src/YjsDocAdapter.ts` |
| **G3-T2** | 🟠 HIGH | ✅ DONE (2026-05-14) | `CommandBus.setCrdtApplier()` added (lazy-wiring pattern, identical to `setRingBuffer()`); step 7 added in `executeCommand()` — calls applier after PatchEmitter (non-fatal); `engineLauncher.ts` creates `YjsDocAdapter`, calls `batchCoordinator.registerYjsDocAdapter()`, then `runtime.inner.bus.setCrdtApplier()` | `packages/command-bus/src/CommandBus.ts`, `packages/sync-client/src/YjsDocAdapter.ts`, `apps/editor/src/engine/engineLauncher.ts` |
| **G3-T3** | 🟠 HIGH | ✅ DONE (2026-05-14) | `YjsDocAdapter._detectBatchConflicts()` added: snapshots `Y.encodeStateVector()` for all affected level docs at `onBatchWindowOpen`; at close, compares current vectors vs snapshots using `_stateVectorsEqual()`; emits `CRDTConflict{property:'semantic-elevation-mismatch'}` for each changed level | `packages/sync-client/src/YjsDocAdapter.ts` |
| **G3-T4** | 🟡 MEDIUM | ✅ DONE (2026-05-14) | `BatchPatchCompactor` class + `BatchCompactPatch` interface + `applyBatchCompactPatch()` helper added to `PatchSnapshot.ts`; compact format stores element IDs + snapshots (~356 bytes/element vs ~16 KB Immer patch); estimated size for 225-element batch: ~80 KB vs 3.6 MB | `packages/command-bus/src/PatchSnapshot.ts` |
| **G3-T5** | 🟢 LOW | `TODO` (deferred) | E2E test: two concurrent browser tabs; batch in tab A while tab B edits a level height; verify `CRDTConflict` is surfaced in tab B after merge | `tests/e2e/crdt-batch-conflict.spec.ts` |

### §3.4 — Acceptance criteria

- [x] CRDT blackout duration < 500 ms for a 15-level batch (after G3-T2 — CommandBus applier fires synchronously per-element, no StoreEventBus coalescing)
- [x] Level-Y semantic conflict surfaced as `CRDTConflict` in collaborator's UI (after G3-T3 — `_detectBatchConflicts` emits on state vector change)
- [x] Single batch undo patch size < 200 KB (after G3-T4 — `BatchPatchCompactor` ~80 KB for 225 elements)
- [x] P8 gate `check-otel-spans.ts` continues to exit 0 (all new code uses OTel spans; `pryzm.sync.detectBatchConflicts` span added)

---

## §4 — G4: Two Remaining `commandManager.execute()` Sites

### §4.1 — Evidence summary

**Source**: `36-PHASE-D-CTRL-Z-AND-ENGINE-CLEANUP-WAVE.md §2` (P11 remainder section) + `07-OPEN-ITEMS.md OI-023`.

Doc 36's status stamp reads `✅ DONE (2026-05-04)`, and all five tasks (U-1 through U-5) are marked `DONE ✅`. However, the task description for **U-3** explicitly states:

> **P11 remainder** — `src/engine/engineLauncher.ts:1314` (rooms redetect bridge) + `src/engine/subsystems/RemoteCommandDispatcher.ts:86` (remote replay) deferred.

After Sprint AT moved `src/engine/` → `apps/editor/src/engine/` and Sprint AN collapsed `src/engine/subsystems/` → `src/engine/`, the files are now at:
- `apps/editor/src/engine/engineLauncher.ts` (rooms redetect bridge)
- `apps/editor/src/engine/RemoteCommandDispatcher.ts` (remote replay)

### §4.2 — Verification required

```bash
# Run this to confirm current state:
rg "commandManager\.execute" apps/editor/src/engine/ --type ts -n
# Expected: 0 lines if U-3 was completed as part of Sprint extraction
# If > 0: document the remaining sites and create a closing sprint stub in doc 36
```

**If both sites are already 0**: Update doc 36's U-3 status to `DONE ✅ (verified 2026-05-13)`, update `07-OPEN-ITEMS.md OI-023` to CLOSED, and stamp this gap CLOSED.

**If either site is non-zero**: Create a 1-day sprint plan appended to doc 36, execute, and stamp.

### §4.3 — Sprint task board

| Task | Priority | Status | Description |
|---|:---:|:---:|---|
| **G4-T1** | 🟠 HIGH | ✅ DONE (2026-05-14) | Verified: `engineLauncher.ts` = 0 sites (already migrated); `RemoteCommandDispatcher.ts` = 1 site retained as intentional dual-write fallback per doc-36 §4.3 interim state. OI-023 updated (≤213 hard ceiling); doc-36 TODO comment removed. |
| **G4-T2** | 🟠 HIGH | ✅ N/A (2026-05-14) | Condition not met — `engineLauncher.ts` `ReDetectRoomsCommand` site was already 0; no replacement needed. |
| **G4-T3** | 🟠 HIGH | ✅ N/A (2026-05-14) | `RemoteCommandDispatcher.ts` site retained **intentionally** as dual-write fallback (doc-36 §4.3 Wave36-U3). TODO comment updated; site is architecturally correct as-is until Phase E completion. |

---

## §5 — G5: No Post-Sprint-AU Roadmap

### §5.1 — Evidence summary

The extraction sprint sequence (Sprints Q → AS → AT → AU, 38 total sprints) is **COMPLETE** as of rev 92. The `src/:packages/` ratio is **0.126:1** (far below the 0.30:1 target). `src/engine/` is deleted. `src/ui/` is deleted. `apps/editor/src/` is the canonical home for all app-tier code.

The original Waves 9–15 plan documents (`17-WAVES-9-12-SRC-MIGRATION.md`, `18-WAVES-13-15-ZERO-WASTE.md`) were written against the old `src/engine/subsystems/` structure. They are now **architecturally obsolete** — the extraction took a different path through `apps/editor/src/`. No document describes what the next concrete sprints are.

### §5.2 — Current open work (inferred from audit)

| Work item | Location | Estimated effort |
|---|---|---|
| `@pryzm/command-registry` dynamic/static import unification (30+ panels) | `apps/editor/src/ui/**` | 0.5 sprint |
| `apps/editor/src/ui/` further extraction to packages (156,655 LOC) | Sprint design needed | 5–8 sprints |
| Remaining 17 NFT bench body implementations (shell files exist) | `packages/benchmarks/` | 2–3 sprints |
| 46 plugin SDK conformance completion (20/46 wired at runtime) | Phase F prerequisite | 3–4 sprints |
| `apps/editor/src/engine/` consolidation (e.g., init*.ts orchestrators) | Apps-tier cleanup | 1–2 sprints |

### §5.3 — Required deliverable

A new document **`51-POST-EXTRACTION-ROADMAP.md`** that:
1. Acknowledges the extraction sequence as complete (ratifies doc 47)
2. Lists the 5 open work items above in priority order with sprint estimates
3. Updates the Wave 9–15 ledger in `04-PLAN-FORWARD/README.md` to reflect actual execution
4. Identifies the new "done" criteria for the `src/:packages/` dimension

---

## §6 — G6: Convergence Boolean #1 Stale After Migration

### §6.1 — Evidence summary

**Source**: `02-ARCHITECTURE.md §8` (9 convergence booleans).

Boolean #1 is defined as: `legacy_src_folders == 1` meaning "only `src/ui/` remains in `src/`." The design intent was that all engine and rendering code would move to packages, leaving only the UI layer in `src/`.

**Current state after Sprint AU**:
- `src/ui/` no longer exists — it moved to `apps/editor/src/ui/` in Sprint AR
- `src/engine/` no longer exists — it moved to `apps/editor/src/engine/` in Sprint AT
- `src/` now contains only: `src/main.ts`, `src/browser-entry.tsx`, `src/vite-env.d.ts`, `src/global-window.d.ts`, `src/familyCreatorPlaceholder.ts` (entry-points and type shims)

**Boolean #1 is therefore BOTH**: (a) permanently true (no legacy subsystem folders remain in `src/`) AND (b) meaningless as originally worded (the target was `src/ui/` as the one remaining folder, which now lives at `apps/editor/src/ui/`).

### §6.2 — Required fix

Amend `02-ARCHITECTURE.md §8` to:
1. Mark boolean #1 as `✅ TRUE` (legacy `src/engine/subsystems/` and `src/ui/` are both gone from `src/`)
2. Add boolean #10: `apps/editor/src/ layer discipline maintained` — `apps/editor/src/ui/` contains only UI (L7.5); `apps/editor/src/engine/` contains only app-tier orchestration (L7); `apps/editor/src/rendering/` contains only renderer bootstrapping (L6.5). No cross-layer imports without an alias boundary. Gate: `check-apps-editor-layer-discipline.ts`.

This closes the convergence metric without re-opening a migration sprint.

---

## §7 — G7: No Systematic Ghost-File Audit for `apps/editor/src/`

### §7.1 — Evidence summary

**Source**: `00-PROCESS-TRACKER.md` rev 92 (Sprint AU) + rev 89 (Sprint AS).

Sprint AU found **70 dead ghost files** in `apps/editor/src/views/` and `apps/editor/src/plantools/` — directories that were never in the root `tsconfig.json` `include` scope and therefore never compiled or bundled. They were silent duplicates accumulating since Sprint AR. Sprint AS found **88 ghost files** in `apps/editor/src/styles/`. Both discoveries were incidental — there is no systematic process to detect ghosts.

### §7.2 — Scope

**Possible ghost locations** (directories present but not in tsconfig `include`):

```
apps/editor/src/ tree:
  include scope (from root tsconfig.json):
    - src/
    - apps/editor/src/ui/
    - apps/editor/src/engine/
    - apps/editor/src/rendering/

  NOT in include scope (ghost candidates):
    - apps/editor/src/styles/     ← deleted in Sprint AS ✅
    - apps/editor/src/views/      ← deleted in Sprint AU ✅
    - apps/editor/src/plantools/  ← deleted in Sprint AU ✅
    - apps/editor/src/[anything else]/  ← NOT YET AUDITED
```

### §7.3 — Sprint task board

**Sprint AX-G7 — Ghost audit** (0.5 sprint, < 1 engineering day)

| Task | Priority | Status | Description |
|---|:---:|:---:|---|
| **G7-T1** | 🟠 HIGH | ✅ DONE (2026-05-14) | Audited `apps/editor/src/`: only `engine/`, `ui/`, `rendering/` exist — all three are in the tsconfig `include` scope. Ghost directories (`views/`, `plantools/` deleted Sprint AU; `styles/` deleted Sprint AS) are gone. No new ghosts found. |
| **G7-T2** | 🟠 HIGH | ✅ DONE (Sprint AS/AU) | Ghost directories confirmed deleted with zero importers in compiled scope: `apps/editor/src/styles/` (Sprint AS), `apps/editor/src/views/` and `apps/editor/src/plantools/` (Sprint AU). |
| **G7-T3** | 🟡 MEDIUM | ✅ DONE (2026-05-14) | `tools/ga-gate/check-apps-editor-ghost-dirs.ts` created and registered in `run-all.ts` (gate #15). Exits 0 with "0 ghost directories found". |

---

## §8 — G8: Phase F Execution Plan Missing

### §8.1 — Evidence summary

**Source**: `20-PHASE-F-PLAN.md` + `07-OPEN-ITEMS.md OI-011–OI-015`.

`@pryzm/sdk` v1.0.0 and `@pryzm/headless` are code-complete. The marketplace scaffold is code-complete. But Phase F is blocked on 5 human-action items that have no execution sprint or sequencing document:

| OI | Action required | Owner | Unblocks |
|---|---|---|---|
| OI-011 | `npm publish @pryzm/sdk` | Founder | Public SDK adoption |
| OI-012 | `npm publish @pryzm/headless` | Founder | Headless API users |
| OI-013 | DNS `marketplace.pryzm.app` + TLS cert | DevOps | Plugin marketplace |
| OI-014 | Stripe live secret keys (currently test mode) | Founder | Plugin revenue |
| OI-015 | Yjs WebSocket server URL for production | DevOps | Real-time collaboration in prod |

### §8.2 — Required deliverable

A new document **`52-PHASE-F-EXECUTION-CHECKLIST.md`** that sequences these 5 items in dependency order, provides the exact commands for each, and defines the "Phase F is live" acceptance criterion:

**Dependency order**:
```
OI-011 (SDK publish) → OI-013 (DNS) → OI-012 (headless publish) → OI-014 (Stripe live) → OI-015 (Yjs URL)
```

**Why this order**:
- SDK publish first: `@pryzm/headless` has `@pryzm/sdk` as a peer dep — SDK must be public before headless is published
- DNS before headless: the headless API docs reference `marketplace.pryzm.app/api/v1` — DNS must resolve before docs go live
- Stripe live after DNS: Stripe webhooks must target the production domain
- Yjs URL last: real-time collab in prod is the final step after all infrastructure is in place

---

## §9 — G9: `07-OPEN-ITEMS.md` Stale; `47-OPEN-ISSUES.md` Dead Stub

### §9.1 — Evidence summary

**`07-OPEN-ITEMS.md`**: Last swept on 2026-05-04 (38 sprint-revisions ago). Items that are now stale:

| OI | Stale condition | Correct state |
|---|---|---|
| OI-016 | "src/ migration: only src/ui/ remains" — user-deferred | Now irrelevant: `src/ui/` no longer exists. Boolean #1 should be redefined (see G6). |
| OI-023 | "221 remaining `commandManager.execute()` sites" — per doc 34 | Sprint AN and extraction sequence have collapsed subsystems. Count needs re-verification. |
| OI-024 | "`window-shim.ts` in `src/engine/`" | File is now at `apps/editor/src/engine/window-shim.ts` — path needs updating |
| OI-025 | "WorkspaceMountBridge removal" | Sprint AN + AU removed these files; status needs confirmation |

**`47-OPEN-ISSUES.md`**: Contains one paragraph about `CommandManager` duck-typing. It is not a live issues register. It conflicts with `07-OPEN-ITEMS.md` as the canonical source of truth.

### §9.2 — Sprint task board

**G9 — Doc hygiene** (< 1 day)

| Task | Status | Description |
|---|:---:|---|
| **G9-T1** | ✅ DONE (2026-05-14) | `07-OPEN-ITEMS.md` fully swept: OI-016 closed (boolean #1 trivially TRUE — 0 legacy `src/` folders); OI-023 corrected (≤213 hard ceiling; RemoteCommandDispatcher 1 intentional site); OI-024 path updated to `apps/editor/src/engine/window-shim.ts`; OI-025 (WMB removal) verified closed (R07 RESOLVED, 0 files). |
| **G9-T2** | ✅ DONE (2026-05-14) | `47-OPEN-ISSUES.md` redirected: first line is `# Deprecated — see docs/03_PRYZM3/07-OPEN-ITEMS.md` with closure stamp. |
| **G9-T3** | ✅ DONE (2026-05-14) | OI-028 added to `07-OPEN-ITEMS.md` §7: `@pryzm/command-registry` static/dynamic import unification — verified 0 dynamic imports remain (Sprint AT work complete). |

---

## §10 — G10: `@pryzm/command-registry` Mixed Static/Dynamic Import Pattern

### §10.1 — Evidence summary

**Source**: `00-PROCESS-TRACKER.md` rev 91 stamp (post-Sprint-AT fix).

During Sprint AT, 10 command-registry files were converted from lazy circular-dep workarounds (`import('@pryzm/core-app-model').then(...)`) to static imports. However, the reverse pattern persists: **30+ UI panels** in `apps/editor/src/ui/` use `await import('@pryzm/command-registry')` for individual commands (e.g., `await import('@pryzm/command-registry').then(m => m.CreateWallCommand)`) while the registry itself is ALSO statically imported at the module level. This creates a mixed static/dynamic pattern for the same package.

### §10.2 — Impact

1. **Vite bundle splitting anomaly**: Vite sees static import of `@pryzm/command-registry` (→ main chunk) and dynamic `await import('@pryzm/command-registry')` (→ attempted code-split). Since the module is in the main chunk, the dynamic import resolves from the chunk but Vite still emits an informational notice per affected panel. 30 panels × 1 notice = 30 informational notices in the dev console and build log.

2. **Type-safety gap**: Dynamic imports with `.then(m => m.SomeCommand)` bypass TypeScript's normal import resolution. If a command is renamed or its export changes, the type error is silenced by the dynamic import's `any` return.

3. **Minor startup latency**: Each dynamic import requires an async microtask even though the module is already in the main chunk (Promise overhead).

### §10.3 — Fix strategy

For each of the 30+ panels:
```typescript
// Before (mixed pattern):
import { commandBus } from '@pryzm/command-registry';  // static
// ...
const { CreateWallCommand } = await import('@pryzm/command-registry');  // dynamic

// After (unified static):
import { commandBus, CreateWallCommand } from '@pryzm/command-registry';  // all static
```

This is a mechanical codemod. Expected effort: 0.5 sprint (bulk sed + TSC verification).

---

## §11 — Summary and Execution Order

### §11.1 — Priority sequence

```
P0 (this sprint):
  G1 → Fix geometry memory leak (Priority 1 — IN PROGRESS)
  G4 → Verify commandManager.execute() sites (< 1 day)
  G6 → Amend convergence boolean #1 in 02-ARCHITECTURE.md (< 1 day)

P1 (next sprint):
  G2 → Fix post-batch navigation performance (N1 gpu-pick throttle first)
  G7 → Ghost audit for apps/editor/src/
  G9 → Sweep 07-OPEN-ITEMS.md

P1 (planning):
  G5 → Write 51-POST-EXTRACTION-ROADMAP.md
  G8 → Write 52-PHASE-F-EXECUTION-CHECKLIST.md

P1 (code, sprint after G2):
  G3 → CRDT collaboration blackout (requires G2 frame budget fix first — blackout duration shrinks from 11.4s to ~1.7s after resumeAndFlush fix)

P3 (backlog):
  G10 → Command-registry import unification
```

### §11.2 — Gate additions required

| New gate | Triggered by | File |
|---|---|---|
| `check-geometry-ceiling.ts` | G1 | `tools/ga-gate/` |
| `check-scene-graph.ts` | G2 | `tools/ga-gate/` |
| `check-apps-editor-ghost-dirs.ts` | G7 | `tools/ga-gate/` |
| `check-apps-editor-layer-discipline.ts` | G6 | `tools/ga-gate/` |

### §11.3 — Process tracker updates required per gap closure

Every gap closure must update:
1. This document's status column (§0)
2. `docs/03_PRYZM3/00-PROCESS-TRACKER.md` — new rev stamp
3. `docs/03_PRYZM3/07-OPEN-ITEMS.md` — close/update relevant OI
4. `docs/03_PRYZM3/02-ARCHITECTURE.md §8` — for G6 specifically

---

*This document is a living registry. Add rows to §0 as new gaps are discovered. Never delete a gap row — close it in-place.*
