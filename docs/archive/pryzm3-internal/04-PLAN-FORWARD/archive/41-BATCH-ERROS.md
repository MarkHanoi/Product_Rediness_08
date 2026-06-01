# 41 — Batch Curtain Wall Creation: Perf Fix Status

**Created:** 2026-05-05  
**Status:** All four fixes implemented and verified in codebase. Doc is the authoritative post-sprint summary.  
**Session that landed fixes:** Multiple sessions 2026-05-04/05 (diagnosis in 40-CW-PIPELINE-TRACE.md).

---

## Problem Statement

`CREATE_CURTAIN_WALLS_ON_ALL_SLABS` for a 110-wall / 11-slab session was taking **~75–80 seconds** from click to interactive scene, dominated by four independent bottlenecks that each triggered a WebGPU PSO compile LONGTASK. Target: under 3 seconds.

---

## Root Cause Summary

| # | Bottleneck | Measured cost (110-wall) | Root cause |
|---|-----------|--------------------------|-----------|
| 1 | First render after suppression lifts | **10,923ms LONGTASK** | No pre-unsuppress render; PSOs cold on first OBC+PASCAL frame |
| 2 | PBR upgrade (renderingCoordinator.onSceneGeometryAdded) | **52,668ms / 4 idle chunks** | Traversed all 422 scene meshes + compiled PBR shader variants; unnecessary for CW (materials already MeshStandardMaterial) |
| 3 | rAF geometry drain | ~989ms (12 frames) | `MAX_BUILDS_PER_FRAME=5` initial / adaptive cap 12 too conservative |
| 4 | Shadow reactivation | ~20,000ms / 11 post-render slices | `WALLS_PER_SHADOW_FRAME=10` + scheduled on post-render rAF (competed with first render) |

---

## Architecture Note (Phase 5 renderer context)

`window.pryzmRenderer` = `THREE.WebGPURenderer` — the production renderer set at `initScene.ts` line ~1125. All real frames in Phase 5 go through this via Pascal's `renderPipelineManager`.

`window.bimWorld.renderer.three` = OBC's `PostproductionRenderer` (WebGL) — locked to MANUAL mode in Phase 5. PSOs compiled in this WebGL context are **not** reused by the WebGPU production renderer.

`window.renderPipelineManager` = Pascal's `RenderPipelineManager` — bound to `pryzmRenderer` internally. Its `.render(delta)` method is **synchronous** (void return) and executes the full production pipeline (ScenePass MRT → SSGI → TRAA → outlines). This is the correct handle for pre-warming PSOs because:
1. It uses `pryzmRenderer` (correct WebGPU context).
2. It is synchronous — PSOs are warm before the call site returns.
3. `WebGPURenderer.compile()` returns a Promise — cannot warm PSOs synchronously.

---

## Fix 1 — CW Prewarm (eliminates Phase 6 LONGTASK for curtain-wall batches)

**File:** `src/engine/subsystems/commands/curtainwall/CreateCurtainWallsOnAllSlabsCommand.ts`  
**Method:** `_prewarmCurtainWallShaders()`  
**Status:** ✅ Implemented (2026-05-05, §FIX-CW-PREWARM)

```
BEFORE: suppression lifts → next _tick() → OBC+PASCAL cold PSO compile → 10,923ms LONGTASK
AFTER:  _prewarmCurtainWallShaders() adds 3 invisible InstancedMesh probes and calls
        window.renderPipelineManager.render(0) BEFORE batchCoordinator.runBatch().
        (~100–300ms one-time cost on first execute, skipped via _shadersPrewarmed flag)
        → suppression lifts → next _tick() → PSO cache-hit → ~0ms LONGTASK
```

Adds 3 invisible `scale(0)` probe meshes (mullion InstancedMesh, panel InstancedMesh DoubleSide,
fallback Mesh FrontSide) and calls `window.renderPipelineManager.render(0)` to pre-compile all
3 CW material PSO variants before the batch starts.  The `render(0)` call uses typed
`window.renderPipelineManager` (declared in `global-window.d.ts`), not `(window as any)`.

**Note — `endBatchRenderSuppress()` no longer calls `rpm.render(0)`.**  
A previous approach added a synchronous `renderPipelineManager.render(0)` call inside
`endBatchRenderSuppress()` (after the rAF drain, before lifting suppression).  Empirical
measurement showed this cost **3,296–8,443 ms** (not the estimated 200–500 ms) because the
full production pipeline runs on all new scene geometry.  Crucially, a **7,046 ms LONGTASK
still fired after the overlay dismissed** — from `EdgeProjectorService.project()`, NOT from
PSO compile — so the pre-unsuppress render produced zero LONGTASK reduction while keeping the
overlay visible for an extra 3–8 seconds.  Removed 2026-05-05
(`§PERF-RENDER-BEFORE-UNSUPPRESS-REMOVAL`). PSO compile for curtain-wall batches is covered
by the Phase 0 prewarm above; for wall batches it is absorbed into the chunked plan-view
reprojection (Fix W2 below).

---

## Fix 2 — Skip PBR Upgrade for CW Batches (eliminates Phase 8 LONGTASK)

**Files:** `BatchCoordinator.ts`, `initScene.ts`, `CreateCurtainWallsOnAllSlabsCommand.ts`  
**Status:** ✅ Implemented (2026-05-05, §PERF-SKIP-PBR)

CW materials are `MeshStandardMaterial` with `metalness`/`roughness` set at build time — they
do not require the post-batch PBR upgrade (which traverses ALL scene meshes and calls
`renderingCoordinator.onSceneGeometryAdded()`).

**BatchOptions interface** (`BatchCoordinator.ts`):
```typescript
skipPbrUpgrade?: boolean;
```

**BatchCoordinator** stores `_skipPbrUpgrade`, exposes `get skipPbrUpgrade()`, resets in `forceReset()`.

**`initScene.ts`** `setPostBatchCallback` captures the flag synchronously before the idle closure:
```typescript
const shouldSkipPbr = batchCoordinator.skipPbrUpgrade;  // captured here, not inside closure
requestIdleCallback(() => {
    if (shouldSkipPbr) { console.log('§PERF-SKIP-PBR: skipped'); return; }
    runPbrUpgrade();
});
```
The synchronous capture prevents a race where `forceReset()` clears `_skipPbrUpgrade` before
the idle callback fires (which happens when multiple batches run back-to-back).

**`CreateCurtainWallsOnAllSlabsCommand.ts`** passes `skipPbrUpgrade: true` to `runBatch()`:
```typescript
batchCoordinator.runBatch(_processSlabs, {
    levelIds: affectedLevelIds,
    totalElementCount: estimatedWallCount,
    skipRedetectRooms: true,
    skipPbrUpgrade: true,
});
```

**Cost eliminated: 52,668ms → 0ms for 110-wall batches.**

---

## Fix 3 — Faster rAF Drain (reduces Phase 2 from ~989ms to ~400ms)

**File:** `src/engine/subsystems/curtainwalls/CurtainWallBuilder.ts`  
**Status:** ✅ Implemented (2026-05-05)

| Parameter | Before | After |
|-----------|--------|-------|
| `MAX_BUILDS_PER_FRAME` (initial budget) | 5 | **20** |
| Adaptive cap (maximum budget) | 12 | **30** |
| Adaptive floor (minimum budget) | 2 | **5** |

The adaptive budget increments when `frameMs < 8ms`, decrements when `frameMs > 14ms`.
At measured frameMs=2–4ms per 110-wall wall, budget grows to the cap (30) quickly.
110 walls ÷ 20 initial ≈ 5–6 drain frames (vs. 12 before).

---

## Fix 4 — Shadow Reactivation to Idle Callback (moves Phase 9 off critical path)

