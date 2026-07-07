// @pryzm/auto-dimension — Stage 7: deterministic conflict detection + resolution.
//
// Runs after placement. Every rule is total-ordered and merge/reposition, never
// silent-drop of a REQUIRED dim (§SPIKE §9, C56 §1.3 DI-4/DI-5, §1.5):
//
//   1. span-dedupe (DR-1/DR-2) — a distance already ticked by a higher-rank
//      string on the same axis is never re-emitted by a lower-rank string.
//   2. tiny / zero — segments shorter than `minSegmentM` are dropped (a sliver
//      pier never becomes a dim); recorded in `skipped`.
//   3. text-overlap — when two labels on the SAME stack row would overlap, the
//      lower-priority string is bumped to the next row (bounded). The lower id /
//      closer-to-wall string stays.
//   4. geometry-crossing — when a dim line would cross building geometry where
//      avoidable, the string is pushed out one row (bounded). If unavoidable it
//      is KEPT and a QA note is recorded — never dropped.
//
// No RNG, no heuristics with inconsistent output (§1.1).

import type { PlacedString, ValidationWarning, AutoDimWall } from './types.js';
import { segmentsCross } from './geometry.js';
import { dedupKey } from './planners.js';

const SPAN_EPS_M = 0.001;      // exact-span dedupe tolerance
const MAX_ROWS = 8;            // bounded bump / push depth (§1.5)

export interface ConflictResult {
  readonly placed: readonly PlacedString[];
  readonly notes: readonly ValidationWarning[];
  readonly skipped: readonly { readonly id: string; readonly reason: string }[];
}

/** Rounded [min,max] span key for exact-distance dedupe on one axis. */
function spanKey(p: PlacedString): string {
  const lo = Math.min(p.stationSpan[0], p.stationSpan[1]);
  const hi = Math.max(p.stationSpan[0], p.stationSpan[1]);
  const q = (v: number) => Math.round(v / SPAN_EPS_M);
  return `${q(lo)}|${q(hi)}`;
}

/** 1-D label interval overlap on a shared row (with a hair of tolerance). */
function labelsOverlap(a: PlacedString, b: PlacedString): boolean {
  const aLo = a.labelCentre - a.labelHalfM, aHi = a.labelCentre + a.labelHalfM;
  const bLo = b.labelCentre - b.labelHalfM, bHi = b.labelCentre + b.labelHalfM;
  return aLo < bHi - 1e-9 && bLo < aHi - 1e-9;
}

/**
 * Total order for "who yields" (gets bumped) in a text-overlap conflict. Same-row
 * overlaps are usually same-rank, so the deterministic tiebreak dominates: the
 * closer-to-wall / lower string stays (§SPIKE §9). Concretely `a` yields when it
 * has the higher rank number (further-out, less-important row on a mixed row),
 * else the larger label centre, else the larger `dedupKey` (higher id). Total
 * order → identical result every run.
 */
function aYields(a: PlacedString, b: PlacedString): boolean {
  if (a.rank !== b.rank) return a.rank > b.rank;
  if (a.labelCentre !== b.labelCentre) return a.labelCentre > b.labelCentre;
  return dedupKey(a) > dedupKey(b);
}

/** Stable primary sort so every scan visits strings in a deterministic order. */
function sortKey(p: PlacedString): string {
  return `${p.orientation}|${p.side}|${p.rowIndex}|${p.labelCentre.toFixed(6)}|${p.rank}|${dedupKey(p)}`;
}

