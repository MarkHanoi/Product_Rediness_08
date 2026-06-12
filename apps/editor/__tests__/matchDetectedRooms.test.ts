// §ROOM-NAME-BIJECTIVE (founder duplicate-Stair bug, 2026-06-10).
//
// Guards the editor-side fix for the founder's generated-house defect: TWO
// detected rooms both named "Stair", a habitable-area room mis-typed `stair`,
// and an unnamed "Room 00-00x" fallback. Root cause: the room-naming matcher
// had NO uniqueness tracking, so the single minted `stair` engine room could
// name many detected cells, and a contested cell could end up unnamed.
//
// `matchDetectedRooms` is now a BIJECTION — each engine room names AT MOST ONE
// detected room. These tests lock that contract.

import { describe, it, expect } from 'vitest';
import { matchDetectedRooms, type EngineRoom, type DetectedRoomPoly } from '../src/ui/apartment-layout/matchDetectedRooms.js';

/** A unit-square detected polygon centred at (cx, cz) with side `s` (metres). */
function squareRoom(id: string, cx: number, cz: number, s = 1): DetectedRoomPoly {
    const h = s / 2;
    return {
        id,
        polygon: [
            { x: cx - h, z: cz - h }, { x: cx + h, z: cz - h },
            { x: cx + h, z: cz + h }, { x: cx - h, z: cz + h },
        ],
    };
}

