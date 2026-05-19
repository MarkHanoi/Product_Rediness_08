// WallPath — lifted (and de-THREE'd) from
// `src/elements/walls/PathResolver.ts` + `WallPathBuilder.ts`
// per S08-T1 (`phases/PHASE-1B-Q2-M4-M6-WALL-END-TO-END.md` line 505).
//
// PRYZM 1's PathResolver uses `THREE.Vector3`; the kernel uses
// `Point3D`.  The math is identical bit-for-bit (the only change is
// the type layer).

import type { Point3D } from '../../types/Point3D.js';

export type WallPath =
  | { readonly kind: 'Line'; readonly start: Point3D; readonly end: Point3D }
  | {
      readonly kind: 'Arc';
      readonly start: Point3D;
      readonly end: Point3D;
      readonly control: Point3D;
    };

/** Tessellate a path into a polyline at the given segment count. */
export function pathToPolyline(path: WallPath, segments = 16): Point3D[] {
  if (path.kind === 'Line') {
    return [{ ...path.start }, { ...path.end }];
  }
  return arcToPoints(path.start, path.control, path.end, segments);
}

/**
 * Quadratic Bézier sampler — same formula as PRYZM 1's
 * `PathResolver.arcToPoints`.
 *
 *   B(t) = (1−t)²·P0 + 2(1−t)t·P1 + t²·P2
 *
 * `segments` is the number of *segments* in the resulting polyline;
 * the polyline has `segments + 1` vertices.
 */
export function arcToPoints(
  p0: Point3D,
  p1: Point3D,
  p2: Point3D,
  segments: number,
): Point3D[] {
  const out: Point3D[] = new Array(segments + 1);
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const oneMt = 1 - t;
    const a = oneMt * oneMt;
    const b = 2 * oneMt * t;
    const c = t * t;
    out[i] = {
      x: a * p0.x + b * p1.x + c * p2.x,
      y: a * p0.y + b * p1.y + c * p2.y,
      z: a * p0.z + b * p1.z + c * p2.z,
    };
  }
  return out;
}

/** Cumulative arc-lengths along a polyline (`lengths[0] === 0`). */
export function computeArcLengths(points: readonly Point3D[]): number[] {
  const lengths: number[] = [0];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!;
    const b = points[i]!;
    const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
    lengths.push(lengths[i - 1]! + Math.sqrt(dx * dx + dy * dy + dz * dz));
  }
  return lengths;
}

/**
 * Map a world-space distance along the polyline back to a parameter t
 * in [0, 1] over the full arc.  Used by the openings pass to place
 * doors / windows at the right offset on a curved wall.
 */
export function distanceToT(lengths: readonly number[], targetDist: number): number {
  const total = lengths[lengths.length - 1]!;
  if (total <= 0) return 0;
  const clamped = Math.max(0, Math.min(targetDist, total));
  for (let i = 1; i < lengths.length; i++) {
    if (lengths[i]! >= clamped) {
      const seg = lengths[i]! - lengths[i - 1]!;
      const localT = seg > 0 ? (clamped - lengths[i - 1]!) / seg : 0;
      return ((i - 1) + localT) / (lengths.length - 1);
    }
  }
  return 1;
}
