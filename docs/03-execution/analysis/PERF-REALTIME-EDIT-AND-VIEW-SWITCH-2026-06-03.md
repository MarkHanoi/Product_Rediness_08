# PERF — Realtime Edit Responsiveness & View-Switch Speed (2026-06-03)

**Scope:** Why PRYZM feels laggy vs. `@thatopen/components` (OBC) on two interactions —
**(A) moving a hosted door** and **(B) switching 3D ↔ plan view**. Read-mostly code trace
with `file:line` evidence, root-cause, and ranked fixes.

**Headline finding:** The view-switch is **already fast** (camera-mode toggle + cached
projection); it is *not* the real gap. The real gap is **door-move**, where the visible door
mesh moves instantly (TransformControls) but the **host wall hole** is rebuilt by a
**synchronous, full-level join-resolve + dispose/recreate-all-geometry** pass one rAF after
drag-end. PRYZM has, by design, **no per-drag wall rebuild** (commit-only), but the
commit-time rebuild is **whole-level, not incremental**, and that is what reads as "not
real-time" relative to OBC's per-fragment transform.

---

## Part 1 — Door-move responsiveness (the real gap)

### 1.1 The actual code path (drag → commit → wall hole rebuild)

A hosted door (door-in-wall) has exactly one free coordinate: `offset` along the wall
baseline. The drag pipeline is:

1. **During the drag — visual only, no command.**
   `HostedElementDragController.activateFor()` attaches `TransformControls`, constrains it to
   the wall-direction X axis, and draws the amber rail
   (`packages/input-host/src/HostedElementDragController.ts:100-130`). While the user drags,
   **TransformControls moves the door `THREE.Object3D` directly every frame** — no command, no
   store write, no wall rebuild. So *the door itself is already instant.*

2. **At drag-end — single absolute command.**
   `registerTransformDragHandler` listens for `dragging-changed` and, on release
   (`!event.value`), routes door/window to `hostedDragController.handleDragEnd(obj)`
   (`apps/editor/src/engine/registerTransformDragHandler.ts:46-58`). `handleDragEnd` projects
   the world position onto the wall baseline, clamps it, and dispatches **one**
   `door.setOffset` command via the bus
   (`packages/input-host/src/HostedElementDragController.ts:136-205`). A sub-threshold drag
   (`< MIN_MOVE_THRESHOLD = 0.005 m`) is snapped back with no command (`:170-177`).

   *Note:* there is **no per-frame `door.move` / `door.setOffset` dispatch.** The plan-view
   2D drag path (`PlanElementDragController`) behaves the same way (commit on release).

3. **Command → store mutation.**
   `door.setOffset` → `SetDoorOffsetCommand.execute()`
   (`packages/command-registry/src/doors/SetDoorOffsetCommand.ts:48-55`): writes
   `wallStore.updateDoor(doorId, {offset})` and `doorStore.update(doorId, {offset})`.
   `affectedStores = ["door","wall"]` (`:24`).

4. **`wallStore.updateDoor` rewrites the host wall's opening + bumps render version.**
   `packages/geometry-wall/src/WallStore.ts:1083-1123`: it maps over `wall.openings`, updates
   the matching opening's `offset`, clones the wall with
   `_renderVersion = (prev ?? 0) + 1` (`:1117`), and `emit('update', frozenWall)`. The comment
   at `:1109-1117` is explicit: the version bump exists *so the WallFragmentBuilder cache key
   changes and the segmented wall actually rebuilds* — "this does NOT enable the CSG
   single-volume upgrade — that path self-fails (wasm) and keeps the freshly-rebuilt
   segments" (`:1115-1116`).

