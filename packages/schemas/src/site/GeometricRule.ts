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
import { HeightDatumSchema, HEIGHT_DATUM_KIND_REGISTRY } from './HeightDatum.js'; // ADR-0377 — the datum seat (§S1-IMPORT-DEFERRED, closed by the S1 finish)

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
const requireSideWhenSetback = <
    // `| undefined` is REQUIRED under `exactOptionalPropertyTypes` (several downstream
    // tsconfigs enable it even though this package's own does not): the inferred Zod object
    // types carry `side_m?: number | undefined`, which is NOT assignable to a bare
    // `side_m?: number` constraint in that mode. Type-level only — no runtime, no shape change.
    T extends { sideTreatment: string; side_m?: number | undefined },
>(
    r: T,
) => r.sideTreatment !== 'setback' || typeof r.side_m === 'number';

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

/**
 * ADR-0378 / §S1-HPO — **HEIGHT-PROPORTIONAL OFFSET**: the ordinance states a FORMULA over the
 * building's own height — offset = factor × H, floored at a stated minimum — not a distance.
 *
 *   • DE BauO NRW 2018 §6 Abstandsflächen: 0,4·H, min 3 m, on the plot boundaries.
 *   • PT Porto PDM Art. 30.º n.º 1 d): afastamento ≥ H/2, min 3 m, above the ground floor.
 *   • ES Madrid PGOUM-97 NZ5: front separation to the STREET AXIS proportional to height.
 *
 * ── WHY THIS IS A NEW `kind` AND NOT `setback` ───────────────────────────────────────────────
 * `setback` carries STATED distances. A factor-of-H rule has no honest triple until H is
 * resolved — transcribing `0,4·H` as a number bakes ONE H into the pack and is wrong on every
 * parcel where H differs (ADR-0271's "a scalar cannot encode a function", one rung up the same
 * ladder). And writing the FLOOR (3 m) as the setback OVERSTATES the envelope everywhere
 * factor × H exceeds it — the one forbidden direction (C58 §1.4).
 *
 * ── EVALUATION ORDER IS POST-HEIGHT-RESOLUTION, BY TYPE ──────────────────────────────────────
 * The evaluator (`site-parcel-data/rulepacks/declarative/evaluateHeightProportionalOffset.ts`)
 * consumes the declarative pipeline's `EnvelopeSolidHeightCapVerdict` — a type that exists only
 * AFTER height resolution — so the documented order cannot be skipped, and an unresolved H
 * REFUSES rather than degrading to the floor (ADR-0378). At a resolved H the DE inclined-plane
 * reading collapses to the closed-form pointwise offset `max(factor·H, min)`.
 *
 * `heightDatum` is REQUIRED (seat 1 wired into seat 2) and can never be an absolute national
 * altitude (refined below via the datum registry's `comparableToRelativeHeight`).
 */
export const HeightProportionalOffsetRuleSchema = z
    .object({
        kind: z.literal('height-proportional-offset'),

        /**
         * The multiplier on H (DE §6 ⇒ 0.4; Porto ⇒ 0.5). Strictly positive: a zero factor
         * degenerates the rule to a bare minimum — that rule is a `setback`, not this kind,
         * and accepting it here would let a transcription error impersonate a formula.
         */
        heightFactor: z.number().positive(),

        /** The stated floor (both driving citations ⇒ 3 m). Never negative. */
        minOffset_m: z.number().nonnegative(),

        /**
         * Which way the offset erodes. The only corpus-cited member is `into-parcel` (all
         * three driving citations erode buildable ground). Append-only: a new direction
         * arrives with the ordinance that states it (the factVocabulary discipline).
         */
        direction: z.enum(['into-parcel']),

        /**
         * Which boundaries the formula binds. DE §6 ⇒ `all-plot-boundaries`; Madrid NZ5 ⇒
         * `front`. Append-only: `side` / `rear` members arrive with a pack that consumes them.
         */
        appliesTo: z.enum(['front', 'all-plot-boundaries']),

        /**
         * The line the offset is measured FROM. `plot-boundary` (DE/PT) or `street-axis`
         * (Madrid NZ5 — the axis of the fronting street, not the parcel edge). Refined below:
         * a street axis exists only at the front.
         */
        measuredFrom: z.enum(['plot-boundary', 'street-axis']),

        /**
         * Porto Art. 30.º n.º 1 d) binds the afastamento ABOVE the ground floor only; DE §6
         * binds every storey. Carried as data so the evaluator's output says which storeys
         * the resolved offset governs.
         */
        appliesToStoreys: z.enum(['all', 'above-ground-floor']),

        /**
         * ADR-0377 — WHICH H the factor multiplies (seat 1 wired into seat 2). REQUIRED: a
         * factor with no H reference is not a rule. `{ kind: 'unknown' }` is legal and honest
         * (DE §6's H-measurement semantics are PENDING their primary read) — the evaluator
         * refuses it rather than assuming a plane.
         */
        heightDatum: HeightDatumSchema,
    })
    .superRefine((r, ctx) => {
        if (r.measuredFrom === 'street-axis' && r.appliesTo !== 'front') {
            ctx.addIssue({
                code: 'custom',
                message:
                    "measuredFrom 'street-axis' requires appliesTo 'front' — no street axis " +
                    'exists at a side or rear plot boundary (Madrid NZ5 measures the FRONT ' +
                    'separation to the axis of the fronting street). ADR-0378.',
                path: ['measuredFrom'],
            });
        }
        if (
            r.heightDatum.kind !== 'unknown' &&
            !HEIGHT_DATUM_KIND_REGISTRY[r.heightDatum.kind].comparableToRelativeHeight
        ) {
            ctx.addIssue({
                code: 'custom',
                message:
                    `heightDatum '${r.heightDatum.kind}' is an absolute altitude reference, ` +
                    'not a relative building height — factor × altitude is not a quantity any ' +
                    'of the driving ordinances state (the E8 DE «72,2 m über NHN» class stays ' +
                    'flagged, never multiplied). ADR-0377/0378.',
                path: ['heightDatum'],
            });
        }
    });

