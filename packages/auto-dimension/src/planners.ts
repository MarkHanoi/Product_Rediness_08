// @pryzm/auto-dimension — Stage 4/5: chain planning + tick resolution.
//
// Emits the P1 minimal-complete set (§SPIKE §6, task P1 scope):
//   rank 1  OVERALL building        — one horizontal + one vertical across the perimeter AABB.
//   rank 2  EXTERIOR WALL-CHAIN      — corner-to-corner along each perimeter side.
//   rank 3  OPENING chain            — pier→opening→pier per side with ≥1 opening.
//   rank 4  opening LOCATION         — run datum → each opening centre.
// Dedup rule: identical (orientation, ref-pair) strings are never emitted twice.
// Tiny segments (< minSegmentM) are skipped so slivers never produce a dim.

import type { DimOrientation } from '@pryzm/schemas/annotation/dimension';
import type { DimNode, WallRun, PlannedString, TickRef } from './types.js';
import type { RunOpening } from './openings.js';
import { stationToWorld } from './geometry.js';
import { withAutoDimSpan } from './tracing.js';

const EPSILON_M = 0.001; // tick coincidence (mirrors WallOccupancyStore epsilon)

/**
 * §FIX-AUTODIM-ORTHO-COMPLETE-CHAINS (L-147, C56 §1.3 DI-7) — the ORTHOGONAL-ONLY
 * invariant, as a pure lookup the L5 executor consumes.
 *
 * A `DimensionString` carries an `orientation` but the plan render path draws a
 * `linear-dim` annotation POINT-TO-POINT between its two resolved world anchors
 * unless a `measurementNormal` (the axis to measure along) is supplied
 * (`PlanViewAnnotationRenderer._renderLinearDim` §DIM-ORTHO branch). The `overall`
 * string deliberately references the two EXTREME perimeter corners (SPEC §4.2) so
 * it stays live; on an L / notched footprint those corners are NOT collinear on
 * the cross-axis, so without a measurement axis the renderer draws (and labels)
 * the corner-to-corner DIAGONAL (`hypot` of the bbox) instead of the axis extent.
 *
 * This returns the CARDINAL measurement axis for a horizontal/vertical string
 * (world +X / +Z), or `null` for `aligned`/`angular` strings which legitimately
 * measure along their own (possibly diagonal) direction. The executor stamps the
 * result onto `geometry2D.measurementNormal` so every cardinal auto-dim renders
 * as a clean axis-aligned line — never a diagonal across the footprint.
 *
 * Pure + deterministic; P8 (§1.7) — opens a `chain`-stage span at its exported
 * entry (bounded: called once per emitted orientation, ≤ a handful of values).
 */
export function cardinalMeasurementAxis(
  orientation: DimOrientation,
): { x: number; y: number; z: number } | null {
  return withAutoDimSpan('chain', () => {
    if (orientation === 'horizontal') return { x: 1, y: 0, z: 0 };
    if (orientation === 'vertical') return { x: 0, y: 0, z: 1 };
    return null; // 'aligned' / 'angular' — measured along the A→B direction.
  });
}

/** World point of a run tick (station → origin + axisDir·station). */
function runWorld(run: WallRun, s: number) {
  return stationToWorld(run.origin, run.axisDir, s);
}

function extreme(nodes: readonly DimNode[], axis: 'x' | 'z', pick: 'min' | 'max'): DimNode | null {
  let best: DimNode | null = null;
  for (const n of nodes) {
    if (best === null) { best = n; continue; }
    const v = n.point[axis];
    const bv = best.point[axis];
    const better = pick === 'min' ? v < bv : v > bv;
    const tie = v === bv;
    // Deterministic tiebreak: the other axis min, then node id.
    if (better || (tie && (n.point[axis === 'x' ? 'z' : 'x'] < best.point[axis === 'x' ? 'z' : 'x'] ||
      (n.point[axis === 'x' ? 'z' : 'x'] === best.point[axis === 'x' ? 'z' : 'x'] && n.id < best.id)))) {
      best = n;
    }
  }
  return best;
}

