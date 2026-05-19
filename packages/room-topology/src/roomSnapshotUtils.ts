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

import { RoomData, RoomBoundary, RoomMetadata } from './RoomTypes';
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
    detectionMethod: string;
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
      tags:             room.metadata.tags ? [...room.metadata.tags] : undefined,
      description:      room.metadata.description,
    },
  };
}

// ── Deserialise ───────────────────────────────────────────────────────────────

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
    detectionMethod: (rawBoundary['detectionMethod'] as any) || 'auto-topology',
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
