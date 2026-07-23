import { describe, expect, it } from 'vitest';
import {
    confidenceRank,
    isStrongerThan,
    canGraduateTier,
    resolvePublishedConfidence,
    PIPELINE_TIER,
} from '../src/confidence.js';

const unverified = { humanVerifiedBy: null, verifiedAt: null };
const verified = { humanVerifiedBy: 'planner@pryzm', verifiedAt: '2026-07-23T10:00:00Z' };

describe('confidence ladder', () => {
    it('places pipeline-extracted-unverified strictly below estimated-ruleset', () => {
        expect(confidenceRank('pipeline-extracted-unverified')).toBeLessThan(
            confidenceRank('estimated-ruleset'),
        );
    });

    it('places it above only not-determined', () => {
        expect(confidenceRank('pipeline-extracted-unverified')).toBe(1);
        expect(confidenceRank('not-determined')).toBe(0);
    });

    it('keeps authoritative at the top', () => {
        expect(isStrongerThan('authoritative', 'pipeline-extracted-unverified')).toBe(true);
        expect(isStrongerThan('pipeline-extracted-unverified', 'structured')).toBe(false);
    });
});

describe('canGraduateTier — LOCK 3 (no silent graduation)', () => {
    it('BLOCKS rising above the pipeline tier without a human sign-off', () => {
        expect(canGraduateTier(PIPELINE_TIER, 'estimated-ruleset', unverified)).toBe(false);
        expect(canGraduateTier(PIPELINE_TIER, 'structured', unverified)).toBe(false);
        expect(canGraduateTier(PIPELINE_TIER, 'authoritative', unverified)).toBe(false);
    });

    it('ALLOWS rising once a human has verified', () => {
        expect(canGraduateTier(PIPELINE_TIER, 'structured', verified)).toBe(true);
    });

    it('allows staying at, or dropping below, the pipeline tier unconditionally', () => {
        expect(canGraduateTier(PIPELINE_TIER, PIPELINE_TIER, unverified)).toBe(true);
        expect(canGraduateTier(PIPELINE_TIER, 'not-determined', unverified)).toBe(true);
    });

    it('does not police a field that was never at the pipeline tier', () => {
        expect(canGraduateTier('estimated-ruleset', 'authoritative', unverified)).toBe(true);
    });

    it('requires BOTH humanVerifiedBy and verifiedAt', () => {
        expect(
            canGraduateTier(PIPELINE_TIER, 'structured', {
                humanVerifiedBy: 'x',
                verifiedAt: null,
            }),
        ).toBe(false);
    });
});

describe('resolvePublishedConfidence', () => {
    it('clamps an unverified field to the pipeline tier even if asked to promote', () => {
        expect(resolvePublishedConfidence(unverified, 'structured')).toBe(PIPELINE_TIER);
    });
    it('honours a promotion once verified', () => {
        expect(resolvePublishedConfidence(verified, 'structured')).toBe('structured');
    });
    it('defaults to the pipeline tier', () => {
        expect(resolvePublishedConfidence(unverified)).toBe(PIPELINE_TIER);
    });
});