/**
 * ADR-0379 / §S1-CTXAGG — **CONTEXT AGGREGATE** (the `fabricDerivedHeight` seat Porto's gate
 * blocker 4 named): the governing value is a STATISTIC over the existing built context, not a
 * number printed in the ordinance.
 *
 *   • PT Porto PDM Art. 3.º o) *moda da cércea* — "the cércea with the greatest extent along
 *     the built urban frontage" (*frente urbana*, Art. 3.º l) — governing FUC tipo I heights
 *     (Art. 24.º n.º 1 e)) and overriding the 21 m cap in tipo II (Art. 27.º n.º 2 b)).
 *   • FR Paris `plub_filet` code M — "same as the existing façade" (the same family).
 *
 * ── WHY THIS IS A NEW `kind` ─────────────────────────────────────────────────────────────────
 * Every prior kind is a function of THIS parcel (and at most its block ring). This value is a
 * function of the NEIGHBOURING FABRIC — a declared context set that must be measured before
 * the rule resolves at all. No stated scalar exists to transcribe: publishing the 21 m cap
 * where the moda governs would over- or understate parcel by parcel (`ptPortoPdmDraft.ts`
 * blocker 4, `PT_PORTO_ENVELOPE_VERIFIED`).
 *
 * The schema declares WHAT to aggregate; it carries no geometry and no members. Set
 * construction (frontage extraction) is adapter/kernel work; evaluation — extent-weighted
 * statistics plus the honest refusals (unavailable ≠ empty ≠ tie) — lives in
 * `site-parcel-data/rulepacks/declarative/evaluateContextAggregate.ts`.
 *
 * Every axis is a CLOSED enum minted from a citation (the factVocabulary discipline: a member
 * nothing consumes is not declared). Append-only; a new member arrives with its ADR.
 */
export const ContextAggregateRuleSchema = z
    .object({
        kind: z.literal('context-aggregate'),

        /**
         * The statistic. `mode` = the value with the greatest summed frontage EXTENT (*"com
         * maior extensão"* — extent, not member count); `median` = extent-weighted median
         * (robust-peer discipline — never MIN); `max` = the largest member (the "unless the
         * existing cércea is higher" comparison class, Art. 27.º n.º 2 b)).
         */
        aggregate: z.enum(['mode', 'median', 'max']),

        /**
         * The declared context set. `urban-frontage` = Porto's *frente urbana* (Art. 3.º l):
         * the built front along the same side of the street. The set DEFINITION is legal
         * text; its extraction is machinery (lane A row 1) and is injected at evaluation.
         */
        contextSet: z.enum(['urban-frontage']),

        /**
         * The aggregated attribute. `cornice-height` = the *cércea* (Art. 3.º g): façade
         * height from mean ground at the façade alignment to the eave/parapet.
         */
        attribute: z.enum(['cornice-height']),

        /**
         * ADR-0377 — the plane the aggregated members' heights are measured from (Porto ⇒
         * `mean-ground-at-facade`, Art. 3.º g). REQUIRED: a statistic over heights measured
         * from mixed or unstated planes is not one quantity.
         */
        heightDatum: HeightDatumSchema,
    })
    .superRefine((r, ctx) => {
        if (
            r.heightDatum.kind !== 'unknown' &&
            !HEIGHT_DATUM_KIND_REGISTRY[r.heightDatum.kind].comparableToRelativeHeight
        ) {
            ctx.addIssue({
                code: 'custom',
                message:
                    `heightDatum '${r.heightDatum.kind}' cannot host the cornice-height-class — ` +
                    'an aggregated cércea is relative by definition (measured up from ground ' +
                    'at the façade, Art. 3.º g); an absolute national altitude is not a member ' +
                    'of that population. ADR-0377/0379.',
                path: ['heightDatum'],
            });
        }
    });

