// C63 §3.2 (L-656) / C58 §1.11 — WHICH LAND a planning ratio is measured OVER.
//
// ─────────────────────────────────────────────────────────────────────────────
// WHY THIS FILE EXISTS — the distinction the model could not represent (W5-2)
// ─────────────────────────────────────────────────────────────────────────────
// C63 is RATIFIED on the point that a completion / envelope figure is scored against
// **buildable land** — net of cesión / street dedication and of the area an ordinance
// removes from private buildability (C63 §3.2: "land the ordinance removes from private
// buildability is EXCLUDED from Axis 4 entirely, never scored zero"). Before this file
// there was **no `buildableLand`, `netLand`, `grossLand` or `cesión` identifier anywhere
// in the TypeScript source**. What existed instead was:
//
//   • a metadata STRING (`densityScope`) on an extracted rule, which no consumer read; and
//   • a one-off script (`tools/valencia-envelope-max/05-denominator.mjs`) modelling cesión
//     as "street holes" — outside the type system entirely.
//
// The consequence is `L-616` one level up. `densityCoherence()` (@pryzm/ordinance-extraction)
// asserts the density identity **FAR ≤ coverage × floors**. That identity holds only when FAR
// and coverage are ratios over THE SAME land. Hand it a FAR measured over a gross sector and
// a coverage measured over the parcel and the arithmetic still "works": the gate returns
// `pass`, and three mutually-consistent numbers are all wrong at once. A healthy aggregate
// computed over an unmodelled denominator is not a weaker check — it is a check that cannot
// fail, which is how wrong numbers get minted silently.
//
// ⭐ THE FIX IS A TYPE, NOT A RUNTIME CHECK. `RatioOverLand<B>` is nominal (a module-private
// symbol brand) and INVARIANT in `B`, so `RatioOverLand<'gross'>` and `RatioOverLand<'parcel'>`
// are not mutually assignable. A function that asserts a relation between two ratios declares
// both parameters over ONE `B` (pinning the second with `NoInfer`), and mixing bases is then a
// `tsc` error at the call site rather than a verdict a gate might forget to compute.
//
// L0-pure (P5): Zod + plain TS only. No I/O, no THREE, no DOM. Following the L-664 precedent
// that moved `ENVELOPE_CONFIDENCE_ORDER` down to L0 — one ontology, stated once, beside the
// enum it orders, reachable by both the L2 extraction core and the L0 scorecard.
//
// Strategic context — docs/02-decisions/contracts/C63-CITY-COMPLETION-AND-DOSSIER.md §3.2;
// C58-ZONING-RULES-AND-BUILDABLE-ENVELOPE.md §1.11.

import { z } from 'zod';

/**
 * The land area a planning ratio's denominator IS. A closed vocabulary, because these are
 * legally different areas of ground and a free-text string lets them blur — which is exactly
 * what happened (the extraction core carried three of them as an unread metadata string while
 * C63 ratified a fourth that nothing in the source ever named).
 *
 *  - `gross`        — the whole block / sector / ámbito BEFORE any dedication is deducted
 *                     (Spanish *edificabilitat bruta*). The largest denominator, so a ratio
 *                     over it yields the SMALLEST floor area for a given plot.
 *  - `net-of-cesion`— gross MINUS the *cesión* / street-and-public-system dedication: the net
 *                     developable area. Distinct from `gross` by exactly the land the plan
 *                     hands to the municipality (the Murcia 7 m cesión strip is the shipped
 *                     case), and distinct from `parcel` because a sector's net area is shared
 *                     across many plots.
 *  - `parcel`       — THIS plot's own registered area (German *Grundstücksfläche*, the GRZ/GFZ
 *                     denominator under §19/§20 BauNVO; Spanish *edificabilitat neta* on the
 *                     parcel). ⚠ NOT a synonym for `buildable`: a parcel may itself contain a
 *                     cesión strip or an area the ordinance excludes, so a per-parcel ratio can
 *                     be measured over ground that may not be built on.
 *  - `buildable`    — **C63's ratified denominator**: land that is PRIVATELY BUILDABLE, net of
 *                     cesión AND of any area the ordinance removes from private buildability.
 *                     ⚠ Recorded here as a first-class member precisely so its absence is
 *                     legible: no extraction path in this repo currently produces a ratio
 *                     stamped `buildable`, which is a finding, not an omission (see §UNPROVEN
 *                     in the W5-2 report). Nothing may map another basis onto it — the step
 *                     from `parcel` or `net-of-cesion` to `buildable` requires subtracting a
 *                     measured non-buildable area, which is a data acquisition, not a rename.
 *  - `unknown`      — the source stated the ratio but NOT the land it is measured over.
 *
 * ⛔ `unknown` IS NOT A DEFAULT AND NOT A SYNONYM FOR `gross`, ZERO OR UNBOUNDED. It is the
 * first-class state that FORCES a refusal. Silently reading it as any concrete basis is the
 * L-616 over-statement — an UNKNOWN constraint drawn as a known one always over-states on real
 * land. `RatioOverLand` cannot be constructed at `unknown` at all (see `ratioOverLand`), so the
 * only route past it is `resolveRatioOverLand`, which hands back a typed refusal.
 */
