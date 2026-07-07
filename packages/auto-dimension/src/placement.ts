// @pryzm/auto-dimension — Stage 6: true outward-side placement + row stacking.
//
// P2 replaces P1's "P1-light" placement (rows stacked outward purely by rank via
// a fixed rank→row table) with REAL placement: for each string the engine picks
// the correct OUTWARD side of the building (the side whose normal points away
// from the perimeter centroid), then stacks the strings that share a datum line
// into compact rows — location dims closest to the wall, then opening-chain,
// then wall-chain, then the overall furthest out (§SPIKE §8).
//
// Everything is rule-based + total-ordered: same geometry → identical placement
// (§1.5/§1.6, ADR-0061). No RNG, no force-directed layout.

import type { PlannedString, PlacedString } from './types.js';
import { type PtXZ, sub, unit, leftPerp, dot } from './geometry.js';

const BUCKET_EPS_M = 0.05; // datum-line bucket (strings within 50 mm share a stack)
const DEFAULT_LABEL_CHAR_WIDTH_M = 0.15;

/**
 * Area-weighted polygon centroid (the standard shoelace centroid). Falls back to
 * the vertex mean for a degenerate (zero-area) ring. Deterministic.
 */
export function polygonCentroid(poly: readonly PtXZ[]): PtXZ {
  const n = poly.length;
  if (n === 0) return { x: 0, z: 0 };
  if (n < 3) {
    let sx = 0, sz = 0;
    for (const p of poly) { sx += p.x; sz += p.z; }
    return { x: sx / n, z: sz / n };
  }
  let area = 0, cx = 0, cz = 0;
  for (let i = 0; i < n; i++) {
    const a = poly[i]!;
    const b = poly[(i + 1) % n]!;
    const cross = a.x * b.z - b.x * a.z;
    area += cross;
    cx += (a.x + b.x) * cross;
    cz += (a.z + b.z) * cross;
  }
  if (Math.abs(area) < 1e-9) {
    let sx = 0, sz = 0;
    for (const p of poly) { sx += p.x; sz += p.z; }
    return { x: sx / n, z: sz / n };
  }
  const f = 1 / (3 * area);
  return { x: cx * f, z: cz * f };
}

/**
 * Unit outward normal of the `p1→p2` dim line, oriented to point AWAY from
 * `centroid` (§SPIKE §13 angled walls — the dim sits along the run's own normal).
 * For an axis-aligned run this reduces to ±X / ±Z. Deterministic sign.
 */
export function outwardNormal(p1: PtXZ, p2: PtXZ, centroid: PtXZ | null): PtXZ {
  const dir = unit(sub(p2, p1));
  let n = leftPerp(dir);
  if (n.x === 0 && n.z === 0) n = { x: 0, z: 1 };
  if (centroid) {
    const mid = { x: (p1.x + p2.x) / 2, z: (p1.z + p2.z) / 2 };
    const away = sub(mid, centroid);
    if (dot(n, away) < 0) n = { x: -n.x, z: -n.z };
    else if (dot(n, away) === 0) {
      // Exactly through the centroid — canonical +normal (deterministic).
      if (n.x < 0 || (n.x === 0 && n.z < 0)) n = { x: -n.x, z: -n.z };
    }
  }
  return n;
}

/** The coordinate the evaluator anchors the dim line to (max along the offset axis). */
function anchorCoord(p: PlannedString): number {
  return p.orientation === 'horizontal'
    ? Math.max(p.p1.z, p.p2.z)
    : Math.max(p.p1.x, p.p2.x); // vertical + aligned → evaluator uses max-x
}

/** Along-line coordinate of the label centre (consistent within an orientation). */
function labelCentre(p: PlannedString): number {
  if (p.orientation === 'horizontal') return (p.p1.x + p.p2.x) / 2;
  if (p.orientation === 'vertical') return (p.p1.z + p.p2.z) / 2;
  // aligned — project the midpoint onto the run direction.
  const dir = unit(sub(p.p2, p.p1));
  const mid = { x: (p.p1.x + p.p2.x) / 2, z: (p.p1.z + p.p2.z) / 2 };
  return dot(mid, dir);
}

/** Measured value (metres) in the string's orientation — matches the evaluator. */
function valueM(p: PlannedString): number {
  if (p.orientation === 'horizontal') return Math.abs(p.p2.x - p.p1.x);
  if (p.orientation === 'vertical') return Math.abs(p.p2.z - p.p1.z);
  return Math.hypot(p.p2.x - p.p1.x, p.p2.z - p.p1.z);
}

/** Deterministic label half-footprint (digit count × per-digit width / 2). */
function labelHalf(p: PlannedString, charWidthM: number): number {
  const mm = Math.max(1, Math.round(valueM(p) * 1000));
  const digits = String(mm).length;
  return (digits * charWidthM) / 2;
}

/**
 * Assign the outward side + compact stack rows to every planned string
 * (Stage 6). Strings that share a datum line (same orientation, side, and
 * quantised anchor coordinate) form one stack; within a stack rows are packed
 * inner→outer by DESCENDING rank so location dims sit nearest the wall and the
 * overall sits furthest out.
 */
export function placeStrings(
  planned: readonly PlannedString[],
  centroid: PtXZ | null,
  charWidthM: number = DEFAULT_LABEL_CHAR_WIDTH_M,
): PlacedString[] {
  // 1. Side + group key per string.
  const placed: PlacedString[] = planned.map((p) => {
    const coord = anchorCoord(p);
    const centroidCoord = centroid
      ? (p.orientation === 'horizontal' ? centroid.z : centroid.x)
      : -Infinity; // no perimeter → default outward (+1)
    const side: 1 | -1 = coord >= centroidCoord ? 1 : -1;
    const bucket = Math.round(coord / BUCKET_EPS_M);
    const groupKey = `${p.orientation}|${side}|${bucket}`;
    return {
      ...p,
      side,
      outwardNormal: outwardNormal(p.p1, p.p2, centroid),
      labelCentre: labelCentre(p),
      labelHalfM: labelHalf(p, charWidthM),
      groupKey,
      rowIndex: 0,
    };
  });

  // 2. Compact rows per stack group (descending rank → inner rows).
  const groups = new Map<string, PlacedString[]>();
  for (const p of placed) {
    const g = groups.get(p.groupKey);
    if (g) g.push(p); else groups.set(p.groupKey, [p]);
  }
  const out: PlacedString[] = [];
  for (const key of [...groups.keys()].sort()) {
    const group = groups.get(key)!;
    const ranksDesc = [...new Set(group.map((p) => p.rank))].sort((a, b) => b - a);
    const rankToRow = new Map<number, number>();
    ranksDesc.forEach((r, i) => rankToRow.set(r, i));
    for (const p of group) out.push({ ...p, rowIndex: rankToRow.get(p.rank)! });
  }
  return out;
}
