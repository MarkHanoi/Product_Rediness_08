// D-FLE F5/F7 — placement solver tests.
// Contract (SPEC-FURNITURE-LAYOUT-ENGINE §8): placed items lie inside the polygon;
// none overlap; deterministic; bed against the wall opposite the door.

import { describe, expect, it } from 'vitest';
import { furnishRoom } from '../src/workflows/furnishLayout/furnishRoom.js';
import { footprintRect, rectsOverlap, pointInPolygon } from '../src/workflows/furnishLayout/collision.js';
import type { FurnishRoomInput, Pt, Rect } from '../src/workflows/furnishLayout/types.js';

/** Rectangular room [0,0]→[w,d] with 4 walls + one door on the bottom wall. */
function rectRoom(occupancy: string, w: number, d: number): FurnishRoomInput {
    const poly: Pt[] = [{ x: 0, z: 0 }, { x: w, z: 0 }, { x: w, z: d }, { x: 0, z: d }];
    return {
        roomId: 'r1', levelId: 'L0', occupancy,
        polygon: poly, centroid: { x: w / 2, z: d / 2 }, areaM2: w * d,
        walls: [
            { a: { x: 0, z: 0 }, b: { x: w, z: 0 }, inwardNormal: { x: 0, z: 1 }, length: w, isExterior: true },
            { a: { x: 0, z: d }, b: { x: w, z: d }, inwardNormal: { x: 0, z: -1 }, length: w, isExterior: true },
            { a: { x: 0, z: 0 }, b: { x: 0, z: d }, inwardNormal: { x: 1, z: 0 }, length: d, isExterior: true },
            { a: { x: w, z: 0 }, b: { x: w, z: d }, inwardNormal: { x: -1, z: 0 }, length: d, isExterior: true },
        ],
        doors: [{ type: 'door', center: { x: w / 2, z: 0 }, normal: { x: 0, z: 1 }, width: 0.9 }],
        windows: [],
        levelElevation: 0,
    };
}

const rectOf = (p: { position: { x: number; z: number }; footprint: { w: number; l: number }; rotationY: number }): Rect =>
    footprintRect(p.position.x, p.position.z, p.footprint.w, p.footprint.l, p.rotationY);

const assertSane = (items: ReturnType<typeof furnishRoom>, poly: Pt[]): void => {
    for (const it of items) expect(pointInPolygon({ x: it.position.x, z: it.position.z }, poly)).toBe(true);
    const rects = items.map(rectOf);
    for (let i = 0; i < rects.length; i++)
        for (let j = i + 1; j < rects.length; j++)
            expect(rectsOverlap(rects[i]!, rects[j]!)).toBe(false);
};

describe('furnishRoom (D-FLE F5/F7)', () => {
    it('bedroom: bed + bedside tables (+wardrobe), all inside, non-overlapping', () => {
        const room = rectRoom('bedroom', 4, 3);
        const items = furnishRoom(room);
        expect(items.some(i => i.kind === 'bed')).toBe(true);
        expect(items.filter(i => i.kind === 'bedside_table').length).toBeGreaterThanOrEqual(1);
        assertSane(items, room.polygon as Pt[]);
        // bed is against the FAR wall (opposite the door on z=0) → bed z well above 0
        const bed = items.find(i => i.kind === 'bed')!;
        expect(bed.position.z).toBeGreaterThan(1.0);
    });

    it('living-room: sofa + coffee table, sane', () => {
        const room = rectRoom('living-room', 5, 4);
        const items = furnishRoom(room);
        expect(items.some(i => i.kind === 'sofa')).toBe(true);
        assertSane(items, room.polygon as Pt[]);
    });

    it('dining-room: table + chairs around it, sane', () => {
        const room = rectRoom('dining-room', 5, 4);
        const items = furnishRoom(room);
        expect(items.some(i => i.kind === 'dining_table')).toBe(true);
        expect(items.filter(i => i.kind === 'dining_chair').length).toBeGreaterThanOrEqual(1);
        assertSane(items, room.polygon as Pt[]);
    });

    it('no furniture overlaps the door swing', () => {
        const room = rectRoom('bedroom', 4, 3);
        const items = furnishRoom(room);
        const door = room.doors[0]!;
        const swing = footprintRect(door.center.x + door.normal.x * 0.45, door.center.z + door.normal.z * 0.45, door.width, 0.9, Math.atan2(door.normal.x, door.normal.z));
        for (const it of items) expect(rectsOverlap(rectOf(it), swing)).toBe(false);
    });

    it('is deterministic', () => {
        const room = rectRoom('bedroom', 4, 3);
        expect(JSON.stringify(furnishRoom(room))).toEqual(JSON.stringify(furnishRoom(room)));
    });

    it('a too-small room furnishes to []', () => {
        expect(furnishRoom(rectRoom('bedroom', 1.5, 1.5))).toEqual([]);   // below minAreaM2
        expect(furnishRoom(rectRoom('corridor', 6, 1.2))).toEqual([]);    // unfurnished type
    });
});
