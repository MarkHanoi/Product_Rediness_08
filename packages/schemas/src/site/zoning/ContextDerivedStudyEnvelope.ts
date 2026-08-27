// §CONTEXT-DERIVED-STUDY-ENVELOPE (§ENVAMS148, 2026-08-27) — a MASSING STUDY built from real
// neighbouring-building heights, offered ONLY where no normative buildable envelope resolves at
// all (an honest `no-plan`/`no-rule-pack`-class refusal). C63's ratified position is that such a
// refusal IS the correct answer (denominator = BUILDABLE land, and "no envelope" is a stated fact,
// not a gap to paper over) — this schema does not change that. It gives the refusal card a SECOND,
// clearly-separate thing to say alongside the refusal: "here is what real neighbours are built to,
// if you want a starting point for a study massing."
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// WHY THIS IS ITS OWN SCHEMA, NOT A FIELD ON `BuildableEnvelope`
// ══════════════════════════════════════════════════════════════════════════════════════════════
// `BuildableEnvelopeSchema`'s `status` / `confidence` vocabularies (`EnvelopeStatusSchema`,
// `EnvelopeConfidenceSchema`) are CI-gated, contract-bound (C58 §1.2/§1.11) closed enums with
// consumers that key decisions off them directly — the generator's C58 §1.8 bounds, the L-449
// certification totality scan, the compliance report, the Cesium massing renderer. Adding a
// seventh confidence tier or a fifth status member for "a study we derived from context, not the
// ordinance" would let a consumer that only understands the existing six/four values silently
// mis-read it — exactly the category error C58 §1.4 exists to prevent, and precisely the risk
// `EnvelopeConfidenceSchema`'s own docstring calls out for `not-determined` ("this is NOT a weaker
// estimated-ruleset"). A context-derived study is not a weaker `estimated-ruleset` either — it is
// not an ordinance number at ANY tier, so it has no seat on that ladder at all.
//
// This is therefore a STANDALONE, ADDITIVE artefact with its OWN one-member status literal
// (`'context-derived-study'`), so it is structurally impossible for it to be misread as any
// `EnvelopeStatus` / `EnvelopeConfidence` member, and it carries no `ordinanceRef` (there is no
// ordinance behind it — see `heightBasis` for what IS behind it).
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// THE HONESTY RULES THIS SCHEMA ENFORCES
// ══════════════════════════════════════════════════════════════════════════════════════════════
//   1. `disclaimer` is MANDATORY, non-empty, and every producer must state — on the object itself,
//      not only in a caller's UI copy — that this is indicative only and not a compliance
//      determination (§CONTEXT-DATA-HONESTY: the badge is part of the data, not decoration bolted
//      on afterwards where a second renderer could forget it).
//   2. `heightBasis` is MANDATORY and states the METHOD, the SOURCE, the SAMPLE SIZE (excluding
//      fabricated placeholder heights — see `excludedAssumedCount`), the RADIUS and the DATE. A
//      derived number with no stated basis is exactly the un-sourced-number failure C58 §1.6
//      forbids applied to a study rather than an ordinance.
//   3. `heightBasis.sampledCount` is refined to be `>= 1` and callers MUST refuse (never construct
//      this object at all) when the real (non-fabricated) neighbour sample is too small to be a
//      meaningful aggregate — see `@pryzm/site-parcel-data`'s `buildContextDerivedStudyEnvelope`,
//      which returns a typed refusal rather than parsing a schema instance from two buildings
//      averaged into a false confidence (memory: corpus-never-jittered-min-over-peers).
//   4. There is no `ordinanceRef` field anywhere on this object, deliberately — inventing one would
//      dress a study in the citation vocabulary a real determination earns.
//
// Strategic context — C58 §1.2/§1.4/§1.6/§1.11, C63 §1.6 (a refusal is a correct answer), ADR-0283
// (evidence-bounded publication — this schema is evidence-bounded to CONTEXT, not to an ordinance).

import { z } from 'zod';
import { PtSchema } from '../types.js';

/** The one status literal this artefact ever carries. Never a member of `EnvelopeStatusSchema`. */
export const CONTEXT_DERIVED_STUDY_STATUS = 'context-derived-study' as const;

