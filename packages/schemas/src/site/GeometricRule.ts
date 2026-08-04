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
 * §L-590b / ADR-0273 — **TIERED OCCUPATION**: the ordinance grants DIFFERENT HEIGHTS OVER
 * DIFFERENT PARTS OF THE SAME PARCEL, and the line that divides them is drawn on the BLOCK.
 *
 * PGM NNUU Art. 350.2 (Barcelona clau `22a`, *zona industrial mancada de Pla Parcial*):
 *
 *   • **350.2.b** — *"l’edificació **per damunt de la planta baixa** haurà de situar-se dins de la
 *     franja concèntrica a les alineacions de l’illa **de superfície igual al 70 per 100**
 *     d’aquesta"* — above the ground floor the mass must sit inside a band concentric with the
 *     BLOCK's alignments whose AREA EQUALS 70 % of the block.
 *   • **350.2.c** (closing sentence) — *"L’edificació a l’alçada reguladora fixada a l’anterior
 *     quadre només podrà alçar-se dins de la franja del 70 per 100 esmentat al precedent
 *     apartat b)."* The street-width height table applies ONLY inside that band.
 *   • **350.2.e** — *"Alçada de l’edificació a **l’interior de l’illa**: es fixa en **5 m**
 *     (corresponents a una única planta indivisible)"*. Outside the band the height is 5 m.
 *
 * ⇒ ONE building, TWO tiers with different heights, and they tile the parcel: the part of the
 * parcel inside the block band rises to the Art. 350.2.c height; the part in the block interior
 * is capped at one indivisible 5 m storey.
 *
 * ── WHY THIS IS A NEW `kind` AND NOT ANY OF THE FOUR ABOVE ───────────────────────────────────
 *
 *  • `setback` — erodes by a STATED distance from every edge. Art. 350 states no distances at
 *    all, and Art. 349 orders this zone *segons alineacions de vial* (façade ON the street line),
 *    so there is no honest front/side/rear triple to erode by (C58 §1.7a).
 *  • `alignment` — carries a SCALAR `buildableDepth_m`. Art. 350 states no depth; it states an
 *    AREA EQUALITY on the block from which a depth must be constructed. Exactly the gap ADR-0271
 *    opened `block-derived-alignment` for, one article over.
 *  • `block-derived-alignment` — the near-miss, and it is rejected on THREE independent grounds,
 *    any one of which is fatal:
 *      (a) it REQUIRES `minDepth_m` + `maxDepth_m`, both strictly positive. **Art. 350 states
 *          neither.** Supplying Art. 242's 11 m / 30 m would impose the Eixample article's clamps
 *          on industrial land under a citation to Art. 350 — the L-526 failure verbatim; any
 *          other pair would be synthesised (C58 §1.7a: never invent a value).
 *      (b) `interiorFreeRatio` is a **MINIMUM** (*"com a mínim el 30 per 100"*, Art. 242.2).
 *          Art. 350.2.b is an **EQUALITY** (*"de superfície igual al 70 per 100"*). A minimum
 *          admits a whole interval of lawful depths and needs ordinance clamps to pick one; an
 *          equality picks itself and MUST NOT be clamped. Same digits, different quantifier,
 *          different solver contract.
 *      (c) it produces ONE region and ONE height, so it would silently DROP the block-interior
 *          tier. On industrial fabric that tier is frequently most of the parcel.
 *  • `explicit-area` — the ordinance publishes no polygon for this zone; there is nothing to
 *    reference.
 *
 * ── WHAT IS DELIBERATELY *NOT* IN THIS SCHEMA ────────────────────────────────────────────────
 *
 * **No occupation figure.** Art. 350.2.a's *"ocupació màxima de la parcel·la … 90 per 100"* is
 * already `ZoningRule.maxCoverage`, resolved by the engine in C58 §1.2 priority order. Repeating
 * it here would give one legal quantity two homes that are free to disagree on a compliance
 * number. Per ADR-0272 §3.2 a coverage cap does **not** shape a polygon — it constrains HOW MUCH
 * ground is occupied, not WHERE — so it is a quantitative cap carried on the envelope, never a
 * boundary, and this rule never reads it.
 *
 * **No depth bounds.** See (a) above. The construction is unbounded because the article is.
 *
 * ⚠ Like `block-derived-alignment`, this kind is UNSOLVABLE without a block ring, and
 * `requiresBlockRing` says so statically (ADR-0270 reason 4).
 */
