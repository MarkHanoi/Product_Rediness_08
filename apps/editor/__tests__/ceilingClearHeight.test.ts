// @vitest-environment happy-dom
//
// §RESI-CEILING-CLEARHEIGHT (2026-06-25) — the finished ceiling slab must sit at the room's
// CLEAR height, NOT the structural floor-to-floor (ftf). The executor previously passed
// `level.height` (the ftf, e.g. 3.0 m) verbatim as the ceiling-height override, placing the slab
// at the full storey height. `clearCeilingHeightFromFtf` derives the clear height (ftf minus a
// service/structure zone) with sensible clamps and a realistic fallback.

import { describe, it, expect } from 'vitest';
import { clearCeilingHeightFromFtf } from '../src/ui/ceiling-layout/CeilingLayoutExecutor.js';

describe('clearCeilingHeightFromFtf — §RESI-CEILING-CLEARHEIGHT', () => {
    it('a typical 3.0 m floor-to-floor → ~2.4 m clear (NOT 3.0 m)', () => {
        const clear = clearCeilingHeightFromFtf(3.0);
        expect(clear).toBeCloseTo(2.4, 6);   // 3.0 − 0.6 service zone
        expect(clear).toBeLessThan(3.0);      // the whole point: below ftf
    });

    it('subtracts the service zone for any ftf above the clamp band', () => {
        expect(clearCeilingHeightFromFtf(3.2)).toBeCloseTo(2.6, 6);
        expect(clearCeilingHeightFromFtf(2.9)).toBeCloseTo(2.3, 6);
    });

    it('clamps to a habitable minimum (≥ 2.1 m) for a very low storey, never exceeding ftf', () => {
        // 2.5 m ftf − 0.6 = 1.9 m < min → clamp up to 2.1 m, still < ftf.
        const clear = clearCeilingHeightFromFtf(2.5);
        expect(clear).toBe(2.1);
        expect(clear).toBeLessThanOrEqual(2.5);
        // A pathologically low ftf can't be exceeded by the clamp.
        expect(clearCeilingHeightFromFtf(2.0)).toBe(2.0);
    });

    it('falls back to a realistic default clear height (2.4 m) when ftf is missing/invalid', () => {
        expect(clearCeilingHeightFromFtf(undefined)).toBe(2.4);
        expect(clearCeilingHeightFromFtf(0)).toBe(2.4);
        expect(clearCeilingHeightFromFtf(-1)).toBe(2.4);
        expect(clearCeilingHeightFromFtf(Number.NaN)).toBe(2.4);
    });
});