/** The union. Discriminated on `kind` so the solver switch is exhaustive. */
export const GeometricRuleSchema = z.discriminatedUnion('kind', [
    SetbackRuleSchema,
    AlignmentRuleSchema,
    BlockDerivedAlignmentRuleSchema,
    TieredOccupationRuleSchema,
    ExplicitAreaRuleSchema,
    OccupationCappedAlignmentRuleSchema,
    HeightProportionalOffsetRuleSchema,
    ContextAggregateRuleSchema,
]);

export type SetbackRule = z.infer<typeof SetbackRuleSchema>;
export type AlignmentRule = z.infer<typeof AlignmentRuleSchema>;
export type BlockDerivedAlignmentRule = z.infer<typeof BlockDerivedAlignmentRuleSchema>;
export type TieredOccupationRule = z.infer<typeof TieredOccupationRuleSchema>;
export type ExplicitAreaRule = z.infer<typeof ExplicitAreaRuleSchema>;
export type OccupationCappedAlignmentRule = z.infer<typeof OccupationCappedAlignmentRuleSchema>;
export type HeightProportionalOffsetRule = z.infer<typeof HeightProportionalOffsetRuleSchema>;
export type ContextAggregateRule = z.infer<typeof ContextAggregateRuleSchema>;
export type GeometricRule = z.infer<typeof GeometricRuleSchema>;

/** The closed kind vocabulary — derived from the union, never hand-listed (C84 EI-9). */
export type GeometricRuleKind = GeometricRule['kind'];

/** Per-kind metadata the registry closure carries (compile-enforced, see below). */
export interface GeometricRuleKindMeta {
    /** What the kind IS — precise enough that two packs cannot disagree. */
    readonly meaning: string;
    /** The corpus citation that minted the kind. */
    readonly citation: string;
    /**
     * WHERE the kind resolves. `zoning-rules-engine` = the C58 §2.4 geometric solve
     * (`ZoningRulesEngine.computeBuildableEnvelope`). `declarative-evaluator` = the E1bc
     * declarative seat: a typed evaluator under `rulepacks/declarative/` resolves it (or
     * refuses), and the engine's geometric path must NOT attempt it.
     */
    readonly solveSeat: 'zoning-rules-engine' | 'declarative-evaluator';
    /**
     * `true` when the kind SHAPES THE FOOTPRINT RING itself (alignment bands, published
     * polygons, block-derived constructions) — the engine's §NEVER-OVERSTATE unknown-setback
     * hatching predicate reads THIS flag instead of a hand-copied kind list, so the predicate
     * and the schema can never disagree. `setback` is `false` on purpose: it IS the plain
     * inset path that predicate guards. The two declarative-seat kinds are `false`: they are
     * height/offset constructions — a zone carrying one still flags unknown setbacks as a
     * study upper bound.
     */
    readonly footprintShaping: boolean;
    /**
     * `true` when the kind is UNSOLVABLE without a block ring (ADR-0271 / §L-590b).
     * `requiresBlockRing()` reads this row — one fact, one home.
     */
    readonly requiresBlockRing: boolean;
}

/**
 * THE COMPILE-ENFORCED KIND REGISTRY. `Record<GeometricRuleKind, …>` means adding a union
 * member without a row here — or removing a row — is a tsc error naming this file (the
 * ADR-0270 reason-4 guarantee applied to the kind census: an unregistered kind cannot exist).
 * `HEIGHT_DATUM_KIND_REGISTRY` is the same idiom one seat over.
 */
export const GEOMETRIC_RULE_KIND_REGISTRY: Readonly<
    Record<GeometricRuleKind, GeometricRuleKindMeta>
