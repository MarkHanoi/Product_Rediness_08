// §SPINE-TREE (§18 slice 1) — the multi-leg room pack. Every room must comb off a corridor SEGMENT
// (the run OR a leg), so an L-corridor connects rooms in the leg's fragment too. Pure geometry, tested
// in isolation (unwired — zero live-path risk).

import { describe, expect, it } from 'vitest';
import { packRoomsAlongSpineTree, type SpineRoom } from '../src/workflows/apartmentLayout/tgl/packRoomsAlongSpine.js';
import type { SpinePath } from '../src/workflows/apartmentLayout/tgl/deriveCorridorSpine.js';
import type { Rect } from '../src/workflows/apartmentLayout/tgl/rectDecomposition.js';

const SHELL: Rect = { x0: 0, z0: 0, x1: 12, z1: 10 };
const DOOR_W = 0.8;

// An L-spine: a horizontal primary run at z=5 + a vertical leg at x=10 reaching up to z=9 (an edge stair).
const L_SPINE: SpinePath = {
    segments: [
        { a: { x: 0.3, z: 5 }, b: { x: 11.7, z: 5 } },   // primary run
        { a: { x: 10, z: 5 }, b: { x: 10, z: 9 } },      // vertical leg (to a top-edge stair)
    ],
    widthM: 1.2,
    primaryAxis: 'x',
};

const ROOMS: SpineRoom[] = [
    { id: 'r1', targetAreaM2: 18, needsWindow: true, minShortSideM: 2.6 },
    { id: 'r2', targetAreaM2: 18, needsWindow: true, minShortSideM: 2.6 },
    { id: 'r3', targetAreaM2: 12, needsWindow: false, minShortSideM: 1.8 },
    { id: 'r4', targetAreaM2: 12, needsWindow: false, minShortSideM: 1.8 },
];

const sharedWallM = (a: Rect, b: Rect): number => {
    const vAbut = Math.abs(a.x1 - b.x0) < 0.05 || Math.abs(b.x1 - a.x0) < 0.05;
    const zOv = Math.min(a.z1, b.z1) - Math.max(a.z0, b.z0);
    const hAbut = Math.abs(a.z1 - b.z0) < 0.05 || Math.abs(b.z1 - a.z0) < 0.05;
    const xOv = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0);
    return Math.max(vAbut && zOv > 0 ? zOv : 0, hAbut && xOv > 0 ? xOv : 0);
};
const overlapM2 = (a: Rect, b: Rect): number =>
    Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0)) * Math.max(0, Math.min(a.z1, b.z1) - Math.max(a.z0, b.z0));

describe('§SPINE-TREE — packRoomsAlongSpineTree (multi-leg room pack)', () => {
    it('places every room on a corridor segment (each shares ≥ door-width wall with a corridor cell)', () => {
        const res = packRoomsAlongSpineTree(SHELL, L_SPINE, ROOMS)!;
        expect(res).not.toBeNull();
        expect(res.dropped).toEqual([]);
        expect(res.rooms.map(r => r.roomId).sort()).toEqual(['r1', 'r2', 'r3', 'r4']);
        for (const room of res.rooms) {
            const bestWall = Math.max(...res.corridorCells.map(c => sharedWallM(room.rect, c)));
            expect(bestWall, `${room.roomId} must share a door-width corridor wall`).toBeGreaterThanOrEqual(DOOR_W);
        }
    });

    it('no room overlaps any corridor cell (the corridor stays clear)', () => {
        const res = packRoomsAlongSpineTree(SHELL, L_SPINE, ROOMS)!;
        for (const room of res.rooms) {
            for (const c of res.corridorCells) {
                expect(overlapM2(room.rect, c), `${room.roomId} overlaps a corridor cell`).toBeLessThan(1e-3);
            }
        }
    });

    it('rooms stay inside the shell bbox', () => {
        const res = packRoomsAlongSpineTree(SHELL, L_SPINE, ROOMS)!;
        for (const room of res.rooms) {
            expect(room.rect.x0).toBeGreaterThanOrEqual(SHELL.x0 - 1e-6);
            expect(room.rect.z0).toBeGreaterThanOrEqual(SHELL.z0 - 1e-6);
            expect(room.rect.x1).toBeLessThanOrEqual(SHELL.x1 + 1e-6);
            expect(room.rect.z1).toBeLessThanOrEqual(SHELL.z1 + 1e-6);
        }
    });

    it('uses the LEG (a room combs off the vertical leg, not only the run)', () => {
        const res = packRoomsAlongSpineTree(SHELL, L_SPINE, ROOMS)!;
        const legCell = res.corridorCells[1]!;   // the vertical leg strip
        const someRoomOnLeg = res.rooms.some(room => sharedWallM(room.rect, legCell) >= DOOR_W);
        expect(someRoomOnLeg, 'at least one room must comb off the leg').toBe(true);
    });

    it('is deterministic', () => {
        const a = packRoomsAlongSpineTree(SHELL, L_SPINE, ROOMS);
        const b = packRoomsAlongSpineTree(SHELL, L_SPINE, ROOMS);
        expect(JSON.stringify(a)).toEqual(JSON.stringify(b));
    });

    it('reduces to a connected pack on a plain straight run (no legs)', () => {
        const straight: SpinePath = { segments: [L_SPINE.segments[0]!], widthM: 1.2, primaryAxis: 'x' };
        const res = packRoomsAlongSpineTree(SHELL, straight, ROOMS)!;
        expect(res.dropped).toEqual([]);
        for (const room of res.rooms) {
            const bestWall = Math.max(...res.corridorCells.map(c => sharedWallM(room.rect, c)));
            expect(bestWall).toBeGreaterThanOrEqual(DOOR_W);
        }
    });
});