/**
 * How a sampled neighbour's height was itself arrived at — mirrors
 * `apps/editor/src/ui/geospatial/contextBuildings.ts`'s `ContextHeightProvenance` (L-459),
 * re-declared here because L0 may not import an L7 app module. The two are four-member unions with
 * the identical literal values by construction; a future rung added to one must be added to the
 * other by hand (there is no shared import to enforce it across the layer boundary).
 *
 * ⚠ `'assumed'` (the fabricated 9 m placeholder default) is a SENTINEL, not a real height — a
 * study built from this schema's `heightBasis` must never have counted an `'assumed'` sample into
 * its median (see `excludedAssumedCount`).
 *
 * ⚠ This union is about a NEIGHBOUR's height (one input to a median). It is NOT the study's own
 * top-level basis — see `ContextStudyHeightBasisSchema.method` below for the sibling closed union
 * that distinguishes a MEDIAN-OF-NEIGHBOURS study from a USER-SUPPLIED one (§MANUALENV159). A
 * `'user-supplied'` study has no neighbours at all, so it has no seat in THIS union.
 */
export const ContextStudyHeightProvenanceSchema = z.enum([
    'measured-lidar',
    'tagged',
    'derived-levels',
    'assumed',
]);
export type ContextStudyHeightProvenance = z.infer<typeof ContextStudyHeightProvenanceSchema>;

/**
 * The MEDIAN-OF-NEIGHBOURS arm (§ENVAMS148/SIG-NL2) — evidence: real neighbouring-building
 * heights. Unchanged since this schema's introduction; only lifted out of the (formerly
 * one-member) `heightBasis` object into a named, discriminated branch (§MANUALENV159) so a second,
 * differently-shaped arm could be added without inventing fake `sampledCount`/`radius_m` values
 * for evidence that was never sampled.
 */
export const MedianNeighbourHeightBasisSchema = z.object({
    method: z.literal('median-neighbour-height'),
    /** e.g. "OpenStreetMap context buildings (measured/derived heights only)". Never blank. */
    sourceLabel: z.string().min(1),
    /** How many REAL (non-`assumed`) neighbour heights were folded into the median. */
    sampledCount: z.number().int().min(1),
    /** How many nearby buildings were EXCLUDED because their only height was the fabricated
     *  placeholder default — named so the reader can see the exclusion happened, not just trust it
     *  did (memory: corpus-never-jittered-min-over-peers — a sentinel is not an unknown, and must
     *  never be silently folded into an aggregate as if it were a zero or a real sample). */
    excludedAssumedCount: z.number().int().min(0),
    /** Search radius (m) around the parcel's query point. */
    radius_m: z.number().positive(),
    medianHeight_m: z.number().min(0),
    minHeight_m: z.number().min(0),
    maxHeight_m: z.number().min(0),
    /** When the sample was drawn — an indicative study is only ever as fresh as its last read. */
    sampledAtIso: z.string().datetime(),
});
export type MedianNeighbourHeightBasis = z.infer<typeof MedianNeighbourHeightBasisSchema>;

/**
 * The USER-SUPPLIED arm (§MANUALENV159, L-12640) — the founder's own request: *"if you dont know
 * add this: 24.5 meters on this parcel."* Evidence: a height the USER TYPED, not measured, not
 * derived from neighbours, not read from any source PRYZM consulted.
 *
 * §CONTEXT-DATA-HONESTY: this MUST be its own `method` literal, never a `'median-neighbour-height'`
 * basis with a fabricated one-item sample — a typed number and a measured median are different
 * KINDS of evidence, and the schema keeps them structurally distinct rather than trusting a
 * renderer's prose to keep them apart (the same reasoning `excludedAssumedCount` applies to a
 * sentinel folded into an aggregate, one level up: applied here to the PROVENANCE itself).
 */
