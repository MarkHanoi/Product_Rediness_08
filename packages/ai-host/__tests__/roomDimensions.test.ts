// D1.5 — Pin every value in the dimensional database with a snapshot test, so
// changes are DELIBERATE not accidental.
// (APARTMENT-DIMENSIONAL-CONSTRAINTS-AND-SPATIAL-PROPORTION-FRAMEWORK-2026-05-29 §9.1.)

import { describe, expect, it } from 'vitest';
import {
    ROOM_DIMENSIONS, ALL_ROOM_DIMENSIONS, dimensionsFor,
    APARTMENT_DIMENSIONS, apartmentDimensionsFor,
} from '../src/workflows/apartmentLayout/dimensions/roomDimensions.js';
import type { RoomType } from '../src/workflows/apartmentLayout/types.js';

const ALL_TYPES: readonly RoomType[] = [
    'living', 'kitchen', 'dining', 'hall', 'corridor',
    'master', 'bedroom', 'study', 'bathroom', 'ensuite', 'wc', 'utility',
];

describe('roomDimensions — D1 dimensional database', () => {
    describe('integrity', () => {
        it('exactly one envelope per RoomType', () => {
            expect(ALL_ROOM_DIMENSIONS.length).toBe(ALL_TYPES.length);
            for (const t of ALL_TYPES) expect(ROOM_DIMENSIONS[t]).toBeDefined();
        });

        it('every envelope is internally consistent (min ≤ comfortable ≤ max)', () => {
            for (const t of ALL_TYPES) {
                const d = dimensionsFor(t);
                expect(d.areaMin).toBeLessThanOrEqual(d.areaComfortableMin);
                expect(d.areaComfortableMin).toBeLessThanOrEqual(d.areaComfortableMax);
                expect(d.areaComfortableMax).toBeLessThanOrEqual(d.areaHardMax);
                expect(d.widthMin).toBeLessThanOrEqual(d.widthPreferredMin);
                expect(d.widthPreferredMin).toBeLessThanOrEqual(d.widthPreferredMax);
                expect(d.widthPreferredMax).toBeLessThanOrEqual(d.widthHardMax);
                expect(d.lengthSoftMax).toBeLessThanOrEqual(d.lengthHardMax);
                expect(d.aspectSoftMax).toBeLessThanOrEqual(d.aspectHardMax);
                expect(d.usableWallMin).toBeGreaterThanOrEqual(0);
            }
        });

        it('aspectSoftMax + aspectHardMax are ratios ≥ 1', () => {
            for (const t of ALL_TYPES) {
                const d = dimensionsFor(t);
                expect(d.aspectSoftMax).toBeGreaterThanOrEqual(1);
                expect(d.aspectHardMax).toBeGreaterThanOrEqual(1);
            }
        });
    });

    // The "20 m² bathroom is a planning failure" rule — explicit pin per §5.5.
    describe('framework §5.5 — bathroom envelope rejects 20 m²', () => {
        it('bathroom hard max < 20', () => {
            expect(dimensionsFor('bathroom').areaHardMax).toBeLessThan(20);
        });
        it('ensuite hard max < 20', () => {
            expect(dimensionsFor('ensuite').areaHardMax).toBeLessThan(20);
        });
        it('wc hard max ≤ 4', () => {
            expect(dimensionsFor('wc').areaHardMax).toBeLessThanOrEqual(4);
        });
    });

    // §5.9 — corridor is the most distinctive envelope: must be ≤ 1.4 m wide.
    describe('framework §5.9 — corridor envelope', () => {
        it('corridor widthHardMax ≤ 1.4 m (above this it is no longer circulation)', () => {
            expect(dimensionsFor('corridor').widthHardMax).toBeLessThanOrEqual(1.4);
        });
        it('corridor lengthHardMax ≤ 12 m (fire-corridor threshold)', () => {
            expect(dimensionsFor('corridor').lengthHardMax).toBeLessThanOrEqual(12);
        });
        it('corridor widthMin = 1.0 m (Part M mandatory)', () => {
            expect(dimensionsFor('corridor').widthMin).toBe(1.0);
        });
    });

    // §5.1 — living dominance.
    describe('framework §5.1 — living envelope', () => {
        it('living areaMin = 14 m² (HQI mandatory)', () => {
            expect(dimensionsFor('living').areaMin).toBe(14);
        });
        it('living widthMin = 3.2 m (DB-049)', () => {
            expect(dimensionsFor('living').widthMin).toBe(3.2);
        });
    });

    // §5.4 — bedroom proportions.
    describe('framework §5.4 — bedroom envelopes', () => {
        it('master areaMin = 12 (Building Regs)', () => {
            expect(dimensionsFor('master').areaMin).toBe(12);
        });
        it('master widthMin = 2.75 m (DB-022)', () => {
            expect(dimensionsFor('master').widthMin).toBe(2.75);
        });
        it('bedroom areaMin = 9 m² (framework softer than DB-026 11.5; pinned to framework)', () => {
            expect(dimensionsFor('bedroom').areaMin).toBe(9);
        });
        it('bedroom widthMin = 2.6 m', () => {
            expect(dimensionsFor('bedroom').widthMin).toBe(2.6);
        });
        it('master + bedroom aspectHardMax ≤ 3 (no tunnel bedrooms)', () => {
            expect(dimensionsFor('master').aspectHardMax).toBeLessThanOrEqual(3.0);
            expect(dimensionsFor('bedroom').aspectHardMax).toBeLessThanOrEqual(3.0);
        });
    });
});

describe('apartmentDimensionsFor — apartment-level gross sanity (§3.1)', () => {
    it('has entries for studio + 1–4 bedrooms', () => {
        expect(APARTMENT_DIMENSIONS.length).toBeGreaterThanOrEqual(5);
        for (let b = 0; b <= 4; b++) {
            const d = apartmentDimensionsFor(b);
            expect(d.bedrooms).toBeLessThanOrEqual(b);
            expect(d.grossMin).toBeLessThan(d.grossTarget);
            expect(d.grossTarget).toBeLessThan(d.grossMax);
        }
    });

    it('clamps above 4 bedrooms to the largest entry (multi-apartment exception)', () => {
        const big = apartmentDimensionsFor(99);
        expect(big.bedrooms).toBe(4);
    });

    // Framework explicit values per §3.1.
    it('2-bedroom apartment min/target/max = 60/85/120 m²', () => {
        const d = apartmentDimensionsFor(2);
        expect(d.grossMin).toBe(60);
        expect(d.grossTarget).toBe(85);
        expect(d.grossMax).toBe(120);
    });
});