export const LandBasisSchema = z.enum([
    'gross',
    'net-of-cesion',
    'parcel',
    'buildable',
    'unknown',
]);
export type LandBasis = z.infer<typeof LandBasisSchema>;

/**
 * A land basis that actually NAMES a piece of ground. `unknown` is excluded by construction —
 * every API that needs a denominator takes this type, so "we do not know which land" cannot
 * reach the arithmetic. That is the whole point: the error is unrepresentable, not detected.
 */
export type KnownLandBasis = Exclude<LandBasis, 'unknown'>;

/**
 * The bases ordered from LARGEST land to SMALLEST (coarsest denominator first). Ordering
 * matters because it is monotone in the direction of over-statement: for one plot and one
 * floor-area allowance, the smaller the denominator the LARGER the ratio, so reading a ratio
 * over a smaller basis than it was published against over-states buildable volume — the one
 * direction C58 §1.4 forbids.
 *
 * ⚠ `unknown` is NOT in this list. It has no position: it is not "somewhere in the middle" and
 * it is not "the safe end". Giving it a rank would invite exactly the arithmetic that turns a
 * refusal back into a number.
 */
export const LAND_BASIS_BREADTH: readonly KnownLandBasis[] = Object.freeze([
    'gross',
    'net-of-cesion',
    'parcel',
    'buildable',
] as const);

/** How broad this basis's land is — 0 = broadest (`gross`). See {@link LAND_BASIS_BREADTH}. */
export function landBasisBreadthRank(b: KnownLandBasis): number {
    return LAND_BASIS_BREADTH.indexOf(b);
}

// ─────────────────────────────────────────────────────────────────────────────
// THE BRAND
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The nominal brand. A module-private `unique symbol` — NOT exported, so no code outside this
 * file can name it, and therefore no code outside this file can construct a `RatioOverLand`
 * by object literal or widen one with a cast it could write by hand. `ratioOverLand` is the
 * single door, and it takes a `KnownLandBasis`.
 */
const LAND_BASIS_BRAND: unique symbol = Symbol('pryzm.landBasis');

/**
 * A dimensionless planning ratio TOGETHER WITH the land its denominator is.
 *
 * ⭐ WHY THE PHANTOM IS A FUNCTION TYPE. `(b: B) => B` places `B` in a contravariant AND a
 * covariant position, which makes `RatioOverLand` **invariant** in `B`. Without that, TS's
 * structural bivariance would happily accept a `RatioOverLand<'gross'>` where a
 * `RatioOverLand<'parcel'>` is expected and the whole guarantee would be decoration. With it,
 * the two types are mutually non-assignable and mixing them is a compile error.
 *
 * ⚠ There is no `as` cast anywhere in the construction path: the brand is a real symbol with a
 * real value, so the constructor builds an ordinary object literal. A branded type that needs
 * a cast to build is a branded type that can be forged by copying the cast.
 */
export interface RatioOverLand<B extends KnownLandBasis> {
    /** The dimensionless ratio itself (GFZ/GRZ/FAR/coverage). */
    readonly value: number;
    /** The land the denominator IS. Readable at runtime for messages and provenance. */
    readonly basis: B;
    /** Phantom — invariance carrier. Never read. */
    readonly [LAND_BASIS_BRAND]: (b: B) => B;
}

/**
 * The ONLY constructor. It accepts a {@link KnownLandBasis} and nothing else, so a ratio whose
 * denominator is unknown is not a `RatioOverLand` that happens to be flagged — it does not
 * exist as a value of this type. Callers holding a possibly-`unknown` basis must go through
 * {@link resolveRatioOverLand} and confront the refusal.
 */
export function ratioOverLand<B extends KnownLandBasis>(
    value: number,
    basis: B,
): RatioOverLand<B> {
    return { value, basis, [LAND_BASIS_BRAND]: (b: B) => b };
}

