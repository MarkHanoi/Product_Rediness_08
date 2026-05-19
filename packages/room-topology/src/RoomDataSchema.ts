/**
 * ## MODIFICATION DECLARATION
 *
 * Layer Affected:    Semantic Model / Store validation gate
 * File:             src/elements/rooms/RoomDataSchema.ts
 * Contract:         docs/01_ELEMENTS/09_Rooms_Contract/01-ROOM-DATA-MODEL-CONTRACT.md §6
 *
 * Zod runtime schemas for all RoomData structures.
 * Applied at RoomStore.add() and RoomStore.update() boundaries to reject
 * corrupt inputs (AI-generated payloads, deserialised JSON) before store mutation.
 *
 * Design rules:
 *   - Schemas mirror RoomTypes.ts interfaces exactly — no divergence.
 *   - .passthrough() on top-level schemas allows unknown optional fields.
 *   - All schemas exported so AI-path commands can pre-validate before calling
 *     RoomStore.add() / update() (fail-fast at the command layer).
 */

import { z } from 'zod';
import { computeSignedArea, isSimple } from './RoomPolygonUtils';

// ── Vertex ────────────────────────────────────────────────────────────────────

export const RoomVertexSchema = z.object({
  x: z.number().finite({ message: 'vertex.x must be finite' }),
  z: z.number().finite({ message: 'vertex.z must be finite' }),
});

// ── OccupancyType ─────────────────────────────────────────────────────────────

const OCCUPANCY_TYPES = [
  'bedroom', 'living-room', 'kitchen', 'bathroom', 'dining-room',
  'utility-room', 'garage', 'storage-residential',
  'open-office', 'private-office', 'meeting-room', 'reception', 'breakout', 'server-room',
  'retail-floor', 'stockroom', 'changing-room',
  'patient-room', 'operating-theatre', 'waiting-room', 'consultation-room', 'pharmacy',
  'classroom', 'laboratory', 'lecture-hall', 'library', 'staff-room',
  'hotel-bedroom', 'restaurant', 'bar', 'function-room', 'spa',
  'warehouse', 'loading-bay', 'plant-room', 'electrical-room',
  'corridor', 'stairwell', 'lift-lobby', 'entrance-lobby', 'foyer',
  'wc', 'accessible-wc', 'shower-room', 'kitchen-shared', 'prayer-room',
  'terrace', 'balcony', 'atrium', 'courtyard',
  'unclassified',
] as const;

export const RoomOccupancyTypeSchema = z.enum(OCCUPANCY_TYPES);

// ── Detection Method ──────────────────────────────────────────────────────────

export const RoomDetectionMethodSchema = z.enum([
  'auto-topology', 'manual-boundary', 'point-pick', 'ai-generated', 'ifc-import',
]);

// ── Boundary ──────────────────────────────────────────────────────────────────

export const RoomBoundarySchema = z.object({
  polygon: z.array(RoomVertexSchema).min(3, { message: 'Room boundary must have at least 3 vertices' }),
  height: z.number().positive({ message: 'boundary.height must be > 0' }),
  baseOffset: z.number().finite({ message: 'boundary.baseOffset must be finite' }),
  detectionMethod: RoomDetectionMethodSchema,
})
  .refine(
    b => computeSignedArea(b.polygon) >= 0.01 || computeSignedArea(b.polygon) <= -0.01,
    { message: 'Room boundary area must be at least 0.01 m²' }
  )
  .refine(
    b => isSimple(b.polygon),
    { message: 'Room boundary polygon must not self-intersect' }
  );

// ── Finish Spec ───────────────────────────────────────────────────────────────

export const RoomFinishSpecSchema = z.object({
  materialId: z.string().optional(),
  materialName: z.string(),
  materialColor: z.string(),
  finishCode: z.string().optional(),
  nbs: z.string().optional(),
  csiDivision: z.string().optional(),
  notes: z.string().optional(),
});

export const RoomFinishesSchema = z.object({
  floor: RoomFinishSpecSchema.optional(),
  ceiling: RoomFinishSpecSchema.optional(),
  walls: RoomFinishSpecSchema.optional(),
  skirtingHeight: z.number().nonnegative().optional(),
  coveHeight: z.number().nonnegative().optional(),
});

// ── Computed Metrics ──────────────────────────────────────────────────────────

export const RoomComputedMetricsSchema = z.object({
  area: z.number().nonnegative(),
  grossArea: z.number().nonnegative(),
  perimeter: z.number().nonnegative(),
  volume: z.number().nonnegative(),
  centroid: RoomVertexSchema,
  boundingBox: z.object({
    minX: z.number(),
    minZ: z.number(),
    maxX: z.number(),
    maxZ: z.number(),
  }),
});

// ── IFC Data ──────────────────────────────────────────────────────────────────

