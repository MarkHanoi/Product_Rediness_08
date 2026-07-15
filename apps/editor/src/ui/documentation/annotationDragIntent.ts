// §FIX-DIM-ASSOCIATIVE-REFERENCES (L-287) — WHAT A DRAG MEANS.
//
// Dragging a dimension does NOT mean "move the two points I measured". It means "put the
// dimension LINE somewhere else" — forward and backward along its own perpendicular. The
// measured points belong to the model; the line belongs to the drawing.
//
// The old drag translated every model point by the world delta and stamped the result into
// `references[i].cachedPosition`, so a user who nudged a dim out of the way silently
// changed what it measured. This module is the replacement: a PURE function from
// (annotation, world delta) to a PRESENTATION patch — and a presentation patch has no way
// to express "change the reference", because `UpdateAnnotationPresentationCommand` has no
// such field.
//
// PURE: no stores, no THREE, no window — so "a drag never changes the value" is a unit
// test, not a hope.

import type { AnnotationElement } from '@pryzm/plugin-annotations';
import type { AnnotationPresentationPatch } from '@pryzm/plugin-annotations';

/** Annotation types whose model points are a MEASUREMENT (a cache of the references). */
const MEASURED_TYPES: ReadonlySet<string> = new Set([
  'linear-dim', 'linear-dimension', 'angular-dim', 'radius-dim', 'diameter-dim', 'slope-dim',
]);

export function isMeasuredAnnotation(type: string): boolean {
  return MEASURED_TYPES.has(type);
}

/** A direction in the VIEW's own plane: H = the view's horizontal axis, V = its vertical one. */
export interface Vec2HV { h: number; v: number }

/**
 * §FIX-DIM-DRAG-FRAME (L-297) — project a world vector/point into the ACTIVE VIEW's (H, V)
 * plane. This is `PlanViewAnnotationRenderer._ptH`/`_ptV`, restated as a pure function:
 *
 *   plan            H = x                      V = z
 *   section / elev  H = hSign · world[hAxis]   V = y   (height)
 *
 * It is the ONE projection the drag planner is allowed to use, because it is the one the
 * RENDERER draws with. Where the two disagree, the drawing and the gesture are in different
 * spaces — which is the entire content of this bug.
 */
export function projectToPlane(
  p: { x: number; y: number; z: number },
  frame: ViewPlaneFrame,
): Vec2HV {
  if (!frame.isVertical) return { h: p.x, v: p.z };
  return { h: frame.hSign * (frame.hWorldAxis === 'x' ? p.x : p.z), v: p.y };
}

/**
 * The unit vector the dimension LINE is offset along — the same one the renderer uses
 * (`_renderLinearDim`: `side = leftPerp(measurementDir)`), so a drag of one metre along it
 * moves the line by exactly one metre on screen.
 *
 * §FIX-DIM-DRAG-FRAME (L-297) — IN THE VIEW'S OWN PLANE, AND ONLY THERE.
 *
 * This function used to read `measurementNormal.x` / `.z` and hand back a PLAN vector, then
 * `planAnnotationDrag` paired its `.z` with the drag's VERTICAL component. In a plan that is
 * right by coincidence (V *is* world Z). In an ELEVATION V is world Y, so the vertical drag was
 * multiplied by a plan vector's depth component — a number from a space the user cannot see.
 *
 * Concretely, for a horizontal elevation chain the executor stamps
 * `measurementNormal = (hSign, 0, 0)` (see `elevationHSegmentToAnnotation`). The renderer
 * projects it through `_ptH`, which applies `hSign` AGAIN — so the drawn offset axis is `+V`
 * regardless of the sign, while the old drag axis carried the raw `hSign`. On every `hSign = -1`
 * elevation (the mirrored façades) that is an exact SIGN FLIP: drag down, the line goes up. That
 * is the founder's inversion, and it is not a sign typo — it is a missing projection.
 *
 * It also fixes the SILENT half of the same bug: a VERTICAL elevation dim stamps
 * `measurementNormal = (0, 1, 0)` — WORLD UP. Its `.x`/`.z` are both zero and its two model
 * points differ only in `y`, so the old plan-space maths fell through to the `p→q` fallback,
 * found `len ≈ 0`, returned null — and the dimension could not be dragged AT ALL. Projected into
 * the view plane it is simply `(h = 0, v = 1)`, exactly as the renderer sees it.
 *
 * The branch condition (`is there a usable measurement normal?`) is evaluated on the PROJECTED
 * components with the renderer's own 1e-3 threshold, so render and drag cannot take different
 * branches for the same annotation.
 *
 * Without a normal, the direction is p1→p2 in view space (an 'aligned' dim on an angled façade).
 */