export const TieredOccupationRuleSchema = z
    .object({
        kind: z.literal('tiered-occupation'),
        ...alignmentCoreShape,

        /**
         * Art. 350.2.b — the band's area **as a share of the BLOCK**, stated as the article states
         * it (0.70 = *"superfície igual al 70 per 100 d’aquesta"*).
         *
         * ⚠ **AN EQUALITY, NOT A MINIMUM.** The solver must return the depth at which the band's
         * area EQUALS this share and must never clamp that depth against bounds from another
         * article. Contrast `BlockDerivedAlignmentRuleSchema.interiorFreeRatio`, which is
         * Art. 242.2's *minimum* free space and is deliberately the COMPLEMENTARY quantity as
         * well as the opposite quantifier — the two must not be transcribed into each other.
         *
         * Exclusive bounds: 0 admits no building above the ground floor at all and 1 imposes no
         * constraint. Either is a transcription error, not a zone.
         */
        bandAreaRatioOfBlock: z.number().gt(0).lt(1),

        /**
         * Art. 350.2.e — the height permitted on the part of the parcel lying in the BLOCK
         * INTERIOR, i.e. outside the band. Barcelona 22a ⇒ 5 m.
         *
         * ⚠ Measured *"des de la rasant del carrer a la part inferior de l’element d’estructura de
         * la coberta"* — from the street's finished grade, not from a flat datum (L-584, open
         * platform-wide). Recorded so this figure is never read as a height above an arbitrary
         * plane.
         */
        interiorTierHeight_m: z.number().positive(),

        /**
         * Art. 350.2.e — *"una única planta indivisible"*. Carried as an integer rather than
         * derived from `interiorTierHeight_m ÷ some storey module`, because the article states the
         * STOREY COUNT directly and a divided figure would be our arithmetic wearing its citation.
         */
        interiorTierFloors: z.number().int().positive(),
    })
    .refine(requireSideWhenSetback, SIDE_REQUIRED_MSG);

