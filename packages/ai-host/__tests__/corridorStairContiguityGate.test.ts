// §CORRIDOR-STAIR-CONTIGUITY (founder spec, 2026-06-17) — the hard gate that turns
// `sharesStairWall=NO` (a corridor that doesn't reach the stair keep-out) into a hard de-rank.
// Pure predicate test: house-only, no-op on apartments / no-corridor / corridor-reaches-stair.

import { describe, expect, it } from 'vitest';
import { corridorStairGapFor } from '../src/workflows/apartmentLayout/tgl/enumerate.js';
import type { RoomPlacement } from '../src/workflows/apartmentLayout/tgl/subdivide.js';
import type { Rect } from '../src/workflows/apartmentLayout/tgl/rectDecomposition.js';

const place = (roomId: string, x0: number, z0: number, x1: number, z1: number): RoomPlacement =>
    ({ roomId, rect: { x0, z0, x1, z1 } });
const rect = (x0: number, z0: number, x1: number, z1: number): Rect => ({ x0, z0, x1, z1 });

describe('§CORRIDOR-STAIR-CONTIGUITY — corridorStairGapFor', () => {
    it('apartment path (no keep-outs) ⇒ NO gate (false), regardless of corridor', () => {
        const placements = [place('corr', 0, 0, 6, 1.2)];
        expect(corridorStairGapFor(placements, 'corr', [])).toBe(false);
        expect(corridorStairGapFor(placements, 'corr', undefined)).toBe(false);
    });

    it('no corridor id ⇒ NO gate (the circulation rule owns a corridor-less plate)', () => {
        const placements = [place('bed', 0, 0, 4, 4)];
        expect(corridorStairGapFor(placements, null, [rect(5, 0, 7, 2)])).toBe(false);
    });

    it('corridor placement missing (dropped) ⇒ NO gate (circulation rule owns it)', () => {
        const placements = [place('bed', 0, 0, 4, 4)];
        expect(corridorStairGapFor(placements, 'corr', [rect(5, 0, 7, 2)])).toBe(false);
    });

    it('corridor SHARES a full wall with the stair ⇒ NO gate (reach ≥ 0.9 m)', () => {
        // corridor right edge x=6 abuts stair left edge x=6, z-overlap [0,1.2] = 1.2 m ≥ 0.9.
        const placements = [place('corr', 0, 0, 6, 1.2)];
        const keepOut = [rect(6, 0, 8, 1.2)];
        expect(corridorStairGapFor(placements, 'corr', keepOut)).toBe(false);
    });

    it('corridor reaches the stair only at a CORNER (0 shared run) ⇒ GATE fires', () => {
        // corridor top-right corner touches stair bottom-left corner — no shared EDGE.
        const placements = [place('corr', 0, 0, 6, 1.2)];
        const keepOut = [rect(6, 1.2, 8, 3)];
        expect(corridorStairGapFor(placements, 'corr', keepOut)).toBe(true);
    });

    it('corridor is FAR from the stair (no abut) ⇒ GATE fires (the first-floor defect)', () => {
        // corridor on one band, stair across the plate — corridorReachM = 0 → sharesStairWall=NO.
        const placements = [place('corr', 0, 0, 6, 1.2)];
        const keepOut = [rect(6, 5, 8, 7)];
        expect(corridorStairGapFor(placements, 'corr', keepOut)).toBe(true);
    });

    it('shared run BELOW the door minimum (0.6 m < 0.9 m) ⇒ GATE fires', () => {
        // corridor right edge x=6 abuts stair, but z-overlap is only [0,0.6] = 0.6 m.
        const placements = [place('corr', 0, 0, 6, 1.2)];
        const keepOut = [rect(6, 0.6, 8, 2)];   // overlap z ∈ [0.6, 1.2] = 0.6 m
        expect(corridorStairGapFor(placements, 'corr', keepOut)).toBe(true);
    });

    it('reaches the stair via ONE of several keep-outs ⇒ NO gate (max over keep-outs)', () => {
        const placements = [place('corr', 0, 0, 6, 1.2)];
        const keepOuts = [rect(6, 5, 8, 7), rect(6, 0, 8, 1.2)];   // 2nd shares the full wall
        expect(corridorStairGapFor(placements, 'corr', keepOuts)).toBe(false);
    });
});
