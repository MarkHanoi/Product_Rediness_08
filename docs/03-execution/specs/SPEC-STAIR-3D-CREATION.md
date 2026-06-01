# SPEC — Stair Creation in the 3D View

> **Status**: IMPLEMENTED (2026-05-23, type-clean; runtime verification pending —
> see §6 gate). Phases 1–4 of §4 landed; the legacy click-by-click `StairTool`
> remains as the `createStair` fallback. **Created**: 2026-05-22.
> **Trigger**: architect — "every element can be created in plan OR 3D except
> the stair, which is plan-only. Enable stair creation in 3D following the same
> '2D sketch' concept, adapted to 3D. Plan it carefully, no shortcuts."
> **Governs**: `packages/geometry-stair/stairPath/*`, `BimService.activateStairTool`,
> the stair plan-tool handlers.
> **Contract alignment**: C11 (element-creation pipeline), §41 (preview = PRYZM
> purple #6600FF), §43 (camera framing), C04 (no per-frame store writes).

## 1. Current architecture (AS-IS) — why stair is plan-only

Stair creation is a **2D path sketch**:

- `StairPathToolController` (`stairPath/StairPathToolController.ts`) orchestrates a
  state machine (idle → drawing → completed) for straight (I/L/U) and curved (C)
  stairs. It draws onto an **overlay `<canvas>`** via `StairPreviewRenderer` /
  `CurvedStairRenderer`.
- **The hard coupling**: its config requires `planViewCanvas: PlanViewCanvas`
  (StairPathToolController.ts:64-65) and uses it for **`worldToScreen` /
  `screenToWorld`**. Every click/move is transformed through the plan canvas's
  orthographic top-down coordinate system. There is no 3D path.
- `StairPathPlanToolHandler` forwards `PlanToolHandler` pointer callbacks (which
  only exist in the plan-view overlay) into the controller.
- **Everything downstream is already view-agnostic**: `StairSolver2D` /
  `CurvedStairSolver` produce flights+landings from the 2D polyline;
  `StairPathAdapter` dispatches `CreateStairCommand`; stairStore, semanticGraph,
  auto-opening, and railing proposals all fire identically regardless of origin.

**Conclusion:** only the *input/coordinate* layer is plan-bound. The solver,
preview model, and commit are reusable as-is. This is a contained, well-bounded
change — not a rewrite.

## 2. How the other tools sketch in 3D (the pattern to mirror)

Slab/Floor/Ceiling accept 3D drawing by resolving the cursor onto the **active
level's ground plane** via a camera raycast (e.g. `SlabTool.getPlanPoint` 3D
branch: `raycaster.ray.intersectPlane(Plane(0,1,0,-elevation))`), and by drawing
a **3D ghost preview** in the scene (lines/mesh tagged `userData.isPreview`,
PRYZM purple §41). Commit is the same command as the plan path.

The stair should mirror this: **the run polyline is sketched on the base-level
ground plane in 3D**, exactly as a slab outline is.

## 3. Recommended architecture (TO-BE)

**S1 — Abstract the coordinate transform behind an interface.**
Introduce `StairSketchCoordinateProvider`:

```ts
interface StairSketchCoordinateProvider {
  /** Screen (canvas px) → world XZ on the base-level ground plane, or null. */
  screenToWorld(sx: number, sy: number): { x: number; z: number } | null;
  /** World XZ → screen (canvas px) for overlay drawing. */
  worldToScreen(x: number, z: number): { sx: number; sy: number };
  /** Base-level elevation (Y) the sketch lives on. */
  readonly groundY: number;
}
```

