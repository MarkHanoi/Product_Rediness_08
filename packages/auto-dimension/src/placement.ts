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
import { withAutoDimSpan } from './tracing.js';
// §FIX-OVERALL-DIM-OUTSIDE-AND-OUTERMOST (L-281) — the TIER model. Placement no longer
// measures a string's standoff from its own reference line; it measures it from the
// BUILDING'S FOOTPRINT, which is the only reference that is outside the building on an
// L-shaped or notched plate. See tiers.ts for why the old one only worked on rectangles.
import { type FootprintBBox, bboxClearance, tierOfRank } from './tiers.js';

const BUCKET_EPS_M = 0.05; // datum-line bucket (strings within 50 mm share a stack)
const DEFAULT_LABEL_CHAR_WIDTH_M = 0.15;

/**
 * Area-weighted polygon centroid (the standard shoelace centroid). Falls back to
 * the vertex mean for a degenerate (zero-area) ring. Deterministic.
 */
export function polygonCentroid(poly: readonly PtXZ[]): PtXZ {
  // P8: barrel-exported entry opens a span; Stage-6 internals call `…Impl`.
  return withAutoDimSpan('place', () => polygonCentroidImpl(poly));
}

/** Unspanned implementation — internal Stage-6 callers use this directly. */
export function polygonCentroidImpl(poly: readonly PtXZ[]): PtXZ {
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
  // P8: barrel-exported entry opens a span; `placeStrings` calls `…Impl` per
  // string so per-string span cardinality stays bounded.
  return withAutoDimSpan('place', () => outwardNormalImpl(p1, p2, centroid));
}

