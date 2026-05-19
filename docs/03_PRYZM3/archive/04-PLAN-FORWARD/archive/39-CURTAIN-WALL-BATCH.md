# PRYZM Curtain Wall Batch Performance — Project Documentation

**Project:** PRYZM BIM Engine  
**Goal:** Reduce `CREATE_CURTAIN_WALLS_ON_ALL_SLABS` from ~9,000ms to under 1,000ms for 20+ slabs / 400+ walls on RTX 3060  
**Status:** All four tasks IMPLEMENTED — session log verification in progress  
**Last Updated:** May 5, 2026

---

## Implementation Status

| Task | Description | Status | File |
|---|---|---|---|
| Task 1 | `addMany()` — eliminate O(n²) subscriber cascade | ✅ LIVE | `CreateCurtainWallsOnAllSlabsCommand.ts`, `CurtainWallStore.ts` |
| Task 2 | Shader pre-warm — PSO compilation before first render | ✅ LIVE | `CreateCurtainWallsOnAllSlabsCommand.ts` |
| Task 2b | `PERF-PREWARM-ONCE` — static one-time flag for prewarm | ✅ LIVE (2026-05-05) | `CreateCurtainWallsOnAllSlabsCommand.ts` |
| Task 3 | Deferred `resumeAndFlush()` — moved to `pre-render` slot | ✅ LIVE | `BatchCoordinator.ts` |
| Task 4 | Idle PBR upgrade — `requestIdleCallback` wrapper | ✅ LIVE | `initScene.ts` |

---

## 1. Problem Statement

When a user creates curtain walls on all slabs in a multi-storey building (20+ slabs, 400+ walls), the operation causes a visible UI freeze lasting 9,000–12,000ms. The browser main thread is blocked by cascading synchronous work. The target is under 1,000ms total visible freeze, with geometry appearing behind a loading overlay during the drain phase.

### Observed Evidence

From the attached console log session the following was measured on a 6-slab / 108-wall project:

```
CreateCurtainWallsOnAllSlabsCommand COMPLETE total=436.5ms
  slab 1: 15.0ms
  slab 2: 33.2ms
  slab 3: 60.8ms
  slab 4: 92.2ms
  slab 5: 97.9ms
  slab 6: 135.2ms
```

The cascading times confirm O(n²) growth. Extrapolating to 400 walls: **~6,000–8,000ms in the slab loop alone**, before shader compilation, event drain, or room detection.

Additional evidence from the same session:

- `[RoomTopologyObserver] forced fire (level=L0, deadline=400ms, elapsed=5ms, resets=6)` — debounce starvation guard firing mid-batch, triggering premature REDETECT_ROOMS
- `[BatchCoordinator/P1.3] Post-batch PBR upgrade complete: 419 mesh(es) in 4 chunk(s)` — PBR upgrade running immediately post-batch, blocking perceived completion
- `§PERF-VIEW-BATCH-SUPPRESS: OBC+PASCAL render suppressed` — render suppression is wired correctly but the slab loop cascade happens before it can help
- `WebGPU: too many warnings, no more warnings will be reported` — GPU warning flood confirming shader compilation pressure

---

## 2. Root Cause Analysis

### Root Cause 1 — O(n²) Subscriber Cascade (PRIMARY, ~6,000ms at 400 walls)

**File:** `CreateCurtainWallsOnAllSlabsCommand.ts`, `_processSlabs()`  
**Mechanism:** `curtainWallStore.add()` is called once per wall inside the slab loop. Each call emits an internal store `onItemSet` notification. Subscribers that scan the growing store (room topology observer, constraint engine, visual graph applicator) make each subsequent insertion progressively more expensive. The `storeEventBus.batch()` envelope buffers the bus-level delivery but does NOT suppress the store's own internal `onItemSet` notifiers — those fire synchronously on every `add()` call regardless of batch state.

**Why it grows quadratically:** At wall N, approximately N subscribers each do O(N) work scanning the store → O(N²) total. At 108 walls this produces the 15→135ms cascade. At 400 walls the same curve projects to ~1,800ms in the loop alone, plus the cascading secondary effects.

