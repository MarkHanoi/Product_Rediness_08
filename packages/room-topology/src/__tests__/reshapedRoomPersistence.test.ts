/**
 * SAFE MODE ROOM RESHAPE — persistence coverage.
 *
 * WHAT IS BEING PROVEN. A room reshaped from a PREDICTED geometry must survive
 * save → load with BOTH its identity and that exact geometry intact. Two separate
 * properties, and both matter for a different reason:
 *
 *   • IDENTITY — `id` and `ifcData.guid` are AUTHORITATIVE with NO TOLERANCE EVER
 *     (ADR-0319). A re-minted GUID breaks correspondence with every previously
 *     exported IFC file INVISIBLY, because both files still open.
 *   • GEOMETRY — if the polygon the user approved does not survive the round-trip,
 *     the fidelity guarantee is only true until the next reload. That is a worse
 *     failure than never having it, because it looks correct in the session where
 *     anyone would think to check.
 *
 * WHY THE SCHEMA IS THE SUBJECT. `RoomDataAddSchema` is the actual persistence
 * boundary — it is what validates a room on the way into the store and what the
 * file-format layer round-trips. A test that JSON.stringify'd a literal and parsed
 * it back would prove only that JSON works; validating THROUGH the real schema is
 * what catches a schema that rejects, coerces, strips, or rounds a reshaped ring.
 *
 * The `.parse()` calls are the load-bearing assertions: a schema that REJECTED a
 * reshaped room would throw here rather than quietly returning a stripped object,
 * and a schema that STRIPPED the polygon would fail the deep-equality checks.
 */
import { describe, it, expect } from 'vitest';
import { RoomDataAddSchema } from '../RoomDataSchema';

/** A room AFTER a consequence reshape: the predicted 6×3 ring, not the original 6×4. */
const ROOM_ID = '3f2a91c4-7b5e-4d18-9c2f-8a1e6b0d4c73';

const reshaped = {
  // A real UUID — `RoomDataAddSchema` enforces the format, and using a made-up
  // string here would fail for a reason that has nothing to do with reshaping.
  id: ROOM_ID,
  type: 'room' as const,
  levelId: 'L1',
  name: 'Kitchen',
  roomNumber: '00-004',
  occupancyType: 'kitchen' as const,
  boundingWallIds: ['wall-s', 'wall-e', 'wall-n', 'wall-w'],
  boundingSlabIds: [],
  boundingColumnIds: [],
  properties: {},
  boundary: {
    // The PREDICTED ring, committed verbatim by ApplyPredictedRoomGeometryCommand.
    polygon: [{ x: 0, z: 0 }, { x: 6, z: 0 }, { x: 6, z: 3 }, { x: 0, z: 3 }],
    height: 2.7,
    baseOffset: 0,
    // AUTHORED provenance: a wall move reshaped this room, but the user drew it.
    detectionMethod: 'manual-boundary' as const,
  },
  computed: {
    area: 18, grossArea: 18, perimeter: 18, volume: 48.6,
    centroid: { x: 3, z: 1.5 },
    boundingBox: { minX: 0, minZ: 0, maxX: 6, maxZ: 3 },
  },
  finishes: { floor: { materialName: 'oak', materialColor: '#c9a37b' } },
  ifcData: { guid: 'IFC-GUID-RESHAPE-0001', ifcClass: 'IfcSpace' as const },
  metadata: { createdAt: 1, modifiedAt: 2, createdBy: 'user-7', version: 3 },
};

/** save → load, through the real persistence boundary. */
const roundTrip = (room: unknown): Record<string, unknown> =>
  RoomDataAddSchema.parse(JSON.parse(JSON.stringify(room))) as Record<string, unknown>;

describe('SAFE MODE ROOM RESHAPE — a reshaped room survives save/load', () => {
  it('IDENTITY survives: id and the IFC join key are byte-identical', () => {
    const loaded = roundTrip(reshaped) as typeof reshaped;
    expect(loaded.id).toBe(ROOM_ID);
    expect(loaded.ifcData!.guid).toBe('IFC-GUID-RESHAPE-0001');
    expect(loaded.name).toBe('Kitchen');
    expect(loaded.roomNumber).toBe('00-004');
  });

  it('the PREDICTED GEOMETRY survives byte-identically — not rounded, not restripped', () => {
    const loaded = roundTrip(reshaped) as typeof reshaped;
    // The whole point: the ring that comes back is the ring the human approved.
    expect(JSON.stringify(loaded.boundary.polygon)).toBe(JSON.stringify(reshaped.boundary.polygon));
    expect(loaded.computed.area).toBe(18);
    expect(loaded.computed.perimeter).toBe(18);
    expect(loaded.computed.centroid).toEqual({ x: 3, z: 1.5 });
    expect(loaded.computed.boundingBox).toEqual({ minX: 0, minZ: 0, maxX: 6, maxZ: 3 });
  });

  it('AUTHORED provenance survives the reshape AND the round-trip (C75 §1.1)', () => {
    // A system write may not mint `authored` — and may not erase it either. A room
    // the user drew is still user-drawn after a wall move shifted its edge.
    const loaded = roundTrip(reshaped) as typeof reshaped;
    expect(loaded.boundary.detectionMethod).toBe('manual-boundary');
    expect(loaded.metadata!.createdBy).toBe('user-7');
    expect(loaded.metadata!.createdAt).toBe(1);
  });

  it('membership survives — a reshape may not re-partition the room', () => {
    const loaded = roundTrip(reshaped) as typeof reshaped;
    expect(loaded.boundingWallIds).toEqual(['wall-s', 'wall-e', 'wall-n', 'wall-w']);
  });

  it('the round-trip is STABLE — a second save/load changes nothing', () => {
    const once = roundTrip(reshaped);
    const twice = roundTrip(once);
    expect(JSON.stringify(twice)).toBe(JSON.stringify(once));
  });

  it('POSITIVE CONTROL — the comparison WOULD catch a geometry change', () => {
    // Proves the assertions above measure the polygon rather than passing on any
    // input. A comparison that cannot fail is not a comparison.
    const mutated = structuredClone(reshaped);
    mutated.boundary.polygon[2] = { x: 6, z: 2.95 };
    const loaded = roundTrip(mutated) as typeof reshaped;
    expect(JSON.stringify(loaded.boundary.polygon))
      .not.toBe(JSON.stringify(reshaped.boundary.polygon));
  });
});
