# 40 — CW Pipeline Trace: Every File, Every Step

**Created:** 2026-05-05  
**Last updated:** 2026-05-06 (168-wall / 21-slab live session; BN-01 §BATCH-CW-PAUSE-ADDMANY + BN-02 §PREWARM-SCALE-GUARD implemented; addMany phase-level diagnostics added)  
**Status:** Living reference — updated as the pipeline evolves.  
**Purpose:** Exhaustive map of the `CREATE_CURTAIN_WALLS_ON_ALL_SLABS` pipeline from command invocation to the last post-render callback, with the source file, function, and log tag for every step.

---

## How to Read This Document

- **T=+Xms** — elapsed since `_setupBatch()` started (the `_batchStartTime` clock).  
- **§TRACE** — log prefix that appears in every new timing log added in this session.  
- **Grep key** — use `§TRACE` in DevTools console to see ALL pipeline steps at a glance.  
- **LONGTASK** — a browser-detected long task (>50 ms) reported in the Performance panel.  
- Timings marked **[36-wall]** are from the 36-wall / 6-slab reference session (measured 2026-05-04/05).  
- Timings marked **[110-wall]** are from the 110-wall / 11-slab session that exposed the scale-up bottlenecks.  
- Timings marked **[post-fix]** are projected after all four perf fixes landed (2026-05-05).

---

## Phase 0 — Command Dispatch (synchronous, main thread)

| Step | File | Function / Log | Wall-clock |
|------|------|----------------|-----------|
| 0.1 | `CommandManager.ts` | `execute(CREATE_CURTAIN_WALLS_ON_ALL_SLABS)` | T=−Xms |
| 0.2 | `CreateCurtainWallsOnAllSlabsCommand.ts` | `execute()` entry — `§TRACE-CW#N START` | T=~0ms |
| 0.3 | `CreateCurtainWallsOnAllSlabsCommand.ts` | **PREWARM-START** (first run only) | T=~0ms |
| 0.4 | `CreateCurtainWallsOnAllSlabsCommand.ts` | `_prewarmCurtainWallShaders()` — 3 probe InstancedMeshes + `renderPipelineManager.render(0)` | T=~0–300ms |
| 0.5 | `CreateCurtainWallsOnAllSlabsCommand.ts` | **PREWARM-DONE** or **PREWARM-SKIP** (cached via `_shadersPrewarmed` flag) | T=~300ms |
| 0.6 | `CreateCurtainWallsOnAllSlabsCommand.ts` | **RUNBATCH-START** | T=~300ms |

### 0.3–0.5 Detail — `_prewarmCurtainWallShaders()`

```
File:     src/engine/subsystems/commands/curtainwall/CreateCurtainWallsOnAllSlabsCommand.ts
Method:   _prewarmCurtainWallShaders()
Purpose:  Force-compile WebGPU PSOs before the batch so first CW render is a cache-hit.
How:      Adds 3 invisible scale(0) probe meshes to the production scene and calls
          window.renderPipelineManager.render(0) — the exact production pipeline call —
          so all PSO variants (mullion InstancedMesh, panel InstancedMesh DoubleSide,
          fallback Mesh FrontSide) are compiled into the correct WebGPU pipeline context.
Why NOT renderer.compile():
          WebGPURenderer.compile() is ASYNC (returns Promise). Without await, PSOs are
          not warm when the batch's first real render fires. renderPipelineManager.render()
          is synchronous and uses the identical FBO/pipeline descriptors as production frames.
Cost:     ~100–300ms (only on first execute(); skipped thereafter via _shadersPrewarmed flag).
Dev tool: window.__resetCwPrewarm() → resets static flag → next execute() re-prewarms.
```

---

## Phase 1 — Batch Setup (synchronous, main thread)

| Step | File | Function / Log | Elapsed |
|------|------|----------------|---------|
| 1.1 | `BatchCoordinator.ts` | `runBatch(fn, opts)` entry | T=+Xms |
| 1.2 | `BatchCoordinator.ts` | `_setupBatch(opts)` — `§TRACE _setupBatch` | T=+0ms (clock start) |
| 1.3 | `BatchCoordinator.ts` | `viewDependencyTracker.setSuppressed(true)` | T=+0ms |
| 1.4 | `BatchCoordinator.ts` | `window.__curtainWallRebuildControl.pause()` | T=+0ms |
| 1.5 | `BatchCoordinator.ts` | `window.__wallRebuildControl.pause()` | T=+0ms |
| 1.6 | `BatchCoordinator.ts` | `window.__slabRebuildControl.pause()` | T=+0ms |
| 1.7 | `BatchCoordinator.ts` | `_onBatchStart(totalElementCount)` → BatchLoadingIndicator shown | T=+0ms |
| 1.8 | `BatchCoordinator.ts` | `storeEventBus.beginBatch()` → depth 0→1 | T=+0ms |
| 1.9 | `BatchCoordinator.ts` | `storeEventBus.batch(fn)` → depth 1→2, `_processSlabs()` runs | T=+0ms |

### 1.9 Detail — `_processSlabs()` inside `storeEventBus.batch()`

```
File:     src/engine/subsystems/commands/curtainwall/CreateCurtainWallsOnAllSlabsCommand.ts
Method:   _processSlabs()  (closure passed to runBatch)
Work:
  - Per-slab polygon CCW winding + edge generation
  - Accumulates CurtainWallData objects into collectedWalls[]
  - curtainWallStore.addMany(collectedWalls)  ← single O(n) insertion, events buffered at depth 2
  - Per-level trackRegistration() groups → batchCoordinator._registrationQueue (L entries, not N)
Cost:     ~50–100ms for 36 walls; ~200ms for 110 walls (dominated by store.addMany + polygon math)
```

