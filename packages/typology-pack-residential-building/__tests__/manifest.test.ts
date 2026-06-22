// Residential building — Slice 0 / P1.A — manifest acceptance test.
import { describe, expect, it } from 'vitest';
import { TypologyManifestSchema, manifestHasEntry } from '@pryzm/schemas';
import { RESIDENTIAL_BUILDING_MANIFEST } from '../src/manifest.js';

describe('RESIDENTIAL_BUILDING_MANIFEST', () => {
    it('validates against the C50 TypologyManifest schema', () => {
        expect(() => TypologyManifestSchema.parse(RESIDENTIAL_BUILDING_MANIFEST)).not.toThrow();
    });

    it('has the canonical id + residential category', () => {
        expect(RESIDENTIAL_BUILDING_MANIFEST.id).toBe('residential-building');
        expect(RESIDENTIAL_BUILDING_MANIFEST.category).toBe('residential');
    });

    it('declares at least one generative entry (C50 requirement)', () => {
        expect(manifestHasEntry(RESIDENTIAL_BUILDING_MANIFEST)).toBe(true);
    });

    it('declares the §5.1 input model in its briefSchema', () => {
        const ids = (RESIDENTIAL_BUILDING_MANIFEST.briefSchema?.fields ?? []).map((f) => f.id);
        expect(ids).toEqual(
            expect.arrayContaining([
                'minApartmentAreaM2',
                'maxApartmentAreaM2',
                'typologies',
                'levels',
                'commercialGroundFloor',
            ]),
        );
    });

    it('caps levels at 1..20 (the brief stepper)', () => {
        const levels = RESIDENTIAL_BUILDING_MANIFEST.briefSchema?.fields.find(
            (f) => f.id === 'levels',
        );
        expect(levels?.kind).toBe('stepper');
        if (levels?.kind === 'stepper') {
            expect(levels.min).toBe(1);
            expect(levels.max).toBe(20);
        }
    });

    it('offers T1-T4 as a multiselect (mix allowed)', () => {
        const typ = RESIDENTIAL_BUILDING_MANIFEST.briefSchema?.fields.find(
            (f) => f.id === 'typologies',
        );
        expect(typ?.kind).toBe('multiselect');
        if (typ?.kind === 'multiselect') {
            expect(typ.options.map((o) => o.value)).toEqual(['T1', 'T2', 'T3', 'T4']);
        }
    });
});
