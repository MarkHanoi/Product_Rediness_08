// TGL P3b — subdivision (rooms → footprints) tests.
// Contract (SPEC §7): every room gets exactly one footprint; footprints ⊆ shell
// rects; non-overlapping; total footprint area ≈ shell area; corridor cell
// present iff corridorId.

import { describe, expect, it } from 'vitest';
import { subdivide } from '../src/workflows/apartmentLayout/tgl/subdivide.js';
import { buildBubbleGraph } from '../src/workflows/apartmentLayout/tgl/bubbleGraph.js';
import { decomposeToRects, rectArea, type Pt, type Rect } from '../src/workflows/apartmentLayout/tgl/rectDecomposition.js';
import type { ApartmentProgram } from '../src/workflows/apartmentLayout/types.js';

const PROGRAM: ApartmentProgram = {
    bedrooms: 2, bathrooms: 1, masterEnSuite: true,
    openPlanKitchenDining: true, livingRoom: true, entranceHall: true,
};

const overlaps = (a: Rect, b: Rect): boolean =>
    a.x0 < b.x1 - 1e-6 && b.x0 < a.x1 - 1e-6 && a.z0 < b.z1 - 1e-6 && b.z0 < a.z1 - 1e-6;

/** A footprint lies inside the union of shell rects iff it is contained in one. */
const insideShell = (f: Rect, shell: readonly Rect[]): boolean =>
    shell.some(s => f.x0 >= s.x0 - 1e-6 && f.z0 >= s.z0 - 1e-6 && f.x1 <= s.x1 + 1e-6 && f.z1 <= s.z1 + 1e-6);

const assertContract = (placements: ReturnType<typeof subdivide>, shell: readonly Rect[], roomIds: readonly string[]): void => {
    // one footprint per room, covering exactly the room set
    expect(placements.map(p => p.roomId).sort()).toEqual([...roomIds].sort());
    // footprints ⊆ shell
    for (const p of placements) expect(insideShell(p.rect, shell)).toBe(true);
    // non-overlapping
    for (let i = 0; i < placements.length; i++)
        for (let j = i + 1; j < placements.length; j++)
            expect(overlaps(placements[i]!.rect, placements[j]!.rect)).toBe(false);
    // total footprint area ≈ shell area
    const footArea = placements.reduce((s, p) => s + rectArea(p.rect), 0);
    const shellArea = shell.reduce((s, r) => s + rectArea(r), 0);
    expect(footArea).toBeCloseTo(shellArea, 3);
};

describe('subdivide (TGL P3b)', () => {
    it('rectangular shell: one footprint per room, tiling the shell with no overlap', () => {
        const shell = [{ x0: 0, z0: 0, x1: 12, z1: 10 }]; // 120 m²
        const g = buildBubbleGraph(PROGRAM, rectArea(shell[0]!));
        const out = subdivide(shell, g);
        assertContract(out, shell, g.rooms.map(r => r.id));
    });

    it('L-shaped shell (two rects): every rect is used, contract holds', () => {
        // L: 12×10 with a 6×4 notch cut from the top-right.
        const poly: Pt[] = [
            { x: 0, z: 0 }, { x: 12, z: 0 }, { x: 12, z: 6 },
            { x: 6, z: 6 }, { x: 6, z: 10 }, { x: 0, z: 10 },
        ];
        const shell = decomposeToRects(poly);
        expect(shell.length).toBeGreaterThanOrEqual(2);
        const shellArea = shell.reduce((s, r) => s + rectArea(r), 0);
        const g = buildBubbleGraph(PROGRAM, shellArea);
        const out = subdivide(shell, g);
        assertContract(out, shell, g.rooms.map(r => r.id));
    });

    it('corridor footprint present iff the graph has a corridor', () => {
        const shell = [{ x0: 0, z0: 0, x1: 12, z1: 10 }];
        const withCorridor = buildBubbleGraph(PROGRAM, 120);
        const out1 = subdivide(shell, withCorridor);
        expect(out1.some(p => p.roomId === withCorridor.corridorId)).toBe(true);

        const studio: ApartmentProgram = { bedrooms: 0, bathrooms: 0, masterEnSuite: false, openPlanKitchenDining: true, livingRoom: true, entranceHall: true };
        const g2 = buildBubbleGraph(studio, 50);
        expect(g2.corridorId).toBeNull();
        const out2 = subdivide([{ x0: 0, z0: 0, x1: 10, z1: 5 }], g2);
        assertContract(out2, [{ x0: 0, z0: 0, x1: 10, z1: 5 }], g2.rooms.map(r => r.id));
    });

    it('is deterministic — identical input gives byte-identical output', () => {
        const shell = [{ x0: 0, z0: 0, x1: 12, z1: 10 }];
        const g = buildBubbleGraph(PROGRAM, 120);
        expect(JSON.stringify(subdivide(shell, g))).toEqual(JSON.stringify(subdivide(shell, g)));
    });

    it('returns [] for degenerate input', () => {
        const g = buildBubbleGraph(PROGRAM, 120);
        expect(subdivide([], g)).toEqual([]);
        expect(subdivide([{ x0: 0, z0: 0, x1: 0, z1: 0 }], g)).toEqual([]);
        const empty = buildBubbleGraph({ bedrooms: 0, bathrooms: 0, masterEnSuite: false, openPlanKitchenDining: false, livingRoom: false, entranceHall: false }, 0);
        // kitchen is always pushed, so this still has 1 room — but a zero-area shell yields [].
        expect(subdivide([{ x0: 0, z0: 0, x1: 0, z1: 0 }], empty)).toEqual([]);
    });
});
