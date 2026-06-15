// §VANITY-FLUSH (founder, 2026-06-15) — vanity_table wall-anchor no-penetration.
//
// The founder: the auto-furnished vanity_table showed Z = −1.268 m, "going
// through the wall". The vanity anchors on the WINDOW wall (archetype
// `wall-window`) with its back (the integrated mirror) on the wall. Unlike the
// Japanese beds, the vanity mesh has NO rear overhang — every mesh component
// sits within ±L/2 (the mirror is flush at −L/2) — so the generic wall-anchor
// placement, which recesses the FOOTPRINT back to GAP off the wall, must leave
// the whole vanity inside the room with its back face flush (not through) the
// wall. This suite pins that no-penetration invariant.

import { describe, expect, it } from 'vitest';
import { furnishRoom } from '../src/workflows/furnishLayout/furnishRoom.js';
import { footprintCorners, pointInPolygon } from '../src/workflows/furnishLayout/collision.js';
import type { FurnishRoomInput, Pt } from '../src/workflows/furnishLayout/types.js';

/** A 4 × 3.4 m bedroom with a door on the bottom wall (z = 0) and a WINDOW on
 *  the far wall (z = d) so the vanity anchors on the window wall (inward normal
 *  (0,−1)). Large enough to seat the bed, wardrobe, dresser AND the vanity. */
function bedroom(w = 4, d = 3.4): FurnishRoomInput {
    const poly: Pt[] = [{ x: 0, z: 0 }, { x: w, z: 0 }, { x: w, z: d }, { x: 0, z: d }];
    return {
        roomId: 'vanity-room', levelId: 'L0', occupancy: 'bedroom',
        polygon: poly, centroid: { x: w / 2, z: d / 2 }, areaM2: w * d,
        walls: [
            { a: { x: 0, z: 0 }, b: { x: w, z: 0 }, inwardNormal: { x: 0, z: 1 }, length: w, isExterior: true },
            { a: { x: 0, z: d }, b: { x: w, z: d }, inwardNormal: { x: 0, z: -1 }, length: w, isExterior: true },
            { a: { x: 0, z: 0 }, b: { x: 0, z: d }, inwardNormal: { x: 1, z: 0 }, length: d, isExterior: true },
            { a: { x: w, z: 0 }, b: { x: w, z: d }, inwardNormal: { x: -1, z: 0 }, length: d, isExterior: true },
        ],
        doors: [{ type: 'door', center: { x: w / 2, z: 0 }, normal: { x: 0, z: 1 }, width: 0.9 }],
        windows: [{ type: 'window', center: { x: w / 2, z: d }, normal: { x: 0, z: -1 }, width: 1.2 }],
        levelElevation: 0,
    };
}

describe('§VANITY-FLUSH — the vanity_table sits against (not through) its wall', () => {
    it('vanity back face is on the room side of its wall + the whole vanity is inside the room', () => {
        const room = bedroom();
        const items = furnishRoom(room);
        const vanity = items.find(i => i.kind === 'vanity_table');
        expect(vanity, 'a vanity_table must be placed in the bedroom').toBeDefined();

        // Inward normal (into the room); the vanity back (mirror) faces −n.
        const n: Pt = { x: Math.sin(vanity!.rotationY), z: Math.cos(vanity!.rotationY) };
        const fp = vanity!.footprint;

        // The wall the vanity anchors on: the one whose inward normal best matches
        // the vanity's inward normal (the back faces away from it).
        const wall = room.walls.reduce((best, wcur) =>
            (wcur.inwardNormal.x * n.x + wcur.inwardNormal.z * n.z) >
            (best.inwardNormal.x * n.x + best.inwardNormal.z * n.z) ? wcur : best);
        const wn = wall.inwardNormal;
        const wallFace = wall.a.x * wn.x + wall.a.z * wn.z;

        // Rear-most mesh face = footprint back edge (NO rear overhang on the vanity).
        const rearX = vanity!.position.x - n.x * (fp.l / 2);
        const rearZ = vanity!.position.z - n.z * (fp.l / 2);
        const rearFace = rearX * wn.x + rearZ * wn.z;

        // No penetration: the back face is on the room side of (or on) the wall.
        expect(rearFace,
            `vanity back PENETRATES the wall: rearFace=${rearFace.toFixed(3)} < wallFace=${wallFace.toFixed(3)}`,
        ).toBeGreaterThanOrEqual(wallFace - 1e-6);
        // And essentially flush (within ~GAP), not floating off the wall.
        expect(rearFace - wallFace).toBeLessThan(0.10);

        // The whole vanity footprint lies inside the room polygon.
        const quad = footprintCorners(vanity!.position.x, vanity!.position.z, fp.w, fp.l, vanity!.rotationY);
        for (const c of quad)
            expect(pointInPolygon({ x: c.x, z: c.z }, room.polygon as Pt[]),
                `vanity corner (${c.x.toFixed(2)},${c.z.toFixed(2)}) must be inside the room`).toBe(true);
    });
});
