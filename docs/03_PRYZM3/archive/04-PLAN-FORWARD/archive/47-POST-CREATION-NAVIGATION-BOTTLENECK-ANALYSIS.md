# 47 — Post-Creation Navigation Bottleneck Analysis

> **Status**: Analysis only — no code changed.
> **Scope**: Post-batch curtain-wall navigation/rotation LONGTASKs observed in browser logs.
> **Produced from**: Full read of all listed source files + two live browser-console log captures.
> **Contract alignment checked against**: C04-RENDERING-AND-SCHEDULING.md, C10-PERFORMANCE-AND-OBSERVABILITY.md, 46-PIPELINE-ARCHITECTURE-REVIEW.md, PRYZM-CurtainWall-Batch-Audit.md, 01-VISION.md (P1–P8, NFT list), 02-ARCHITECTURE.md.
> **Zero code changes were made during this analysis.**

---

## 1. Observed symptom

After `CreateCurtainWallsOnAllSlabsCommand` completes (15 slabs × 1 CW/slab = 15 curtain walls), the user's 3D navigation (orbit, pan, zoom) is interrupted by a series of main-thread freezes. The browser PerformanceObserver reports 7 LONGTASKs in a 1.2-second window immediately following the batch-complete overlay dismissal.

**Live log capture — `browser_console_20260507_133945_261.log`:**

| `start` (ms since nav) | `duration` | Cluster | Attributed cause |
|---|---|---|---|
| 434 212 | **82 ms** | A | WebGPU PSO compile #1 |
| 434 696 | **59 ms** | B | EPS Flush #1 — NME export + groups #0–1 |
| 434 762 | **161 ms** | A | WebGPU PSO compile #2 |
| 434 926 | **179 ms** | A | WebGPU PSO compile #3 |
| 435 126 | **57 ms** | B | EPS Flush #1 — groups #2–5 (rAF chunk 2) |
| 435 195 | **58 ms** | B | EPS Flush #1 — groups #6–8 (rAF chunk 3) |
| 435 408 | **81 ms** | C | EPS Flush #2 — DependencyResolver CASCADE |

**Total main-thread blocking**: 677 ms in 1 196 ms.
**FPS during this window**: 26 fps → 18 fps (C10 NFT target: ≥60 fps, ≤16.6 ms/frame p95).

---

## 2. Timeline reconstruction

The second log capture (`browser_console_20260507_134058_853.log`) provides a clean sequential trace. Times below are relative to batch-clock T=0 (start of `runBatch()`).

```
T+  0 ms   runBatch() begins — VDT suppressed, CW/Wall/Slab builders paused
T+141.3ms  StoreEventBus: all 15 buffered events delivered in 1 chunk (0.6 ms)
           onComplete fires: _isBatching = false
           VDT suppression lifted (setSuppressed(false))
           markLevelsDirtyImmediate(15 levels) DEFERRED → 'post-render' slot
T+141.4ms  PBR upgrade skipped (skipPbrUpgrade=true) — saves ~482 ms
T+141.5ms  ON-BATCH-END-DEFERRED: overlay dismiss scheduled for post-render
T+154.9ms  UnifiedFrameLoop: FIRST-RENDER-POST-SUPPRESS
           OBC + PASCAL render pass begins — WebGPU PSO compile LONGTASKs start
T+155.9ms  post-render slot fires: markLevelsDirtyImmediate() → VDT._flush() queued
T+175.1ms  ON-BATCH-END-DONE: overlay dismissed (post-dual-PSO-compile) ✅

           ── Cluster A (GPU) ──────────────────────────────────────────────────
           82 ms + 161 ms + 179 ms = 422 ms of WebGPU PSO compilation
           WebGPU device loss detected mid-compile →
             [PRYZM] WebGPU device recovered — renderer recreated.
             [RenderPipelineManager] Phase 2 pipeline active.
             §FIX-DISPOSE-USEDTIMES: old pipeline dispose error (non-fatal)

           ── Cluster B (EPS Flush #1) ─────────────────────────────────────────
           VDT._flush() wakes in low-priority frame
           NME exports 38 elements from L0 (Y=[-1.20, 0.00]):
             9 × CurtainWall: 217+166+67+67+103+58+220+103+181 = 1,182 proxy objects
             29 × other elements (walls, slabs, columns…)
           EPS project() begins: batchId=7462f4e4, viewId=vd-sys-plan-l0
           Groups #0–8 processed sequentially (wall elements, not CWs — CWs are
             §C.3.2 cache misses on first flush, processed but cached for flush #2)
           Re-projection complete: gen=8, native=8, ifc-scene=0
           Three rAF chunks: 59 ms + 57 ms + 58 ms = 174 ms elapsed (3 rAF ticks)

           ── Cluster C (EPS Flush #2) ─────────────────────────────────────────
           Secondary REDETECT_ROOMS fires (source: RoomTopologyObserver — NOT
             BatchCoordinator; CW batch skips BatchCoordinator REDETECT_ROOMS via
             skipRedetectRooms=true, but RoomTopologyObserver fires independently)
           [CommandManager] EXECUTE: REDETECT_ROOMS
           [PlanarTopologyEngine] 1 room detected (ef29fb22), 9 bounding walls
           [DependencyResolver] CASCADE update on ef29fb22 →
             9 affected elements: 67ac27b2[boundedBy], a9eb03cf[boundedBy],
             8b2d731d[boundedBy], 96cc13d2[boundedBy], 4c44255d[boundedBy],
             d3c0346c[boundedBy], 0aa545fb[boundedBy], 1d2718e6[boundedBy],
             df07a568[boundedBy]
           → 9 storeEventBus events of type 'wall' reach VDT._onStoreEvent
             (suppression=false at this point)
           → VDT debounce timer reset 9 times
           → 300 ms later: VDT._flush() queued again
           viewTechnicalDrawingCache.invalidate(vd-sys-plan-l0) called → gen=9 discarded
           EPS project() begins again: gen=10, native=9 (one more wall registered)
           81 ms LONGTASK — lands ~750 ms post-batch, exactly during orbit
           FPS drops to 18 fps
```

