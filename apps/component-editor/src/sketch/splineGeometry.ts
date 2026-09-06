// splineGeometry — resolve a `SketchSpline`'s control points and sample it.
//
// ⭐ ONE resolver, consumed by the renderer, the hit-test and the tests. The
//    alternative — each of them walking `controlPoints` itself — is how the
//    picked curve and the drawn curve drift apart, and a pick that misses what
//    the user can see is indistinguishable from a broken tool.
//
// The sampling itself is `@pryzm/geometry-kernel`'s: this module resolves ids
// to coordinates and does nothing else. Pure — no DOM, no THREE.

import { sampleCubicBezierChainXZ, type Pt2 } from '@pryzm/geometry-kernel';
import type { EntityId, SketchEntity, SketchPoint, SketchSpline } from './entities.js';

/**
 * Screen-space chord tolerance for the sketch surface, in MILLIMETRES.
 *
 * The sketch works in mm; the kernel's default is `COINCIDENT_M` (metres), so
 * passing it unchanged would ask for 1000x the segments a 2D canvas can show.
 * This is a DISPLAY density, not a geometric tolerance — the bake re-samples
 * the same chain at the document's own tolerance, so nothing downstream
 * inherits this number.
 */
export const SKETCH_CHORD_MM = 0.5;

/** Resolve a spline's control points against a point lookup.
 *  Returns `null` when ANY control point is missing — a chain with a hole is
 *  not a shorter curve, and drawing a guess would be inventing geometry. */
export function splineControlPolygon(
  spline: SketchSpline,
  pointById: Readonly<Record<EntityId, SketchPoint>>,
): Pt2[] | null {
  const out: Pt2[] = [];
  for (const id of spline.controlPoints) {
    const p = pointById[id];
    if (!p) return null;
    out.push([p.x, p.z]);
  }
  return out;
}

/** Sample a spline into a polyline in sketch mm, or `null` if unresolvable. */
export function sampleSketchSpline(
  spline: SketchSpline,
  pointById: Readonly<Record<EntityId, SketchPoint>>,
  chordMm: number = SKETCH_CHORD_MM,
): Pt2[] | null {
  const controls = splineControlPolygon(spline, pointById);
  if (!controls) return null;
  return sampleCubicBezierChainXZ(controls, chordMm);
}

/** Build the point lookup a flat entity array implies. Used by the hit-test,
 *  which receives entities rather than a snapshot. */
export function pointLookup(
  entities: readonly SketchEntity[],
): Record<EntityId, SketchPoint> {
  const byId: Record<EntityId, SketchPoint> = {};
  for (const e of entities) if (e.kind === 'point') byId[e.id] = e;
  return byId;
}
