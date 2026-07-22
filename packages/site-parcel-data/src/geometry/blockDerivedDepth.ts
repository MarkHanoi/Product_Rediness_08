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
    /**
     * §L-581 — ⚠ TRUE when the decision above was made on a COLLAPSED INSET rather than on the
     * ordinance. **When this is set, `binding` and `degenerate` are NOT trustworthy legal
     * statements** — the 0 free area they rest on came from our offset routine failing, not from
     * the courtyard being consumed.
     *
     * A caller that reports "Art. 242.2 cannot be satisfied here" while this flag is set is making
     * a claim about the ordinance on the strength of our own bug (C58 §1.11). Read it, log it, and
     * prefer refusing with a geometry reason over citing the ratio.
     *
     * Measured at ~3 in 4 of real Eixample blocks that reach this solver — see the note on
     * `interiorFreeAt`.
     */
    readonly insetDegenerate: boolean;
    /**
     * §L-581-MONOTONICITY — ⚠ TRUE when the free area MEASURABLY INCREASED with a DEEPER erosion
     * across the depths this solve actually sampled. That is physically impossible for any true
     * inward offset, so it is **not a fact about this block** — it is a **self-refutation of our own
     * geometry**, and it is the strongest evidence available that a `0` came from our offset rather
     * than from a consumed courtyard.
     *
     * **More CONCLUSIVE than `insetDegenerate`, but far RARER — and measured NOT to be independent
     * of it.** `insetDegenerate` reports that the offset gave up; it cannot say whether giving up
     * was CORRECT (a genuinely consumed courtyard legitimately yields 0). This flag, when it fires,
     * proves it was not — needing no assumption about block shape, which is precisely the assumption
     * that sank the retracted half-plane remedy, because monotonicity holds for every polygon,
     * convex or reflex.
     *
     * ⚠ **BUT IT FIRES ON ONLY 3.1% OF REAL BLOCKS, AND ADDS ZERO DETECTIONS OVER
     * `insetDegenerate`** (65-block fixture). It is a tripwire for a rare second failure mode, not a
     * measure of L-581. See `nonMonotone` for why this is structural and not tunable.
     *
     * ⚠ ONE-SIDED. `false` means no contradiction was seen **at the sampled depths**, NOT that the
     * offset is sound. Never present it as a certificate.
     *
     * ⚠ PURELY DIAGNOSTIC — no depth, binding, or refusal depends on it (yet). Turning it into a
     * refusal is the honest end state and a founder decision, because it converts wrong depths into
     * absent ones. See the note on `nonMonotone`.
     */
    readonly interiorFreeNonMonotone: boolean;
}

/** Absolute polygon area (m²). Winding-agnostic. */
function area(ring: ReadonlyArray<Pt>): number {
    return ring.length < 3 ? 0 : Math.abs(polygonSignedArea(ring));
}

/**
 * §L-581 — DID THE OFFSET FAIL, OR IS THE COURTYARD GENUINELY GONE? The two are not the same
 * fact, and until this existed the solver could not tell them apart.
 *
 * It previously returned a bare number that was 0 for BOTH "the erosion consumed the courtyard" and "the offset
 * routine collapsed", so a geometry failure was silently converted into a legal conclusion: the
 * bisection stops just below the collapse and reports `binding: 'interior-ratio'`, or — when the
 * collapse is below the ordinance floor — the solver returns `degenerate: true`, which reads as
 * *"Art. 242.2 cannot be satisfied on this block"*. That is a statement about the ORDINANCE made
 * on the strength of our own offset failing.
 *
 * MEASURED on 65 real Eixample manzanas that had already cleared depth and height: only 36.9%
 * came out geometrically sound; 61.5% returned `min-floor` degenerate and ~10 of 13
 * `interior-ratio` rows reported an achieved free ratio of 44–94%, which is impossible if the
 * 30% ratio had actually bound (a genuine ratio-bound answer lands AT 30%).
 *
 * ROOT CAUSE, isolated: the failure is the MIXTURE of setbacks, not the ring. On the same block
 * `{front: 5, side: 0}` (the Art. 242 call) collapses while a UNIFORM 5 m on every edge succeeds.
 * That mixed shape is the party-wall (*mitgera*) configuration — the Barcelona *ensanche* case
 * ADR-0270 exists to serve — so the defect sits on the pack's most important use case.
 *
 * ⚠ THIS FLAG DELIBERATELY DOES NOT CHANGE THE ANSWER. Making the solver refuse on a collapsed
 * inset is the honest end state, but it turns a wrong depth into NO depth on ~3 in 4 blocks —
 * a visible regression that is a product decision, not a refactor. Reporting first means the
 * live rate can be observed before that trade is taken. Fixing the offset removes the trade
 * altogether, and is the preferred order.
 */