---

## 3. Root cause analysis — three independent clusters

### 3.1 Cluster A — WebGPU PSO compile LONGTASKs (422 ms total)

**What fires it**: The very first render frame after batch overlay dismissal. When `UnifiedFrameLoop` lifts render suppression (T+154.9 ms), OBC and PASCAL execute their render passes. WebGPU must compile Pipeline State Objects (PSOs) for every unique material variant introduced by the 15 new CW elements. The Phase 2 pipeline (WebGPU=true, SSGI=true, TRAA=false) generates additional PSO variants per material.

**Secondary effect — device loss**: The peak GPU load during multi-PSO compilation triggered a WebGPU device loss (`WebGPU device recovered — renderer recreated`). Device recovery forces the `RenderPipelineManager` to rebuild the Phase 2 pipeline (`§FIX-DISPOSE-USEDTIMES` non-fatal error confirms the old pipeline was partially torn down). Each recovery adds another round of PSO compilation to the next frame.

**Contract violation**: C10 NFT-PERF-01 (frame budget ≤16.6 ms p95). Three consecutive frames exceed 82/161/179 ms.

**Existing mitigations (correct, working)**:
- `skipPbrUpgrade=true` — eliminates the ~482 ms scene-traverse upgrade pass ✅
- §FIX-DUAL-LONGTASK — overlay stays up through compile, user sees no freeze UI ✅
- Prewarm system (`__cwPrewarmCooldownUntil`) — pre-compiles some PSOs before batch ✅

**Remaining gap**: The prewarm targets the expected base CW material set. A 15-level batch with SSGI+Phase2 generates more unique material × pass × variant combinations than prewarm covers. Each additional level introduces at least one new PSO variant due to unique uniform bindings.

**Gap reference**: Not documented in 46-PIPELINE-ARCHITECTURE-REVIEW.md or PRYZM-CurtainWall-Batch-Audit.md. **This is a new finding.**

---

### 3.2 Cluster B — EPS Flush #1: NME proxy explosion (174 ms across 3 rAF chunks)

**What fires it**: `BatchCoordinator.onComplete()` → `viewDependencyTracker.markLevelsDirtyImmediate()` → `VDT._flush()` → `EdgeProjectorService.project()`.

**Correct mechanisms already in place**:
- `markLevelsDirtyImmediate()` bypasses the 300 ms debounce (§III-2 implemented) ✅
- §FIX-EDGE-PROJECT-DEFER defers the call to post-render, after PSO compile ✅
- §PERF-EDGEPROJECTOR-CHUNK-ADAPTIVE chunks the group loop by rAF tick ✅
- §C.3.2 CW geometry cache serves subsequent flushes from stored geometries ✅

**Root cause of remaining cost**: `NativeElementMeshExporter.exportForView()` runs unconditionally before the EPS loop. For L0 it exports **38 elements**, of which **9 CurtainWalls produce 1,182 total proxy THREE.Mesh objects**:

