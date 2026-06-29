# ADR-061 — WebGL2 continuous render-on-move & wall-drag rebuild deferral

- **Status:** ACCEPTED (2026-06-29) — IMPLEMENTED.
- **Owner:** editor engine (`apps/editor/src/engine`) + renderer (`@pryzm/renderer-three`).
- **Affects:** `RenderPipelineManager` (lightweight WebGL render path),
  `apps/editor/src/engine/initScene.ts` (render bridge + live-swap),
  `apps/editor/src/engine/WallRebuildCoordinator.ts`,
  `apps/editor/src/engine/registerTransformDragHandler.ts`.
- **References:** [C04](../contracts/C04-RENDERING-AND-SCHEDULING.md) (single THREE owner P2,
  single rAF P3), [ADR-057](./ADR-057-realtime-geometry-and-view-interactivity.md)
  (realtime geometry editing — door-move drag-end commit pattern),
  [ADR-0076 §PERF-WEBGPU-FRAGMENT] (the WebGL backend default + corner toggle),
  [ADR-0077 §RENDERER-LIVE-SWAP] (live backend swap).

## Context

Two WebGL2-backend interaction defects surfaced once the founder set the default GPU backend
preference to `'webgl'` (2026-06-25, ADR-0076 §PERF-WEBGPU-FRAGMENT). On that default the
renderer is a `THREE.WebGPURenderer` constructed with `forceWebGL: true`, so its resolved backend
is the **WebGL2 backend** (`RendererBackend === 'webgl-fallback'`). WebGPU (native) is unaffected.

### Bug 1 — WebGL navigation is "stuck": no continuous repaint while orbiting/panning

In Phase 5 the PRYZM renderer is the **sole** renderer: OBC's `PostproductionRenderer` is locked
to `MANUAL` and silenced, and `updateIfManualMode` (which set `world.renderer.needsUpdate` on
camera `'update'`) is **removed** (`initScene.ts` §"Silence OBC's camera-driven render trigger").
The single rAF loop drives only the **PASCAL** callback → `RenderPipelineManager.render()`.

`RenderPipelineManager.bind()` activates the TSL pipeline **only for a real WebGPU backend**
(`isRealWebGPUBackend`, §PERF-WEBGL2-NO-TSL). On the `'webgl-fallback'` backend the TSL pipeline
stays OFF (`_webGpuActive === false`) and `render()` **early-returns** — so on this path
**nothing paints the scene per frame.** The viewport only repainted when some unrelated code path
happened to drive a render (e.g. shadow update on camera `'rest'`), i.e. *after* motion stopped —
exactly the reported "navigation is stuck until you let go" symptom. Native WebGPU renders every
frame via the TSL pipeline and is smooth; `'webgl-only'` (the plain-`WebGLRenderer` last resort,
Phase 5 inactive) renders via OBC's own AUTO loop and is also fine.

### Bug 2 — freeze when moving a wall that hosts a door/window

Moving a wall via the 3D gizmo / endpoint handle commits a **single** `wall.updateBaseline` on
drag-END (`registerTransformDragHandler.ts`, `WallEndpointController.onMouseUp`); the live mesh
follows the gizmo visually (`WallTransformController`, no store write). That commit bumps the
wall's `_renderVersion`, which schedules `WallRebuildCoordinator._flush` — a **whole-level**
`WallJoinResolver.resolveLevel` + per-wall `buildWall` that re-cuts every hosted opening (the
`[WallOccupancyStore] canPlace OK` flood) — plus a room redetect and a plan re-projection. For a
wall hosting a door this whole-level rebuild runs **synchronously on the commit frame**, blocking
it. (Room redetect and plan re-projection are already 300 ms-debounced, so they coalesce; the
dominant synchronous cost is the whole-level `_flush`.)

ADR-057 established the door-move principle: during a live edit, do the minimal visual update and
defer the authoritative geometry rebuild. ADR-057 P1 made an *openings-only* offset edit O(1), but
a wall **baseline** move is a genuine baseline delta and (correctly) takes the whole-level path.
The gap: that whole-level rebuild was never deferred off the interaction frame.

## Decision

### Bug 1 — lightweight per-frame WebGL render path

