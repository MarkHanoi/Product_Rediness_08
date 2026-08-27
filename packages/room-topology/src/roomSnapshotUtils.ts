/**
 * ## MODIFICATION DECLARATION
 *
 * Layer Affected:    Persistence / Serialisation
 * File:             src/elements/rooms/roomSnapshotUtils.ts
 * Contract:         docs/01_ELEMENTS/09_Rooms_Contract/08-ROOM-DATABASE-PERSISTENCE-CONTRACT.md
 *                   docs/01_ELEMENTS/09_Rooms_Contract/ROOM-IMPLEMENTATION-PLAN.md §1.5
 *
 * Serialisation helpers for persistence and undo.
 * All serialised forms are plain JSON — no THREE.js instances.
 * Pattern from src/commands/walls/wallSnapshotUtils.ts.
 */

import { RoomData, RoomBoundary, RoomMetadata, RoomDetectionMethod } from './RoomTypes';
import { RoomDetectionMethodSchema } from './RoomDataSchema';
import { computeRoomMetrics, ensureCCW } from './RoomPolygonUtils';

// ── Serialised Form ───────────────────────────────────────────────────────────

/** Plain JSON-safe representation of RoomData. All fields are JSON primitives. */
export interface SerializedRoom {
  id: string;
  type: 'room';
  levelId: string;
  parentId?: string;
  name: string;
  roomNumber: string;
  department?: string;
  boundary: {
    polygon: Array<{ x: number; z: number }>;
    height: number;
    baseOffset: number;
    /**
     * **C75 §7 exit condition 1** — typed as the union, not as bare `string`.
     *
     * It was `string` until 2026-08-12, and that mattered: with no type-level
     * opinion the round-trip could not notice `deserializeRoom` writing a value
     * the union does not mean, which is exactly what `|| 'auto-topology'` did
     * one function below (C75 §0 Finding 1, PV-01).
     */
    detectionMethod: RoomDetectionMethod;
    /** C75 §1.4 / §2.3 — the REASON. Optional: pre-2026-08-12 snapshots lack it. */
    detectionDetail?: string;
  };
  boundingWallIds: string[];
  boundingSlabIds: string[];
  boundingColumnIds: string[];
  occupancyType: string;
  occupancyLoad?: number;
  programmeArea?: number;
  finishes: Record<string, unknown>;
  computed: {
    area: number;
    grossArea: number;
    perimeter: number;
    volume: number;
    centroid: { x: number; z: number };
    boundingBox: { minX: number; minZ: number; maxX: number; maxZ: number };
  };
  colour?: string;
  opacity?: number;
  properties: Record<string, unknown>;
  ifcData?: Record<string, unknown>;
  revitId?: string;
  phase?: string;
  metadata: {
    createdAt: number;
    modifiedAt: number;
    createdBy: string;
    version: number;
    aiGenerated?: boolean;
    detectionVersion?: number;
    // §DEPT153 (L-12540+) — ⭐ FOUND WHILE ADDING departmentAuthored: this
    // serialised shape, `serializeRoom()` and `deserializeRoom()` below all
    // OMITTED `roomNumberAuthored` (RoomTypes.ts's own EI-7e flag, live since
    // §FIX-ROOM-SIBLING-HANDLERS-STORE). It survives in-memory (RoomStore.update
    // merges it correctly — see that file) but was silently DROPPED across a
    // project save/reload, because the persistence boundary never carried it.
    // Adding departmentAuthored alone would have shipped the identical defect
    // on day one, so both flags are declared and carried here together.
    roomNumberAuthored?: boolean;
    departmentAuthored?: boolean;
    tags?: string[];
    description?: string;
  };
}

// ── Serialise ─────────────────────────────────────────────────────────────────

/**
 * Converts RoomData to a plain JSON-safe object.
 * Called by ProjectSerializer and by command undo() snapshot capture.
 * No THREE.js instances in the output.
 */
