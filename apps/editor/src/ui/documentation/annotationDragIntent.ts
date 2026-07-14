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

interface Vec2 { x: number; z: number }

/**
 * The unit vector the dimension LINE is offset along — the same one the renderer uses
 * (`_renderLinearDim`: `side = leftPerp(measurementDir)`), so a drag of one metre along it
 * moves the line by exactly one metre on screen.
 *
 * `measurementNormal` (stamped by the auto-dimension executor for cardinal strings) is the
 * measurement DIRECTION; the line offsets along its left perpendicular. Without one, the
 * direction is p1→p2 (an 'aligned' dim on an angled façade).
 */
export function dimOffsetAxis(ann: AnnotationElement): Vec2 | null {
  const mn = ann.geometry2D.measurementNormal;
  let dx: number;
  let dz: number;
  if (mn && (Math.abs(mn.x) > 1e-6 || Math.abs(mn.z) > 1e-6)) {
    dx = mn.x; dz = mn.z;
  } else {
    const [p, q] = ann.geometry2D.modelPoints ?? [];
    if (!p || !q) return null;
    dx = q.x - p.x; dz = q.z - p.z;
  }
  const len = Math.hypot(dx, dz);
  if (len < 1e-9) return null;
  // leftPerp of the measurement direction — the axis the renderer offsets the line along.
  return { x: -(dz / len), z: dx / len };
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
    const axis = dimOffsetAxis(ann);
    if (!axis) return null;
    // Signed component of the drag along the offset axis — "forward and backward".
    // A DIMENSION genuinely is 1-D in its presentation: its line moves perpendicular to what
    // it measures, and nowhere else. That is correct, and it stays.
    const delta = dH * axis.x + dV * axis.z;
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
  // ELEVATION / SECTION: V is world Y (height). H is the view's horizontal world axis, which
  // `screenToWorld` already reports in the canvas's own H slot — so it needs no re-signing here.
  return frame.hWorldAxis === 'x'
    ? { x: p.x + dH, y: p.y + dV, z: p.z }
    : { x: p.x, y: p.y + dV, z: p.z + dH };
}
