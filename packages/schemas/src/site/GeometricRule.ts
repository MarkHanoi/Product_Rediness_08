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
export const AlignmentRuleSchema = z
    .object({
        kind: z.literal('alignment'),

        /**
         * Which line the façade must sit on. `street` = the parcel edge classified `front`;
         * `official-line` = a separately-published alineación that may not coincide with the
         * cadastral edge (Madrid publishes these as their own layer).
         */
        alignTo: z.enum(['street', 'official-line']),

        /**
         * *Profundidad edificable* — max buildable depth measured perpendicular from the
         * aligned edge. Strictly positive: a zero-depth alignment zone is not a rule, it is a
         * transcription error, and accepting it would produce an empty envelope that reads as
         * "nothing may be built here" rather than "this pack is wrong".
         */
        buildableDepth_m: z.number().positive(),

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
    })
    .refine(
        (r) => r.sideTreatment !== 'setback' || typeof r.side_m === 'number',
        {
            // Without this, `sideTreatment: 'setback'` with no `side_m` would silently solve as
            // a party wall — i.e. build to the boundary — which is the opposite of what the
            // pack author wrote. Fail the pack loudly instead.
            message:
                "side_m is REQUIRED when sideTreatment is 'setback' — otherwise the zone would " +
                'silently solve as a party wall (build to the boundary), the opposite of intent.',
            path: ['side_m'],
        },
    );

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
    ExplicitAreaRuleSchema,
]);

export type SetbackRule = z.infer<typeof SetbackRuleSchema>;
export type AlignmentRule = z.infer<typeof AlignmentRuleSchema>;
export type ExplicitAreaRule = z.infer<typeof ExplicitAreaRuleSchema>;
export type GeometricRule = z.infer<typeof GeometricRuleSchema>;

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