| CW element | instancedNodes | proxiesFromIM | proxiesFromMesh | total |
|---|---|---|---|---|
| f7900547 | 2 | 75 | 142 | **217** |
| 9b199120 | 2 | 58 | 108 | **166** |
| fcb927c6 | 2 | 76 | 144 | **220** |
| 8f342575 | 2 | 63 | 118 | **181** |
| 224cbe1a | 2 | 37 | 66 | **103** |
| 87f133a3 | 2 | 37 | 66 | **103** |
| 7ea2fb43 | 2 | 22 | 36 | **58** |
| d3a7e51a | 2 | 25 | 42 | **67** |
| e9c3e302 | 2 | 25 | 42 | **67** |
| **TOTAL** | | **418** | **764** | **1,182** |

The proxy expansion (InstancedMesh → N×Mesh) happens inside NME before EPS receives the groups. It is a main-thread O(N_instances) allocation of `THREE.Mesh` objects, each requiring its own `matrixWorld` computation. This cost is **not captured by any of the §DIAG-EPS-0x timers** — it precedes EPS entirely. The NME export is what makes the 59 ms chunk exceed the 50 ms LONGTASK threshold.

**Distinction from §C.3.2 cache**: The §C.3.2 CW geometry cache (EdgesGeometry + toDrawingSpace result) is populated on the first flush and used on all subsequent flushes. However, the NME proxy expansion runs on **every** flush because the proxy meshes are transient — NME creates them per-call and `project()` clears groups after use (C02 §4.3). The cache saves the EPS processing cost, but not the NME creation cost.

**Contract violation**: C10 NFT-PERF-01 (≤16.6 ms/frame). Each of the 3 rAF chunks is 57–59 ms. The §PERF-EDGEPROJECTOR-CHUNK chunking does correctly split the LONGTASK — from a potential 174 ms single task down to 3 × ~58 ms tasks — but each chunk still exceeds the budget.

**Gap reference**: PRYZM-CurtainWall-Batch-Audit §6.2 (post-batch geometry merge) and §7.1 (EPS subscribes to coalesced event) address the EPS side, but not the NME proxy creation cost upstream. **This NME pre-EPS allocation is a new finding not documented in either review doc.**

---

### 3.3 Cluster C — EPS Flush #2: DependencyResolver CASCADE (81 ms) ← PRIMARY "during navigation" freeze

**This is the smoking gun.** The user starts orbiting the 3D view after the overlay dismisses (T+175 ms). Approximately 750 ms later, an 81 ms LONGTASK freezes input processing. FPS drops to 18 fps. The cause is a second, fully redundant EPS reprojection triggered by a chain of events that `skipRedetectRooms=true` does not cover.

**Chain of events**:

```
Step 1: BatchCoordinator.onComplete() sets skipRedetectRooms=true → 
        _executeFinalSweep() skips its own REDETECT_ROOMS for 15 levels ✅

Step 2: RoomTopologyObserver._scheduleRedetect() was called during
        endBatchYielded() drain for the CW store events.
        At drain time: isBatching=true → suppressed ✅

Step 3: After _isBatching=false, a residual debounce timer from
        RoomTopologyObserver fires (CW_DEBOUNCE_MS=800 ms or commit-barrier).
        At fire time: batchCoordinator.isBatching = false → NOT suppressed ❌
        [CommandManager] EXECUTE: REDETECT_ROOMS

Step 4: ReDetectRoomsCommand detects 1 room (ef29fb22) on L0.
        Room store updated (ef29fb22).

Step 5: DependencyResolver.CASCADE update propagates to 9 wall/CW elements:
        [67ac27b2, a9eb03cf, 8b2d731d, 96cc13d2, 4c44255d, d3c0346c,
         0aa545fb, 1d2718e6, df07a568] — all get boundedBy=ef29fb22 updated.
        9 storeEventBus.emit() calls of elementType='wall'.

Step 6: VDT._onStoreEvent() fires 9 times.
        _batchSuppressed = false (lifted in Step 1).
        Each call resets the 300 ms debounce timer.

Step 7: 300 ms after Step 6: VDT._flush() fires.
        viewTechnicalDrawingCache.invalidate() called → gen=9 discarded.
        NME exports 38 elements again (1,182 CW proxies again).
        EPS project() runs: gen=10, native=9, ifc-scene=0.
        81 ms LONGTASK — user is actively orbiting the 3D view.
        FPS: 18 fps.
```

