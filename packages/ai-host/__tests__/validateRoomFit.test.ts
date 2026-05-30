// D2.2 — validateRoomFit pin tests.

import { describe, expect, it } from 'vitest';
import {
    validateRoomFit, requiredFurnitureAreaM2,
} from '../src/workflows/apartmentLayout/dimensions/validateRoomFit.js';
import type { RoomType } from '../src/workflows/apartmentLayout/types.js';

const rect = (x0: number, z0: number, x1: number, z1: number) => ({ x0, z0, x1, z1 });

describe('D2.2 — validateRoomFit (G5 furniture-fit lower-bound)', () => {
    it('requiredFurnitureAreaM2 returns 0 for rooms with no furniture program', () => {
        expect(requiredFurnitureAreaM2('corridor')).toBe(0);
    });

    it('requiredFurnitureAreaM2 produces a sensible positive sum for bedrooms', () => {
        // Bedroom requires bed + 2 bedside tables + wardrobe + lamp.
        const area = requiredFurnitureAreaM2('bedroom');
        expect(area).toBeGreaterThan(3);    // at least a few m² of footprint
        expect(area).toBeLessThan(15);      // not the whole room
    });

    it('comfortable bedroom (15 m²) → admissible + no findings', () => {
        const result = validateRoomFit({
            roomId: 'b1', type: 'bedroom',
            rect: rect(0, 0, 5, 3),     // 15 m²
        });
        expect(result.admissible).toBe(true);
        expect(result.hardFindings).toEqual([]);
        expect(result.softFindings).toEqual([]);
    });

    it('tight bedroom (just above lower bound) → admissible + SOFT "tight" finding', () => {
        // Required ≈ 6 m² for the bedroom program; pick a rect with area
        // = required × 1.1 (well inside the 1.2× tight band).
        const required = requiredFurnitureAreaM2('bedroom');
        const target = required * 1.1;
        // Pick a thin-ish rectangle of that area.
        const w = 3;
        const h = target / w;
        const result = validateRoomFit({
            roomId: 'b1', type: 'bedroom',
            rect: rect(0, 0, w, h),
        });
        expect(result.admissible).toBe(true);
        expect(result.hardFindings).toEqual([]);
        expect(result.softFindings.length).toBeGreaterThan(0);
        expect(result.softFindings[0]!.metric).toBe('fitTight');
    });

    it('too-small bedroom (under lower bound) → HARD-rejects with fitImpossible', () => {
        const required = requiredFurnitureAreaM2('bedroom');
        const target = required * 0.7;     // clearly too small
        const w = 2;
        const h = target / w;
        const result = validateRoomFit({
            roomId: 'b1', type: 'bedroom',
            rect: rect(0, 0, w, h),
        });
        expect(result.admissible).toBe(false);
        expect(result.hardFindings.some(f => f.metric === 'fitImpossible')).toBe(true);
    });

    it('corridor with no furniture program always passes regardless of size', () => {
        for (const r of [rect(0, 0, 0.5, 0.5), rect(0, 0, 30, 30)]) {
            const result = validateRoomFit({ roomId: 'c1', type: 'corridor', rect: r });
            expect(result.admissible).toBe(true);
        }
    });

    it('degenerate rect (zero or negative dimensions) → HARD-rejects', () => {
        const result = validateRoomFit({
            roomId: 'x', type: 'bedroom',
            rect: rect(0, 0, 0, 5),
        });
        expect(result.admissible).toBe(false);
        expect(result.hardFindings.some(f => f.metric === 'degenerate')).toBe(true);
    });

    // §D2.2-GATE (2026-05-30) — the validator is now wired into the
    // enumerate.ts shape gate (its admissibility ANDs with D2.1's; its
    // soft findings accumulate into the same `shapeQuality` axis). This
    // test exercises the integrated gate end-to-end.
    it('integrates with enumerate.ts shape gate (admissibility + shapeQuality)', async () => {
        const { generateDeterministicLayouts } = await import('../src/workflows/apartmentLayout/tgl/runDeterministicLayout.js');
        const SHELL = {
            netAreaM2: 120, widthM: 12, depthM: 10,
            perimeter: [{ x: 0, z: 0 }, { x: 12, z: 0 }, { x: 12, z: 10 }, { x: 0, z: 10 }],
            faces: [] as never[],
        };
        const PROGRAM = {
            bedrooms: 2, bathrooms: 1, masterEnSuite: true,
            openPlanKitchenDining: true, livingRoom: true, entranceHall: true,
        };
        const CONSTRAINTS = { minCorridorWidth: 900, wallThickness: 100, floorToCeiling: 2700, wallTypeId: '' };
        const WEIGHTS = { naturalLight: 1, privacy: 1, kitchenWorkflow: 1, corridorEfficiency: 1 };
        const out = generateDeterministicLayouts(SHELL, PROGRAM, CONSTRAINTS, WEIGHTS, 1);
        // The 12×10 shell with a normal 2-bed program produces rooms that
        // PASS the fit gate. shapeQuality should be in [0, 1] (validates
        // that the merged D2.1+D2.2 soft accumulator doesn't overflow).
        expect(out.length).toBe(1);
        const sq = out[0]!.score.breakdown.shapeQuality;
        expect(sq).toBeGreaterThanOrEqual(0);
        expect(sq).toBeLessThanOrEqual(1);
    });

    it('different room types yield different lower bounds (sanity)', () => {
        // Use a sparse sample to confirm the heuristic is type-sensitive.
        const types: RoomType[] = ['bedroom', 'master', 'bathroom', 'kitchen', 'study'];
        const areas = new Map(types.map(t => [t, requiredFurnitureAreaM2(t)]));
        // All > 0
        for (const t of types) {
            expect(areas.get(t)!, `${t} required area`).toBeGreaterThan(0);
        }
        // Master and bedroom have identical specs; both should be > bathroom.
        expect(areas.get('bedroom')!).toBeGreaterThan(areas.get('bathroom')!);
    });
});
