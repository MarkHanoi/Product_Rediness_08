// Apartment Layout — procedural fallback generator tests (offline demo).

import { describe, expect, it } from 'vitest';
import { generateProceduralLayout } from '../src/workflows/apartmentLayout/proceduralLayout.js';
import type { ShellAnalysis } from '../src/workflows/apartmentLayout/shellAnalysis.js';

// 30 m × 20 m shell positioned away from origin (like a real project).
const shell: ShellAnalysis = {
    netAreaM2: 600, widthM: 30, depthM: 20,
    perimeter: [{ x: 100, z: 50 }, { x: 130, z: 50 }, { x: 130, z: 70 }, { x: 100, z: 70 }],
    faces: [],
};
const program = { bedrooms: 2, bathrooms: 1, masterEnSuite: true, openPlanKitchenDining: true, livingRoom: true, entranceHall: true };
const constraints = { minCorridorWidth: 900, wallThickness: 100, floorToCeiling: 2700, wallTypeId: 'partition' };
const weights = { naturalLight: 1, privacy: 1, kitchenWorkflow: 1, corridorEfficiency: 1 };

describe('generateProceduralLayout (offline fallback)', () => {
    it('produces real multi-wall layouts (not a 1-wall stub)', () => {
        const opts = generateProceduralLayout(shell, program, constraints, weights, 2);
        expect(opts.length).toBe(2);
        // program = hall, living, kitchen, dining, master, bedroom, bathroom = 7 rooms → 6 partitions.
        expect(opts[0]!.walls.length).toBe(6);
        expect(opts[0]!.doors.length).toBe(6);
        expect(opts[0]!.rooms.length).toBe(7);
        expect(opts[0]!.score.overall).toBeGreaterThan(0);
    });

    it('places partition walls INSIDE the shell bounding box (world frame, mm)', () => {
        const [opt] = generateProceduralLayout(shell, program, constraints, weights, 1);
        // bbox: x 100..130 m, z 50..70 m → mm 100000..130000 × 50000..70000.
        for (const w of opt!.walls) {
            for (const p of [w.start, w.end]) {
                expect(p.x).toBeGreaterThanOrEqual(100_000 - 1);
                expect(p.x).toBeLessThanOrEqual(130_000 + 1);
                expect(p.y).toBeGreaterThanOrEqual(50_000 - 1);
                expect(p.y).toBeLessThanOrEqual(70_000 + 1);
            }
        }
    });

    it('slices along the longer axis (X here: 30 m > 20 m) — vertical partitions', () => {
        const [opt] = generateProceduralLayout(shell, program, constraints, weights, 1);
        // vertical partition: start.x === end.x, spanning the 20 m depth.
        const w0 = opt!.walls[0]!;
        expect(w0.start.x).toBe(w0.end.x);
        expect(Math.abs(w0.end.y - w0.start.y)).toBeCloseTo(20_000, 0);
    });

    it('each door fits within its host partition wall', () => {
        const [opt] = generateProceduralLayout(shell, program, constraints, weights, 1);
        for (const d of opt!.doors) {
            const w = opt!.walls[d.wallRef]!;
            const lenMm = Math.hypot(w.end.x - w.start.x, w.end.y - w.start.y);
            expect(d.offset).toBeGreaterThanOrEqual(0);
            expect(d.offset + d.width).toBeLessThanOrEqual(lenMm + 1);
        }
    });

    it('returns [] for a zero-size shell', () => {
        const empty: ShellAnalysis = { netAreaM2: 0, widthM: 0, depthM: 0, perimeter: [], faces: [] };
        expect(generateProceduralLayout(empty, program, constraints, weights, 2)).toEqual([]);
    });
});
