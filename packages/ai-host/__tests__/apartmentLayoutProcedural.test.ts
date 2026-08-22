// Apartment Layout — procedural fallback generator tests (offline demo).

import { describe, expect, it } from 'vitest';
import {
    generateProceduralLayout,
    generateProceduralLayoutHonest,
    largestInscribedAxisRect,
} from '../src/workflows/apartmentLayout/proceduralLayout.js';
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
        // §HONEST-PICKER (L-4200, 2026-08-22) — WAS 7 rooms / 6 partitions. The
        // fixture sets `masterEnSuite: true` and this generator used to mint NO
        // en-suite room at all: `roomProgram` read the flag only to RENAME bedroom 1
        // "master". The founder asked for "2 bedrooms and 2 en-suite bathrooms" and
        // got zero en-suites with nothing anywhere saying so. The programme is now
        // hall, living, kitchen, dining, master, ENSUITE, bedroom, bathroom = 8.
        expect(opts[0]!.walls.length).toBe(7);
        expect(opts[0]!.doors.length).toBe(7);
        expect(opts[0]!.rooms.length).toBe(8);
        expect(opts[0]!.rooms.map(r => r.type)).toContain('ensuite');
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

    // ── §L-907c — the built door graph is RECORDED on the rooms ──────────────
    it('records the linear door chain on the rooms (adjacentTo + doorAdjacentTo)', () => {
        const [opt] = generateProceduralLayout(shell, program, constraints, weights, 1);
        const rooms = opt!.rooms;
        expect(rooms.length).toBe(8);   // §HONEST-PICKER (L-4200) — was 7, +1 en-suite.
        // Ends have 1 neighbour, middles 2; door graph mirrors wall adjacency.
        expect(rooms[0]!.doorAdjacentTo).toEqual([rooms[1]!.name]);
        expect(rooms[3]!.doorAdjacentTo).toEqual([rooms[2]!.name, rooms[4]!.name]);
        expect(rooms[7]!.doorAdjacentTo).toEqual([rooms[6]!.name]);
        for (const r of rooms) expect(r.adjacentTo).toEqual(r.doorAdjacentTo);
    });
});

// ── §L-907a — HONEST REGION on non-rectangular captured footprints ──────────

describe('generateProceduralLayoutHonest (§L-907a boundary honesty)', () => {
    // Rectangular T-shell probe frame: 16.8 × 11 bbox, 118 m² net (non-rect).
    const tPerimeter = [
        { x: 0, z: 0 }, { x: 16, z: 0 }, { x: 16.8, z: 5 }, { x: 11, z: 5 },
        { x: 11, z: 11 }, { x: 5, z: 11 }, { x: 5, z: 5 }, { x: 0, z: 5 },
    ];
    const tShell: ShellAnalysis = {
        netAreaM2: 118, widthM: 16.8, depthM: 11, perimeter: tPerimeter, faces: [],
    };

    function pointInPoly(pt: { x: number; z: number }, poly: ReadonlyArray<{ x: number; z: number }>): boolean {
        let inside = false;
        for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
            const a = poly[i]!, b = poly[j]!;
            if ((a.z > pt.z) !== (b.z > pt.z) &&
                pt.x < ((b.x - a.x) * (pt.z - a.z)) / (b.z - a.z) + a.x) inside = !inside;
        }
        return inside;
    }

    it('plans EVERY partition endpoint + midpoint INSIDE the captured boundary (was 10/18 outside)', () => {
        const { options, refusal } = generateProceduralLayoutHonest(tShell, program, constraints, weights, 2);
        expect(refusal).toBeUndefined();
        expect(options.length).toBeGreaterThan(0);
        for (const opt of options) {
            for (const w of opt.walls) {
                for (const p of [w.start, w.end, { x: (w.start.x + w.end.x) / 2, y: (w.start.y + w.end.y) / 2 }]) {
                    expect(pointInPoly({ x: p.x / 1000, z: p.y / 1000 }, tPerimeter)).toBe(true);
                }
            }
        }
    });

    it('DISCLOSES the inscribed-rectangle planning in every option summary', () => {
        const { options } = generateProceduralLayoutHonest(tShell, program, constraints, weights, 2);
        for (const opt of options) {
            expect(opt.summary).toMatch(/inscribed .*rectangle; site is non-rectangular/);
        }
    });

    it('keeps the legacy summary (no disclosure) on a truly rectangular shell', () => {
        const { options, refusal } = generateProceduralLayoutHonest(shell, program, constraints, weights, 1);
        expect(refusal).toBeUndefined();
        expect(options[0]!.summary).not.toMatch(/inscribed/);
    });

    it('REFUSES with a named reason when no usable rectangle fits (thin L sliver)', () => {
        // A 2 m-wide L: bbox 20×20 but nothing ≥3×3 fits inside.
        const sliver = [
            { x: 0, z: 0 }, { x: 20, z: 0 }, { x: 20, z: 2 }, { x: 2, z: 2 },
            { x: 2, z: 20 }, { x: 0, z: 20 },
        ];
        const sliverShell: ShellAnalysis = {
            netAreaM2: 76, widthM: 20, depthM: 20, perimeter: sliver, faces: [],
        };
        const { options, refusal } = generateProceduralLayoutHonest(sliverShell, program, constraints, weights, 2);
        expect(options).toEqual([]);
        expect(refusal).toMatch(/non-rectangular/);
        expect(refusal).toMatch(/refusing to plan on an invented rectangle/);
    });

    it('largestInscribedAxisRect returns a rect fully inside the T polygon', () => {
        const rect = largestInscribedAxisRect(tPerimeter);
        expect(rect).not.toBeNull();
        const { x0, z0, w, d } = rect!;
        expect(w).toBeGreaterThanOrEqual(3);
        expect(d).toBeGreaterThanOrEqual(3);
        for (const p of [
            { x: x0 + 0.01, z: z0 + 0.01 }, { x: x0 + w - 0.01, z: z0 + 0.01 },
            { x: x0 + 0.01, z: z0 + d - 0.01 }, { x: x0 + w - 0.01, z: z0 + d - 0.01 },
        ]) {
            expect(pointInPoly(p, tPerimeter)).toBe(true);
        }
    });
});
