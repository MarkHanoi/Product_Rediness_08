// @pryzm/ordinance-extraction — the confidence ladder + the no-silent-graduation
// invariant (LOCK 3 of the three locks, `ORDINANCE-EXTRACTION-PIPELINE.md` §3.2).
//
// Pure: no I/O. The C58 §1.2 resolution ladder places
// `pipeline-extracted-unverified` strictly BELOW `estimated-ruleset`; this module
// is the single, testable statement of that ordering AND of the one legal door
// out of the tier.

import {
    type EnvelopeConfidence,
    type ExtractionProvenance,
} from '@pryzm/schemas';

/**
 * The C58 §1.2 resolution ladder as a strict total order (higher = stronger).
 * `pipeline-extracted-unverified` sits at index 1 — above only `not-determined`
 * (which is the deliberate ABSENCE of a determination), and below every tier that
 * represents a determination a human or a publisher stands behind.
 *
 * ⚠ A machine read nobody has checked can never out-rank a curated estimate, so
 * `pipeline-extracted-unverified` < `estimated-ruleset`. This is the whole point
 * of the tier (L-590f §6).
 */
const CONFIDENCE_RANK: Readonly<Record<EnvelopeConfidence, number>> = Object.freeze({
    'not-determined': 0,
    'pipeline-extracted-unverified': 1,
    'estimated-ruleset': 2,
    'block-constructed': 3,
    'structured': 4,
    'authoritative': 5,
});

/** The ladder position of a confidence tier (higher = stronger). */
export function confidenceRank(c: EnvelopeConfidence): number {
    return CONFIDENCE_RANK[c];
}

/** Is `a` a strictly stronger determination than `b`? */
export function isStrongerThan(a: EnvelopeConfidence, b: EnvelopeConfidence): boolean {
    return confidenceRank(a) > confidenceRank(b);
}

/**
 * The confidence a pipeline-produced field may carry. ALWAYS the bottom
 * determination tier until a human signs off — the pipeline cannot mint anything
 * higher itself (LOCK 1 is the distinct enum; this clamps the producer to it).
 */
export const PIPELINE_TIER: EnvelopeConfidence = 'pipeline-extracted-unverified';

/**
 * 🔴 LOCK 3 — the no-silent-graduation invariant.
 *
 * A value may move OUT of `pipeline-extracted-unverified` to any higher tier ONLY
 * when a human has verified it — `ExtractionProvenance.humanVerifiedBy != null`
 * (mirroring a C23 `AIArtefact.humanApproval`). This function is the single guard;
 * a CI/property test asserts no tier is raised without it.
 *
 * Rules:
 *   - Staying at, or dropping below, the pipeline tier is always allowed.
 *   - Rising ABOVE the pipeline tier requires `humanVerifiedBy` (+ `verifiedAt`).
 *   - A field NOT currently at the pipeline tier is out of this gate's remit
 *     (returns true — it was never pipeline-seeded).
 */
export function canGraduateTier(
    from: EnvelopeConfidence,
    to: EnvelopeConfidence,
    provenance: Pick<ExtractionProvenance, 'humanVerifiedBy' | 'verifiedAt'>,
): boolean {
    // Not a pipeline-tier field → not our concern.
    if (from !== PIPELINE_TIER) return true;
    // Staying put or moving down the ladder is always fine.
    if (confidenceRank(to) <= confidenceRank(PIPELINE_TIER)) return true;
    // Rising above the pipeline tier: ONLY with a recorded human sign-off.
    return provenance.humanVerifiedBy !== null && provenance.verifiedAt !== null;
}

/**
 * The effective confidence to PUBLISH for a pipeline field, given its provenance.
 * Unverified ⇒ the bottom tier, no exceptions. Verified ⇒ the caller MAY promote
 * (this returns the requested `promoteTo` only if `canGraduateTier` allows it,
 * else clamps back to the pipeline tier). The single place a producer resolves
 * "what tier does this ship at".
 */
export function resolvePublishedConfidence(
    provenance: Pick<ExtractionProvenance, 'humanVerifiedBy' | 'verifiedAt'>,
    promoteTo: EnvelopeConfidence = PIPELINE_TIER,
): EnvelopeConfidence {
    return canGraduateTier(PIPELINE_TIER, promoteTo, provenance) ? promoteTo : PIPELINE_TIER;
}
