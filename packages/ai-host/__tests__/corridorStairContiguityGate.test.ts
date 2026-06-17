// §CORRIDOR-STAIR-CONTIGUITY (founder spec, 2026-06-17) — the hard gate that turns
// `sharesStairWall=NO` (a corridor that doesn't reach the stair keep-out) into a hard de-rank.
// Pure predicate test: house-only, no-op on apartments / no-corridor / corridor-reaches-stair.

import { describe, expect, it } from 'vitest';
import { corridorStairGapFor, corridorHallGapFor } from '../src/workflows/apartmentLayout/tgl/enumerate.js';
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

describe('§GF-CORRIDOR-HALL-CONTIGUITY — corridorHallGapFor (ground floor)', () => {
    it('no entrance hall (entryId null) ⇒ NO gate (upper floor / stair gate owns it)', () => {
        const placements = [place('corr', 0, 0, 6, 1.2)];
        expect(corridorHallGapFor(placements, 'corr', null)).toBe(false);
        expect(corridorHallGapFor(placements, 'corr', undefined)).toBe(false);
    });

    it('no corridor id ⇒ NO gate', () => {
        const placements = [place('hall', 0, 0, 3, 3)];
        expect(corridorHallGapFor(placements, null, 'hall')).toBe(false);
    });

    it('corridor or hall placement missing ⇒ NO gate', () => {
        expect(corridorHallGapFor([place('hall', 0, 0, 3, 3)], 'corr', 'hall')).toBe(false);   // corridor dropped
        expect(corridorHallGapFor([place('corr', 0, 0, 6, 1.2)], 'corr', 'hall')).toBe(false); // hall dropped
    });

    it('corridor SHARES a door-width wall with the hall ⇒ NO gate', () => {
        // corridor right edge x=6 abuts hall left edge x=6, z-overlap [0,1.2] = 1.2 m ≥ 0.9.
        const placements = [place('corr', 0, 0, 6, 1.2), place('hall', 6, 0, 9, 3)];
        expect(corridorHallGapFor(placements, 'corr', 'hall')).toBe(false);
    });

    it('corridor FAR from the hall ⇒ GATE fires (the GF-C4 defect: corridor not attached to hall)', () => {
        // corridor top-left, hall bottom-right — no shared edge (images 3-6 failure).
        const placements = [place('corr', 0, 8, 6, 9.2), place('hall', 8, 0, 11, 3)];
        expect(corridorHallGapFor(placements, 'corr', 'hall')).toBe(true);
    });

    it('corridor touches the hall only at a CORNER ⇒ GATE fires', () => {
        const placements = [place('corr', 0, 0, 6, 1.2), place('hall', 6, 1.2, 9, 4)];
        expect(corridorHallGapFor(placements, 'corr', 'hall')).toBe(true);
    });

    it('shared run below the door minimum (0.6 m) ⇒ GATE fires', () => {
        const placements = [place('corr', 0, 0, 6, 1.2), place('hall', 6, 0.6, 9, 2)];   // overlap 0.6 m
        expect(corridorHallGapFor(placements, 'corr', 'hall')).toBe(true);
    });
});