// ─────────────────────────────────────────────────────────────────────────────
// THE REFUSAL — closed, coded, reason-preserving (the `EnvelopeRefusalCode` idiom)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * WHY a denominator-bearing comparison could not be made. Modelled on
 * {@link EnvelopeRefusalCodeSchema}'s closed union: these are DIFFERENT statements about the
 * world and collapsing them to one "not applicable" is the §CONTEXT-DATA-HONESTY failure this
 * whole family of defects (L-422 / L-457 / L-467 / L-469 / L-616) keeps re-teaching.
 *
 *  - `basis-unknown`      — the source STATED the ratio and did NOT state its denominator. A
 *                           fact about the ordinance text. No amount of engineering fixes it;
 *                           it needs a better reading or a human.
 *  - `basis-not-declared` — the PRODUCER emitted no basis at all. A fact about PRYZM's own
 *                           pipeline: the grammar/pack never had a place to say it, so the
 *                           silence is ours, not the ordinance's. ⚠ Distinct from
 *                           `basis-unknown` for the same reason `no-rule-pack` is distinct from
 *                           `derived-plan`: one is a gap we can close by authoring, the other is
 *                           a property of the source.
 *  - `basis-mismatch`     — two ratios resolved over DIFFERENT known land. Both numbers may be
 *                           perfectly correct; the RELATION between them is what is refused.
 *                           This is a positive finding, not a missing input.
 *  - `basis-unreachable`  — the required basis is one no producer in this repo can currently
 *                           emit. `buildable` is the shipped case (C63's ratified denominator,
 *                           which nothing yet computes). Named so a caller asking for a
 *                           buildable-land answer is told it does not exist, rather than
 *                           silently served a parcel-land one.
 *  - `ratio-unresolved`   — an operand did not resolve at all. Kept separate so "the check could
 *                           not run" is never confused with "the check ran and refused".
 */
export const LandBasisRefusalCodeSchema = z.enum([
    'basis-unknown',
    'basis-not-declared',
    'basis-mismatch',
    'basis-unreachable',
    'ratio-unresolved',
]);
export type LandBasisRefusalCode = z.infer<typeof LandBasisRefusalCodeSchema>;

/**
 * A structured, reason-preserving denominator refusal. `bases` carries every basis that took
 * part, so a mismatch message can NAME both — "these disagree" without saying what disagreed is
 * an unauditable claim, the same defect `EnvelopeRefusal.knownFacts` exists to prevent.
 */
export const LandBasisRefusalSchema = z.object({
    code: LandBasisRefusalCodeSchema,
    /** One line a human reads first. */
    headline: z.string().min(1),
    /** The reasoning, naming the operands and their bases. */
    detail: z.string().min(1),
    /** The bases that took part, in operand order. `null` where an operand declared none. */
    bases: z.array(LandBasisSchema.nullable()).default([]),
});
export type LandBasisRefusal = z.infer<typeof LandBasisRefusalSchema>;

/**
 * The resolution of ONE possibly-basis-less ratio: a branded ratio, or a typed refusal. The
 * discriminant is `ok`, matching the extraction core's `TextExtractionOutcome` idiom, so a
 * caller cannot reach `.ratio` without having narrowed past the refusal.
 */
export type LandBasisResolution =
    | { readonly ok: true; readonly ratio: RatioOverLand<KnownLandBasis> }
    | { readonly ok: false; readonly refusal: LandBasisRefusal };

/**
 * Turn a raw `(value, basis?)` pair into a branded ratio — or refuse.
 *
 * This is the ONE place a runtime string becomes a type-level guarantee, and it refuses in
 * three distinguishable ways rather than defaulting in any. `undefined` (the producer said
 * nothing) and `'unknown'` (the producer said "the text does not say") are deliberately NOT
 * folded together: the first is a gap PRYZM can close, the second is a property of the source.
 *
 * @param label a human name for the operand, used in the refusal detail (e.g. `'maxFAR'`).
 */
export function resolveRatioOverLand(
    value: number,
    basis: LandBasis | undefined,
    label: string,
): LandBasisResolution {
    if (basis === undefined) {
        return {
            ok: false,
            refusal: {
                code: 'basis-not-declared',
                headline: `${label} declares no land basis.`,
                detail:
                    `${label} = ${value} was produced without any statement of the land its ` +
                    'denominator is. That silence is PRYZM\'s, not the ordinance\'s — the producer ' +
                    'has no field in which to say it. It must not be read as agreement with any ' +
                    'other ratio.',
                bases: [null],
            },
        };
    }
    if (basis === 'unknown') {
        return {
            ok: false,
            refusal: {
                code: 'basis-unknown',
                headline: `${label} states no denominator.`,
                detail:
                    `${label} = ${value} was stated by the source without naming the land it is ` +
                    'measured over. `unknown` is not `gross`, not the parcel, not zero and not ' +
                    'unbounded — reading it as any of those over-states on real land (L-616).',
                bases: ['unknown'],
            },
        };
    }
    return { ok: true, ratio: ratioOverLand(value, basis) };
}