describe('matchDetectedRooms — §ROOM-NAME-BIJECTIVE', () => {
    it('a single stair engine room names EXACTLY ONE detected room (no duplicate "Stair")', () => {
        // One small `stair` engine room + two large habitable rooms.
        const engine: EngineRoom[] = [
            { name: 'Living', occupancy: 'living-room', area: 25.3, cx: 3, cz: 3 },
            { name: 'Bedroom', occupancy: 'bedroom', area: 14, cx: 9, cz: 3 },
            { name: 'Stair', occupancy: 'stair', area: 5.6, cx: 6, cz: 8 },
        ];
        // THREE detected cells in/near the stair zone — the fracture seam the
        // founder hit. Only ONE actually contains the stair centroid; the other
        // two are empty fragments whose centroids are nearest the stair.
        const detected: DetectedRoomPoly[] = [
            squareRoom('living', 3, 3, 4),
            squareRoom('bed', 9, 3, 3),
            squareRoom('stair-core', 6, 8, 2),       // contains stair centroid
            squareRoom('stair-frag-a', 6, 9.6, 1.2), // empty fragment, nearest = stair
        ];

        const { renames } = matchDetectedRooms(engine, detected);
        const stairNames = renames.filter(r => r.occupancy === 'stair');
        expect(stairNames).toHaveLength(1);                 // NO duplicate "Stair"
        expect(stairNames[0]!.name).toBe('Stair');
        expect(stairNames[0]!.roomId).toBe('stair-core');   // the cell that CONTAINS it
    });

    it('a fractured extra cell stays UNNAMED rather than stealing an assigned name', () => {
        const engine: EngineRoom[] = [
            { name: 'Stair', occupancy: 'stair', area: 5.6, cx: 6, cz: 8 },
        ];
        const detected: DetectedRoomPoly[] = [
            squareRoom('stair-core', 6, 8, 2),       // gets "Stair"
            squareRoom('stair-frag', 6, 9.6, 1.2),   // no engine room left → unmatched
        ];
        const { renames, unmatched } = matchDetectedRooms(engine, detected);
        expect(renames).toHaveLength(1);
        expect(renames[0]!.roomId).toBe('stair-core');
        expect(unmatched).toBe(1);                           // the extra cell is a fallback room
        // The stair name is assigned exactly once — never duplicated onto the fragment.
        expect(renames.filter(r => r.name === 'Stair')).toHaveLength(1);
    });

    it('a habitable room is NOT mis-typed `stair` when the stair has its own cell', () => {
        const engine: EngineRoom[] = [
            { name: 'Living', occupancy: 'living-room', area: 25.3, cx: 3, cz: 3 },
            { name: 'Stair', occupancy: 'stair', area: 5.6, cx: 8, cz: 3 },
        ];
        const detected: DetectedRoomPoly[] = [
            squareRoom('living', 3, 3, 4),
            squareRoom('stair-core', 8, 3, 2),
        ];
        const { renames } = matchDetectedRooms(engine, detected);
        const byId = new Map(renames.map(r => [r.roomId, r]));
        expect(byId.get('living')!.occupancy).toBe('living-room');   // habitable, NOT stair
        expect(byId.get('stair-core')!.occupancy).toBe('stair');
        expect(renames.filter(r => r.occupancy === 'stair')).toHaveLength(1);
    });

    it('open-plan zones still COMPOUND (kitchen / dining in one detected room)', () => {
        const engine: EngineRoom[] = [
            { name: 'Kitchen', occupancy: 'kitchen', area: 9, cx: 2.5, cz: 3 },
            { name: 'Dining', occupancy: 'dining-room', area: 8, cx: 3.5, cz: 3 },
        ];
        // One large detected room contains BOTH centroids → compound name.
        const detected: DetectedRoomPoly[] = [squareRoom('open', 3, 3, 6)];
        const { renames } = matchDetectedRooms(engine, detected);
        expect(renames).toHaveLength(1);
        expect(renames[0]!.name).toBe('Kitchen / Dining');
        expect(renames[0]!.occupancy).toBe('kitchen');       // dominant (largest-area first)
    });

    it('§ROOM-NAME-ROBUST — a detected cell whose centroid drifts OUTSIDE the engine centroid is still named (no "Room NN" fallback)', () => {
        // Founder full-house defect: modal had "Living" + "Dining"; the BUILT cells
        // came out "Room 00-001"/"Room 00-007". Reproduce the failure shape: the
        // engine Living/Dining centroids do NOT land inside their own detected cells
        // (the detected polygons drifted), and a sibling cell sits BETWEEN them so a
        // pure-distance fallback would mis-assign and leave one cell unnamed.
        const engine: EngineRoom[] = [
            // Engine Living centroid at x=2; its detected cell is centred at x=4 (drift).
            { name: 'Living', occupancy: 'living-room', area: 25, cx: 2, cz: 3,
              polygon: [{ x: 0, z: 0 }, { x: 5, z: 0 }, { x: 5, z: 6 }, { x: 0, z: 6 }] },
            // Engine Dining centroid at x=9; its detected cell is centred at x=7 (drift).
            { name: 'Dining', occupancy: 'dining-room', area: 12, cx: 9, cz: 3,
              polygon: [{ x: 6, z: 0 }, { x: 11, z: 0 }, { x: 11, z: 6 }, { x: 6, z: 6 }] },
        ];
        const detected: DetectedRoomPoly[] = [
            squareRoom('living-cell', 4, 3, 1.6),   // centroid (4,3) — inside engine Living poly
            squareRoom('dining-cell', 7, 3, 1.6),   // centroid (7,3) — inside engine Dining poly
        ];

        const { renames, unmatched } = matchDetectedRooms(engine, detected);
        const byId = new Map(renames.map(r => [r.roomId, r]));
        // BOTH cells named via cross-containment — neither falls back to "Room NN".
        expect(unmatched).toBe(0);
        expect(byId.get('living-cell')!.name).toBe('Living');
        expect(byId.get('dining-cell')!.name).toBe('Dining');
        // Still a bijection — each engine room used exactly once.
        expect(renames).toHaveLength(2);
    });

    it('is deterministic (same inputs → identical renames)', () => {
        const engine: EngineRoom[] = [
            { name: 'Stair', occupancy: 'stair', area: 5.6, cx: 6, cz: 8 },
            { name: 'Bed', occupancy: 'bedroom', area: 14, cx: 2, cz: 2 },
        ];
        const detected: DetectedRoomPoly[] = [
            squareRoom('a', 6, 8, 2), squareRoom('b', 2, 2, 3), squareRoom('c', 6, 9.6, 1.2),
        ];
        const r1 = matchDetectedRooms(engine, detected);
        const r2 = matchDetectedRooms(engine, detected);
        expect(r1).toEqual(r2);
    });
});