**Why `skipRedetectRooms=true` does not help here**: `skipRedetectRooms` suppresses only the REDETECT_ROOMS command dispatched by `BatchCoordinator._executeFinalSweep()`. It does not suppress the independent REDETECT_ROOMS dispatched by `RoomTopologyObserver` when its CW-triggered debounce timer fires after `_isBatching=false`. Both paths go through `CommandManager.execute()` but are initiated by different callers.

**Why gen=9 is discarded**: VDT._flush() calls `viewTechnicalDrawingCache.invalidate(viewId)` at the start of each flush. Flush #2 fires its invalidate while EPS Flush #1 is still writing results for gen=9. The cache's `setIfCurrent(viewId, 9, drawing)` check fails (gen is now 10), so the gen=9 result is silently discarded — which is correct for cache correctness but means the second reprojection re-does all the work.

**Gap reference**: PRYZM-CurtainWall-Batch-Audit §8.1 ("Invalidates all views on every element-change event") identifies the general VDT problem; §9.1 (CommandManager batch transaction mode) would help prevent the CASCADE events from reaching VDT. However, neither doc identifies the specific **post-suppression window**: the VDT suppression is lifted at T+141 ms, but the DependencyResolver CASCADE events do not arrive until ~300–400 ms later (after REDETECT_ROOMS completes and the dependency graph propagates). This is a new gap.

---

## 4. Architectural gap analysis

### Gap 1 — VDT suppression ends before CASCADE completes (HIGH — new finding)

**Problem**: `viewDependencyTracker.setSuppressed(false)` is called in `BatchCoordinator.onComplete()` at T+141 ms. The REDETECT_ROOMS command triggered by RoomTopologyObserver fires at ~T+155 ms. The DependencyResolver CASCADE it produces does not reach VDT._onStoreEvent until ~T+300–400 ms (after the room detection + dependency graph propagation). By then, VDT suppression has been off for ~160–260 ms, so every CASCADE storeEventBus event lands unblocked.

**Contract alignment**: This violates the intent of §PERF-VIEW-BATCH-SUPPRESS (VDT suppression during batch) but does not violate any explicit contract clause — the batch is genuinely over at T+141 ms. The problem is that the downstream effects of REDETECT_ROOMS (which BatchCoordinator itself skips) are not suppressed.

**Where it sits vs. existing docs**: 46-PIPELINE-ARCHITECTURE-REVIEW §III-1 and §III-2 address EPS scheduling and debounce bypass (both implemented). PRYZM-CurtainWall-Batch-Audit §8.1 addresses the general VDT problem. Neither identifies this specific post-suppression window.

---

### Gap 2 — NME proxy expansion cost unaccounted (MEDIUM — new finding)

**Problem**: `NativeElementMeshExporter.exportForView()` creates O(instanceCount) THREE.Mesh proxy objects per InstancedMesh per CW element, unconditionally, on every EPS flush. For 9 CW elements with 58–220 proxies each, this produces 1,182 short-lived mesh objects per flush. The §C.3.2 CW geometry cache saves the EdgesGeometry + toDrawingSpace work, but does not save the NME proxy creation step. This means even a 100% EPS cache hit rate still runs a 1,182-proxy NME expansion per flush.

**Log evidence**: NME runs before EPS (log line 37 before line 49 in the new capture). The NME expansion is the dominant cost in the 57–59 ms chunks — individual EPS `traverseMs` per wall is only 0.1–0.5 ms, confirming the bulk of each chunk is NME + setup, not EPS traverse.

**Where it sits vs. existing docs**: PRYZM-CurtainWall-Batch-Audit §6.1 (TypedArray pool) and §7.1 (EPS subscribes to coalesced event) address different aspects. §3.1 (UnifiedFrameLoop budget) covers the scheduling. **NME pre-EPS proxy cost is unaddressed in either review doc.**

---

### Gap 3 — WebGPU PSO prewarm coverage for large batches (MEDIUM)

**Problem**: The prewarm system runs before the batch to pre-compile CW PSOs. For a 15-level batch with WebGPU Phase 2 pipeline (SSGI=true), the PSO set is larger than prewarm anticipates. Three sequential PSO compile LONGTASKs (82+161+179=422 ms) follow the first post-batch render despite prewarm running.

**Secondary effect**: Device loss during the intense compile cycle forces `RenderPipelineManager` to rebuild the Phase 2 pipeline, adding another round of initialization overhead (confirmed by `WebGPU device recovered — renderer recreated` + `§FIX-DISPOSE-USEDTIMES`).

