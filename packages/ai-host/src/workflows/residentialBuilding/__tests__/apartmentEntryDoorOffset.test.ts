// §RESI-ENTRY-INTO-CORRIDOR — the apartment front door must open into the INTERNAL corridor
// (circulation), not a habitable room. `resolveEntryDoorOffset` aligns the door's along-edge
// offset to where the corridor/hall meets the corridor-facing cell edge. These cases pin that the
// resolved offset lands WITHIN the corridor's edge-span (not the bedroom's), and that it returns
// null (centred fallback) when no circulation room reaches the edge.
import { describe, it, expect } from 'vitest';
import { resolveEntryDoorOffset, type EntryRoomLite } from '../apartmentEntryDoorOffset.js';
import type { Rect } from '../../apartmentLayout/tgl/rectDecomposition.js';

// A 6 m (x) × 8 m (z) apartment cell, corridor-facing edge = z0 (the south wall x∈[0,6]).
const CELL: Rect = { x0: 0, z0: 0, x1: 6, z1: 8 };
// Plan-mm polygon from cell-metre rect corners (plan-y = world-z).
const polyMm = (x0: number, z0: number, x1: number, z1: number): EntryRoomLite['polygon'] => [
    { x: x0 * 1000, y: z0 * 1000 }, { x: x1 * 1000, y: z0 * 1000 },
    { x: x1 * 1000, y: z1 * 1000 }, { x: x0 * 1000, y: z1 * 1000 },
];

describe('resolveEntryDoorOffset — §RESI-ENTRY-INTO-CORRIDOR', () => {
    it('lands the door within the CORRIDOR span on the door edge (not the bedroom)', () => {
        // Corridor is a central vertical spine x∈[2.5,3.5] reaching the z0 edge; bedrooms either side.
        const rooms: EntryRoomLite[] = [
            { type: 'bedroom', polygon: polyMm(0, 0, 2.5, 8) },     // left bedroom touches z0
            { type: 'corridor', polygon: polyMm(2.5, 0, 3.5, 8) },  // central corridor reaches z0
            { type: 'bedroom', polygon: polyMm(3.5, 0, 6, 8) },     // right bedroom touches z0
        ];
        const res = resolveEntryDoorOffset(rooms, 'z0', CELL, 0.9);
        expect(res).not.toBeNull();
        // The corridor edge-span is x∈[2.5,3.5] (centre 3.0). The door (w=0.9) centres there ⇒
        // offset = 3.0 − 0.45 = 2.55; door span [2.55, 3.45] ⊆ the corridor span (with the leaf).
        expect(res!.offset).toBeCloseTo(2.55, 3);
        const doorLo = res!.offset, doorHi = res!.offset + 0.9;
        const doorCentre = (doorLo + doorHi) / 2;
        // The door centre falls inside the corridor span, NOT either bedroom span.
        expect(doorCentre).toBeGreaterThan(2.5);
        expect(doorCentre).toBeLessThan(3.5);
    });

    it('handles a hall (entry-hall) reaching the edge the same way', () => {
        const rooms: EntryRoomLite[] = [
            { type: 'living', polygon: polyMm(0, 0, 4, 8) },
            { type: 'hall', polygon: polyMm(4, 0, 6, 8) },   // hall on the right reaching z0
        ];
        const res = resolveEntryDoorOffset(rooms, 'z0', CELL, 0.9);
        expect(res).not.toBeNull();
        // Hall span x∈[4,6], centre 5.0 ⇒ offset 5.0 − 0.45 = 4.55.
        expect(res!.offset).toBeCloseTo(4.55, 3);
    });

    it('aligns on a VERTICAL door edge (x0) using the z-span of the corridor', () => {
        // Door edge = x0 (west wall, z∈[0,8]); corridor is a horizontal band z∈[3,4.5] reaching x0.
        const rooms: EntryRoomLite[] = [
            { type: 'bedroom', polygon: polyMm(0, 0, 6, 3) },
            { type: 'corridor', polygon: polyMm(0, 3, 6, 4.5) },   // reaches x0
            { type: 'bedroom', polygon: polyMm(0, 4.5, 6, 8) },
        ];
        const res = resolveEntryDoorOffset(rooms, 'x0', CELL, 0.9);
        expect(res).not.toBeNull();
        // Corridor z-span [3,4.5], centre 3.75 ⇒ offset (from z0) 3.75 − 0.45 = 3.30.
        expect(res!.offset).toBeCloseTo(3.3, 3);
    });

    it('returns null (centred fallback) when NO circulation room reaches the door edge', () => {
        // Only bedrooms touch z0; the corridor is set back (z∈[3,4]) and never reaches z0.
        const rooms: EntryRoomLite[] = [
            { type: 'bedroom', polygon: polyMm(0, 0, 3, 8) },
            { type: 'bedroom', polygon: polyMm(3, 0, 6, 8) },
            { type: 'corridor', polygon: polyMm(2, 3, 4, 4) },   // interior, does NOT touch z0
        ];
        expect(resolveEntryDoorOffset(rooms, 'z0', CELL, 0.9)).toBeNull();
    });

    it('returns null when there is no circulation room at all (studio / open plan)', () => {
        const rooms: EntryRoomLite[] = [{ type: 'living', polygon: polyMm(0, 0, 6, 8) }];
        expect(resolveEntryDoorOffset(rooms, 'z0', CELL, 0.9)).toBeNull();
    });

    it('clamps the door inside the wall ends (jamb) when the corridor hugs a corner', () => {
        // Corridor flush to the left end (x∈[0,1]); the door must keep a jamb at x=0.
        const rooms: EntryRoomLite[] = [
            { type: 'corridor', polygon: polyMm(0, 0, 1, 8) },
            { type: 'bedroom', polygon: polyMm(1, 0, 6, 8) },
        ];
        const res = resolveEntryDoorOffset(rooms, 'z0', CELL, 0.9, 0.2);
        expect(res).not.toBeNull();
        // Corridor centre 0.5 ⇒ raw offset 0.05, clamped up to the 0.2 jamb.
        expect(res!.offset).toBeGreaterThanOrEqual(0.2 - 1e-9);
        expect(res!.offset + 0.9).toBeLessThanOrEqual(6 - 0.2 + 1e-9);
    });

    it('returns null when the wall is too short to host the door + jambs', () => {
        const tiny: Rect = { x0: 0, z0: 0, x1: 1.0, z1: 8 };   // 1.0 m wall < 0.9 + 2×0.2
        const rooms: EntryRoomLite[] = [{ type: 'corridor', polygon: polyMm(0, 0, 1, 8) }];
        expect(resolveEntryDoorOffset(rooms, 'z0', tiny, 0.9)).toBeNull();
    });

    it('picks the WIDEST circulation room when several reach the edge', () => {
        const rooms: EntryRoomLite[] = [
            { type: 'hall', polygon: polyMm(0, 0, 1, 8) },        // narrow hall at left
            { type: 'corridor', polygon: polyMm(2, 0, 5, 8) },   // wider corridor → chosen
        ];
        const res = resolveEntryDoorOffset(rooms, 'z0', CELL, 0.9);
        expect(res).not.toBeNull();
        // Wider corridor span x∈[2,5], centre 3.5 ⇒ offset 3.05.
        expect(res!.offset).toBeCloseTo(3.05, 3);
    });
});
