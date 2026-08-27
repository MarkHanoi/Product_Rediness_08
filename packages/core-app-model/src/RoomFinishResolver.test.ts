// §SCHED156-FLOOR-ROOMS (L-12602) — roomsCoveredByFloor.
//
// The Floors Schedule's "Rooms" column read `'—'` on every row of a real
// project because it read ONLY `floor.coveredRoomIds`, which is `[]` for any
// floor authored without an explicit `hostRoomId`. This pins the two-pass
// rule (explicit linkage, then same-level spatial containment) that mirrors
// what `resolveRoomFinishes` already does in the room→floor direction.

import { describe, it, expect } from 'vitest';
import { roomsCoveredByFloor } from './RoomFinishResolver.js';

describe('roomsCoveredByFloor', () => {
  const squareRoom = (id: string, levelId: string, cx: number, cz: number) => ({
    id,
    levelId,
    roomNumber: `${id}-num`,
    name: `Room ${id}`,
    computed: { centroid: { x: cx, z: cz } },
  });

  it('a floor covers zero rooms is a real, determined answer — not a sentinel', () => {
    const floor = { id: 'F1', levelId: 'L0', coveredRoomIds: [], boundary: { polygon: [] } };
    expect(roomsCoveredByFloor(floor, [squareRoom('R1', 'L0', 5, 5)])).toEqual([]);
  });

  it('matches via explicit hostRoomId even with no polygon', () => {
    const floor = { id: 'F1', levelId: 'L0', hostRoomId: 'R1' };
    const rooms = [squareRoom('R1', 'L0', 5, 5), squareRoom('R2', 'L0', 50, 50)];
    const out = roomsCoveredByFloor(floor, rooms);
    expect(out.map((r) => r.id)).toEqual(['R1']);
  });

  it('matches via explicit coveredRoomIds', () => {
    const floor = { id: 'F1', levelId: 'L0', coveredRoomIds: ['R2'] };
    const rooms = [squareRoom('R1', 'L0', 5, 5), squareRoom('R2', 'L0', 50, 50)];
    const out = roomsCoveredByFloor(floor, rooms);
    expect(out.map((r) => r.id)).toEqual(['R2']);
  });

  it('§THE FIX — matches via same-level spatial containment when nothing was explicitly linked', () => {
    const floor = {
      id: 'F1',
      levelId: 'L0',
      coveredRoomIds: [],
      boundary: { polygon: [{ x: 0, z: 0 }, { x: 10, z: 0 }, { x: 10, z: 10 }, { x: 0, z: 10 }] },
    };
    const rooms = [
      squareRoom('R1', 'L0', 5, 5),   // inside, same level
      squareRoom('R2', 'L1', 5, 5),   // inside footprint but WRONG level
      squareRoom('R3', 'L0', 50, 50), // same level, outside footprint
    ];
    const out = roomsCoveredByFloor(floor, rooms);
    expect(out.map((r) => r.id)).toEqual(['R1']);
  });

  it('explicit linkage and spatial containment together produce the union, each room once', () => {
    const floor = {
      id: 'F1',
      levelId: 'L0',
      coveredRoomIds: ['R2'],
      boundary: { polygon: [{ x: 0, z: 0 }, { x: 10, z: 0 }, { x: 10, z: 10 }, { x: 0, z: 10 }] },
    };
    const rooms = [
      squareRoom('R1', 'L0', 5, 5),   // spatial only
      squareRoom('R2', 'L0', 50, 50), // explicit only
    ];
    const out = roomsCoveredByFloor(floor, rooms);
    expect(out.map((r) => r.id).sort()).toEqual(['R1', 'R2']);
  });

  it('falls back to room.centroid (not just room.computed.centroid)', () => {
    const floor = {
      id: 'F1',
      levelId: 'L0',
      boundary: { polygon: [{ x: 0, z: 0 }, { x: 10, z: 0 }, { x: 10, z: 10 }, { x: 0, z: 10 }] },
    };
    const room = { id: 'R1', levelId: 'L0', centroid: { x: 5, z: 5 } };
    const out = roomsCoveredByFloor(floor, [room]);
    expect(out.map((r) => r.id)).toEqual(['R1']);
  });
});