> = Object.freeze({
    setback: {
        meaning: 'Stated front/side/rear distances eroded inward from every classified edge.',
        citation: "ADR-0270 / C58 §2.2 (Seixal UH2, the founder's Portuguese reference).",
        solveSeat: 'zoning-rules-engine',
        footprintShaping: false,
        requiresBlockRing: false,
    },
    alignment: {
        meaning:
            'Façade ON a stated line; a band of stated buildable depth projected from it ' +
            '(inset + half-plane clip).',
        citation: 'ADR-0270 (Madrid alineación + profundidad edificable, L-438).',
        solveSeat: 'zoning-rules-engine',
        footprintShaping: true,
        requiresBlockRing: false,
    },
    'block-derived-alignment': {
        meaning:
            'Alignment-governed with the depth CONSTRUCTED from the block (equidistant ' +
            'figure, minimum interior free share, ordinance clamps).',
        citation: 'ADR-0271 (PGM NNUU Art. 242.2, Barcelona Eixample).',
        solveSeat: 'zoning-rules-engine',
        footprintShaping: true,
        requiresBlockRing: true,
    },
    'tiered-occupation': {
        meaning:
            'Two height tiers tiling the parcel, divided by a band drawn on the BLOCK as an ' +
            'area EQUALITY (never clamped).',
        citation: '§L-590b / ADR-0273 (PGM NNUU Art. 350.2, clau 22a).',
        solveSeat: 'zoning-rules-engine',
        footprintShaping: true,
        requiresBlockRing: true,
    },
    'explicit-area': {
        meaning:
            'The buildable area is PUBLISHED as geometry; `ringRef` resolves it from the ' +
            'curated pack.',
        citation: 'ADR-0270 (Madrid `Fondo de la Edificación` polyline, L-438).',
        solveSeat: 'zoning-rules-engine',
        footprintShaping: true,
        requiresBlockRing: false,
    },
    'occupation-capped-alignment': {
        meaning:
            "Alignment-governed, depth expressly FREE, bounded only by the zone's occupation " +
            "cap — the ring drawn is PRYZM's labelled engineering choice, not the ordinance's " +
            'stated shape.',
        citation: '§COR-MC-FOOTPRINT / ADR-0288 (PGOU Córdoba 2001 Art. 13.5.2.4).',
        solveSeat: 'zoning-rules-engine',
        footprintShaping: true,
        requiresBlockRing: false,
    },
    'height-proportional-offset': {
        meaning:
            "Offset = factor × H floored at a stated minimum — a FORMULA over the building's " +
            'own resolved height, evaluated post-height-resolution; refuses when H or its ' +
            'datum is unresolved.',
        citation:
            'ADR-0378 (DE BauO NRW §6 0,4·H min 3 m; Porto PDM Art. 30.º n.º 1 d) H/2 min ' +
            '3 m; Madrid NZ5 front-to-axis).',
        solveSeat: 'declarative-evaluator',
        footprintShaping: false,
        requiresBlockRing: false,
    },
    'context-aggregate': {
        meaning:
            'The value is a STATISTIC (extent-weighted mode / median / max) over a declared ' +
            'context-fabric set; refuses when the set is unavailable, empty, or tied.',
        citation:
            'ADR-0379 (Porto PDM Art. 3.º o) moda da cércea via Art. 24.º/27.º; Paris ' +
            'plub_filet code M).',
        solveSeat: 'declarative-evaluator',
        footprintShaping: false,
        requiresBlockRing: false,
    },
});


/**
 * Does this rule REQUIRE a block ring to solve? (ADR-0271)
 *
 * The engine uses this to fail loudly at the boundary — a `block-derived-alignment` zone solved
 * without a block is not a degraded answer, it is no answer, and the caller must show no envelope
 * rather than fall back to the ordinance floor (which would publish a depth the ordinance does
 * not sanction for that block).
 */
export function requiresBlockRing(rule: GeometricRule): boolean {
    // §L-590b — `tiered-occupation` joined `block-derived-alignment`: Art. 350.2.b's band is
    // defined on the BLOCK, so a parcel-only solve has nothing to construct the tier boundary
    // from. ADR-0377/0378/0379 change-set: the answer now lives on the compile-enforced kind
    // registry (one fact, one home — C84 EI-9); behaviour is byte-identical for every kind that
    // existed before the registry did, and the two declarative-seat kinds are `false`.
    return GEOMETRIC_RULE_KIND_REGISTRY[rule.kind].requiresBlockRing;
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
