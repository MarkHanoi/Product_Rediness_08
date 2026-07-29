// C62 (DRAFT — ADR-0280) — Data-Confidence / Provenance / Unknown-Reason model tests.
//
// The load-bearing assertions: the honesty vocabulary is a CLOSED set (a fabricated token is
// rejected), an unknown value is `null` PLUS a typed reason (never a guessed 0), the enums are
// ordered as their semantics require, and the generic `metadataEnvelope` factory wraps any value
// schema. Mirrors the shape of `heightProfile.test.ts`.

import { describe, expect, it } from 'vitest';
import {
    UnknownReasonSchema,
    AuthorityRankSchema,
    ValidationStateSchema,
    SourceProvenanceSchema,
    DomainConfidenceSchema,
    metadataEnvelope,
    unknownEnvelope,
    authorityOutranks,
    AUTHORITY_RANK_ORDER,
    type MetadataEnvelope,
} from '../src/site/metadata/DataConfidence.js';
import { z } from 'zod';

describe('UnknownReason — closed typed refusal vocabulary', () => {
    it('covers exactly the seven honesty reasons', () => {
        expect(UnknownReasonSchema.options).toEqual([
            'authority-does-not-publish',
            'not-queried',
            'outside-coverage',
            'adapter-limitation',
            'license-restriction',
            'geometry-incomplete',
            'pending-implementation',
        ]);
    });
    it('REJECTS an un-typed / fabricated reason (no silent escape hatch)', () => {
        expect(UnknownReasonSchema.safeParse('dunno').success).toBe(false);
    });
});

describe('AuthorityRank — ordered strongest-first + reconciliation', () => {
    it('is ordered national-cadastre … user', () => {
        expect(AuthorityRankSchema.options).toEqual([
            'national-cadastre', 'regional-gis', 'inspire', 'osm', 'generated', 'user',
        ]);
        expect(AUTHORITY_RANK_ORDER[0]).toBe('national-cadastre');
    });
    it('authorityOutranks: a stronger source beats a weaker one, ties do not win', () => {
        expect(authorityOutranks('national-cadastre', 'osm')).toBe(true);
        expect(authorityOutranks('osm', 'national-cadastre')).toBe(false);
        expect(authorityOutranks('generated', 'generated')).toBe(false);
        expect(authorityOutranks('inspire', 'user')).toBe(true);
    });
});

describe('ValidationState — distinct axis, ordered weakest-first', () => {
    it('covers the five states', () => {
        expect(ValidationStateSchema.options).toEqual([
            'not-checked', 'auto-validated', 'cross-validated', 'human-reviewed', 'authority-confirmed',
        ]);
    });
});

describe('DomainConfidence — the per-domain supertype', () => {
    it('accepts a domain tier + null score (unknown never coerced to 0) and defaults validationState', () => {
        const parsed = DomainConfidenceSchema.parse({ tier: 'high', authorityRank: 'national-cadastre' });
        expect(parsed.tier).toBe('high');
        expect(parsed.score).toBeNull();
        expect(parsed.validationState).toBe('not-checked');
    });
    it('accepts an envelope-style tier string (any domain vocabulary lives in `tier`)', () => {
        expect(DomainConfidenceSchema.safeParse({ tier: 'block-constructed', score: 0.8 }).success).toBe(true);
    });
    it('REJECTS a score outside 0..1', () => {
        expect(DomainConfidenceSchema.safeParse({ score: 1.4 }).success).toBe(false);
        expect(DomainConfidenceSchema.safeParse({ score: -0.2 }).success).toBe(false);
    });
    it('REJECTS an unknownReason that is not in the closed set', () => {
        expect(DomainConfidenceSchema.safeParse({ unknownReason: 'maybe' }).success).toBe(false);
    });
});

describe('SourceProvenance — structured supertype of the source-string tag', () => {
    it('accepts a minimal source tag and defaults the optional fields to null', () => {
        const parsed = SourceProvenanceSchema.parse({ source: 'catastro' });
        expect(parsed.source).toBe('catastro');
        expect(parsed.sourceVersion).toBeNull();
        expect(parsed.retrievedAt).toBeNull();
        expect(parsed.license).toBeNull();
    });
    it('REJECTS an empty source', () => {
        expect(SourceProvenanceSchema.safeParse({ source: '' }).success).toBe(false);
    });
});

describe('metadataEnvelope — the generic wrapper factory', () => {
    const AreaEnvelope = metadataEnvelope(z.number());

    it('wraps a present value with provenance + confidence', () => {
        const ok = AreaEnvelope.parse({
            value: 412.5,
            provenance: { source: 'catastro', authorityRank: 'national-cadastre' },
            confidence: 0.95,
            authorityRank: 'national-cadastre',
            validationState: 'cross-validated',
        });
        expect(ok.value).toBe(412.5);
        expect(ok.provenance?.source).toBe('catastro');
    });

    it('accepts a null value carrying a typed unknownReason (the honesty case)', () => {
        const unknown = AreaEnvelope.parse({ value: null, unknownReason: 'authority-does-not-publish' });
        expect(unknown.value).toBeNull();
        expect(unknown.unknownReason).toBe('authority-does-not-publish');
    });

    it('REJECTS a wrapped value of the wrong type', () => {
        expect(AreaEnvelope.safeParse({ value: 'not-a-number' }).success).toBe(false);
    });

    it('REJECTS a confidence outside 0..1', () => {
        expect(AreaEnvelope.safeParse({ value: 1, confidence: 2 }).success).toBe(false);
    });

    it('wraps a non-numeric value schema too (fully generic)', () => {
        const RingEnvelope = metadataEnvelope(z.array(z.tuple([z.number(), z.number()])));
        expect(RingEnvelope.safeParse({ value: [[0, 0], [1, 0], [1, 1]] }).success).toBe(true);
    });
});

describe('unknownEnvelope — one-liner honest unknown', () => {
    it('produces value:null + the typed reason, nothing fabricated', () => {
        const env: MetadataEnvelope<number> = unknownEnvelope('not-queried');
        expect(env.value).toBeNull();
        expect(env.unknownReason).toBe('not-queried');
        expect(env.confidence).toBeUndefined();
    });
});
