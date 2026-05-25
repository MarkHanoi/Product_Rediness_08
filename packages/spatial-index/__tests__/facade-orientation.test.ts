// @pryzm/spatial-index — FacadeOrientationService (SL-3) pure-core contract tests.
//
// Covers the orientation math + exterior/interior classification with plain data
// fixtures (no stores). North convention: trueNorth=0 → N=−Z, E=+X, S=+Z, W=−X.

import { describe, expect, it } from 'vitest';
import {
    classifyFacades,
    orientationFromNormal,
    outwardNormal,
    type FacadeWall,
    type FacadeRoom,
} from '../src/FacadeOrientationMath.js';

// A 10×10 square room centred at the origin, walls on each side (world X-Z).
//   north wall z=-5, south wall z=+5, east wall x=+5, west wall x=-5.
const W_NORTH: FacadeWall = { id: 'w-n', levelId: 'L0', baseLine: [{ x: -5, z: -5 }, { x: 5, z: -5 }] };
const W_SOUTH: FacadeWall = { id: 'w-s', levelId: 'L0', baseLine: [{ x: -5, z: 5 }, { x: 5, z: 5 }] };
const W_EAST: FacadeWall = { id: 'w-e', levelId: 'L0', baseLine: [{ x: 5, z: -5 }, { x: 5, z: 5 }] };
const W_WEST: FacadeWall = { id: 'w-w', levelId: 'L0', baseLine: [{ x: -5, z: -5 }, { x: -5, z: 5 }] };

const ROOM: FacadeRoom = {
    id: 'r1',
    boundingWallIds: ['w-n', 'w-s', 'w-e', 'w-w'],
    centroid: { x: 0, z: 0 },
};

describe('orientationFromNormal — compass buckets (trueNorth=0)', () => {
    it('maps cardinal normals to N/E/S/W', () => {
        expect(orientationFromNormal({ x: 0, z: -1 })).toBe('N'); // −Z
        expect(orientationFromNormal({ x: 1, z: 0 })).toBe('E');  // +X
        expect(orientationFromNormal({ x: 0, z: 1 })).toBe('S');  // +Z
        expect(orientationFromNormal({ x: -1, z: 0 })).toBe('W'); // −X
    });

    it('rotates with trueNorth (north → −X at 90°)', () => {
        // trueNorth = +90°: the frame rotates so a +Z-facing normal is no longer South.
        const south0 = orientationFromNormal({ x: 0, z: 1 }, 0);
        const south90 = orientationFromNormal({ x: 0, z: 1 }, Math.PI / 2);
        expect(south0).toBe('S');
        expect(south90).not.toBe('S');
    });
});

describe('outwardNormal — points away from the room centroid', () => {
    it('south wall normal points +Z (away from origin)', () => {
        const n = outwardNormal(W_SOUTH, { x: 0, z: 0 });
        expect(n).not.toBeNull();
        expect(n!.z).toBeGreaterThan(0.99);
    });
    it('returns null for a degenerate (zero-length) wall', () => {
        expect(outwardNormal({ id: 'd', levelId: 'L0', baseLine: [{ x: 1, z: 1 }, { x: 1, z: 1 }] }, { x: 0, z: 0 })).toBeNull();
    });
});

describe('classifyFacades — single room: all four walls exterior, correctly oriented', () => {
    const facades = classifyFacades([W_NORTH, W_SOUTH, W_EAST, W_WEST], [ROOM], 0);
    it('classifies every wall exterior (bounded by exactly one room)', () => {
        for (const id of ['w-n', 'w-s', 'w-e', 'w-w']) {
            expect(facades.get(id)!.isExterior).toBe(true);
            expect(facades.get(id)!.boundingRoomCount).toBe(1);
        }
    });
    it('assigns the correct compass orientation per wall', () => {
        expect(facades.get('w-n')!.orientation).toBe('N');
        expect(facades.get('w-s')!.orientation).toBe('S');
        expect(facades.get('w-e')!.orientation).toBe('E');
        expect(facades.get('w-w')!.orientation).toBe('W');
    });
});

describe('classifyFacades — shared wall between two rooms is interior', () => {
    // Two rooms sharing wall 'w-shared'; 'w-out' is bounded by only room A.
    const roomA: FacadeRoom = { id: 'A', boundingWallIds: ['w-shared', 'w-out'], centroid: { x: 0, z: 0 } };
    const roomB: FacadeRoom = { id: 'B', boundingWallIds: ['w-shared'], centroid: { x: 0, z: 10 } };
    const wShared: FacadeWall = { id: 'w-shared', levelId: 'L0', baseLine: [{ x: -5, z: 5 }, { x: 5, z: 5 }] };
    const wOut: FacadeWall = { id: 'w-out', levelId: 'L0', baseLine: [{ x: -5, z: -5 }, { x: 5, z: -5 }] };
    const facades = classifyFacades([wShared, wOut], [roomA, roomB], 0);

    it('marks the two-room wall interior (no orientation)', () => {
        expect(facades.get('w-shared')!.isExterior).toBe(false);
        expect(facades.get('w-shared')!.boundingRoomCount).toBe(2);
        expect(facades.get('w-shared')!.orientation).toBeNull();
    });
    it('marks the one-room wall exterior with an orientation', () => {
        expect(facades.get('w-out')!.isExterior).toBe(true);
        expect(facades.get('w-out')!.orientation).toBe('N'); // z=-5 side, faces −Z
    });
});