export function resolveConflicts(
  placed: readonly PlacedString[],
  walls: readonly AutoDimWall[],
  minSegmentM: number,
  stackWorldBaseM: number,
  stackWorldSpacingM: number,
): ConflictResult {
  const notes: ValidationWarning[] = [];
  const skipped: { id: string; reason: string }[] = [];

  // ── 1. span-dedupe (DR-1/DR-2) ──────────────────────────────────────────────
  // Same (orientation, axisId) + identical span within EPS → keep highest
  // priority (lowest rank number, id tiebreak); drop the rest.
  const byAxisSpan = new Map<string, PlacedString>();
  const dropped = new Set<PlacedString>();
  const sortedForDedup = [...placed].sort((a, b) => {
    if (a.rank !== b.rank) return a.rank - b.rank;
    return dedupKey(a) < dedupKey(b) ? -1 : dedupKey(a) > dedupKey(b) ? 1 : 0;
  });
  for (const p of sortedForDedup) {
    const key = `${p.orientation}|${p.axisId}|${spanKey(p)}`;
    const kept = byAxisSpan.get(key);
    if (!kept) byAxisSpan.set(key, p);
    else { dropped.add(p); skipped.push({ id: dedupKey(p), reason: 'duplicate-span' }); }
  }
  let live = placed.filter((p) => !dropped.has(p));

  // ── 2. tiny / zero ──────────────────────────────────────────────────────────
  live = live.filter((p) => {
    const L = Math.abs(p.stationSpan[1] - p.stationSpan[0]);
    if (L < minSegmentM) { skipped.push({ id: dedupKey(p), reason: 'tiny-segment' }); return false; }
    return true;
  });

  // Mutable row map (bump/push mutate this, keyed by a stable per-string key).
  const rows = new Map<PlacedString, number>();
  for (const p of live) rows.set(p, p.rowIndex);
  const withRow = (p: PlacedString): PlacedString => ({ ...p, rowIndex: rows.get(p)! });

  // ── 3. text-overlap resolution (bump lower-priority to the next row) ─────────
  const groups = new Map<string, PlacedString[]>();
  for (const p of live) {
    const g = groups.get(p.groupKey);
    if (g) g.push(p); else groups.set(p.groupKey, [p]);
  }
  for (const gKey of [...groups.keys()].sort()) {
    const group = groups.get(gKey)!;
    const maxIter = group.length * MAX_ROWS + 4;
    let iter = 0;
    for (;;) {
      if (iter++ > maxIter) break;
      // Find the deterministically-first overlapping same-row pair.
      const ordered = [...group].sort((a, b) => (sortKey(withRow(a)) < sortKey(withRow(b)) ? -1 : 1));
      let bumped = false;
      outer: for (let i = 0; i < ordered.length; i++) {
        for (let j = i + 1; j < ordered.length; j++) {
          const a = ordered[i]!, b = ordered[j]!;
          if (rows.get(a)! !== rows.get(b)!) continue;
          if (!labelsOverlap(a, b)) continue;
          const yielder = aYields(a, b) ? a : b;
          const next = rows.get(yielder)! + 1;
          if (next > MAX_ROWS) {
            notes.push({ code: 'text-overlap-unresolved', detail: dedupKey(yielder) });
            break outer; // give up on this pair (accept the v1 overlap)
          }
          rows.set(yielder, next);
          bumped = true;
          break outer;
        }
      }
      if (!bumped) break;
    }
  }

  // ── 4. geometry-crossing resolution (push out; keep + note if unavoidable) ───
  // World dim-line position uses a modest world stack scale (the emitted offset
  // is sheet-mm, §SPIKE §8) so a genuine transverse crossing can be detected and
  // pushed clear. Collinear walls (the wall a dim measures) never count.
  const wallSegs = walls.map((w) => ({ a: w.a, b: w.b }));
  for (const p of [...live].sort((a, b) => (sortKey(withRow(a)) < sortKey(withRow(b)) ? -1 : 1))) {
    const lo = Math.min(
      p.orientation === 'horizontal' ? p.p1.x : p.p1.z,
      p.orientation === 'horizontal' ? p.p2.x : p.p2.z,
    );
    const hi = Math.max(
      p.orientation === 'horizontal' ? p.p1.x : p.p1.z,
      p.orientation === 'horizontal' ? p.p2.x : p.p2.z,
    );
    const anchor = p.orientation === 'horizontal'
      ? Math.max(p.p1.z, p.p2.z)
      : Math.max(p.p1.x, p.p2.x);
    const crossesAt = (row: number): boolean => {
      const pos = anchor + p.side * (stackWorldBaseM + row * stackWorldSpacingM);
      const q1 = p.orientation === 'horizontal' ? { x: lo, z: pos } : { x: pos, z: lo };
      const q2 = p.orientation === 'horizontal' ? { x: hi, z: pos } : { x: pos, z: hi };
      for (const s of wallSegs) if (segmentsCross(q1, q2, s.a, s.b)) return true;
      return false;
    };
    let row = rows.get(p)!;
    let guard = 0;
    while (crossesAt(row) && row < MAX_ROWS && guard++ < MAX_ROWS) row++;
    rows.set(p, row);
    if (crossesAt(row)) notes.push({ code: 'geometry-crossing', detail: dedupKey(p) });
  }

  return { placed: live.map(withRow), notes, skipped };
}
