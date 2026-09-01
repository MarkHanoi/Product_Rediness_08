// E1a (EUROPE-IMPLEMENTATION-PLAN §E1a · REPORT §I · BRIEF §11) — the per-rule
// provenance JSON shape: parameter / value / unit / source{country, authority,
// dataset, plan_id, object_id, document, article, page} / derivation /
// valueLocation / confidence / valid_from / valid_to.
//
// This is the record REPORT §I prints as a worked example (EE maxHeight 17.4 m,
// PLANK `dp_hoonestus`, tier 1) and calls "aligned to what NL/LT/EE already
// serve" — three states already run this model natively (L4 cross-cutting #1:
// LT ASGR per-value provenance columns, NL Normwaarde/waardeInRegeltekst,
// EE tingimus-vs-column split).
//
// ── NON-RIVALRY (C84 EI-9) ────────────────────────────────────────────────────
// Distinct concepts already have their own authorities and are NOT re-minted:
//   - `ExtractionProvenance` (site/zoning/ExtractionProvenance.ts, C23) — the
//     machine-EXTRACTION audit record (crop, dual-pass, humanVerifiedBy). When
//     `derivation` here is AI_EXTRACTED, the extraction pipeline stores one of
//     those alongside; this record holds the legal ADDRESS of the value.
//   - `SourceProvenance` (site/metadata/DataConfidence.ts, C62) — the generic
//     provider-id stamp. `RuleSourceRef` is richer (article/page addressing)
//     because a RULE cites into a legal instrument, not just an API.
//   - `ZoningProvenance` (site/zoning/ZoningRecord.ts) — the zoning-FETCH stamp.
//
// L0-pure (P5): Zod only. Zero I/O, zero THREE, zero DOM.

import { z } from 'zod';
import { SiteIntelConfidenceSchema } from './confidence.js';

/**
 * `YYYY-MM-DD` calendar-date string (the REPORT's `valid_from: "2018-05-02"`
 * form). A plain string, deliberately: L0 must not construct `Date` objects on
 * parse (timezone semantics are a consumer concern), and OpenFisca-pattern
 * time-versioning compares these lexicographically, which ISO dates support.
 */
export const IsoDateStringSchema = z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'expected an ISO calendar date (YYYY-MM-DD)');
export type IsoDateString = z.infer<typeof IsoDateStringSchema>;

/**
 * HOW the value came to be known (REPORT §I, verbatim):
 *   - `DIRECT`          — read from an authoritative machine attribute.
 *   - `DERIVED`         — computed deterministically from authoritative inputs
 *                         (e.g. DK GFA = bebygpct × the CODED denominator area).
 *   - `AI_EXTRACTED`    — pulled from a document by a model; carries the C23
 *                         `ExtractionProvenance` audit trail elsewhere.
 *   - `HUMAN_VALIDATED` — a human confirmed the value against the source.
 */
export const RuleDerivationSchema = z.enum([
    'DIRECT',
    'DERIVED',
    'AI_EXTRACTED',
    'HUMAN_VALIDATED',
]);
export type RuleDerivation = z.infer<typeof RuleDerivationSchema>;

/**
 * WHERE the value physically lives at the source (REPORT §I):
 *   - `attribute`        — a machine-readable field (EE `MAX_AUK_M`-style column,
 *                          NL `kwantitatieveWaarde`).
 *   - `in-document-text` — only in rule prose. This is the NL
 *                          `waardeInRegeltekst` / EE `tingimus` split, imported
 *                          rather than invented — see `vocabularies/nl.ts`.
 */
export const RuleValueLocationSchema = z.enum(['attribute', 'in-document-text']);
export type RuleValueLocation = z.infer<typeof RuleValueLocationSchema>;

/**
 * The legal ADDRESS of a rule value — BRIEF §11's
 * `source{country,authority,dataset,plan,object,document,article,page}`.
 *
 * Canonical field names are `plan_id` / `object_id` (plan §E1a spelling); the
 * REPORT §I worked example prints the BRIEF's shorter `plan` / `object` keys,
 * so `RuleSourceRefSchema` accepts BOTH spellings on input and always emits the
 * canonical ones (the alias is resolved in a preprocess step, never stored).
 *
 * Every field except `country`/`authority`/`dataset` is nullable because the
 * chain honestly thins out: a WFS attribute has no article/page; a PDF-derived
 * value has all eight. `null` = "this hop does not exist for this source" —
 * an ABSENT required field is a parse error, never silently defaulted.
 */