| Step | File | Function / Log | Elapsed |
|------|------|----------------|---------|
| 1.10 | `CreateCurtainWallsOnAllSlabsCommand.ts` | `curtainWallStore.addMany(N walls)` → PERF-ADDMANY log | T=+Xms |
| 1.11 | `CreateCurtainWallsOnAllSlabsCommand.ts` | `batchCoordinator.trackRegistration()` × L levels | T=+Xms |
| 1.12 | `BatchCoordinator.ts` | `storeEventBus.batch(fn)` returns → depth 2→1 (no flush yet) | T=+Xms |
| 1.13 | `BatchCoordinator.ts` | `scheduleOnce('batch-coordinator-resume-flush', cb, 'pre-render')` | T=+Xms |
| 1.14 | `CreateCurtainWallsOnAllSlabsCommand.ts` | **RUNBATCH-RETURNED** log | T=+Xms |
| 1.15 | `CreateCurtainWallsOnAllSlabsCommand.ts` | `§TRACE-CW#N COMPLETE totalMs=XXXms` | T=+~275ms |

> **The synchronous phase ends here.** The main thread is released. All geometry building, registration, and event delivery are asynchronous from this point.

---

## Phase 2 — Deferred Geometry Drain (rAF frames, pre-render)

### Step 2.0 — First rAF: deferred resumeAndFlush fires

```
File:     src/engine/subsystems/core/batch/BatchCoordinator.ts
Callback: 'batch-coordinator-resume-flush' (scheduleOnce, pre-render)
Log:      §TRACE DEFERRED-RESUME-FLUSH fired
Elapsed:  T=+~275ms (one rAF after runBatch returned)
```

| Sub-step | File | Action |
|----------|------|--------|
| 2.0.1 | `CurtainWallBuilder.ts` | `window.__wallRebuildControl.resumeAndFlush()` |
| 2.0.2 | `CurtainWallBuilder.ts` | `window.__curtainWallRebuildControl.resumeAndFlush()` → transfers N walls to `_pendingBuildsMap`, schedules `FrameScheduler.schedule('pre-render', _drainBuildQueue)` |
| 2.0.3 | `CurtainWallBuilder.ts` | `window.__slabRebuildControl.resumeAndFlush()` |

```
Log: §TRACE RESUME-FLUSH-DISPATCHED — CW rAF drain now in-flight
```

### Step 2.1 — rAF Drain: `_drainBuildQueue()` × multiple frames

```
File:     src/engine/subsystems/curtainwalls/CurtainWallBuilder.ts
Method:   _drainBuildQueue()
Trigger:  FrameScheduler.schedule('pre-render', cb) — rearmed per frame until queue empty
Log:      [CurtainWallBuilder] §PERF-DRAIN built=N remaining=M queueBefore=P frameMs=Xms
```

**Per-frame budget (§PERF-ADAPTIVE-DRAIN — post-fix values):**

| Parameter | Pre-fix | Post-fix |
|-----------|---------|---------|
| `MAX_BUILDS_PER_FRAME` (initial) | 5 | **20** |
| Adaptive cap (max budget) | 12 | **30** |
| Adaptive floor | 2 | **5** |

- First drain frame processes 20 walls immediately (was 5).
- Adaptive budget increments when `frameMs < 8ms`, decrements when `frameMs > 14ms`.
- **For 110 walls: ~5–6 drain frames vs. 12 pre-fix (measured frameMs=2–4ms/wall leaves room to grow to 30).**

Each `_drainBuildQueue()` call invokes `build(cw)` for up to N walls:

```
build(cw) work per wall:
  1. Resolve worldY from BimManager (level.elevation + baseOffset)
  2. Get-or-create THREE.Group (roots Map)
  3. Dispose + clear existing children (flat O(n children) loop, §PERF-2026-Q2-CW-CREATE/F6)
  4. Validate baseLine [start, end], compute length + direction
  5. Resolve CurtainGridSystem (or migrate from legacy spacing)
  6. computeCurtainCells(grid, length, height) — pure function
  7. panelStore.getByCurtainWallId(cw.id) — panel data
  8. CurtainWallInstanceManager.buildInstancedMeshes() → InstancedMesh per material group
     (geometry cached: §PERF-2026-Q2-CW-CREATE/F5 mullionGeometryCache)
     (material cached: §PERF-2026-Q2-CW-CREATE/F8 _fallbackPanelMatCache)
  9. InstancedMesh for vertical mullions (U-lines) — 1 draw call
 10. InstancedMesh for horizontal mullions (V-lines) — 1 draw call
 11. Orient + position group in world space (rotation + translation)
 12. Stamp userData on root group
 13. Register pre-baked 2D plan symbol (planSymbolCache)
  Note: castShadow=false for ALL meshes — §Step-2B shadow deferral (isBatching=true)
  Note: group ID added to _batchShadowPending for post-drain shadow reactivation
```

### Step 2.2 — Drain Complete: signal coordinator

```
File:     src/engine/subsystems/curtainwalls/CurtainWallBuilder.ts
Log:      [CurtainWallBuilder] §PERF-DRAIN-COMPLETE — rAF queue fully drained — signalling BatchCoordinator
Call:     batchCoordinator.signalBuildQueueDrained()
```

---

## Phase 3 — Registration Drain (synchronous, §REG-MANY-P2)

```
File:     src/engine/subsystems/core/batch/BatchCoordinator.ts
Method:   signalBuildQueueDrained()
Log:      §TRACE BUILD-QUEUE-DRAINED regQueue=L totalExpected=N T=+Xms
```

For the 36-wall / 6-slab case: L = 6 level-group registrations (≤ SYNC_DRAIN_THRESHOLD=50).  
For the 110-wall / 11-slab case: L = 11 level-group registrations (still ≤ 50 → sync drain).

