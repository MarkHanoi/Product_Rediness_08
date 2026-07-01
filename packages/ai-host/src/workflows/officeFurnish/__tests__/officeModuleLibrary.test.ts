// Office furnish — Phase-1 seam tests (SPEC-OFFICE-GENERATION-ENGINE §5/§8).
//
// Pins the occupancy estimator that SPEC §8 uses to scale everything (desks · meeting rooms ·
// phone booths · toilets · kitchen size · collaboration areas · lockers). Pure — node env is fine.

import { describe, it, expect } from 'vitest';
import { estimateOccupancy } from '../officeModuleLibrary.js';

describe('§8 estimateOccupancy', () => {
    it('estimates ~1 occupant per 10 m² usable by default', () => {
        expect(estimateOccupancy(1000)).toBe(100);
        expect(estimateOccupancy(150)).toBe(15);
    });
    it('scales monotonically with usable area', () => {
        expect(estimateOccupancy(2000)).toBeGreaterThan(estimateOccupancy(1000));
    });
    it('respects a custom density and degrades to 0 on bad input', () => {
        expect(estimateOccupancy(1000, 20)).toBe(50);
        expect(estimateOccupancy(0)).toBe(0);
        expect(estimateOccupancy(-5)).toBe(0);
        expect(estimateOccupancy(100, 0)).toBe(0);
    });
});
