// ADR-0270 / §L-451 — THE GEOMETRIC RULE MODEL.
//
// WHY THIS EXISTS
// ---------------
// C58 §2.2 modelled a zone's geometry with exactly one shape — `{ front_m, side_m, rear_m }` —
// and §2.4 solved `insetPolygon = parcel ⊖ setbacks`. That is correct for detached/suburban
// fabric, and it IS the founder's Portuguese reference case (Seixal UH2: 6 m front / 3 m side /
// 5 m rear).
//
// It is NOT how dense Spanish urban fabric is regulated. Verified live (L-438): Madrid's PGOU
// publishes `Fondo de la Edificación` as a POLYLINE alongside `Alineaciones`. Spanish *ensanche*
// zones are governed by **alineación a vial** (the façade sits ON the street line, not set back
// from it) plus **profundidad edificable** (a maximum buildable DEPTH measured from that line),
// with **party walls** on the side boundaries.
//
// THESE ARE NOT DIFFERENT NUMBERS FOR ONE RULE. THEY ARE A DIFFERENT GEOMETRIC OPERATION:
//   • setback  → erode inward from every edge          (an inset / negative buffer)
//   • alignment→ project a band of depth D from ONE edge (an inset THEN a half-plane clip)
//
// Coercing alineación into `front_m: 0` loses *profundidad edificable* entirely and silently
// yields an envelope covering the WHOLE PLOT DEPTH — a confidently wrong buildable area on
// exactly the dense urban parcels where land value is highest.
//
// C58 §1.4 stops us presenting a guess as a fact.
// C58 §1.11 stops us presenting a fact about the wrong THING.
// NEITHER stopped us presenting a fact of the wrong SHAPE. This closes that third hole.
//
// WHY A DISCRIMINATED UNION AND NOT OPTIONAL FIELDS
// -------------------------------------------------
// 1. The solver must branch on KIND. Erode-from-all-edges and project-a-band-from-one-edge are
//    different operations; optional fields would force `if (front_m != null)` guesswork at the
//    one place that has to be unambiguous.
// 2. It makes illegal states unrepresentable. A zone cannot have BOTH a front setback and a
//    street alignment. The union forbids it; optional fields permit the contradiction and defer
//    the failure to runtime — on a compliance number.
// 3. New jurisdictions are ADDITIVE — a future `build-to-line` is a new variant, not a migration
//    of every shipped rule pack.
// 4. A Zod discriminated union gives an exhaustive TS switch, so adding a kind without handling
//    it in the solver is a COMPILE error rather than a silently-skipped compliance rule. On
//    compliance geometry that distinction is the entire point.
//
// P5 — PURE. Zod only. No I/O, no THREE, no DOM.

import { z } from 'zod';

/**
 * Detached / suburban fabric. **This is today's only behaviour**, unchanged.
 *
 * Solved as an inset: erode inward from every edge by its classified distance.
 */
export const SetbackRuleSchema = z.object({
    kind: z.literal('setback'),
    front_m: z.number().nonnegative(),
    side_m: z.number().nonnegative(),
    rear_m: z.number().nonnegative(),
});

/**
 * Alignment-governed fabric (Spanish *ensanche*, and the same pattern across much of
 * continental Europe).
 *
 * Solved as an inset (front = the alignment offset, usually 0; sides per `sideTreatment`;
 * rear where imposed) FOLLOWED BY a half-plane clip at `buildableDepth_m` measured from the
 * aligned edge. The clip is what `setback` has no way to express.
 */
/**
 * Fields shared by EVERY alignment-governed variant. Factored (ADR-0271) so the block-derived
 * variant repeats none of them: the two kinds describe the SAME geometric operation and differ
 * only in where the depth comes from, so any future change to `sideTreatment` semantics must not
 * need mirroring in two places.
 */
