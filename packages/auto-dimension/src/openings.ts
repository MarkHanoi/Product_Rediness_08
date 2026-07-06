// @pryzm/auto-dimension — Stage 2/3: opening segmentation + axis projection.
//
// Reuse map (§SPIKE §5):
//   • per-wall opening spans, sorted by along-wall metric offset → the pure logic
//     of WallOccupancyStore.getOccupiedSpans (:311) (a stable sort on offset; the
//     store method is a ~5-line pure map+sort — ported here to keep the package
//     free of the THREE-tainted geometry-wall barrel).
//   • edge lift onto the run axis → the evaluator's door-anchor maths
//     (evaluator.ts:283-300): left edge = a + u·offset, right = a + u·(offset+width),
//     centre = a + u·(offset+width/2); each projected to a run station.

import type { AutoDimWall, WallRun, TickRef } from './types.js';
import { type PtXZ, sub, add, scale, unit, station } from './geometry.js';

/** An opening lifted onto its host run's 1-D axis. */
export interface RunOpening {
  readonly id: string;
  readonly kind: 'door' | 'window';
  readonly hostWallId: string;
  /** Near/far along-run stations (sorted ascending). */
  readonly s0: number;
  readonly s1: number;
  readonly leftTick: TickRef;   // anchor 'left'  (wall-offset edge)
  readonly rightTick: TickRef;  // anchor 'right' (wall-offset+width edge)
  readonly centreTick: TickRef; // anchor 'center'
}

/** Sorted opening spans for one wall (pure port of getOccupiedSpans). */
export function sortedSpans(wall: AutoDimWall): readonly AutoDimWall['openings'][number][] {
  return [...wall.openings].sort((a, b) => (a.offset - b.offset) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/**
 * Lift every opening on a run's member walls onto the run axis. Openings are
 * returned sorted by along-run station (stable, id tiebreak) — the raw material
 * of the pier/opening chain.
 */
export function openingsOnRun(
  run: WallRun,
  wallsById: ReadonlyMap<string, AutoDimWall>,
): RunOpening[] {
  const out: RunOpening[] = [];
  for (const wallId of run.members) {
    const wall = wallsById.get(wallId);
    if (!wall) continue;
    const u = unit(sub(wall.b, wall.a));
    for (const op of sortedSpans(wall)) {
      const leftWorld: PtXZ = add(wall.a, scale(u, op.offset));
      const rightWorld: PtXZ = add(wall.a, scale(u, op.offset + op.width));
      const centreWorld: PtXZ = add(wall.a, scale(u, op.offset + op.width / 2));
      const leftStation = station(leftWorld, run.origin, run.axisDir);
      const rightStation = station(rightWorld, run.origin, run.axisDir);
      const centreStation = station(centreWorld, run.origin, run.axisDir);
      out.push({
        id: op.id,
        kind: op.kind,
        hostWallId: wallId,
        s0: Math.min(leftStation, rightStation),
        s1: Math.max(leftStation, rightStation),
        leftTick: { elementId: op.id, anchor: 'left', station: leftStation },
        rightTick: { elementId: op.id, anchor: 'right', station: rightStation },
        centreTick: { elementId: op.id, anchor: 'center', station: centreStation },
      });
    }
  }
  out.sort((a, b) => (a.s0 - b.s0) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return out;
}