/** rank 1 — one horizontal + one vertical overall across the perimeter AABB. */
export function planOverall(perimNodes: readonly DimNode[]): PlannedString[] {
  const out: PlannedString[] = [];
  const minX = extreme(perimNodes, 'x', 'min');
  const maxX = extreme(perimNodes, 'x', 'max');
  const minZ = extreme(perimNodes, 'z', 'min');
  const maxZ = extreme(perimNodes, 'z', 'max');

  if (minX && maxX && Math.abs(maxX.point.x - minX.point.x) > EPSILON_M) {
    const a: TickRef = { ...minX.ref, station: minX.point.x };
    const b: TickRef = { ...maxX.ref, station: maxX.point.x };
    out.push({
      kind: 'overall', orientation: 'horizontal', refs: [a, b],
      axisId: 'overall-h', rank: 1, rowIndex: 0,
      stationSpan: [a.station, b.station],
      p1: minX.point, p2: maxX.point,
    });
  }
  if (minZ && maxZ && Math.abs(maxZ.point.z - minZ.point.z) > EPSILON_M) {
    const a: TickRef = { ...minZ.ref, station: minZ.point.z };
    const b: TickRef = { ...maxZ.ref, station: maxZ.point.z };
    out.push({
      kind: 'overall', orientation: 'vertical', refs: [a, b],
      axisId: 'overall-v', rank: 1, rowIndex: 0,
      stationSpan: [a.station, b.station],
      p1: minZ.point, p2: maxZ.point,
    });
  }
  return out;
}

/** rank 2 — corner-to-corner chain segments along a run. */
export function planWallChain(run: WallRun, minSegmentM: number): PlannedString[] {
  const ticks = run.nodeRefs; // already sorted ascending by station
  const out: PlannedString[] = [];
  for (let i = 0; i + 1 < ticks.length; i++) {
    const a = ticks[i]!;
    const b = ticks[i + 1]!;
    if (Math.abs(b.station - a.station) < minSegmentM) continue;
    out.push({
      kind: 'linear-chain', orientation: run.orientation, refs: [a, b],
      axisId: run.id, rank: 2, rowIndex: 0,
      stationSpan: [a.station, b.station],
      p1: runWorld(run, a.station), p2: runWorld(run, b.station),
    });
  }
  return out;
}

/** rank 3 — pier→opening→pier station chain for a run with ≥1 opening. */
export function planOpeningChain(
  run: WallRun,
  openings: readonly RunOpening[],
  minSegmentM: number,
): PlannedString[] {
  if (openings.length === 0) return [];

  // Collect ticks: run start + end corners + every opening left/right edge.
  const first = run.nodeRefs[0];
  const last = run.nodeRefs[run.nodeRefs.length - 1];
  if (!first || !last) return [];
  const ticks: TickRef[] = [first, last];
  for (const op of openings) { ticks.push(op.leftTick, op.rightTick); }

  // Sort by station, dedupe coincident ticks (< EPSILON) keeping the first.
  ticks.sort((a, b) => (a.station - b.station) || (a.elementId < b.elementId ? -1 : a.elementId > b.elementId ? 1 : 0));
  const deduped: TickRef[] = [];
  for (const t of ticks) {
    const prev = deduped[deduped.length - 1];
    if (prev && Math.abs(prev.station - t.station) < EPSILON_M) continue;
    deduped.push(t);
  }

  const out: PlannedString[] = [];
  for (let i = 0; i + 1 < deduped.length; i++) {
    const a = deduped[i]!;
    const b = deduped[i + 1]!;
    if (Math.abs(b.station - a.station) < minSegmentM) continue;
    out.push({
      kind: 'linear-chain', orientation: run.orientation, refs: [a, b],
      axisId: run.id, rank: 3, rowIndex: 0,
      stationSpan: [a.station, b.station],
      p1: runWorld(run, a.station), p2: runWorld(run, b.station),
    });
  }
  return out;
}

/** rank 4 — run datum → each opening centre (the set-out location dim). */
export function planOpeningLocations(
  run: WallRun,
  openings: readonly RunOpening[],
  minSegmentM: number,
): PlannedString[] {
  const datum = run.nodeRefs[0];
  if (!datum) return [];
  const out: PlannedString[] = [];
  for (const op of openings) {
    if (Math.abs(op.centreTick.station - datum.station) < minSegmentM) continue;
    out.push({
      kind: 'linear-element', orientation: run.orientation,
      refs: [datum, op.centreTick],
      axisId: run.id, rank: 4, rowIndex: 0,
      stationSpan: [datum.station, op.centreTick.station],
      p1: runWorld(run, datum.station), p2: runWorld(run, op.centreTick.station),
    });
  }
  return out;
}

/** Dedup key — two strings measuring the same ref-pair in the same orientation. */
export function dedupKey(p: PlannedString): string {
  const r = [...p.refs].map((x) => `${x.elementId}:${x.anchor}`).sort();
  return `${p.orientation}|${r.join('|')}`;
}