/**
 * Two ratios, resolved over ONE land, ready to be related.
 *
 * ⚠ THE CEILING PROPERTY (the `capEnvelopeConfidenceToPackDefault` discipline applied here):
 * `basis` is never STRONGER than any operand's — it is one of them, because the pair is only
 * returned when both agree. A resolution may weaken (to a refusal); it may never promote a
 * `parcel`-basis ratio into a `buildable`-basis answer. `landBasisPairIsNeverPromoted` in the
 * test suite pins it.
 */
export type LandBasisPair<B extends KnownLandBasis> = {
    readonly ok: true;
    readonly basis: B;
    readonly a: RatioOverLand<B>;
    readonly b: RatioOverLand<B>;
};

/** The outcome of pairing two ratios: one shared land, or a typed refusal. */
export type LandBasisPairing =
    | LandBasisPair<KnownLandBasis>
    | { readonly ok: false; readonly refusal: LandBasisRefusal };

/**
 * Pair two raw ratios over ONE land, or refuse with the reason and both bases.
 *
 * ⭐ This is the RUNTIME door; the TYPE door is that everything downstream of it takes
 * `RatioOverLand<B>` twice over a single `B`. Once a caller holds a {@link LandBasisPair}, TS
 * itself forbids substituting a ratio over different land into either slot.
 */
export function pairOverSameLand(
    a: { readonly value: number; readonly basis: LandBasis | undefined; readonly label: string },
    b: { readonly value: number; readonly basis: LandBasis | undefined; readonly label: string },
): LandBasisPairing {
    const ra = resolveRatioOverLand(a.value, a.basis, a.label);
    if (!ra.ok) return ra;
    const rb = resolveRatioOverLand(b.value, b.basis, b.label);
    if (!rb.ok) return rb;

    if (ra.ratio.basis !== rb.ratio.basis) {
        return {
            ok: false,
            refusal: {
                code: 'basis-mismatch',
                headline: `${a.label} and ${b.label} are measured over different land.`,
                detail:
                    `${a.label} = ${a.value} is a ratio over ${ra.ratio.basis} land; ` +
                    `${b.label} = ${b.value} is a ratio over ${rb.ratio.basis} land. ` +
                    'They are not two facts about one denominator, so no relation between them ' +
                    'may be asserted — the arithmetic would still produce a number, and that ' +
                    'number would be about nothing (C63 §3.2 denominator rule, L-656).',
                bases: [ra.ratio.basis, rb.ratio.basis],
            },
        };
    }

    // Both bases are equal at runtime; re-brand once so the pair is generic over ONE `B`.
    const basis = ra.ratio.basis;
    return {
        ok: true,
        basis,
        a: ratioOverLand(a.value, basis),
        b: ratioOverLand(b.value, basis),
    };
}

/**
 * Assert that two branded ratios are over the same land — AT COMPILE TIME.
 *
 * `NoInfer` pins `B` to the FIRST argument, so the second is checked against it rather than
 * widening the inference to a union. Calling this with ratios over different bases does not
 * return `false`; it does not compile. That is the difference between a distinction the model
 * can represent and a check somebody has to remember to run.
 *
 * It returns the shared basis so a caller can record WHICH land the relation was asserted over
 * — a relation with no stated denominator is the defect this file exists to close.
 */
export function sharedLandBasis<B extends KnownLandBasis>(
    a: RatioOverLand<B>,
    b: RatioOverLand<NoInfer<B>>,
): B {
    // Runtime agreement is guaranteed by the type; the read is what makes the basis available.
    void b;
    return a.basis;
}

/**
 * A refusal for a basis nothing in this repo can currently produce — today, `buildable`.
 *
 * Exported so a consumer that genuinely needs C63's ratified denominator gets told so, by name,
 * instead of being handed a parcel-land figure that looks like an answer. Per C63 §1.2 the
 * honest value is a typed unknown, never a substituted one.
 */
export function unreachableLandBasisRefusal(
    wanted: KnownLandBasis,
    have: LandBasis | null,
    label: string,
): LandBasisRefusal {
    return {
        code: 'basis-unreachable',
        headline: `No producer emits a ratio over ${wanted} land.`,
        detail:
            `${label} was asked for over ${wanted} land — C63 §3.2's ratified denominator — and ` +
            `the value available is over ${have ?? 'an undeclared basis'}. Converting between ` +
            'them requires subtracting a MEASURED non-buildable area (cesión / excluded ground); ' +
            'it is a data acquisition, not a rename, and PRYZM must not perform it implicitly.',
        bases: [have],
    };
}
