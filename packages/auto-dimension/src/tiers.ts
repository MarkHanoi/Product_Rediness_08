// §FIX-OVERALL-DIM-OUTSIDE-AND-OUTERMOST (L-281) — THE TIER MODEL.
//
// ─────────────────────────────────────────────────────────────────────────────
// THE FOUNDER'S SENTENCE IS TWO RULES
// ─────────────────────────────────────────────────────────────────────────────
// "The total dims ALWAYS OUTSIDE and at the END of the dim pipeline."
//   (a) OUTSIDE  — a dimension line never crosses the thing it measures.
//   (b) OUTERMOST — chains stack in TIERS: openings innermost, then the exterior
//       chain, and the OVERALL furthest out of all.
//
// ─────────────────────────────────────────────────────────────────────────────
// WHY THE OVERALL RAN THROUGH THE BUILDING (the actual root cause)
// ─────────────────────────────────────────────────────────────────────────────
// `planOverall` measures between the EXTREME perimeter nodes (SPEC §4.2) — minX→maxX
// and minZ→maxZ. The VALUE is right. But the dim LINE is drawn by the renderer through
// the FIRST reference point, offset perpendicular by `offsetMm`:
//
//     dim line = p1 + outwardNormal · (stackBase + row · stackSpacing)
//
// `p1` is the min-X (or min-Z) perimeter NODE — and on an L-shaped or notched plate
// that node's OTHER coordinate can be anywhere, including the middle of the plate. The
// line was therefore drawn 0.5 m from a point INSIDE the building. On a RECTANGLE the
// min-X node is always a bbox corner, so the same code lands outside BY LUCK — which is
// exactly why this survived every rectangular test.
//
// The offset was measured FROM THE WRONG THING. It was measured from the string's own
// reference point; it must be measured from the FOOTPRINT.
//
// ─────────────────────────────────────────────────────────────────────────────
// THE MODEL (one rule, not a nudge)
// ─────────────────────────────────────────────────────────────────────────────
// Every cardinal string belongs to a TIER, and every tier is positioned relative to the
// BUILDING'S FOOTPRINT BBOX — never to the wall it happens to measure:
//
//     magnitude = clearance(p1 → bbox support plane, along the outward normal)
//               + gap · (tier + 1)
//
// `clearance` is the support distance from p1 to the far face of the bbox along the
// outward normal, so `p1 + n · clearance` lands EXACTLY ON the bbox edge — wherever p1
// sits, inside or on the boundary. Adding `gap · (tier+1)` then pushes each tier clear
// of the plate and clear of the tier inside it. One rule fixes the L-shape, the notch,
// the courtyard and the rectangle; a nudge would fix one screenshot.
//
// "Outside the wall" is NOT the same as "outside the building": on an L-plan the outward
// normal of a notch façade points INTO the bbox. Referencing the BBOX (per axis) is what
// makes tiers align into the continuous outer stacks an architect actually draws.
//
// PURE. No stores, no view, no literals: the gap is scale-aware (C24) and supplied by
// the caller — see `tierGapWorldM`.

import type { PtXZ } from './geometry.js';
import { withAutoDimSpan } from './tracing.js';

/** Axis-aligned footprint bounds of ONE building, world metres. */
export interface FootprintBBox {
  readonly minX: number;
  readonly maxX: number;
  readonly minZ: number;
  readonly maxZ: number;
}

/**
 * The tier each dimension RANK stacks into. Lower tier = closer to the building.
 *
 *   rank 4 location dims  → tier 0 (innermost — they read against the wall)
 *   rank 3 opening chain  → tier 1
 *   rank 2 exterior chain → tier 2
 *   rank 1 OVERALL        → tier 3 (outermost — "at the END of the pipeline")
 *   rank 5 per-wall fallback (no perimeter) → tier 0
 *
 * This is the founder's rule (b) as data. It is deliberately a TABLE, not a computed
 * ordering: the drawing convention is fixed, and a reader of this file should be able
 * to see it without simulating an algorithm.
 */
export const TIER_BY_RANK: Readonly<Record<number, number>> = Object.freeze({
  1: 3,   // overall — outermost
  2: 2,   // exterior wall chain
  3: 1,   // opening chain
  4: 0,   // opening location — innermost
  5: 0,   // per-wall fallback (open perimeter)
});

/** The outermost tier index — the overall's. */
export const OVERALL_TIER = TIER_BY_RANK[1]!;

export function tierOfRank(rank: number): number {
  return TIER_BY_RANK[rank] ?? 0;
}

