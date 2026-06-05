// D-FLE F-Sprint-5 — post-furnish circulation gate tests.

import { describe, expect, it } from 'vitest';
import { validateFurnishedRoom } from '../src/workflows/furnishLayout/validate.js';
import { footprintOf } from '../src/workflows/furnishLayout/footprints.js';
import type { FurnishRoomInput, PlacedFurniture, Pt } from '../src/workflows/furnishLayout/types.js';

const rectRoom = (w: number, d: number): FurnishRoomInput => {
    const poly: Pt[] = [{ x: 0, z: 0 }, { x: w, z: 0 }, { x: w, z: d }, { x: 0, z: d }];
    return {
        roomId: 'r1', levelId: 'L0', occupancy: 'bedroom',
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
};

const place = (kind: PlacedFurniture['kind'], x: number, z: number, yaw = 0): PlacedFurniture => ({
    kind,
    position: { x, y: 0, z },
    rotationY: yaw,
    footprint: footprintOf(kind),
    hostedSpaceId: 'r1',
});

describe('validateFurnishedRoom', () => {
    it('an empty room is valid (no placed items, no warnings)', () => {
        const r = validateFurnishedRoom(rectRoom(4, 3), []);
        expect(r.ok).toBe(true);
        expect(r.warnings).toEqual([]);
        expect(r.roomId).toBe('r1');
    });

    it('a bed at the top wall of a 5 × 4 room leaves the door→centroid path clear', () => {
        // In a 4 × 3 bedroom the bed's footprint REACHES the centroid (room is
        // too tight for straight-line access to it from the door) — that's a
        // correct soft-warning from the validator. For a CLEAR case we need a
        // larger room: 5 × 4 — centroid (2.5, 2); bed against top wall has
        // its foot at z ≈ 2.08, so the door→centroid segment z ∈ [0.5, 2.0]
        // does not enter the bed footprint.
        const room = rectRoom(5, 4);
        const bed = place('bed', 2.5, 3.03, Math.PI);
        const r = validateFurnishedRoom(room, [bed]);
        expect(r.ok).toBe(true);
    });

    it('a bed placed in the middle of the room blocks the door→centroid path', () => {
        const room = rectRoom(4, 3);
        // Bed centred on the room. Door entry (2, 0.5) → centroid (2, 1.5) is
        // a straight line in +z; the bed footprint (1.35 × 1.90) at (2, 1.5)
        // intersects that segment.
        const bed = place('bed', 2, 1.5, 0);
        const r = validateFurnishedRoom(room, [bed]);
        expect(r.ok).toBe(false);
        expect(r.warnings.some(w => w.includes('door[0] → centroid path BLOCKED by bed'))).toBe(true);
    });

    it('two overlapping items both warn', () => {
        const room = rectRoom(4, 3);
        const a = place('bed', 1, 2, 0);
        const b = place('wardrobe', 1, 2, 0);
        const r = validateFurnishedRoom(room, [a, b]);
        expect(r.ok).toBe(false);
        expect(r.warnings.some(w => w.includes('OVERLAPS'))).toBe(true);
    });

    it('an item whose centre is outside the polygon warns', () => {
        const room = rectRoom(4, 3);
        // Lamp at (5, 1.5) — outside the 4 × 3 room.
        const lamp = place('lamp', 5, 1.5, 0);
        const r = validateFurnishedRoom(room, [lamp]);
        expect(r.ok).toBe(false);
        expect(r.warnings.some(w => w.includes('OUTSIDE the room polygon'))).toBe(true);
    });

    it('§FURNISH-OBB-VALIDATE: a bedside placed BESIDE a ROTATED bed is NOT a false-positive overlap', () => {
        // Regression for the founder-reported "bed OVERLAPS bedside_table" on
        // non-orthogonal rooms. Bed + bedside both yawed 30°, the bedside set one
        // small gap clear along the bed's WIDTH axis (local +x = (cos,−sin)).
        // Their TRUE oriented footprints do not overlap, but their axis-aligned
        // bounding boxes DO — so the old AABB validator warned falsely.
        const room = rectRoom(7, 5);
        const yaw = Math.PI / 6;
        const bedFp = footprintOf('bed');           // w 1.35
        const bsFp = footprintOf('bedside_table');  // w 0.45
        const off = bedFp.w / 2 + bsFp.w / 2 + 0.05; // 0.95 m, 5 cm gap
        const bx = 3, bz = 2.5;
        const bed = place('bed', bx, bz, yaw);
        // width-axis unit for this yaw convention = (cos, −sin)
        const bs = place('bedside_table', bx + off * Math.cos(yaw), bz - off * Math.sin(yaw), yaw);
        const r = validateFurnishedRoom(room, [bed, bs]);
        // The whole point: NO phantom overlap between the bed and its bedside.
        expect(r.warnings.filter(w => w.includes('OVERLAPS'))).toEqual([]);
    });

    it('§FURNISH-OBB-VALIDATE: a genuine overlap of two ROTATED items still warns', () => {
        const room = rectRoom(7, 5);
        const yaw = Math.PI / 6;
        // Bed + wardrobe at the SAME centre + rotation → real overlap.
        const bed = place('bed', 3, 2.5, yaw);
        const wardrobe = place('wardrobe', 3, 2.5, yaw);
        const r = validateFurnishedRoom(room, [bed, wardrobe]);
        expect(r.warnings.some(w => w.includes('OVERLAPS'))).toBe(true);
    });

    it('a door whose normal points OUT of the room is silently skipped (no false positive)', () => {
        const room = rectRoom(4, 3);
        // Same door geometry but flipped normal → entry point would be at
        // (2, −0.5), outside the polygon. The validator skips the path test
        // for that door rather than asserting a blocked path.
        const flipped: FurnishRoomInput = {
            ...room,
            doors: [{ type: 'door', center: { x: 2, z: 0 }, normal: { x: 0, z: -1 }, width: 0.9 }],
        };
        const bed = place('bed', 2, 1.5, 0);
        const r = validateFurnishedRoom(flipped, [bed]);
        // The only warning should be the bed (still blocks the rooms's
        // centroid via any meaningful path, but the door check skipped → no
        // "path BLOCKED" warning).
        expect(r.warnings.some(w => w.includes('path BLOCKED'))).toBe(false);
    });
});
