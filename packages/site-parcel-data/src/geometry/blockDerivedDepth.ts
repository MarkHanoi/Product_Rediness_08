// ADR-0271 (L-460) — BLOCK-DERIVED *profunditat edificable*.
//
// WHY THIS EXISTS
// ---------------
// PGM NNUU Art. 242.2 does not STATE a buildable depth for the Barcelona Eixample. It states how
// to DERIVE one:
//
//   "a figure similar to the block, equidistant from the street frontages, leaving at least 30%
//    of the block area as interior free space"  — capped at 30 m, floored at 11 m.
//
// So the depth is a FUNCTION OF THE BLOCK, and it differs block to block. Every "20 m" / "24 m"
// figure repeated online is someone's answer for one particular block, which is exactly why those
// figures contradict each other. Hard-coding either would produce a confidently wrong envelope on
// the densest land in Spain — the failure mode C58 §1.4 and ADR-0270 both exist to prevent.
//
// WHY ADR-0270 COULD NOT EXPRESS THIS
// -----------------------------------
// ADR-0270's `alignment` rule carries a SCALAR `buildableDepth_m`. No value of a scalar can encode
// "solve for d such that 30% of the block stays free", and the engine only ever received ONE
// PARCEL RING — it could not see the block at all. That is a gap in the rule MODEL, not a missing
// lookup: the right SHAPE of rule (alignment) fed the wrong KIND of input.
//
// WHAT THIS MODULE IS, AND DELIBERATELY IS NOT
// --------------------------------------------
// It RESOLVES the depth and then hands that number to the EXISTING, separately-tested alignment
// path (`clipToDepthBand`). It is not a second envelope solver and does not fork C58 §2.4 —
// the same discipline ADR-0270 P2 used when it composed `insetPolygonPerEdge` + `clipToDepthBand`
// rather than writing a parallel path.
//
// THE ALGORITHM
// -------------
// `interiorFree(d)` = the part of the block further than `d` from EVERY street frontage. That is
// exactly a per-edge inset of the block with `d` on frontage edges and 0 elsewhere — so it reuses
// `insetPolygonPerEdge`, already hardened against non-convex and degenerate rings (L-403).
//
// `interiorFree` is monotonically NON-INCREASING in `d` (eroding further can never enlarge the
// remainder), so the largest admissible `d` is found by bisection — deterministic, with a fixed
// iteration count, which keeps C58 §1.1 byte-determinism. We take the LARGEST `d` that still
// leaves the required free ratio: the ordinance sets a MINIMUM interior space, so the maximum
// depth consistent with it is the permitted depth.
//
// Strategic context: ADR-0271, ADR-0270 (extended), C58 §1.1/§2.2/§2.4, audit L-460.

import type { Pt, ParcelEdgeClassification } from '@pryzm/schemas';
import { polygonSignedArea } from '@pryzm/site-validators';
import { insetPolygonPerEdge } from './insetPolygon.js';

/** Fixed bisection budget. Deterministic by construction — never a tolerance-based while-loop,
 *  because a data-dependent iteration count would make the result input-sensitive at the last
 *  bit and break C58 §1.1. 40 halvings of a ≤30 m span resolves far below millimetre. */
export const BLOCK_DEPTH_BISECTION_STEPS = 40;

export interface BlockDerivedDepthInput {
    /** The BLOCK ring (scene-XZ metres) — the *manzana*, not the parcel. */
    readonly blockRing: ReadonlyArray<Pt>;
    /** Per-edge classification of `blockRing`. Edges classified `front` are the street frontages
     *  the depth is measured from; everything else is treated as interior/party boundary. */
    readonly blockEdgeClassifications: ReadonlyArray<ParcelEdgeClassification>;
    /** Minimum share of the block that MUST remain interior free space (Art. 242.2 ⇒ 0.30). */
    readonly interiorFreeRatio: number;
    /** Ordinance floor (Art. 242 ⇒ 11 m). */
    readonly minDepth_m: number;
    /** Ordinance cap (Art. 242 ⇒ 30 m). */
    readonly maxDepth_m: number;
}

/** Which rule actually determined the answer — needed for an honest "why this number" row. */
export type BlockDepthBinding =
    /** The free-space ratio bound it: this is the true Art. 242 construction. */
    | 'interior-ratio'
    /** The block is shallow enough that the ordinance CAP governs, not the ratio. */
    | 'max-cap'
    /** The ratio would force a depth below the ordinance FLOOR; the floor governs. */
    | 'min-floor';

export interface BlockDerivedDepthResult {
    readonly depth_m: number;
    /** The interior free ratio actually achieved at `depth_m` (diagnostic + explain-why). */
    readonly achievedFreeRatio: number;
    readonly binding: BlockDepthBinding;
    /**
     * TRUE when the construction could not be honoured: at the ordinance FLOOR the block still
     * cannot retain the required interior free space. **The caller MUST NOT silently fall back to
     * the floor** — that would publish a depth the ordinance does not sanction. Surface it.
     */
    readonly degenerate: boolean;
}

