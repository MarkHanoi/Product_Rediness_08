// §DEPT153 (L-12540+) — `departmentAuthored` mirrors `roomNumberAuthored`
// (EI-7e, C84 §9) exactly: RoomStore.update() rebuilds `metadata` as a
// HAND-WRITTEN NAMED SUBSET in BOTH its `preserveMetadata` branches (see that
// method's own comment), so a flag omitted from either rebuild is silently
// dropped on the NEXT ordinary update no matter what the schema says. This
// suite pins the two branches directly against a REAL RoomStore, and pins the
// persistence round-trip (`serializeRoom` / `deserializeRoom`) that was found
// to be missing `roomNumberAuthored` entirely while adding this flag — see
// roomSnapshotUtils.ts's own note.

import { describe, it, expect } from 'vitest';
import { RoomStore } from '../src/RoomStore';
import { serializeRoom, deserializeRoom } from '../src/roomSnapshotUtils';
import type { RoomData } from '../src/RoomTypes';

const LEVEL = 'L0';
const bimManager = {
  getLevelById: (id: string) => (id === LEVEL ? { id, elevation: 0, height: 2.7 } : undefined),
} as never;

function minimalRoom(id: string): RoomData {
  return {
    id,
    type: 'room',
    levelId: LEVEL,
    name: 'Room 00-001',
    roomNumber: '00-001',
    boundary: {
      polygon: [{ x: 0, z: 0 }, { x: 4, z: 0 }, { x: 4, z: 3 }, { x: 0, z: 3 }],
      height: 2.7,
      baseOffset: 0,
      detectionMethod: 'manual-boundary',
    },
    boundingWallIds: [],
    boundingSlabIds: [],
    boundingColumnIds: [],
    occupancyType: 'unclassified',
    finishes: {},
    computed: {
      area: 12, grossArea: 12, perimeter: 14, volume: 32.4,
      centroid: { x: 2, z: 1.5 },
      boundingBox: { minX: 0, minZ: 0, maxX: 4, maxZ: 3 },
    },
    properties: {},
    metadata: { createdAt: 0, modifiedAt: 0, createdBy: 'test', version: 1 },
  } as unknown as RoomData;
}

const R1 = '11111111-1111-4111-a111-111111111111';
const R2 = '22222222-2222-4222-a222-222222222222';
const R3 = '33333333-3333-4333-a333-333333333333';
const R4 = '44444444-4444-4444-a444-444444444444';
const R5 = '55555555-5555-4555-a555-555555555555';
const R6 = '66666666-6666-4666-a666-666666666666';

describe('§DEPT153 — departmentAuthored survives RoomStore.update() the way roomNumberAuthored does', () => {
  it('an ordinary update (preserveMetadata=false) carries departmentAuthored forward when NOT re-supplied', () => {
    const store = new RoomStore(null, bimManager);
    store.add(minimalRoom(R1));

    store.update(R1, { department: 'Residential', metadata: { departmentAuthored: true } as never });
    expect(store.getById(R1)!.metadata.departmentAuthored).toBe(true);

    // An UNRELATED later update (e.g. the user renames the room) must not
    // silently drop the flag — this is exactly the failure shape the file
    // header describes: "a member omitted here is dropped on the next update
    // no matter what the schema says."
    store.update(R1, { name: 'Bedroom 01' });
    expect(store.getById(R1)!.metadata.departmentAuthored).toBe(true);
    expect(store.getById(R1)!.name).toBe('Bedroom 01');
  });

  it('clearing the flag (departmentAuthored: false) also survives an unrelated later update', () => {
    const store = new RoomStore(null, bimManager);
    store.add(minimalRoom(R2));
    store.update(R2, { department: '', metadata: { departmentAuthored: false } as never });
    expect(store.getById(R2)!.metadata.departmentAuthored).toBe(false);

    store.update(R2, { occupancyType: 'bedroom' as never });
    expect(store.getById(R2)!.metadata.departmentAuthored).toBe(false);
  });

  it('preserveMetadata=true (restoreSnapshot\'s own path) also carries departmentAuthored', () => {
    const store = new RoomStore(null, bimManager);
    store.add(minimalRoom(R3));
    store.update(R3, { metadata: { departmentAuthored: true } as never });

    // restoreSnapshot() calls update(..., true) — undo must not silently
    // un-author a department the user set before the undone action.
    const snap = store.getById(R3)!;
    store.update(R3, { name: 'Something else' }); // diverge
    store.restoreSnapshot(snap);
    expect(store.getById(R3)!.metadata.departmentAuthored).toBe(true);
    expect(store.getById(R3)!.name).toBe('Room 00-001');
  });

  it('roomNumberAuthored and departmentAuthored are independent — setting one never touches the other', () => {
    const store = new RoomStore(null, bimManager);
    store.add(minimalRoom(R4));
    store.update(R4, { roomNumber: '101', metadata: { roomNumberAuthored: true } as never });
    expect(store.getById(R4)!.metadata.roomNumberAuthored).toBe(true);
    expect(store.getById(R4)!.metadata.departmentAuthored).toBeUndefined();

    store.update(R4, { department: 'Residential', metadata: { departmentAuthored: true } as never });
    expect(store.getById(R4)!.metadata.departmentAuthored).toBe(true);
    // The earlier flag must still be there — a hand-written subset rebuild
    // that forgot roomNumberAuthored on THIS call would silently clear it.
    expect(store.getById(R4)!.metadata.roomNumberAuthored).toBe(true);
  });
});

describe('§DEPT153 — serializeRoom/deserializeRoom round-trip BOTH authorship flags', () => {
  // ⭐ Found while adding departmentAuthored: roomNumberAuthored itself was
  // ABSENT from SerializedRoom / serializeRoom / deserializeRoom — it survived
  // in-memory (proven above) but was silently DROPPED across a project
  // save/reload. Both flags are asserted together so neither regresses alone.
  it('a room with BOTH flags set round-trips through serialize -> deserialize unchanged', () => {
    const store = new RoomStore(null, bimManager);
    store.add(minimalRoom(R5));
    store.update(R5, {
      roomNumber: '101',
      department: 'Residential',
      metadata: { roomNumberAuthored: true, departmentAuthored: true } as never,
    });
    const room = store.getById(R5)!;

    const serialized = serializeRoom(room);
    expect(serialized.metadata.roomNumberAuthored).toBe(true);
    expect(serialized.metadata.departmentAuthored).toBe(true);

    const roundTripped = deserializeRoom(serialized as unknown as Record<string, unknown>);
    expect(roundTripped.metadata.roomNumberAuthored).toBe(true);
    expect(roundTripped.metadata.departmentAuthored).toBe(true);
    expect(roundTripped.department).toBe('Residential');
    expect(roundTripped.roomNumber).toBe('101');
  });

  it('a room where NEITHER flag was ever set round-trips as undefined, not false (unknown vs none)', () => {
    const store = new RoomStore(null, bimManager);
    store.add(minimalRoom(R6));
    const room = store.getById(R6)!;

    const serialized = serializeRoom(room);
    expect(serialized.metadata.roomNumberAuthored).toBeUndefined();
    expect(serialized.metadata.departmentAuthored).toBeUndefined();

    const roundTripped = deserializeRoom(serialized as unknown as Record<string, unknown>);
    expect(roundTripped.metadata.roomNumberAuthored).toBeUndefined();
    expect(roundTripped.metadata.departmentAuthored).toBeUndefined();
  });
});
