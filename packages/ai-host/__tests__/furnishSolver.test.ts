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

    describe('§FURNITURE-SPEC excludeWindowWall (door-vector-aware placement)', () => {
        // Same 4 × 3 bedroom (door on the bottom wall) but the wall OPPOSITE
        // the door (z = 3) now carries a window. Without the exclusion,
        // `wall-opposite-door` lands the bed on the window wall (z ≈ 2.05) and
        // `wall-longest` may pick it for the wardrobe — the architect's spec
        // forbids both (privacy + thermal envelope + daylight blocking).
        const windowOppositeDoor = (w: number, d: number): FurnishRoomInput => {
            const r = rectRoom('bedroom', w, d);
            return { ...r, windows: [{ type: 'window', center: { x: w / 2, z: d }, normal: { x: 0, z: -1 }, width: 1.5 }] };
        };

        it('bedroom bed never anchors on the window wall', () => {
            const room = windowOppositeDoor(4, 3);
            const bed = furnishRoom(room).find(i => i.kind === 'bed');
            expect(bed).toBeDefined();
            // A bed against the window wall (z = 3) has centre z ≈ 3 − 1.9/2 ≈ 2.05.
            // A side-wall placement puts the centre near the room z-midpoint (1.5).
            expect(bed!.position.z).toBeLessThan(2.0);
        });

        it('bedroom wardrobe never anchors on the window wall', () => {
            const room = windowOppositeDoor(4, 3);
            const wardrobe = furnishRoom(room).find(i => i.kind === 'wardrobe');
            // The wardrobe is `required: true` — must be placed somewhere — but
            // never against the window wall (whose footprint would put z ≈ 2.7).
            if (wardrobe) expect(wardrobe.position.z).toBeLessThan(2.5);
        });
    });

    describe('§FURNITURE-SPEC corner-anchor sort (farthest from door)', () => {
        // Architect's rule: the shower / lamp / plant goes in the corner
        // FARTHEST from the door — not the first corner the loop happens to
        // hit. A 3 × 2 bathroom (door bottom-centre) is the boundary case: the
        // bottom-left/right corners just clear the door swing rect and would
        // be picked first by the old fixed-order loop.

        it('bathroom shower lands in a far-from-door (top half) corner', () => {
            const room = rectRoom('bathroom', 3, 2);
            const shower = furnishRoom(room).find(i => i.kind === 'shower_glass_panel');
            expect(shower).toBeDefined();
            // Door centre is at z = 0; the FAR corners are at z ≈ 1.53 (top
            // half of the room). A near-corner placement would have z ≈ 0.47.
            expect(shower!.position.z).toBeGreaterThan(1.0);
        });
    });

    describe('§FURNITURE-SPEC excludeDoorSwing (anchor wall ≠ door wall)', () => {
        // Bathroom toilet anchored 'wall-longest' would land on the BOTTOM wall
        // (the door wall, tied length 2.5 m with the top wall but first in
        // input order), slid past the door obstacle to (2.0, 0.37) — toilet
        // greets the user as they open the door. excludeDoorSwing prefers a
        // wall WITHOUT the door so the toilet anchors on the TOP wall instead.
        it('bathroom toilet anchors on the wall opposite the door', () => {
            const room = rectRoom('bathroom', 2.5, 2);
            const toilet = furnishRoom(room).find(i => i.kind === 'toilet_radiator');
            expect(toilet).toBeDefined();
            // Toilet on the top wall has centre z ≈ 2 − 0.7/2 − 0.02 ≈ 1.63;
            // toilet on the bottom (door) wall would have centre z ≈ 0.37.
            expect(toilet!.position.z).toBeGreaterThan(1.0);
        });

        // Kitchen run on the door wall blocks the working triangle. The L-run
        // should anchor on a wall without the door — picks the opposite wall.
        it('kitchen run anchors on the wall opposite the door', () => {
            // 3.5 × 3 room — door on the bottom wall; the L-run must clear it.
            const room = rectRoom('kitchen', 3.5, 3);
            const run = furnishRoom(room).find(i => i.kind === 'kitchen_l_shape');
            expect(run).toBeDefined();
            // The kitchen run (3.0 × 0.6) anchored on the TOP wall has centre
            // z ≈ 3 − 0.6/2 − 0.02 ≈ 2.68; on the bottom (door) wall it would
            // sit at z ≈ 0.32.
            expect(run!.position.z).toBeGreaterThan(1.5);
        });

        // Bedroom wardrobe MUST still be placed (it's required) even when
        // both filters (window-wall + door-wall) leave only two short side
        // walls and the bed has already claimed one of them.
        it('bedroom wardrobe still places when filters over-constrain (cascading fallback)', () => {
            const base = rectRoom('bedroom', 4, 3);
            const room: FurnishRoomInput = {
                ...base,
                windows: [{ type: 'window', center: { x: 2, z: 3 }, normal: { x: 0, z: -1 }, width: 1.5 }],
            };
            const items = furnishRoom(room);
            expect(items.some(i => i.kind === 'bed')).toBe(true);
            expect(items.some(i => i.kind === 'wardrobe')).toBe(true);
        });
    });

    describe('single-pass archetype order (bedsides placed before lamp)', () => {
        // Architect's rule: bedroom has BED + 2 BEDSIDE TABLES + WARDROBE + LAMP.
        // With the prior two-pass model the lamp (Pass 1, corner) was placed
        // before the bedsides (Pass 2, beside-leader) and took the corner one
        // bedside needed — only 1 bedside fit. Single-pass in archetype order
        // places the bedsides immediately after the bed; the lamp yields.
        it('bedroom with window opposite door places BOTH bedsides', () => {
            const base = rectRoom('bedroom', 4, 3);
            const room: FurnishRoomInput = {
                ...base,
                windows: [{ type: 'window', center: { x: 2, z: 3 }, normal: { x: 0, z: -1 }, width: 1.5 }],
            };
            const items = furnishRoom(room);
            expect(items.filter(i => i.kind === 'bedside_table').length).toBe(2);
        });
    });

    describe('open-plan merged room (furnishRoomCompound)', () => {
        // The apartment-layout's open-plan case: living + kitchen + dining
        // merge into ONE detected room. furnishRoomCompound runs all three
        // archetypes within the same polygon, sharing the obstacle set, so
        // the kitchen run + dining table + sofa all land without collision.
        it('places sofa + kitchen run + dining table in one merged 8 x 6 room', async () => {
            const { furnishRoomCompound } = await import('../src/workflows/furnishLayout/furnishRoom.js');
            const room = rectRoom('living-room', 8, 6);
            const placed = furnishRoomCompound(room, ['living-room', 'kitchen', 'dining-room']);
            expect(placed.some(p => p.kind === 'sofa')).toBe(true);
            expect(placed.some(p => p.kind === 'kitchen_l_shape')).toBe(true);
            expect(placed.some(p => p.kind === 'dining_table')).toBe(true);
        });

        // Unknown / corridor occupancies are silently skipped (the bubble
        // graph's compound may include 'corridor' or 'entrance-lobby' which
        // contribute no furniture).
        it('silently skips occupancies without an archetype', async () => {
            const { furnishRoomCompound } = await import('../src/workflows/furnishLayout/furnishRoom.js');
            const room = rectRoom('living-room', 6, 5);
            const placed = furnishRoomCompound(room, ['living-room', 'corridor', 'not-a-real-occupancy']);
            expect(placed.some(p => p.kind === 'sofa')).toBe(true);
        });
    });

    describe('§FURNITURE-SPEC clearFront (working zone reserved)', () => {
        // The toilet has 60 cm knee clearance; later items must not occupy
        // the strip in front of it. The bathroom shower (corner-anchored) is
        // placed AFTER the toilet — it must avoid the toilet's clear-front.
        it('bathroom shower never sits inside the toilet knee-clearance zone', () => {
            const room = rectRoom('bathroom', 2.5, 2);
            const items = furnishRoom(room);
            const toilet = items.find(i => i.kind === 'toilet_radiator');
            const shower = items.find(i => i.kind === 'shower_glass_panel');
            expect(toilet).toBeDefined();
            expect(shower).toBeDefined();
            // Toilet on top wall (z ≈ 1.63) faces -z; its clear-front zone is
            // the strip at z ∈ [1.63 − 0.7/2 − 0.6, 1.63 − 0.7/2] ≈ [0.68, 1.28]
            // over the toilet's x span. The shower's centre must NOT lie inside.
            const tcx = toilet!.position.x, tcz = toilet!.position.z;
            const dx = Math.abs(shower!.position.x - tcx);
            const dz = tcz - shower!.position.z;
            const inFront = dx < (0.4 / 2 + 0.9 / 2) && dz > 0.35 && dz < 0.95;
            expect(inFront).toBe(false);
        });
    });
});