/**
 * The PAPER gap between tiers, in sheet millimetres (C24 §drawing standards).
 *
 * This is the ONE constant in the tier model, and it is a PAPER constant — the distance
 * an architect wants to see between two dimension lines on the printed sheet, at any
 * scale. It is never a world distance: 800 mm of world gap is right at 1:100 and absurd
 * at 1:20. `tierGapWorldM()` converts it using the VIEW's scale.
 */
export const DEFAULT_TIER_GAP_PAPER_MM = 8;

/**
 * Convert the paper tier gap into WORLD metres for a view drawn at 1:`scaleDenominator`.
 *
 *   world_mm = paper_mm × scaleDenominator      (the definition of drawing scale, C24)
 *   world_m  = world_mm / 1000
 *
 * 8 mm at 1:100 → 0.8 m; at 1:50 → 0.4 m; at 1:200 → 1.6 m. The dimension stack keeps
 * the SAME appearance on paper at every scale — which is the whole point of a scale.
 *
 * P8 — opens `pryzm.autodim.place`.
 */
export function tierGapWorldM(
  scaleDenominator: number,
  paperGapMm: number = DEFAULT_TIER_GAP_PAPER_MM,
): number {
  return withAutoDimSpan('place', (span) => {
    const denom = Number.isFinite(scaleDenominator) && scaleDenominator > 0 ? scaleDenominator : 100;
    const paper = Number.isFinite(paperGapMm) && paperGapMm > 0 ? paperGapMm : DEFAULT_TIER_GAP_PAPER_MM;
    span.setAttribute('pryzm.autodim.scale_denominator', denom);
    return (paper * denom) / 1000;
  });
}

/** The axis-aligned bounds of a footprint polygon (or any point set). Null when empty. */
export function bboxOf(points: readonly PtXZ[]): FootprintBBox | null {
  if (points.length === 0) return null;
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.z < minZ) minZ = p.z;
    if (p.z > maxZ) maxZ = p.z;
  }
  if (!Number.isFinite(minX) || !Number.isFinite(minZ)) return null;
  return { minX, maxX, minZ, maxZ };
}

/**
 * The SUPPORT DISTANCE from `p` to the far face of `bbox` along the unit direction `n`:
 * the largest `d` such that `p + n·d` still reaches the bbox boundary. In other words,
 * how far the dim line must travel along its outward normal simply to CLEAR the
 * footprint — before any tier gap is added.
 *
 *   clearance = max over the bbox corners c of  (c − p) · n     (clamped at 0)
 *
 * For a cardinal `n` this reduces to the obvious per-axis distance (e.g. n = −Z ⇒
 * `p.z − bbox.minZ`), and it is correct for a p INSIDE the bbox (the L-shape case, where
 * the value is large) and for a p already ON the boundary (a façade run, where it is 0).
 * Never negative: a p already outside the bbox on that side does not get pulled back in.
 *
 * PURE + exported so the "is this line outside the footprint?" arithmetic is testable
 * directly, which is what the L-shaped guard rests on.
 */
export function bboxClearance(p: PtXZ, n: PtXZ, bbox: FootprintBBox): number {
  const corners: PtXZ[] = [
    { x: bbox.minX, z: bbox.minZ },
    { x: bbox.maxX, z: bbox.minZ },
    { x: bbox.minX, z: bbox.maxZ },
    { x: bbox.maxX, z: bbox.maxZ },
  ];
  let best = 0;
  for (const c of corners) {
    const d = (c.x - p.x) * n.x + (c.z - p.z) * n.z;
    if (d > best) best = d;
  }
  return best;
}

/**
 * The world distance from a string's reference point p1, along its outward normal, to
 * the dimension line the renderer will draw.
 *
 *   magnitude = clearance + gap · (ring + 1)
 *
 * `ring` is the tier, PLUS any outward push Stage 7 added to resolve a text overlap or a
 * residual crossing — the two are the same axis of freedom, so they add. `ring + 1`
 * (not `ring`) guarantees even tier 0 stands a full gap clear of the footprint: a
 * dimension line that lies exactly ON the building edge is unreadable.
 */
export function tierMagnitudeM(clearanceM: number, ring: number, gapM: number): number {
  const safeGap = Number.isFinite(gapM) && gapM > 0 ? gapM : 0.5;
  const safeRing = Number.isFinite(ring) && ring > 0 ? Math.floor(ring) : 0;
  const safeClear = Number.isFinite(clearanceM) && clearanceM > 0 ? clearanceM : 0;
  return safeClear + safeGap * (safeRing + 1);
}