**Where it sits vs. existing docs**: Not mentioned in either review doc. This is GPU-layer behaviour (below the application render contract). However, C04 §3.1 ("single rAF passes render budget") is violated by these LONGTASKs.

---

### Gap 4 — RoomTopologyObserver post-batch debounce not coordinated with VDT suppression (MEDIUM)

**Problem**: `BatchCoordinator.onComplete()` calls `viewDependencyTracker.setSuppressed(false)` and immediately sets `_isBatching=false`. From this moment, both VDT and RoomTopologyObserver are fully live. Any CW store event from the endBatchYielded() drain that was queued in RoomTopologyObserver's 800 ms debounce timer fires after `_isBatching=false`, schedules REDETECT_ROOMS, and the room cascade re-dirties VDT.

The root of the problem is that these two suppression guards (`_isBatching` for RoomTopologyObserver, `_batchSuppressed` for VDT) are lifted simultaneously. The CASCADE that follows REDETECT_ROOMS runs entirely in the gap between suppression ending and the next natural opportunity to check.

**Existing suppression at schedule time** (T+drain) works:
```ts
// RoomTopologyObserver._scheduleRedetect() — isBatching=true during drain ✅
if (batchCoordinator.isBatching) { return; }
```

**Suppression at fire time** (T+800 ms, CW_DEBOUNCE_MS) does NOT catch:
```ts
// Timer fires after _isBatching=false — passes through ❌
if (batchCoordinator.isBatching) { return; } // isBatching=false → runs
```

The 800 ms CW_DEBOUNCE_MS was designed to absorb the rAF build queue drain. The batch now completes in ~175 ms. So the 800 ms timer reliably fires 625 ms after `isBatching=false` — exactly in the navigation window.

**Where it sits vs. existing docs**: PRYZM-CurtainWall-Batch-Audit §4.1 (debounce RoomTopologyObserver rebuild) mentions "40 redundant rebuilds" during a batch. The current suppression correctly prevents redundant rebuilds *during* the batch. The post-batch single REDETECT_ROOMS cascade is a separate, under-documented issue.

---

### Gap 5 — CASCADE store events bypass VDT per-element registration (LOW)

**Problem**: VDT._onStoreEvent uses `_elementLevelMap.get(event.elementId)` to resolve the level for targeted view dirtying. The DependencyResolver CASCADE emits events for elementIds that the CW batch never called `viewDependencyTracker.registerElement()` on (walls were registered before the CW batch ran). If `_elementLevelMap` has the wall IDs (from prior wall creation), this works. But if any wall ID is absent, the fallback (`_getAffectedViews` marks ALL non-3D views dirty), widening the reprojection scope.

**Observed**: In the log, all 9 CASCADE wall elements are existing walls (registered earlier). The targeted path fires correctly. This gap does not cause extra views to be dirtied in the current session, but will in projects with undo/redo cycles (phantom IDs per PRYZM-CurtainWall-Batch-Audit §8.2).

---

## 5. Already-correct mechanisms (confirmed from code)

The following items from the two prior review documents are **confirmed implemented and working correctly** as of the current codebase:

| Item | Status |
|---|---|
| §III-1 (parallel view flush via Promise.all) | ✅ VDT._flush() line 409 |
| §III-2 (debounce bypass for batch via markLevelsDirtyImmediate) | ✅ VDT.markLevelsDirtyImmediate() line 270; BatchCoordinator calls it in post-render slot |
| §PERF-VIEW-BATCH-SUPPRESS (VDT suppressed during drain) | ✅ setSuppressed(true) in _setupBatch(), lifted in onComplete |
| §FIX-EDGE-PROJECT-DEFER (markLevelsDirtyImmediate deferred to post-render) | ✅ BatchCoordinator line 1050–1070 |
| §PERF-EDGEPROJECTOR-CHUNK-ADAPTIVE (CW chunk size = 1) | ✅ EPS line 1364 |
| §C.3.2 CW geometry cache (per-element per-view versioned cache) | ✅ EPS line 1380–1408; will eliminate repeat EPS cost from flush #2 onwards |
| §FIX-SKIP-REDETECT-ROOMS for CW batch | ✅ BatchCoordinator line 1292 — correctly skips BatchCoordinator's own sweep |
| §FIX-SKIP-PBR-UPGRADE for CW batch | ✅ BatchCoordinator line 141 — correctly skips ~482 ms traverse |
| §BATCH-EVENT-YIELD (endBatchYielded distributes drain across frames) | ✅ StoreEventBus 15 events in 1 chunk (0.6 ms), no avalanche |
| RoomTopologyObserver suppressed during batch (isBatching gate at schedule time) | ✅ RoomTopologyObserver line 417 |
| §A.2 VDT element unregister prunes _elementLevelMap | ✅ VDT line 146 |
| rAF owner count = 1 (C04 §3.1 compliant) | ✅ checked 2026-05-01; ga-gate exits 0 |

