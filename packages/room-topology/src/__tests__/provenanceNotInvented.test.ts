/**
 * C75 §7 EXIT CONDITIONS 1 AND 2 — provenance is recorded where it is known and
 * REFUSED where it is not.
 *
 * ─── WHAT IS BEING PROVEN, AND WHY EACH HALF IS SEPARATE ────────────────────
 *
 * Two defects, one contract, and they fail in opposite directions — which is
 * exactly why they get separate blocks rather than one "provenance works" test:
 *
 *   • **PV-01 (§7.1) — the LOAD boundary invented an origin.**
 *     `roomSnapshotUtils.ts:156` read
 *     `(rawBoundary['detectionMethod'] as any) || 'auto-topology'`, so a
 *     snapshot that recorded NOTHING loaded as if topology had flood-filled the
 *     boundary from the wall graph. C75 §2.1: a deserialiser reading a record
 *     without provenance knows exactly one thing — that the record lacks
 *     provenance. The assertions below are therefore NEGATIVE as much as
 *     positive: it is not enough that the loader produces *something*; it must
 *     specifically NOT produce a member of the five determinations.
 *
 *   • **PV-02 (§7.2) — the REPAIR path stamped substituted geometry as traced.**
 *     `RoomDetectionEngine.ts` ran `repairToSimplePolygon()` on a
 *     self-intersecting ring, replaced it with the largest simple sub-ring, and
 *     then wrote `detectionMethod: 'auto-topology'` — identical to a room whose
 *     boundary was genuinely traced. The substitution went to the console, and
 *     **the console is not the model** (C75 §4.c).
 *
 * ─── WHY BACKWARD COMPATIBILITY IS ITS OWN BLOCK (C75 §2.5) ─────────────────
 *
 * §2.5 and §2.1 are the same rule seen from two sides: the migration path must
 * not become a second site that invents provenance, AND it must not break the
 * back-catalogue. C75 §4.e names the failure mode explicitly — a required new
 * field breaks every existing snapshot, gets reverted, and the revert removes
 * provenance rather than fixing the migration. So the pre-change snapshot here
 * is a LITERAL, hand-written in the exact shape a room was persisted in before
 * 2026-08-12, and the load must neither throw nor guess.
 *
 * ─── WHAT THIS TEST CANNOT PROVE (stated, never inferred from silence) ──────
 * It drives the real `serializeRoom` / `deserializeRoom` and the real
 * `RoomBoundarySchema`, so it proves the SHAPE. It does not prove SEMANTIC
 * honesty — a producer that writes `manual-boundary` around machine output
 * satisfies every assertion here (C75 §6.3.a). That is the gates' subject, and
 * it is not closeable by a unit test.
 */

import { describe, it, expect } from 'vitest';
import { serializeRoom, deserializeRoom, type SerializedRoom } from '../roomSnapshotUtils';
import { RoomBoundarySchema, RoomDetectionMethodSchema } from '../RoomDataSchema';
import type { RoomData, RoomDetectionMethod } from '../RoomTypes';

/** The five members that are DETERMINATIONS — none may ever be invented. */
const DETERMINATIONS: readonly RoomDetectionMethod[] = [
  'auto-topology', 'manual-boundary', 'point-pick', 'ai-generated', 'ifc-import',
];

/**
 * A room in the shape it was persisted in BEFORE the provenance work — i.e. with
 * `boundary.detectionMethod` entirely absent. Deliberately a hand-written
 * literal rather than `serializeRoom()` output: the point is to exercise a
 * snapshot this code has never produced, which is what "existing snapshots parse
 * unchanged" actually means.
 */
function preProvenanceSnapshot(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'room-legacy-0001',
    type: 'room',
    levelId: 'L0',
    name: 'Legacy Room',
    roomNumber: '001',
    boundary: {
      polygon: [{ x: 0, z: 0 }, { x: 4, z: 0 }, { x: 4, z: 3 }, { x: 0, z: 3 }],
      height: 2.7,
      baseOffset: 0,
      // ⚠ NO detectionMethod. This absence IS the test.
      ...(overrides['boundary'] as Record<string, unknown> ?? {}),
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
    metadata: { createdAt: 1, modifiedAt: 1, createdBy: 'system', version: 1 },
  };
}

describe('C75 §7.1 / PV-01 — the load boundary records UNKNOWN, never a determination', () => {
  it('a snapshot with NO detectionMethod loads as origin-unknown — not auto-topology', () => {
    const room = deserializeRoom(preProvenanceSnapshot());

    // The positive claim.
    expect(room.boundary.detectionMethod).toBe('origin-unknown');

    // The NEGATIVE claim, which is the one PV-01 violated. Asserted against the
    // whole determination set rather than against 'auto-topology' alone: a
    // future edit that swapped the fabricated default for a DIFFERENT member
    // would be the identical defect, and a test naming only the old value would
    // pass through it.
    expect(DETERMINATIONS).not.toContain(room.boundary.detectionMethod);
  });

  it('the UNKNOWN carries its REASON — C75 §1.4 forbids a blank cell (§4.i)', () => {
    const room = deserializeRoom(preProvenanceSnapshot());
    expect(room.boundary.detectionDetail).toBeDefined();
    // The reason must be the MIGRATION reason, not a generic one: an old
    // snapshot is not evidence about origin in either direction (C75 §2.5).
    expect(room.boundary.detectionDetail).toContain('predates-provenance');
  });

  it('a snapshot that DOES record an origin keeps it, unchanged and unlaundered', () => {
    for (const method of DETERMINATIONS) {
      const room = deserializeRoom(
        preProvenanceSnapshot({ boundary: { detectionMethod: method } }),
      );
      expect(room.boundary.detectionMethod).toBe(method);
    }
  });

  it("an UNRECOGNISED value becomes UNKNOWN with 'conflicting-records', not with 'predates-provenance'", () => {
    // A value IS present and the loader cannot account for it. That is a
    // positive finding about vocabulary drift, and filing it as an absence
    // would discard the one fact the load established (C75 §1.4).
    const room = deserializeRoom(
      preProvenanceSnapshot({ boundary: { detectionMethod: 'flood-fill-v2' } }),
    );
    expect(room.boundary.detectionMethod).toBe('origin-unknown');
    expect(room.boundary.detectionDetail).toContain('conflicting-records');
    expect(room.boundary.detectionDetail).toContain('flood-fill-v2');
  });

  it('an EMPTY-STRING origin is treated as absent, not as a present value', () => {
    // The original defect used `||`, not `??`, so '' also fell into the
    // fabricated default. It must now fall into UNKNOWN like any other absence.
    const room = deserializeRoom(
      preProvenanceSnapshot({ boundary: { detectionMethod: '' } }),
    );
    expect(room.boundary.detectionMethod).toBe('origin-unknown');
  });
});

