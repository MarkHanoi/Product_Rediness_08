// C58 §1.2 / §1.6 — shared provenance + confidence vocabularies.
//
// L0-pure: Zod only (P5). These are the honesty labels that make a zoning
// number defensible (C58 §1.3 "explain-why") — they are contract invariants,
// not decoration, so they live in the schema layer where the CI fidelity-label
// gate (C58 §6 `check-zoning-confidence-label`) can bind to them.
//
// Strategic context — docs/02-decisions/contracts/C58-ZONING-RULES-AND-BUILDABLE-ENVELOPE.md §1.2/§1.6.

import { z } from 'zod';

/**
 * Per-field provenance (C58 §1.6). A single rule pack can mix a published
 * height with a PDF-transcribed setback, so the flag is PER numeric field:
 *   - `published-structured` — the source published this number as data.
 *   - `ordinance-pdf`        — a HUMAN transcribed a legal PDF ordinance
 *                              (curated pack, C58 §1.6).
 *   - `pipeline-extracted`   — a MACHINE (OCR + LLM / vision) extracted this
 *                              value from a scanned / text-trapped ordinance and
 *                              **no human has verified it**. STRICTLY BELOW
 *                              `ordinance-pdf`: a human who read and typed a
 *                              value outranks a pipeline nobody has checked, and
 *                              the two must never be conflated. Emitted only by
 *                              the horizontal ordinance-extraction pipeline
 *                              (`@pryzm/ordinance-extraction`,
 *                              `ORDINANCE-EXTRACTION-PIPELINE.md` §3 / L-590f §6).
 *                              ⚠ A legal control, not a nicety: once PRYZM OCRs a
 *                              document itself, a wrong number is unambiguously
 *                              OUR pipeline's error — so the value that carries it
 *                              must be permanently, visibly marked as ours-and-
 *                              unverified until a human signs it off.
 *   - `estimated`            — a curated/inferred value; never authoritative.
 */
export const FieldProvenanceSchema = z.enum([
    'published-structured',
    'ordinance-pdf',
    'pipeline-extracted',
    'estimated',
]);
export type FieldProvenance = z.infer<typeof FieldProvenanceSchema>;

/**
 * Envelope confidence (C58 §1.2) — mandatory on every `BuildableEnvelope`.
 * There is no unlabelled envelope:
 *   - `authoritative`     — an official certificate-grade determination.
 *   - `structured`        — provider returned numeric fields directly (DK case).
 *   - `block-constructed` — a REAL determination CONSTRUCTED from real cadastral geometry + an
 *                           accepted rule (the Barcelona PGM Art. 242.2 case: the depth is solved
 *                           from a real dissolved Catastro manzana, not looked up). Real inputs +
 *                           accepted rule + constructed geometry — NOT an official municipal
 *                           certificate. See L-518 + `jurisdictions/es/es-ct/08019-barcelona/RISK-REGISTER.md`
 *                           (R1): the panel MUST word this as "constructed", keep the citations,
 *                           and retain the "2008 modification not reflected" caveat.
 *   - `estimated-ruleset` — resolved from a curated zone-class rule pack (generic default).
 *   - `pipeline-extracted-unverified` — MACHINE-extracted from a scanned / text-trapped ordinance
 *                           and **NOT yet human-verified**. A PERMANENT tier BELOW
 *                           `estimated-ruleset`, added by the horizontal ordinance-extraction
 *                           pipeline (`ORDINANCE-EXTRACTION-PIPELINE.md` §3, L-590f §6). ⚠ IT NEVER
 *                           SILENTLY GRADUATES: promotion to any higher tier requires a RECORDED
 *                           human-verification event (a C23 `AIArtefact` with `humanApproval`, mirrored
 *                           by `ExtractionProvenance.humanVerifiedBy != null`). It is a LEGAL control,
 *                           not a nicety — a wrong number here is OUR pipeline's error (not the
 *                           publisher's), so it must render with a distinct, LOUDER-than-estimated
 *                           "machine-extracted, unverified" affordance and NO certificate styling.
 *                           ⚠ THIS IS STRICTLY WEAKER THAN `estimated-ruleset`: a curated human
 *                           estimate outranks an unverified machine read. It is NOT `not-determined`
 *                           either — a determination WAS produced, it simply has not been checked.
 *   - `not-determined`    — **NO determination was made, and that is the answer** (L-550, the
 *                           Phase-0.3 refusal vocabulary). Reserved for `status:
 *                           'not-applicable'` envelopes: the zone is a public system, protected
 *                           soil, or governed by a derived plan / per-site document PRYZM does
 *                           not hold, so there is no private buildable envelope to compute.
 *                           ⚠ THIS IS NOT A WEAKER `estimated-ruleset`. An estimate is a number
 *                           we produced and labelled; this is the deliberate absence of one,
 *                           carrying a CITED reason (`BuildableEnvelope.refusal`). Conflating
 *                           the two is the §CONTEXT-DATA-HONESTY failure — "failure and empty
 *                           are the same value" — restated at the envelope layer: today a park
 *                           and an unsurveyed plot both render a fabricated setback triple.
 */
export const EnvelopeConfidenceSchema = z.enum([
    'authoritative',
    'structured',
    'block-constructed',
    'estimated-ruleset',
    'pipeline-extracted-unverified',
    'not-determined',
]);
export type EnvelopeConfidence = z.infer<typeof EnvelopeConfidenceSchema>;

/**
 * The rule-pack seed confidence (C58 §1.6 `defaultConfidence`) — which §1.2
 * fidelity a pack's numbers should resolve to.
 *
 * `pipeline-extracted-unverified` lets a pack SEEDED by the ordinance-extraction
 * pipeline default its fields to the permanent bottom tier, never higher — a
 * machine-extracted pack cannot present its numbers as `structured` or above
 * until each is human-verified (`ORDINANCE-EXTRACTION-PIPELINE.md` §3).
 */
export const RulePackDefaultConfidenceSchema = z.enum([
    'structured',
    'estimated-ruleset',
    'pipeline-extracted-unverified',
]);
export type RulePackDefaultConfidence = z.infer<
    typeof RulePackDefaultConfidenceSchema
>;
