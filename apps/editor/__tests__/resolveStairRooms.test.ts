// §STAIR-VOID-EXCLUDE (founder defect #7, 2026-06-10).
//
// Guards the detection-time exclusion that collapses the editor-detected rooms
// inside a stair void to EXACTLY ONE non-habitable `stair` room. The founder hit
// TWO detected rooms (8.1 m² + 25.3 m²) in a single stair footprint — the editor's
// redetect splits the footprint at the stair body's wall line. `resolveStairRooms`
// keeps the centre-nearest cell (typed `stair`, named "Stair") and DROPS the rest.

import { describe, it, expect } from 'vitest';
import {
    resolveStairRooms,
    type DetectedRoomLite,
    type StairRect,
} from '../src/ui/house-layout/resolveStairRooms.js';

/** A detected room at (cx, cz) with area m². */
function room(id: string, cx: number, cz: number, area = 10): DetectedRoomLite {
    return { id, cx, cz, area };
}

describe('resolveStairRooms — §STAIR-VOID-EXCLUDE', () => {
    it('two phantom rooms in one stair void → exactly ONE kept "Stair", the other dropped', () => {
        // The founder's case: a stair rect with TWO detected cells inside it.
        const stairRect: StairRect = { minX: 4, maxX: 7, minZ: 6, maxZ: 10 };
        const detected: DetectedRoomLite[] = [
            room('living', 1, 1, 25.3),                 // outside the void
            room('stair-under', 5.5, 7.5, 8.1),         // inside, nearest the centre (5.5, 8)
            room('stair-around', 5.5, 9.5, 25.3),       // inside, farther from centre
        ];
        const res = resolveStairRooms(detected, [stairRect]);

        expect(res.keep).toHaveLength(1);
        expect(res.keep[0]!.roomId).toBe('stair-under');   // centre-nearest
        expect(res.keep[0]!.name).toBe('Stair');
        expect(res.keep[0]!.occupancy).toBe('stair');
        expect(res.drop).toEqual(['stair-around']);        // the phantom is dropped
        // BOTH void cells are excluded from the name matcher; the habitable room isn't.
        expect(res.excludedRoomIds.has('stair-under')).toBe(true);
        expect(res.excludedRoomIds.has('stair-around')).toBe(true);
        expect(res.excludedRoomIds.has('living')).toBe(false);
        expect(res.perRectCounts).toEqual([2]);
    });

    it('a single detected cell in the void → kept + typed, nothing dropped', () => {
        const stairRect: StairRect = { minX: 4, maxX: 7, minZ: 6, maxZ: 10 };
        const detected: DetectedRoomLite[] = [
            room('living', 1, 1, 25),
            room('stair', 5.5, 8, 5.6),
        ];
        const res = resolveStairRooms(detected, [stairRect]);
        expect(res.keep).toHaveLength(1);
        expect(res.keep[0]!.roomId).toBe('stair');
        expect(res.drop).toEqual([]);
        expect(res.perRectCounts).toEqual([1]);
    });

    it('apartment path (no stair rects) → empty resolution, no exclusions', () => {
        const detected: DetectedRoomLite[] = [room('a', 1, 1), room('b', 3, 3)];
        const res = resolveStairRooms(detected, []);
        expect(res.keep).toEqual([]);
        expect(res.drop).toEqual([]);
        expect(res.excludedRoomIds.size).toBe(0);
        expect(res.perRectCounts).toEqual([]);
    });

    it('two stair voids → two distinct "Stair N" keeps; a room is assigned to ≤ 1 void', () => {
        const rects: StairRect[] = [
            { minX: 0, maxX: 2, minZ: 0, maxZ: 2 },
            { minX: 10, maxX: 12, minZ: 0, maxZ: 2 },
        ];
        const detected: DetectedRoomLite[] = [
            room('s1a', 1, 1, 4), room('s1b', 1, 1.5, 6),    // both in rect 0
            room('s2', 11, 1, 4),                            // in rect 1
        ];
        const res = resolveStairRooms(detected, rects);
        expect(res.keep).toHaveLength(2);
        expect(res.keep.map(k => k.name).sort()).toEqual(['Stair 1', 'Stair 2']);
        expect(res.drop).toHaveLength(1);                    // one extra in rect 0
        expect(res.perRectCounts).toEqual([2, 1]);
    });

    it('a room whose centroid is OUTSIDE every void is untouched', () => {
        const stairRect: StairRect = { minX: 4, maxX: 7, minZ: 6, maxZ: 10 };
        const detected: DetectedRoomLite[] = [room('bed', 9, 9, 14)];
        const res = resolveStairRooms(detected, [stairRect]);
        expect(res.keep).toEqual([]);
        expect(res.drop).toEqual([]);
        expect(res.excludedRoomIds.size).toBe(0);
        expect(res.perRectCounts).toEqual([0]);
    });

    it('is deterministic (same inputs → identical resolution)', () => {
        const rects: StairRect[] = [{ minX: 4, maxX: 7, minZ: 6, maxZ: 10 }];
        const detected: DetectedRoomLite[] = [
            room('a', 5.5, 7.5, 8.1), room('b', 5.5, 9.5, 25.3), room('c', 5, 8, 5),
        ];
        const r1 = resolveStairRooms(detected, rects);
        const r2 = resolveStairRooms(detected, rects);
        expect(r1.keep).toEqual(r2.keep);
        expect(r1.drop).toEqual(r2.drop);
    });
});