export const RoomIfcDataSchema = z.object({
  guid: z.string().min(1),
  ifcClass: z.literal('IfcSpace'),
  predefinedType: z.enum(['SPACE', 'PARKING', 'GFA', 'INTERNAL', 'EXTERNAL']).optional(),
  longName: z.string().optional(),
  psets: z.record(z.string(), z.record(z.string(), z.union([z.string(), z.number(), z.boolean()]))).optional(),
});

// ── Metadata ──────────────────────────────────────────────────────────────────

export const RoomMetadataSchema = z.object({
  createdAt: z.number({ message: 'metadata.createdAt must be a Unix timestamp (ms)' }),
  modifiedAt: z.number({ message: 'metadata.modifiedAt must be a Unix timestamp (ms)' }),
  createdBy: z.string(),
  version: z.number().int().min(1, { message: 'metadata.version must be ≥ 1' }),
  aiGenerated: z.boolean().optional(),
  detectionVersion: z.number().int().nonnegative().optional(),
  tags: z.array(z.string()).optional(),
  description: z.string().optional(),
});

// ── Properties (extensible) ───────────────────────────────────────────────────

export const RoomPropertiesSchema = z
  .object({
    mark: z.string().optional(),
    comments: z.string().max(500).optional(),
    isNetArea: z.boolean().optional(),
    isFired: z.boolean().optional(),
    isAcoustic: z.boolean().optional(),
    ventilationType: z.enum(['natural', 'mechanical', 'mixed', 'none']).optional(),
    targetTemperature: z.number().optional(),
    lightingLux: z.number().nonnegative().optional(),
    acousticRating: z.number().optional(),
    sprinklerZone: z.string().optional(),
    hvacZone: z.string().optional(),
    accessibilityLevel: z.enum(['none', 'part-m', 'wheelchair-user-dwelling']).optional(),
  })
  .passthrough();

// ── RoomData — Add Gate ───────────────────────────────────────────────────────

/**
 * Full schema applied at RoomStore.add() before any mutation.
 * .passthrough() preserves unknown fields.
 */
export const RoomDataAddSchema = z
  .object({
    id: z.string().uuid({ message: 'room.id must be a valid UUID' }),
    type: z.literal('room', { message: 'room.type must be "room"' }),
    levelId: z.string().min(1, { message: 'room.levelId is required' }),
    parentId: z.string().optional(),
    name: z.string().max(256, { message: 'room.name must be ≤ 256 chars' }),
    roomNumber: z.string().max(64, { message: 'room.roomNumber must be ≤ 64 chars' }),
    department: z.string().optional(),
    unitId: z.string().optional(),
    boundary: RoomBoundarySchema,
    boundingWallIds: z.array(z.string()),
    boundingSlabIds: z.array(z.string()),
    boundingColumnIds: z.array(z.string()),
    occupancyType: RoomOccupancyTypeSchema,
    occupancyLoad: z.number().nonnegative().optional(),
    programmeArea: z.number().positive().optional(),
    finishes: RoomFinishesSchema,
    computed: RoomComputedMetricsSchema,
    colour: z.string().regex(/^#[0-9A-Fa-f]{6}$/, { message: 'colour must be a valid hex (#rrggbb)' }).optional(),
    opacity: z.number().min(0).max(1).optional(),
    properties: RoomPropertiesSchema,
    ifcData: RoomIfcDataSchema.optional(),
    revitId: z.string().optional(),
    phase: z.enum(['existing', 'new', 'demolished', 'temporary']).optional(),
    metadata: RoomMetadataSchema,
  })
  .passthrough();

// ── RoomData — Update Gate ────────────────────────────────────────────────────

/**
 * Partial schema applied at RoomStore.update() before mutation.
 * All fields optional — only those present are validated.
 * id, type, levelId are guarded by the store (immutable after creation).
 */
export const RoomDataUpdateSchema = z
  .object({
    name: z.string().max(256).optional(),
    roomNumber: z.string().max(64).optional(),
    department: z.string().optional(),
    unitId: z.string().optional(),
    boundary: RoomBoundarySchema.optional(),
    boundingWallIds: z.array(z.string()).optional(),
    boundingSlabIds: z.array(z.string()).optional(),
    boundingColumnIds: z.array(z.string()).optional(),
    occupancyType: RoomOccupancyTypeSchema.optional(),
    occupancyLoad: z.number().nonnegative().optional(),
    programmeArea: z.number().positive().optional(),
    finishes: RoomFinishesSchema.optional(),
    colour: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
    opacity: z.number().min(0).max(1).optional(),
    properties: RoomPropertiesSchema.optional(),
    ifcData: RoomIfcDataSchema.optional(),
    revitId: z.string().optional(),
    phase: z.enum(['existing', 'new', 'demolished', 'temporary']).optional(),
    metadata: RoomMetadataSchema.partial().optional(),
  })
  .passthrough();

// ── Error Formatter ───────────────────────────────────────────────────────────

export function formatRoomZodError(error: z.ZodError): string {
  return error.issues
    .map(issue => {
      const path = issue.path.length > 0 ? issue.path.join('.') : '(root)';
      return `${path}: ${issue.message}`;
    })
    .join('; ');
}