const ruleSourceRefFields = z.object({
    /** ISO-3166-1 alpha-2, uppercase (`"EE"`, `"DE"`, `"DK"`, `"LT"`…). */
    country: z.string().regex(/^[A-Z]{2}$/, 'expected ISO-3166-1 alpha-2, uppercase'),
    /** Publishing authority (`"PLANK/PLANIS"`, `"VTPSI"`, `"Plandata.dk"`). */
    authority: z.string().min(1),
    /** Dataset / layer / service (`"dp_hoonestus"`, `"ASGR"`, `"theme_pdk_kommuneplanramme"`). */
    dataset: z.string().min(1),
    /** Plan identifier within the dataset, or null when the value is plan-independent. */
    plan_id: z.string().min(1).nullable().default(null),
    /** The concrete source object (`"hoonestusala Kopli tn 2"`), or null. */
    object_id: z.string().min(1).nullable().default(null),
    /** Document identifier (doklink / idurba / ELI …), or null for attribute-served values. */
    document: z.string().min(1).nullable().default(null),
    /** Article / section reference inside the document, or null. */
    article: z.string().min(1).nullable().default(null),
    /** 1-based page number inside the document, or null. */
    page: z.number().int().min(1).nullable().default(null),
});

export const RuleSourceRefSchema = z.preprocess((raw) => {
    if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return raw;
    const o = raw as Record<string, unknown>;
    // BRIEF-§11 short keys → canonical keys. Only fills a MISSING canonical key;
    // if both spellings are present the canonical one wins and the alias is dropped.
    const { plan, object, ...rest } = o;
    const out: Record<string, unknown> = { ...rest };
    if (!('plan_id' in out) && plan !== undefined) out['plan_id'] = plan;
    if (!('object_id' in out) && object !== undefined) out['object_id'] = object;
    return out;
}, ruleSourceRefFields);
export type RuleSourceRef = z.infer<typeof ruleSourceRefFields>;

/**
 * The per-rule provenance record — BRIEF §11 shape, REPORT §I worked-example
 * compatible. One of these travels with EVERY resolved rule parameter; the E1c
 * evidence graph hangs its chain off `source`, and the E1b evaluator refuses to
 * evaluate a rule that fails this parse (a value with no legal address is not a
 * value).
 */
