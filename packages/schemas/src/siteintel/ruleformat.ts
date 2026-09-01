// ⭐ §RULEFORMAT-RATIFIED (2026-09-01, Wave E4 close) — FROZEN per verdict §H.
// The ratification condition ("ratified ONLY at Barcelona es-08019 golden
// parity", §DRAFT-RULEFORMAT / gate decision §G item 1a) was MET and
// independently re-verified: declarativeGoldenParity 11/11 with FULL byte
// parity (JSON.stringify equality, key order included) against the live TS
// pack, adversarially re-falsified by the E4 verifier on a different value
// than the lane's own control. DeclarativeRule*/RASE/PackDocument shapes are
// henceforth CONTRACT — changes require a superseding ADR, exactly like the
// E1a envelope this file composes (SiteIntelRuleSchema/RuleProvenanceSchema,
// frozen since the R-batch). Layer precedence rides R1 `rank`, resolved in
// the evaluator — never `inheritsFromZoneCode` (§G item 1b).
//
// E1b (EUROPE-IMPLEMENTATION-PLAN §E1b · REPORT §L · DECISION-SUMMARY 3/5/8) —
// the DECLARATIVE RULE ENVELOPE: the thin data format rule-pack CONTENT migrates
// into. REPORT §L's composite, made parseable:
//
//   - rule envelope (parameter/value/unit/source/derivation/confidence/validity)
//     → `SiteIntelRuleSchema` (E1a — composed here, NEVER re-declared);
//   - scalar/conditional rule bodies → JSON Logic, carried as `JsonValue`
//     (E1a `json.ts`); the typed deterministic evaluator lives at L2
//     (`@pryzm/site-parcel-data` rulepacks/declarative — an EXPRESSION format is
//     "never sufficient alone", REPORT §L, so semantics live beside the packs);
//   - parameter time-versioning → OpenFisca PATTERN via `valid_from`/`valid_to`
//     already on every rule's provenance (E1a) and on the Plan record
//     (`SiteIntelPlanSchema.inForceFrom/inForceTo`);
//   - extraction annotation → RASE (requirement / applicability / selection /
//     exception — ACCORD, REPORT §L "maps 1:1 onto the provenance JSON").
//     E1a's `entities.ts` says verbatim: "RASE-style annotation is E1b's job" —
//     THIS file is that job's schema seat.
//
// ── NON-RIVALRY (C84 EI-9) ────────────────────────────────────────────────────
//   - `JurisdictionZoningContract` (site/zoning/, C58 §2.2) STAYS the pack shape
//     the engine consumes. This document is the AUTHORING format; the L2 loader
//     derives a C58 contract from it and the TS packs remain live until golden
//     parity holds (plan §E1b: "the TS pack stays in place until the data pack
//     matches it 100%"). Nothing here re-declares a C58 field vocabulary — zone
//     scalar names are carried as rule `parameter` strings, exactly as the
//     attribution layer carries them ("the caller's parameter vocabulary is
//     never rewritten", ordinance-extraction attribution/types.ts).
//   - `SiteIntelRule`/`RuleProvenance` (E1a) are composed whole. One authority
//     for the envelope shape; drift between "a rule" and "a migrated rule" is
//     unrepresentable.
//
// L0-pure (P5, hard gate): Zod only — zero I/O, zero THREE, zero DOM.

import { z } from 'zod';
import { IsoDateStringSchema } from './provenance.js';
import { SiteIntelRuleSchema, SiteIntelPlanSchema } from './entities.js';

/* ─────────────────────────── RASE annotation ────────────────────────────── */

/**
 * RASE-style annotation (ACCORD; REPORT §L "extraction annotation") — the four
 * clause roles tagged on the ORDINANCE TEXT a rule was read from. Each member
 * is a VERBATIM span of the source text, in the source language, never a
 * paraphrase: the annotation is what a human reviews against the document, and
 * a paraphrase cannot be reviewed (the same honesty rule as the attribution
 * layer's `EvidenceCitation.verbatim`).
 *
 *   - `requirement`   — the clause stating the obligation/limit itself
 *                       (the only mandatory member: a rule with no requirement
 *                       text has no reviewable source).
 *   - `applicability` — the clause saying WHERE/WHEN it applies (zone name,
 *                       parcel-size gate, street-width condition…). The
 *                       MACHINE form of this clause is the rule's own
 *                       `applicability.predicate` (E1a) — text here, logic there.
 *   - `selection`     — the clause selecting WHICH of several stated values
 *                       applies (a table row chooser, a band selector).
 *   - `exception`     — the clause that DISAPPLIES or alters the requirement
 *                       (e.g. PGM Art. 242.4's "sempre que sigui possible
 *                       inscriure una circumferència de vuit metres de
 *                       diàmetre"). An exception PRYZM cannot check must still
 *                       be CARRIED — dropping it silently converts a
 *                       conditional rule into an unconditional one.
 */
export const RaseAnnotationSchema = z.object({
    requirement: z.string().min(1),
    applicability: z.string().min(1).optional(),
    selection: z.string().min(1).optional(),
    exception: z.string().min(1).optional(),
});
export type RaseAnnotation = z.infer<typeof RaseAnnotationSchema>;

/* ──────────────────────── declarative (migrated) rule ───────────────────── */

/**
 * One migrated rule: the E1a rule envelope PLUS the optional RASE annotation.
 * `.extend` composes — the E1a shape is not re-declared, and every E1a
 * invariant (value=null only at tier 6, canonical source keys, ISO validity
 * dates) applies unchanged.
 */
export const DeclarativeRuleSchema = SiteIntelRuleSchema.extend({
    rase: RaseAnnotationSchema.optional(),
});
export type DeclarativeRule = z.infer<typeof DeclarativeRuleSchema>;