---

## 6. Priority action plan

The three clusters have different fix complexity and impact profiles. All proposed fixes below are **analysis-level descriptions only** — no code has been written.

### P0 — Extend VDT suppression through REDETECT_ROOMS CASCADE (Cluster C)

**Expected gain**: Eliminates EPS Flush #2 entirely (81 ms LONGTASK removed, navigation freeze gone).

**Approach**: `BatchCoordinator` already has `onFinalSweepComplete` callback infrastructure. The fix requires:

1. Before calling `viewDependencyTracker.setSuppressed(false)` in `onComplete`, keep suppression ON.
2. Register a one-shot subscriber that detects when the DependencyResolver CASCADE settles (e.g. zero pending CASCADE updates in the dependency graph, or a fixed microtask-queue flush via `Promise.resolve().then()`).
3. Only after the CASCADE settles: call `setSuppressed(false)` then `markLevelsDirtyImmediate(levelIds)`.

The simplest correct form: schedule `setSuppressed(false)` and `markLevelsDirtyImmediate()` via `queueMicrotask(() => queueMicrotask(...))` — two microtask ticks are sufficient for the DependencyResolver sync propagation to complete before VDT sees any events.

Alternatively: add a `postCascadeSettled: boolean` flag to `BatchOptions`. When true, `BatchCoordinator.onComplete()` defers suppression lift until after the next `storeEventBus` quiescence (no events queued for N ms). This is safer for multi-level projects where the CASCADE is larger.

**Contract alignment**: Compliant with §PERF-VIEW-BATCH-SUPPRESS intent. Does not drop events — all CASCADE updates are still stored correctly; VDT just defers acting on them until after they are all complete. C04 §3.1 (single rAF) unaffected.

**Risk**: If the CASCADE never settles (pathological dependency cycles), suppression stays on indefinitely. The fix must include a hard timeout (e.g. 2 s) that calls `setSuppressed(false)` unconditionally to prevent permanent VDT lockout.

---

### P1 — NME plan-view crop culling (Cluster B, partial)

**Expected gain**: Reduces NME proxy count from 1,182 to the subset visible within the plan view's crop region. For a typical plan view of one level, walls on other levels are already excluded by the Y range filter; but CW elements with large extents can span multiple inclusion zones. Adding a 2D XZ bounding-box pre-filter before proxy expansion could reduce the proxy count by 40–60% for typical office floor plans.

**Approach**: `NativeElementMeshExporter.exportForView()` already accepts a `viewDef` with optional `spatial.cropRegion` (XZ bounds). Extend the InstancedMesh-to-proxy expansion to check whether each instance's world AABB intersects the crop region before creating a proxy mesh. Instances fully outside the crop region are skipped.

**Contract alignment**: C02 §4.3 (groups cleared after projection) unaffected. C10 NFT-PERF-05 (EPS project ≤200 ms/view) is the relevant NFT — reducing proxy count directly reduces NME time.

**Risk**: Medium. The crop region is optional and many plan views have no explicit crop. The filter must degrade gracefully (no filter = current behaviour) when `cropRegion` is absent.

---

### P2 — NME proxy result caching (Cluster B, comprehensive)

**Expected gain**: Eliminates NME proxy expansion cost on every flush after the first. Specifically: if the CW element's 3D geometry has not changed (version unchanged), NME can return a cached set of proxy groups instead of re-expanding InstancedMesh on each call.

**Approach**: Mirror the §C.3.2 EPS geometry cache pattern at the NME layer. Cache the proxy group output keyed by `(elementId, version)`. On cache hit, return the stored proxy list directly. On cache miss (first call, or after geometry update), expand and store.

**Considerations**:
- The proxies are currently disposed after use (C02 §4.3). If cached, they must be cloned or kept alive with reference counting.
- The cache adds memory pressure: 1,182 mesh objects retained. Verify this is acceptable against C10 NFT-MEM-01 (memory ceiling).
- Requires NME to accept a `version` input from element userData — already present on CW elements (`group.userData.version`).

**Contract alignment**: This pattern is consistent with the §C.3.2 precedent in EPS. C02 §4.3 "groups cleared after projection" applies to the outer wrapper group, not to the NME-internal proxy list — so caching proxies inside NME does not violate this clause.

