# SPEC — Wall Movement & Endpoint-Handle Study

> **Status**: STUDY / proposed spec. **Created**: 2026-05-22.
> **Trigger**: architect feedback — "wall movement needs to be much more
> professional; endpoint spheres are too big and weak; grabbing a sphere freezes
> the scene." Benchmarks cited: `github.com/pascalorg/editor`, Autodesk Revit.
> **Governs**: `packages/input-host/WallEndpointController.ts`,
> `WallTransformController.ts`; the wall-edit interaction in 3D + plan.
> **Contract alignment**: C06 (tools/interaction), C04 (rendering/scheduling —
> no per-frame store writes), C03/§01 (commands are the only mutation path),
> §41 (preview visuals), §43 (camera).

## 1. Current architecture (AS-IS)

On `bim-selection-changed` for a wall, **two controllers activate at once**:

| Controller | Affordance | Moves | Mutation |
|------------|-----------|-------|----------|
| `WallTransformController` | 3-axis `TransformControls` gizmo on an invisible wall-oriented proxy | the **whole** wall | wallGroup.position live; store update on drag-end (in main.ts) |
| `WallEndpointController` | 2 sphere handles at `baseLine[0/1]` (visible + larger invisible hit-zone) | a **single endpoint** | visual-only during drag; one `UpdateWallBaselineCommand` on mouse-up |

The endpoint drag itself is correctly isolated (§LIVE-DRAG-ISOLATION): no store
writes per frame, single command on release — that part is sound and matches
professional practice.

## 2. Problems observed

1. **P1 — Two competing move systems active simultaneously.** A selected wall
   shows BOTH the move gizmo AND the endpoint spheres, both bound to pointer
   events on the same canvas. They can fight (gizmo drag vs sphere drag), and the
   user can't tell which affordance does what. Revit never does this — it shows
   *grips* for stretch and *drag-the-body* for move, never two overlapping gizmos.
2. **P2 — Endpoint spheres too large.** `HANDLE_RADIUS 0.26 m` (52 cm diameter)
   dominates short walls. *(Fixed 2026-05-22 → 0.13 m visual, 0.35 m hit-zone.)*
3. **P3 — Scene freeze on endpoint drag.** Two candidate root causes (a probe
   was added at `§WALL-DRAG-COMMIT` to disambiguate):
   - (a) **Rebuild cascade**: `UpdateWallBaselineCommand` → wall rebuild →
     room-topology redetect storm → long synchronous task / oscillation.
   - (b) **Stranded TransformControls**: the rebuild replaces the wallGroup; the
     `WallTransformController` proxy/attachment is left referencing a removed
     object → TransformControls throws *"attached object must be part of the
     scene graph"* every render frame → freeze (this exact mode is already
     documented in `WallTransformController.deactivate()`).
4. **P4 — "Weak" feel.** No snapping during the endpoint drag (ortho / endpoint /
   extension), no live dimension readout, no axis lock — so precise moves are hard.

## 3. How professional editors do it

- **Revit**: select a wall → endpoint **grips** (small filled squares/dots) to
  stretch each end along the wall axis; drag the **wall body** to move the whole
  wall; **temporary dimensions** show live length/offset and are directly
  editable; SHIFT constrains to the wall axis. Grips and body-move are mutually
  exclusive interactions, never two gizmos at once.
- **pascalorg/editor** & SketchUp-style web editors: lightweight endpoint grips,
  hover highlight, drag to stretch with inferencing (axis/endpoint snap), commit
  on release, single undo step. No heavyweight transform gizmo competing with
  the grips.

## 4. Recommended robust strategy (TO-BE)

**S1 — One interaction model, mutually exclusive.**
- Endpoint **grips** (the spheres) = stretch an endpoint.
- Drag the **wall body** = move the whole wall (keep `TransformControls` for this
  OR replace with a body-drag; either way only ONE is interactive at a time).
- While an endpoint grip drag is active, **disable `TransformControls`**
  (`transformControls.enabled = false`) and re-enable on release. Requires wiring
  a `TransformControls` reference (or a shared "wall edit mode" flag) into
  `WallEndpointController`. This kills P1 and removes the gizmo-stranding path of P3(b).

**S2 — Fix the freeze (P3).** Use the `§WALL-DRAG-COMMIT` probe to confirm:
- If the hang is inside `execute()` → apply the room-redetect pause/`_withPausedObservers` pattern (already used for undo/redo) around the baseline commit, and debounce room redetection.
- If it's the stranded gizmo → before the commit, `deactivate()` the
  `WallTransformController` (or have the rebuild path detach TC before removing
  the old wallGroup), then re-activate on the rebuilt group.

**S3 — Professional feel (P4).** During the endpoint drag, reuse the existing
plan snap engine: endpoint snap to nearby wall ends, axis (ortho) lock with
SHIFT, extension lines; show a live length dimension (reuse `DimensionPreview`).
Preview lines/handles in the unified PRYZM purple (§41).

**S4 — Visuals.** Smaller grips (done), `depthTest:false` so they stay visible,
hover → lighter, active → amber; consistent across plan and 3D.

## 5. Phased plan

1. **Done (2026-05-22)**: halve grip size; add `§WALL-DRAG-COMMIT` freeze probe.
2. **Next**: disable `TransformControls` during an endpoint grip drag (S1) +
   confirm freeze cause from the probe and apply S2.
3. **Then**: snapping + live dimension during endpoint drag (S3).
4. **Then**: unify so only one affordance is interactive at a time; consider
   replacing the whole-wall gizmo with a body-drag for a Revit-like feel.

## 6. Verification gate

```
1. Select a wall. MUST: small grips at both ends; ONE move affordance interactive.
2. Drag an endpoint grip. MUST: grip turns amber; wall stretches in preview;
   NO freeze; release commits one undoable step. Console: §WALL-DRAG-COMMIT done in <Nms>.
3. Drag the wall body. MUST: whole wall moves; endpoints follow; one undo step.
4. SHIFT during endpoint drag. MUST: constrain to wall axis (after S3).
```
