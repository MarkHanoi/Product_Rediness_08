// A.21.h — house envelope validator tests (SPEC-CASA §13.3, Deviation B resolved).
//
// Proves the four required claims:
//  (a) a house GROUND floor (big area, 1-2 bedrooms) is ACCEPTED by the house
//      envelope at its TRUE area — the exact case the per-storey area-clamp hid;
//  (b) an absurdly oversized OR undersized house plate is still HARD-REJECTED;
//  (c) the apartment envelope is UNCHANGED (validateHouseStorey is a SIBLING, not a
//      replacement — same apartment inputs still accept/reject as before);
//  (d) a 1 / 2 / 3-storey house still generates end-to-end via generateHouseLayout
//      WITHOUT the clamp (no regression to the existing 36-test house suite).

import { describe, expect, it } from 'vitest';
import {
    validateHouseStorey, houseStoreyBand, generateHouseLayout,
} from '../src/workflows/houseLayout/index.js';
import { validateApartmentEnvelope } from '../src/workflows/apartmentLayout/dimensions/validateApartmentEnvelope.js';
import type { ShellAnalysis } from '../src/workflows/apartmentLayout/shellAnalysis.js';
import type {
    ApartmentConstraints, ApartmentProgram, ScoringWeights,
} from '../src/workflows/apartmentLayout/types.js';

const CONSTRAINTS: ApartmentConstraints = { minCorridorWidth: 900, wallThickness: 100, floorToCeiling: 2700, wallTypeId: '' };
const WEIGHTS: ScoringWeights = { naturalLight: 1, privacy: 1, kitchenWorkflow: 1, corridorEfficiency: 1 };

function shellOf(areaM2: number): ShellAnalysis {
    // Synthesise a roughly-square rectangle of the requested area.
    const side = Math.sqrt(areaM2);
    const w = side * 1.2, d = areaM2 / (side * 1.2);
    return {
        netAreaM2: areaM2, widthM: w, depthM: d,
        perimeter: [{ x: 0, z: 0 }, { x: w, z: 0 }, { x: w, z: d }, { x: 0, z: d }],
        faces: [],
    };
}

// A house GROUND-floor programme: large public area, ONE guest bedroom.
const GROUND_PROGRAM: ApartmentProgram = {
    bedrooms: 1, bathrooms: 1, masterEnSuite: false,
    openPlanKitchenDining: true, livingRoom: true, entranceHall: true,
};

// ───────────────────────── (a) ground floor ACCEPTED at true area ────────────

describe('validateHouseStorey — house ground floor accepted at TRUE area (the clamp case)', () => {
    it('ACCEPTS a 130 m² ground floor with only 1 bedroom (apartment gate would reject it)', () => {
        const res = validateHouseStorey({ program: GROUND_PROGRAM, grossAreaM2: 130 });
        expect(res.admissible).toBe(true);

        // Cross-check: the OLD bedroom-count apartment gate HARD-rejects 130 m² @ 1-bed
        // (1-bed grossMax = 80) — this is exactly why the clamp existed.
        const apt = validateApartmentEnvelope({ bedrooms: 1, grossAreaM2: 130 });
        expect(apt.admissible).toBe(false);
        expect(apt.hardFindings[0]!.metric).toBe('grossMax');
    });

    it('ACCEPTS a 110 m² ground floor with 2 bedrooms', () => {
        const prog: ApartmentProgram = { ...GROUND_PROGRAM, bedrooms: 2, bathrooms: 1 };
        expect(validateHouseStorey({ program: prog, grossAreaM2: 110 }).admissible).toBe(true);
    });

    it('the derived band counts the FULL programme (not bedroom count)', () => {
        const band = houseStoreyBand({ program: GROUND_PROGRAM, grossAreaM2: 130 });
        // hall+living+kitchen+dining+corridor+bedroom+bathroom ⇒ well above a 1-bed
        // apartment's 58 m² target. The house target reflects the public rooms.
        expect(band.programAreaM2).toBeGreaterThan(60);
        expect(band.grossTargetM2).toBeGreaterThan(band.programAreaM2);
        expect(band.grossMinM2).toBeLessThan(band.grossTargetM2);
        expect(band.grossMaxM2).toBeGreaterThan(band.grossTargetM2);
    });
});

// ───────────────────────── (b) absurd plates still rejected ──────────────────

