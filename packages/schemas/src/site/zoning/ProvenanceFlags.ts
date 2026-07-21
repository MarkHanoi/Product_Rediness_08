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
 *   - `ordinance-pdf`        — transcribed from a legal PDF ordinance.
 *   - `estimated`            — a curated/inferred value; never authoritative.
 */
export const FieldProvenanceSchema = z.enum([
    'published-structured',
    'ordinance-pdf',
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
 *                           certificate. See L-518 + `spain/barcelona-catalonia/RISK-REGISTER.md`
 *                           (R1): the panel MUST word this as "constructed", keep the citations,
 *                           and retain the "2008 modification not reflected" caveat.
 *   - `estimated-ruleset` — resolved from a curated zone-class rule pack (generic default).
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
    'not-determined',
]);
export type EnvelopeConfidence = z.infer<typeof EnvelopeConfidenceSchema>;

/**
 * The rule-pack seed confidence (C58 §1.6 `defaultConfidence`) — which of the
 * two §1.2 fidelities a pack's numbers should resolve to.
 */
export const RulePackDefaultConfidenceSchema = z.enum([
    'structured',
    'estimated-ruleset',
]);
export type RulePackDefaultConfidence = z.infer<
    typeof RulePackDefaultConfidenceSchema
>;