5. **Wall `update` event → batched, rAF-deferred, WHOLE-LEVEL rebuild.**
   `WallRebuildCoordinator` is subscribed to the wall store
   (`apps/editor/src/engine/WallRebuildCoordinator.ts:173-176`). `_scheduleFlush` queues the
   wall id and schedules a single `_flush()` on the next frame
   (`:218-236`). `_flush()` (`:258-482`) is the hot path and does **per affected level**:
   - `WallJoinResolver.resolveLevel(levelWalls, …)` over **every wall on the level**
     (`:305`) — recomputes miter joins for the whole storey, not just the edited wall.
   - `refreshV2Cache(specs)` building a spec array for **every wall on the level** (`:317-346`).
   - For each adjusted wall: `store.update(...)` + `builder.buildWall(...)` with a freshly
     resolved `OpeningRenderMap` (`:354-399`).
   - For the edited wall (not in `adjustments`): `builder.updateWall(...)` (`:401-414`).
   - `computeJunctionInfills(...)` + `_infillManager.update(...)` over the level (`:458-466`).
   - Then **re-runs `doorBuilder.rebuildForWall` + `windowBuilder.rebuildForWall` for every
     rebuilt wall** (`:436-439`) so the door/window meshes re-anchor to the new hole.

6. **`buildWall` disposes and recreates ALL child geometry of the wall.**
   `packages/geometry-wall/src/WallFragmentBuilder.ts:643-1100+`. Every `buildWall` call:
   `_disposeWallGroupChildren(wallGroup)` then rebuilds from scratch
   (`:678-685`). For a wall **with an opening**, the door's wall is NOT eligible for the
   GPU-instanced fast path (`isSimpleWall` requires `!_hasOpenings`, `:776-783`), so it takes
   the full mesh path. A plain wall with openings goes through `clusterOpenings` +
   segment construction; a **layered** wall with openings goes through
   `buildLayeredWallSegmentsAroundOpenings` (the grid path)
   (`:884-996`) — the more expensive of the two ("wall-opening seam: two paths").

### 1.2 Is it a full CSG rebuild per drag frame? — No. But the commit rebuild is whole-level.

- **No per-frame CSG.** There is no CSG, and no wall rebuild at all, *during* the drag —
  only TransformControls moving the mesh. The rebuild happens **once, at drag-end**, deferred
  to the next rAF via `FrameScheduler.scheduleOnce` (`WallRebuildCoordinator.ts:234`).
- **three-bvh-csg is effectively NOT on the door-move path.** The single-volume CSG producer
  (`apps/editor/src/engine/singleVolumeWallProducer.ts`) is gated on `window.__wallSingleVolume`
  (default-off) *and* the WallStore comment records that the CSG path self-fails (wasm) and
  the segmented `BoxGeometry` mesh is the permanent fallback
  (`WallStore.ts:1115-1116`). So the door-move cost is **CPU geometry construction (box
  segments / layered grid) + dispose/recreate + per-level join resolve**, not boolean CSG.
- **The expensive part is the WHOLE-LEVEL pass.** Moving one door triggers
  `WallJoinResolver.resolveLevel(levelWalls)` over the entire storey, an
  `OpeningRenderMap` re-resolution per wall, junction-infill recompute over the level, and a
  dispose/recreate of every adjusted wall's geometry. On a dense apartment level this is the
  user-perceptible hitch: a single long task one frame after release, scaling with **walls per
  level**, not with the one edited wall.

### 1.3 Quantification

| Property | Value | Evidence |
|---|---|---|
| Wall rebuild during drag? | **No** — visual transform only | `HostedElementDragController.ts:100-205` (commit on `handleDragEnd` only) |
| Rebuild trigger | One `door.setOffset` at drag-end | `registerTransformDragHandler.ts:54-58` |
| Rebuild timing | Deferred to next rAF (`scheduleOnce`), **synchronous once it runs** | `WallRebuildCoordinator.ts:234`, `_flush():258` |
| Rebuild scope | **Whole level**: `resolveLevel(levelWalls)` + per-wall `buildWall` + infill + door/window re-anchor | `WallRebuildCoordinator.ts:289-466` |
| Per-wall cost | Full `_disposeWallGroupChildren` + recreate; opening walls excluded from instancing | `WallFragmentBuilder.ts:678-685`, `:776-783` |
| CSG boolean on path? | **No** (flag-off + self-fails → segmented box fallback) | `WallStore.ts:1115-1116`; `singleVolumeWallProducer.ts:50` |
| Debounce/throttle | Single-frame coalesce only (`_pendingWallEvents` map, newer wins) | `WallRebuildCoordinator.ts:225-236` |