export function dimOffsetAxis(
  ann: AnnotationElement,
  frame: ViewPlaneFrame = PLAN_FRAME,
): Vec2HV | null {
  const mn = ann.geometry2D.measurementNormal;
  const m = mn ? projectToPlane(mn, frame) : null;

  let dh: number;
  let dv: number;
  if (m && (Math.abs(m.h) > 1e-3 || Math.abs(m.v) > 1e-3)) {
    dh = m.h; dv = m.v;
  } else {
    const [p, q] = ann.geometry2D.modelPoints ?? [];
    if (!p || !q) return null;
    const a = projectToPlane(p, frame);
    const b = projectToPlane(q, frame);
    dh = b.h - a.h; dv = b.v - a.v;
  }
  const len = Math.hypot(dh, dv);
  if (len < 1e-9) return null;
  // leftPerp of the measurement direction, in the VIEW plane — bit-for-bit the renderer's
  // `sideX = -dirZ; sideZ = dirX` on its own (h, v) pair.
  return { h: -(dv / len), v: dh / len };
}

/**
 * Plan a drag as a PRESENTATION change.
 *
 *   • a DIMENSION  → a new `offset`: the drag delta projected onto the line's own
 *                    perpendicular. The measured points do not move. The VALUE cannot
 *                    change, because the value is derived from the references and this
 *                    patch cannot reach them.
 *   • a TAG/NOTE   → a new `symbolPoint`: the bubble moves, its leader ANCHOR does not
 *                    (the anchor is on the element — it is a fact about the model).
 *
 * Returns null when the annotation has nothing draggable (e.g. a degenerate dim).
 */
