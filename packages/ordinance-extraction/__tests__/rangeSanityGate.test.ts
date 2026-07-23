import { describe, expect, it } from 'vitest';
import { rangeSanityGate, DEFAULT_FIELD_BOUNDS } from '../src/gates/rangeSanityGate.js';

describe('rangeSanityGate', () => {
    it('passes a plausible FAR (Córdoba OA-2 = 1.6)', () => {
        expect(rangeSanityGate('maxFAR', 1.6).verdict).toBe('pass');
    });

    it('flags a FAR below the [0.2, 3.0] band', () => {
        expect(rangeSanityGate('maxFAR', 0.05).verdict).toBe('flag');
    });

    it('flags a FAR above the band', () => {
        expect(rangeSanityGate('maxFAR', 12).verdict).toBe('flag');
    });

    it('flags the locale-bug downstream: parcela mínima read as 2.0 m²', () => {
        // '2.000' → 2.0 falls below the [10, 100000] min-parcel band.
        expect(rangeSanityGate('minParcelArea_m2', 2).verdict).toBe('flag');
        expect(rangeSanityGate('minParcelArea_m2', 2000).verdict).toBe('pass');
    });

    it('passes a plausible height and flags a decimal-shifted one', () => {
        expect(rangeSanityGate('maxHeight_m', 12.5).verdict).toBe('pass');
        expect(rangeSanityGate('maxHeight_m', 1.25).verdict).toBe('flag'); // shifted
        expect(rangeSanityGate('maxHeight_m', 1250).verdict).toBe('flag');
    });

    it('bounds coverage to [0, 1]', () => {
        expect(rangeSanityGate('maxCoverage', 0.4).verdict).toBe('pass');
        expect(rangeSanityGate('maxCoverage', 40).verdict).toBe('flag'); // 40% read as 40
    });

    it('is not-applicable for a null value (algorithm/absent)', () => {
        expect(rangeSanityGate('maxFAR', null).verdict).toBe('not-applicable');
    });

    it('honours a per-jurisdiction bounds override', () => {
        expect(rangeSanityGate('maxHeight_m', 200).verdict).toBe('flag');
        expect(
            rangeSanityGate('maxHeight_m', 200, { maxHeight_m: { min: 3, max: 300 } }).verdict,
        ).toBe('pass');
    });

    it('exposes the documented default bands', () => {
        expect(DEFAULT_FIELD_BOUNDS.maxFAR).toEqual({ min: 0.2, max: 3.0 });
        expect(DEFAULT_FIELD_BOUNDS.maxCoverage).toEqual({ min: 0, max: 1 });
    });
});