const alignmentCoreShape = {
    /**
     * Which line the façade must sit on. `street` = the parcel edge classified `front`;
     * `official-line` = a separately-published alineación that may not coincide with the
     * cadastral edge (Madrid publishes these as their own layer).
     */
    alignTo: z.enum(['street', 'official-line']),

    /**
     * Offset of the façade from the aligned edge. Normally 0 (build ON the line) — that is
     * what *alineación a vial* means. Non-zero where the PGOU sets the official line back
     * from the cadastral boundary.
     */
    alignmentOffset_m: z.number().nonnegative().default(0),

    /**
     * `party-wall` (medianera) = build to the side boundary, zero setback — the norm in
     * ensanche. `setback` = a real side distance, then `side_m` is required.
     */
    sideTreatment: z.enum(['party-wall', 'setback']),

    /** Required iff `sideTreatment === 'setback'`. Refined below. */
    side_m: z.number().nonnegative().optional(),

    /** *Patio de manzana* / rear courtyard, where the ordinance imposes one. */
    rear_m: z.number().nonnegative().optional(),
} as const;

/**
 * Without this, `sideTreatment: 'setback'` with no `side_m` would silently solve as a party wall
 * — i.e. build to the boundary — which is the opposite of what the pack author wrote. Fail the
 * pack loudly instead. Applied to every alignment-governed variant.
 */
const requireSideWhenSetback = <T extends { sideTreatment: string; side_m?: number }>(r: T) =>
    r.sideTreatment !== 'setback' || typeof r.side_m === 'number';

const SIDE_REQUIRED_MSG = {
    message:
        "side_m is REQUIRED when sideTreatment is 'setback' — otherwise the zone would " +
        'silently solve as a party wall (build to the boundary), the opposite of intent.',
    path: ['side_m'],
};

export const AlignmentRuleSchema = z
    .object({
        kind: z.literal('alignment'),
        ...alignmentCoreShape,

        /**
         * *Profundidad edificable* — max buildable depth measured perpendicular from the
         * aligned edge. Strictly positive: a zero-depth alignment zone is not a rule, it is a
         * transcription error, and accepting it would produce an empty envelope that reads as
         * "nothing may be built here" rather than "this pack is wrong".
         */
        buildableDepth_m: z.number().positive(),
    })
    .refine(requireSideWhenSetback, SIDE_REQUIRED_MSG);

/**
 * ADR-0271 — alignment-governed, but the ordinance states an ALGORITHM for the depth rather than
 * a number.
 *
 * PGM NNUU Art. 242.2 (Barcelona Eixample): *"a figure similar to the block, equidistant from the
 * street frontages, leaving at least 30% of the block area as interior free space"*, capped at
 * 30 m and floored at 11 m. The depth is a FUNCTION OF THE BLOCK and differs block to block —
 * which is exactly why the "20 m" / "24 m" figures repeated online contradict one another.
 *
 * ⚠ WHY THIS IS A SEPARATE `kind` AND NOT A NESTED UNION ON `buildableDepth_m`: the two variants
 * have different INPUT REQUIREMENTS AT THE ENGINE BOUNDARY, not merely different field values. A
 * block-derived zone is UNSOLVABLE without a block ring. Making that a discriminated `kind` lets
 * the exhaustive solver switch carry the requirement STATICALLY, so routing a block-derived zone
 * through the parcel-only path is a compile error rather than a runtime `undefined` on a
 * compliance number. That is the union's entire stated purpose (ADR-0270, reason 4).
 *
 * Granularity: a depth derived from the block is **block**-granularity — two parcels on the same
 * manzana share it. C58 §1.11.2 forbids presenting it as a parcel figure without saying so.
 */
export const BlockDerivedAlignmentRuleSchema = z
    .object({
        kind: z.literal('block-derived-alignment'),
        ...alignmentCoreShape,

        /**
         * Minimum share of the block that MUST remain interior free space (Art. 242.2 ⇒ 0.30).
         * Exclusive bounds: a ratio of 0 imposes no constraint (the cap would always bind, so the
         * rule is not a construction at all) and a ratio of 1 admits no building whatever.
         * Either is a transcription error, not a zone.
         */
        interiorFreeRatio: z.number().gt(0).lt(1),

        /** Ordinance floor (Art. 242 ⇒ 11 m). */
        minDepth_m: z.number().positive(),

        /** Ordinance cap (Art. 242 ⇒ 30 m). */
        maxDepth_m: z.number().positive(),
    })
    .refine(requireSideWhenSetback, SIDE_REQUIRED_MSG)
    .refine((r) => r.maxDepth_m >= r.minDepth_m, {
        // An inverted band has no admissible depth at all, so every parcel in the zone would
        // silently return "no buildable area" — indistinguishable at runtime from a plot that
        // genuinely cannot be built on. Reject the PACK instead.
        message: 'maxDepth_m must be >= minDepth_m — an inverted band admits no depth.',
        path: ['maxDepth_m'],
    });

