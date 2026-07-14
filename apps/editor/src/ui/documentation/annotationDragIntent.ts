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
  dWorldX: number,
  dWorldZ: number,
): AnnotationPresentationPatch | null {
  if (isMeasuredAnnotation(ann.type)) {
    const axis = dimOffsetAxis(ann);
    if (!axis) return null;
    // Signed component of the drag along the offset axis — "forward and backward".
    const delta = dWorldX * axis.x + dWorldZ * axis.z;
    return { offset: (origGeometry2D.offset ?? 0) + delta };
  }

  const pts = origGeometry2D.modelPoints ?? [];
  const symbol = pts.length >= 2 ? pts[pts.length - 1] : pts[0];
  if (!symbol) return null;
  return {
    symbolPoint: { x: symbol.x + dWorldX, y: symbol.y, z: symbol.z + dWorldZ },
  };
}