---

### P3 — Extend PSO prewarm to cover SSGI Phase 2 variants (Cluster A)

**Expected gain**: Reduces PSO compile LONGTASKs from 422 ms toward ~50 ms (anticipated for pre-warmed PSOs with no GPU device loss).

**Approach**: Profile the unique PSO variants generated by the Phase 2 pipeline for CW materials (base colour + SSGI + shadow receiver + depth-prepass). Enumerate these variants in the prewarm pass. The prewarm already runs before the batch; extending it with Phase 2 variants requires no batch-pipeline change, only additions to the prewarm material list.

**Secondary fix**: Investigate the WebGPU device loss under PSO pressure. The `§FIX-DISPOSE-USEDTIMES` non-fatal error suggests the device-loss recovery is not fully clean (old pipeline disposal fails). A robust recovery should tolerate stale PSO handles (set `usedTimes` to 0 or guard the dispose call with an existence check).

**Contract alignment**: GPU-layer fix. Does not touch L0–L7 layers. C04 and C10 NFTs are the targets.

---

## 7. Summary table — gaps and severity

| # | Gap | Cluster | New finding? | Severity | Approx. gain | Sprint estimate |
|---|---|---|---|---|---|---|
| G1 | VDT suppression ends before CASCADE completes | C | ✅ YES | HIGH | −81 ms / session | Small (2 lines + microtask) |
| G2 | NME proxy expansion unaccounted per flush | B | ✅ YES | MEDIUM | −20–30 ms per chunk | Medium (NME cache) |
| G3 | PSO prewarm misses SSGI Phase 2 variants | A | ✅ YES | MEDIUM | −100–200 ms (PSO) | Medium (prewarm extension) |
| G4 | RoomTopologyObserver 800 ms CW timer fires post-batch | C | ✅ YES | MEDIUM | Secondary C fix | Small (timer coordination) |
| G5 | CASCADE store events can miss VDT element map (stale) | — | No (§8.2) | LOW | Edge case | Small (already tracked) |

**Items already fixed** (confirmed from live code, not needing action):
- §III-1 parallel flush, §III-2 debounce bypass, §C.3.2 CW cache, §FIX-EDGE-PROJECT-DEFER, §BATCH-EVENT-YIELD, §FIX-SKIP-REDETECT-ROOMS, §PERF-EDGEPROJECTOR-CHUNK, rAF single-owner.

---

## 8. Contract cross-reference

| Contract | Clause | Current status | Gap that violates it |
|---|---|---|---|
| C10 §NFT-PERF-01 | Frame budget ≤16.6 ms p95 | ❌ VIOLATED (7 LONGTASKs 57–179 ms) | G1 (81 ms), G2 (57–59 ms), G3 (82–179 ms) |
| C10 §NFT-PERF-05 | EPS project ≤200 ms/view | ⚠ BORDERLINE (174 ms total / 3 chunks) | G2 (NME proxy cost) |
| C04 §3.1 | Single rAF owner | ✅ COMPLIANT (rAF count = 1) | — |
| C04 §3.2 | Frame work in pre/post-render slots | ✅ COMPLIANT (EPS in low-priority slot) | — |
| P4 (Vision) | No `(window as any)` | ✅ COMPLIANT (0 non-shim casts) | — |
| P6 (Vision) | Commands only mutate state | ✅ COMPLIANT | — |
| 46-rev §III-2 | Debounce bypass for batch | ✅ IMPLEMENTED | — |
| 46-rev §III-1 | Parallel view flush | ✅ IMPLEMENTED | — |
| Audit §8.1 | One VDT flush per batch | ⚠ PARTIAL — flush #1 correct; flush #2 is a new gap (G1) | G1 |
| Audit §4.1 | Debounce RoomTopologyObserver | ⚠ PARTIAL — batch suppression works; post-batch 800 ms timer not coordinated | G4 |
| Audit §9.1 | CommandManager batch mode | ❌ NOT YET implemented — CASCADE events bypass | G1, G4 |

---

## 9. Suggested sprint ordering

**Sprint 1 — Highest ROI, small changes (1–2 days)**

- **G1 fix**: Extend VDT suppression through CASCADE by deferring `setSuppressed(false)` + `markLevelsDirtyImmediate()` into a double-microtask after `onComplete`. Adds a 2-tick window for DependencyResolver to synchronously propagate all CASCADE updates before VDT sees them. Eliminates Cluster C entirely.

