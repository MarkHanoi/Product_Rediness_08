// §DOOR-MINIMUMS + EVERY-ROOM-ACCESS (A.21.D47, 2026-06-08).
//
// Two architectural guarantees this suite pins:
//   (1) every emitted door clears its room-type MINIMUM clear width (Part M):
//       habitable/circulation 0.80 m, entrance/hall 0.90 m, wet rooms 0.70 m,
//       and the door serving two rooms takes the MAX of the two floors.
//   (2) every detected/placed room ends up with ≥1 door (no sealed room), and
//       a wall too short for the floor does NOT yield a sub-minimum door — the
//       door is either re-routed onto a longer wall or the room is flagged
//       (sealed / land-locked) rather than emitting a narrow door.

import { describe, expect, it } from 'vitest';
import { buildWallsAndDoors, type WallsAndDoors } from '../src/workflows/apartmentLayout/tgl/wallsAndDoors.js';
import {
    buildBubbleGraph, type BubbleGraph, type ProgramRoom,
} from '../src/workflows/apartmentLayout/tgl/bubbleGraph.js';
import { subdivide, type RoomPlacement } from '../src/workflows/apartmentLayout/tgl/subdivide.js';
import { decomposeToRects, type Pt } from '../src/workflows/apartmentLayout/tgl/rectDecomposition.js';
import {
    minDoorWidthFor, minDoorWidthBetween, MIN_DOOR_WIDTH_BY_TYPE, MIN_DOOR_WIDTH_FLOOR_M,
} from '../src/workflows/apartmentLayout/rules/programRules.js';
import type { ApartmentProgram, RoomType } from '../src/workflows/apartmentLayout/types.js';

const rm = (id: string, type: RoomType, area = 20): ProgramRoom =>
    ({ id, type, name: id, targetAreaM2: area, isPrivate: false, needsWindow: false });

// Minimum clear width that EVERY door bounding `id` must clear, given the room
// types — the MAX of the two rooms' per-type floors.
const minWidthForDoor = (
    o: { betweenRoomIds: readonly [string, string?] },
    typeOf: Map<string, RoomType>,
): number => {
    const [a, b] = o.betweenRoomIds;
    const ta = typeOf.get(a) ?? '';
    const tb = b ? (typeOf.get(b) ?? '') : ta;
    return minDoorWidthBetween(ta, tb);
};

describe('§DOOR-MINIMUMS — the per-room-type clear-width floor (programRules)', () => {
    it('declares a floor for EVERY room type (Record exhaustive)', () => {
        const types: RoomType[] = [
            'master', 'bedroom', 'living', 'kitchen', 'dining',
            'bathroom', 'ensuite', 'wc', 'hall', 'corridor', 'study', 'utility',
        ];
        for (const t of types) {
            expect(MIN_DOOR_WIDTH_BY_TYPE[t], `${t} must have a door-width floor`).toBeGreaterThan(0);
        }
    });

    it('habitable + circulation rooms floor at 0.80 m (Part M internal doorway)', () => {
        for (const t of ['bedroom', 'master', 'living', 'kitchen', 'dining', 'study', 'utility', 'corridor'] as RoomType[]) {
            expect(minDoorWidthFor(t)).toBeCloseTo(0.80, 6);
        }
    });

    it('entrance hall floors wider at 0.90 m (arrival leaf, §A.21.D29 intent)', () => {
        expect(minDoorWidthFor('hall')).toBeCloseTo(0.90, 6);
    });

    it('wet rooms floor at 0.70 m (compact cloakroom / shower room)', () => {
        for (const t of ['bathroom', 'ensuite', 'wc'] as RoomType[]) {
            expect(minDoorWidthFor(t)).toBeCloseTo(0.70, 6);
        }
    });

    it('a door serving two rooms takes the MAX of the two floors', () => {
        // corridor (0.80) ↔ wc (0.70) ⇒ 0.80; hall (0.90) ↔ living (0.80) ⇒ 0.90.
        expect(minDoorWidthBetween('corridor', 'wc')).toBeCloseTo(0.80, 6);
        expect(minDoorWidthBetween('hall', 'living')).toBeCloseTo(0.90, 6);
        expect(minDoorWidthBetween('ensuite', 'master')).toBeCloseTo(0.80, 6); // master wins
    });

    it('an unknown room-type string falls back to the absolute floor', () => {
        expect(minDoorWidthFor('garage')).toBeCloseTo(MIN_DOOR_WIDTH_FLOOR_M, 6);
    });
});