/**
 * The PGOU publishes the buildable area DIRECTLY as geometry (Madrid's `Fondo de la
 * Edificación` polyline).
 *
 * NOT a fallback for "we could not parse it": when the document IS the polygon, transcribing it
 * into parameters is a lossy re-derivation of something already authoritative. `ringRef` is
 * resolved from the curated pack — geometry is never inlined here, so this schema stays small
 * and diffable.
 */
export const ExplicitAreaRuleSchema = z.object({
    kind: z.literal('explicit-area'),
    ringRef: z.string().min(1),
});

/** The union. Discriminated on `kind` so the solver switch is exhaustive. */
export const GeometricRuleSchema = z.discriminatedUnion('kind', [
    SetbackRuleSchema,
    AlignmentRuleSchema,
    BlockDerivedAlignmentRuleSchema,
    ExplicitAreaRuleSchema,
]);

export type SetbackRule = z.infer<typeof SetbackRuleSchema>;
export type AlignmentRule = z.infer<typeof AlignmentRuleSchema>;
export type BlockDerivedAlignmentRule = z.infer<typeof BlockDerivedAlignmentRuleSchema>;
export type ExplicitAreaRule = z.infer<typeof ExplicitAreaRuleSchema>;
export type GeometricRule = z.infer<typeof GeometricRuleSchema>;

/**
 * Does this rule REQUIRE a block ring to solve? (ADR-0271)
 *
 * The engine uses this to fail loudly at the boundary — a `block-derived-alignment` zone solved
 * without a block is not a degraded answer, it is no answer, and the caller must show no envelope
 * rather than fall back to the ordinance floor (which would publish a depth the ordinance does
 * not sanction for that block).
 */
export function requiresBlockRing(rule: GeometricRule): boolean {
    return rule.kind === 'block-derived-alignment';
}

/**
 * BACK-COMPAT READER — the migration path for every rule pack shipped before ADR-0270.
 *
 * Existing packs carry a bare `{ front_m, side_m, rear_m }` with no `kind`. They are all,
 * implicitly and correctly, setback rules — that was the only thing the model could express —
 * so stamping `kind: 'setback'` is not a guess, it is the identity.
 *
 * Deliberately a READ-TIME transform, not a data migration: no shipped pack is rewritten, no
 * file changes, and a pack authored against either shape parses. The default is safe precisely
 * because it is today's only behaviour.
 */
export const GeometricRuleCompatSchema = z.preprocess((raw) => {
    if (raw && typeof raw === 'object' && !('kind' in (raw as Record<string, unknown>))) {
        const o = raw as Record<string, unknown>;
        // Only stamp when it actually looks like the legacy setback triple. Anything else is
        // left untouched so it fails validation loudly rather than being mislabelled a setback.
        if (
            typeof o.front_m === 'number' &&
            typeof o.side_m === 'number' &&
            typeof o.rear_m === 'number'
        ) {
            return { kind: 'setback', ...o };
        }
    }
    return raw;
}, GeometricRuleSchema);

/**
 * Narrowing helper for the persistence boundary (ADR-0270 option A, C58 §1.7 amendment).
 *
 * Only a `setback` rule has front/side/rear values that are TRUE of the zone. For every other
 * kind the answer is `null` — **never a fabricated triple**. Writing "equivalent effective
 * setbacks" for an alignment zone was explicitly rejected in ADR-0270: it is lossy by
 * construction, and invisible, because the stored numbers look perfectly well-formed.
 */
export function displaySetbacks(
    rule: GeometricRule,
): { front_m: number; side_m: number; rear_m: number } | null {
    return rule.kind === 'setback'
        ? { front_m: rule.front_m, side_m: rule.side_m, rear_m: rule.rear_m }
        : null;
}