export function serializeRoom(room: RoomData): SerializedRoom {
  return {
    id: room.id,
    type: 'room',
    levelId: room.levelId,
    parentId: room.parentId,
    name: room.name,
    roomNumber: room.roomNumber,
    department: room.department,
    boundary: {
      polygon: room.boundary.polygon.map(v => ({ x: v.x, z: v.z })),
      height: room.boundary.height,
      baseOffset: room.boundary.baseOffset,
      detectionMethod: room.boundary.detectionMethod,
      // C75 §1.4 — the reason travels WITH the member. Serialising the method
      // and dropping the reason would persist a bare `origin-unknown`, which is
      // the §4.i blank cell re-created at the persistence boundary.
      detectionDetail: room.boundary.detectionDetail,
    },
    boundingWallIds: [...room.boundingWallIds],
    boundingSlabIds: [...room.boundingSlabIds],
    boundingColumnIds: [...room.boundingColumnIds],
    occupancyType: room.occupancyType,
    occupancyLoad: room.occupancyLoad,
    programmeArea: room.programmeArea,
    finishes: JSON.parse(JSON.stringify(room.finishes ?? {})),
    computed: {
      area: room.computed.area,
      grossArea: room.computed.grossArea,
      perimeter: room.computed.perimeter,
      volume: room.computed.volume,
      centroid: { x: room.computed.centroid.x, z: room.computed.centroid.z },
      boundingBox: { ...room.computed.boundingBox },
    },
    colour: room.colour,
    opacity: room.opacity,
    properties: JSON.parse(JSON.stringify(room.properties ?? {})),
    ifcData: room.ifcData ? JSON.parse(JSON.stringify(room.ifcData)) : undefined,
    revitId: room.revitId,
    phase: room.phase,
    metadata: {
      createdAt:        room.metadata.createdAt,
      modifiedAt:       room.metadata.modifiedAt,
      createdBy:        room.metadata.createdBy,
      version:          room.metadata.version,
      aiGenerated:      room.metadata.aiGenerated,
      detectionVersion: room.metadata.detectionVersion,
      // §DEPT153 — see SerializedRoom.metadata's note: both authorship flags
      // must be carried across the persistence boundary, not just the
      // in-memory RoomStore.update() merge.
      roomNumberAuthored: room.metadata.roomNumberAuthored,
      departmentAuthored: room.metadata.departmentAuthored,
      tags:             room.metadata.tags ? [...room.metadata.tags] : undefined,
      description:      room.metadata.description,
    },
  };
}

// ── Deserialise ───────────────────────────────────────────────────────────────

/**
 * **§PV-01-UNKNOWN-NOT-AUTO — C75 §2.1 / §1.4 / §7 exit condition 1.**
 *
 * Read the boundary's origin out of a raw snapshot, or record that it is not
 * known. This function exists because the one line it replaced was the canonical
 * violation of the entire contract:
 *
 * ```ts
 * detectionMethod: (rawBoundary['detectionMethod'] as any) || 'auto-topology',
 * ```
 *
 * Three separate defects in one expression, all named by C75 §0 Finding 1:
 *
 *  1. **`|| '<union member>'`** (C75 §4.a). A snapshot missing the field loaded
 *     *as if topology had flood-filled the boundary from the wall graph* —
 *     silently upgrading an unknown origin to the union's most authoritative
 *     machine member. §2.1: a deserialiser reading a record without provenance
 *     knows exactly ONE thing, that the record lacks provenance, and that is
 *     what it must record.
 *  2. **`as any` at a provenance boundary** (C75 §4.b) — defeating the union at
 *     precisely the point the union existed to catch this.
 *  3. **`||`, not `??`** — so an empty string, which is a *present* value, was
 *     also swallowed into the same fabricated default.
 *
 * What it does now, and why each branch is the honest one:
 *
 *  • **Absent** → `origin-unknown` + `predates-provenance`. Every snapshot
 *    written before 2026-08-12 lacks this field, and an old snapshot is not
 *    evidence about origin **in either direction** (C75 §2.5). It parses, it
 *    loads, it never crashes — it simply declines to claim something it cannot
 *    know.
 *  • **Present and a valid member** → carried through, unchanged. Parsed with
 *    the union's OWN Zod schema rather than a cast, so the type-level opinion
 *    the serialised shape now has is actually enforced at runtime.
 *  • **Present but NOT a member** → `origin-unknown` + `conflicting-records`,
 *    the C75 `ProvenanceUnknownReason` for *a value IS present and we cannot
 *    account for it*. Deliberately distinct from the absent case: vocabulary
 *    drift is a positive finding about a producer, and filing it as an absence
 *    would throw away the one fact the load actually established.
 *
 * ⚠ It returns a PARTIAL boundary rather than a bare method so `detectionDetail`
 * travels with it: C75 §1.4 makes UNKNOWN a value *with a reason*, and a caller
 * that could spread the member without the reason would be back at §4.i — a
 * blank cell — one keystroke later.
 */
function readBoundaryOrigin(
  rawBoundary: Record<string, unknown>,
): Pick<RoomBoundary, 'detectionMethod' | 'detectionDetail'> {
  const raw = rawBoundary['detectionMethod'];
  const rawDetail = rawBoundary['detectionDetail'];
  const detail = typeof rawDetail === 'string' && rawDetail.length > 0 ? rawDetail : undefined;

  if (raw === undefined || raw === null || raw === '') {
    return {
      detectionMethod: 'origin-unknown',
      detectionDetail:
        'predates-provenance — this snapshot carries no detectionMethod. Written before the field ' +
        'existed, or by a producer that never stated one; either way the origin of this boundary is ' +
        'not recorded and cannot be reconstructed from the snapshot (C75 §1.4, §2.5).',
    };
  }

  const parsed = RoomDetectionMethodSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      detectionMethod: 'origin-unknown',
      detectionDetail:
        `conflicting-records — the snapshot states detectionMethod='${String(raw)}', which is not a ` +
        'member of RoomDetectionMethod. A value IS present and this loader cannot account for it ' +
        '(vocabulary drift), which is a positive finding, not an absence (C75 §1.4).',
    };
  }

  const method: RoomDetectionMethod = parsed.data;
  return detail === undefined
    ? { detectionMethod: method }
    : { detectionMethod: method, detectionDetail: detail };
}

