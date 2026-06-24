// §HOUSE-STAIR-DOOR-ACCESS (founder defect B, 2026-06-24) — the stair room's entry door must
// open into the CLEAR ACCESS / run-in landing (the bottom-of-flight approach), NOT onto a tread or
// the side of the flight — exactly like the residential-building CORE (§RESI-CORE-CIRCULATION: the
// stair sets back from the door wall so the door opens into a clear run-in landing).
//
// The engine half: when `buildWallsAndDoors` is given the stair keep-out rect(s), the
// §STAIR-DOOR-LANDING pass PREFERS the stair↔circulation wall on the stair's RUN-IN edge (the short
// edge at the LOW end of the keep-out's long axis — the flight runs +along that axis from its near
// corner, mirroring computeStairWorldFootprint) OVER the merely-longest wall (which can be a SIDE
// wall parallel to the flight → you step onto a tread mid-flight). Pure door-anchor re-order; no
// geometry / scoring change. Without the hint the legacy longest-wall pick is byte-identical.
//
// NO Math.random (banned) — fixed fixtures only.

import { describe, expect, it } from 'vitest';
import { buildWallsAndDoors } from '../src/workflows/apartmentLayout/tgl/wallsAndDoors.js';
import type { BubbleGraph, ProgramRoom } from '../src/workflows/apartmentLayout/tgl/bubbleGraph.js';
import type { RoomPlacement } from '../src/workflows/apartmentLayout/tgl/subdivide.js';
import type { RoomType } from '../src/workflows/apartmentLayout/types.js';

const room = (id: string, type: RoomType): ProgramRoom =>
    ({ id, type, name: id, targetAreaM2: 12, isPrivate: false, needsWindow: false });

const graphOf = (rooms: ProgramRoom[], edges: BubbleGraph['edges']): BubbleGraph =>
    ({ rooms, edges, corridorId: 'corRunIn', entryId: null });

describe('§HOUSE-STAIR-DOOR-ACCESS — the stair door anchors on the run-in (approach) edge', () => {
    // Stair keep-out {0,0 → 2,4}: w=2, h=4 ⇒ h≥w ⇒ flight runs +Z from z0 ⇒ RUN-IN edge = z=0.
    //   • corSide  shares the LONG x=2 side wall (z∈[0,4], len 4) — PARALLEL to the flight.
    //   • corRunIn shares the SHORT z=0 run-in wall (x∈[0,2], len 2) — the bottom-of-flight approach.
    const stairKO = { x0: 0, z0: 0, x1: 2, z1: 4 };
    const stair: RoomPlacement = { roomId: 'stair0', rect: { x0: 0, z0: 0, x1: 2, z1: 4 } };
    const corSide: RoomPlacement = { roomId: 'corSide', rect: { x0: 2, z0: 0, x1: 4, z1: 4 } };   // x=2 wall, len 4
    const corRunIn: RoomPlacement = { roomId: 'corRunIn', rect: { x0: 0, z0: -3, x1: 2, z1: 0 } }; // z=0 wall, len 2
    const placements = [stair, corSide, corRunIn];

    // The stair is reached from circulation; offer it BOTH corridor walls (the pass picks one).
    const graph = graphOf(
        [room('stair0', 'stair'), room('corSide', 'corridor'), room('corRunIn', 'corridor')],
        [{ a: 'corSide', b: 'corRunIn', via: 'open' }],   // the two corridor cells are one spine
    );

    /** Which corridor cell the stair's door connects to (via the opening's wall). */
    const stairDoorPartner = (opts: Parameters<typeof buildWallsAndDoors>[2]): string | null => {
        const { openings } = buildWallsAndDoors(placements, graph, opts);
        const stairDoor = openings.find(o =>
            o.type === 'door' && (o.betweenRoomIds[0] === 'stair0' || o.betweenRoomIds[1] === 'stair0'));
        if (!stairDoor) return null;
        const [a, b] = stairDoor.betweenRoomIds;
        return a === 'stair0' ? (b ?? null) : a;
    };

    it('WITH the keep-out hint the stair door lands on the RUN-IN edge wall (clear approach), not the long side wall', () => {
        const partner = stairDoorPartner({ stairKeepOutRects: [stairKO] });
        expect(partner).toBe('corRunIn');
    });

    it('WITHOUT the hint the legacy longest-wall pick stands (the long SIDE wall) — byte-identical', () => {
        const partner = stairDoorPartner({});
        // The side wall (len 4) is longer than the run-in wall (len 2) → legacy picks it.
        expect(partner).toBe('corSide');
    });

    it('the door still fits + is a single legal stair↔corridor opening either way', () => {
        const { openings, segments } = buildWallsAndDoors(placements, graph, { stairKeepOutRects: [stairKO] });
        const stairDoors = openings.filter(o =>
            o.type === 'door' && (o.betweenRoomIds[0] === 'stair0' || o.betweenRoomIds[1] === 'stair0'));
        expect(stairDoors).toHaveLength(1);
        const o = stairDoors[0]!;
        const wall = segments.find(s => s.id === o.wallId)!;
        const len = Math.hypot(wall.b.x - wall.a.x, wall.b.z - wall.a.z);
        expect(o.offsetM).toBeGreaterThanOrEqual(0);
        expect(o.offsetM + o.widthM).toBeLessThanOrEqual(len + 1e-6);
    });
});
