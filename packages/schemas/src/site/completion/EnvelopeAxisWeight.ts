// C63 §3 Axis 4 / §3.2 (L-664) — the EXHAUSTIVE `EnvelopeConfidence → ENVELOPE-axis weight` map.
//
// WHY THIS EXISTS — THE DEFECT IT CLOSES
// --------------------------------------
// C63 §3 Axis 4 scored the ENVELOPE axis with `certified` = 1.0 and `constructed-amber` = 0.7.
// **Neither name has ever existed in code.** `EnvelopeConfidence` (C58 §1.2,
// `../zoning/ProvenanceFlags.ts`) declares six tiers, none of them called `certified` or
// `constructed-amber`. The consequences were both load-bearing:
//   1. Contract compliance was unprovable — the contract described a vocabulary nothing implements.
//   2. The ENVELOPE axis could not be scored **even once a coverage measurement existed**, because
//      there was no defensible tier → weight map to apply. Barcelona's Axis 4 therefore reads
//      `not-assessed` and its headline is renormalised over 3 of 7 axes — and a city cannot be
//      declared CLOSED on an axis that cannot be scored.
// This module is the resolution: ONE total function from the SCHEMA's vocabulary to the axis
// weight, with no default branch. A tier that is not mapped is a compile error, never a silent 0.
//
// ⚠ WHAT THIS MODULE MUST NOT BE. It is NOT a translation table between the contract's dead names
// and the schema's live ones. Inventing such a mapping was explicitly forbidden (L-664): when a
// contract tier has no schema equivalent, the honest resolution is to amend the contract. C63 §3.2
// was amended to the schema's vocabulary; the historic names survive only as read-only prose there.
//
// ⚠ RE-LABELLING MUST NOT RE-VALUE. Nothing here changes any rule pack's published confidence. The
// two weights the contract had already fixed are carried over unchanged (`certified` 1.0 →
// `authoritative` 1.0; `constructed-amber` 0.7 → `block-constructed` 0.7; `cited-refusal`/`no-pack`
// 0.0 → `not-determined`/`no-pack` 0.0). `packages/site-parcel-data/__tests__/
// packPublishedConfidenceUnchanged.test.ts` pins every pack's published value against this change.
//
// LAYERING — L0-pure (P5): Zod-adjacent data + pure reducers. Zero I/O, zero THREE, zero DOM.
// Per P5 an L0 schema takes no OpenTelemetry span (a span is I/O and would break purity) — the same
// documented carve-out as C62's `authorityOutranks` and C63's `renormalizedOverall` in this package.
//
// Contract: docs/02-decisions/contracts/C63-CITY-COMPLETION-AND-DOSSIER.md §3 Axis 4 / §3.2 / §4.
// Composes: ../zoning/ProvenanceFlags.ts (C58 §1.2 — the tier vocabulary + `ENVELOPE_CONFIDENCE_ORDER`).

import {
    ENVELOPE_CONFIDENCE_ORDER,
    type EnvelopeConfidence,
} from '../zoning/ProvenanceFlags.js';

/**
 * What a slice of a city's **private-buildable land** (the C63 §3/§4 denominator, ratified L-656)
 * resolved to when the ENVELOPE axis was measured.
 *
 * It is `EnvelopeConfidence` **plus one sentinel**, `'no-pack'`. The sentinel is deliberate and is
 * NOT a seventh confidence tier: `EnvelopeConfidence` labels a determination that was PRODUCED, and
 * `'no-pack'` is the case where the registry produced nothing at all for that land (the C60 coverage
 * gap — `answerabilityClass` `zone-unencoded`). Folding it into `not-determined` would be the
 * §CONTEXT-DATA-HONESTY collapse the whole model exists to prevent: `not-determined` is a CITED
 * legal refusal (a correct answer), `no-pack` is PRYZM's own coverage gap. They score the same for
 * *completeness* and mean opposite things — so they stay two words.
 */