**Net:** door = instant; **wall hole = one whole-level synchronous rebuild, one frame after
release.** The lag is the level-wide rebuild scope, not per-frame CSG.

### 1.4 How OBC (`@thatopen/components`) achieves "instant"

PRYZM consumes OBC for the world/camera/renderer
(`packages/core-app-model/src/BimWorld.ts:1-25`; `apps/editor/src/engine/initScene.ts`). OBC's
interactivity model is **fragment/instance transforms**: geometry is authored once into
`FragmentsGroup` instanced meshes, and moving/editing an element updates an **instance matrix**
(or a small per-fragment buffer) rather than disposing and rebuilding the host geometry. The
authoritative boolean/expensive geometry is computed on import/commit, not per interaction.
That is exactly the decoupling PRYZM already applies to the *door mesh* (TransformControls) but
**not** to the *wall hole* (which still does a level-wide dispose/recreate at commit). The fix
direction is to make the wall-hole update as cheap and as local as the door transform already
is.

---

## Part 2 — 3D ↔ plan view switch (verified: already fast)

### 2.1 The path

- **`view.switch` is a pure store mutation.** `SwitchViewHandler` mutates only `active-view`
  (`plugins/view/src/handlers/SwitchView.ts:33-57`) — no scene rebuild, no reprojection in the
  handler. Camera animation is owned by `ViewController.switchTo()` at L5.
- **Switching projection is a camera-mode toggle, not a rebuild.**
  `apps/editor/src/engine/ViewController.ts:275-292`: perspective↔orthographic is
  `camera.projection.set('Perspective' | 'Orthographic')`, each a no-op when already in that
  mode. Per-view camera state is restored from `ViewCameraStateStore` / per-slot manager so
  re-entry doesn't recompute framing (`:116-148`).
- **Plan geometry is cached, not reprojected on every switch.** The plan pane draws
  pre-projected edge geometry from `ViewTechnicalDrawingCache` onto a Canvas2D context — "no
  THREE.js renderer is created for the secondary pane"
  (`apps/editor/src/engine/views/SplitViewManager.ts:1-23`). The cache is invalidated only on
  **geometry/IFC/project change**, then reprojected — not on a plain view toggle
  (`SplitViewManager.ts:500-520, 734-751, 866-896`).
- **Interactive feedback has a sub-50ms fast path.** `FastPathProjectorService` does a
  synchronous, main-thread, EdgesGeometry-only projection for drag feedback, explicitly
  targeted "< 50ms for up to 50 elements"
  (`packages/core-app-model/src/views/FastPathProjectorService.ts:1-90`). The heavy silhouette
  projection runs off-thread in `EdgeProjectorService` and only for final documentation output.
- **`ViewRenderCache`** further caches per-view `WebGLRenderTarget`s for non-interactive
  thumbnails/exports (`packages/core-app-model/src/views/ViewRenderCache.ts:1-67`).
- **CI budget exists and is generous.** The view-switch bench targets p95 < 200ms,
  hard-fail at 250ms (`apps/bench/src/benches/view-switch.bench.ts:1-13, 103`).

### 2.2 Verdict

The switch is a **camera projection toggle + cached-projection draw**, with caches keyed to
geometry change and a documented sub-50ms interactive projector. This matches the console
observations (FastPathProjectorService, LevelClipPlaneCache, registries). **The plan-switch is
already fast and is not the bottleneck.** The only residual cost is the *first* projection of a
view whose cache is cold (after a geometry edit) — and that is bounded by the worker path. No
change recommended here beyond keeping the cache warm.

---

## Part 3 — Fix options (ranked by impact ÷ effort)