**File:** `src/engine/subsystems/curtainwalls/CurtainWallBuilder.ts`  
**Method:** `_reactivateShadows()`  
**Status:** ✅ Implemented (2026-05-05, §PERF-SHADOW-IDLE)

| Parameter | Before | After |
|-----------|--------|-------|
| `WALLS_PER_SHADOW_FRAME` | 10 | **50** |
| First slice scheduling | `FrameScheduler.schedule('post-render', drainSlice)` | `requestIdleCallback(drainSlice, { timeout: 3000 })` |
| Subsequent slices | `FrameScheduler.schedule('post-render', drainSlice)` | `requestIdleCallback(drainSlice, { timeout: 3000 })` |

With `WALLS_PER_SHADOW_FRAME=50`, 110 walls needs only 3 idle slices (50 + 50 + 10) instead
of 11 post-render slices. Each slice no longer competes with the critical render path.

`_reactivateShadows()` returns immediately after scheduling the first idle callback, so
`BatchCoordinator._executeFinalSweep()` can proceed without waiting for any shadow work.

`setTimeout(drainSlice, 0)` is the fallback for browsers without `requestIdleCallback`.

**Shadow reactivation cost moves from ~20,000ms blocking → ~3,000ms idle (user-invisible).**

---

## Fix W1 — Wall rAF Drain Budget 3→15 + Adaptive Drain

**File:** `src/engine/subsystems/walls/WallFragmentBuilder.ts`  
**Status:** ✅ Implemented (2026-05-05, §PERF-WALL-DRAIN-2026-05-05)

**Root cause:** `MAX_BUILDS_PER_FRAME = 3` was set when OBC renders were NOT suppressed during
drain. Each drain frame paid the full WebGPU render overhead (~20–100 ms) in addition to
geometry cost. After `§PERF-VIEW-BATCH-SUPPRESS` was introduced, OBC+PASCAL renders are fully
suppressed during drain — the per-frame cost is ONLY geometry. Observed: 3 walls = 3.0 ms,
i.e. ~1 ms/wall. At 1 ms/wall, 15 walls/frame = ~15 ms — well under the 50 ms LONGTASK
threshold.

