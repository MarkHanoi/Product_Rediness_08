// C58 §1.6 / L-590f §6 — the pipeline-extracted confidence tier + the typed
// per-value ExtractionProvenance the horizontal ordinance-extraction pipeline
// retains.
//
// These lock the SCHEMA half of "a pipeline-extracted-unverified value can never
// render as certified": lock 1 is the distinct enum value asserted here. Locks 2
// (CI label gate) and 3 (no-silent-graduation) live in @pryzm/ordinance-extraction.
//
// Strategic context — docs/04-reference/ORDINANCE-EXTRACTION-PIPELINE.md §3.

import { describe, expect, it } from 'vitest';
import {
    FieldProvenanceSchema,
    EnvelopeConfidenceSchema,
    RulePackDefaultConfidenceSchema,
    ExtractionProvenanceSchema,
    SupersessionStatusSchema,
} from '../src/site/zoning/index.js';

describe('pipeline-extracted provenance + confidence tier', () => {
    it('FieldProvenanceSchema accepts the machine tier, distinct from ordinance-pdf', () => {
        expect(FieldProvenanceSchema.parse('pipeline-extracted')).toBe('pipeline-extracted');
        expect(FieldProvenanceSchema.parse('ordinance-pdf')).toBe('ordinance-pdf');
    });

    it('FieldProvenanceSchema still accepts the pre-existing values', () => {
        for (const v of ['published-structured', 'ordinance-pdf', 'estimated'] as const) {
            expect(FieldProvenanceSchema.parse(v)).toBe(v);
        }
    });

    it('FieldProvenanceSchema rejects unknown provenance', () => {
        expect(() => FieldProvenanceSchema.parse('guessed')).toThrow();
    });

    it('EnvelopeConfidenceSchema accepts the new permanent bottom tier', () => {
        expect(EnvelopeConfidenceSchema.parse('pipeline-extracted-unverified')).toBe(
            'pipeline-extracted-unverified',
        );
    });

    it('EnvelopeConfidenceSchema keeps every prior tier', () => {
        for (const v of [
            'authoritative',
            'structured',
            'block-constructed',
            'estimated-ruleset',
            'not-determined',
        ] as const) {
            expect(EnvelopeConfidenceSchema.parse(v)).toBe(v);
        }
    });

    it('RulePackDefaultConfidenceSchema lets a pipeline-seeded pack default to the bottom tier', () => {
        expect(RulePackDefaultConfidenceSchema.parse('pipeline-extracted-unverified')).toBe(
            'pipeline-extracted-unverified',
        );
        expect(RulePackDefaultConfidenceSchema.parse('structured')).toBe('structured');
        expect(RulePackDefaultConfidenceSchema.parse('estimated-ruleset')).toBe('estimated-ruleset');
    });

    it('RulePackDefaultConfidenceSchema rejects a certified tier — a pack cannot self-certify', () => {
        expect(() => RulePackDefaultConfidenceSchema.parse('authoritative')).toThrow();
        expect(() => RulePackDefaultConfidenceSchema.parse('block-constructed')).toThrow();
    });
});

describe('SupersessionStatusSchema', () => {
    it('accepts every Stage-0 verdict', () => {
        for (const v of ['vigent', 'derogated', 'under-appeal', 'unknown'] as const) {
            expect(SupersessionStatusSchema.parse(v)).toBe(v);
        }
    });

    it('rejects an unknown verdict', () => {
        expect(() => SupersessionStatusSchema.parse('maybe')).toThrow();
    });
});

describe('ExtractionProvenanceSchema', () => {
    const base = {
        documentId: '73609',
        page: 7,
        cropRef: 'crops/bcn/73609/p7/can-figuerola-row-e.png',
        ordinanceRef: 'PP Can Figuerola (1968) · Datos y coeficientes',
        extractionModel: 'vision-model@2026-07',
        promptHash: 'sha256:deadbeef',
        dualPassAgreed: true,
        crossChecks: ['arithmetic:ok', 'range:ok'],
        supersededCheck: 'vigent' as const,
    };

    it('parses a full record and defaults humanVerifiedBy / verifiedAt to null', () => {
        const p = ExtractionProvenanceSchema.parse(base);
        expect(p.humanVerifiedBy).toBeNull();
        expect(p.verifiedAt).toBeNull();
        expect(p.crossChecks).toEqual(['arithmetic:ok', 'range:ok']);
    });

    it('defaults crossChecks to an empty array when omitted', () => {
        const { crossChecks: _omit, ...withoutChecks } = base;
        void _omit;
        expect(ExtractionProvenanceSchema.parse(withoutChecks).crossChecks).toEqual([]);
    });

    it('accepts a verified record (the graduation door)', () => {
        const p = ExtractionProvenanceSchema.parse({
            ...base,
            humanVerifiedBy: 'planner@pryzm',
            verifiedAt: '2026-07-23T10:00:00Z',
        });
        expect(p.humanVerifiedBy).toBe('planner@pryzm');
        expect(p.verifiedAt).toBe('2026-07-23T10:00:00Z');
    });

    it('requires a non-empty cropRef — a value with no crop cannot be verified', () => {
        expect(() => ExtractionProvenanceSchema.parse({ ...base, cropRef: '' })).toThrow();
    });

    it('requires a non-empty ordinanceRef and documentId', () => {
        expect(() => ExtractionProvenanceSchema.parse({ ...base, ordinanceRef: '' })).toThrow();
        expect(() => ExtractionProvenanceSchema.parse({ ...base, documentId: '' })).toThrow();
    });

    it('rejects a negative or fractional page', () => {
        expect(() => ExtractionProvenanceSchema.parse({ ...base, page: -1 })).toThrow();
        expect(() => ExtractionProvenanceSchema.parse({ ...base, page: 1.5 })).toThrow();
    });
});