### F1 — Incremental opening update instead of whole-level rebuild  ★ highest impact
On `door.setOffset` / `window.setOffset`, rebuild **only the one host wall** and re-anchor only
its hosted children — skip `WallJoinResolver.resolveLevel`, the level-wide `refreshV2Cache`,
and `computeJunctionInfills` entirely (an offset change does **not** move the wall baseline, so
joins and infills are invariant — confirmed by `cross.wall-room`'s "DOES NOT FIRE FOR …
wall.createOpening", `plugins/cross/src/wall-room.ts:33-40`). Concretely: detect "openings-only
delta" in `_flush` (baseline unchanged, only `openings[].offset/width` changed) and take a
single-wall branch that calls `buildWall(editedWall)` + `doorBuilder.rebuildForWall(editedWall)`
without touching neighbours.
- *Effort:* M (a new branch in `WallRebuildCoordinator._flush`).
- *Impact:* High — collapses an O(walls-per-level) pass to O(1) for the by-far most common edit.

### F2 — Move the door hole, don't rebuild the wall body  ★ high impact, more work
Reserve the door/window void as its own sub-mesh (or a stencil/clip region) so changing
`offset` only **re-positions/re-cuts the local opening segment**, not the whole wall group.
This is the OBC-style "transform the fragment, don't rebuild" model applied to the wall hole.
Pairs naturally with the existing segmented-box path (`clusterOpenings` →
per-segment meshes) by recomputing only the two jamb segments adjacent to the moved opening.
- *Effort:* L (touches `WallFragmentBuilder` opening segmentation + DoorBuilder anchoring).
- *Impact:* High — makes the commit nearly free even on dense walls.

### F3 — Live drag preview for the hole (visual decouple, authoritative commit)  ★ UX win
During the drag, update a lightweight **preview** of the hole position (the door mesh already
moves; add a cheap shadow-cut/outline at the new offset) and only run F1/F2 at drag-end. This
gives true "instant" perceived feedback identical to OBC even before F2 lands. Reuse the
existing `FastPathProjectorService` / preview infrastructure rather than a new system.
- *Effort:* M.  *Impact:* Medium-high (perceptual; pairs with F1/F2).

### F4 — Worker-offload / idle-defer the authoritative rebuild  ★ insurance
If F1/F2 still leave a hitch on very dense levels, run the authoritative segment/CSG
construction in a worker (the IFC fragments worker pattern at
`public/fragments-worker.mjs` is precedent) or defer it to `requestIdleCallback`, keeping the
preview from F3 on screen until it lands. Lowest priority — only needed if F1/F2 are
insufficient.
- *Effort:* L (worker marshalling of geometry).  *Impact:* Medium (tail-latency only).

### F5 — Keep the plan-switch as-is; only warm the cache  ★ no-op confirm
No change to view-switch architecture. Optionally pre-warm `ViewTechnicalDrawingCache` for the
plan view after a geometry-mutation commit (`bim-wall-mutation-committed` already fires —
`WallRebuildCoordinator.ts:472-481`) so the first post-edit switch is never cold.
- *Effort:* S.  *Impact:* Low (edge case only).

**Recommended sequence:** F1 (immediate, biggest win, low risk) → F3 (perceptual) → F2
(structural, makes it OBC-grade) → F4/F5 as insurance.

---

## Appendix — key files
- `packages/input-host/src/HostedElementDragController.ts` — door/window drag, commit-on-release.
- `apps/editor/src/engine/registerTransformDragHandler.ts` — `dragging-changed` router.
- `packages/command-registry/src/doors/SetDoorOffsetCommand.ts` — absolute-offset command.
- `packages/geometry-wall/src/WallStore.ts:1083-1123` — `updateDoor` opening rewrite + version bump.
- `apps/editor/src/engine/WallRebuildCoordinator.ts:258-482` — whole-level `_flush`.
- `packages/geometry-wall/src/WallFragmentBuilder.ts` — `buildWall` dispose/recreate, opening paths.
- `apps/editor/src/engine/singleVolumeWallProducer.ts` — CSG producer (flag-off, self-fails).
- `apps/editor/src/engine/ViewController.ts:275-292` — projection toggle.
- `apps/editor/src/engine/views/SplitViewManager.ts` — cached Canvas2D plan pane.
- `packages/core-app-model/src/views/FastPathProjectorService.ts` — sub-50ms interactive projection.
- `packages/core-app-model/src/views/ViewRenderCache.ts` — per-view render-target cache.
</content>
</invoke>