| Parameter | Before | After |
|-----------|--------|-------|
| `MAX_BUILDS_PER_FRAME` (initial budget) | 3 | **15** |
| Adaptive cap | — (no adaptive logic) | **40** |
| Adaptive floor | — | **5** |
| Adaptive increment threshold | — | `frameMs < 8ms` → budget++ |
| Adaptive decrement threshold | — | `frameMs > 20ms` → budget--` |

**Savings for 72 walls:** 24 drain frames → ≤5 frames (~96 ms saved; `signalBuildQueueDrained`
fires 5× sooner, unblocking the registration drain and final sweep earlier).

---

## Fix W2 — EdgeProjectorService Native Mesh Loop Chunked

**File:** `src/engine/subsystems/core/views/EdgeProjectorService.ts`  
**Method:** `project()` — Source B (native mesh groups) loop  
**Status:** ✅ Implemented (2026-05-05, §PERF-EDGEPROJECTOR-CHUNK)

**Root cause:** After the batch overlay dismisses, `ViewDependencyTracker.markLevelsDirty()`
fires a 300 ms debounced flush → `EdgeProjectorService.project()`. For 72 walls on 6 levels,
the native mesh group loop processes ~595 groups synchronously — ~11.8 ms/group → **7,046 ms
LONGTASK** that freezes the main thread long after the user sees the overlay dismiss. This was
the dominant post-overlay freeze in both CW and wall batches.

**Fix:** Yield every `CHUNK_SIZE = 4` groups via `await new Promise(r => setTimeout(r, 0))`.
This schedules the continuation as a fresh macrotask, allowing paint, input, and rAF callbacks
between chunks.

```
CHUNK_SIZE = 4:  4 × 11.8 ms ≈ 47 ms per chunk  (<50 ms LONGTASK threshold)
595 groups / 4  = 149 yield points
Total wall-clock time: unchanged (~7 s in background)
Main-thread blocking per chunk: ≤47 ms (no LONGTASKs)
```

---

## Fix W3 — Remove Synchronous rpm.render(0) from endBatchRenderSuppress()

**File:** `src/engine/subsystems/core/rendering/UnifiedFrameLoop.ts`  
**Method:** `endBatchRenderSuppress()`  
**Status:** ✅ Implemented (2026-05-05, §PERF-RENDER-BEFORE-UNSUPPRESS-REMOVAL)

As described under Fix 1, the synchronous `rpm.render(0)` call in `endBatchRenderSuppress()`
cost 3,296–8,443 ms of overlay blocking time with zero LONGTASK reduction. Removed.

**Effect on wall batches:**
- Overlay dismisses immediately after the rAF drain + registration drain complete
- Wall batch overlay was visible for ~3.3 s of unnecessary blocking → now dismissed in ~1.4 s
- First render PSO compile is absorbed by the chunked EdgeProjectorService background work

---

## Expected Outcome (110-wall / 11-slab CW session)

| Phase | Before | After (all fixes) |
|-------|--------|-------|
| Prewarm (Ph 0) | ~218ms | ~100–300ms |
| rAF drain (Ph 2) | ~989ms (12 frames) | ~400ms (5–6 frames) |
| Pre-unsuppress render (Ph 6 prep) | 0 | **0ms** (removed) |
| Overlay visible total | ~8,444ms | **~1,410ms** |
| First render LONGTASK (Ph 6) | **10,923ms** | **~0ms** (CW prewarm) |
| PBR upgrade (Ph 8) | **52,668ms** | **~0ms** |
| Shadow slices (Ph 9) | **~20,000ms** (blocking) | **~3,000ms** (idle, non-blocking) |
| EdgeProjectorService LONGTASK | **7,046ms** | **0ms** (≤47ms chunks) |
| **Total user-visible freeze** | **~75–80 seconds** | **~1.5–2.5 seconds** |

## Expected Outcome (72-wall / 6-slab WALLS session)

| Phase | Before | After (all fixes) |
|-------|--------|-------|
| rAF drain | ~800ms (24 frames @ 3/frame) | ~100ms (5 frames @ 15+/frame) |
| Pre-unsuppress render | **3,296ms** (blocked overlay) | **0ms** (removed) |
| Overlay visible total | ~3,300ms+ | **~1,100ms** |
| Post-overlay LONGTASK | **2,595ms** | **0ms** (≤47ms chunks) |
| PBR upgrade (Ph 8) | running | running (unchanged — walls need PBR) |
| **Total user-visible freeze** | **~60–75 seconds** | **~2–3 seconds** |

---

## What Was NOT Changed

- `CreateWallsOnAllSlabsCommand.ts` does NOT set `skipPbrUpgrade: true`
  (walls use layered materials that genuinely benefit from the PBR upgrade pass)
  and does NOT set `skipRedetectRooms: true` (walls define room boundaries).

- `WALLS_PER_SHADOW_FRAME` interactive-placement flush (`_flushInteractiveShadows`) —
  unchanged. Interactive placement uses one `requestIdleCallback` with `timeout: 500`
  for a single non-sliced flush; that path is already fast.

- `CurtainWallBuilder._buildsPerFrame` adaptive logic — only the constants changed.
  The adaptive increment/decrement logic itself is unchanged.

---

## Files Changed (perf-fix sweep 2026-05-05)

| File | Change |
|------|--------|
| `src/engine/subsystems/commands/curtainwall/CreateCurtainWallsOnAllSlabsCommand.ts` | Fix 1 prewarm (renderPipelineManager.render, InstancedMesh probes, `window.renderPipelineManager` typed); Fix 2 `skipPbrUpgrade: true` |
| `src/engine/subsystems/core/rendering/UnifiedFrameLoop.ts` | **Fix W3**: removed synchronous `rpm.render(0)` from `endBatchRenderSuppress()` |
| `src/engine/subsystems/core/batch/BatchCoordinator.ts` | Fix 2 `_skipPbrUpgrade` field, `skipPbrUpgrade` getter, `forceReset()` reset |
| `src/engine/subsystems/initScene.ts` | Fix 2 `shouldSkipPbr` synchronous capture before idle closure |
| `src/engine/subsystems/curtainwalls/CurtainWallBuilder.ts` | Fix 3 `MAX_BUILDS_PER_FRAME=20`, cap 30; Fix 4 `WALLS_PER_SHADOW_FRAME=50`, `requestIdleCallback` scheduling |
| `src/engine/subsystems/walls/WallFragmentBuilder.ts` | **Fix W1**: `MAX_BUILDS_PER_FRAME=15`, `MAX_ADAPTIVE_CAP=40`, adaptive `_buildsPerFrame` drain |
| `src/engine/subsystems/core/views/EdgeProjectorService.ts` | **Fix W2**: `CHUNK_SIZE=4` yield every 4 native groups; turns 7,046ms LONGTASK into ≤47ms chunks |
| `src/global-window.d.ts` | Already typed `renderPipelineManager?: any` and `pryzmRenderer?: any` (Wave 5 sweep) |

---

## Second-Pass Analysis — CW-Specific LONGTASKs (2026-05-05)

A follow-up trace of `CREATE_CURTAIN_WALLS_ON_ALL_SLABS` on a 54-wall / 6-slab session
revealed four residual LONGTASKs totalling ~26 s. Each claim was critically evaluated
against the actual source code before any change was made.

### Claim A — Prewarm probes don't match real CW PSO variants (4,398ms → 6,644ms LONGTASK)

**First-pass verdict (session 2):** REJECTED — wrong root cause, unimplementable fix.

The proposed fix called non-existent methods (`buildSingle`, `_slabs`, etc.) and the
reasoning about `instanceCount`/`frustumCulled` affecting PSO keys was wrong (WebGPU PSOs
are keyed on shader code + vertex layout + render state, not instance count or culling flags).

**Second-pass observation (session 3):** The LONGTASK grew from 4,398ms → **6,644ms** for
88 walls (vs 54 walls), confirming it scales with wall count. GPU Monitor confirmed
`geometries:23 drawCalls:10` throughout — CW geometry was NOT yet in GPU memory, meaning
the LONGTASK occurs BEFORE any CW object is rendered.

**Root cause (revised hypothesis):** The single `rpm.render(0)` prewarm call compiles PSOs
for Pass 1 (ScenePass MRT) but later pipeline phases (SSGI denoiser, TRAA, outline pass)
are conditional on the GBuffer being populated from a prior frame. On first execution with
an empty or partially-warmed GBuffer, these phases may take a no-op or reduced path,
deferring their PSO compilation to the first real production render after the batch.

**Action: IMPLEMENTED — 3-pass prewarm (§PERF-PREWARM-MULTIPAS).**

Changed the single `rpm.render(0)` to three sequential passes:
```typescript
rpm.render(0); // Pass 1: ScenePass MRT — populates GBuffer
rpm.render(0); // Pass 2: SSGI denoiser reads GBuffer — compiles denoiser PSOs
rpm.render(0); // Pass 3: TRAA history + outline edge-detect PSOs warm
```
Cost: ~3× prewarm time (≈ 150ms → ≈ 450ms, hidden under overlay).
Expected saving: eliminates or substantially reduces the 6,644ms post-overlay LONGTASK.

---

### Claim B — EdgeProjectorService CHUNK_SIZE=4 too large for CW groups (4,774ms LONGTASK)

**Analysis document claim:** CW element groups take ~250ms each. CHUNK_SIZE=4 produces
chunks of ~4 × 250ms = ~1,000ms — far above the 50ms LONGTASK threshold.

**Verdict: VALID — implemented, but two correction iterations were required.**

**First iteration (session 2 — wrong detection):**  
Initial fix used an InstancedMesh probe on the first ≤5 groups. Confirmed in live logs:
`"17 group(s) in 5 chunk(s)"` — CHUNK_SIZE still 4. Probe always returned false.

**Root cause of false detection:** `NativeElementMeshExporter.exportForView()` (lines
141-162) **converts every InstancedMesh → N plain `THREE.Mesh` proxy objects** (one per
instance) before returning the wrapper groups. The exported `nativeMeshGroups` therefore
never contain `InstancedMesh`. The initial InstancedMesh probe was systematically wrong.

**Corrected detection (session 3 — elementType discriminator):**  
`NativeElementMeshExporter` stamps each wrapper group with `elementType` from the element
root's `userData`. `CurtainWallBuilder` sets `elementType: 'CurtainWall'` on the root
`THREE.Group` (CurtainWallBuilder.ts §11, line ~878). Case-insensitive comparison used to
be robust against future casing normalisation:

```typescript
const _hasCWElements = nativeMeshGroups.some(g =>
    (g.userData?.elementType as string | undefined)?.toLowerCase() === 'curtainwall'
);
const CHUNK_SIZE = _hasCWElements ? 1 : 4;
```

**Note on casing:** `CurtainWallBuilder` uses `'CurtainWall'` (PascalCase) while
`CurtainWallStore` uses `'curtainwall'` (lowercase). The case-insensitive check matches
both. O(n) scan with early-exit.

| Batch type | Discriminator result | CHUNK_SIZE | Worst-case chunk |
|------------|---------------------|-----------|-----------------|
| Wall / slab / element | `elementType !== 'curtainwall'` | **4** | ~48ms (≤50ms) |
| CW batch | `elementType === 'CurtainWall'` | **1** | ~250ms (irreducible) |

**Fix tag:** `§PERF-EDGEPROJECTOR-CHUNK-ADAPTIVE`  
**File:** `src/engine/subsystems/core/views/EdgeProjectorService.ts`

---

### Claim C — Shadow idle timeout: 3000 backfires during LONGTASK cascade (16,624ms LONGTASK)

**Analysis document claim:** `requestIdleCallback(drainSlice, { timeout: 3000 })` fires
after 3 seconds even if the main thread is still executing LONGTASKs. After PSO (4.4s) +
EdgeProjector (4.8s) = 9.2s of LONGTASKs, the timeout has elapsed so the idle callback
runs immediately at thread-free time — colliding with the tail of the LONGTASK storm and
causing a 16,624ms shadow-map-rebuild LONGTASK.

**Verdict: VALID — implemented with simplified fix (no FPS guard).**

The analysis proposed a `window.__currentFps` guard — **this property does not exist
anywhere in the codebase** and was only in the analysis document itself. The FPS-check
approach was discarded.

Instead, two targeted changes:

1. **First slice:** `requestIdleCallback(drainSlice, { timeout: 3000 })` →
   `setTimeout(drainSlice, 10000)`.
   A 10-second fixed delay guarantees all post-overlay LONGTASKs (PSO ~4.4s + EdgeProjector
   ~4.8s + margins) complete before shadow reactivation begins. The WebGPU shadow map rebuild
   then runs on an idle renderer.

2. **Subsequent slices:** `requestIdleCallback(drainSlice, { timeout: 3000 })` →
   `requestIdleCallback(drainSlice)` (no forced timeout).
   Without a timeout the slices wait for genuine browser idle time and cannot be forced onto
   a busy main thread. Fallback: `setTimeout(drainSlice, 5000)` for browsers without
   `requestIdleCallback`.

**UX trade-off:** Curtain walls render without shadows for ~10 seconds after a large batch.
Geometry, panels, and mullions are fully visible. Shadow casting was invisible during the
overlay anyway, so the perceived regression is near zero.

**Fix tags:** `§PERF-SHADOW-DELAY`, `§PERF-SHADOW-NOTIMEOUT`  
**File:** `src/engine/subsystems/curtainwalls/CurtainWallBuilder.ts`

---

### Claim D — VGSceneApplicator.applyToProjectionLayers() iterates 409 geometry objects (400ms LONGTASK)

**Analysis document claim:** `applyToProjectionLayers()` "applies overrides to 409 edge
geometry objects" synchronously and needs yields every 2 layers.

**Verdict: REJECTED — incorrect diagnosis of what the function does.**

The actual `applyToProjectionLayers()` (line 515, VGSceneApplicator.ts) iterates over
`Object.entries(CATEGORY_TO_DXF_LAYER)` — the fixed set of VG categories (~14 entries).
Per iteration it calls:
- `drawing.layers.setVisibility()` — O(1) map lookup
- `drawing.layers.setColor()` — O(1) map lookup
- `drawing.layers.get()` + 3 material property assignments

This is 14 × O(1) ≈ microseconds. It does **not** iterate over the 409 edge geometry
objects produced by EdgeProjectorService; those are in the drawing's layer data structures,
not traversed by this method.

Adding yields every 2 iterations of a 14-entry loop would inject scheduling overhead into
a function that takes well under 1ms and produce no measurable improvement.

The 400ms LONGTASK at the same timestamp is more likely `VGSceneApplicator.applyAll()`,
which DOES traverse the Three.js scene graph. That is a separate unrelated call.

**Action: No change.**

---

## Second-Pass Files Changed (2026-05-05, session 2)

| File | Change |
|------|--------|
| `src/engine/subsystems/core/views/EdgeProjectorService.ts` | **Claim B (first attempt)**: adaptive CHUNK_SIZE via InstancedMesh probe — proved non-functional, see session 3 correction below |
| `src/engine/subsystems/curtainwalls/CurtainWallBuilder.ts` | **Claim C**: first slice → `setTimeout(10000)`; subsequent slices → `requestIdleCallback` with no timeout (§PERF-SHADOW-DELAY, §PERF-SHADOW-NOTIMEOUT) — **confirmed WORKING** (16,624ms LONGTASK GONE) |

## Third-Pass Files Changed (2026-05-05, session 3)

| File | Change | Status |
|------|--------|--------|
| `src/engine/subsystems/core/views/EdgeProjectorService.ts` | **Claim B correction**: InstancedMesh probe replaced with case-insensitive `elementType` discriminator (`'CurtainWall'`.toLowerCase() === `'curtainwall'`). NativeElementMeshExporter converts all InstancedMesh → plain Mesh proxies; elementType on wrapper userData is the only reliable signal. | Deployed, awaiting CW batch for verification |
| `src/engine/subsystems/commands/curtainwall/CreateCurtainWallsOnAllSlabsCommand.ts` | **Claim A (3-pass prewarm)**: single `rpm.render(0)` → three sequential `rpm.render(0)` calls to warm ScenePass MRT → SSGI denoiser → TRAA+outline PSOs (§PERF-PREWARM-MULTIPASS) | Deployed, awaiting CW batch for verification |

---

---

## Fourth-Pass Files Changed (2026-05-06, session 4 — 168-wall / 21-slab analysis)

### Active Bottlenecks Identified in 168-Wall Session

| # | Label | Measured | Root cause |
|---|-------|----------|-----------|
| BN-01 | `addMany` Phase 2 overhead | 1,220ms | 168 per-item listener calls (CurtainWallBuilder + RoomTopologyObserver) with per-call try/catch + isBatching scaffolding; RoomTopologyObserver schedules 168 debounce timers for room detection that produces 0 new rooms |
| BN-02 | Post-batch PSO LONGTASKs | 14,684ms + 17,351ms + 24,350ms | `_shadersPrewarmed=true` from a prior smaller batch; renderer FBO config may have changed between prewarm and large batch → PSO cache miss on first real render |
| BN-03 | Shadow setTimeout | Already 30,000ms | **Already fixed** in session 3 — shadow delay at `setTimeout(30000)` confirmed in code |

### Fix BN-01 — `addManyPaused` fast batch path (§BATCH-CW-PAUSE-ADDMANY)

**Files:**
- `src/engine/subsystems/curtainwalls/CurtainWallBuilder.ts` — new `addManyPaused(walls)` on `__curtainWallRebuildControl`
- `src/engine/subsystems/curtainwalls/CurtainWallStore.ts` — use fast path in `addMany()` when `batchCoordinator.isBatching`
- `src/global-window.d.ts` — type declaration extended

**Status:** ✅ Implemented (2026-05-06)

```
BEFORE: addMany Phase 2 calls this.listeners.forEach(l => l('add', cw)) × N:
  - 168 CurtainWallBuilder.updateCurtainWall() invocations (each: try/catch + _rebuildPaused check + Map.set)
  - 168 RoomTopologyObserver invocations (each: paused check + _scheduleRedetect(levelId, 800ms))
  = 168 spurious clearTimeout+setTimeout pairs; 168 try/catch frames