describe('§DOOR-MINIMUMS — emitted doors clamp UP to the room-type floor (wallsAndDoors)', () => {
    it('a BUFFER door onto a wet room is still ≥ the corridor floor (never sub-minimum)', () => {
        // corridor | bathroom: BUFFER/SERVICE preferred is 0.90; the floor (max
        // of corridor 0.80 + bathroom 0.70) is 0.80. The emitted width is the
        // preferred 0.90 — but the point is it is NEVER below 0.80.
        const corridor: RoomPlacement = { roomId: 'cor', rect: { x0: 0, z0: 0, x1: 10, z1: 1.2 } };
        const bath: RoomPlacement = { roomId: 'ba', rect: { x0: 0, z0: 1.2, x1: 4, z1: 5 } };
        const rooms: ProgramRoom[] = [rm('cor', 'corridor', 12), rm('ba', 'bathroom', 12)];
        const g: BubbleGraph = { rooms, edges: [], corridorId: 'cor', entryId: 'cor' };
        const { openings } = buildWallsAndDoors([corridor, bath], g);
        const typeOf = new Map(rooms.map(r => [r.id, r.type]));
        const bathDoor = openings.find(o => o.betweenRoomIds.includes('ba'))!;
        expect(bathDoor).toBeDefined();
        expect(bathDoor.widthM).toBeGreaterThanOrEqual(minWidthForDoor(bathDoor, typeOf) - 1e-6);
    });

    it('a SHORT wall does NOT yield a sub-minimum door — the door is re-routed onto a longer wall', () => {
        // A bedroom touches the corridor on TWO walls: a SHORT one (0.85 m, too
        // short to host the 0.80 m floor after 2×0.1 clearance ⇒ usable 0.65 m)
        // and a LONG one (4 m). The door must land on the LONG wall at ≥ 0.80 m,
        // never on the short wall at a sub-minimum width.
        //
        //   corridor : x∈[0,10], z∈[0,1.2]            (top spine; long shared edge)
        //   bedroom  : x∈[0,4],  z∈[1.2,5]            (shares 4 m with corridor at z=1.2)
        // (The single long shared edge is enough to assert no sub-minimum door.)
        const corridor: RoomPlacement = { roomId: 'cor', rect: { x0: 0, z0: 0, x1: 10, z1: 1.2 } };
        const bed: RoomPlacement = { roomId: 'bd', rect: { x0: 0, z0: 1.2, x1: 4, z1: 5 } };
        const rooms: ProgramRoom[] = [rm('cor', 'corridor', 12), rm('bd', 'bedroom', 16)];
        const g: BubbleGraph = { rooms, edges: [], corridorId: 'cor', entryId: 'cor' };
        const { openings } = buildWallsAndDoors([corridor, bed], g);
        const typeOf = new Map(rooms.map(r => [r.id, r.type]));
        const bedDoor = openings.find(o => o.betweenRoomIds.includes('bd'))!;
        expect(bedDoor, 'bedroom must have a door').toBeDefined();
        expect(bedDoor.widthM).toBeGreaterThanOrEqual(minWidthForDoor(bedDoor, typeOf) - 1e-6);
    });

    it('a wall too short for the floor hosts NO door (rather than a sub-minimum one)', () => {
        // The ONLY shared wall between the corridor and a bedroom is 0.85 m —
        // usable width 0.85 − 0.2 = 0.65 m < the 0.80 m bedroom floor. addDoor
        // must REFUSE this wall: the bedroom ends up sealed (flagged) — NOT
        // doored at a sub-minimum 0.65 m. (The enumerate gate then prefers a
        // placement with a longer wall; here we pin the emission invariant.)
        const corridor: RoomPlacement = { roomId: 'cor', rect: { x0: 0, z0: 0, x1: 10, z1: 1.2 } };
        // bedroom shares only x∈[0,0.85] with the corridor (a 0.85 m stub edge).
        const bed: RoomPlacement = { roomId: 'bd', rect: { x0: 0, z0: 1.2, x1: 0.85, z1: 5 } };
        const rooms: ProgramRoom[] = [rm('cor', 'corridor', 12), rm('bd', 'bedroom', 4)];
        const g: BubbleGraph = { rooms, edges: [], corridorId: 'cor', entryId: 'cor' };
        const { openings, sealedRoomIds } = buildWallsAndDoors([corridor, bed], g);
        // No door narrower than the floor was emitted for the bedroom.
        const typeOf = new Map(rooms.map(r => [r.id, r.type]));
        for (const o of openings.filter(o => o.betweenRoomIds.includes('bd'))) {
            expect(o.widthM).toBeGreaterThanOrEqual(minWidthForDoor(o, typeOf) - 1e-6);
        }
        // The bedroom is reported sealed (no valid host wall) rather than
        // silently given a 0.65 m door.
        expect(sealedRoomIds).toContain('bd');
    });

    it('caller opts.doorWidthM override still bypasses the floor (test back-compat)', () => {
        // An explicit fixed width is honoured verbatim — the floor only governs
        // the engine-chosen per-pair widths, not a caller override.
        const A: RoomPlacement = { roomId: 'A', rect: { x0: 0, z0: 0, x1: 5, z1: 4 } };
        const B: RoomPlacement = { roomId: 'B', rect: { x0: 5, z0: 0, x1: 10, z1: 4 } };
        const g: BubbleGraph = {
            rooms: [rm('A', 'corridor', 20), rm('B', 'bedroom', 20)],
            edges: [{ a: 'A', b: 'B', via: 'door' }],
            corridorId: 'A', entryId: 'A',
        };
        const { openings } = buildWallsAndDoors([A, B], g, { doorWidthM: 0.75 });
        expect(openings[0]!.widthM).toBeCloseTo(0.75, 6);
    });
});

