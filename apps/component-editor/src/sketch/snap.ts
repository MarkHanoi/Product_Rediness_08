// snapCursor — pure snap-engine function (S52 D1).
//
// Given a cursor position (in mm) plus the current entity collection,
// returns the snapped position and the snap kind.  Priority — the
// engine returns the highest-priority hit within `snapRadiusMm`:
//
//   1. endpoint   — coincident with a point's exact coords
//   2. midpoint   — middle of a line segment
//   3. on-line    — anywhere along a line (perpendicular projection)
//   4. grid       — nearest grid intersection (`gridSizeMm` step)
//   5. none       — cursor passed through unchanged
//
// Pure: no DOM, no THREE, no I/O, no rAF.  Fully unit-testable.

import type { EntityId, SketchEntity, SketchPoint } from './entities.js';

export type SnapKind = 'endpoint' | 'midpoint' | 'on-line' | 'grid' | 'none';

export interface SnapHit {
  /** Snapped X (mm). */
  readonly x: number;
  /** Snapped Z (mm). */
  readonly z: number;
  readonly kind: SnapKind;
  /** Entity that produced the hit (for endpoint / midpoint / on-line). */
  readonly entityId?: EntityId;
}

export interface SnapOptions {
  readonly cursorX: number;
  readonly cursorZ: number;
  readonly entities: readonly SketchEntity[];
  /** Mm.  Within this radius, the highest-priority hit wins. */
  readonly snapRadiusMm: number;
  /** Mm.  Step size for grid snap. */
  readonly gridSizeMm: number;
  /**
   * Optional set of enabled snap kinds.  Omitted entries are
   * effectively disabled.  When absent, ALL kinds are enabled.
   */
  readonly enabledKinds?: ReadonlySet<SnapKind>;
}

const DEFAULT_ENABLED: ReadonlySet<SnapKind> = new Set<SnapKind>([
  'endpoint',
  'midpoint',
  'on-line',
  'grid',
]);

const NONE_HIT_KIND: SnapKind = 'none';

export function snapCursor(opts: SnapOptions): SnapHit {
  const { cursorX, cursorZ, entities, snapRadiusMm, gridSizeMm } = opts;
  const enabled = opts.enabledKinds ?? DEFAULT_ENABLED;
  const r2 = snapRadiusMm * snapRadiusMm;

  // Build a quick lookup of points so line-derived hits can resolve coords.
  const pointById: Record<EntityId, SketchPoint> = {};
  for (const e of entities) {
    if (e.kind === 'point') pointById[e.id] = e;
  }

  // ── 1. Endpoint snap (highest priority). ────────────────────────────
  if (enabled.has('endpoint')) {
    let best: { d2: number; p: SketchPoint } | null = null;
    for (const e of entities) {
      if (e.kind !== 'point') continue;
      const d2 = sqDist(cursorX, cursorZ, e.x, e.z);
      if (d2 <= r2 && (best === null || d2 < best.d2)) {
        best = { d2, p: e };
      }
    }
    if (best) {
      return { x: best.p.x, z: best.p.z, kind: 'endpoint', entityId: best.p.id };
    }
  }

  // ── 2. Midpoint snap. ────────────────────────────────────────────────
  if (enabled.has('midpoint')) {
    let best: { d2: number; mx: number; mz: number; lineId: EntityId } | null = null;
    for (const e of entities) {
      if (e.kind !== 'line') continue;
      const a = pointById[e.p1];
      const b = pointById[e.p2];
      if (!a || !b) continue;
      const mx = (a.x + b.x) / 2;
      const mz = (a.z + b.z) / 2;
      const d2 = sqDist(cursorX, cursorZ, mx, mz);
      if (d2 <= r2 && (best === null || d2 < best.d2)) {
        best = { d2, mx, mz, lineId: e.id };
      }
    }
    if (best) {
      return { x: best.mx, z: best.mz, kind: 'midpoint', entityId: best.lineId };
    }
  }

  // ── 3. On-line snap (perpendicular projection). ─────────────────────
  if (enabled.has('on-line')) {
    let best: { d2: number; px: number; pz: number; lineId: EntityId } | null = null;
    for (const e of entities) {
      if (e.kind !== 'line') continue;
      const a = pointById[e.p1];
      const b = pointById[e.p2];
      if (!a || !b) continue;
      const proj = projectOntoSegment(cursorX, cursorZ, a.x, a.z, b.x, b.z);
      const d2 = sqDist(cursorX, cursorZ, proj.x, proj.z);
      if (d2 <= r2 && (best === null || d2 < best.d2)) {
        best = { d2, px: proj.x, pz: proj.z, lineId: e.id };
      }
    }
    if (best) {
      return { x: best.px, z: best.pz, kind: 'on-line', entityId: best.lineId };
    }
  }

  // ── 4. Grid snap (always within radius if enabled). ────────────────
  if (enabled.has('grid') && gridSizeMm > 0) {
    const gx = Math.round(cursorX / gridSizeMm) * gridSizeMm;
    const gz = Math.round(cursorZ / gridSizeMm) * gridSizeMm;
    const d2 = sqDist(cursorX, cursorZ, gx, gz);
    if (d2 <= r2) {
      return { x: gx, z: gz, kind: 'grid' };
    }
  }

  return { x: cursorX, z: cursorZ, kind: NONE_HIT_KIND };
}

function sqDist(ax: number, az: number, bx: number, bz: number): number {
  const dx = bx - ax;
  const dz = bz - az;
  return dx * dx + dz * dz;
}

/** Project point (px, pz) onto the segment from (ax, az) to (bx, bz). */
function projectOntoSegment(
  px: number,
  pz: number,
  ax: number,
  az: number,
  bx: number,
  bz: number,
): { x: number; z: number } {
  const ex = bx - ax;
  const ez = bz - az;
  const len2 = ex * ex + ez * ez;
  if (len2 < 1e-9) return { x: ax, z: az };
  let t = ((px - ax) * ex + (pz - az) * ez) / len2;
  if (t < 0) t = 0;
  else if (t > 1) t = 1;
  return { x: ax + t * ex, z: az + t * ez };
}