/**
 * Reconstructs a RoomData from a plain JSON object (from ProjectLoader or undo snapshot).
 * Recomputes metrics to guarantee freshness.
 * Normalises winding to CCW.
 */
export function deserializeRoom(raw: unknown): RoomData {
  if (typeof raw !== 'object' || raw === null) {
    throw new Error('[deserializeRoom] Input must be a non-null object');
  }

  const r = raw as Record<string, unknown>;

  if (!r['id'] || typeof r['id'] !== 'string') {
    throw new Error('[deserializeRoom] Missing or invalid id');
  }
  if (r['type'] !== 'room') {
    throw new Error(`[deserializeRoom] Expected type 'room', got '${r['type']}'`);
  }

  const rawBoundary = r['boundary'] as Record<string, unknown>;
  if (!rawBoundary || !Array.isArray(rawBoundary['polygon'])) {
    throw new Error('[deserializeRoom] Missing or invalid boundary');
  }

  const polygon = (rawBoundary['polygon'] as Array<{ x: number; z: number }>)
    .map(v => ({ x: Number(v.x), z: Number(v.z) }));

  const boundary: RoomBoundary = {
    polygon,
    height: Number(rawBoundary['height']) || 3.0,
    baseOffset: Number(rawBoundary['baseOffset']) || 0,
    ...readBoundaryOrigin(rawBoundary),
  };

  // Normalise winding
  ensureCCW(boundary.polygon);

  const rawMeta = (r['metadata'] as Record<string, unknown>) ?? {};
  const now = Date.now();
  const metadata: RoomMetadata = {
    createdAt:        Number(rawMeta['createdAt'])  || now,
    modifiedAt:       Number(rawMeta['modifiedAt']) || now,
    createdBy:        String(rawMeta['createdBy'] ?? 'system'),
    version:          Number(rawMeta['version'])    || 1,
    aiGenerated:      rawMeta['aiGenerated'] === true,
    detectionVersion: rawMeta['detectionVersion'] != null ? Number(rawMeta['detectionVersion']) : undefined,
    // §DEPT153 — see SerializedRoom.metadata's note above serializeRoom(): both
    // flags must round-trip through JSON, not just through the in-memory
    // RoomStore.update() merge.
    roomNumberAuthored: rawMeta['roomNumberAuthored'] === true ? true : undefined,
    departmentAuthored: rawMeta['departmentAuthored'] === true ? true : undefined,
    tags:             Array.isArray(rawMeta['tags']) ? (rawMeta['tags'] as string[]) : undefined,
    description:      rawMeta['description'] != null ? String(rawMeta['description']) : undefined,
  };

  const room: RoomData = {
    id:               String(r['id']),
    type:             'room',
    levelId:          String(r['levelId'] ?? ''),
    parentId:         r['parentId'] != null ? String(r['parentId']) : undefined,
    name:             String(r['name'] ?? ''),
    roomNumber:       String(r['roomNumber'] ?? ''),
    department:       r['department'] != null ? String(r['department']) : undefined,
    boundary,
    boundingWallIds:  Array.isArray(r['boundingWallIds'])  ? (r['boundingWallIds'] as string[])  : [],
    boundingSlabIds:  Array.isArray(r['boundingSlabIds'])  ? (r['boundingSlabIds'] as string[])  : [],
    boundingColumnIds: Array.isArray(r['boundingColumnIds']) ? (r['boundingColumnIds'] as string[]) : [],
    occupancyType:    (r['occupancyType'] as any) || 'unclassified',
    occupancyLoad:    r['occupancyLoad'] != null ? Number(r['occupancyLoad']) : undefined,
    programmeArea:    r['programmeArea'] != null ? Number(r['programmeArea']) : undefined,
    finishes:         (r['finishes'] as any) ?? {},
    computed:         computeRoomMetrics(boundary),   // always recomputed — never trusted from JSON
    colour:           r['colour'] != null ? String(r['colour']) : undefined,
    opacity:          r['opacity'] != null ? Number(r['opacity']) : undefined,
    properties:       (r['properties'] as any) ?? {},
    ifcData:          r['ifcData'] != null ? (r['ifcData'] as any) : undefined,
    revitId:          r['revitId'] != null ? String(r['revitId']) : undefined,
    phase:            r['phase'] != null ? (r['phase'] as any) : undefined,
    metadata,
  };

  return room;
}

/**
 * Recomputes the computed metrics for a room from its boundary.
 * Called after any boundary mutation to guarantee computed fields are fresh.
 * Returns a new RoomData with updated computed fields — does not mutate input.
 */
export function recomputeRoomMetrics(room: RoomData): RoomData {
  const computed = computeRoomMetrics(room.boundary);
  return { ...room, computed };
}