interface InteriorFree {
    readonly area_m2: number;
    /** TRUE when the 0 came from the OFFSET FAILING, not from the courtyard being consumed. */
    readonly insetDegenerate: boolean;
}

function interiorFreeAt(input: BlockDerivedDepthInput, d: number): InteriorFree {
    const res = insetPolygonPerEdge(
        input.blockRing,
        input.blockEdgeClassifications as ParcelEdgeClassification[],
        { front: d, side: 0, rear: 0, unclassified: 0 },
    );
    return { area_m2: res.degenerate ? 0 : area(res.polygon), insetDegenerate: res.degenerate };
}

/**
 * §L-581-MONOTONICITY — THE PROOF THAT A COLLAPSE IS **OUR** FAILURE AND NOT THE ORDINANCE'S.
 *
 * `insetDegenerate` says the offset routine gave up. It does NOT, by itself, prove the routine was
 * WRONG to: a courtyard really can be consumed, and a genuinely consumed courtyard is a legitimate
 * `0`. Distinguishing the two is the whole difficulty of L-581, and a flag that merely reports "the
 * offset returned degenerate" leaves it undistinguished.
 *
 * **Monotonicity settles it, from physics rather than from geometry code.** Eroding a polygon
 * further inward can only ever REMOVE area:
 *
 *     d₁ < d₂   ⟹   freeArea(d₁) ≥ freeArea(d₂)
 *
 * This holds for every polygon, convex or reflex, for any true inward offset — it needs no
 * assumption about block shape (which is what sank the retracted half-plane argument: **all 65
 * fixture blocks carry 10–43 reflex vertices, zero convex**). So an observed INCREASE is not
 * evidence about the ordinance, the block, or the courtyard. It is a **contradiction**, and the only
 * thing it can contradict is our own offset.
 *
 * When the free area is `0` at the ordinance FLOOR (11 m) but POSITIVE at a DEEPER depth, the solver
 * is about to report *"Art. 242.2 cannot be satisfied on this block"* — a statement about Catalan
 * planning law — on the strength of a measurement its own deeper sample refutes.
 *
 * ⚠⚠ **AND IT CATCHES ALMOST NOTHING. MEASURED, 65 REAL BLOCKS: 3.1% — AND *ZERO* CASES THAT
 * `insetDegenerate` DID NOT ALREADY CATCH.** This is recorded rather than quietly dropped because
 * the author (me) introduced it predicting it would be "the strongest evidence available", and the
 * fixture said otherwise. **The prediction was wrong, and the reason is structural, not a tuning
 * problem:**
 *
 *   - collapses and STAYS collapsed at every depth : **45/65** ⟵ monotone (0 → 0). **INVISIBLE.**
 *   - collapses then RECOVERS deeper               : **11/65** ⟵ the only shape this can ever see
 *   - never collapses                              :   9/65
 *
 * The offset does not *sag* on these blocks — it fails **outright and everywhere**. A test for
 * "impossible increase" cannot see a function that is flat at zero. Of the 11 recoverable blocks
 * only 2 are flagged, because the solver samples the depths its bisection needs, not the depths a
 * recovery happens to occupy.
 *
 * ⚠ **THE CONSEQUENCE FOR THE PLANNED FIX, WHICH THIS MEASUREMENT PARTLY DEMOLISHES: the
 * "monotonicity guard" half of the L-581 plan is NOT the valuable half.** It cannot detect the
 * dominant pathology. **The CLAMP is the whole fix.** Anyone budgeting L-581 as "clamp + guard"
 * should budget it as "clamp", and treat this flag as a cheap always-honest tripwire for a rare
 * second failure mode — not as coverage.
 *
 * ⚠ **THE NUMBER THAT ACTUALLY MATTERS IS NOT THIS ONE: 63.1% of real Eixample blocks collapse AT
 * THE 11 m FLOOR** — the shallowest depth the ordinance permits anywhere. The solver is not failing
 * at aggressive depths; it is failing at the gentlest one it will ever be asked for.
 *
 * ⚠ **THIS IS MEASUREMENT ONLY. IT CHANGES NO DEPTH, NO BINDING, AND NO REFUSAL.** Making the solver
 * refuse here is the honest end state, but it converts a wrong depth into NO depth on a large
 * fraction of real blocks — a visible product regression that is the founder's call, not a
 * refactor's. Reporting first is the same order this module already took for `insetDegenerate`, and
 * for the same reason: **the live rate should be observed before the trade is taken.**
 *
 * ⚠ It is a ONE-SIDED test. `false` means "no contradiction was observed **at the depths we happened
 * to sample**" — never "the offset is sound". Absence of evidence is not evidence of absence, and
 * this function must not be read as a certificate.
 */