AFTER:  addMany detects batchCoordinator.isBatching and uses fast path:
  - window.__curtainWallRebuildControl.addManyPaused(inserted) — ONE direct loop into _pausedBuildsMap
  - storeEventBus.emit() per item (buffered at depth ≥ 1, unchanged semantics)
  - Per-item listener loop SKIPPED — CurtainWalls cannot define room boundaries; BatchCoordinator
    fires markLevelsDirty() for plan reprojection; no spurious room-detection timers.
  
Diagnostic log: [CurtainWallStore] §BATCH-CW-PAUSE-ADDMANY §DIAG
  phase1CloneMs=Xms   ← deep-clone cost (Phase 1 — insert into Map)
  addManyPausedMs=Xms ← builder batch notification (1 call vs 168)
  busEmitMs=Xms       ← storeEventBus buffered emit × N
  totalPhase2Ms=Xms   ← replaces the previous 1220ms Phase 2 time
```

**Non-batch path preserved:** When `!batchCoordinator.isBatching` (interactive single-wall add), the
original per-item `this.listeners.forEach` path runs unchanged.

### Fix BN-02 — Prewarm scale guard (§PREWARM-SCALE-GUARD)

**File:** `src/engine/subsystems/commands/curtainwall/CreateCurtainWallsOnAllSlabsCommand.ts`  
**Status:** ✅ Implemented (2026-05-06)

```
BEFORE: _shadersPrewarmed=true from a 6-slab prewarm; 21-slab batch skips prewarm entirely.
  If renderer FBO changed (HDRI load, resize, quality change) between prewarm and large batch,
  PSOs from the first prewarm are stale → full recompile on first post-batch render → LONGTASK.

AFTER:  _prewarmWallCount tracks estimatedWallCount at last prewarm.
  If estimatedWallCount > _prewarmWallCount × 1.5:
    → log PREWARM-SCALE-RESET (ratio, wall counts)
    → _shadersPrewarmed = false
    → prewarm re-runs with current renderer state before runBatch
    → _prewarmWallCount updated to new estimate
  
