// §LU-CORRIDOR — pure L-comb circulation core (no browser).
//
// Founder 2026-06-21: the upper floor's straight corridor can't reach 4 bedrooms; the
// comb bails to squarify and buries the back rooms. planLCorridorComb lays the rooms
// along an L of two perpendicular corridor legs so EVERY room keeps a corridor-adjacent
// wall. These tests pin: all rooms placed, each abuts the L corridor (door-able), no
// overlaps, and the infeasible case returns null (→ caller's squarify fallback, unchanged).

import { describe, it, expect } from 'vitest';
import { planLCorridorComb, polyRectSharedWallM } from '../src/workflows/apartmentLayout/tgl/subdivide.js';
import type { ProgramRoom } from '../src/workflows/apartmentLayout/tgl/bubbleGraph.js';
import type { Rect } from '../src/workflows/apartmentLayout/tgl/rectDecomposition.js';

let _seq = 0;
function bedroom(targetAreaM2 = 15): ProgramRoom {
    const id = `r${_seq++}`;
    return { id, type: 'bedroom', name: id, targetAreaM2, isPrivate: true, needsWindow: true } as ProgramRoom;
}

const DOOR_W = 0.8;
function rectsOverlap(a: Rect, b: Rect): boolean {
    return a.x0 < b.x1 - 1e-6 && a.x1 > b.x0 + 1e-6 && a.z0 < b.z1 - 1e-6 && a.z1 > b.z0 + 1e-6;
}

describe('§LU-CORRIDOR — planLCorridorComb', () => {
    // A 7×9 m private zone with 4 bedrooms (floor 2.6 m each ⇒ floorSum 10.4 m). A straight
    // comb needs 10.4 m of run on ONE face, but BOTH faces (7 and 9) are shorter → the
    // straight comb fails. The L gives two runs, so all four fit.
    const ZONE: Rect = { x0: 0, z0: 0, x1: 7, z1: 9 };
    const CW = 1.0;

    it('places ALL four rooms when a single straight run cannot fit them', () => {
        const rooms = [bedroom(), bedroom(), bedroom(), bedroom()];
        const res = planLCorridorComb(ZONE, rooms, CW);
        expect(res, 'L-comb should succeed where the straight comb fails').not.toBeNull();
        expect(res!.placements.map(p => p.roomId).sort()).toEqual(rooms.map(r => r.id).sort());
    });

    it('every room abuts the L corridor with a door-width wall (first-class circulation)', () => {
        const rooms = [bedroom(), bedroom(), bedroom(), bedroom()];
        const res = planLCorridorComb(ZONE, rooms, CW)!;
        for (const p of res.placements) {
            const shared = polyRectSharedWallM(res.corridorRing, p.rect);
            expect(shared, `room ${p.roomId} must share ≥${DOOR_W}m of wall with the corridor (got ${shared.toFixed(2)})`).toBeGreaterThanOrEqual(DOOR_W);
        }
    });

    it('rooms do not overlap each other', () => {
        const rooms = [bedroom(), bedroom(), bedroom(), bedroom()];
        const res = planLCorridorComb(ZONE, rooms, CW)!;
        const rects = res.placements.map(p => p.rect);
        for (let i = 0; i < rects.length; i++)
            for (let j = i + 1; j < rects.length; j++)
                expect(rectsOverlap(rects[i]!, rects[j]!), `rooms ${i} & ${j} overlap`).toBe(false);
    });

    it('emits an L corridor ring (two legs union to a ≥6-vertex rectilinear ring)', () => {
        const res = planLCorridorComb(ZONE, [bedroom(), bedroom(), bedroom(), bedroom()], CW)!;
        expect(res.corridorRing.length).toBeGreaterThanOrEqual(6);     // an L has 6 vertices
        expect(res.legs).toHaveLength(2);
    });

    it('returns null (→ caller squarify fallback) when the zone is too small for an L', () => {
        expect(planLCorridorComb({ x0: 0, z0: 0, x1: 2.5, z1: 2.5 }, [bedroom(), bedroom()], CW)).toBeNull();
    });

    it('returns null for a single room (an L is pointless)', () => {
        expect(planLCorridorComb(ZONE, [bedroom()], CW)).toBeNull();
    });

    it('is deterministic — identical inputs give an identical placement set', () => {
        _seq = 1000;
        const a = planLCorridorComb(ZONE, [bedroom(), bedroom(), bedroom(), bedroom()], CW)!;
        _seq = 1000;
        const b = planLCorridorComb(ZONE, [bedroom(), bedroom(), bedroom(), bedroom()], CW)!;
        expect(a.placements).toEqual(b.placements);
        expect(a.corridorRing).toEqual(b.corridorRing);
    });
});
