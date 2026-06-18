// §FORCE-CORRIDOR-DIRECT (founder 2026-06-18) — the per-level "↔ Corridor" toggle.
//
// Contract: `buildWallsAndDoors`'s OPTIONAL `forceCorridorDirectRoomTypes` forces every
// room of a listed TYPE a DIRECT door onto the circulation spine (corridor preferred over
// hall) on the shortest-path shared wall, BEFORE the generic reconcile — but ONLY when the
// pair is permitted and the host is under its door cap. Absent / empty ⇒ no forced pass ⇒
// byte-identical to the engine-decides baseline.

import { describe, expect, it } from 'vitest';
import { buildWallsAndDoors } from '../src/workflows/apartmentLayout/tgl/wallsAndDoors.js';
import { type BubbleGraph, type ProgramRoom } from '../src/workflows/apartmentLayout/tgl/bubbleGraph.js';
import type { RoomPlacement } from '../src/workflows/apartmentLayout/tgl/subdivide.js';
import type { RoomType } from '../src/workflows/apartmentLayout/types.js';

const room = (id: string, type: RoomType): ProgramRoom =>
    ({ id, type, name: id, targetAreaM2: 20, isPrivate: false, needsWindow: false });

const graphOf = (rooms: ProgramRoom[], edges: BubbleGraph['edges']): BubbleGraph =>
    ({ rooms, edges, corridorId: rooms.find(r => r.type === 'corridor')?.id ?? null, entryId: null });

/** Does an opening connect `id` directly to a corridor room? */
const hasCorridorDoor = (
    openings: ReadonlyArray<{ type: string; betweenRoomIds: readonly [string, string?] }>,
    id: string,
    corridorId: string,
): boolean =>
    openings.some(o =>
        o.type === 'door'
        && ((o.betweenRoomIds[0] === id && o.betweenRoomIds[1] === corridorId)
            || (o.betweenRoomIds[1] === id && o.betweenRoomIds[0] === corridorId)));

describe('§FORCE-CORRIDOR-DIRECT — buildWallsAndDoors forceCorridorDirectRoomTypes', () => {
    // Layout (plan frame, metres):
    //   Corridor C : x∈[0,2]  z∈[0,6]   (the spine — stops at z=6)
    //   Living   L : x∈[2,8]  z∈[0,3]
    //   Bedroom  B : x∈[2,8]  z∈[3,6]   — shares a wall with BOTH C (x=2,z∈[3,6]) and L (z=3)
    // So a generic reconcile could door the bedroom onto the LIVING room (a permitted
    // bedroom-secondary in some plans); the toggle FORCES it onto the corridor instead.
    const C: RoomPlacement = { roomId: 'C', rect: { x0: 0, z0: 0, x1: 2, z1: 6 } };
    const L: RoomPlacement = { roomId: 'L', rect: { x0: 2, z0: 0, x1: 8, z1: 3 } };
    const B: RoomPlacement = { roomId: 'B', rect: { x0: 2, z0: 3, x1: 8, z1: 6 } };

    const rooms = [room('C', 'corridor'), room('L', 'living'), room('B', 'bedroom')];

    it('FORCES a direct corridor door for a listed room type', () => {
        const g = graphOf(rooms, []);
        const { openings } = buildWallsAndDoors([C, L, B], g, {
            forceCorridorDirectRoomTypes: ['bedroom'],
        });
        expect(hasCorridorDoor(openings, 'B', 'C')).toBe(true);
    });

    it('absent override ⇒ byte-identical to the no-option baseline', () => {
        const g = graphOf(rooms, []);
        const baseline = buildWallsAndDoors([C, L, B], g);
        const empty = buildWallsAndDoors([C, L, B], g, { forceCorridorDirectRoomTypes: [] });
        // Empty list ⇒ the gated pass never runs ⇒ identical openings + walls.
        expect(JSON.stringify(empty.openings)).toBe(JSON.stringify(baseline.openings));
        expect(JSON.stringify(empty.segments)).toBe(JSON.stringify(baseline.segments));
        // And a no-third-arg call equals the empty-option call (the option is purely additive).
        const noOpt = buildWallsAndDoors([C, L, B], g);
        expect(JSON.stringify(noOpt.openings)).toBe(JSON.stringify(empty.openings));
    });

    it('respects the permission matrix — never forces an illegal corridor door', () => {
        // A room whose ONLY circulation-adjacency is to the corridor is fine (permitted);
        // here we list `living` (public). Public↔corridor IS permitted, so the door is
        // placed — assert it lands on the corridor and is a real opening (no rule breach).
        const g = graphOf(rooms, []);
        const { openings } = buildWallsAndDoors([C, L, B], g, {
            forceCorridorDirectRoomTypes: ['living'],
        });
        expect(hasCorridorDoor(openings, 'L', 'C')).toBe(true);
    });

    it('skips a room with NO circulation-adjacent wall (never invents an illegal door)', () => {
        // Bedroom B2 sits BEHIND B (z∈[6,9]) — the corridor stops at z=6, so B2 touches
        // ONLY B and the void. It shares NO wall with the corridor. Forcing `bedroom` must
        // NOT place a B2↔C door (there is no shared wall) — the room is routed normally and
        // the forced pass logs a skip rather than inventing geometry.
        const B2: RoomPlacement = { roomId: 'B2', rect: { x0: 2, z0: 6, x1: 8, z1: 9 } };
        const g = graphOf([...rooms, room('B2', 'bedroom')], []);
        const { openings } = buildWallsAndDoors([C, L, B, B2], g, {
            forceCorridorDirectRoomTypes: ['bedroom'],
        });
        // B2 shares no wall with C → no direct B2↔C door was fabricated.
        expect(hasCorridorDoor(openings, 'B2', 'C')).toBe(false);
        // B (which DOES touch the corridor) still got its forced corridor door.
        expect(hasCorridorDoor(openings, 'B', 'C')).toBe(true);
    });
});
