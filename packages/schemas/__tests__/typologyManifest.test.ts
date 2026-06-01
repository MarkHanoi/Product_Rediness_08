// A.2 (Phase A · Sprint 1) — L0 TypologyManifest substrate tests.
//
// Validates the manifest schema + helpers used by every typology pack
// (apartment · house · small-office in Phase A; 22 more later phases).
//
// Strategic context: docs/03-execution/plans/typology-expansion-roadmap.md §4.1.

import { describe, expect, it } from 'vitest';
import {
    TypologyManifestSchema,
    TYPOLOGY_ID_PATTERN,
    TYPOLOGY_VERSION_PATTERN,
    assertTypologyId,
    manifestHasEntry,
    type TypologyManifest,
} from '../src/typology/manifest.js';

// ─────────────────────────────────────────────────────────────────────────────
// A canonical valid manifest used as the baseline for invariants.
//
// Models the apartment-typology pack PRYZM ships at Phase A — every other
// pack manifest in Phase A (house · small-office) extends from this shape.
// ─────────────────────────────────────────────────────────────────────────────
const VALID: TypologyManifest = {
    id: 'apartment',
    displayName: 'Apartment',
    category: 'residential',
    version: '1.0.0',
    description:
        'Residential apartment unit. 14 room types · adjacency + privacy gradient · D-TGL deterministic layout fallback.',
    thumbnail: 'thumb.webp',
    author: 'PRYZM',
    requiredPlanTier: 'solo',
    cognitionLayers: [
        'L1-environmental',
        'L2-spatial-hierarchy',
        'L3-semantic-topology',
        'L4-compositional-geometry',
        'L7-typology-priors',
    ],
    aiWorkflowEntry: 'workflow.js',
    deterministicEngineEntry: 'det/run-deterministic-layout.js',
    programRulesEntry: 'program-rules.json',
    roomTypes: [
        'living',
        'kitchen',
        'dining',
        'master',
        'bedroom',
        'bathroom',
        'ensuite',
        'wc',
        'corridor',
        'hall',
        'study',
        'utility',
    ],
    defaultDrawingStandard: 'RIBA',
    phaseGate: 'alpha',
};

