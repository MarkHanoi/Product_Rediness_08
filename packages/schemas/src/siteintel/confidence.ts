// E1a (EUROPE-IMPLEMENTATION-PLAN §E1a · REPORT §I · BRIEF §3) — the six-tier
// site-intelligence confidence vocabulary, VERBATIM from the founder brief.
//
// BRIEF §3 (audit/europe-site-intel/2026-08-31/BRIEF.md): every development-
// potential fact distinguishes "(1) authoritative machine-readable,
// (2) authoritative document-derived, (3) deterministic inference,
// (4) AI interpretation, (5) human-validated, (6) uncertain/missing".
// REPORT §I `Confidence { tier: (1)auth-machine|(2)auth-doc-derived|
// (3)deterministic-inference|(4)ai-interpreted|(5)human-validated|
// (6)uncertain-missing }` — "BRIEF §3 six-way, verbatim".
//
// ── NON-RIVALRY (C84 EI-9: one authority per concept) ─────────────────────────
// This is NOT a replacement for either existing confidence vocabulary:
//   - `EnvelopeConfidence` (site/zoning/ProvenanceFlags.ts, C58 §1.2) stays the
//     envelope-DETERMINATION ladder (authoritative/structured/block-constructed/
//     estimated-ruleset/pipeline-extracted-unverified/not-determined). It ranks
//     HOW an envelope determination was produced inside PRYZM's pipeline.
//   - `DomainConfidence` (site/metadata/DataConfidence.ts, C62/ADR-0280) is the
//     generic metadata WRAPPER, and by its own design "each domain keeps its own
//     tier vocabulary in the `tier` string". THIS enum is exactly such a domain
//     vocabulary: the per-VALUE sourcing taxonomy of the European canonical model
//     (which national register / document / inference / AI produced a number).
// The two axes are orthogonal: a whole-envelope determination can be
// `estimated-ruleset` while one of its input rules is tier 1 here.
//
// ⚠ SEMANTIC GUARDS carried from lane evidence:
//   - tier 6 `uncertain-missing` is a first-class ANSWER, never a default to be
//     read as 0 or as no-limit (REPORT §I invariants: UNKNOWN ≠ 0 ≠ no-limit,
//     L4 EE-4 — EE `korgus=0/empty means UNKNOWN, never no-limit`).
//   - tier 5 `human-validated` upgrades only on a RECORDED event (mirrors the
//     C58 L-449 gate / `ExtractionProvenance.humanVerifiedBy`).
//
// L0-pure (P5): Zod only. Zero I/O, zero THREE, zero DOM.

import { z } from 'zod';

/**
 * The six tiers, ordered strongest-first. Names follow the lane-brief spelling
 * (plan §E1a); the BRIEF §3 phrasing for each is in the doc comment above.
 *
 * ⚠ THE TIER IS A PROJECTION, NOT A PRIMARY AXIS (E1 gate decision §C
 * non-schema item · challenge verdict §E · architect §5.1.2 — this paragraph
 * changes the enum's DOCUMENTATION, not its shape, per verdict §H). The tier
 * is a redundant projection of the rule record's REAL axes:
 *
 *   derivation (HOW obtained: DIRECT/DERIVED/AI_EXTRACTED/HUMAN_VALIDATED)
 *   × valueLocation (WHERE it lives: attribute / in-document-text)
 *   × source-kind (recoverable from `source.document ≠ null`)
 *   × validation-event (a RECORDED human validation — the C58 L-449 mirror)
 *   × known-unknown (`value = null` ⇔ tier 6, superRefine-enforced).
 *
 * Where two tiers are simultaneously true — an AI-extracted value from an
 * authoritative document is both tier-2-shaped and tier-4-shaped — the
 * projection takes the EXTRACTION-side tier (4); the source-side information
 * stays recoverable from `source.document` + `valueLocation` (architect
 * §5.1.2: the conflated pair is mitigated in-record, never collapsed).
 * INCOHERENT pairs (tier 1 + AI_EXTRACTED · tier 1 + in-document-text ·
 * tier 5 without a HUMAN_VALIDATED derivation) are rejected at parse by
 * `RuleProvenanceSchema`'s superRefine — see provenance.ts. No seventh tier
 * and no single numeric score, ever (verdict §F.5: a score is the dimension
 * collapse the brief forbids).
 */
export const SiteIntelConfidenceTierSchema = z.enum([
    'authoritative-machine-readable',
    'authoritative-document-derived',
    'deterministic-inference',
    'ai-interpretation',
    'human-validated',
    'uncertain-missing',
]);
export type SiteIntelConfidenceTier = z.infer<typeof SiteIntelConfidenceTierSchema>;

/**
 * The REPORT §I numeric coding, 1..6 in declaration order — the wire form used
 * by the per-rule provenance JSON (`"confidence": { "tier": 1, ... }`).
 */
export const SITEINTEL_CONFIDENCE_TIER_NUMBER: Readonly<
    Record<SiteIntelConfidenceTier, 1 | 2 | 3 | 4 | 5 | 6>
> = Object.freeze({
    'authoritative-machine-readable': 1,
    'authoritative-document-derived': 2,
    'deterministic-inference': 3,
    'ai-interpretation': 4,
    'human-validated': 5,
    'uncertain-missing': 6,
} as const);

/** Inverse of {@link SITEINTEL_CONFIDENCE_TIER_NUMBER}: 1..6 → tier name. */
export const SITEINTEL_CONFIDENCE_TIER_BY_NUMBER: readonly SiteIntelConfidenceTier[] =
    SiteIntelConfidenceTierSchema.options;

/** Pure helper: numeric wire tier (1..6) → vocabulary name. */
export function confidenceTierName(tier: 1 | 2 | 3 | 4 | 5 | 6): SiteIntelConfidenceTier {
    return SITEINTEL_CONFIDENCE_TIER_BY_NUMBER[tier - 1]!;
}

/**
 * The Confidence ENTITY (REPORT §I) — the numeric wire form plus an optional
 * human note. The note carries source caveats verbatim (the REPORT worked
 * example: `"korgus=0/empty means UNKNOWN, never no-limit"`).
 */
export const SiteIntelConfidenceSchema = z.object({
    /** 1 = authoritative-machine-readable … 6 = uncertain-missing. */
    tier: z.union([
        z.literal(1),
        z.literal(2),
        z.literal(3),
        z.literal(4),
        z.literal(5),
        z.literal(6),
    ]),
    /** Free-text caveat carried with the value (never load-bearing for logic). */
    note: z.string().min(1).optional(),
});
export type SiteIntelConfidence = z.infer<typeof SiteIntelConfidenceSchema>;
