// A.4.a (Phase A · Sprint 2) — Apartment manifest validation tests.

import { describe, expect, it } from 'vitest';
import { APARTMENT_MANIFEST } from '../src/manifest.js';
import { TypologyManifestSchema } from '@pryzm/schemas';

describe('APARTMENT_MANIFEST', () => {
    it('parses cleanly against TypologyManifestSchema', () => {
        // The manifest is already parsed at module load — reparse asserts
        // we can round-trip without information loss.
        expect(() => TypologyManifestSchema.parse(APARTMENT_MANIFEST)).not.toThrow();
    });

    it('has the canonical apartment id', () => {
        expect(APARTMENT_MANIFEST.id).toBe('apartment');
    });

    it('is residential category', () => {
        expect(APARTMENT_MANIFEST.category).toBe('residential');
    });

    it('ships both AI workflow + deterministic engine entries', () => {
        expect(APARTMENT_MANIFEST.aiWorkflowEntry).toBeTruthy();
        expect(APARTMENT_MANIFEST.deterministicEngineEntry).toBeTruthy();
    });

    it('declares 12 room types', () => {
        expect(APARTMENT_MANIFEST.roomTypes).toHaveLength(12);
        expect(APARTMENT_MANIFEST.roomTypes).toContain('living');
        expect(APARTMENT_MANIFEST.roomTypes).toContain('bathroom');
        expect(APARTMENT_MANIFEST.roomTypes).toContain('corridor');
    });

    it('declares the canonical 5 cognition layers (L1+L2+L3+L4+L7)', () => {
        expect(APARTMENT_MANIFEST.cognitionLayers).toEqual([
            'L1-environmental',
            'L2-spatial-hierarchy',
            'L3-semantic-topology',
            'L4-compositional-geometry',
            'L7-typology-priors',
        ]);
    });

    it('defaults to solo plan tier', () => {
        expect(APARTMENT_MANIFEST.requiredPlanTier).toBe('solo');
    });

    it('uses RIBA as default drawing standard', () => {
        expect(APARTMENT_MANIFEST.defaultDrawingStandard).toBe('RIBA');
    });

    it('phase gate is alpha (Phase A ship)', () => {
        expect(APARTMENT_MANIFEST.phaseGate).toBe('alpha');
    });
});