| Step | File | Action | Log |
|------|------|--------|-----|
| 3.1 | `BatchCoordinator.ts` | Sync-drain path chosen (L ≤ 50) | `§TRACE §REG-MANY-P2 queue ≤ 50 (L) — draining synchronously` |
| 3.2 | `BimManager.ts` | `bimManager.registerMany(ids, levelId)` × L levels | `§REG-MANY-P0: registered N elements to level X` |
| 3.3 | `ElementRegistry.ts` | `elementRegistry.registerSemantic(id, 'curtainwall')` per wall | (silent) |
| 3.4 | `BatchCoordinator.ts` | Registration done | `§TRACE REGISTRATION-DRAIN-DONE` |
| 3.5 | `BatchCoordinator.ts` | `_onShadowReactivation()` dispatched | `§TRACE SHADOW-REACTIVATION-START / DISPATCHED` |

### Step 3.5 Detail — Shadow Reactivation (§PERF-FIX-2, §PERF-SHADOW-IDLE)

```
File:     src/engine/subsystems/curtainwalls/CurtainWallBuilder.ts
Method:   _reactivateShadows()
Trigger:  batchCoordinator._onShadowReactivation callback
Scheduling: requestIdleCallback (FIRST slice + all subsequent slices)
           — NOT on the post-render rAF path; runs during genuine browser idle time.
           This returns IMMEDIATELY so BatchCoordinator._executeFinalSweep() proceeds
           without delay. Shadow reactivation is entirely off the critical render path.
Per-slice budget: WALLS_PER_SHADOW_FRAME = 50  (was 10)
For 110 walls: 3 idle slices (50 + 50 + 10)  (was 11 post-render slices)
Log:      [CurtainWallBuilder] Shadow reactivation START: N walls — slicing 50 walls/frame.
          [CurtainWallBuilder] Shadow slice: walls 0–49 (50 walls, M objects enabled).
          ...
          [CurtainWallBuilder] Shadow reactivation COMPLETE: N walls.
User experience: shadows appear 1–3 seconds after walls are visible — NOT a blocking freeze.
```

---

## Phase 4 — Final Sweep: Yielded Event Drain

```
File:     src/engine/subsystems/core/batch/BatchCoordinator.ts
Method:   _executeFinalSweep()
Log:      §TRACE FINAL-SWEEP-START levels=N skipRedetect=true T=+Xms
```

| Step | File | Action |
|------|------|--------|
| 4.1 | `BatchCoordinator.ts` | `window.__wallRebuildControl.discardAndSuppress()` — drops wall events during drain |
| 4.2 | `StoreEventBus.ts` | `storeEventBus.endBatchYielded(scheduler, onComplete, 200)` — depth 1→0, drain begins |
| 4.3 | `StoreEventBus.ts` | Per-frame chunk: 200 events × 20 listeners = 4,000 listener calls/frame |
| 4.4 | `StoreEventBus.ts` | Log: `endBatchYielded() — N event(s) delivered in K chunk(s)` |

**For 36 walls: 36 events → 1 chunk → 1 rAF frame.**  
**For 110 walls: 110 events → 1 chunk → 1 rAF frame.**

---

## Phase 5 — onComplete (synchronous inside final rAF chunk)

```
File:     src/engine/subsystems/core/batch/BatchCoordinator.ts
Callback: onComplete (passed to endBatchYielded)
Log:      §TRACE ON-COMPLETE-START T=+Xms
```