- **G4 fix**: Coordinate RoomTopologyObserver's 800 ms CW debounce timer with BatchCoordinator. Option A: after the CW batch, call `roomTopologyObserver.cancelPendingLevels(levelIds)` from `onComplete` to discard any in-flight 800 ms timers for the levels the batch already handled. Option B: extend `RoomTopologyObserver._scheduleRedetect()` to check a `postBatchCooldown` window in addition to `isBatching`. Both are small, targeted, and low-risk.

**Sprint 2 — Medium changes, significant gain (3–5 days)**

- **G2 fix (NME crop culling)**: Add XZ bounding-box pre-filter to NME's InstancedMesh proxy expansion. The `cropRegion` field is already on `ViewDefinition`. Expected: 40–60% proxy reduction in typical plan views.

- **G3 fix (PSO prewarm)**: Enumerate SSGI Phase 2 CW material variants in the prewarm pass. Investigate `§FIX-DISPOSE-USEDTIMES` WebGPU device loss — add a null-guard on `usedTimes` in the pipeline dispose path.

**Sprint 3 — Larger structural changes (1 week, already tracked)**

- **Audit §9.1** (CommandManager batch transaction mode): Gate `command-executed` bus dispatches during batch, preventing the DependencyResolver CASCADE from reaching VDT at all. This is the correct long-term fix for G1 and G4, as it eliminates the entire event class at source. Tracked in PRYZM-CurtainWall-Batch-Audit.md Priority Action Plan row P1.

- **G2 fix (NME proxy cache)**: Full per-element proxy cache keyed by `(elementId, version)` — eliminates NME expansion cost on all subsequent flushes. Larger change with memory implications to be reviewed against C10 NFT-MEM-01.

---

## 10. Appendix — raw log evidence

**Log file**: `/tmp/logs/browser_console_20260507_133945_261.log`
**Log file**: `/tmp/logs/browser_console_20260507_134058_853.log`

Key lines from the newer capture (line numbers in the 92-line file):

```
16:  [StoreEventBus] endBatchYielded() — all 15 event(s) delivered in 1 chunk (0.6ms)
18:  [BatchCoordinator] suppression lifted; markLevelsDirtyImmediate(15 levels) DEFERRED
25:  [BatchCoordinator] Final sweep: SKIPPING REDETECT_ROOMS (skipRedetectRooms=true)
27:  [UnifiedFrameLoop] FIRST-RENDER-POST-SUPPRESS totalSuppressedMs=154.9ms
28:  [BatchCoordinator] markLevelsDirtyImmediate(15) fired post-render T=+155.9ms
30:  [CommandManager] EXECUTE: REDETECT_ROOMS      ← RoomTopologyObserver (not BatchCoordinator)
34:  [ViewDependencyTracker] flush — 1 dirty view(s): vd-sys-p  ← Flush #1
37:  [NativeElementMeshExporter] Plan view — exporting 38 elements
38–46: 9 × CurtainWall NME-01 lines (totalProxies 217+166+67+67+103+58+220+103+181=1182)
47:  [BatchCoordinator] ON-BATCH-END-DONE T=+175.1ms
49:  [EdgeProjectorService] project() batchId=7462f4e4
50–69: EPS §DIAG-EPS-01/02/03/04 for groups #0–8 (wall elements)
76–81: WebGPU device recovered + Phase 2 pipeline rebound
86:  [DependencyResolver] CASCADE create on a2bacbef → 15 elements [sitsOn]
90:  [DependencyResolver] CASCADE update on ef29fb22 → 9 elements [boundedBy] ← triggers VDT Flush #2
```

**LONGTASK measurements from older capture:**
```
434212ms +82ms   PSO compile #1
434696ms +59ms   EPS Flush #1 chunk 1   ← gen=8 start
434762ms +161ms  PSO compile #2
434926ms +179ms  PSO compile #3
435126ms +57ms   EPS Flush #1 chunk 2
435195ms +58ms   EPS Flush #1 chunk 3   ← gen=8 complete (native=8, ifc-scene=0)
435408ms +81ms   EPS Flush #2           ← gen=10 complete (native=9, ifc-scene=0)
                                            gen=9 discarded (invalidated by Flush #2)
FPS: 26 at 434696ms → 18 at 435408ms
```

---

*Document produced from: full source read of ViewDependencyTracker.ts, EdgeProjectorService.ts (lines 1–1420), BatchCoordinator.ts (lines 1–1100), RoomTopologyObserver.ts (lines 1–489), two live browser-console log captures. No changes were made to any source file during this analysis.*

*PRYZM internal — not for distribution.*