export function planAnnotationDrag(
  ann: AnnotationElement,
  origGeometry2D: AnnotationElement['geometry2D'],
  dH: number,
  dV: number,
  frame: ViewPlaneFrame = PLAN_FRAME,
): AnnotationPresentationPatch | null {
  if (isMeasuredAnnotation(ann.type)) {
    const axis = dimOffsetAxis(ann, frame);
    if (!axis) return null;
    // Signed component of the drag along the offset axis — "forward and backward".
    //
    // A DIMENSION genuinely is 1-D in its presentation: its line moves perpendicular to what
    // it measures, and nowhere else. That was always true and it stays true — but §FIX-DIM-DRAG-FRAME
    // (L-297) is the lesson that 1-D IS NOT 1-D IN THE RIGHT SPACE. The dimensionality and the
    // FRAME are independent properties: this branch had the first and not the second, and the
    // TAG branch below was fixed (L-291c) without anyone asking which axis the dim was 1-D
    // ALONG. Both branches now take their frame from the SAME `ViewPlaneFrame` — there is no
    // `if (isElevation)` anywhere in this file, and there must never be one.
    //
    // Both `dH`/`dV` (from `PlanViewCanvas.screenToWorld`) and `axis` (from `projectToPlane`)
    // are now in the view's (H, V) plane, which is also the space `geometry2D.offset` is
    // consumed in (`_renderLinearDim` adds `side · offset` to the PROJECTED reference point).
    // One space, end to end.
    const delta = dH * axis.h + dV * axis.v;
    return { offset: (origGeometry2D.offset ?? 0) + delta };
  }

  const pts = origGeometry2D.modelPoints ?? [];
  const symbol = pts.length >= 2 ? pts[pts.length - 1] : pts[0];
  if (!symbol) return null;

  // §FIX-TAG-DRAG-2D (L-291c) — A TAG BUBBLE IS A FREE 2-D PLACEMENT, IN THE VIEW'S OWN PLANE.
  //
  // The founder: "they only move left or right — it would be great if they would move up and
  // down." The RECORD was never the constraint; this function was. It used to write
  //     { x: symbol.x + dWorldX, y: symbol.y, z: symbol.z + dWorldZ }
  // — i.e. it moved the bubble in the PLAN axes and left world Y HARDCODED. In a plan that is
  // right by coincidence (screen = XZ). In an ELEVATION the screen's vertical axis IS world Y,
  // so dragging a tag upward wrote world Z — the DEPTH axis, invisible in that view — and the
  // bubble slid sideways and refused to climb. The plan-first disease, in the drag handler.
  //
  // The delta now travels the view's plane, exactly as the renderer projects through it: V is
  // world Y in a vertical view, world Z in a plan. Nothing about the leader changes — its
  // anchor (`modelPoints[0]`) is on the ELEMENT and this patch cannot reach it (L-287), so the
  // leader simply STRETCHES to wherever the bubble now is.
  return { symbolPoint: offsetInPlane(symbol, dH, dV, frame) };
}

/** The view's (H, V) plane — the same one `ViewPlane`/`PlanViewCanvas` already speak. */
export interface ViewPlaneFrame {
  readonly isVertical: boolean;
  readonly hWorldAxis: 'x' | 'z';
  readonly hSign: 1 | -1;
}

/** A plan: H = world X, V = world Z. The default, and now an EXPLICIT one. */
export const PLAN_FRAME: ViewPlaneFrame = { isVertical: false, hWorldAxis: 'x', hSign: 1 };

/**
 * Move a world point by a screen-plane delta, IN THE VIEW'S PLANE.
 *
 * PURE + exported, so "a diagonal drag moves both axes, in either projection" is a unit test
 * rather than a hope.
 */
export function offsetInPlane(
  p: { x: number; y: number; z: number },
  dH: number,
  dV: number,
  frame: ViewPlaneFrame,
): { x: number; y: number; z: number } {
  if (!frame.isVertical) {
    // PLAN: H = X, V = Z. (Depth — world Y — is not a thing you can drag on a plan.)
    return { x: p.x + dH, y: p.y, z: p.z + dV };
  }
  // ELEVATION / SECTION: V is world Y (height). H is the view's horizontal world axis.
  //
  // §FIX-DIM-DRAG-FRAME (L-297) — THE H DELTA MUST BE UN-SIGNED BACK INTO WORLD.
  // `screenToWorld` reports H in the CANVAS's H slot, which is `hSign · world[hAxis]`
  // (`PlanViewCanvas._worldPointToCanvasH`), and this function writes a WORLD point that the
  // renderer will re-project through `_ptH` — applying `hSign` a second time. `hSign` is its own
  // inverse, so `worldH = hSign · canvasH`: without this factor a tag dragged RIGHT on a mirrored
  // (hSign = -1) façade was written LEFT in world and drew itself moving left. Exactly the same
  // missing projection as the dimension axis above — one frame, applied everywhere, both ways.
  // (`elevationHSegmentToAnnotation` inverts H the same way when it bakes its model points.)
  const dWorldH = frame.hSign * dH;
  return frame.hWorldAxis === 'x'
    ? { x: p.x + dWorldH, y: p.y + dV, z: p.z }
    : { x: p.x, y: p.y + dV, z: p.z + dWorldH };
}