- **Plan provider** — thin wrapper over `PlanViewCanvas.worldToScreen/screenToWorld`
  (today's behaviour; zero functional change).
- **3D provider** — `screenToWorld` = camera raycast onto `Plane(0,1,0,-groundY)`
  (reuse the slab/floor pattern, honour the `intersectPlane` null return);
  `worldToScreen` = `THREE.Vector3(x,groundY,z).project(camera)` → NDC → canvas px.

`StairPathToolController` takes a provider instead of a `PlanViewCanvas`. The
overlay canvas keeps working in BOTH views because `worldToScreen` now projects
through whichever camera is active (the perspective overlay tracks the 3D view).

**S2 — 3D ghost preview (optional polish).** In addition to the overlay polyline,
draw a 3D ghost of the run footprint on the ground plane (PRYZM purple, §41) so
the sketch reads in perspective. The overlay alone is sufficient for v1.

**S3 — Activation routing.** `BimService.activateStairTool` currently routes to
the plan handler. Add: if no plan view is active (3D viewport), construct the
controller with the **3D provider**, bind pointer events to the main canvas, and
forward click/move/dblclick/Enter to the same controller methods
(`feedClick`/`feedMove`/`feedDoubleClick`). ESC/Enter/Backspace already handled.

**S4 — Commit unchanged.** `StairPathAdapter` → `CreateStairCommand` is reused
verbatim — guarantees parity with plan-created stairs (auto-opening, railings,
persistence, undo).

**S5 — First-element framing.** On 3D commit while split view is active, the
existing §13-CAM / C11 §12 framing applies; standalone 3D uses §43 framing.

## 4. Phased plan

1. ✅ **Extract** `StairSketchCoordinateProvider`; refactor controller to use it;
   wrap `PlanViewCanvas` as the plan provider (no behaviour change — pure refactor).
   *Done 2026-05-23:* `StairSketchCoordinateProvider.ts` + `planViewSketchProvider`;
   the controller resolves `_coordProvider` once (explicit provider wins, else wraps
   `planViewCanvas`) and both overlay draw calls go through it. `planViewCanvas` is
   now optional in `StairPathToolConfig`.
2. ✅ **Implement** the 3D provider (project) + ground-plane raycast (screen→world).
   *Done 2026-05-23:* `StairPath3DToolHandler.worldToScreen` projects through the
   active perspective camera; pointer events resolve via
   `raycaster.ray.intersectPlane(Plane(0,1,0,-groundY))` (honours the null return).
3. ✅ **Wire** the activation 3D branch + main-canvas pointer forwarding.
   *Done 2026-05-23:* `BimService.activateStairPathTool` routes to
   `window.stairPath3DTool` when `planView2DCreationMode.isInPlanView(world.camera.three)`
   is false (3D view); the plan/split-plan-pane path is unchanged. The handler is
   constructed in `initTools` with live `getWorld`/level accessors. Pointer
   `down → feedClick`, `move → feedMove`, `dblclick → feedDoubleClick`,
   `contextmenu → feedRightClick`; keyboard (Enter/Esc/Backspace/Shift) stays in
   the controller's own document listeners.
4. ✅ **Preview**: the overlay canvas is sized to the 3D canvas and re-projects on
   every `feedMove` (orbit is a drag → pointermove → re-project, so the overlay
   tracks the 3D camera). The optional standalone 3D ghost (S2) is deferred — the
   overlay is sufficient for v1.
5. ⏳ **Verify** I/L/U + curved stairs create identically in 3D and plan (the §6
   gate — needs the architect's runtime pass; type-clean as of 2026-05-23).

## 5. Risks & mitigations

- **Perspective overlay accuracy** — `worldToScreen` via camera projection is
  exact; the overlay is screen-space so it stays crisp. Mitigation: clamp/skip
  points behind the camera (w ≤ 0).
- **Snap/ortho in 3D** — SHIFT 90° snap operates in world XZ (unchanged); works
  in both providers.
- **Regression risk to plan stairs** — phase 1 is a pure refactor behind an
  interface; existing plan-view stair behaviour must be byte-for-byte preserved
  (the plan provider just forwards to PlanViewCanvas).

## 6. Verification gate

```
1. In the 3D view, activate Stair (I). Click start, click end, Enter.
   MUST: ghost/overlay tracks the cursor on the ground plane; stair commits;
   identical geometry to the same stair drawn in plan view.
2. Repeat for L, U, and curved (C). MUST: parity with plan creation.
3. Draw a stair in PLAN view. MUST: unchanged from today (refactor regression gate).
4. 3D commit in split view. MUST: §13-CAM frames the new stair once.
```
