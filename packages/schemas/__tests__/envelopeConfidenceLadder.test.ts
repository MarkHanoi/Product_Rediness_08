// L-664 — §ENVELOPE-CONFIDENCE-LADDER: ONE confidence ontology, contract → schema → scorecard.
//
// These tests bind the two claims the L-664 fix rests on:
//   A. The ladder (`ENVELOPE_CONFIDENCE_ORDER`) is a PERMUTATION of `EnvelopeConfidenceSchema` —
//      total in both directions. Adding a tier to the enum without placing it on the ladder fails
//      here, so the ordering can never silently omit a member.
//   B. The ENVELOPE-axis weight map is EXHAUSTIVE over that vocabulary with NO default branch, and
//      is MONOTONE in the ladder. A stronger determination can never score lower than a weaker one.
//
// Both are the "fix the ruler before expanding coverage" invariant: a scorecard axis that cannot be
// scored for every tier its own schema can produce is not a ruler.

import { describe, it, expect } from 'vitest';
import {
    EnvelopeConfidenceSchema,
    ENVELOPE_CONFIDENCE_ORDER,
    envelopeConfidenceRank,
    isStrongerEnvelopeConfidence,
    type EnvelopeConfidence,
} from '../src/site/zoning/ProvenanceFlags.js';
import {
    ENVELOPE_AXIS_TIER_WEIGHT,
    ENVELOPE_AXIS_TIER_WEIGHT_VERSION,
    ENVELOPE_COVERAGE_TIERS,
    ENVELOPE_NO_PACK,
    envelopeAxisTierWeight,
    envelopeAxisScore,
    type EnvelopeCoverageTier,
} from '../src/site/completion/EnvelopeAxisWeight.js';

const ENUM_VALUES = EnvelopeConfidenceSchema.options as readonly EnvelopeConfidence[];

describe('ENVELOPE_CONFIDENCE_ORDER — the single ordered ladder (C58 §1.2 / C63 §3.2)', () => {
    it('is a PERMUTATION of EnvelopeConfidenceSchema — total in both directions', () => {
        expect([...ENVELOPE_CONFIDENCE_ORDER].sort()).toEqual([...ENUM_VALUES].sort());
        expect(ENVELOPE_CONFIDENCE_ORDER).toHaveLength(ENUM_VALUES.length);
        expect(new Set(ENVELOPE_CONFIDENCE_ORDER).size).toBe(ENVELOPE_CONFIDENCE_ORDER.length);
    });

    it('ranks every enum member to a distinct, non-negative index', () => {
        const ranks = ENUM_VALUES.map(envelopeConfidenceRank);
        expect(ranks.every((r) => r >= 0)).toBe(true);
        expect(new Set(ranks).size).toBe(ENUM_VALUES.length);
    });

    it('encodes the four NORMATIVE orderings the vocabulary exists to express', () => {
        // published ≠ determined — the distinction the contract's single `certified` name destroyed.
        expect(isStrongerEnvelopeConfidence('authoritative', 'structured')).toBe(true);
        // a constructed determination ranks below numbers the authority published as data.
        expect(isStrongerEnvelopeConfidence('structured', 'block-constructed')).toBe(true);
        // a constructed determination outranks a curated estimate (L-518/L-572).
        expect(isStrongerEnvelopeConfidence('block-constructed', 'estimated-ruleset')).toBe(true);
        // an unchecked machine read can never out-rank a curated human estimate (L-590f §6).
        expect(isStrongerEnvelopeConfidence('estimated-ruleset', 'pipeline-extracted-unverified')).toBe(true);
        // the deliberate ABSENCE of a determination sits at the bottom.
        expect(isStrongerEnvelopeConfidence('pipeline-extracted-unverified', 'not-determined')).toBe(true);
    });

    it('is a strict order: never stronger than itself, and antisymmetric', () => {
        for (const a of ENUM_VALUES) {
            expect(isStrongerEnvelopeConfidence(a, a)).toBe(false);
            for (const b of ENUM_VALUES) {
                if (a === b) continue;
                expect(isStrongerEnvelopeConfidence(a, b)).toBe(!isStrongerEnvelopeConfidence(b, a));
            }
        }
    });

    it('does NOT admit the contract\'s historic names — they were never schema members', () => {
        // L-664: `certified` / `constructed-amber` are recorded in C63 §3.2 PROSE only. A runtime
        // alias would be the "invent a mapping to paper over the mismatch" move that was forbidden.
        expect(EnvelopeConfidenceSchema.safeParse('certified').success).toBe(false);
        expect(EnvelopeConfidenceSchema.safeParse('constructed-amber').success).toBe(false);
        expect(ENVELOPE_CONFIDENCE_ORDER as readonly string[]).not.toContain('certified');
        expect(ENVELOPE_CONFIDENCE_ORDER as readonly string[]).not.toContain('constructed-amber');
    });
});

