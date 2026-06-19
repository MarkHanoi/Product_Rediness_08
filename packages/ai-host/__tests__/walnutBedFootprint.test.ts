// §BED-OCCUPIED-FOOTPRINT + §RUG-AT-FOOT (founder, 2026-06-19) — regression guard.
//
// The founder, testing the built house: the `japanese_walnut_bed` (a) had its head
// driven INTO the wall, (b) had its rug HIDDEN under the deck (should sit at the
// feet, visible), and (c) had the dresser / wardrobe CLASH it. Root: the integrated
// bed's 3D mesh (BedEngine.buildWalnut) is 2.60 W × 2.35 L (deck 1.80×2.30 + 0.40
// bedside wings each side + 0.05 headboard), but the placement reserved only the
// 1.80×2.30 DECK as the obstacle, so neighbours overlapped the wings. The fix
// reserves the FULL occupied box for collision (deck `footprint` stays unchanged —
// it drives the geometry + lamp anchor + wardrobe wall length) and shifts the rug to
// the foot — both SCOPED to the integrated beds so the plain `bed` stays byte-
// identical (the founder confirmed "with the plain bed everything fits perfectly").

import { describe, expect, it } from 'vitest';
import { furnishRoom } from '../src/workflows/furnishLayout/furnishRoom.js';
import { chooseBedType, type BedType } from '../src/workflows/furnishLayout/bedVariety.js';
import { footprintCorners, quadsOverlap, pointInPolygon } from '../src/workflows/furnishLayout/collision.js';
import type { FurnishRoomInput, Pt } from '../src/workflows/furnishLayout/types.js';

/** A w × d bedroom [0,0]→[w,d] with one door on the bottom wall (z = 0), so the bed
 *  anchors on the FAR (z = d) wall. `roomId` steers the deterministic bed-type pick. */
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

/** Find a room id whose deterministic bed-type choice is `want`. */
function roomIdFor(want: BedType): string {
    for (let i = 0; i < 64; i++) {
        const id = `bed-test-room-${i}`;
        if (chooseBedType(id) === want) return id;
    }
    throw new Error(`no room id maps to bed type ${want}`);
}

describe('§BED-OCCUPIED-FOOTPRINT — the walnut bed reserves its full occupied box', () => {
    it('walnut bed: the FULL occupied box (deck + 0.40 wings each side + 0.05 head) lies inside the room', () => {
        const room = bedroom(roomIdFor('japanese_walnut_bed'));
        const items = furnishRoom(room);
        const bed = items.find(i => i.kind === 'japanese_walnut_bed');
        expect(bed, 'walnut bed must be placed').toBeDefined();
        const n: Pt = { x: Math.sin(bed!.rotationY), z: Math.cos(bed!.rotationY) };
        // occupied: width + 2×0.40 wings, length + 0.05 head, shifted 0.025 toward head.
        const occ = footprintCorners(
            bed!.position.x - n.x * 0.025, bed!.position.z - n.z * 0.025,
            bed!.footprint.w + 0.80, bed!.footprint.l + 0.05, bed!.rotationY,
        );
        for (const c of occ)
            expect(pointInPolygon({ x: c.x, z: c.z }, room.polygon as Pt[]),
                `occupied corner (${c.x.toFixed(2)},${c.z.toFixed(2)}) must be inside the room`).toBe(true);
    });

    it('walnut bed: dresser + wardrobe clear the FULL occupied footprint (not just the deck)', () => {
        const room = bedroom(roomIdFor('japanese_walnut_bed'), 4.6, 4.2);   // side-wall space for a dresser/wardrobe
        const items = furnishRoom(room);
        const bed = items.find(i => i.kind === 'japanese_walnut_bed')!;
        const n: Pt = { x: Math.sin(bed.rotationY), z: Math.cos(bed.rotationY) };
        const occ = footprintCorners(
            bed.position.x - n.x * 0.025, bed.position.z - n.z * 0.025,
            bed.footprint.w + 0.80, bed.footprint.l + 0.05, bed.rotationY,
        );
        const neighbours = items.filter(i => i.kind === 'dresser' || i.kind === 'wardrobe');
        for (const piece of neighbours) {
            const pq = footprintCorners(piece.position.x, piece.position.z, piece.footprint.w, piece.footprint.l, piece.rotationY);
            expect(quadsOverlap(occ, pq), `${piece.kind} overlaps the walnut bed's occupied footprint`).toBe(false);
        }
    });
});

describe('§RUG-AT-FOOT — the rug is visible at the feet of an integrated bed', () => {
    it('walnut bed: rug centre shifts toward the FOOT (not centred under the deck)', () => {
        const room = bedroom(roomIdFor('japanese_walnut_bed'));
        const items = furnishRoom(room);
        const bed = items.find(i => i.kind === 'japanese_walnut_bed')!;
        const rug = items.find(i => i.kind === 'rug');
        expect(rug, 'a rug must be placed under/at the bed').toBeDefined();
        const n: Pt = { x: Math.sin(bed.rotationY), z: Math.cos(bed.rotationY) };  // inward → toward foot
        const along = (rug!.position.x - bed.position.x) * n.x + (rug!.position.z - bed.position.z) * n.z;
        expect(along, 'rug centre must be foot-ward of the bed centre').toBeGreaterThan(0.3);
    });

    it('plain bed: rug stays centred under the bed (byte-identical — the plain bed is untouched)', () => {
        const room = bedroom(roomIdFor('bed'));
        const items = furnishRoom(room);
        const bed = items.find(i => i.kind === 'bed')!;
        const rug = items.find(i => i.kind === 'rug');
        expect(rug, 'a rug must be placed under the plain bed').toBeDefined();
        expect(rug!.position.x).toBeCloseTo(bed.position.x, 6);
        expect(rug!.position.z).toBeCloseTo(bed.position.z, 6);
    });
});
