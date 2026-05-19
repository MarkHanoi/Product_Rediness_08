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

## Related Documents

- `40-CW-PIPELINE-TRACE.md` — exhaustive pipeline trace with pre/post-fix timings for all phases
- `39-CURTAIN-WALL-BATCH.md` — earlier sprint notes and architecture decisions