export const RuleProvenanceSchema = z.object({
    /** Canonical parameter name (`"maxHeight"`, `"maximum_height"`, `"bebygpct"`). */
    parameter: z.string().min(1),
    /**
     * The value itself. Number for scalars; string for codelist values
     * (`bebygpctaf` codes travel as their codelist type, not here); boolean for
     * flags; null ONLY together with confidence tier 6 (uncertain-missing) —
     * UNKNOWN ≠ 0 ≠ no-limit (REPORT §I invariants, L4 EE-4).
     */
    value: z.union([z.number(), z.string(), z.boolean(), z.null()]),
    /**
     * Unit string, or null for dimensionless ratios/codes. From the NL IMOW
     * `Eenheid` value list where possible (REPORT §I) — see `vocabularies/nl.ts`.
     */
    unit: z.string().min(1).nullable(),
    source: RuleSourceRefSchema,
    derivation: RuleDerivationSchema,
    /** Optional: where the value physically lives at the source. */
    valueLocation: RuleValueLocationSchema.optional(),
    /**
     * R2 (E1 gate decision §C · verdict §E R2): optional typed VALUE-BASIS
     * qualifier — the semantic the scalar `value` is measured against, carried
     * VERBATIM as `{scheme, code}` (`{scheme:'dk-bygberegnaf', code:'4'}`,
     * `{scheme:'ee-vertical-datum', code:'EH2000'}`, an LT unit-caveat
     * scheme). Mapping to `LandBasis`/datum semantics happens in ADAPTERS
     * only — NO mapping table at L0 (L-664, as `vocabularies/dk.ts` honours;
     * verdict §F.8). A consumer computing with `value` while ignoring a
     * present `valueBasis` reproduces the C63 Aarhus trap
     * (`bebygpct=180, af=1` → wrong GFA while every field parses clean).
     */
    valueBasis: z
        .object({
            scheme: z.string().min(1),
            code: z.string().min(1),
        })
        .optional(),
    confidence: SiteIntelConfidenceSchema,
    /**
     * R5 (E1 gate decision §C · verdict §E R5): normative FORCE of the value's
     * instrument, MIRRORED verbatim from the register, never harmonised — the
     * same doctrine as `Restriction.lawStatus` and `Plan.status`. Live probed
     * forms: LT ASGR "rekomendacinio pobūdžio", DK byggefelt "bygvejledende",
     * DE "Orientierungswert". `null` = the register serves no force flag for
     * this value — it is NOT an assertion of bindingness. This gives
     * authoritative-but-ambiguous its honest encoding WITHOUT touching the
     * six tiers (challenge gap #6).
     */
    normativeForce: z.string().min(1).nullable().default(null),
    /**
     * R3 (E1 gate decision §C · verdict §E R3): what the validity window is a
     * claim ABOUT. `'legal'` = `valid_from`/`valid_to` mirror the instrument's
     * legal validity axis; `'ingestion'` = the state served no machine
     * validity axis and the window is ingestion-versioned (the REPORT §K.2
     * sanction, made machine-visible). A point-in-time evaluator must treat
     * `'ingestion'` windows as NOT answering "was this in force on date D" —
     * that is the confident-false-negative path this field kills (gate
     * decision §B.3). REQUIRED, no default: absence was exactly the
     * machine-indistinguishability being closed.
     */
    validityBasis: z.enum(['legal', 'ingestion']),
    /** In force FROM this date (inclusive). */
    valid_from: IsoDateStringSchema,
    /** In force TO this date, or null = currently in force (OpenFisca pattern). */
    valid_to: IsoDateStringSchema.nullable(),
}).superRefine((rec, ctx) => {
    if (rec.value === null && rec.confidence.tier !== 6) {
        ctx.addIssue({
            code: 'custom',
            path: ['value'],
            message:
                'value=null is only representable at confidence tier 6 (uncertain-missing) — ' +
                'UNKNOWN ≠ 0 ≠ no-limit (REPORT §I / L4 EE-4)',
        });
    }
    // ── Tier-projection coherence (E1 gate decision §C non-schema item ·
    // architect §5.1.2) ──────────────────────────────────────────────────────
    // The confidence tier is a PROJECTION of the record's real axes (see
    // confidence.ts); pairs that contradict the projection are parse errors.
    // Only DEMONSTRATED-incoherent pairs are rejected — conflated-but-both-true
    // pairs (e.g. tier 2 + AI_EXTRACTED, architect §5.1.2) stay parseable, and
    // extending this set is an ADR-level change once the R-batch freezes.
    if (rec.confidence.tier === 1 && rec.derivation === 'AI_EXTRACTED') {
        ctx.addIssue({
            code: 'custom',
            path: ['confidence', 'tier'],
            message:
                'tier 1 (authoritative-machine-readable) + derivation AI_EXTRACTED is incoherent — ' +
                'a machine-readable attribute needs no AI extraction (architect §5.1.2 named pair)',
        });
    }
    if (rec.confidence.tier === 1 && rec.valueLocation === 'in-document-text') {
        ctx.addIssue({
            code: 'custom',
            path: ['confidence', 'tier'],
            message:
                'tier 1 (authoritative-machine-readable) + valueLocation in-document-text is incoherent — ' +
                'a value living only in rule prose is tier 2 (authoritative-document-derived) territory',
        });
    }
    if (rec.confidence.tier === 5 && rec.derivation !== 'HUMAN_VALIDATED') {
        ctx.addIssue({
            code: 'custom',
            path: ['confidence', 'tier'],
            message:
                'tier 5 (human-validated) requires derivation HUMAN_VALIDATED — tier 5 upgrades only ' +
                'on a RECORDED validation event (confidence.ts guard, mirroring C58 L-449)',
        });
    }
});
export type RuleProvenance = z.infer<typeof RuleProvenanceSchema>;