/**
 * §COR-MC-FOOTPRINT / ADR-0288 — **OCCUPATION-CAPPED ALIGNMENT**: alignment-governed fabric where
 * the ordinance states NO buildable depth AT ALL — not a scalar (`alignment`), not a
 * block-derived algorithm (`block-derived-alignment`), not a block-relative equality
 * (`tiered-occupation`) — and instead states that depth is *libre* (free), bounded only by a
 * PARCEL-level occupation ratio that already lives on `ZoningRule.maxCoverage`.
 *
 * PGOU de Córdoba (2001) Art. 13.5.2.4 (Manzana Cerrada, *fondo edificable*): *"Cuando este
 * parámetro no venga expresamente fijado, se entenderá **libre**, con la única condición de que
 * la ocupación del edificio en planta no podrá rebasar los límites … del apartado 5"* — when this
 * parameter [depth] is not expressly fixed, it is understood to be FREE, with the sole condition
 * that the building's ground-floor occupation may not exceed the limits of §5 (the ocupación
 * cap). See `packages/site-parcel-data/src/rulepacks/esCordobaPGOU2001.ts`, the D3 correction on
 * `CORDOBA_MC_FONDO_UNRESOLVED_RING`'s own header, for the full citation trail and the two
 * earlier (WRONG) framings of this gap that this kind finally closes.
 *
 * ── WHY THIS IS A NEW `kind` AND NOT ANY OF THE FOUR ABOVE ───────────────────────────────────
 *
 *  • `alignment` — REQUIRES a strictly positive `buildableDepth_m` (`z.number().positive()`).
 *    Art. 13.5.2.4 states no number; it states the OPPOSITE, that no number applies. Writing
 *    `buildableDepth_m: null` is not a legal value of this kind (the schema forbids it), and
 *    inventing a figure would publish a fabricated depth under a citation that says depth is free
 *    (C58 §1.7a).
 *  • `block-derived-alignment` / `tiered-occupation` — BOTH require a block ring
 *    (`requiresBlockRing`) AND both construct their depth from a BLOCK-level geometric condition
 *    (Art. 242.2's concentric band; Art. 350.2's area equality on the block). Art. 13.5.2.4 states
 *    no block-level condition whatsoever — MC's occupation cap is a plain ratio of the PARCEL, not
 *    a shape derived from the block — so reaching for either kind would require synthesising a
 *    block-level rule the ordinance never states.
 *  • `explicit-area` — needs a REAL PUBLISHED FOOTPRINT RING. Córdoba's PGOU does not publish MC
 *    footprints as geometry (Art. 13.5.2.4 is a NUMERIC occupation rule, not a drawn plan); there
 *    is nothing for `ringRef` to resolve to.
 *
 * ── WHAT THIS KIND DELIBERATELY DOES NOT CARRY ───────────────────────────────────────────────
 *
 * **No occupation ratio field.** `ZoningRule.maxCoverage` already holds it, and per
 * `TieredOccupationRuleSchema`'s own precedent (see its header) repeating a legal quantity in two
 * places gives it two homes free to disagree on a compliance number. The engine branch for this
 * kind reads the ZONE's resolved `maxCoverage`, exactly as the `tiered-occupation` branch reads it
 * to bind `maxVolumeM3` (ADR-0272 §3.2) — the only difference is WHERE that cap is consumed (here,
 * to shape the ring itself; there, only the volume).
 *
 * **No depth bounds.** There are none to carry — Art. 13.5.2.4 states none.
 *
 * ── ⚠⚠⚠ THE PART THAT IS NOT A LEGAL FACT — READ BEFORE WIRING ANY PACK TO THIS KIND ⚠⚠⚠ ──────
 *
 * An occupation ratio with NO stated siting rule does **not**, by itself, determine a unique
 * footprint polygon. Infinitely many shapes of the right AREA satisfy "≤ ocupación % of the
 * parcel" — a thin L along one edge, a square in a corner, a strip the full parcel width. Art.
 * 13.5.2.4 is silent on WHICH of these Córdoba means (unlike Barcelona PGM Art. 350.2, which
 * states a genuine siting convention — "a band concentric with the block alignments" —
 * `TieredOccupationRuleSchema` exists because THAT convention is a stated fact to encode).
 *
 * So the engine's solve for THIS kind (`ZoningRulesEngine.ts`, the `occupation-capped-alignment`
 * branch) does not extract a shape from the ordinance — **it draws one, and says so.** The
 * documented, loudly-labelled ENGINEERING DECISION is: extend the front-aligned, party-walled
 * inset straight back — at whatever width the alignment and side treatment already give it — until
 * either (a) it consumes exactly `maxCoverage × parcelArea`, or (b) it reaches the parcel's own
 * rear boundary, whichever comes first. That is the MAXIMAL legally-consistent envelope: since
 * front alignment + party-wall sides + unconstrained depth means the building COULD legally fill
 * the whole parcel behind the alignment (subject only to the area cap), the rectangle-at-frontage-
 * width construction is the most useful, least-arbitrary massing a feasibility tool can draw —
 * but it is PRYZM's modelling choice, not the ordinance's stated shape, and every consumer of this
 * kind's output MUST cite it as exactly that (see the engine branch's caveat text and the
 * `occupationCappedDepth.ts` geometry module header). A pack MUST NOT wire a zone to this kind
 * believing the resulting ring is "the ordinance's footprint" — it is "PRYZM's best-defensible
 * footprint under an ordinance that states an area cap and no siting rule".
 */
export const OccupationCappedAlignmentRuleSchema = z
    .object({
        kind: z.literal('occupation-capped-alignment'),
        ...alignmentCoreShape,
    })
    .refine(requireSideWhenSetback, SIDE_REQUIRED_MSG);

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
    TieredOccupationRuleSchema,
    ExplicitAreaRuleSchema,
    OccupationCappedAlignmentRuleSchema,
]);

export type SetbackRule = z.infer<typeof SetbackRuleSchema>;
export type AlignmentRule = z.infer<typeof AlignmentRuleSchema>;
export type BlockDerivedAlignmentRule = z.infer<typeof BlockDerivedAlignmentRuleSchema>;
export type TieredOccupationRule = z.infer<typeof TieredOccupationRuleSchema>;
export type ExplicitAreaRule = z.infer<typeof ExplicitAreaRuleSchema>;
export type OccupationCappedAlignmentRule = z.infer<typeof OccupationCappedAlignmentRuleSchema>;
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
    // §L-590b — `tiered-occupation` joins it: Art. 350.2.b's band is defined on the BLOCK, so a
    // parcel-only solve has nothing to construct the tier boundary from. Same argument, same
    // static guarantee — routing either kind through the parcel-only path is a compile error, not
    // a runtime `undefined` on a compliance number.
    return rule.kind === 'block-derived-alignment' || rule.kind === 'tiered-occupation';
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
