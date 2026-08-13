/**
 * GE-11 — `getRoomsContainingPoint` over a CONCAVE room needs the TRUE bounding box.
 *
 * WHAT IS BEING PROVEN. `RoomStore.getRoomsContainingPoint` filters candidates
 * through `roomSpatialIndex.query()` BEFORE `pointInPolygon` runs — the index sits
 * UPSTREAM of the predicate, so a room whose index entry undersizes its footprint
 * is a SILENT FALSE NEGATIVE at a shipped public method, however correct the
 * polygon test is.
 *
 * Two rival AABB conventions used to feed this one index (C73 §1/§3, gate
 * `check-room-aabb-canonical`):
 *   TRUE-BBOX     — the polygon's own extent (`computed.boundingBox`);
 *   CIRCLE-APPROX — centroid ± sqrt(area/PI), a circle of equal AREA re-boxed.
 * Equal area does not imply equal extent: the circle box is exact only for a
 * square and understates every other footprint in at least one axis.
 *
 * This file is the gate's own numeric example as a RUNTIME test: an L-shaped
 * room of 20 m², true bbox x∈[0,6]; circle box x∈[-0.323, 4.723]; interior probe
 * (5.5, 1.0). The probe is INSIDE the true bbox and OUTSIDE the circle box, so it
 * DIFFERENTIATES the conventions — under CIRCLE-APPROX the index could never
 * return the room and the public method misses; under TRUE-BBOX (the canonical
 * convention, now the ONLY one after the GE-11 fix to ReDetectRoomsCommand /
 * DetectAllRoomsCommand / DeleteRoomCommand) it is found.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { RoomStore } from '../RoomStore';
import { roomSpatialIndex, type BimManager } from '@pryzm/core-app-model';
import { polygonAreaM2, polygonCentroid, polygonAABB } from '../RoomPolygonUtils';

// A real UUID — RoomDataAddSchema enforces the format.
const ROOM_ID = '9d4e2f1a-6c3b-4a87-b512-0e9f7a3c5d21';
const LEVEL_ID = 'L1';

/** Concave L-room: legs 6×2 and 2×4 ⇒ area 20 m², extent 6×6 (the gate's ARM B fixture). */
const L_POLYGON = [
  { x: 0, z: 0 }, { x: 6, z: 0 }, { x: 6, z: 2 },
  { x: 2, z: 2 }, { x: 2, z: 6 }, { x: 0, z: 6 },
];

/** Interior probe, deep inside the long leg — inside the true bbox, outside the circle box. */
const PROBE = { x: 5.5, z: 1.0 };

const bimStub = {
  getLevelById: (id: string) => ({ id, elevation: 0, height: 3.0 }),
} as unknown as BimManager;

function makeLRoom() {
  return {
    id: ROOM_ID,
    type: 'room' as const,
    levelId: LEVEL_ID,
    name: 'L-Room',
    roomNumber: '00-001',
    occupancyType: 'living' as const,
    boundingWallIds: ['wall-a', 'wall-b', 'wall-c', 'wall-d', 'wall-e', 'wall-f'],
    boundingSlabIds: [],
    boundingColumnIds: [],
    properties: {},
    boundary: {
      polygon: L_POLYGON.map(v => ({ ...v })),
      height: 2.7,
      baseOffset: 0,
      detectionMethod: 'manual-boundary' as const,
    },
    computed: {
      area: 20, grossArea: 20, perimeter: 24, volume: 54,
      centroid: { x: 2.2, z: 2.2 },
      boundingBox: { minX: 0, minZ: 0, maxX: 6, maxZ: 6 },
    },
    metadata: { createdAt: 1, modifiedAt: 1, createdBy: 'test', version: 1 },
  };
}

describe('GE-11 — concave-room containment goes through the TRUE-bbox spatial index', () => {
  let store: RoomStore;

  beforeEach(() => {
    store = new RoomStore(null, bimStub);
  });

  afterEach(() => {
    // The index is a module singleton — leave no fixture entries behind.
    try { roomSpatialIndex.remove(ROOM_ID); } catch { /* already gone */ }
  });

  it('POSITIVE CONTROL — the probe DIFFERENTIATES the two conventions on this footprint', () => {
    const area = Math.abs(polygonAreaM2(L_POLYGON));
    const c = polygonCentroid(L_POLYGON);       // area-centroid, not the vertex mean
    const r = Math.sqrt(area / Math.PI);        // the outlawed circle-approx radius
    expect(area).toBeCloseTo(20, 6);
    expect(c.x).toBeCloseTo(2.2, 6);

    // CIRCLE-APPROX box maxX = 2.2 + 2.523 ≈ 4.723 — it EXCLUDES the probe…
    expect(c.x + r).toBeLessThan(PROBE.x);
    // …while the TRUE bbox (the polygon's own extent) CONTAINS it.
    const bb = polygonAABB(L_POLYGON);
    expect(bb.maxX).toBeGreaterThanOrEqual(PROBE.x);
    expect(PROBE.x).toBeGreaterThanOrEqual(bb.minX);
    expect(PROBE.z).toBeGreaterThanOrEqual(bb.minZ);
    expect(bb.maxZ).toBeGreaterThanOrEqual(PROBE.z);
  });

  it('PUBLIC METHOD — getRoomsContainingPoint finds the interior probe of the concave room', () => {
    store.add(makeLRoom());
    // Under CIRCLE-APPROX this was a silent false negative: the index (a hard
    // candidate gate) could never surface the room for a probe outside its
    // undersized box. Under the canonical TRUE-BBOX entry it is found.
    const hits = store.getRoomsContainingPoint(PROBE.x, PROBE.z, LEVEL_ID);
    expect(hits.map(rm => rm.id)).toEqual([ROOM_ID]);
  });

  it('MECHANISM — the index is a hard gate upstream of pointInPolygon; the canonical re-insert restores the hit', () => {
    store.add(makeLRoom());

    // Drop the room from the index only: the point is still interior to the
    // polygon, yet the public method returns NOTHING — proof the index entry,
    // not the polygon test, decides visibility (why the AABB convention is
    // load-bearing, and why an undersized entry is a correctness bug).
    roomSpatialIndex.remove(ROOM_ID);
    expect(store.getRoomsContainingPoint(PROBE.x, PROBE.z, LEVEL_ID)).toEqual([]);

    // Re-insert under the canonical convention — exactly what the fixed command
    // sites (ReDetectRooms / DetectAllRooms / DeleteRoom-undo) now do.
    const stored = store.getById(ROOM_ID);
    expect(stored).toBeDefined();
    roomSpatialIndex.insert(ROOM_ID, stored!.computed.boundingBox);
    expect(store.getRoomsContainingPoint(PROBE.x, PROBE.z, LEVEL_ID).map(rm => rm.id))
      .toEqual([ROOM_ID]);
  });
});