describe('ENVELOPE_AXIS_TIER_WEIGHT — exhaustive, no default branch (C63 §3 Axis 4 / §3.2)', () => {
    it('covers EVERY EnvelopeConfidence plus the `no-pack` sentinel, and nothing else', () => {
        const mapped = Object.keys(ENVELOPE_AXIS_TIER_WEIGHT).sort();
        const expected = [...ENUM_VALUES, ENVELOPE_NO_PACK].sort();
        expect(mapped).toEqual(expected);
        expect([...ENVELOPE_COVERAGE_TIERS].sort()).toEqual(expected);
    });

    it('returns a finite weight in [0,1] for every tier — no undefined lookup, ever', () => {
        for (const t of ENVELOPE_COVERAGE_TIERS) {
            const w = envelopeAxisTierWeight(t);
            expect(Number.isFinite(w)).toBe(true);
            expect(w).toBeGreaterThanOrEqual(0);
            expect(w).toBeLessThanOrEqual(1);
        }
    });

    it('is MONOTONE non-decreasing along the ladder (stronger never scores lower)', () => {
        for (let i = 1; i < ENVELOPE_CONFIDENCE_ORDER.length; i += 1) {
            const weaker = ENVELOPE_CONFIDENCE_ORDER[i - 1];
            const stronger = ENVELOPE_CONFIDENCE_ORDER[i];
            expect(envelopeAxisTierWeight(stronger)).toBeGreaterThanOrEqual(
                envelopeAxisTierWeight(weaker),
            );
        }
    });

    it('carries the THREE weights C63 §3 had already fixed, UNCHANGED (a re-label never re-values)', () => {
        // `certified` 1.0 → `authoritative` 1.0
        expect(ENVELOPE_AXIS_TIER_WEIGHT.authoritative).toBe(1.0);
        // `constructed-amber` 0.7 → `block-constructed` 0.7
        expect(ENVELOPE_AXIS_TIER_WEIGHT['block-constructed']).toBe(0.7);
        // `cited-refusal` 0.0-for-completion → `not-determined` 0.0; `no-pack` 0.0 unchanged.
        expect(ENVELOPE_AXIS_TIER_WEIGHT['not-determined']).toBe(0);
        expect(ENVELOPE_AXIS_TIER_WEIGHT['no-pack']).toBe(0);
    });

    it('keeps `structured` STRICTLY below `authoritative` — published ≠ determined', () => {
        // The single most load-bearing consequence of rejecting the contract's vocabulary: had the
        // two collapsed into `certified` = 1.0, a published-but-undetermined DK envelope would have
        // scored a perfect ENVELOPE axis, i.e. read as a compliance fact.
        expect(ENVELOPE_AXIS_TIER_WEIGHT.structured).toBeLessThan(
            ENVELOPE_AXIS_TIER_WEIGHT.authoritative,
        );
    });

    it('keeps `pipeline-extracted-unverified` STRICTLY between nothing and a curated estimate', () => {
        expect(ENVELOPE_AXIS_TIER_WEIGHT['pipeline-extracted-unverified']).toBeGreaterThan(0);
        expect(ENVELOPE_AXIS_TIER_WEIGHT['pipeline-extracted-unverified']).toBeLessThan(
            ENVELOPE_AXIS_TIER_WEIGHT['estimated-ruleset'],
        );
    });

    it('stamps which vector produced a score (two cities are never compared across vectors)', () => {
        expect(ENVELOPE_AXIS_TIER_WEIGHT_VERSION).toMatch(/^provisional-2026-08-01-L664$/);
    });
});

describe('envelopeAxisScore — renormalised over MEASURED buildable land (C63 §1.5 / §3, L-656)', () => {
    it('returns null (never 0) when nothing was measured', () => {
        expect(envelopeAxisScore([])).toEqual({ score: null, measuredShare: 0, partial: true });
    });

    it('returns null when the supplied shares sum to zero — no NaN escapes', () => {
        const r = envelopeAxisScore([{ zoneCode: '13a', tier: 'block-constructed', buildableLandShare: 0 }]);
        expect(r.score).toBeNull();
        expect(Number.isNaN(r.score as unknown as number)).toBe(false);
    });

    it('weights each slice by its share of the BUILDABLE-land denominator', () => {
        const r = envelopeAxisScore([
            { zoneCode: '13a', tier: 'block-constructed', buildableLandShare: 0.5 }, // 0.5 × 0.7
            { zoneCode: '18', tier: 'not-determined', buildableLandShare: 0.3 },     // 0.3 × 0.0
            { zoneCode: '22a', tier: 'no-pack', buildableLandShare: 0.2 },           // 0.2 × 0.0
        ]);
        expect(r.measuredShare).toBeCloseTo(1, 12);
        expect(r.partial).toBe(false);
        expect(r.score as number).toBeCloseTo(0.35, 12);
    });

    it('RENORMALISES over the measured subset and flags partial — never zero-fills the remainder', () => {
        // Half the buildable land measured, all of it block-constructed. The honest answer is 0.7
        // over 50 % of the city — NOT 0.35 (which would silently score the unmeasured half as zero).
        const r = envelopeAxisScore([
            { zoneCode: '13a', tier: 'block-constructed', buildableLandShare: 0.5 },
        ]);
        expect(r.score as number).toBeCloseTo(0.7, 12);
        expect(r.measuredShare).toBeCloseTo(0.5, 12);
        expect(r.partial).toBe(true);
    });

    it('treats a full breakdown as complete despite float dust', () => {
        const r = envelopeAxisScore([
            { zoneCode: 'a', tier: 'authoritative', buildableLandShare: 0.271 },
            { zoneCode: 'b', tier: 'authoritative', buildableLandShare: 0.729 },
        ]);
        expect(r.partial).toBe(false);
        expect(r.score as number).toBeCloseTo(1, 12);
    });

    it('accepts an injected weight vector (re-weighting is one config edit, C63 §1.5)', () => {
        const flat = Object.fromEntries(
            ENVELOPE_COVERAGE_TIERS.map((t) => [t, 1]),
        ) as Record<EnvelopeCoverageTier, number>;
        const r = envelopeAxisScore(
            [{ zoneCode: '18', tier: 'not-determined', buildableLandShare: 1 }],
            flat,
        );
        expect(r.score as number).toBeCloseTo(1, 12);
    });
});