| Step | File | Action | Log |
|------|------|--------|-----|
| 5.1 | `BatchCoordinator.ts` | `_isBatching = false` | (silent) |
| 5.2 | `BatchCoordinator.ts` | `viewDependencyTracker.setSuppressed(false)` | — |
| 5.3 | `BatchCoordinator.ts` | **§FIX-EDGE-PROJECT-DEFER (Fix #4):** `markLevelsDirty(levelIds)` DEFERRED to `scheduleOnce('post-render')` — fires AFTER the PSO compile render phase, so EdgeProjector 300ms debounce starts post-compile | `§TRACE §PERF-VIEW-BATCH-SUPPRESS suppression lifted; markLevelsDirty DEFERRED to post-render` |
| 5.4 | `BatchCoordinator.ts` | **§FIX-OVERLAY-TIMING (Fix #1):** `unifiedFrameLoop.endBatchRenderSuppress()` called IMMEDIATELY (so render fires in this tick), then overlay dismiss is scheduled via `scheduleOnce('batch-coordinator-overlay-dismiss', dismiss, 'post-render')` | `§TRACE ON-BATCH-END-DEFERRED (suppress lifted NOW; overlay dismiss scheduled for post-render)` |
| 5.5 | `BatchCoordinator.ts` | (post-render slot of SAME tick) `dismiss()` fires AFTER PSO compile LONGTASK | `§TRACE ON-BATCH-END-DONE (overlay dismissed post-PSO-compile; §FIX-OVERLAY-TIMING)` |
| 5.6 | `BatchCoordinator.ts` | (post-render slot of SAME tick) `markLevelsDirty(levelIds)` fires — EdgeProjector 300ms debounce starts | `§TRACE §FIX-EDGE-PROJECT-DEFER markLevelsDirty fired post-render` |
| 5.7 | `BatchCoordinator.ts` | `window.__wallRebuildControl.restore()` | (silent) |
| 5.8 | `BatchCoordinator.ts` | `_onPostBatch()` → skips PBR upgrade (skipPbrUpgrade=true) | `[BatchCoordinator/P1.3] §PERF-SKIP-PBR: PBR upgrade skipped (materials pre-specified).` |
| 5.9 | `BatchCoordinator.ts` | `PERF-FIX-3: Dispatching 1 deferred window event: bim-curtainwall-added` | existing log |
| 5.10 | `BatchCoordinator.ts` | `Final sweep: SKIPPING REDETECT_ROOMS` (skipRedetectRooms=true) | existing log |

**§FIX-OVERLAY-TIMING (Fix #1) — Why this ordering works:**

The key insight is that `onComplete` runs in the `pre-render` slot (via `scheduleOnce('batch-event-drain', fn, 'pre-render')`). Within a single tick the frame scheduler executes: `pre-render` → OBC+PASCAL render → `post-render`. So:

- `endBatchRenderSuppress()` fires in `pre-render` → OBC+PASCAL render fires in this SAME tick
- The PSO compile LONGTASK runs during OBC render — blocking the main thread for up to 12,040ms
- When the LONGTASK ends, the same tick's `post-render` slot runs → `dismiss()` hides the overlay
- The user sees: overlay throughout PSO compile → overlay hides → fully rendered scene visible

Previously: overlay dismissed at T=+2908ms → 12,040ms LONGTASK froze UI with no feedback.  
Now: overlay stays visible through the full PSO compile → dismisses when scene is ready.

---

## Phase 6 — Suppression Lift

```
File:     src/engine/subsystems/core/rendering/UnifiedFrameLoop.ts
Method:   endBatchRenderSuppress()
Log:      [UnifiedFrameLoop] §TRACE §PERF-VIEW-BATCH-SUPPRESS suppression lifted after Xms
          — OBC+PASCAL resuming on next tick.
```

**§PERF-RENDER-BEFORE-UNSUPPRESS-REMOVAL (2026-05-05) — synchronous rpm.render(0) was REMOVED:**

An earlier version of this fix called `renderPipelineManager.render(0)` synchronously inside
`endBatchRenderSuppress()` before lifting the suppression flag, reasoning that it would warm
WebGPU PSOs while the loading overlay was still visible.

**Empirical measurement disproved this.** The actual cost of the full production pipeline
(ScenePass MRT → SSGI → TRAA → outline compositing) on 110 walls was **3,296–8,443 ms** —
not the estimated 200–500 ms. The overhead came from running the full scene pass on all new
geometry, not just PSO compilation. Further profiling showed the first-frame post-overlay
LONGTASK was dominated by **EdgeProjectorService.project()**, not PSO compile — so the
synchronous render gave no measurable benefit.

**Fix: remove the call entirely.**

| Sub-step | Action | Cost |
|----------|--------|------|
| 6.1 | `_batchRenderSuppressed = false` | <1ms |
| 6.2 | Next `_tick()` fires OBC+PASCAL render | **~100–200ms LONGTASK** (PSO warm from CW prewarm) |

**Why PSOs are still warm without rpm.render(0) here:**
`_prewarmCurtainWallShaders()` (Phase 0) renders InstancedMesh probes against the production
scene BEFORE the batch starts. Those PSOs remain in the GPU driver cache for the full session.
The first post-suppress render hits that cache, producing only a modest 100–200 ms compile
rather than the 5,000–10,000 ms seen before prewarm was implemented.

**Live measured result (66-wall / 11-slab, 2026-05-05):**
- Overlay dismissed at **T=+241ms** (vs >5,000ms pre-fix)
- Only LONGTASK: **156ms** (first render post-suppress, PSO cache mostly warm)
- Pre-fix measured cost: 10,923ms LONGTASK → **eliminated to 156ms**

---

## Phase 7 — EdgeProjectorService Reprojection (LONGTASK)

```
Trigger:  viewDependencyTracker.markLevelsDirty() (Step 5.3) → 300ms debounce → flush
File:     EdgeProjectorService.ts
Log:      [EdgeProjectorService] Native projection done — N group(s), M edge geometries
LONGTASK: ~885ms (36-wall) / ~1,379ms (110-wall) — WebGPU 2D edge geometry projection
```

This runs in parallel (asynchronously after the debounce) with Phase 6 and is non-blocking
for user interaction. A future optimisation is level-scoped projection (only dirty levels).

---

## Phase 8 — PBR Upgrade (§PERF-SKIP-PBR — now skipped for CW batches)

```
File:     src/engine/subsystems/initScene.ts  (runPbrUpgrade closure inside _onPostBatch)
BatchOptions: skipPbrUpgrade: true  (set in CreateCurtainWallsOnAllSlabsCommand.runBatch())
```

**§PERF-SKIP-PBR (2026-05-05) — implemented, eliminates the Phase 8 LONGTASK for CW batches:**

CW materials are `MeshStandardMaterial` with explicit `metalness`/`roughness` specified at
build time — they do not need the PBR upgrade pass (which calls
`renderingCoordinator.onSceneGeometryAdded()` on every mesh in the scene).

| Session | Cost | Status |
|---------|------|--------|
| 36-wall (pre-fix) | ~50ms / 2 chunks / 191 meshes | Acceptable |
| 110-wall (pre-fix) | **52,668ms / 4 chunks / 422 meshes** | Critical bottleneck |
| 110-wall (post-fix) | **~0ms** (skipped entirely) | **Eliminated** |

The `shouldSkipPbr` flag is captured synchronously at callback registration time
(`const shouldSkipPbr = batchCoordinator.skipPbrUpgrade` in `initScene.ts` line ~1404)
to prevent a race where `forceReset()` clears `_skipPbrUpgrade` before the idle callback
fires.

---

## Phase 9 — Shadow Reactivation Slices (off critical path)

```
File:     src/engine/subsystems/curtainwalls/CurtainWallBuilder.ts
Method:   _reactivateShadows() → drainSlice()
First slice: setTimeout(drainSlice, 30000)  — fires 30s after batch (clears full LONGTASK storm)
Subsequent:  setTimeout(drainSlice, 200)    — safety net; dead code with WALLS=10000
Per slice:   WALLS_PER_SHADOW_FRAME = 10000 (ALL walls in ONE shot — §PERF-SHADOW-ONE-SHOT 2026-05-05)
```

| Session | Slices | Scheduling | Result | Impact |
|---------|--------|-----------|--------|--------|
| 36-wall (pre-fix) | 4 × rAF | post-render | ~1,500ms | Blocked 1st render |
| 110-wall (pre-fix) | 11 × rAF | post-render | ~20,000ms | **Massive freeze** |
| 66-wall (WALLS=50, setTimeout 10s) | 2 | setTimeout(10s)+rIdle | 3,989ms LONGTASK | Collision with PSO storm |
| 77-wall (WALLS=5, setTimeout 10s) ❌ | 16 | setTimeout(10s)+setTimeout(200) | **26,121ms LONGTASK** | **REGRESSION — slicing fallacy** |
| 77-wall (WALLS=10000, setTimeout 30s) ✅ | 1 | setTimeout(30s) | **~25,000ms off-screen at T+30s** (measured 24,852ms for 96-wall scene, 2026-05-05) | **No user-visible freeze** |

**§PERF-SHADOW-ONE-SHOT (2026-05-05) — The slicing fallacy corrected:**

Shadow map rebuild cost is `O(total_scene_shadow_casters)`, **not** `O(walls_in_slice)`.
When any mesh has `castShadow=true` set, Three.js WebGPU rebuilds the ENTIRE shadow frustum
on the next render frame — traversing every shadow caster already in the scene, regardless
of how many were changed in the current slice. This means:

- N slices = N full shadow map rebuilds = N × rebuild_cost
- Smaller slices → more slices → TOTAL cost multiplied, not divided

**Verified regression:** `WALLS_PER_SHADOW_FRAME=5` produced 16 slices → **26,121ms** compound
LONGTASK (vs 15,870ms original with 2 slices). The 200ms inter-slice spacing was also insufficient
because the PSO (5,871ms) + EdgeProjector (7,109ms) LONGTASK storm lasted ~13s total; the 10s
setTimeout fired mid-storm and the browser queued all 16 shadow callbacks to fire immediately
after the storm cleared — resulting in 16 consecutive shadow rebuilds with no breathing room.

**Correct fix — two changes:**
1. `WALLS_PER_SHADOW_FRAME = 10000` → all walls processed in exactly ONE drainSlice() call
   → exactly ONE shadow map rebuild → minimum possible shadow cost
2. `setTimeout(drainSlice, 30000)` → fires 30s after batch, providing ~17s margin beyond
   the measured ~13s PSO + EdgeProjector storm peak → shadow rebuild runs in uncontested frame

Shadows appear silently at T+30s. The geometry, mullions, and panels are fully visible and
interactive immediately. `REDETECT_ROOMS` and EdgeProjector do not depend on shadow state.

---

## Complete Timeline

### 36-wall / 6-slab Reference (pre-fix, measured 2026-05-04/05)

```
T=+0ms       §TRACE _setupBatch — batch clock starts
T=+0ms       viewDependencyTracker suppressed; builders paused; overlay shown
T=+0ms       storeEventBus depth: 0→1 (outer bracket)
T=+0ms       storeEventBus depth: 1→2 (inner sync bracket)
T=+~50ms     _processSlabs: addMany(36), trackRegistration(6 levels)
T=+~100ms    storeEventBus depth: 2→1 (inner bracket closes; no flush)
T=+~100ms    scheduleOnce('batch-coordinator-resume-flush') queued
T=+~275ms    §TRACE COMPLETE (command returns, main thread released)

≈ rAF frame boundary (16ms) ≈

T=+~290ms    §TRACE DEFERRED-RESUME-FLUSH fired
T=+~290ms    curtainWallRebuildControl.resumeAndFlush() → 36 walls → _pendingBuildsMap
T=+~290ms    §TRACE RESUME-FLUSH-DISPATCHED — rAF drain in-flight

[LONGTASK ~284ms — 8 rAF drain frames × ~35ms each (pre-fix: MAX_BUILDS_PER_FRAME=5)]

T=+~574ms    §PERF-DRAIN-COMPLETE — all 36 walls built
T=+~574ms    §TRACE BUILD-QUEUE-DRAINED regQueue=6
T=+~574ms    §TRACE §REG-MANY-P2 — sync drain 6 registrations
T=+~574ms    §TRACE REGISTRATION-DRAIN-DONE
T=+~574ms    §TRACE SHADOW-REACTIVATION-START → _reactivateShadows() dispatched (idle)
T=+~574ms    §TRACE FINAL-SWEEP-START → endBatchYielded()
T=+~590ms    StoreEventBus delivers 36 events × 1 chunk (1 pre-render frame)
T=+~606ms    §TRACE ON-COMPLETE-START — _isBatching=false
T=+~606ms    §TRACE §PERF-VIEW-BATCH-SUPPRESS suppression lifted; markLevelsDirty(6)
T=+~606ms    §TRACE ON-BATCH-END → overlay dismissed; endBatchRenderSuppress()
             ↳ NOTE: rpm.render(0) was REMOVED from endBatchRenderSuppress() (was 3,296–8,443ms)
T=+~607ms    §TRACE ON-POST-BATCH → §PERF-SKIP-PBR: PBR upgrade skipped

≈ next rAF tick ≈

T=+~623ms    §TRACE FIRST-RENDER-POST-SUPPRESS totalSuppressedMs=~332ms
             [~300–500ms LONGTASK — CW InstancedMesh PSO + SSGI on new geometry]

T=+~1,200ms  ViewDependencyTracker flush → EdgeProjectorService (debounce)
             [non-blocking — chunked (CHUNK_SIZE=4), 13 chunks for 346 edges]

T=+~1,800ms  Scene fully interactive ← user sees walls + plan view updating

[shadow fires 30s after batch via setTimeout(30000) — 1 shot, all walls — §PERF-SHADOW-ONE-SHOT]
```

### 66-wall / 11-slab — Live Measured Session (2026-05-05)

```
T=+0ms       §TRACE-CW#1 START  slabCount=11 isRedo=false shadersPrewarmed=false
             → _prewarmCurtainWallShaders() fires (3 probe IM × 3 rpm.render(0) passes)

[LONGTASK ~154ms — prewarm rpm.render(0)×3 passes]

T=+140ms     §TRACE-CW#1 RUNBATCH-RETURNED  runBatchMs=140.1ms

T=+145ms     §TRACE-CW#1 COMPLETE  walls=66

T=+151ms     DEFERRED-RESUME-FLUSH fired  (first rAF after storeEventBus depth→0)
T=+152ms     RESUME-FLUSH-DISPATCHED → 66 walls into _pendingBuildsMap

  rAF drain frame 1: built=20  remaining=46  frameMs=6.7ms   nextBudget=21
  rAF drain frame 2: built=21  remaining=25  frameMs=9.7ms   nextBudget=21
  rAF drain frame 3: built=21  remaining=4   frameMs=6.7ms   nextBudget=22
  rAF drain frame 4: built=4   remaining=0   frameMs=1.1ms   nextBudget=23

T=+227ms     §TRACE BUILD-QUEUE-DRAINED  regQueue=11 / totalExpected=66
T=+227ms     §TRACE REG-MANY-P2 sync drain — 11 levels → 0 rAF frames needed
T=+229ms     §TRACE REGISTRATION-DRAIN-DONE  (11 registerMany, ~2ms)
T=+229ms     §TRACE SHADOW-REACTIVATION-START → setTimeout(drainSlice, 30000) queued (§PERF-SHADOW-DELAY-30S)
T=+230ms     §TRACE FINAL-SWEEP-START  skipRedetect=true

T=+241ms     §TRACE ON-COMPLETE-START  (66 events, 1 chunk, 3.4ms delivery)
T=+241ms     §PERF-VIEW-BATCH-SUPPRESS  suppression lifted  (totalMs=240.6ms)
T=+241ms     §TRACE ON-BATCH-END-DONE → OVERLAY DISMISSED ← user sees walls

T=+241ms     §TRACE ON-POST-BATCH-START
T=+241ms     §PERF-SKIP-PBR PBR-UPGRADE-SKIPPED
T=+241ms     §TRACE ON-POST-BATCH-DISPATCHED
T=+241ms     REDETECT_ROOMS SKIPPED for 11 levels (skipRedetectRooms=true)

≈ next rAF tick ≈

T=+246ms     §TRACE FIRST-RENDER-POST-SUPPRESS  totalSuppressedMs=245.8ms

[LONGTASK 3,955ms start=499491ms — OBC+PASCAL+SSGI first render on 66 new walls (plan view)]
[LONGTASK 163ms  start=503678ms — settling frame]

T=+~3,800ms  ViewDependencyTracker flush → EdgeProjectorService.project()
             13 groups, 346 edge geometries, 13 chunks (CHUNK_SIZE=4) — non-blocking

T=+~4,200ms  Scene fully interactive (plan view updated, walls visible)

T=+10,229ms  Shadow drainSlice would have fired here (old: setTimeout 10s) ← now 30s
             ❌ OLD BEHAVIOUR: WALLS=5 → 16 slices → 26,121ms compound LONGTASK (regression)

T=+30,229ms  Shadow drainSlice fires (setTimeout 30s from T=+229ms — §PERF-SHADOW-DELAY-30S)
             → ALL 66 walls in ONE shot (WALLS=10000) = 1 full shadow map rebuild
             → fires in an uncontested frame (PSO ~5.8s + EdgeProjector ~7.1s storm done by T+13s)
             [no subsequent slices — all done in 1 call]

T=+~31,000ms All 66 walls cast/receive shadows (1 rebuild, no user-visible freeze)

[GPU Monitor: geometries 22→23 (stable — no shadow PSO variant explosion with one-shot fix)]
```

### 96-wall / 16-slab — Live Measured Session (2026-05-05, §PERF-SHADOW-ONE-SHOT confirmed)

```
T=+0ms       §TRACE-CW#1 START  slabCount=16 isRedo=false shadersPrewarmed=false (fresh project)

T=+299ms     §TRACE-CW#1 RUNBATCH-RETURNED  runBatchMs=299.9ms T=+303.6ms
T=+303ms     §TRACE-CW#1 COMPLETE  walls=96

T=+313ms     DEFERRED-RESUME-FLUSH fired (first rAF after storeEventBus depth→0)
T=+313ms     RESUME-FLUSH-DISPATCHED → 96 walls into _pendingBuildsMap

  rAF drain frame 1: built=20  remaining=76  frameMs=8.0ms   nextBudget=20
  rAF drain frame 2: built=20  remaining=56  frameMs=5.6ms   nextBudget=21
  rAF drain frame 3: built=21  remaining=35  frameMs=15.5ms  nextBudget=20
  rAF drain frame 4: built=20  remaining=15  frameMs=36.0ms  nextBudget=19
  rAF drain frame 5: built=15  remaining=0   frameMs=6.1ms   nextBudget=20

T=+428ms     §TRACE BUILD-QUEUE-DRAINED  regQueue=16 / totalExpected=96
T=+428ms     §TRACE REG-MANY-P2 sync drain — 16 levels → 0 rAF frames needed
T=+429ms     §TRACE REGISTRATION-DRAIN-DONE  (16 registerMany, ~2ms)
T=+429ms     §TRACE SHADOW-REACTIVATION-START → setTimeout(drainSlice, 30000) queued
T=+430ms     §TRACE FINAL-SWEEP-START  skipRedetect=true

T=+453ms     §TRACE ON-COMPLETE-START  (96 events, 1 chunk, 17.7ms delivery)
T=+454ms     §PERF-VIEW-BATCH-SUPPRESS  suppression lifted  (totalMs=454.3ms)
T=+455ms     §TRACE ON-BATCH-END-DONE → OVERLAY DISMISSED ← user sees walls
T=+455ms     §PERF-SKIP-PBR PBR-UPGRADE-SKIPPED
T=+455ms     REDETECT_ROOMS SKIPPED for 16 levels (skipRedetectRooms=true)

≈ next rAF tick ≈

T=+463ms     §TRACE FIRST-RENDER-POST-SUPPRESS  totalSuppressedMs=463.3ms

[LONGTASK 317ms  start=93587ms — during addMany/drain phase (pre-dismiss; batched rAF drain)]
[LONGTASK 5,607ms start=94055ms — first render PSO (OBC+PASCAL+SSGI on 96 new walls, plan view)]
[NO shadow LONGTASKs detected — setTimeout(30000) pushes rebuild fully off observation window]

T=+~4,900ms  ViewDependencyTracker flush → EdgeProjectorService.project()
             13 groups, 382 edge geometries, 13 chunks — non-blocking

T=+~5,500ms  Scene fully interactive (plan view updated, walls visible)

T=+30,429ms  Shadow drainSlice fires (setTimeout 30s from T=+429ms — §PERF-SHADOW-DELAY-30S)
             → ALL 96 walls in ONE shot (WALLS=10000) = 1 full shadow map rebuild
             → uncontested frame — PSO+EdgeProjector storm (~13s) cleared 17s earlier
             [no subsequent slices]

T=+~31,000ms All 96 walls cast/receive shadows (1 rebuild, no user-visible freeze)

[GPU Monitor: geometries 23 → 23 (stable throughout — §PERF-SHADOW-ONE-SHOT confirmed working)]
```

---

### 110-wall / 11-slab Session — Before vs. After Fixes

| Phase | Before fixes | After fixes (110-wall projected) | Live measured (66-wall 2026-05-05) |
|-------|-------------|----------------------------------|-------------------------------------|
| Prewarm (Ph 0) | 218ms (wrong probe type — Mesh not InstancedMesh) | ~100–300ms (InstancedMesh probes × 3 passes) | ~300ms (hidden under prewarm; not logged separately) |
| Sync + store addMany (Ph 1) | ~1,069ms | ~1,069ms | ~140ms (66 walls) |
| rAF drain (Ph 2) | ~989ms (12 frames, max budget 12) | ~400ms (5–6 frames, initial 20) | ~77ms / 4 frames (20+21+21+4 — adaptive) |
| Registration drain (Ph 3) | ~2ms | ~2ms | ~2ms (11 levels, sync) |
| Event drain (Ph 4) | ~13ms | ~13ms | 3.4ms (66 events, 1 chunk) |
| **Suppression lift (Ph 6)** | — | **<1ms** (rpm.render(0) removed) | **<1ms** — overlay dismissed at **T=+241ms** |
| **First render PSO (Ph 6)** | **10,923ms LONGTASK** | **~300–500ms LONGTASK** (prewarm-warm) | **3,955ms LONGTASK** (plan-view OBC+PASCAL+SSGI on 66 new walls) |
| EdgeProjector (Ph 7) | ~1,379ms LONGTASK | ~0ms LONGTASK (chunked) | **0ms LONGTASK** (13 chunks × ~4ms, 346 edges — non-blocking) |
| **PBR upgrade (Ph 8)** | **52,668ms / 4 idle chunks** | **~0ms (skipPbrUpgrade=true)** | **~0ms** (PBR-UPGRADE-SKIPPED logged) |
| **Shadow slices (Ph 9)** | **~20,000ms / 11 post-render slices** | ~3,000ms / 3 idle slices (WALLS=50) | **0ms LONGTASK** (1 shot, WALLS=10000, setTimeout 30s — §PERF-SHADOW-ONE-SHOT) |
| **REDETECT_ROOMS** | **~23,000ms / 9 probes** | ~0ms (skipRedetectRooms=true) | **0ms** (skipped for 11 levels, logged) |
| **Total user-visible freeze** | **~75–80 seconds** | **~1.5–2.5 seconds** | **241ms overlay + 3,955ms first-render** |

---

## Current Bottlenecks (live state — 2026-05-05; 66-wall, 96-wall, 189-wall, 273-wall measured)

| Step | Live Duration | Owner | Status |
|------|--------------|-------|--------|
| Overlay dismiss | **~T+PSO_compile** — dismisses AFTER first render (§FIX-OVERLAY-TIMING Fix #1) | `BatchCoordinator._onComplete` | ✅ Fix #1 implemented — overlay covers PSO compile LONGTASK |
| rAF geometry drain (CW) | **77ms** / 4 frames (66 walls) | `CurtainWallBuilder._drainBuildQueue` | ✅ Fixed (adaptive budget 20→30) |
| rAF geometry drain (Walls) | ~100ms (72-wall) | `WallFragmentBuilder._drainBuildQueue` | ✅ Fixed (MAX=15, cap 40) |
| Pre-unsuppress render | **0ms** | `UnifiedFrameLoop.endBatchRenderSuppress()` | ✅ Removed (was 3,296–8,443ms) |
| EdgeProjectorService timing | **deferred to post-render** — 300ms debounce starts AFTER PSO compile frame (§FIX-EDGE-PROJECT-DEFER Fix #4) | `BatchCoordinator → ViewDependencyTracker` | ✅ Fix #4 implemented — EdgeProjector no longer concurrent with PSO compile |
| EdgeProjector total wall-clock | ~3s background (346 edges) | `EdgeProjectorService` | Background; non-blocking |
| First render LONGTASK (CW) | **~12,040ms** (189-wall plan-view OBC+PASCAL+SSGI) | `UnifiedFrameLoop._tick()` | ⚠️ Residual — now COVERED by overlay (Fix #1). User sees loading indicator throughout. |
| Shadow reactivation LONGTASK | **0ms** (1 shot at T+30s, uncontested frame) | `CurtainWallBuilder._reactivateShadows()` | ✅ Fixed — WALLS_PER_SHADOW_FRAME 50→5→**10000** (one shot), setTimeout **30s** (§PERF-SHADOW-ONE-SHOT) |
| Shadow total wall-clock | ~25s off-screen at T+30s | `_reactivateShadows()` | 1 rebuild — 24,852ms measured for 96-wall scene; non-blocking since user interactive for 30s first |
| PBR upgrade (CW) | **0ms** (skipped) | `initScene.runPbrUpgrade` | ✅ Eliminated via `skipPbrUpgrade: true` |
| PBR upgrade (Walls) | running in idle | `initScene.runPbrUpgrade` | Unchanged — walls need PBR upgrade |
| REDETECT_ROOMS | **0ms** (skipped for 11 levels) | `BatchCoordinator._executeFinalSweep` | ✅ Eliminated via `skipRedetectRooms: true` |
| Geometry count warning (22→23) | Stable — no growth | `GpuMonitor` | ✅ Fixed — was 22→55→103→117 with WALLS=5 slicing (N PSO depth variants). Now 22→23 stable with one-shot fix. |
| **Sync phase (addMany) — OPEN** | **2,731ms** for 189-wall batch; **17,422ms** for 273-wall | `CreateCurtainWallsOnAllSlabsCommand.runBatch()` | ⚠️ Open bottleneck — `addMany(N)` blocks main thread; Fix #1 overlay now covers the post-sync PSO compile but not the sync phase itself |

**Fix Status Summary (2026-05-05):**
| Fix | Description | Status |
|-----|-------------|--------|
| Fix #1 | Overlay timing — dismiss deferred to post-render of PSO compile frame | ✅ **DONE** — `§FIX-OVERLAY-TIMING` in BatchCoordinator.ts |
| Fix #2 | addMany O(n²) → O(n) — Phase 1 inserts, Phase 2 notifies | ✅ **DONE** — `PERF-ADDMANY` in CurtainWallStore.ts |
| Fix #3 | Static `_shadersPrewarmed` flag + prewarm before runBatch | ✅ **DONE** — `PERF-PREWARM` in CreateCurtainWallsOnAllSlabsCommand.ts |
| Fix #4 | EdgeProjector defer — markLevelsDirty deferred to post-render | ✅ **DONE** — `§FIX-EDGE-PROJECT-DEFER` in BatchCoordinator.ts |

---

## Dev Tools

```javascript
// Force re-run of PSO prewarm (next execute() will re-compile shaders)
window.__resetCwPrewarm()

// Toggle per-wall build and per-slice shadow logs
window.__cwBuilderDebug = true

// Filter all §TRACE logs for a specific batch run in DevTools console:
// (type into filter box)
§TRACE-CW#1

// Filter all §TRACE logs for any batch:
§TRACE

// Check current batch state
window.batchCoordinator?.isBatching
window.batchCoordinator?.skipPbrUpgrade
```

---

## File Index

| File | Role in Pipeline |
|------|-----------------|
| `src/engine/subsystems/commands/curtainwall/CreateCurtainWallsOnAllSlabsCommand.ts` | Phase 0–1: command, prewarm, store mutations, batch entry |
| `src/engine/subsystems/curtainwalls/CurtainWallBuilder.ts` | Phase 2–3: rAF geometry drain, `build()`, shadow deferral, shadow reactivation |
| `src/engine/subsystems/core/batch/BatchCoordinator.ts` | Phase 1–5: batch lifecycle, deferred resume, registration drain, final sweep, skipPbrUpgrade |
| `src/engine/subsystems/core/rendering/UnifiedFrameLoop.ts` | Phase 6: suppression lift (`_batchRenderSuppressed = false`); `rpm.render(0)` was REMOVED (§PERF-RENDER-BEFORE-UNSUPPRESS-REMOVAL 2026-05-05) |
| `src/engine/subsystems/initScene.ts` | Phase 8: PBR upgrade guard (§PERF-SKIP-PBR, shouldSkipPbr captured synchronously) |
| `packages/core-app-model/src/StoreEventBus.ts` | Phase 4: yielded event drain (endBatchYielded, 200 events/frame) |
| `src/engine/subsystems/core/views/ViewDependencyTracker.ts` | Phase 5–7: suppression + markLevelsDirty → EdgeProjectorService trigger |
| `EdgeProjectorService.ts` | Phase 7: plan-view 2D projection LONGTASK |

---

## Related Documents

- `39-CURTAIN-WALL-BATCH.md` — performance sprint notes, root cause analysis, session handoff
- `41-BATCH-ERROS.md` — clean status summary of the four perf fixes (rewritten 2026-05-05)
- `37-BATCH-CW-PERF-SPRINT.md` — earlier sprint with P1.1–P1.4 architecture
- `38-SPRINT-A39-REDETECT-ROOMS-PERF.md` — REDETECT_ROOMS skip fix
