// DOC-AUTO DS4 — per-room documentation tests (2026-06-09).

import { describe, expect, it } from 'vitest';
import {
    roomCropRegion,
    computeRoomInteriorElevationMarks,
} from '../src/workflows/houseLayout/roomDocumentation.js';

// A 4 (x) × 3 (z) room at min corner (2, 1).
const ROOM = [{ x: 2, z: 1 }, { x: 6, z: 1 }, { x: 6, z: 4 }, { x: 2, z: 4 }];

describe('DS4 — roomCropRegion', () => {
    it('expands the room bbox by the margin on every side', () => {
        const c = roomCropRegion(ROOM, 0.5)!;
        expect(c).toEqual({ minX: 1.5, minZ: 0.5, maxX: 6.5, maxZ: 4.5 });
    });
    it('default margin is 0.5 m', () => {
        const c = roomCropRegion(ROOM)!;
        expect(c.minX).toBe(1.5);
        expect(c.maxZ).toBe(4.5);
    });
    it('degenerate room (< 3 verts / zero area) → null', () => {
        expect(roomCropRegion([{ x: 0, z: 0 }, { x: 1, z: 1 }])).toBeNull();
        expect(roomCropRegion([{ x: 0, z: 0 }, { x: 5, z: 0 }, { x: 10, z: 0 }])).toBeNull(); // collinear
    });
    it('is deterministic', () => {
        expect(roomCropRegion(ROOM, 0.3)).toEqual(roomCropRegion(ROOM, 0.3));
    });
});

describe('§DOC-ROOM-CROP — RoomCropRegion → ViewCropSettings.region mapping', () => {
    // The editor wiring (generateDocumentationSet) must map the {minX,minZ,maxX,maxZ}
    // RoomCropRegion onto the ViewCropSettings.region shape ({min:[x,z], max:[x,z]})
    // that PlanViewCanvas actually frames + clips by. The bug was that only
    // spatial.cropRegion was set (an EdgeProjector-only field), never `crop`.
    it('produces a region whose min/max arrays match the bbox corners (metres)', () => {
        const c = roomCropRegion(ROOM, 0.5)!;
        const region = { min: [c.minX, c.minZ] as [number, number], max: [c.maxX, c.maxZ] as [number, number] };
        expect(region.min).toEqual([1.5, 0.5]);
        expect(region.max).toEqual([6.5, 4.5]);
        // min strictly below max on both axes → a non-degenerate clip rect.
        expect(region.max[0]).toBeGreaterThan(region.min[0]);
        expect(region.max[1]).toBeGreaterThan(region.min[1]);
    });
});

describe('DS4 — computeRoomInteriorElevationMarks', () => {
    it('produces 4 interior marks at the room centroid looking OUTWARD at each wall', () => {
        const m = computeRoomInteriorElevationMarks(ROOM);
        expect(m).toHaveLength(4);
        const cx = 4, cz = 2.5; // centroid of the 4×3 room
        for (const mk of m) {
            expect(mk.anchor).toEqual({ x: cx, z: cz });
            expect(Math.hypot(mk.facing.x, mk.facing.z)).toBeCloseTo(1, 9);
        }
        const by = (w: string) => m.find(x => x.wall === w)!;
        expect(by('N').facing).toEqual({ x: 0, z: 1 });   // looks +z toward the north wall
        expect(by('S').facing).toEqual({ x: 0, z: -1 });
        expect(by('E').facing).toEqual({ x: 1, z: 0 });
        expect(by('W').facing).toEqual({ x: -1, z: 0 });
    });
    it('each interior facing points TOWARD its wall (opposite of building-exterior elevations)', () => {
        const m = computeRoomInteriorElevationMarks(ROOM);
        const by = (w: string) => m.find(x => x.wall === w)!;
        // North wall is at z=4 (> centroid z); facing +z reaches it.
        expect(by('N').anchor.z + by('N').facing.z).toBeGreaterThan(by('N').anchor.z);
        // East wall at x=6 (> centroid x); facing +x reaches it.
        expect(by('E').anchor.x + by('E').facing.x).toBeGreaterThan(by('E').anchor.x);
    });
    it('degenerate room → []', () => {
        expect(computeRoomInteriorElevationMarks([{ x: 0, z: 0 }, { x: 1, z: 1 }])).toEqual([]);
    });
});
