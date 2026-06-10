// §ROOM-OVERLAP-HARD — `validateNoRoomOverlap` tests (founder bug, 2026-06-10).
//
// The founder invariant: for every pair of rooms i ≠ j, Area(R_i ∩ R_j) == 0.
// Rooms may TOUCH along shared walls/edges/corners (zero-area intersection) but
// their interior floor areas must be mutually exclusive.

import { describe, expect, it } from 'vitest';
import {
    validateNoRoomOverlap,
    rectIntersectionArea,
    type OverlapRoomPlacement,
} from '../src/workflows/apartmentLayout/topology/validateNoRoomOverlap.js';

const rect = (x0: number, z0: number, x1: number, z1: number) => ({ x0, z0, x1, z1 });
const place = (id: string, r: ReturnType<typeof rect>): OverlapRoomPlacement => ({ id, rect: r });

describe('validateNoRoomOverlap (§ROOM-OVERLAP-HARD)', () => {
    describe('non-overlapping rooms pass cleanly', () => {
        it('two rects sharing a vertical edge ⇒ ok, zero overlaps', () => {
            // A: [0,5]×[0,5], B: [5,10]×[0,5] — share the x=5 wall, no interior overlap.
            const v = validateNoRoomOverlap([
                place('A', rect(0, 0, 5, 5)),
                place('B', rect(5, 0, 10, 5)),
            ]);
            expect(v.ok).toBe(true);
            expect(v.overlaps).toHaveLength(0);
            expect(v.pairsChecked).toBe(1);
        });

        it('two rects sharing only a corner ⇒ ok (zero-area intersection)', () => {
            const v = validateNoRoomOverlap([
                place('A', rect(0, 0, 5, 5)),
                place('B', rect(5, 5, 10, 10)),
            ]);
            expect(v.ok).toBe(true);
            expect(v.overlaps).toHaveLength(0);
        });

        it('fully disjoint rects ⇒ ok', () => {
            const v = validateNoRoomOverlap([
                place('A', rect(0, 0, 4, 4)),
                place('B', rect(10, 10, 14, 14)),
            ]);
            expect(v.ok).toBe(true);
        });

        it('a sub-epsilon sliver overlap (alignment-snap noise) is NOT reported', () => {
            // B intrudes 0.0001 m into A over a 5 m edge ⇒ 5e-4 m² < 1e-3 epsilon.
            const v = validateNoRoomOverlap([
                place('A', rect(0, 0, 5, 5)),
                place('B', rect(4.9999, 0, 10, 5)),
            ]);
            expect(v.ok).toBe(true);
            expect(v.overlaps).toHaveLength(0);
        });
    });

    describe('overlapping rooms are detected with correct area', () => {
        it('two overlapping rects ⇒ detected, area correct', () => {
            // A: [0,6]×[0,6], B: [4,10]×[0,6]. Overlap x∈[4,6] (2 m) × z∈[0,6] (6 m) = 12 m².
            const v = validateNoRoomOverlap([
                place('A', rect(0, 0, 6, 6)),
                place('B', rect(4, 0, 10, 6)),
            ]);
            expect(v.ok).toBe(false);
            expect(v.overlaps).toHaveLength(1);
            expect(v.overlaps[0]!.a).toBe('A');
            expect(v.overlaps[0]!.b).toBe('B');
            expect(v.overlaps[0]!.areaM2).toBeCloseTo(12, 6);
        });

        it('the founder screenshot shape — Entrance Hall straddling two rooms', () => {
            // Hall overlaps Bedroom1 (left) and Living (right) around the centre.
            const v = validateNoRoomOverlap([
                place('hall', rect(3, 0, 7, 4)),
                place('bedroom1', rect(0, 0, 5, 4)),   // overlaps hall x∈[3,5]×z∈[0,4] = 8 m²
                place('living', rect(5, 0, 10, 4)),    // overlaps hall x∈[5,7]×z∈[0,4] = 8 m²
            ]);
            expect(v.ok).toBe(false);
            expect(v.overlaps).toHaveLength(2);
            const totals = v.overlaps.map(o => o.areaM2);
            expect(totals[0]).toBeCloseTo(8, 6);
            expect(totals[1]).toBeCloseTo(8, 6);
        });

        it('rectIntersectionArea: shared edge ⇒ 0, real overlap ⇒ area', () => {
            expect(rectIntersectionArea(rect(0, 0, 5, 5), rect(5, 0, 10, 5))).toBe(0);
            expect(rectIntersectionArea(rect(0, 0, 5, 5), rect(2, 2, 7, 7))).toBeCloseTo(9, 6);
        });
    });

    describe('determinism + ordering', () => {
        it('iteration order is input-order, i < j ⇒ stable overlaps list', () => {
            const rooms = [
                place('A', rect(0, 0, 6, 6)),
                place('B', rect(4, 0, 10, 6)),
                place('C', rect(8, 0, 14, 6)),   // overlaps B over x∈[8,10]
            ];
            const a = validateNoRoomOverlap(rooms);
            const b = validateNoRoomOverlap(rooms);
            expect(a).toEqual(b);
            // A↔B comes before B↔C (input order).
            expect(a.overlaps.map(o => `${o.a}-${o.b}`)).toEqual(['A-B', 'B-C']);
        });
    });

    // §ROOM-OVERLAP-HARD GATE BEHAVIOUR — the validator's `ok` flag is exactly the
    // signal the topology hard gate consumes (`hasRoomOverlap: !ok`). A candidate
    // built from an overlapping placement set is therefore hard-INVALID, so a
    // clean (overlap-free) strategy is tier-split ABOVE it and ranks first. We
    // assert the gate-feeding predicate here (evaluateHardTopology is an internal
    // engine function and not exported, matching the other tgl validators).
    describe('feeds the topology hard gate (clean ranks above overlapping)', () => {
        it('overlapping placement ⇒ hard-gate signal true; clean ⇒ false', () => {
            const cleanCand = validateNoRoomOverlap([
                place('A', rect(0, 0, 5, 5)),
                place('B', rect(5, 0, 10, 5)),
            ]);
            const overlapCand = validateNoRoomOverlap([
                place('A', rect(0, 0, 6, 5)),
                place('B', rect(4, 0, 10, 5)),
            ]);
            // hasRoomOverlap = !ok — the value passed to evaluateHardTopology.
            const cleanHasOverlap = !cleanCand.ok;     // false ⇒ no 'overlap' rule ⇒ can be hard-valid
            const overlapHasOverlap = !overlapCand.ok; // true  ⇒ pushes 'overlap' ⇒ hardValid=false
            expect(cleanHasOverlap).toBe(false);
            expect(overlapHasOverlap).toBe(true);
        });
    });
});