/* ───────────────────────── zone entry in the pack ───────────────────────── */

/**
 * One zone's migrated content. Scalar/geometric PARAMETERS live in `rules`
 * (each a full E1a rule envelope with provenance + validity); the fields below
 * are zone METADATA the C58 contract needs verbatim for golden parity — labels
 * and PRYZM-internal per-field provenance flags are curation facts, not
 * ordinance values, so they are data here rather than rules.
 *
 * A parameter ABSENT from `rules` loads as `null` in the derived C58 zone —
 * absence is the honest encoding of the packs' deliberate nulls ("an absent
 * number is honest; a plausible one is not"), and it is NOT representable as a
 * rule because E1a permits `value: null` only at confidence tier 6, while the
 * packs' nulls are mostly POSITIVE findings (no per-parcel FAR exists), not
 * uncertainty.
 *
 * `inheritsFromZoneCode` is §DEC-2 (Barcelona 13E) expressed in data: the zone
 * resolves THROUGH the named base zone's rules, its own `rules` acting as the
 * override delta. Empty delta ⇒ the base's rules verbatim, only code + label
 * differing — exactly the TS implementation's spread order.
 */
export const DeclarativeZoneSchema = z.object({
    code: z.string().min(1),
    label: z.string().min(1),
    /**
     * Permitted-use tokens in PACK ORDER (order is significant for parity —
     * the C58 contract stores an array). Tokens are the C58 `PermittedUse`
     * vocabulary, validated at load time by the C58 schema itself.
     */
    permittedUse: z.array(z.string().min(1)),
    /** C58 §1.6 per-field provenance flags, verbatim from the curated pack. */
    fieldProvenance: z.record(z.string(), z.string().min(1)),
    /** C58 §1.3 governing-citation prose, verbatim, or null. */
    ordinanceRef: z.string().min(1).nullable(),
    /** §DEC-2 inheritance: resolve through this zone's rules + own delta. */
    inheritsFromZoneCode: z.string().min(1).nullable().default(null),
    rules: z.array(DeclarativeRuleSchema),
});
export type DeclarativeZone = z.infer<typeof DeclarativeZoneSchema>;

/* ───────────────────────── the pack document ────────────────────────────── */

/**
 * Pack-level metadata mirrored verbatim from the C58 contract for parity.
 * Open strings here; the loader's `JurisdictionZoningContractSchema.parse`
 * enforces the closed C58 vocabularies (source, defaultConfidence) — one
 * authority, not two copies of an enum.
 */
export const DeclarativePackMetaSchema = z.object({
    jurisdictionId: z.string().min(1),
    displayName: z.string().min(1),
    source: z.string().min(1),
    crs: z.string().min(1),
    lastReviewed: z.string().min(4),
    defaultConfidence: z.string().min(1),
});
export type DeclarativePackMeta = z.infer<typeof DeclarativePackMetaSchema>;

/**
 * The DECLARATIVE RULE-PACK DOCUMENT — one data file per jurisdiction pack
 * family group. This is the artefact non-engineers author once the migration
 * completes (REPORT §L: "unlocking non-engineer authoring, and making country
 * #16+ scalable").
 *
 *   - `plan` — the governing instrument as an E1a Plan record; its
 *     `inForceFrom`/`inForceTo` are the plan half of the E1b versioning axis.
 *   - `packs` — one entry per C58 contract the document derives (a jurisdiction
 *     like Barcelona registers several pack families over one plan).
 *   - `constructions` — per-parcel CONSTRUCTED parameters (JSON-Logic bodies
 *     over parcel/street facts) that the C58 zone table deliberately ships as
 *     `null` (the "resolver module + dispatcher" pattern). They are rules, not
 *     zone scalars, because their value does not exist without parcel facts.
 *   - `notes` — document-level honesty caveats (e.g. which validity dates are
 *     ingestion-versioned per REPORT §K.2 because the state serves no machine
 *     validity axis). Carried IN-BAND, like the attribution tables do.
 */
export const DeclarativeRulePackDocumentSchema = z.object({
    formatVersion: z.literal(1),
    plan: SiteIntelPlanSchema,
    packs: z.array(
        z.object({
            meta: DeclarativePackMetaSchema,
            zones: z.array(DeclarativeZoneSchema),
        }),
    ),
    constructions: z.array(DeclarativeRuleSchema),
    notes: z.array(z.string().min(1)),
});
export type DeclarativeRulePackDocument = z.infer<typeof DeclarativeRulePackDocumentSchema>;

/* ───────────────────────── point-in-time helpers ────────────────────────── */

/**
 * OpenFisca-pattern point-in-time membership for one validity interval
 * (REPORT §K.2: "what applied on 2025-01-01 = point-in-time resolution").
 * Pure lexicographic ISO-date comparison (E1a's stated design: ISO calendar
 * dates compare lexicographically; no `Date` objects at L0).
 *
 * Semantics: in force on `date` ⇔ `valid_from ≤ date` AND
 * (`valid_to` is null OR `date ≤ valid_to`) — both bounds INCLUSIVE, null
 * `valid_to` = currently in force (E1a provenance.ts, verbatim).
 */
export function isInForceOn(
    valid_from: string,
    valid_to: string | null,
    date: string,
): boolean {
    // Malformed dates refuse (false), never coerce: an unparseable validity is
    // NOT "always in force".
    const iso = IsoDateStringSchema.safeParse(date);
    if (!iso.success) return false;
    if (!IsoDateStringSchema.safeParse(valid_from).success) return false;
    if (valid_to !== null && !IsoDateStringSchema.safeParse(valid_to).success) return false;
    return valid_from <= date && (valid_to === null || date <= valid_to);
}