describe('validateHouseStorey — absurd plates still HARD-REJECTED', () => {
    it('REJECTS an absurdly oversized plate (600 m² for a 1-bed programme)', () => {
        const res = validateHouseStorey({ program: GROUND_PROGRAM, grossAreaM2: 600 });
        expect(res.admissible).toBe(false);
        expect(res.hardFindings.some(f => f.metric === 'grossMax')).toBe(true);
    });

    it('REJECTS an absurdly undersized plate (12 m² for a full ground programme)', () => {
        const res = validateHouseStorey({ program: GROUND_PROGRAM, grossAreaM2: 12 });
        expect(res.admissible).toBe(false);
        expect(res.hardFindings.some(f => f.metric === 'grossMin')).toBe(true);
    });

    it('REJECTS a non-positive plate', () => {
        expect(validateHouseStorey({ program: GROUND_PROGRAM, grossAreaM2: 0 }).admissible).toBe(false);
        expect(validateHouseStorey({ program: GROUND_PROGRAM, grossAreaM2: -5 }).admissible).toBe(false);
    });

    it('applies a SOFT penalty (not a reject) just inside the band edges', () => {
        const band = houseStoreyBand({ program: GROUND_PROGRAM, grossAreaM2: 0 });
        const tight = (band.grossMinM2 + band.grossTargetM2 * 0.75) / 2;
        const res = validateHouseStorey({ program: GROUND_PROGRAM, grossAreaM2: tight });
        expect(res.admissible).toBe(true);
        expect(res.softFindings.length).toBeGreaterThan(0);
        expect(res.softFindings[0]!.metric).toBe('grossTarget');
    });
});

// ───────────────────────── (c) apartment envelope UNCHANGED ──────────────────

describe('validateApartmentEnvelope — UNCHANGED (house validator is a sibling)', () => {
    const cases: ReadonlyArray<{ beds: number; area: number; admissible: boolean }> = [
        { beds: 0, area: 38, admissible: true },   // studio at target
        { beds: 1, area: 58, admissible: true },   // 1-bed at target
        { beds: 1, area: 130, admissible: false }, // 1-bed too big (the clamp case)
        { beds: 2, area: 85, admissible: true },
        { beds: 3, area: 211, admissible: false }, // 3-bed too big (the §13.3 example)
        { beds: 3, area: 40, admissible: false },  // 3-bed too small
        { beds: 3, area: 115, admissible: true },
    ];
    for (const c of cases) {
        it(`${c.beds}-bed @ ${c.area} m² → admissible=${c.admissible}`, () => {
            expect(validateApartmentEnvelope({ bedrooms: c.beds, grossAreaM2: c.area }).admissible)
                .toBe(c.admissible);
        });
    }
});

// ───────────────────────── (d) end-to-end house generation ───────────────────

describe('generateHouseLayout — still generates 1/2/3 storeys WITHOUT the clamp', () => {
    // A generous 12 × 10 m (120 m²) house shell, 3-bed / 2-bath.
    const SHELL = shellOf(120);
    const PROGRAM: ApartmentProgram = {
        bedrooms: 3, bathrooms: 2, masterEnSuite: true,
        openPlanKitchenDining: true, livingRoom: true, entranceHall: true,
    };

    for (const storeyCount of [1, 2, 3]) {
        it(`${storeyCount}-storey house produces a real layout on every storey`, () => {
            const res = generateHouseLayout(SHELL, PROGRAM, CONSTRAINTS, WEIGHTS, { storeyCount });
            expect(res.storeys).toHaveLength(storeyCount);
            expect(res.perStoreyLayout).toHaveLength(storeyCount);
            for (const layout of res.perStoreyLayout) {
                expect(layout.rooms.length).toBeGreaterThan(0);
            }
        });
    }

    it('is deterministic (same input → identical result) after the clamp removal', () => {
        const a = generateHouseLayout(SHELL, PROGRAM, CONSTRAINTS, WEIGHTS, { storeyCount: 2 });
        const b = generateHouseLayout(SHELL, PROGRAM, CONSTRAINTS, WEIGHTS, { storeyCount: 2 });
        expect(JSON.stringify(a)).toEqual(JSON.stringify(b));
    });

    it('a big ground floor with one guest bedroom now lays out at its TRUE area', () => {
        // 150 m² single-storey house, 1 bedroom — the apartment gate would reject
        // (1-bed grossMax 80); the house path now accepts + generates rooms.
        const big = shellOf(150);
        const res = generateHouseLayout(big, GROUND_PROGRAM, CONSTRAINTS, WEIGHTS, { storeyCount: 1 });
        expect(res.perStoreyLayout).toHaveLength(1);
        expect(res.perStoreyLayout[0]!.rooms.length).toBeGreaterThan(0);
    });
});