export const UserSuppliedHeightBasisSchema = z.object({
    method: z.literal('user-supplied'),
    /** Always names the user as the source, e.g. "Height supplied by you" — never worded like a
     *  measurement or a derivation. Never blank. */
    sourceLabel: z.string().min(1),
    /** The exact metres the user typed — no rounding, no clamping beyond the caller's own bounds
     *  check (see `@pryzm/site-parcel-data`'s `buildUserSuppliedStudyEnvelope`). */
    suppliedHeight_m: z.number().min(0),
    /** When it was typed/saved — mirrors `sampledAtIso`'s naming so both arms carry a date under
     *  the same field name, even though nothing was "sampled" on this arm. */
    sampledAtIso: z.string().datetime(),
});
export type UserSuppliedHeightBasis = z.infer<typeof UserSuppliedHeightBasisSchema>;

/**
 * The evidence a context-derived study height rests on — discriminated on `method` so a consumer
 * switch is exhaustive and a median-only reader cannot silently mis-read a user-supplied basis (or
 * vice versa). Every field on either arm is something a reader could independently re-check — that
 * is the whole point of a "basis" object (C58 §1.6 applied to a study rather than an ordinance).
 */
export const ContextStudyHeightBasisSchema = z.discriminatedUnion('method', [
    MedianNeighbourHeightBasisSchema,
    UserSuppliedHeightBasisSchema,
]);
export type ContextStudyHeightBasis = z.infer<typeof ContextStudyHeightBasisSchema>;

/**
 * A context-derived MASSING STUDY — footprint defaults to the parcel ring (optionally inset by a
 * user-editable `setback_m`, default 0 — §CONTEXT-DERIVED-STUDY-ENVELOPE: "the setbacks are mostly
 * the same" is NOT a licence for PRYZM to invent one; the honest default is the parcel ring itself,
 * per the Dutch bouwvlak-as-rule model this exists alongside), height from real neighbour evidence.
 *
 * Never persisted as part of a `BuildableDeterminationRecord` — it carries no dated-snapshot
 * semantics because it makes no determination; a consumer recomputes it on demand.
 */
export const ContextDerivedStudyEnvelopeSchema = z.object({
    status: z.literal(CONTEXT_DERIVED_STUDY_STATUS),
    /** Scene-XZ metres — same frame as `BuildableEnvelope.insetPolygon` (C19/C58 DEVIATION note). */
    footprintPolygon: z.array(PtSchema).min(3),
    footprintAreaM2: z.number().min(0),
    /** User-editable inward offset from the parcel ring. Default 0 = the parcel ring itself. */
    setback_m: z.number().min(0).default(0),
    /** Mirrors the evidence's own number — `heightBasis.medianHeight_m` on the median arm,
     *  `heightBasis.suppliedHeight_m` on the user-supplied arm (§MANUALENV159) — so a consumer
     *  that reads only the top-level scalar (as every `BuildableEnvelope` reader does for
     *  `maxHeight_m`) still gets the number regardless of which arm produced it. But see the
     *  module header: this is NEVER read by anything that reads `BuildableEnvelope`. */
    maxHeight_m: z.number().min(0),
    heightBasis: ContextStudyHeightBasisSchema,
    /** MANDATORY, non-empty. Must state: indicative only, not a compliance determination, and
     *  (per whichever arm produced it) derived from real neighbour heights or supplied by the
     *  user — never worded as the applicable ordinance. */
    disclaimer: z.string().min(1),
}).superRefine((e, ctx) => {
    if (e.heightBasis.method === 'median-neighbour-height') {
        const b = e.heightBasis;
        if (!(b.minHeight_m <= b.medianHeight_m && b.medianHeight_m <= b.maxHeight_m)) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ['heightBasis', 'medianHeight_m'],
                message: 'medianHeight_m must lie between minHeight_m and maxHeight_m.',
            });
        }
        if (e.maxHeight_m !== b.medianHeight_m) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ['maxHeight_m'],
                message: '`maxHeight_m` must mirror `heightBasis.medianHeight_m` exactly — a '
                    + 'study height must not drift from the evidence it cites.',
            });
        }
    } else {
        const b = e.heightBasis;
        if (e.maxHeight_m !== b.suppliedHeight_m) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ['maxHeight_m'],
                message: '`maxHeight_m` must mirror `heightBasis.suppliedHeight_m` exactly — a '
                    + 'study height must not drift from what you typed.',
            });
        }
    }
});
export type ContextDerivedStudyEnvelope = z.infer<typeof ContextDerivedStudyEnvelopeSchema>;