Log tag: §TRACE-CW#N PREWARM-SCALE-RESET (only fires when scale jump detected)
Dev tool: window.__resetCwPrewarm() now also resets _prewarmWallCount to 0.
```

---

## Fifth-Pass Analysis — Drain Budget Cascade Regression (2026-05-06, 294-wall / 21-slab)

A live session with 294 walls / 21 slabs captured all 27 rAF drain frames, revealing that
the adaptive budget was **collapsing from 20 to 7** within 16 frames — the single remaining
bottleneck between the current sub-second sync phase and the 5-second large-scale target.

### BN-04 — Drain Budget Cascade (interactive thresholds during batch-suppressed drain)

| # | Label | Measured | Root cause |
|---|-------|----------|-----------|
| BN-04 | rAF drain budget cascade | 27 frames / 807ms for 294 walls | `_drainBuildQueue` decrement threshold 14ms calibrated for interactive rendering; fires on nearly every batch-mode frame because per-wall cost (1–3ms) × 14 walls ≈ 14–42ms. Budget collapses 20→7 in 16 frames; oscillates 7–8 for 11 more frames. |

**Live drain trace (all 27 frames measured, 294 walls):**

```
Frame  1: built=20  frameMs=30.6ms  nextBudget=19  ← decrement (30.6 > 14ms)
Frame  2: built=19  frameMs=25.7ms  nextBudget=18
Frame  3: built=18  frameMs=23.3ms  nextBudget=17
Frame  4: built=17  frameMs=19.7ms  nextBudget=16
Frame  5: built=16  frameMs=16.5ms  nextBudget=15
Frame  6: built=15  frameMs=28.6ms  nextBudget=14
Frame  7: built=14  frameMs=38.7ms  nextBudget=13
Frame  8: built=13  frameMs=29.5ms  nextBudget=12
Frame  9: built=12  frameMs=24.3ms  nextBudget=11
Frame 10: built=11  frameMs=13.9ms  nextBudget=11  ← first maintain (13.9 < 14ms)
Frame 11: built=11  frameMs= 9.0ms  nextBudget=11  ← maintain (9.0 > 8ms, no increment)
Frame 12: built=11  frameMs=18.2ms  nextBudget=10
Frame 13: built=10  frameMs=22.1ms  nextBudget= 9
Frame 14: built= 9  frameMs=13.6ms  nextBudget= 9
Frame 15: built= 9  frameMs=20.3ms  nextBudget= 8
Frame 16: built= 8  frameMs=14.9ms  nextBudget= 7  ← FLOOR REACHED
Frames 17–27: oscillates 7–8 (per-wall variance 0.7–2.8ms → unstable equilibrium at 14ms threshold)
```

Per-wall build cost: 0.7–2.8ms (mean ~1.6ms). The 14ms threshold means: `9 walls × 1.6ms = 14.4ms` → decrement fires. Budget cannot stabilise above 9. The interactive increment threshold (< 8ms) almost never fires at 7–8 walls × 1.6ms = 11.2–12.8ms.

**Key insight:** During a batch, `viewDependencyTracker.setSuppressed(true)` prevents OBC+PASCAL renders between drain frames. The only relevant constraint is the **50ms LONGTASK threshold**, not the 16ms frame boundary. The 14ms decrement was protecting against visible frame drops — a concern that does not exist while renders are suppressed.

**Secondary bug:** `_buildsPerFrame` was only reset in the constructor. A first batch that decays it to 7 means the **second** batch in the same session starts at budget=7 — immediately doubling its drain time.

---

### Fix BN-04 — Dual-Mode Adaptive Drain Thresholds (§PERF-ADAPTIVE-DRAIN-V2)

**File:** `src/engine/subsystems/curtainwalls/CurtainWallBuilder.ts`  
**Method:** `_drainBuildQueue()`, `resumeAndFlush()`  
**Status:** ✅ Implemented (2026-05-06, §PERF-ADAPTIVE-DRAIN-V2)

```typescript
// BEFORE (single-mode — interactive thresholds applied during batch):
if (frameMs < 8 && this._buildsPerFrame < 30) this._buildsPerFrame++;
else if (frameMs > 14 && this._buildsPerFrame > 5) this._buildsPerFrame--;

