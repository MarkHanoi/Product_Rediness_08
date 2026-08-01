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
 * §ENVELOPE-CONFIDENCE-LADDER (L-664) — the ONE ordered statement of the §1.2 ladder,
 * **weakest → strongest**. This is the single source of truth every consumer reads: the C63
 * scorecard's ENVELOPE-axis weights, the ordinance-extraction graduation gate
 * (`@pryzm/ordinance-extraction` `confidenceRank` / `canGraduateTier`), the fidelity-label CI gate,
 * and the render's TRUSTED set.
 *
 * ⚠ WHY IT LIVES HERE, IN L0, NEXT TO THE ENUM. The ordering was previously stated only in
 * `@pryzm/ordinance-extraction/src/confidence.ts` — an **L2** package. C63's scorecard schema is
 * L0 and may not import L2, so the ruler that scores the ENVELOPE axis could not reach the ladder
 * that defines the tiers, and C63 §3 grew its own two-name vocabulary (`certified` /
 * `constructed-amber`) that no code ever implemented. An ordering that only one layer can see is
 * not an ordering of the vocabulary (the same argument C58 §1.2/L-572 makes about the tier being a
 * property of the determination, not of one caller).
 *
 * ⚠ THE ORDER IS NORMATIVE, NOT COSMETIC:
 *   - `pipeline-extracted-unverified` < `estimated-ruleset` — a machine read nobody has checked
 *     can never out-rank a curated human estimate (L-590f §6).
 *   - `block-constructed` < `structured` — a determination PRYZM constructed under an accepted
 *     rule ranks below numbers the authority itself published as data.
 *   - `structured` < `authoritative` — **published ≠ determined.** `structured` means the numbers
 *     were PUBLISHED; `authoritative` means a determination was ISSUED. Collapsing them would let a
 *     published-but-undetermined value read as a compliance fact (C58 §1.2, L-664).
 *   - `not-determined` sits at the bottom because it is the deliberate ABSENCE of a determination,
 *     not a weak one — it is on the ladder only so a total order exists; consumers that score
 *     *completeness* MUST treat it as excluded-or-zero, never as "a bit of an answer" (C63 §3.1).
 *
 * ⚠ HISTORIC NAMES. C63 §3 (pre-2026-08-01) used `certified` and `constructed-amber`. Neither was
 * ever an `EnvelopeConfidence` member and neither is exported here as a runtime alias — a live
 * translation table is exactly the "invent a mapping to paper over the mismatch" move L-664
 * forbids. The read-only historic mapping is recorded in prose in C63 §3.2.
 */
export const ENVELOPE_CONFIDENCE_ORDER = [
    'not-determined',
    'pipeline-extracted-unverified',
    'estimated-ruleset',
    'block-constructed',
    'structured',
    'authoritative',
] as const satisfies readonly EnvelopeConfidence[];

/**
 * The ladder position of a confidence tier (higher = stronger determination).
 *
 * Pure + total: every `EnvelopeConfidence` has a rank, by construction (the tuple above is asserted
 * to be a permutation of the enum in `envelopeConfidenceLadder.test.ts`).
 *
 * P8 / P5 note — an L0 schema takes NO OpenTelemetry span: a span is I/O and would break P5
 * purity. Same documented carve-out as C62's `authorityOutranks` and C63's `renormalizedOverall`,
 * which are pure deterministic reducers in this same package.
 */
export function envelopeConfidenceRank(c: EnvelopeConfidence): number {
    return ENVELOPE_CONFIDENCE_ORDER.indexOf(c);
}

/**
 * Is `a` a strictly stronger determination than `b`? The deterministic "which tier wins"
 * primitive — the envelope analogue of C62's `authorityOutranks`. No consumer invents its own
 * comparison (P5-pure; see the span carve-out on `envelopeConfidenceRank`).
 */
export function isStrongerEnvelopeConfidence(
    a: EnvelopeConfidence,
    b: EnvelopeConfidence,
): boolean {
    return envelopeConfidenceRank(a) > envelopeConfidenceRank(b);
}

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
