// ADR-0315 U2.2 — typed room predicates: the scope resolver's room vocabulary.
// "the living room" / "rooms named Bedroom" / "all bedrooms" / "rooms > 15 m²".

import { describe, expect, it, beforeEach } from 'vitest';
import { RoomStore } from '../src/RoomStore.js';
import type { RoomData } from '../src/RoomTypes.js';

function room(over: Partial<RoomData> & Pick<RoomData, 'id' | 'name'>): RoomData {
  return {
    type: 'room',
    levelId: 'L0',
    roomNumber: '',
    occupancyType: 'bedroom',
    boundary: { polygon: [{ x: 0, z: 0 }, { x: 4, z: 0 }, { x: 4, z: 4 }, { x: 0, z: 4 }] },
    boundingWallIds: [],
    boundingSlabIds: [],
    boundingColumnIds: [],
    finishes: {},
    computed: {
      area: 16, grossArea: 16, perimeter: 16, volume: 43,
      centroid: { x: 2, z: 2 },
      boundingBox: { minX: 0, minZ: 0, maxX: 4, maxZ: 4 },
    },
    properties: {},
    ...over,
  } as RoomData;
}

describe('RoomStore typed predicates (ADR-0315 U2.2)', () => {
  let store: RoomStore;

  beforeEach(() => {
    store = new RoomStore();
    store.add(room({ id: 'r1', name: 'Bedroom 1', occupancyType: 'bedroom' }));
    store.add(room({ id: 'r2', name: 'Bedroom 10', occupancyType: 'bedroom', levelId: 'L1' }));
    store.add(room({ id: 'r3', name: 'Living Room', occupancyType: 'living-room',
      computed: { area: 28, grossArea: 28, perimeter: 24, volume: 75, centroid: { x: 2, z: 2 },
        boundingBox: { minX: 0, minZ: 0, maxX: 7, maxZ: 4 } } }));
    store.add(room({ id: 'r4', name: 'Kitchen', occupancyType: 'kitchen',
      computed: { area: 9, grossArea: 9, perimeter: 12, volume: 24, centroid: { x: 1.5, z: 1.5 },
        boundingBox: { minX: 0, minZ: 0, maxX: 3, maxZ: 3 } } }));
  });

  it('findByName: case-insensitive substring, exact-name matches FIRST', () => {
    const hits = store.findByName('bedroom 1');
    expect(hits.map((r) => r.id)).toEqual(['r1', 'r2']); // exact 'Bedroom 1' outranks 'Bedroom 10'
    expect(store.findByName('room').map((r) => r.id).sort()).toEqual(['r1', 'r2', 'r3']);
    expect(store.findByName('')).toEqual([]);
  });

  it('findByName: level filter applies', () => {
    expect(store.findByName('bedroom', 'L1').map((r) => r.id)).toEqual(['r2']);
  });

  it('findByOccupancy: type set, case-insensitive, level-filterable', () => {
    expect(store.findByOccupancy(['bedroom']).map((r) => r.id).sort()).toEqual(['r1', 'r2']);
    expect(store.findByOccupancy(['BEDROOM'], 'L0').map((r) => r.id)).toEqual(['r1']);
    expect(store.findByOccupancy(['kitchen', 'living-room']).map((r) => r.id).sort()).toEqual(['r3', 'r4']);
    expect(store.findByOccupancy([])).toEqual([]);
  });

  it('findByArea: inclusive range; a room with NO computed area never matches', () => {
    expect(store.findByArea({ min: 15 }).map((r) => r.id).sort()).toEqual(['r1', 'r2', 'r3']);
    expect(store.findByArea({ min: 10, max: 20 }).map((r) => r.id).sort()).toEqual(['r1', 'r2']);
    expect(store.findByArea({ max: 10 }).map((r) => r.id)).toEqual(['r4']);
    // §CONTEXT-DATA-HONESTY — absence of a metric is not zero.
    const noMetrics = room({ id: 'r5', name: 'Void' });
    delete (noMetrics as { computed?: unknown }).computed;
    store.add(noMetrics);
    expect(store.findByArea({ max: 1000 }).map((r) => r.id)).not.toContain('r5');
  });

  it('predicates return clones — mutating a result never mutates the store', () => {
    const hit = store.findByName('Kitchen')[0]!;
    hit.name = 'HACKED';
    expect(store.getById('r4')!.name).toBe('Kitchen');
  });
});
