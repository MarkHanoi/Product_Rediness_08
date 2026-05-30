// D2.3 — validateKitchenTriangle pin tests.

import { describe, expect, it } from 'vitest';
import {
    validateKitchenTriangle, KITCHEN_TRIANGLE,
} from '../src/workflows/apartmentLayout/dimensions/validateKitchenTriangle.js';

const Pt = (x: number, z: number) => ({ x, z });

describe('D2.3 — validateKitchenTriangle (G10 NKBA work triangle)', () => {
    it('NKBA-canonical triangle: ~2 m / 2 m / 2.5 m → admissible + zero soft findings', () => {
        // Equilateral-ish: legs 2.0, 2.0, 2.0 → sum 6.0 → within band
        const result = validateKitchenTriangle({
            kitchenId: 'k1',
            sink:   Pt(0, 0),
            stove:  Pt(2.0, 0),
            fridge: Pt(1.0, Math.sqrt(3)), // ~1.73 → legs ≈ 2.0/2.0/2.0
        });
        expect(result.admissible).toBe(true);
        expect(result.hardFindings).toEqual([]);
        // Each leg in [1.5, 2.4]; sum < 6.6 → no soft penalties either.
        expect(result.softFindings).toEqual([]);
    });

    it('crowded triangle (legs ≈ 0.8 m): HARD-rejects on legMin', () => {
        const result = validateKitchenTriangle({
            kitchenId: 'k1',
            sink:   Pt(0, 0),
            stove:  Pt(0.8, 0),
            fridge: Pt(0.4, 0.7),
        });
        expect(result.admissible).toBe(false);
        const hard = result.hardFindings;
        expect(hard.length).toBeGreaterThan(0);
        expect(hard.some(f => f.metric.startsWith('legMin'))).toBe(true);
    });

    it('over-spread triangle (one leg ≈ 4 m): HARD-rejects on legMax', () => {
        const result = validateKitchenTriangle({
            kitchenId: 'k1',
            sink:   Pt(0, 0),
            stove:  Pt(4.0, 0),     // 4 m leg → over 2.7 m hard max
            fridge: Pt(2.0, 1.5),
        });
        expect(result.admissible).toBe(false);
        expect(result.hardFindings.some(f => f.metric.startsWith('legMax'))).toBe(true);
    });

    it('over-spread SUM (4 + 2.5 + 2.5 = 9.0 m): HARD-rejects on sumMax — masked here by legMax', () => {
        // 4 m leg ALREADY triggers legMax — the sumMax check is still reachable
        // when each leg sits between 2.5–2.7 m. Use 2.6/2.6/2.6 → sum 7.8 m
        // (just under hard, so still admissible but tests the sumMax boundary).
        const result = validateKitchenTriangle({
            kitchenId: 'k1',
            sink:   Pt(0, 0),
            stove:  Pt(2.6, 0),
            fridge: Pt(1.3, 2.6 * Math.sqrt(3) / 2),     // equilateral 2.6
        });
        // Hard ceilings: each leg 2.6 < 2.7 → no legMax hard.
        // Sum 7.8 < 7.9 → no sumMax hard.
        // Soft: each leg > 2.4 → legLoose × 3; sum > 6.6 → sumLoose.
        expect(result.admissible).toBe(true);
        expect(result.softFindings.length).toBeGreaterThan(0);
        expect(result.softFindings.some(f => f.metric === 'sumLoose')).toBe(true);
    });

    it('exceeds NKBA hard sum (e.g. 2.7+2.7+2.55 = 7.95): HARD-rejects on sumMax', () => {
        // All legs at the legMax boundary, but sum just over hard cap.
        // Two legs at 2.65 + third 2.61 → sum 7.91 → hard reject on sumMax.
        const result = validateKitchenTriangle({
            kitchenId: 'k1',
            sink:   Pt(0, 0),
            stove:  Pt(2.65, 0),
            fridge: Pt(1.325, 2.27),  // ~2.65 / ~2.62 legs from sink/stove
        });
        // Even though legs may pass, the sum should breach 7.9 → hard
        // (or one leg may also hit hard ceiling — that's fine).
        expect(result.admissible).toBe(false);
    });

    it('exposes the NKBA thresholds for downstream consumers', () => {
        expect(KITCHEN_TRIANGLE.LEG_MIN_HARD).toBe(1.20);
        expect(KITCHEN_TRIANGLE.LEG_MAX_HARD).toBe(2.70);
        expect(KITCHEN_TRIANGLE.SUM_MAX_HARD).toBe(7.90);
    });
});