/** Unspanned implementation — internal Stage-6 callers use this directly. */
export function outwardNormalImpl(p1: PtXZ, p2: PtXZ, centroid: PtXZ | null): PtXZ {
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

/**
 * §FIX-AUTODIM-PERIMETER-ALWAYS-OUTWARD (L-191) — the world direction the plan
 * renderer MEASURES this string along. Cardinal strings carry a fixed
 * `measurementNormal` (world +X for horizontal, +Z for vertical — see
 * `cardinalMeasurementAxis` / applyAutoDimensions), so
 * `PlanViewAnnotationRenderer._renderLinearDim` offsets the dim line along
 * `leftPerp(thisDir)`; 'aligned' strings have no normal and measure along p1→p2.
 * The emitted signed offset must therefore be signed relative to `leftPerp(dir)`,
 * NOT the world +axis — the two disagree for vertical (leftPerp(+Z) = −X), which
 * is exactly why left/right perimeter chains previously landed INWARD.
 */
function measurementDir(p: PlannedString): PtXZ {
  if (p.orientation === 'horizontal') return { x: 1, z: 0 };
  if (p.orientation === 'vertical') return { x: 0, z: 1 };
  return unit(sub(p.p2, p.p1));
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
 * §FIX-OVERALL-DIM-OUTSIDE-AND-OUTERMOST (L-281) — the outward normal of a dim line,
 * CARDINAL for a cardinal string, oriented away from the building.
 *
 * Two things are fixed here relative to `outwardNormalImpl`:
 *
 * 1. THE OVERALL'S NORMAL WAS DIAGONAL. `outwardNormalImpl(p1, p2, …)` derives the
 *    normal from the p1→p2 direction. For a chain that is the façade direction, so the
 *    normal is cardinal. But the OVERALL's two references are the two EXTREME perimeter
 *    corners, which on an L-plan are DIAGONAL to each other — so its "outward normal"
 *    came out diagonal, while the renderer draws the line along `leftPerp(measurementDir)`
 *    (cardinal, from the stamped measurementNormal). The engine was reasoning about a
 *    line the renderer never draws. The normal is now always taken from the MEASUREMENT
 *    direction, which is what the renderer actually uses.
 *
 * 2. THE SIGN IS TAKEN AT p1, NOT AT THE MIDPOINT. The renderer draws the dim line
 *    through the FIRST reference point (`_renderLinearDim` offsets `refA`), so the side
 *    that matters is p1's. For a façade chain p1 and the midpoint lie on the same line,
 *    so this is identical to the old rule (L-191 behaviour preserved); for the overall
 *    the midpoint IS ≈ the centroid, where the old sign test was degenerate.
 */
export function cardinalOutwardNormal(p: PlannedString, centroid: PtXZ | null): PtXZ {
  const dir = measurementDir(p);
  let n = leftPerp(dir);
  if (n.x === 0 && n.z === 0) n = { x: 0, z: 1 };
  if (!centroid) return n;
  const away = sub(p.p1, centroid);
  const d = dot(n, away);
  if (d < 0) return { x: -n.x, z: -n.z };
  if (d === 0) {
    // p1 sits exactly on the centroid's axis — canonical negative side (deterministic).
    return (n.x > 0 || (n.x === 0 && n.z > 0)) ? { x: -n.x, z: -n.z } : n;
  }
  return n;
}

/**
 * Assign the outward side, the TIER, and the footprint CLEARANCE to every planned
 * string (Stage 6).
 *
 * §FIX-OVERALL-DIM-OUTSIDE-AND-OUTERMOST (L-281) — what changed, and why it is not a nudge:
 *
 *   BEFORE: `rowIndex` was a per-stack-group index derived from rank, and the standoff was
 *           `stackBase + row · spacing` measured FROM THE STRING'S OWN REFERENCE LINE. On an
 *           L-shaped plate the overall's reference point sits mid-plate, so its line was
 *           drawn 0.5 m from the middle of the building — straight across the plan.
 *   NOW:    `rowIndex` is the string's TIER (openings → chain → OVERALL outermost, one
 *           global rule, tiers.ts) and it carries `clearanceM`, the distance from p1 to the
 *           FOOTPRINT BBOX along its outward normal. The rendered standoff becomes
 *           `clearance + gap·(tier+1)` (see `tierMagnitudeM`), so every tier lands OUTSIDE
 *           the footprint and outside the tier within it — on a rectangle, an L, a notch or
 *           a courtyard alike.
 *
 * Stage 7 still pushes `rowIndex` outward to resolve label overlaps and residual
 * crossings; a push is simply "one more gap out", which composes with the tier.
 *
 * @param bbox the building's footprint bounds. Null for the per-wall fallback (no closed
 *             perimeter) — clearance is then 0 and the tier gap alone applies, which is
 *             the old behaviour for the only case that has no footprint to be outside of.
 */
export function placeStrings(
  planned: readonly PlannedString[],
  centroid: PtXZ | null,
  charWidthM: number = DEFAULT_LABEL_CHAR_WIDTH_M,
  bbox: FootprintBBox | null = null,
  buildingId?: string,
  // §GA-EDITORIAL-LAYER (L-1620, SPEC §12.3) — INTERNAL dimensions read INSIDE the space
  // they measure. An exterior string stands off outside the footprint because a dimension
  // line must never cross the thing it measures (L-281 rule (a)); a corridor width does
  // not have that problem — the corridor IS the clear space — and standing it off outside
  // the corridor would draw it in the neighbouring room. So a room extent is placed with
  // the normal pointing IN, at zero footprint clearance: one tier gap in from its own
  // wall. Same formula, opposite sign — not a second placement model.
  inward: boolean = false,
): PlacedString[] {
  return planned.map((p) => {
    const coord = anchorCoord(p);
    // §FIX-AUTODIM-PERIMETER-ALWAYS-OUTWARD (L-191): the signed `offset` is applied by
    // the plan renderer along `leftPerp(measurementDir)`, NOT the world +axis. Choose
    // `side` so `leftPerp(measurementDir) · side` == the TRUE outward normal — then every
    // chain lands OUTSIDE the shell (bottom→below, top→above, left→left, right→right).
    // No perimeter (per-wall fallback, centroid null) → default +1.
    const away = cardinalOutwardNormal(p, centroid);
    const outN = inward ? { x: -away.x, z: -away.z } : away;
    const rPerp = leftPerp(measurementDir(p));
    const side: 1 | -1 = centroid === null && !inward ? 1 : (dot(rPerp, outN) >= 0 ? 1 : -1);
    const bucket = Math.round(coord / BUCKET_EPS_M);
    const groupKey = `${p.orientation}|${side}|${bucket}`;
    return {
      ...p,
      side,
      outwardNormal: outN,
      labelCentre: labelCentre(p),
      labelHalfM: labelHalf(p, charWidthM),
      groupKey,
      // The TIER is the row: rule (b) — openings innermost, the OVERALL outermost.
      rowIndex: tierOfRank(p.rank),
      // The distance this string must travel just to CLEAR the plate: rule (a). An
      // inward internal dimension has nothing to clear — it is drawn INSIDE the space.
      clearanceM: bbox && !inward ? bboxClearance(p.p1, outN, bbox) : 0,
      ...(buildingId ? { buildingId } : {}),
    };
  });
}
