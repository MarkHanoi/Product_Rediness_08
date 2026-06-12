// §BED-HEADBOARD-FLUSH (founder #7, 2026-06-12) — regression guard.
//
// The founder: "some beds go THROUGH the internal wall on the cabezero (headboard)."
// Root cause: the Japanese bed variants' headboard mesh protrudes behind the
// footprint's back edge (the walnut bed's footprint was also 0.60 m shorter than its
// 2.60 m deck), so the generic wall-anchored placement — which only recesses the
// FOOTPRINT back to GAP off the wall — left the headboard penetrating the head wall.
//
// This suite forces EACH of the four picker bed types against a wall (by selecting a
// room id that the deterministic `chooseBedType` hash maps to it) and asserts:
//   (1) the bed's REAR-most mesh face (the headboard back) is on the room side of the
//       wall — i.e. it does NOT penetrate the wall (rear edge ≥ wall inner face), and
//   (2) the whole bed (deck + headboard) lies inside the room polygon.

import { describe, expect, it } from 'vitest';
import { furnishRoom } from '../src/workflows/furnishLayout/furnishRoom.js';
import { chooseBedType, type BedType } from '../src/workflows/furnishLayout/bedVariety.js';
import { footprintCorners, pointInPolygon } from '../src/workflows/furnishLayout/collision.js';
import type { FurnishRoomInput, Pt } from '../src/workflows/furnishLayout/types.js';

// The per-variant headboard rear overhang (metres the headboard mesh extends behind
// the footprint back edge), mirroring BED_REAR_OVERHANG in placeSolver — used to
// reconstruct the TRUE rear-most face of the bed mesh for the no-penetration check.
const REAR_OVERHANG: Readonly<Record<string, number>> = {
    bed: 0,
    japanese_platform_bed: 0.05,
    japanese_float_bed: 0.05,
    japanese_walnut_bed: 0.05,
    nordic_bed: 0.04,
    solid_wood_bed: 0.05,
};
const BED_KINDS = new Set<string>(Object.keys(REAR_OVERHANG));
const isAnyBed = (k: string): boolean => BED_KINDS.has(k);

/** A 4 × 3.4 m bedroom [0,0]→[w,d] with one door on the bottom wall (z = 0), so the
 *  bed anchors on the FAR (z = d) wall whose inward normal is (0,-1). The room is
 *  large enough that every (larger) Japanese variant fits. `roomId` is parameterised
 *  so we can steer the deterministic bed-type choice. */
function bedroom(roomId: string, w = 4, d = 3.4): FurnishRoomInput {
    const poly: Pt[] = [{ x: 0, z: 0 }, { x: w, z: 0 }, { x: w, z: d }, { x: 0, z: d }];
    return {
        roomId, levelId: 'L0', occupancy: 'bedroom',
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

/** Find a room id whose deterministic bed-type choice is `want` (the hash rotates
 *  across all four, so each is reachable within a small id sweep). */
function roomIdFor(want: BedType): string {
    for (let i = 0; i < 64; i++) {
        const id = `bed-test-room-${i}`;
        if (chooseBedType(id) === want) return id;
    }
    throw new Error(`no room id maps to bed type ${want}`);
}

const ALL_TYPES: readonly BedType[] = ['bed', 'japanese_platform_bed', 'japanese_float_bed', 'japanese_walnut_bed'];

describe('§BED-HEADBOARD-FLUSH — no bed headboard penetrates its head wall', () => {
    for (const type of ALL_TYPES) {
        it(`${type}: headboard sits flush against the wall (no penetration) + bed fully inside the room`, () => {
            const room = bedroom(roomIdFor(type));
            const items = furnishRoom(room);
            const bed = items.find(i => isAnyBed(i.kind));
            expect(bed, `a bed must be placed`).toBeDefined();
            // The chosen type must be the one we steered to.
            expect(bed!.kind).toBe(type);

            // Bed inward normal (into the room) — its back/head faces −n.
            const n: Pt = { x: Math.sin(bed!.rotationY), z: Math.cos(bed!.rotationY) };
            const fp = bed!.footprint;
            const overhang = REAR_OVERHANG[bed!.kind] ?? 0;

            // The head wall this bed anchors on: the wall whose inward normal best
            // matches the bed's inward normal (the bed faces away from that wall).
            const headWall = room.walls.reduce((best, wcur) =>
                (wcur.inwardNormal.x * n.x + wcur.inwardNormal.z * n.z) >
                (best.inwardNormal.x * n.x + best.inwardNormal.z * n.z) ? wcur : best);
            const wn = headWall.inwardNormal;
            // Signed wall-face coordinate along the inward normal (a point on the wall).
            const wallFace = headWall.a.x * wn.x + headWall.a.z * wn.z;

            // The bed's REAR-most mesh face = footprint back edge pushed a further
            // `overhang` toward the wall:  centre − n·(fp.l/2 + overhang).
            const rearX = bed!.position.x - n.x * (fp.l / 2 + overhang);
            const rearZ = bed!.position.z - n.z * (fp.l / 2 + overhang);
            const rearFace = rearX * wn.x + rearZ * wn.z;

            // No penetration: the rear face is on the ROOM side of (or on) the wall
            // face — i.e. its inward-normal coordinate ≥ the wall's, within a hair.
            expect(rearFace,
                `${type} headboard PENETRATES the wall: rearFace=${rearFace.toFixed(3)} < wallFace=${wallFace.toFixed(3)}`,
            ).toBeGreaterThanOrEqual(wallFace - 1e-6);
            // And it is essentially flush (within the standard clearance ~GAP), not
            // floating far off the wall.
            expect(rearFace - wallFace).toBeLessThan(0.10);

            // The whole bed (deck + headboard) lies inside the room polygon. Build a
            // rear-extended quad spanning fp.l + overhang and require all corners in.
            const fullLen = fp.l + overhang;
            const fullCtr = { x: bed!.position.x - n.x * (overhang / 2), z: bed!.position.z - n.z * (overhang / 2) };
            const quad = footprintCorners(fullCtr.x, fullCtr.z, fp.w, fullLen, bed!.rotationY);
            for (const c of quad)
                expect(pointInPolygon({ x: c.x, z: c.z }, room.polygon as Pt[]),
                    `${type} corner (${c.x.toFixed(2)},${c.z.toFixed(2)}) must be inside the room`).toBe(true);
        });
    }
});
