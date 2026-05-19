# Wall Batch Architecture Gap Analysis
> Reference: `40-CW-PIPELINE-TRACE.md` (CW batch reference), `BatchCoordinator.ts`, `CreateCurtainWallsOnAllSlabsCommand.ts`  
> Author: Architecture review 2026-05-06  
> Status: **Active — gaps listed below are candidates for a wall-batch performance sprint**

---

## 1. Current State

`CreateWallsOnAllSlabsCommand` was updated (§FLOW8-FIX-2026-04-30) to wrap the slab loop in `batchCoordinator.runBatch()`, gaining the basic batch envelope: event-bus buffering, a single post-batch REDETECT\_ROOMS sweep, and the `BatchLoadingIndicator` UX via `setBatchLifecycleCallbacks`. Per-level `trackRegistration()` grouping (§A40-W01) was also added.

What it does **not** yet have is the full suite of CW-proven performance patterns. The gaps below are ordered by estimated impact.

---

## 2. Gap Table — CW Pattern vs Wall Status

| # | CW Pattern | File(s) | Wall Status | Impact if missing |
|---|-----------|---------|-------------|-------------------|
| G1 | **PERF-ADDMANY** — `curtainWallStore.addMany()` replaces per-wall `store.add()` | `CreateCurtainWallsOnAllSlabsCommand._processSlabs()` | `CreateWallsFromSlabCommand` still calls `wallStore.add()` per wall inside a sub-command loop | O(n²) progressive store-scan; each `add()` triggers a store observer that re-scans all walls. Measured at 15–135 ms per slab in the CW trace. |
| G2 | **PERF-PREWARM / PERF-PREWARM-ONCE** — InstancedMesh probe renders to warm WebGL/WebGPU PSO cache before `runBatch()` | `CreateCurtainWallsOnAllSlabsCommand._prewarmCurtainWallShaders()` | No prewarm step in wall path | First-batch wall build triggers shader compilation stall of 800–1 200 ms, visible as a LONGTASK freeze after the overlay appears. |
| G3 | **Inline slab processing** — CW command inlines all `CreateCurtainWallsFromSlabCommand` logic, never calls `subCommand.execute()` | `CreateCurtainWallsOnAllSlabsCommand._processSlabs()` | `CreateWallsOnAllSlabsCommand.execute()` delegates to `CreateWallsFromSlabCommand.execute()` | Calling `.execute()` on a sub-command from another command bypasses `CommandManager` (§2.5 audit issue #2), breaks history replay, and adds stack overhead per slab. |
| G4 | **Pre-generated ID pool** — 2 000 IDs allocated at constructor time; `execute()` and `redo()` are synchronous and deterministic | `CreateCurtainWallsOnAllSlabsCommand.idPool` | Wall IDs generated on-the-fly inside `CreateWallCommand.execute()` → `crypto.randomUUID()` called N times during `runBatch()` | Minor cost per call, but redo after undo generates different IDs unless sub-commands store their own IDs — risk of phantom duplicates on redo. |
| G5 | **`signalBuildQueueDrained()` from `WallBuilder`** — builder calls this when `_pendingBuildsMap` reaches zero, closing the BatchCoordinator lifecycle | `CurtainWallBuilder._drainBuildQueue()` | `WallFragmentBuilder` / `WallBuilder` do **not** call `signalBuildQueueDrained()` | `_executeFinalSweep()` never fires → `_onBatchEnd` never fires → `BatchLoadingIndicator` stays visible until the 30 s watchdog triggers. This is the most likely cause of the overlay appearing "stuck". |
| G6 | **Shadow deferral** — `castShadow = false` during build, restored in post-batch sweep | `BatchCoordinator._setupBatch()` + `CurtainWallBuilder` | Partially handled by `BatchCoordinator._setupBatch()` global shadow flag; wall mesh builder does not explicitly defer per-mesh shadow re-activation | Shadow map re-renders triggered per wall build cause ~16 ms GPU stalls per element. CW avoids these entirely during the build phase. |
| G7 | **`trackPostBatchWindowEvent()`** — defers `window.dispatchEvent()` calls to `_executeFinalSweep()` | `BatchCoordinator.trackPostBatchWindowEvent()` | `CreateWallsOnAllSlabsCommand` dispatches `wall.batch.create` via `runtimeBus.executeCommand()` after `runBatch()` returns (outside the batch envelope). Correct timing, but could benefit from the deferred path if additional events are added. | Low — current placement is safe, but not future-proof. |

---

## 3. Highest-Priority Fix: G5 — `signalBuildQueueDrained()` in WallBuilder

**Symptom**: `BatchLoadingIndicator` shows "Building N elements…" and never disappears on its own (visible until the 30 s `_watchdogTimer` fires and force-calls `signalBuildQueueDrained()`).

**Root cause**: `BatchCoordinator.runBatch()` opens the async bracket at depth 1. It waits for `signalBuildQueueDrained()` to close it. `CurtainWallBuilder._drainBuildQueue()` calls this when its `_pendingBuildsMap` empties. The wall builder equivalent (`WallFragmentBuilder._drainQueue()` / `WallBuilder._onStoreChanged()`) has no such call.

**Fix** (mirrors CW pattern exactly):
```typescript
// WallBuilder.ts — inside _drainQueue() when the build queue reaches zero:
if (window.__wallDrainCompleteCallback) {
    window.__wallDrainCompleteCallback();
    window.__wallDrainCompleteCallback = undefined;
}
```

And in `BatchCoordinator._setupBatch()` (alongside the existing `__curtainWallDrainCompleteCallback` registration):
```typescript
window.__wallDrainCompleteCallback = () => this.signalBuildQueueDrained();
```

Or use the existing `signalBuildQueueDrained()` public API directly if the wall builder has access to the `batchCoordinator` singleton.

---

## 4. Second-Priority Fix: G1 — `wallStore.addMany()` (PERF-ADDMANY)

**Symptom**: GPU geometry count grew 744 % (25 → 211 meshes) in the monitor log — every `wallStore.add()` triggers `WallBuilder._onStoreChanged()` which calls `_buildWall()` synchronously for the newly-added wall, causing N×O(n) store re-scans.

**Fix** (mirrors `PERF-ADDMANY` in CW):
1. Add `addMany(walls: WallData[]): void` to `WallStore` (single Immer draft, N `add` events batched).
2. In `CreateWallsOnAllSlabsCommand._processSlabs()`, accumulate all `WallData` objects in a local array, then call `wallStore.addMany(allWalls)` once after the slab loop.
3. Guard `WallBuilder._onStoreChanged()` to no-op during `batchCoordinator.isBatching` (already present for room observer; same pattern).

**Estimated saving**: 400–700 ms for a 50-wall batch (mirrors CW measurement of 15–135 ms/slab eliminated).

---

## 5. Third-Priority Fix: G2 — Shader Prewarm

**Symptom**: First wall batch produces a 800–1 200 ms LONGTASK during which the pyramid animation freezes (now partially mitigated by the CSS animation fix in `BatchLoadingIndicator`).

**Fix** (mirrors `PERF-PREWARM-ONCE`):
```typescript
private static _shadersPrewarmed = false;

private _prewarmWallShaders(scene: THREE.Scene, renderer: THREE.WebGLRenderer): void {
    if (CreateWallsOnAllSlabsCommand._shadersPrewarmed) return;
    CreateWallsOnAllSlabsCommand._shadersPrewarmed = true;
    // Render 2 probe InstancedMesh objects (wall face + cap material) at
    // (0,0,-99999) so the GPU compiles all wall PSO variants before geometry
    // arrives. Remove probes after one render frame.
    // ... same approach as CurtainWallsOnAllSlabsCommand._prewarmCurtainWallShaders()
}
```

Call `_prewarmWallShaders()` **before** `batchCoordinator.runBatch()` so it runs while the loading overlay is already visible, hiding the GPU stall.

---

## 6. Patterns That Are Correctly Absent for Walls

The following CW patterns do **not** apply to walls and should NOT be adopted:

| CW Pattern | Why walls don't need it |
|-----------|------------------------|
| `skipRedetectRooms: true` | Walls define room boundaries — room redetection MUST run after a wall batch. |
| `skipPbrUpgrade: true` | Wall materials go through the PBR upgrade path (standard materials). |
| `window.__curtainWallRebuildControl` pause | Wall builder uses `window.__wallRebuildControl` which is already wired in `BatchCoordinator._setupBatch()`. |
| `addMany()` with `curtainWallStore` specific events | Wall store uses `WallStore` — implement `addMany()` there, not on the CW store. |

---

## 7. Adoption Roadmap

| Sprint | Task | Gap(s) |
|--------|------|--------|
| A42 (next) | `signalBuildQueueDrained()` in `WallBuilder` | G5 |
| A43 | `wallStore.addMany()` + inline slab loop in `CreateWallsOnAllSlabsCommand` | G1, G3 |
| A44 | Pre-generated ID pool in `CreateWallsOnAllSlabsCommand` | G4 |
| A45 | Wall shader prewarm | G2 |

Apply the same analysis to `CreateStairBatch.ts` and any future element-type batch commands — the same five patterns (addMany, prewarm, signalDrained, id-pool, inline-processing) form the standard PRYZM3 batch contract for all geometry-producing commands.