export type EnvelopeCoverageTier = EnvelopeConfidence | 'no-pack';

/** The `no-pack` sentinel, named once. */
export const ENVELOPE_NO_PACK: EnvelopeCoverageTier = 'no-pack';

/**
 * Every coverage tier, weakest → strongest, with the coverage gap first. Exported so a consumer
 * (a test, a `RATE.md` generator, a legend) enumerates the SOURCE OF TRUTH and never a hand copy.
 */
export const ENVELOPE_COVERAGE_TIERS = [
    ENVELOPE_NO_PACK,
    ...ENVELOPE_CONFIDENCE_ORDER,
] as const satisfies readonly EnvelopeCoverageTier[];

/**
 * THE LADDER → WEIGHT MAP (C63 §3.2). Total over `EnvelopeCoverageTier`; **no default branch**.
 *
 * PROVENANCE OF EACH NUMBER — three are inherited from the contract, three are new because the
 * contract's two-name vocabulary could not express them:
 *
 * | tier | weight | status | why |
 * |---|---:|---|---|
 * | `authoritative` | 1.00 | **inherited** (C63 §3 `certified` = 1.0) | An official determination was ISSUED. Nothing further to do on this land. |
 * | `structured` | 0.90 | **PROVISIONAL — pending founder ratification** | The authority PUBLISHED the numbers as data (DK Plandata). The residual 0.10 is the determination gap: published ≠ determined for *this* parcel. The old `certified` name would have scored this 1.00 and thereby let a published-but-undetermined value read as a compliance fact — the precise distinction L-664 preserved. |
 * | `block-constructed` | 0.70 | **inherited** (C63 §3 `constructed-amber` = 0.7) | Real inputs + accepted rule + constructed geometry (Barcelona PGM Art. 242.2, ADR-0271), NOT a municipal certificate. |
 * | `estimated-ruleset` | 0.40 | **PROVISIONAL — pending founder ratification** | A curated human estimate from a cited ordinance. A real, citable answer — but C58 §1.4 makes it carry "verify before relying on it", so it cannot approach a constructed determination. |
 * | `pipeline-extracted-unverified` | 0.10 | **PROVISIONAL — pending founder ratification** | A determination WAS produced, so it is not 0 (it is not `not-determined`) — but it is a machine read no human has checked and must not be relied on, so it sits just above nothing and strictly below a curated estimate (L-590f §6). |
 * | `not-determined` | 0.00 | **inherited** (C63 §3 `cited-refusal` = 0.0-for-completion) | A CITED refusal: 0 % complete, **100 % honest** (§3.1). Scored zero here only when it falls on land inside the buildable denominator (e.g. a `derived-plan` clau); land the ordinance removes from private buildability is EXCLUDED from the denominator entirely (L-656), never scored zero. |
 * | `no-pack` | 0.00 | **inherited** (C63 §3 `no-pack` = 0.0) | PRYZM's coverage gap. |
 *
 * ⚠ The three PROVISIONAL values are marked as such in C63 §3.2 and listed in C63 §8 as an open
 * founder decision, exactly as the `derived-levels` HEIGHTS question is. They are **not** presented
 * as ratified. What IS settled by L-664 is the *vocabulary* and the *ordering*; the three interior
 * magnitudes are a weighting question the founder ratifies, like the §4 axis vector (L-649).
 */
export const ENVELOPE_AXIS_TIER_WEIGHT: Readonly<Record<EnvelopeCoverageTier, number>> =
    Object.freeze({
        'authoritative': 1.0,
        'structured': 0.9,
        'block-constructed': 0.7,
        'estimated-ruleset': 0.4,
        'pipeline-extracted-unverified': 0.1,
        'not-determined': 0.0,
        'no-pack': 0.0,
    });

