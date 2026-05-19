// hitTest — pure pick-helpers for sketch entities (S53 D1).
//
// The Select tool calls these to map a cursor position (mm) to the
// nearest point or line within a tolerance. Pure — no DOM, no THREE,
// no `(window as any)`. Fully unit-testable.

import type {
  EntityId,
  SketchEntity,
  SketchLine,
  SketchPoint,
} from './entities.js';

export interface HitOptions {
  /** World cursor position (mm). */
  readonly x: number;
  readonly z: number;
  readonly entities: readonly SketchEntity[];
  /** Tolerance in mm. The Select tool typically passes
   *  `pickRadiusPx / view.zoom` so the hit area is roughly constant
   *  in screen pixels regardless of zoom. */
  readonly tolMm: number;
}

export interface HitResult {
  /** The hit entity id, or `null` for a miss. */
  readonly id: EntityId | null;
  /** Discriminator for downstream selection styling. */
  readonly kind: 'point' | 'line' | null;
  /** Distance in mm from the cursor to the hit feature. */
  readonly distance: number;
}

const MISS: HitResult = Object.freeze({ id: null, kind: null, distance: Infinity });

/** Pick the nearest entity. Points are tried before lines so a click
 *  near both a vertex and the line through it picks the vertex. */
export function hitTest(opts: HitOptions): HitResult {
  let best: HitResult = MISS;

  for (const e of opts.entities) {
    if (e.kind !== 'point') continue;
    const p = e as SketchPoint;
    const d = Math.hypot(opts.x - p.x, opts.z - p.z);
    if (d <= opts.tolMm && d < best.distance) {
      best = { id: p.id, kind: 'point', distance: d };
    }
  }
  if (best.id !== null) return best;

  const points: Record<string, SketchPoint> = {};
  for (const e of opts.entities) if (e.kind === 'point') points[e.id as string] = e as SketchPoint;

  for (const e of opts.entities) {
    if (e.kind !== 'line') continue;
    const ln = e as SketchLine;
    const a = points[ln.p1 as string];
    const b = points[ln.p2 as string];
    if (!a || !b) continue;
    const d = pointToSegmentDistance(opts.x, opts.z, a.x, a.z, b.x, b.z);
    if (d <= opts.tolMm && d < best.distance) {
      best = { id: ln.id, kind: 'line', distance: d };
    }
  }

  return best;
}

/** Perpendicular distance from `(px, pz)` to segment `(ax, az)→(bx, bz)`. */
export function pointToSegmentDistance(
  px: number,
  pz: number,
  ax: number,
  az: number,
  bx: number,
  bz: number,
): number {
  const dx = bx - ax;
  const dz = bz - az;
  const lenSq = dx * dx + dz * dz;
  if (lenSq === 0) return Math.hypot(px - ax, pz - az);
  let t = ((px - ax) * dx + (pz - az) * dz) / lenSq;
  if (t < 0) t = 0;
  else if (t > 1) t = 1;
  const cx = ax + t * dx;
  const cz = az + t * dz;
  return Math.hypot(px - cx, pz - cz);
}