### Root Cause 2 — Synchronous Shader Compilation (~1,500–2,500ms at 400 walls)

**File:** `UnifiedFrameLoop.ts`, `initScene.ts`  
**Mechanism:** `endBatchRenderSuppress()` lifts after the drain completes, then the first `renderer.render()` call compiles WebGL GLSL shader programs for every new material variant introduced by the batch. This is a WebGL API constraint — shader compilation is synchronous and blocks the main thread. For 400 curtain walls with `MeshStandardMaterial` (mullion color #333333), `MeshPhysicalMaterial` (glass panels), and shadow-receiving variants, the GPU driver compiles 800–1,200 program variants in one synchronous call.

**Why pre-warming works:** WebGL caches compiled shader programs by material hash. A single render of a mesh using each target material before the batch forces compilation to happen once, quietly, before the geometry flood arrives.

**Critical discovery (2026-05-05):** The initial prewarm used `new THREE.Mesh` which compiled a DIFFERENT vertex shader than the `THREE.InstancedMesh` used by `CurtainWallBuilder`. InstancedMesh uses a distinct PSO (gl_InstanceID / instance matrix attributes). Without using `InstancedMesh` probes, WebGPU compiled ~1,000 new PSOs during the first drain frame → measured 9,559ms LONGTASK. The fix uses `THREE.InstancedMesh` probes to match the exact GPU pipeline state.

**Critical discovery (2026-05-05 Fix 1):** Even with correct InstancedMesh probes, the prewarm was called INSIDE `_processSlabs()` which runs inside `storeEventBus.batch(fn)`. The browser cannot paint between `beginBatch()` and `batch(fn)`, so the loading overlay never appeared before the freeze. Additionally, without a one-time static flag, every `execute()` call (including redo and re-run after undo) paid the full ~800–1,200ms prewarm cost again — even though the GPU PSO cache remains warm across the session. **Fix: moved prewarm BEFORE `runBatch()` and added `private static _shadersPrewarmed = false` guard.**

### Root Cause 3 — Synchronous `resumeAndFlush()` After `runBatch()` (~400–800ms)

**File:** `BatchCoordinator.ts`, `runBatch()`  
**Mechanism:** After `fn()` returns, three `resumeAndFlush()` calls fire synchronously:
```
window.__wallRebuildControl?.resumeAndFlush?.()
window.__curtainWallRebuildControl?.resumeAndFlush?.()
window.__slabRebuildControl?.resumeAndFlush?.()
```
The curtain wall `resumeAndFlush()` transfers all 400 walls into the builder's pending queue and schedules a single rAF drain. But the queue transfer itself is synchronous, triggering builder internal state updates that emit events before the JS event loop can yield. On a 400-wall project this synchronous queue population takes 200–400ms on the main thread.

### Root Cause 4 — PBR Upgrade Blocks Perceived Completion (~300ms visible)

**File:** `initScene.ts`, `setPostBatchCallback`  
**Mechanism:** The post-batch PBR upgrade runs immediately after `endBatchYielded()` completes. It traverses the scene, finds all new meshes, and upgrades their materials across chunked frames. The chunking (120 meshes/frame) prevents a single LONGTASK but still adds ~300ms of post-render work before the user can interact. This work is not needed for geometry to appear correctly — the meshes render fine with their default materials.

---

## 3. Architecture of the Fix

### Overview

Four independent changes, each targeting one root cause. They are ordered by impact and implementation risk. Each can be implemented, tested, and merged independently.

```
Task 1:  addMany()              → fixes Root Cause 1 → saves ~5,000–7,000ms
Task 2:  Shader pre-warm        → fixes Root Cause 2 → saves ~1,200–2,000ms  
Task 2b: One-time prewarm flag  → prevents prewarm on every re-run → saves ~800–1,200ms per subsequent batch
Task 3:  Defer resumeAndFlush() → fixes Root Cause 3 → saves ~300–600ms
Task 4:  Defer PBR upgrade      → fixes Root Cause 4 → saves ~300ms perceived
```

Combined projected result at 20 slabs / 400 walls:

| Phase | Before | After |
|---|---|---|
| Slab loop | ~6,000ms | ~180ms |
| Shader compilation (first run) | ~1,500ms | ~80ms (prewarm pays it once) |
| Shader compilation (subsequent runs) | ~1,500ms | ~0ms (static flag skips prewarm) |
| Builder drain (rAF, behind overlay) | ~800ms | ~600ms (invisible) |
| endBatchYielded drain | ~400ms | ~200ms |
| PBR upgrade | ~300ms visible | deferred, invisible |
| REDETECT_ROOMS (20 levels) | ~320ms spread | skipped (§FIX-SKIP-REDETECT-ROOMS) |
| **Total visible freeze** | **~9,000ms** | **~600–800ms** |

---

## 4. File Map

Every file touched, what changes, and why:

### `src/engine/subsystems/curtainwalls/CurtainWallStore.ts` (or equivalent path)
**Task 1.** `addMany(items: CurtainWallData[]): void` method added. Inserts all items in one loop, fires one consolidated notification after all inserts. No per-item event emission.

### `src/engine/subsystems/commands/curtainwall/CreateCurtainWallsOnAllSlabsCommand.ts`
**Task 1.** Per-wall `curtainWallStore.add(cwData)` calls inside `_processSlabs()` replaced with collection into `collectedWalls: CurtainWallData[]` array; `curtainWallStore.addMany(collectedWalls)` called ONCE after the slab loop.  
**Task 2.** `_prewarmCurtainWallShaders()` private method added. Uses three `InstancedMesh` probes (mullion, glass DoubleSide, fallback panel) against the PRODUCTION scene to compile the exact PSO variants the builder uses.  
**Task 2b.** `private static _shadersPrewarmed = false` class-level flag added. Prewarm fires ONCE per browser session; subsequent execute() calls skip it entirely. Prewarm moved BEFORE `batchCoordinator.runBatch()` so the loading overlay is visible throughout.

### `src/engine/subsystems/core/batch/BatchCoordinator.ts`
**Task 3.** Three `resumeAndFlush()` calls deferred into `getFrameScheduler().scheduleOnce('batch-coordinator-resume-flush', callback, 'pre-render')`. `private _resumeFlushDispose: TickListenerDisposer | null = null` field added. Cancelled and executed synchronously in `forceReset()`. Error catch block also cancels the deferred callback.

### `src/engine/subsystems/initScene.ts`
**Task 4.** `setPostBatchCallback` body wrapped in `requestIdleCallback(runPbrUpgrade, { timeout: 5000 })` with `setTimeout(runPbrUpgrade, 100)` fallback. The existing chunk loop (120 meshes/frame via nested `scheduleOnce`) unchanged — only the start of that work is deferred to idle time.

---

## 5. Detailed Implementation Specification

### Task 1 — `addMany()` on CurtainWallStore ✅ IMPLEMENTED

**Step 1.1** — Located the CurtainWall store. It has `add(item: CurtainWallData)` method that inserts into an internal `Map<string, CurtainWallData>`.

**Step 1.2** — `addMany(items: CurtainWallData[]): void` added. All items inserted in one loop, one consolidated notification fired.

**Step 1.3** — Per-wall `curtainWallStore.add(cwData)` replaced with accumulation into `collectedWalls[]`, then `curtainWallStore.addMany(collectedWalls)` called ONCE after the outer slab loop.

**Step 1.4** — `createdIdsBySlabId` population is unchanged — IDs collected independently of store write timing.

**Step 1.5** — `busCwSpecs` collection is unchanged — collected inline, no second polygon iteration needed.

**Step 1.6** — `undo()` unchanged — loops through `createdIdsBySlabId` and calls `curtainWallStore.remove(id)` per wall; `addMany()` uses the same Map, so `remove()` still works per-item.

---

### Task 2 — Shader Pre-warm ✅ IMPLEMENTED

`_prewarmCurtainWallShaders()` private method in `CreateCurtainWallsOnAllSlabsCommand`:

```typescript
private _prewarmCurtainWallShaders(): void {
    try {
        const scene    = window.bimWorld?.scene?.three as THREE.Scene | undefined;
        const camera   = window.bimWorld?.camera?.three;
        const renderer = window.pryzmRenderer;
        if (!scene || !camera || !renderer) return;

        const probeGeom = new THREE.BoxGeometry(0.001, 0.001, 0.001);

        // Probe 1: Mullion InstancedMesh (opaque MeshStandardMaterial)
        const mullionMat = new THREE.MeshStandardMaterial({ color: '#333333', metalness: 0.1, roughness: 0.2 });
        const mullionIM = new THREE.InstancedMesh(probeGeom, mullionMat, 1);
        mullionIM.castShadow = mullionIM.receiveShadow = false;
        mullionIM.setMatrixAt(0, new THREE.Matrix4());
        mullionIM.instanceMatrix.needsUpdate = true;

        // Probe 2: Panel InstancedMesh (transparent MeshStandardMaterial, DoubleSide)
        const glassMat = new THREE.MeshStandardMaterial({ color: 0x88ccff, transparent: true, opacity: 0.4, side: THREE.DoubleSide });
        const glassIM = new THREE.InstancedMesh(probeGeom, glassMat, 1);
        glassIM.castShadow = glassIM.receiveShadow = false;
        glassIM.setMatrixAt(0, new THREE.Matrix4());
        glassIM.instanceMatrix.needsUpdate = true;

        // Probe 3: Fallback panel Mesh (transparent MeshStandardMaterial, FrontSide)
        const fallbackMat = new THREE.MeshStandardMaterial({ color: 0x88ccff, transparent: true, opacity: 0.4 });
        const fallbackMesh = new THREE.Mesh(probeGeom, fallbackMat);
        fallbackMesh.castShadow = fallbackMesh.receiveShadow = false;

        scene.add(mullionIM); scene.add(glassIM); scene.add(fallbackMesh);
        try { renderer.render(scene, camera); }
        finally {
            scene.remove(mullionIM); scene.remove(glassIM); scene.remove(fallbackMesh);
            probeGeom.dispose(); mullionMat.dispose(); glassMat.dispose(); fallbackMat.dispose();
        }
        console.log('[CreateCurtainWallsOnAllSlabsCommand] PERF-PREWARM: 3 PSO variants pre-compiled.');
    } catch (e) {
        console.warn('[CreateCurtainWallsOnAllSlabsCommand] PERF-PREWARM: shader pre-warm failed (non-fatal):', e);
    }
}
```

---

### Task 2b — One-Time Prewarm Flag ✅ IMPLEMENTED (2026-05-05)

**Problem identified:** Prewarm was called inside `_processSlabs()`, which runs inside `storeEventBus.batch(fn)` inside `runBatch()`. Two issues:
1. The browser cannot paint between `beginBatch()` and `batch(fn)` — loading overlay never visible during the freeze.
2. No static flag → prewarm fires on EVERY `execute()` call (including redo, re-run after undo), paying ~800–1,200ms each time even though GPU PSO cache stays warm.

**Fix applied:**

```typescript
// At class level:
private static _shadersPrewarmed = false;

// In execute(), BEFORE batchCoordinator.runBatch():
if (!CreateCurtainWallsOnAllSlabsCommand._shadersPrewarmed) {
    this._prewarmCurtainWallShaders();
    CreateCurtainWallsOnAllSlabsCommand._shadersPrewarmed = true;
}
batchCoordinator.runBatch(_processSlabs, { ... });
```

Removed the `if (!isRedo) { this._prewarmCurtainWallShaders(); }` block from inside `_processSlabs()`.

**Effect:** Prewarm fires exactly once per browser session — before the first `runBatch()`. All subsequent batches (redo, re-run, different project) cost zero.

---

### Task 3 — Defer `resumeAndFlush()` ✅ IMPLEMENTED

**Step 3.1** — `private _resumeFlushDispose: TickListenerDisposer | null = null` added to `BatchCoordinatorImpl`.

**Step 3.2** — In `runBatch()`, after `storeEventBus.batch(fn)` returns, the three `resumeAndFlush()` calls and watchdog start are deferred:

```typescript
this._resumeFlushDispose = getFrameScheduler().scheduleOnce(
    'batch-coordinator-resume-flush',
    () => {
        this._resumeFlushDispose = null;
        try { window.__wallRebuildControl?.resumeAndFlush?.(); } catch (e) { ... }
        try { window.__curtainWallRebuildControl?.resumeAndFlush?.(); } catch (e) { ... }
        try { window.__slabRebuildControl?.resumeAndFlush?.(); } catch (e) { ... }
        this._watchdogTimer = setTimeout(() => { ... }, 30_000);
    },
    'pre-render',
);
```

**Step 3.3** — `forceReset()` cancels the deferred callback and calls all three `resumeAndFlush()` synchronously as cleanup.

**Step 3.4** — Error catch block in `runBatch()` also cancels the deferred callback defensively.

---

### Task 4 — Defer PBR Upgrade to Idle Time ✅ IMPLEMENTED

In `initScene.ts`, `batchCoordinator.setPostBatchCallback(() => { ... })`:

```typescript
batchCoordinator.setPostBatchCallback(() => {
    const runPbrUpgrade = () => {
        getFrameScheduler().scheduleOnce('p1.3-post-batch-pbr', () => {
            // ... existing chunked scene traversal unchanged (120 meshes/frame) ...
        }, 'post-render');
    };

    if (typeof requestIdleCallback !== 'undefined') {
        requestIdleCallback(runPbrUpgrade, { timeout: 5000 });
    } else {
        setTimeout(runPbrUpgrade, 100);
    }
});
```

The existing chunk loop inside the callback is unchanged — it still slices 120 meshes per frame via nested `scheduleOnce` calls. Only the start of that work is deferred to idle time.

---

## 6. Invariants That Must Not Break

These are checked at review time. Each one must be verified by the implementor before submitting:

| Invariant | How to verify |
|---|---|
| Undo removes all walls | Create 20 slabs, run command, undo, confirm zero curtain walls in scene and store |
| Redo recreates same walls with same IDs | After undo, redo, confirm `createdIdsBySlabId` map matches pre-undo state |
| No double-registration | After redo, check `bimManager.getElementLevel(id)` returns same level for all wall IDs |
| `isBatching` gate unchanged | `batchCoordinator.isBatching` is true during `_processSlabs()` and false after `onComplete` |
| `signalBuildQueueDrained()` still called | CurtainWallBuilder drain still empties and calls signal — do not touch builder |
| `forceReset()` safe during deferred resume | Call `window.batchCoordinator.forceReset()` from console 50ms after a batch starts, confirm no stuck state and next project loads correctly |
| Bus dispatch fires | `curtain-wall.batch.create` appears in console after command completes |
| Plan view updates | After batch, 2D plan view shows curtain wall lines correctly |
| Static prewarm flag resets on page reload | Each fresh browser session pays the prewarm cost once; static flag is not persisted to localStorage |
| `_shadersPrewarmed` does not block redo | Redo path bypasses `!isRedo` check and skips prewarm correctly (flag is irrelevant on redo path — prewarm never ran on redo) |

---

## 7. Testing Protocol

### Manual Tests (required before merge)

**Test A — Smoke test (6 slabs)**
1. Open a project with 6 slabs, one per level
2. Run Create Curtain Walls on All Slabs
3. Confirm walls appear in 3D and plan view
4. Undo → confirm walls removed
5. Redo → confirm walls reappear

**Test B — Performance test (20+ slabs)**
1. Open or create a project with 20 slabs
2. Open DevTools Performance tab, begin recording
3. Run Create Curtain Walls on All Slabs
4. Stop recording
5. Confirm no single LONGTASK exceeds 200ms
6. Confirm total wall-clock time from command start to loading overlay dismiss is under 1,000ms

**Test C — Project switch safety**
1. Begin a 20-slab batch
2. Within 200ms, open browser console and run `window.batchCoordinator.forceReset()`
3. Navigate to a different project
4. Confirm new project loads without stuck batch state
5. Run a fresh batch in the new project — confirm it completes normally

**Test D — Redo after undo**
1. 20-slab batch → complete
2. Undo
3. Redo
4. Confirm same wall count, same IDs, no duplicates, correct geometry

**Test E — Error resilience**
1. Temporarily add `throw new Error('test')` at the start of `_processSlabs()`
2. Run the command
3. Confirm catch block fires, no curtain walls in scene, `isBatching` is false, bus is clean
4. Remove the throw, run again — confirm normal operation

**Test F — One-time prewarm flag verification (Task 2b)**
1. Open DevTools Performance recording
2. Run Create Curtain Walls on All Slabs (first run) — observe prewarm log: `PERF-PREWARM: 3 PSO variants pre-compiled`
3. Undo
4. Run Create Curtain Walls on All Slabs again (second run)
5. Confirm `PERF-PREWARM: 3 PSO variants pre-compiled` does NOT appear in console
6. Confirm second run is significantly faster than first (no ~800ms prewarm block)

### Automated Tests (if test suite exists)

Check for existing unit tests for `BatchCoordinator`, `CreateCurtainWallsOnAllSlabsCommand`, and the CurtainWall store. Run them after each task. Add tests for:

- `addMany()` inserts all items and fires exactly one notification
- `runBatch()` deferred `resumeAndFlush()` fires on the next pre-render frame
- `forceReset()` cancels deferred `resumeAndFlush()` when called before it fires
- `_shadersPrewarmed` static flag prevents second prewarm call across command instances

---

## 8. Rollback Plan

If any task causes regressions, each can be reverted independently:

- **Task 1 rollback:** Revert `addMany()` addition and restore `curtainWallStore.add(cwData)` inside the loop in `_processSlabs()`. No other files affected.
- **Task 2 rollback:** Remove the `_prewarmCurtainWallShaders()` call from `execute()` and delete the method. No other files affected.
- **Task 2b rollback:** Remove `private static _shadersPrewarmed = false` field, remove the `if (!_shadersPrewarmed)` guard in `execute()`. Move prewarm back inside `_processSlabs()` if Task 2 is kept. No other files affected.
- **Task 3 rollback:** Restore the three synchronous `resumeAndFlush()` calls and the original watchdog setup in `runBatch()`. Remove `_resumeFlushDispose` field and its references in `forceReset()` and the catch block.
- **Task 4 rollback:** Remove the `requestIdleCallback` wrapper from `setPostBatchCallback`, restoring the direct `getFrameScheduler().scheduleOnce(...)` call.

---

## 9. Known Remaining Bottleneck (Post-Implementation)

After all four tasks are implemented, the following bottleneck remains and is **outside the scope of this sprint**:

### OBC/PASCAL Shader Compilation on First Post-Batch Render (~12,000ms on first run only)

**Observed:** `[LONGTASK] duration=12508.0ms` immediately after `[UnifiedFrameLoop] §PERF-VIEW-BATCH-SUPPRESS: suppression lifted — OBC+PASCAL resuming; first render compiles all deferred shaders.`

**Cause:** The `UnifiedFrameLoop` suppresses OBC and PASCAL rendering during the batch drain. When suppression lifts, OBC's postprocessing pipeline compiles its own GLSL shaders for the new curtain wall geometry. OBC uses its own internal material system — the `_prewarmCurtainWallShaders()` call targets `window.pryzmRenderer` (the raw Three.js `WebGLRenderer`) but OBC's `PostproductionRenderer` has its own compilation path.

**Impact:** This 12,000ms freeze occurs only ONCE per browser session (first batch run). On all subsequent runs, OBC's shader cache is warm and the suppression-lift render is fast.

**Mitigation within current sprint:** None — addressing OBC's internal shader warm-up requires changes to the OBC integration layer and is out of scope.

**Future fix path:** Pre-render one OBC frame with probe meshes before the first batch, using `postproductionRenderer.render()` (not the raw `renderer.render()`) to warm OBC's shader programs in the correct pipeline context.

---

## 10. Future Work (Not In This Sprint)

These are known additional performance wins that were identified but are out of scope for the under-1-second target:

**OBC shader prewarm**
Warm OBC's postprocessing pipeline shaders before the first batch to eliminate the ~12,000ms first-run LONGTASK after suppression lifts. Requires calling `postproductionRenderer.render()` with probe meshes, not `renderer.render()`.

**Panel GPU instancing via `InstancedElementRenderer`**  
Create a `CurtainPanelInstanceBridge` mirroring `WallInstanceBridge`. All rectangular curtain wall panels share the same `PlaneGeometry` — instancing reduces draw calls from ~2,400 to ~6 per frame. Does not affect batch creation time but dramatically improves frame rate after the batch. Estimated effort: one week.

**`addMany()` for WallStore and SlabStore**  
The same O(n²) cascade exists in `CreateWallsOnAllSlabsCommand` and `CreateSlabsOnAllFloorsCommand`. After Task 1 proves the pattern for curtain walls, apply the same fix to those stores. Lower priority because wall and slab batches are smaller in practice.

**Spatial index pre-building**  
`TopologySpatialIndex` rebuilds on every store event. A bulk insert path that defers index rebuild to once per batch (rather than once per wall) would save 100–200ms on large batches. Requires adding an `indexMany()` method to `TopologySpatialIndex`.

---

## 11. Session Handoff Checklist

If this work is interrupted and resumed in a new session, use this checklist to get back up to speed quickly:

- [x] Task 1 — `addMany()` COMPLETE. Verify: `PERF-ADDMANY: addMany(N) complete.` in console
- [x] Task 2 — Shader prewarm COMPLETE. Verify: `PERF-PREWARM: 3 PSO variants pre-compiled (production scene)` in console on first run
- [x] Task 2b — One-time prewarm flag COMPLETE. Verify: prewarm log absent on second run; no `_shadersPrewarmed` mutation inside `_processSlabs()`
- [x] Task 3 — Deferred `resumeAndFlush()` COMPLETE. Verify: `scheduleOnce('batch-coordinator-resume-flush', ...)` present in `BatchCoordinator.ts` `runBatch()` method
- [x] Task 4 — Idle PBR upgrade COMPLETE. Verify: `requestIdleCallback(runPbrUpgrade, { timeout: 5000 })` present in `initScene.ts` `setPostBatchCallback` body

**Key file paths:**
- CurtainWall store: search for `class.*CurtainWallStore` or `curtainWallStore` assignment in `initBuilders.ts`
- Batch command: `src/engine/subsystems/commands/curtainwall/CreateCurtainWallsOnAllSlabsCommand.ts`
- BatchCoordinator: `src/engine/subsystems/core/batch/BatchCoordinator.ts`
- initScene post-batch callback: search for `setPostBatchCallback` in `src/engine/subsystems/initScene.ts`

**Key diagnostic log lines to look for:**
```
[CreateCurtainWallsOnAllSlabsCommand] PERF-PREWARM: 3 PSO variants pre-compiled (production scene)  ← Task 2/2b
[CreateCurtainWallsOnAllSlabsCommand] PERF-ADDMANY: addMany(N) complete.                           ← Task 1
[BatchCoordinator] §BATCH-CW-PAUSE: resumeAndFlush — N walls transferred ... 1 rAF drain scheduled ← Task 3 (deferred)
[BatchCoordinator/P1.3] Post-batch PBR upgrade complete: N mesh(es) in K chunk(s)                  ← Task 4
```
If the prewarm log appears on SECOND run → Task 2b static flag is not live.  
If `resumeAndFlush` log appears synchronously (same tick as `COMPLETE`) → Task 3 is not live.
