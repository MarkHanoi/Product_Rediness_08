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
 *   - `estimated-ruleset` — resolved from a curated zone-class rule pack.
 */
export const EnvelopeConfidenceSchema = z.enum([
    'authoritative',
    'structured',
    'estimated-ruleset',
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