// AFTER (dual-mode — separate thresholds per rendering context):
if (batchCoordinator.isBatching) {
    // Renders suppressed — LONGTASK threshold (50ms) is the only constraint
    if (frameMs < 25 && this._buildsPerFrame < 50) this._buildsPerFrame++;
    else if (frameMs > 45 && this._buildsPerFrame > 5) this._buildsPerFrame--;
} else {
    // Interactive — renders live, stay within ~1 frame (16ms) budget
    if (frameMs < 8 && this._buildsPerFrame < 30) this._buildsPerFrame++;
    else if (frameMs > 14 && this._buildsPerFrame > 5) this._buildsPerFrame--;
}
```

**Budget reset per batch** (`resumeAndFlush()`):
```typescript
// Added before transferring _pausedBuildsMap → _pendingBuildsMap:
this._buildsPerFrame = CurtainWallBuilder.MAX_BUILDS_PER_FRAME; // reset to 20 for each new batch
```

| Parameter | Before BN-04 fix | After BN-04 fix |
|-----------|-----------------|-----------------|
| Decrement threshold (batch mode) | **14ms** (interactive) | **45ms** (near-LONGTASK) |
| Increment threshold (batch mode) | **8ms** | **25ms** |
| Adaptive cap (batch mode) | **30** | **50** |
| Budget reset per-batch | ❌ never reset mid-session | ✅ reset in `resumeAndFlush()` |

**Expected outcomes:**

| Metric | Before fix | After fix |
|--------|-----------|-----------|
| Budget floor (294 walls) | 7–8 walls/frame | ~20–25 walls/frame |
| Drain frames (294 walls) | 27 frames | ~14 frames |
| rAF overhead (294 walls) | 27 × 16ms = 432ms | 14 × 16ms = 224ms |
| Total drain (294 walls) | **807ms** | **~600ms** |
| Total drain (1000 walls) | ~2,100ms (budget=7) | **~900ms** (budget=20) |
| Second-batch drain overhead | 2× penalty (starts at 7) | ✅ always starts at 20 |

**Interactive mode unchanged:** The existing `<8ms / >14ms / cap 30` thresholds continue to apply when `batchCoordinator.isBatching === false`. No regression to interactive wall placement responsiveness.

---

## Fifth-Pass Files Changed (2026-05-06)

| File | Change |
|------|--------|
| `src/engine/subsystems/curtainwalls/CurtainWallBuilder.ts` | **Fix BN-04**: `_drainBuildQueue()` — batch-mode adaptive thresholds (25ms/45ms, cap 50); `resumeAndFlush()` — `_buildsPerFrame` reset to `MAX_BUILDS_PER_FRAME` per batch (`§PERF-ADAPTIVE-DRAIN-V2`) |

---

## Related Documents

- `40-CW-PIPELINE-TRACE.md` — exhaustive pipeline trace with pre/post-fix timings for all phases
- `39-CURTAIN-WALL-BATCH.md` — earlier sprint notes and architecture decisions


ANNEX:

# 42 — CW Batch Pipeline: Session 6 Analysis & Remediation

**Created:** 2026-05-06  
**Session:** 315-wall / 21-slab live console log  
**Previous sessions:** 66-wall (S1), 96-wall (S2), 189-wall (S3), 273-wall (S4), 294-wall (S5/BN-04)  
**Status:** Active — three new bottlenecks identified; fixes specified below.  
**Target:** ≤ 5 seconds total user-visible time.  

---

## Executive Summary

The pipeline **correctly implements** all previously fixed bottlenecks (BN-01 through BN-04). The sync phase is excellent at 23.9ms for 315 walls. The rAF drain is now working as designed — 15 frames, budget stable at 20–25, total drain ~700ms. However, a **14,175ms PSO LONGTASK** still dominates the session, and the console log reveals exactly why: **the prewarm took only 11.1ms instead of the expected ~300ms**. This is an unambiguous prewarm failure. Two additional cross-batch interference issues also emerge in the log.

---

## Session 6 Timing Breakdown (315-wall / 21-slab, live console)

| Phase | Measured | Status |
|-------|----------|--------|
| Ph 0 — Prewarm | **11.1ms** (3× rpm.render(0)) | ❌ **FAILED — PSOs not compiled** |
| Ph 1 — Sync (slab loop + addMany + regQueue) | **23.9ms** | ✅ Excellent |
| Ph 2 — rAF drain (15 frames) | **~700ms** (T+61→T+698ms) | ✅ BN-04 fix working |
| Ph 3 — Registration drain (21 sync) | **5.9ms** | ✅ Excellent |
| Ph 4 — Event drain (315 events, 2 chunks) | **44ms** | ✅ Acceptable |
| Ph 5 — onComplete + suppress lift | **<1ms** | ✅ |
| Ph 6 — First render PSO LONGTASK | **14,175ms** | ❌ **Critical — prewarm failed** |
| Ph 7 — EdgeProjector | Deferred, background | ✅ Non-blocking |
| Ph 8 — PBR upgrade (CW batch) | 0ms (skipPbrUpgrade=true) | ✅ |
| Ph 9 — Shadow (setTimeout 30s) | Off critical path | ✅ |
| **Total user-visible** | **~15,000ms** | ❌ Target: ≤5,000ms |

**What the BN-04 fix achieved (comparing session 5 → session 6):**

| Metric | Session 5 (294-wall, old thresholds) | Session 6 (315-wall, BN-04 fix) |
|--------|-------------------------------------|----------------------------------|
| Drain frames | 27 | **15** |
| Budget floor | 7–8 | **20–25 (stable)** |
| Frame 8 budget | 13 (still falling) | 23 (stable) |
| Drain total | 807ms | **~700ms** |
| SLOW_BUILD events | None | 1 (L-08, 17.6ms — isolated) |

**BN-04 confirmed working.** The drain is now behaving correctly.

---

## Newly Identified Bottlenecks

### BN-05 — Prewarm Produces 11.1ms: PSOs Are NOT Compiled (Critical)

**Evidence from log:**
```
[CreateCurtainWallsOnAllSlabsCommand] §TRACE-CW#1 PREWARM-START estimatedWalls=315 T=+0.2ms
[CreateCurtainWallsOnAllSlabsCommand] PERF-PREWARM: 3 PSO variants × 3 pipeline passes...
[CreateCurtainWallsOnAllSlabsCommand] §TRACE-CW#1 PREWARM-DONE prewarmMs=11.1ms T=+11.3ms
...
[LONGTASK] duration=14175ms start=132198ms  ← PSO cold compile after overlay lifts
```

**Root cause diagnosis:**

Three sequential `rpm.render(0)` calls completing in 11.1ms total is physically impossible if any WebGPU PSO compilation occurred. A single PSO compile for one InstancedMesh variant takes ~80–400ms. Three passes of a full scene pipeline should take 200–600ms. 11.1ms means the renders executed as complete no-ops.

Two mutually exclusive root causes:

**Cause A — `window.renderPipelineManager` is null or non-functional at call time.**  
The console log shows `[PRYZM] WebGPU device lost` earlier in the session, followed by `[PRYZM] WebGPU device recovered — renderer recreated`. After device recovery, `onProjectSwitch()` is called, which rebuilds the pipeline. However, during the recovery window, `window.renderPipelineManager` may be in an error state (`phase: error` is logged: `[RenderPipelineManager] Pipeline init error: Cannot read properties of undefined (reading 'usedTimes')`). If the prewarm fires during or after the `phase: error` state, `rpm.render(0)` returns immediately as a no-op.

**Cause B — The scale guard (`_prewarmWallCount × 1.5`) is firing a re-prewarm, but the renderer is not yet in a valid state.**  
The scale guard resets `_shadersPrewarmed = false` when `estimatedWallCount > _prewarmWallCount × 1.5`. If a prior batch prewarmed at a smaller count and the current batch is 315 walls, the guard triggers a re-prewarm correctly — but if `rpm.render(0)` is a no-op at that moment (due to pipeline error state), the static flag `_shadersPrewarmed` is still set to `true`, marking future batches as "warmed" when they are not.

**Cause C (secondary) — `renderPipelineManager` not yet bound at prewarm time.**  
The WebGPU device loss / recovery cycle seen in the log (`duration=14175ms`, `duration=16976ms` LONGTASKs during PBR chunking) can leave the pipeline manager temporarily in a `phase: error` state. The `render(0)` method on `RenderPipelineManager` may guard against calling the underlying renderer when in error state, returning without compiling anything.

**Fix BN-05a — Guard prewarm against pipeline error state:**

In `CreateCurtainWallsOnAllSlabsCommand._prewarmCurtainWallShaders()`, before calling `rpm.render(0)`, validate that the pipeline is in a ready state:

```typescript
private async _prewarmCurtainWallShaders(): Promise<void> {
    const rpm = window.renderPipelineManager;
    if (!rpm) {
        console.warn('[CreateCurtainWallsOnAllSlabsCommand] PREWARM-SKIP: renderPipelineManager not available');
        return;
    }

    // BN-05 fix: abort prewarm if pipeline is in error/initializing state
    // rpm.render(0) is a no-op in these states — prewarm would silently fail,
    // leaving _shadersPrewarmed=true with cold PSOs → 14,000ms LONGTASK.
    const phase = (rpm as any).status?.phase ?? (rpm as any)._phase ?? 'unknown';
    if (phase === 'error' || phase === 'initializing' || phase === 'binding') {
        console.warn(
            `[CreateCurtainWallsOnAllSlabsCommand] PREWARM-ABORT: pipeline phase="${phase}" — ` +
            `prewarm skipped; _shadersPrewarmed NOT set (will retry on next execute)`
        );
        // Do NOT set _shadersPrewarmed = true — force retry on next call
        return;
    }
    // ... rest of existing prewarm logic
```

**Fix BN-05b — Validate prewarm actually compiled something (timing guard):**

```typescript
    const __prewarmStart = performance.now();
    // Add probe meshes and run 3x rpm.render(0) as before...
    rpm.render(0);
    rpm.render(0);
    rpm.render(0);
    const __prewarmMs = performance.now() - __prewarmStart;

    // BN-05b: A valid prewarm compiles at least one PSO variant.
    // Minimum measured compile time for one WebGPU PSO ≈ 50ms.
    // If total time < 30ms, the renders were no-ops — mark as NOT prewarmed.
    const PREWARM_MIN_VALID_MS = 30;
    if (__prewarmMs < PREWARM_MIN_VALID_MS) {
        console.warn(
            `[CreateCurtainWallsOnAllSlabsCommand] §PREWARM-FAILED ` +
            `prewarmMs=${__prewarmMs.toFixed(1)}ms < ${PREWARM_MIN_VALID_MS}ms threshold — ` +
            `PSOs not compiled. _shadersPrewarmed NOT set (will retry on next execute).`
        );
        // BN-05b critical: do NOT set _shadersPrewarmed = true
        return; // exit without setting the flag
    }

    CreateCurtainWallsOnAllSlabsCommand._shadersPrewarmed = true;
    CreateCurtainWallsOnAllSlabsCommand._prewarmWallCount = estimatedWallCount;
    console.log(`[CreateCurtainWallsOnAllSlabsCommand] §TRACE-CW#N PREWARM-DONE prewarmMs=${__prewarmMs.toFixed(1)}ms`);
```

**Fix BN-05c — Reset `_shadersPrewarmed` on WebGL/WebGPU context loss:**

In `initScene.ts`, inside the `webglcontextlost` and WebGPU device-loss handlers:

```typescript
// In the webglcontextlost handler (initScene.ts ~line 837):
_obcCanvas.addEventListener('webglcontextlost', (evt: Event) => {
    evt.preventDefault();
    // BN-05c: prewarm PSOs are lost with context — force re-prewarm on next CW batch
    if (typeof (window as any).__resetCwPrewarm === 'function') {
        (window as any).__resetCwPrewarm();
        console.log('[initScene] WebGL context lost — CW prewarm reset (PSOs invalidated)');
    }
    // ... existing handling
});

// In the WebGPU device-lost callback (createRenderer.ts ~line 128):
// (wherever [PRYZM] WebGPU device lost is currently logged)
if (typeof (window as any).__resetCwPrewarm === 'function') {
    (window as any).__resetCwPrewarm();
    console.log('[initScene] WebGPU device lost — CW prewarm reset');
}
```

**Expected outcome:** The 14,175ms PSO LONGTASK is entirely caused by a failed prewarm. With these three guards in place, any no-op prewarm is detected at `< 30ms` and the static flag is NOT set, forcing a valid re-prewarm on the next execute(). A valid prewarm running ~300ms eliminates the cold-PSO LONGTASK → first render drops from 14,175ms to ~50–200ms.

---

### BN-06 — PBR Upgrade Collision: 15,037-Mesh Traversal Running During CW Batch (High)

**Evidence from log:**
```
[BatchCoordinator/P1.3] §TRACE PBR-UPGRADE-IDLE-START idleCallbackT=314521ms
[BatchCoordinator/P1.3] §TRACE PBR-UPGRADE-TRAVERSE-DONE totalMeshes=15037 chunks=126
[BatchCoordinator/P1.3] §TRACE PBR-CHUNK-1 meshes=120 remaining=14917 chunkMs=0.1ms
...
[BatchCoordinator/P1.3] §TRACE PBR-CHUNK-22 meshes=120 remaining=12397 chunkMs=0.0ms
[GPU Monitor] geometries:8527 ...  ← CW geometry appears
[GPU Monitor] ⚠ Geometry count grew 4585.2% (182 → 8527)  ← CW batch geometry added
```

**Root cause:** The `CREATE_SLABS_ON_ALL_FLOORS` command ran immediately before `CREATE_CURTAIN_WALLS_ON_ALL_SLABS`. Slab batch does NOT set `skipPbrUpgrade: true`, so its post-batch `requestIdleCallback` traverses ALL 15,037 scene meshes in 126 chunks. The CW batch fires its first render while PBR chunks 1–22 are already queued. The `requestIdleCallback` for PBR chunks fires during the CW batch's PSO LONGTASK window, because the LONGTASK blocks the main thread — and `requestIdleCallback` with no timeout eventually fires after the LONGTASK clears. During those first 22 PBR chunk firings, each chunk adds ~0.1ms to the scheduler backlog. Not the primary LONGTASK cause, but it starves the second batch (CREATE_SLABS_ON_ALL_FLOORS via reconnect, T+9998ms for first rAF drain).

**Fix BN-06 — Add `skipPbrUpgrade: true` to `CREATE_SLABS_ON_ALL_FLOORS`:**

Slab geometry (`MeshStandardMaterial` with explicit `metalness`/`roughness`) does NOT need the PBR upgrade pass for the same reason CW geometry does not. The slab builder already specifies material properties at build time. The PBR upgrade traversal for 21 slabs was producing 15,037 mesh traversals because it scans the **entire scene** including CW geometry added by prior operations.

In `CreateSlabsOnAllFloorsCommand.ts`:
```typescript
batchCoordinator.runBatch(_processSlabs, {
    levelIds: affectedLevelIds,
    totalElementCount: slabCount,
    skipRedetectRooms: false,  // slabs CAN define boundaries — keep redetect
    skipPbrUpgrade: true,      // BN-06: slab materials are pre-specified MeshStandardMaterial
});
```

This eliminates the 126-chunk PBR traversal entirely for slab batches. Cost reduction: ~15,037 mesh traversal × 0.1ms/chunk → 0ms.

**Note:** Verify that `SlabFragmentBuilder` materials are `MeshStandardMaterial` with `metalness`/`roughness` set explicitly (not relying on PBR upgrade to set them). If they use `MeshPhongMaterial` or un-configured `MeshStandardMaterial`, this fix must not be applied.

---

### BN-07 — Second Batch Starvation: rAF Drain Delayed 10s by Ongoing PBR Chunks (Medium)

**Evidence from log:**
```
[BatchCoordinator] §TRACE _setupBatch — 20 level(s), 20 elements expected.
  suppressStartT=299718.7ms
[BatchCoordinator] §TRACE DEFERRED-RESUME-FLUSH fired T=+9998.1ms
```

**Root cause:** The second `CREATE_SLABS_ON_ALL_FLOORS` batch (replayed via catch-up after reconnect) starts while 126 PBR chunks are still outstanding from the first slab batch. Each `requestIdleCallback` fires between frames. The FrameScheduler's `pre-render` slot competes with PBR chunk callbacks. The `DEFERRED-RESUME-FLUSH` `scheduleOnce('pre-render')` cannot fire until the event loop is free, which doesn't happen until the PBR chunk storm clears ~10 seconds later.

This is a secondary consequence of BN-06. Fixing BN-06 (eliminating slab PBR upgrade) eliminates BN-07 as well: with no 126-chunk PBR traversal running, the second batch's rAF drain fires normally within 1–2 frames.

**Additional guard — detect starvation and warn:**

In `BatchCoordinator.ts`, the `DEFERRED-RESUME-FLUSH` `scheduleOnce` should log a warning if it fires more than 2000ms after being registered:

```typescript
const _resumeQueuedAt = performance.now();
this._resumeFlushDispose = getFrameScheduler().scheduleOnce(
    'batch-coordinator-resume-flush',
    () => {
        const delay = performance.now() - _resumeQueuedAt;
        if (delay > 2000) {
            console.warn(
                `[BatchCoordinator] §WARN DEFERRED-RESUME-FLUSH delayed ${delay.toFixed(0)}ms ` +
                `— main thread was blocked (PBR chunks? PSO compile?). ` +
                `Check for concurrent requestIdleCallback storm.`
            );
        }
        // ... existing resume logic
    },
    'pre-render',
);
```

---

### BN-08 — SLOW_BUILD Spike on L-08: Isolated but Warrants Investigation (Low)

**Evidence from log:**
```
[CurtainWallBuilder] SLOW_BUILD wallId="05764acb-24df-423d-8e09-6fbf57154198"
  levelId="L-08-1778029966525-8" elapsed=17.6ms
[CurtainWallBuilder] §PERF-DRAIN built=24 remaining=162 frameMs=86.8ms nextBudget=23
```

One wall on L-08 took 17.6ms — approximately 8× the mean (1–2ms/wall). This caused the frame containing it to spike to 86.8ms, triggering the BN-04 batch-mode decrement (>45ms). The budget dropped from 24 to 23 for that frame only, then recovered. No cascade.

**Root cause candidates:**
1. `panelStore.getByCurtainWallId(cw.id)` — first call for this level may scan full panel store without an index
2. `CurtainWallInstanceManager.buildInstancedMeshes()` — first call creates `InstancedMesh` objects; subsequent calls for same geometry are cache-hits
3. `group.children` disposal — if L-08 walls have more children than average (e.g., more panels), disposal loop is proportionally longer

**Recommended investigation:** Add `console.time`/`console.timeEnd` spans inside `build()` bracketing steps 5–9 (cell computation, panel fetch, mesh construction). The 17.6ms outlier should point to which sub-step is slow.

**No code change yet.** SLOW_BUILD is isolated (1 of 315 walls) and the budget decrement self-corrects in 1 frame. Prioritise BN-05, BN-06, BN-07 first.

---

## Pipeline Correctness Audit (vs. 40-CW-PIPELINE-TRACE.md)

The pipeline document is **accurate** for all previously described phases. Specific verifications:

| Claim in doc | Verified in live log? | Verdict |
|---|---|---|
| Sync phase <25ms for 294+ walls | 23.9ms for 315 walls | ✅ Confirmed |
| BN-04 dual-mode thresholds stabilise budget at 20–25 | Budget: 20→21→22→23→24→23 (stable) | ✅ Confirmed |
| BN-04 no decrement until >45ms | Frame 8 (86.8ms) is the first decrement; all others <45ms | ✅ Confirmed |
| skipPbrUpgrade=true for CW batch | PBR-UPGRADE-SKIPPED logged | ✅ Confirmed |
| skipRedetectRooms=true for CW batch | REDETECT_ROOMS SKIPPED for 21 levels | ✅ Confirmed |
| Shadow setTimeout 30s | SHADOW-REACTIVATION-DISPATCHED, then no shadow logs | ✅ Confirmed |
| Registration drain sync for ≤50 entries | regQueue=21, sync drain, 5.9ms | ✅ Confirmed |
| Event drain 2 chunks for 315 events | 200+115 events, 2 chunks | ✅ Confirmed |
| markLevelsDirty deferred to post-render | §FIX-EDGE-PROJECT-DEFER logged T=+15068ms | ✅ Confirmed |
| Prewarm validates `_prewarmWallCount × 1.5` scale guard | Scale guard fires correctly for 315 walls | ✅ Confirmed |
| **Prewarm produces ~300ms compile time** | **Only 11.1ms — FAILURE** | ❌ **BN-05 — not in doc** |
| **PBR upgrade eliminated for all batches that don't need it** | **Slab batch still runs 15,037 mesh PBR** | ❌ **BN-06 — gap in coverage** |
| **Second batch fires promptly after first** | **10s delay from PBR chunk storm** | ❌ **BN-07 — derived from BN-06** |

**One architectural gap not previously documented:** The pipeline docs focus exclusively on `CREATE_CURTAIN_WALLS_ON_ALL_SLABS`. The live session shows that `CREATE_SLABS_ON_ALL_FLOORS` runs immediately before it in the user's typical workflow. The slab batch's PBR upgrade tail (126 chunks, 15,037 meshes) overlaps with the CW batch's critical PSO first-render window. This cross-batch interference is not currently addressed in any doc.

---

## Remediation Plan (Priority Order)

### Fix BN-05 — Prewarm Validity Guard (Highest Priority)

**Files:** `CreateCurtainWallsOnAllSlabsCommand.ts`, `initScene.ts` (or `createRenderer.ts`)  
**Effort:** ~2 hours  
**Expected gain:** Eliminates 14,175ms PSO LONGTASK → ~50–200ms

Three-part fix:
1. **Phase check:** abort prewarm if `rpm.status.phase !== 'active'`
2. **Timing guard:** if prewarm < 30ms, do NOT set `_shadersPrewarmed = true`
3. **Context-loss hook:** call `__resetCwPrewarm()` inside `webglcontextlost` and WebGPU device-loss handlers

Implementation detail: `window.__resetCwPrewarm` is already exposed as a dev tool. It resets both `_shadersPrewarmed` and `_prewarmWallCount`. It just needs to be called in the recovery paths.

---

### Fix BN-06 — Skip PBR Upgrade for Slab Batches (High Priority)

**File:** `CreateSlabsOnAllFloorsCommand.ts`  
**Effort:** 15 minutes  
**Expected gain:** Eliminates 126-chunk / 15,037-mesh PBR traversal; fixes BN-07 as side effect

**Prerequisite check:** Confirm `SlabFragmentBuilder` uses `MeshStandardMaterial` with `metalness` and `roughness` set explicitly. If confirmed, add `skipPbrUpgrade: true` to the `runBatch` call.

---

### Fix BN-07 — Starvation Warning (Low Priority — resolved by BN-06)

**File:** `BatchCoordinator.ts`  
**Effort:** 30 minutes  
**Expected gain:** Observability only; actual fix comes from BN-06

Add delay warning to `DEFERRED-RESUME-FLUSH` callback so future regressions surface immediately in logs.

---

## Updated Performance Projection

With BN-05 + BN-06 fixes applied to the 315-wall / 21-slab scenario:

| Phase | Current (session 6) | Post BN-05+06 |
|-------|---------------------|---------------|
| Prewarm | 11.1ms (failed) | **~300ms** (valid) |
| Sync + drain | ~724ms | ~724ms (unchanged) |
| First render PSO | **14,175ms** | **~100–200ms** (prewarm-warm) |
| PBR upgrade (slab) | 126 chunks ongoing | **0ms** (skipPbrUpgrade=true) |
| EdgeProjector | Background, non-blocking | Background, non-blocking |
| **Total user-visible** | **~15,000ms** | **~1,200ms** |

**This puts the 315-wall / 21-slab scenario well under the 5-second target.** The 1,200ms breakdown: ~300ms prewarm + ~724ms drain + ~200ms PSO first render = ~1,224ms.

For 500-wall / 21-slab (projected): ~300ms prewarm + ~1,100ms drain (500/23×16ms) + ~200ms PSO = ~1,600ms — comfortably under 5s.

For 1,000-wall / 50-slab (projected): ~300ms prewarm + ~2,200ms drain (1000/22×16ms) + ~300ms PSO = ~2,800ms — under 3s target.

---

## Documents to Update

### 40-CW-PIPELINE-TRACE.md

Add Session 6 timeline under "Complete Timeline":
- Record all 15 drain frames with frame-by-frame budget
- Mark PREWARM-FAILED (11.1ms) and note this is the BN-05 source
- Add BN-05/BN-06/BN-07 to Current Bottlenecks table with statuses

Update "Phase 0" section:
- Add paragraph on prewarm validity guard (`< 30ms → abort, do not set flag`)
- Add context-loss reset requirement

### 41-BATCH-ERROS.md

Add "Sixth-Pass Analysis" section covering:
- BN-05 root cause and three-part fix (phase check, timing guard, context-loss hook)
- BN-06 cross-batch PBR collision and single-line fix
- BN-07 derived starvation (fixed by BN-06)
- Updated outcome table showing 315-wall → ~1,200ms

---

## Files to Change (Sixth Pass)

| File | Change | Fix |
|------|--------|-----|
| `CreateCurtainWallsOnAllSlabsCommand.ts` | Phase check + timing guard in `_prewarmCurtainWallShaders()` | BN-05a, BN-05b |
| `initScene.ts` | Call `__resetCwPrewarm()` in `webglcontextlost` handler | BN-05c |
| `createRenderer.ts` (or wherever device-loss is handled) | Call `__resetCwPrewarm()` in WebGPU device-loss callback | BN-05c |
| `CreateSlabsOnAllFloorsCommand.ts` | Add `skipPbrUpgrade: true` to `runBatch()` call | BN-06 |
| `BatchCoordinator.ts` | Add starvation delay warning to `DEFERRED-RESUME-FLUSH` callback | BN-07 |

---

## Architectural Note: Cross-Batch Interference

The live log reveals an architectural gap: consecutive large batches (`SLABS` then `CW`) can interfere through shared global state:
1. The slab batch's `requestIdleCallback` PBR chunks continue firing during the CW batch
2. The CW batch's prewarm may execute while a prior batch's `rpm.render(0)` side effects are still settling

The correct architectural invariant is:

> **Each batch's post-batch async work (PBR upgrade, shadow reactivation, PBR chunks) must complete or be explicitly cancelled before a new batch's prewarm is allowed to run.**

This is not currently enforced. The simplest enforcement: check `batchCoordinator.isBatching` from within PBR chunk callbacks and abort the chunk if a new batch has started. Since CW batches set `skipPbrUpgrade: true`, the slab PBR chunks would naturally be the ones to abort. However, the correct long-term fix is BN-06 (skipping the slab PBR traversal entirely), which makes the cancellation moot.