/** Absolute polygon area (m²). Winding-agnostic. */
function area(ring: ReadonlyArray<Pt>): number {
    return ring.length < 3 ? 0 : Math.abs(polygonSignedArea(ring));
}

/**
 * The interior free area remaining when the block is eroded by `d` from its street frontages
 * ONLY. Non-frontage edges get 0 so the interior courtyard is measured from the streets, which is
 * what "equidistant from the street frontages" means.
 */
function interiorFreeAreaAt(input: BlockDerivedDepthInput, d: number): number {
    const res = insetPolygonPerEdge(
        input.blockRing,
        input.blockEdgeClassifications as ParcelEdgeClassification[],
        { front: d, side: 0, rear: 0, unclassified: 0 },
    );
    return res.degenerate ? 0 : area(res.polygon);
}

/**
 * Solve Art. 242.2 for this block. PURE, deterministic, never throws.
 *
 * Returns the LARGEST depth in `[minDepth_m, maxDepth_m]` that still leaves `interiorFreeRatio`
 * of the block as interior free space, plus WHICH constraint bound the answer — the binding is
 * not a diagnostic nicety, it is what lets the UI say "the 30% courtyard rule set this" versus
 * "the 30 m cap set this", which are different legal statements about the same number.
 */
export function solveBlockDerivedDepth(
    input: BlockDerivedDepthInput,
): BlockDerivedDepthResult | null {
    const { blockRing, blockEdgeClassifications, interiorFreeRatio, minDepth_m, maxDepth_m } = input;
    if (blockRing.length < 3) return null;
    if (!(maxDepth_m >= minDepth_m) || !(minDepth_m >= 0)) return null;
    if (blockEdgeClassifications.length !== blockRing.length) return null;

    // §BLOCK-DEPTH-REQUIRES-FRONTAGE (L-465) — ⚠ WITHOUT THIS GUARD THE SOLVER RETURNS THE
    // ORDINANCE CAP FOR A BLOCK WITH NO IDENTIFIED STREETS, AND CALLS IT NON-DEGENERATE.
    //
    // Art. 242.2 measures the depth "equidistant from the street frontages". With no edge
    // classified `front`, `interiorFreeAreaAt` erodes NOTHING at any `d`, so the free ratio is
    // 1.0 for every depth, the `freeAtMax >= requiredFree` short-circuit below always fires, and
    // the function hands back `maxDepth_m` — 30 m, the deepest the ordinance permits ANYWHERE —
    // with `binding: 'max-cap'` and `degenerate: false`. A caller cannot tell that apart from a
    // genuine cap-bound answer.
    //
    // That is the exact defect class this module's own header rails against, reached from the
    // opposite direction: not a hard-coded depth, but a CONSTRUCTED one whose construction had
    // no input. A mis-classified block (the likely real-world case, since frontage classification
    // is itself derived) would silently produce maximum buildability on the densest land in Spain.
    //
    // `null` is the honest answer — the caller shows no envelope (C58 §1.2 tier 3, §1.4).
    if (!blockEdgeClassifications.some((c) => c === 'front')) return null;

    const blockArea = area(blockRing);
    if (!(blockArea > 0)) return null;
    const requiredFree = blockArea * interiorFreeRatio;

    // If even the ordinance FLOOR cannot keep the courtyard, the construction fails here. Report
    // it rather than clamping — a depth the ordinance does not sanction is worse than no answer.
    const freeAtMin = interiorFreeAreaAt(input, minDepth_m);
    if (freeAtMin < requiredFree) {
        return {
            depth_m: minDepth_m,
            achievedFreeRatio: freeAtMin / blockArea,
            binding: 'min-floor',
            degenerate: true,
        };
    }

    // If the CAP still leaves enough free space, the cap governs — the ratio never binds.
    const freeAtMax = interiorFreeAreaAt(input, maxDepth_m);
    if (freeAtMax >= requiredFree) {
        return {
            depth_m: maxDepth_m,
            achievedFreeRatio: freeAtMax / blockArea,
            binding: 'max-cap',
            degenerate: false,
        };
    }

    // The answer lies strictly between: bisect for the largest admissible d.
    // Invariant: `lo` always satisfies the ratio, `hi` always violates it.
    let lo = minDepth_m;
    let hi = maxDepth_m;
    for (let i = 0; i < BLOCK_DEPTH_BISECTION_STEPS; i++) {
        const mid = (lo + hi) / 2;
        if (interiorFreeAreaAt(input, mid) >= requiredFree) lo = mid;
        else hi = mid;
    }
    return {
        depth_m: lo,                       // `lo` is admissible by the invariant; `hi` is not.
        achievedFreeRatio: interiorFreeAreaAt(input, lo) / blockArea,
        binding: 'interior-ratio',
        degenerate: false,
    };
}
