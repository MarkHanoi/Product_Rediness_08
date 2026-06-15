// §BED-INTEGRATED-LAMP-SIDE (founder #7, 2026-06-15) — regression guard.
//
// The founder: the platform bed's bedside-table LAMPS are not placed on THIS bed's
// side surfaces — they sit inboard on the mattress instead of on the integrated
// nightstand boxes (platform) / wings (walnut), which sit OUTBOARD of the deck.
//
// Root cause: placeIntegratedBedLamps offset the lamps by `fp.w/2 − lampW/2` (≈ the
// deck edge). But the BedEngine attaches the bedside surfaces OUTBOARD of the deck:
//   platform nightstand centre = ±(deckW/2 + NS_W/2),  NS_W  = 0.50
//   walnut   wing      centre  = ±(deckW/2 + WING_W/2), WING_W = 0.40
// The fix offsets each lamp to its surface CENTRE (fp.w/2 + surfaceHalf/2).
//
// This suite forces the platform + walnut beds (the two integrated-no-mesh-lamp
// variants) against a wall and asserts each lamp sits OUTBOARD of the deck edge,
// over its nightstand/wing — and that the FLOAT bed gets NO separate lamps (its
// lamps are in the mesh) and the plain `bed` is unchanged.

import { describe, expect, it } from 'vitest';
import { furnishRoom } from '../src/workflows/furnishLayout/furnishRoom.js';
import { chooseBedType, bedHasIntegratedBedside, type BedType } from '../src/workflows/furnishLayout/bedVariety.js';
import type { FurnishRoomInput, Pt, PlacedFurniture } from '../src/workflows/furnishLayout/types.js';

// Per-variant integrated bedside-surface half-width (mirrors BedEngine + bedVariety).
const SURFACE_HALF_W: Readonly<Record<string, number>> = {
    japanese_platform_bed: 0.50,   // NS_W
    japanese_walnut_bed:   0.40,   // WING_W
};

/** A 4 × 3.4 m bedroom with one door on z=0 → bed anchors on the far (z=d) wall. */
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

function roomIdFor(want: BedType): string {
    for (let i = 0; i < 64; i++) {
        const id = `lamp-test-room-${i}`;
        if (chooseBedType(id) === want) return id;
    }
    throw new Error(`no room id maps to bed type ${want}`);
}

/** Along-wall (lateral) offset of a placed lamp from the bed centre. */
function lateralOffset(bed: PlacedFurniture, lamp: PlacedFurniture): number {
    const n: Pt = { x: Math.sin(bed.rotationY), z: Math.cos(bed.rotationY) };   // inward normal
    const d: Pt = { x: n.z, z: -n.x };                                          // along the wall
    return (lamp.position.x - bed.position.x) * d.x + (lamp.position.z - bed.position.z) * d.z;
}

describe('§BED-INTEGRATED-LAMP-SIDE — lamps sit ON the integrated bedside surfaces', () => {
    for (const type of ['japanese_platform_bed', 'japanese_walnut_bed'] as const) {
        it(`${type}: each lamp sits over its outboard nightstand/wing (not inboard on the mattress)`, () => {
            const room = bedroom(roomIdFor(type));
            const items = furnishRoom(room);
            const bed = items.find(i => i.kind === type);
            expect(bed, 'the chosen integrated bed must be placed').toBeDefined();
            const fpHalfW = bed!.footprint.w / 2;
            const surfHalf = SURFACE_HALF_W[type]!;
            const expectedSide = fpHalfW + surfHalf / 2;

            // The bedside lamps placed on the integrated surfaces: at the bed head,
            // offset laterally to ±expectedSide. Identify them by their lateral offset.
            const lamps = items.filter(i => i.kind === 'lamp'
                && Math.abs(Math.abs(lateralOffset(bed!, i)) - expectedSide) < 1e-6);
            expect(lamps.length, 'two bedside lamps, one per integrated surface').toBe(2);

            for (const lamp of lamps) {
                const off = Math.abs(lateralOffset(bed!, lamp));
                // OUTBOARD of the deck edge (the founder's complaint: they were inboard).
                expect(off).toBeGreaterThan(fpHalfW);
                // ON the surface (within its lateral span, not past its outer edge).
                expect(off).toBeGreaterThanOrEqual(fpHalfW);
                expect(off).toBeLessThanOrEqual(fpHalfW + surfHalf + 1e-6);
            }
        });
    }

    it('float bed: NO separate bedside lamps (its lamps are built into the mesh)', () => {
        const type: BedType = 'japanese_float_bed';
        const room = bedroom(roomIdFor(type));
        const items = furnishRoom(room);
        const bed = items.find(i => i.kind === type);
        expect(bed).toBeDefined();
        const fpHalfW = bed!.footprint.w / 2;
        // No lamp sits at a bed-head bedside offset (the corner floor lamp, if any,
        // is far from the bed head, not at ±~fp.w/2 along the head wall).
        const bedsideLamps = items.filter(i => i.kind === 'lamp'
            && Math.abs(Math.abs(lateralOffset(bed!, i)) - fpHalfW) < 0.6);
        expect(bedsideLamps.length).toBe(0);
    });

    it('plain bed: separate bedside tables carry the lamps (integrated path not used)', () => {
        const type: BedType = 'bed';
        const room = bedroom(roomIdFor(type));
        const items = furnishRoom(room);
        const bed = items.find(i => i.kind === 'bed');
        expect(bed).toBeDefined();
        expect(bedHasIntegratedBedside('bed')).toBe(false);
        // The plain bed dresses via separate bedside_table pieces (each with a lamp).
        const tables = items.filter(i => i.kind === 'bedside_table');
        expect(tables.length).toBeGreaterThan(0);
        const lampsOnTables = items.filter(i => i.kind === 'lamp'
            && tables.some(t => Math.hypot(t.position.x - i.position.x, t.position.z - i.position.z) < 0.05));
        expect(lampsOnTables.length).toBe(tables.length);
    });
});