function nonMonotone(samples: ReadonlyArray<{ readonly d: number; readonly a: number }>, blockArea: number): boolean {
    // Tolerance relative to the block, so it scales with the geometry instead of assuming a unit.
    // Guards against float noise in the offset/area arithmetic being read as a real increase.
    const eps = Math.max(1e-9, blockArea * 1e-9);
    const sorted = [...samples].sort((x, y) => x.d - y.d);
    for (let i = 1; i < sorted.length; i++) {
        // Deeper erosion produced MORE free area than a shallower one. Physically impossible.
        if (sorted[i]!.a > sorted[i - 1]!.a + eps) return true;
    }
    return false;
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
    // classified `front`, `interiorFreeAt` erodes NOTHING at any `d`, so the free ratio is
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

    // §L-581-MONOTONICITY — every depth this solver evaluates, recorded as it goes. Free area must
    // fall as depth grows; the record is what lets us notice when it doesn't. Measurement only.
    const samples: Array<{ d: number; a: number }> = [];
    const measure = (d: number): InteriorFree => {
        const r = interiorFreeAt(input, d);
        samples.push({ d, a: r.area_m2 });
        return r;
    };

    // If even the ordinance FLOOR cannot keep the courtyard, the construction fails here. Report
    // it rather than clamping — a depth the ordinance does not sanction is worse than no answer.
    const atMin = measure(minDepth_m);
    if (atMin.area_m2 < requiredFree) {
        // §L-581-MONOTONICITY — ⚠ WE ARE ABOUT TO SAY "ART. 242.2 CANNOT BE SATISFIED ON THIS
        // BLOCK". Before making a claim about the ordinance, take ONE deeper sample and check our
        // own arithmetic against physics: MORE erosion cannot leave MORE free area. If the deeper
        // depth comes back larger, the floor measurement is refuted by our own instrument and the
        // legal conclusion rests on nothing.
        //
        // ⚠ MEASURED YIELD: 1 of 41 blocks on this path. The extra offset call is kept because it is
        // cheap (one offset, off the hot path) and because when it DOES fire the conclusion is
        // certain rather than probable — but it is a tripwire, NOT coverage. The dominant failure
        // (collapsed at every depth, 45/65) is invisible to it by construction. Do not read a
        // `false` here as reassurance.
        measure(maxDepth_m);
        return {
            depth_m: minDepth_m,
            achievedFreeRatio: atMin.area_m2 / blockArea,
            binding: 'min-floor',
            degenerate: true,
            // §L-581 — the dominant case in practice: the inset collapsed AT the floor, so this
            // "the ordinance cannot be satisfied" is really "our offset failed". 61.5% of real
            // Eixample blocks that reach here.
            insetDegenerate: atMin.insetDegenerate,
            interiorFreeNonMonotone: nonMonotone(samples, blockArea),
        };
    }

    // If the CAP still leaves enough free space, the cap governs — the ratio never binds.
    const atMax = measure(maxDepth_m);
    if (atMax.area_m2 >= requiredFree) {
        return {
            depth_m: maxDepth_m,
            achievedFreeRatio: atMax.area_m2 / blockArea,
            binding: 'max-cap',
            degenerate: false,
            // A cap-bound answer never rests on a collapse — the inset SUCCEEDED at the cap.
            insetDegenerate: false,
            interiorFreeNonMonotone: nonMonotone(samples, blockArea),
        };
    }

    // The answer lies strictly between: bisect for the largest admissible d.
    // Invariant: `lo` always satisfies the ratio, `hi` always violates it.
    let lo = minDepth_m;
    let hi = maxDepth_m;
    for (let i = 0; i < BLOCK_DEPTH_BISECTION_STEPS; i++) {
        const mid = (lo + hi) / 2;
        if (measure(mid).area_m2 >= requiredFree) lo = mid;
        else hi = mid;
    }
    // §L-581 — WHICH FACT STOPPED THE BISECTION? `hi` is the first inadmissible depth. If the
    // inset COLLAPSED there, the ratio never bound: we merely walked up to our own failure and
    // labelled it with an ordinance rule. The tell is visible in the output — a genuine
    // ratio-bound answer lands AT the ratio (30%), while a collapse-bound one lands wherever the
    // offset happened to break (44–94% observed).
    const atHi = measure(hi);
    const atLo = measure(lo);
    return {
        depth_m: lo,                       // `lo` is admissible by the invariant; `hi` is not.
        achievedFreeRatio: atLo.area_m2 / blockArea,
        binding: 'interior-ratio',
        degenerate: false,
        insetDegenerate: atHi.insetDegenerate,
        // §L-581-MONOTONICITY — across the bisection's OWN 40+ sample points. A violation here means
        // the bisection was searching a domain where its premise does not hold, so `binding:
        // 'interior-ratio'` names a rule that never actually bound.
        interiorFreeNonMonotone: nonMonotone(samples, blockArea),
    };
}