describe('C75 §2.5 — existing snapshots parse unchanged and never crash', () => {
  it('a pre-provenance snapshot loads without throwing', () => {
    expect(() => deserializeRoom(preProvenanceSnapshot())).not.toThrow();
  });

  it('and everything ELSE about it round-trips untouched', () => {
    // The migration must not be paid for with a silent change to unrelated
    // fields — that is how a provenance retrofit gets reverted (C75 §4.e).
    const room = deserializeRoom(preProvenanceSnapshot());
    expect(room.id).toBe('room-legacy-0001');
    expect(room.levelId).toBe('L0');
    expect(room.name).toBe('Legacy Room');
    expect(room.boundary.polygon).toHaveLength(4);
    expect(room.boundary.height).toBeCloseTo(2.7, 10);
  });

  it('the loaded UNKNOWN boundary validates against the real persistence schema', () => {
    // If `origin-unknown` were not a schema member, every legacy room would be
    // REJECTED at the store boundary on load — a migration that swaps an
    // invented value for a crash is not an improvement.
    const room = deserializeRoom(preProvenanceSnapshot());
    expect(() => RoomBoundarySchema.parse(room.boundary)).not.toThrow();
  });

  it('UNKNOWN survives a full serialise → deserialise round-trip, reason included', () => {
    // C75 §1.4 again, at the PERSISTENCE boundary: serialising the member and
    // dropping the reason would re-create the blank cell one save later.
    const loaded = deserializeRoom(preProvenanceSnapshot());
    const reloaded = deserializeRoom(
      JSON.parse(JSON.stringify(serializeRoom(loaded as RoomData))) as unknown,
    );
    expect(reloaded.boundary.detectionMethod).toBe('origin-unknown');
    expect(reloaded.boundary.detectionDetail).toContain('predates-provenance');
  });

  it('the serialised field is typed as the union — §7.1s second half', () => {
    // The serialised shape declared `detectionMethod: string` until 2026-08-12,
    // so the round-trip had no type-level opinion at all and could not notice a
    // value the union does not mean. This asserts the RUNTIME half of that
    // change (the compile-time half is `SerializedRoom['detectionMethod']`,
    // which now fails to accept a bare string at all).
    const loaded = deserializeRoom(preProvenanceSnapshot());
    const wire: SerializedRoom = serializeRoom(loaded as RoomData);
    expect(RoomDetectionMethodSchema.safeParse(wire.boundary.detectionMethod).success).toBe(true);
  });
});

describe('C75 §7.2 / PV-02 — a REPAIRED ring is inferred, never traced', () => {
  it("'repaired-ring' is a member of the vocabulary, distinct from 'auto-topology'", () => {
    // C75 §1.2: COMPUTED and INFERRED are never merged. A flood-fill is
    // entailed by the wall graph; a substituted sub-ring is plausible, not
    // entailed. If these two ever collapse to one member, Finding 4 is back.
    expect(RoomDetectionMethodSchema.safeParse('repaired-ring').success).toBe(true);
    expect(RoomDetectionMethodSchema.options).toContain('auto-topology');
    expect('repaired-ring').not.toBe('auto-topology');
  });

  it('a repaired boundary carrying its reason validates and round-trips', () => {
    // The engine writes this shape at the §PV-02-REPAIR-IS-INFERRED site. What
    // is proven here is that the shape SURVIVES persistence — a repair recorded
    // in the model but dropped on save is the console defect with extra steps.
    const repaired = {
      polygon: [{ x: 0, z: 0 }, { x: 5, z: 0 }, { x: 5, z: 4 }, { x: 0, z: 4 }],
      height: 3,
      baseOffset: 0,
      detectionMethod: 'repaired-ring' as const,
      detectionDetail:
        '§A.21.D58 repair — the face tracer emitted a SELF-INTERSECTING ring (9 verts) and ' +
        'repairToSimplePolygon() substituted its largest simple sub-ring (4 verts).',
    };
    expect(() => RoomBoundarySchema.parse(repaired)).not.toThrow();

    const room = deserializeRoom(preProvenanceSnapshot({ boundary: repaired }));
    expect(room.boundary.detectionMethod).toBe('repaired-ring');
    expect(room.boundary.detectionDetail).toContain('SELF-INTERSECTING');
    expect(room.boundary.detectionDetail).toContain('4 verts');
  });
});