Add `RenderPipelineManager.setLightweightWebGlRender(active)`. When enabled, `render()` issues a
direct `renderer.render(scene, camera)` every frame (before the `_webGpuActive` early-return),
using the scene/camera/renderer already captured by `bind()`. `initScene` enables it **only** for
the Phase-5 `'webgl-fallback'` path (boot **and** live-swap); it is left OFF for native WebGPU (the
TSL pipeline renders) and for `'webgl-only'` (OBC's AUTO loop renders).

This drives a continuous repaint during orbit/pan/zoom **without adding a second rAF loop** (P3):
the existing pascal callback already runs once per rAF from the single `@pryzm/frame-scheduler`
loop, and the camera-controls `'controlstart'`/`'update'` handlers already call
`FrameScheduler.beginMotion()` to keep that loop alive for the whole drag + damping tail. The
direct render uses `renderer-three`'s renderer handle only (P2). The path honours `setSuspended()`
(heavy-op guard) so IFC streaming etc. still pause it.

### Bug 2 — defer the whole-level wall rebuild to drag-END

Introduce a typed global `window.__wallDragInProgress`, set on TransformControls
`dragging-changed`(true) for a wall and cleared on drag-END (before the authoritative commit's own
store mutation, so that mutation takes the immediate path). While the flag is set,
`WallRebuildCoordinator._scheduleFlush` **queues** the wall event but does **not** schedule the
expensive `_flush`. On release a drag-end safety-net (`resumeAndFlushDeferredDrag`) drains any
queued events once. The live mesh continues to follow the gizmo via `WallTransformController`
(visual-only). Net effect: the whole-level resolve + room redetect + plan re-projection run **once
on release** instead of blocking the interaction frame — the door-move principle (ADR-057) applied
to wall-drag-with-hosted-opening.

This is intentionally minimal: every wall-move path already commits once at drag-end, so the flag
primarily (a) defends against any path that mutates the store repeatedly mid-drag and (b) keeps the
single heavy rebuild off the frame where the user releases. Join correctness is unchanged — the
same whole-level `resolveLevel` runs, just deferred.

## Alternatives considered

- **Re-wire `updateIfManualMode` / drive the OBC WebGL renderer on the webgl-fallback path.**
  Rejected: in Phase 5 OBC is deliberately silenced (its WebGL shadow-map render destroys PRYZM's
  shadow textures mid-submit). The PRYZM renderer must own the paint; the fix belongs in
  `RenderPipelineManager`, not by reviving OBC's loop.
- **Mark the frame dirty and render-on-demand for WebGL2.** More machinery for no benefit during
  motion (the loop is already alive via `beginMotion`); a plain per-frame render is simpler and the
  scene is cheap on the WebGL backend (post-FX is off by design).
- **Jamb-local wall rebuild during drag (ADR-057 P3).** The proper structural end-state, but a much
  larger change; deferring the existing whole-level rebuild to release removes the freeze now with
  no join-correctness risk.

## Consequences

**Positive**
- WebGL2 orbit/pan/zoom repaints continuously and smoothly (matches WebGPU).
- Dragging a wall with a hosted door/window no longer freezes; the heavy rebuild runs once on
  release.
- No second rAF loop (P3); THREE access stays inside `renderer-three` (P2); new globals are typed
  (P4); `setLightweightWebGlRender` carries no I/O and needs no span (it is a pure setter).

**Negative / risk**
- The lightweight path must stay OFF for native WebGPU and `'webgl-only'` or the scene would
  double-render; gated on the resolved backend at both bind sites and covered by unit tests.
- The wall-drag flag must always clear on drag-END (covered by a safety-net clear+drain for the
  sub-threshold-move case); a stuck flag would defer wall rebuilds — mitigated by clearing in the
  unconditional drag-end block.

## Acceptance criteria

- On the `'webgl-fallback'` backend, `RenderPipelineManager.render()` issues a `renderer.render`
  every call once `setLightweightWebGlRender(true)` is set, and never when it is false
  (`RenderPipelineManager.backend.test.ts`).
- A wall store mutation arriving while `__wallDragInProgress` is set schedules **no** flush; the
  drag-end drain schedules exactly one; an undragged mutation schedules immediately
  (`apps/editor/__tests__/wallDragDefer.test.ts`).
- In-browser (WebGL backend): orbit is continuous/smooth; dragging a wall-with-door shows no
  freeze, with the heavy rebuild only on release.
