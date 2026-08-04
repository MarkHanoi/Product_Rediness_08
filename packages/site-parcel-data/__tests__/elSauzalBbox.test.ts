import { describe, expect, it } from 'vitest';
import { EL_SAUZAL_BBOX, EL_SAUZAL_INE_CODE, isInElSauzal } from '../src/providers/elSauzalBbox.js';

describe('isInElSauzal', () => {
    it('accepts a real point inside the municipality (a RE-ViUf-1 polygon centroid)', () => {
        expect(isInElSauzal(28.479513090001998, -16.439655457879716)).toBe(true);
    });

    it('rejects a point far outside (Madrid)', () => {
        expect(isInElSauzal(40.0, -3.7)).toBe(false);
    });

    it('rejects non-finite input rather than throwing', () => {
        expect(isInElSauzal(NaN, -16.4)).toBe(false);
        expect(isInElSauzal(28.45, NaN)).toBe(false);
    });

    it('is bounded exactly by EL_SAUZAL_BBOX (edge-inclusive)', () => {
        expect(isInElSauzal(EL_SAUZAL_BBOX.minLat, EL_SAUZAL_BBOX.minLon)).toBe(true);
        expect(isInElSauzal(EL_SAUZAL_BBOX.maxLat, EL_SAUZAL_BBOX.maxLon)).toBe(true);
        expect(isInElSauzal(EL_SAUZAL_BBOX.minLat - 0.01, EL_SAUZAL_BBOX.minLon)).toBe(false);
    });
});

describe('EL_SAUZAL_INE_CODE', () => {
    it('is the INE municipal code for El Sauzal', () => {
        expect(EL_SAUZAL_INE_CODE).toBe('38041');
    });
});