describe('TypologyManifestSchema', () => {
    it('accepts a canonical valid apartment manifest', () => {
        const parsed = TypologyManifestSchema.parse(VALID);
        expect(parsed.id).toBe('apartment');
        expect(parsed.requiredPlanTier).toBe('solo');
        expect(parsed.cognitionLayers).toHaveLength(5);
    });

    // ── id slug pattern ─────────────────────────────────────────────────────
    describe('id slug pattern', () => {
        it('accepts lowercase-kebab-case ids', () => {
            for (const id of [
                'apartment',
                'house',
                'small-office',
                'gym',
                'co-living',
                'car-park',
                'gp-clinic',
                'restaurant-cafe',
            ]) {
                expect(() =>
                    TypologyManifestSchema.parse({ ...VALID, id }),
                ).not.toThrow();
            }
        });

        it.each([
            'Apartment',         // uppercase
            '1apartment',        // starts with digit
            'apartment-',        // ends with hyphen
            'a',                 // too short (under 3 chars)
            'ap',                // 2 chars — too short
            'small_office',      // underscore (not kebab)
            'small office',      // space
            'small/office',      // slash
        ])('rejects invalid id slug %s', (invalid) => {
            expect(() =>
                TypologyManifestSchema.parse({ ...VALID, id: invalid }),
            ).toThrow();
        });
    });

    // ── version semver ──────────────────────────────────────────────────────
    describe('version semver', () => {
        it('accepts MAJOR.MINOR.PATCH', () => {
            for (const version of ['1.0.0', '0.1.0', '12.34.56', '999.0.0']) {
                expect(() =>
                    TypologyManifestSchema.parse({ ...VALID, version }),
                ).not.toThrow();
            }
        });

        it.each([
            '1.0',
            '1.0.0-rc.1',     // pre-release suffix forbidden
            '1.0.0+build.123', // build metadata forbidden
            'v1.0.0',          // 'v' prefix forbidden
            '1',
            '',
        ])('rejects invalid version %s', (invalid) => {
            expect(() =>
                TypologyManifestSchema.parse({ ...VALID, version: invalid }),
            ).toThrow();
        });
    });

    // ── category enum ───────────────────────────────────────────────────────
    it('rejects unknown category', () => {
        expect(() =>
            TypologyManifestSchema.parse({
                ...VALID,
                category: 'agriculture' as unknown,
            }),
        ).toThrow();
    });

    // ── cognition layers ────────────────────────────────────────────────────
    it('requires at least one cognition layer', () => {
        expect(() =>
            TypologyManifestSchema.parse({ ...VALID, cognitionLayers: [] }),
        ).toThrow();
    });

    it('rejects unknown cognition layer', () => {
        expect(() =>
            TypologyManifestSchema.parse({
                ...VALID,
                cognitionLayers: ['L8-emergent-behaviour' as unknown],
            }),
        ).toThrow();
    });

    // ── roomTypes ───────────────────────────────────────────────────────────
    it('requires at least one roomType', () => {
        expect(() =>
            TypologyManifestSchema.parse({ ...VALID, roomTypes: [] }),
        ).toThrow();
    });

    // ── thumbnail ───────────────────────────────────────────────────────────
    it('requires non-empty thumbnail path', () => {
        expect(() =>
            TypologyManifestSchema.parse({ ...VALID, thumbnail: '' }),
        ).toThrow();
    });

    // ── description bounds ──────────────────────────────────────────────────
    it('rejects description over 300 chars', () => {
        expect(() =>
            TypologyManifestSchema.parse({
                ...VALID,
                description: 'x'.repeat(301),
            }),
        ).toThrow();
    });

    // ── plan tier default ───────────────────────────────────────────────────
    it('defaults requiredPlanTier to solo when omitted', () => {
        const { requiredPlanTier: _, ...rest } = VALID;
        const parsed = TypologyManifestSchema.parse(rest);
        expect(parsed.requiredPlanTier).toBe('solo');
    });

    // ── phaseGate default ───────────────────────────────────────────────────
    it('defaults phaseGate to alpha when omitted', () => {
        const { phaseGate: _, ...rest } = VALID;
        const parsed = TypologyManifestSchema.parse(rest);
        expect(parsed.phaseGate).toBe('alpha');
    });

    // ── Ed25519 signature ───────────────────────────────────────────────────
    describe('signature', () => {
        it('is optional (dev-mode unsigned packs allowed)', () => {
            const parsed = TypologyManifestSchema.parse(VALID);
            expect(parsed.signature).toBeUndefined();
        });

        it('accepts a base64-formatted Ed25519 signature', () => {
            const validSignature =
                'YmFzZTY0ZW5jb2RlZHNpZ25hdHVyZWJ5dGVzZ29oZXJlYWFhYWFhYWFhYWE=:YmFzZTY0ZW5jb2RlZHB1YmtleQ==';
            expect(() =>
                TypologyManifestSchema.parse({
                    ...VALID,
                    signature: validSignature,
                }),
            ).not.toThrow();
        });

        it('rejects malformed signature', () => {
            expect(() =>
                TypologyManifestSchema.parse({
                    ...VALID,
                    signature: 'not-a-signature',
                }),
            ).toThrow();
        });
    });

    // ── marketplace listing ─────────────────────────────────────────────────
    describe('marketplaceListing', () => {
        it('is optional for PRYZM-first-party packs', () => {
            const parsed = TypologyManifestSchema.parse(VALID);
            expect(parsed.marketplaceListing).toBeUndefined();
        });

        it('accepts a valid listing', () => {
            const listing = {
                publisherId: 'dev-org-12345',
                publishedAt: '2026-09-15T10:00:00.000Z',
                listingPath: '/marketplace/typology/apartment',
                pricing: {
                    model: 'one-time' as const,
                    amountCents: 4900,
                    currency: 'USD',
                },
                averageRating: 4.7,
                reviewCount: 23,
            };
            expect(() =>
                TypologyManifestSchema.parse({
                    ...VALID,
                    marketplaceListing: listing,
                }),
            ).not.toThrow();
        });

        it('rejects rating > 5', () => {
            const listing = {
                publisherId: 'dev-org-12345',
                publishedAt: '2026-09-15T10:00:00.000Z',
                listingPath: '/marketplace/typology/apartment',
                pricing: { model: 'free' as const },
                averageRating: 6,
                reviewCount: 0,
            };
            expect(() =>
                TypologyManifestSchema.parse({
                    ...VALID,
                    marketplaceListing: listing,
                }),
            ).toThrow();
        });
    });
});

describe('manifestHasEntry', () => {
    it('returns true when both entries present', () => {
        expect(manifestHasEntry(VALID)).toBe(true);
    });

    it('returns true when only aiWorkflowEntry present', () => {
        const manifest = TypologyManifestSchema.parse({
            ...VALID,
            deterministicEngineEntry: undefined,
        });
        expect(manifestHasEntry(manifest)).toBe(true);
    });

    it('returns true when only deterministicEngineEntry present', () => {
        const manifest = TypologyManifestSchema.parse({
            ...VALID,
            aiWorkflowEntry: undefined,
        });
        expect(manifestHasEntry(manifest)).toBe(true);
    });

    it('returns false when both absent', () => {
        const manifest = TypologyManifestSchema.parse({
            ...VALID,
            aiWorkflowEntry: undefined,
            deterministicEngineEntry: undefined,
        });
        expect(manifestHasEntry(manifest)).toBe(false);
    });
});

describe('assertTypologyId', () => {
    it('returns branded id for valid slugs', () => {
        const id = assertTypologyId('apartment');
        expect(id).toBe('apartment');
    });

    it('throws for invalid slugs', () => {
        expect(() => assertTypologyId('Apartment')).toThrow(/Invalid TypologyId/);
        expect(() => assertTypologyId('a')).toThrow();
        expect(() => assertTypologyId('1apartment')).toThrow();
    });
});

describe('exported constants', () => {
    it('TYPOLOGY_ID_PATTERN matches the documented slug shape', () => {
        expect(TYPOLOGY_ID_PATTERN.test('apartment')).toBe(true);
        expect(TYPOLOGY_ID_PATTERN.test('small-office')).toBe(true);
        expect(TYPOLOGY_ID_PATTERN.test('Apartment')).toBe(false);
    });

    it('TYPOLOGY_VERSION_PATTERN matches strict MAJOR.MINOR.PATCH', () => {
        expect(TYPOLOGY_VERSION_PATTERN.test('1.0.0')).toBe(true);
        expect(TYPOLOGY_VERSION_PATTERN.test('1.0.0-rc.1')).toBe(false);
    });
});