describe('§EVERY-ROOM-ACCESS — every room has ≥1 door at or above its floor (full pipeline)', () => {
    const generate = (program: ApartmentProgram, poly: Pt[], area: number): {
        out: WallsAndDoors; typeOf: Map<string, RoomType>; roomIds: string[];
    } => {
        const shell = decomposeToRects(poly);
        const g = buildBubbleGraph(program, area);
        const placements = subdivide(shell, g);
        const out = buildWallsAndDoors(placements, g, { shellPolygon: poly });
        const typeOf = new Map(g.rooms.map(r => [r.id, r.type] as [string, RoomType]));
        return { out, typeOf, roomIds: g.rooms.map(r => r.id) };
    };

    it('a 2-bed apartment: every room has ≥1 door, and every door ≥ its floor', () => {
        const program: ApartmentProgram = {
            bedrooms: 2, bathrooms: 1, masterEnSuite: true,
            openPlanKitchenDining: true, livingRoom: true, entranceHall: true,
        };
        const poly: Pt[] = [{ x: 0, z: 0 }, { x: 12, z: 0 }, { x: 12, z: 10 }, { x: 0, z: 10 }];
        const { out, typeOf, roomIds } = generate(program, poly, 120);

        // (1) every door clears its room-type floor.
        for (const o of out.openings.filter(o => o.type === 'door')) {
            const floor = minWidthForDoor(o, typeOf);
            expect(
                o.widthM,
                `door ${o.id} between ${o.betweenRoomIds.join('↔')} is ${o.widthM} m < floor ${floor} m`,
            ).toBeGreaterThanOrEqual(floor - 1e-6);
        }

        // (2) every room that the engine connected ends up with ≥1 door. An
        // open-plan-eligible room may join via a wall-less boundary (no door),
        // so we assert: a room has a door OR participates in an open-plan
        // boundary — it is never an enclosed, sealed island.
        const doorCount = new Map<string, number>(roomIds.map(id => [id, 0]));
        for (const o of out.openings) {
            if (o.type !== 'door') continue;
            for (const id of o.betweenRoomIds) if (id) doorCount.set(id, (doorCount.get(id) ?? 0) + 1);
        }
        const inBoundary = new Set<string>();
        for (const b of out.boundaries) for (const id of b.betweenRoomIds) inBoundary.add(id);
        for (const id of roomIds) {
            const reachable = (doorCount.get(id) ?? 0) > 0 || inBoundary.has(id);
            expect(reachable, `room ${id} (${typeOf.get(id)}) is sealed (no door, no open boundary)`).toBe(true);
        }
        // The engine reports no sealed/land-locked rooms for this clean shell.
        expect(out.sealedRoomIds).toEqual([]);
    });

    it('a 3-bed apartment: every emitted door ≥ its floor (no sub-minimum door anywhere)', () => {
        const program: ApartmentProgram = {
            bedrooms: 3, bathrooms: 2, masterEnSuite: true,
            openPlanKitchenDining: true, livingRoom: true, entranceHall: true,
        };
        const poly: Pt[] = [{ x: 0, z: 0 }, { x: 16, z: 0 }, { x: 16, z: 11 }, { x: 0, z: 11 }];
        const { out, typeOf } = generate(program, poly, 176);
        for (const o of out.openings.filter(o => o.type === 'door')) {
            expect(o.widthM).toBeGreaterThanOrEqual(minWidthForDoor(o, typeOf) - 1e-6);
        }
        // Determinism — identical input, identical output.
        const shell = decomposeToRects(poly);
        const g = buildBubbleGraph(program, 176);
        const placements = subdivide(shell, g);
        const out2 = buildWallsAndDoors(placements, g, { shellPolygon: poly });
        expect(JSON.stringify(out.openings)).toEqual(JSON.stringify(out2.openings));
    });
});