/**
 * The stamp identifying which tier-weight vector produced an ENVELOPE axis score. Mirrors
 * `CITY_COMPLETION_WEIGHTS_VERSION` — a re-weighting is one config edit plus a new stamp, and a
 * scorecard records which vector it used so two cities are never compared across vectors.
 */
export const ENVELOPE_AXIS_TIER_WEIGHT_VERSION = 'provisional-2026-08-01-L664';

/**
 * The weight for one coverage tier. Total by construction — the `Record` type makes an unmapped
 * tier a `tsc` error rather than a silent lookup miss, so there is no default branch to hide in.
 */
export function envelopeAxisTierWeight(tier: EnvelopeCoverageTier): number {
    return ENVELOPE_AXIS_TIER_WEIGHT[tier];
}

/**
 * One measured slice of the city's private-buildable land (C63 §3 Axis 4 input).
 *
 * `buildableLandShare` is that slice's fraction of the **buildable-land denominator** (L-656) — NOT
 * of all municipal ground. The shares of the slices supplied need not sum to 1: land that has not
 * been measured is simply ABSENT, and `envelopeAxisScore` renormalises over what IS present rather
 * than treating the remainder as zero (the C63 §1.5 rule, one level down).
 */
export interface EnvelopeCoverageSlice {
    /** The clau / zone / regime this slice covers — carried for the axis `derivation` string. */
    readonly zoneCode: string;
    readonly tier: EnvelopeCoverageTier;
    /** Fraction (0..1) of the city's private-buildable land governed by this slice. */
    readonly buildableLandShare: number;
}

/** The result of scoring the ENVELOPE axis from a coverage breakdown. */
export interface EnvelopeAxisScore {
    /** 0..1, or `null` when NOTHING was measured (→ the caller emits `not-assessed` + a reason). */
    readonly score: number | null;
    /** Σ of the supplied shares — the measured fraction of the buildable-land denominator. */
    readonly measuredShare: number;
    /** True when `measuredShare` < 1: some buildable land was never measured (C63 §1.5 `partial`). */
    readonly partial: boolean;
}

/**
 * Score the ENVELOPE axis (C63 §3 Axis 4): `Σ(share × tierWeight) / Σ(share)` over the measured
 * slices of private-buildable land.
 *
 * ⚠ RENORMALISED, NOT ZERO-FILLED. Unmeasured land shrinks the denominator and sets `partial`; it
 * is never scored 0. That is C63 §1.5's rule ("an unassessed axis neither counts as 0 nor silently
 * inflates the rest") applied one level down, and it is why `measuredShare` is returned alongside —
 * a 90 % score over 10 % of the city is honest only if the 10 % travels with it.
 *
 * Returns `score: null` when no slice was supplied (Σshare = 0): nothing was measured, so there is
 * no number — the caller must emit `not-assessed` + a typed C62 `UnknownReason`, never a 0.
 *
 * Pure + deterministic; no span (P5 carve-out, see the file header).
 */
export function envelopeAxisScore(
    slices: readonly EnvelopeCoverageSlice[],
    weights: Readonly<Record<EnvelopeCoverageTier, number>> = ENVELOPE_AXIS_TIER_WEIGHT,
): EnvelopeAxisScore {
    let measuredShare = 0;
    let weighted = 0;
    for (const s of slices) {
        measuredShare += s.buildableLandShare;
        weighted += s.buildableLandShare * weights[s.tier];
    }
    // Guard the degenerate denominator explicitly: "no slices" and "slices that sum to 0" are the
    // same honest answer — nothing was measured — and must not divide by zero into a NaN that a
    // downstream `toFixed` would render as a confident-looking string.
    if (measuredShare <= 0) {
        return { score: null, measuredShare: 0, partial: true };
    }
    return {
        score: weighted / measuredShare,
        measuredShare,
        // Float tolerance: a breakdown authored as 0.271 + 0.729 must read as complete.
        partial: measuredShare < 1 - 1e-9,
    };
}
