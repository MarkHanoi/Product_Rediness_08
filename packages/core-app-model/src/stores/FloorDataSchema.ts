/**
 * FloorDataSchema — Zod runtime validation for the Floor semantic model.
 * Contract: docs/01_ELEMENTS/08_Floors_Contract/01-FLOOR-DATA-MODEL-CONTRACT.md §5
 * No Three.js, no store, no commands.
 */

import { z } from 'zod';

// ── Vertex ─────────────────────────────────────────────────────────────────

export const FloorVertexSchema = z.object({
  x: z.number().finite(),
  z: z.number().finite(),
});

// ── Layer function ─────────────────────────────────────────────────────────

export const FloorLayerFunctionSchema = z.enum([
  'finish',
  'adhesive',
  'screed',
  'underfloor-heating',
  'insulation',
  'tanking',
  'substrate',
]);

// ── Layer ──────────────────────────────────────────────────────────────────

export const FloorLayerSchema = z.object({
  name: z.string().min(1),
  function: FloorLayerFunctionSchema,
  thickness: z.number().positive(),
  materialId: z.string().optional(),
  materialColor: z.string().optional(),
  visible: z.boolean().optional(),
  lambda: z.number().optional(),
  rValue: z.number().optional(),
  wetAreaCompliant: z.boolean().optional(),
  acousticImpactRating: z.number().optional(),
});

// ── Finish spec ────────────────────────────────────────────────────────────

export const FloorPatternSchema = z.enum([
  'none',
  'tile-300x300',
  'tile-600x600',
  'tile-600x300',
  'tile-herringbone',
  'plank-90',
  'plank-45',
  'plank-herringbone',
  'terrazzo',
  'seamless',
]);

export const FloorFinishSpecSchema = z.object({
  finishMaterialId: z.string().optional(),
  finishColor: z.string().optional(),
  finishPattern: FloorPatternSchema.optional(),
  jointWidth: z.number().positive().optional(),
  jointColor: z.string().optional(),
  exposedScreed: z.boolean(),
  coveSkirting: z.boolean().optional(),
  materialName: z.string().optional(),
});

// ── Slope ──────────────────────────────────────────────────────────────────

export const FloorSlopeSchema = z.object({
  fallRatio: z.number().nonnegative(),
  directionX: z.number().finite(),
  directionZ: z.number().finite(),
  pivotX: z.number().finite(),
  pivotZ: z.number().finite(),
  secondaryFallRatio: z.number().nonnegative().optional(),
  secondaryDirectionX: z.number().finite().optional(),
  secondaryDirectionZ: z.number().finite().optional(),
}).refine(
  (s) => Math.abs(Math.sqrt(s.directionX ** 2 + s.directionZ ** 2) - 1.0) < 0.01,
  { message: 'slope.directionX/Z must form a unit vector (magnitude = 1.0 ± 0.01)' }
);

// ── Service hole ───────────────────────────────────────────────────────────

export const FloorHoleSubTypeSchema = z.enum([
  'floor-drain',
  'floor-box',
  'column-sleeve',
  'sump-pit',
  'floor-hatch',
  'pipe-sleeve',
  'generic',
]);

export const FloorHoleShapeSchema = z.enum(['rectangular', 'circular', 'polygon']);

export const FloorServiceHoleSchema = z.object({
  id: z.string().min(1),
  subType: FloorHoleSubTypeSchema,
  shape: FloorHoleShapeSchema,
  offsetX: z.number().optional(),
  offsetZ: z.number().optional(),
  width: z.number().positive().optional(),
  depth: z.number().positive().optional(),
  centerX: z.number().optional(),
  centerZ: z.number().optional(),
  radius: z.number().positive().optional(),
  polygon: z.array(FloorVertexSchema).min(3).optional(),
  label: z.string().optional(),
  elementId: z.string().min(1),
  frameColor: z.string().optional(),
  depth3d: z.number().positive().optional(),
  gratingMaterialId: z.string().optional(),
});

// ── UFH ────────────────────────────────────────────────────────────────────

export const FloorUnderfloorHeatingSchema = z.object({
  type: z.enum(['water', 'electric']),
  pipePitch: z.number().positive().optional(),
  outputWatts: z.number().positive().optional(),
  thermostatZoneId: z.string().optional(),
  systemMaterialId: z.string().optional(),
});

// ── Boundary ───────────────────────────────────────────────────────────────

export const FloorBoundarySchema = z.object({
  polygon: z.array(FloorVertexSchema).min(3),
  baseOffset: z.number().nonnegative(),
  thickness: z.number().min(0.003),
  detectionMethod: z.enum([
    'manual-polygon',
    'from-room',
    'from-slab',
    'ai-generated',
    'ifc-import',
  ]),
});

// ── IFC data ───────────────────────────────────────────────────────────────

export const FloorIfcDataSchema = z.object({
  guid: z.string().min(1),
  ifcClass: z.literal('IfcCovering'),
  predefinedType: z.literal('FLOORING'),
  objectType: z.string().optional(),
  description: z.string().optional(),
  longName: z.string().optional(),
  psets: z.record(z.string(), z.record(z.string(), z.union([z.string(), z.number(), z.boolean()]))).optional(),
});

// ── Metadata ───────────────────────────────────────────────────────────────

export const FloorMetadataSchema = z.object({
  createdAt: z.number().int().positive(),
  modifiedAt: z.number().int().positive(),
  createdBy: z.string().min(1),
  version: z.number().int().min(1),
  tags: z.array(z.string()).optional(),
  description: z.string().optional(),
});

// ── Properties ─────────────────────────────────────────────────────────────

export const FloorPropertiesSchema = z.object({
  mark: z.string().optional(),
  comments: z.string().optional(),
  manufacturer: z.string().optional(),
  productCode: z.string().optional(),
  installationDate: z.string().optional(),
  slip_resistance: z.string().optional(),
  pendulumValue: z.number().optional(),
  fireClassification: z.string().optional(),
  chemicalResistance: z.string().optional(),
  thermalTransmittance: z.number().optional(),
  warrantyYears: z.number().optional(),
}).passthrough();

// ── Primary schema ─────────────────────────────────────────────────────────

export const FloorDataSchema = z.object({
  id: z.string().min(1),
  type: z.literal('floor'),
  levelId: z.string().min(1),
  parentId: z.string().optional(),

  label: z.string().min(1),
  floorNumber: z.string(),
  department: z.string().optional(),
  zoneType: z.enum(['dry', 'wet', 'raised', 'external', 'cleanroom', 'food-safe']).optional(),

  boundary: FloorBoundarySchema,
  systemTypeId: z.string().optional(),
  layers: z.array(FloorLayerSchema).optional(),
  finishSpec: FloorFinishSpecSchema,
  slope: FloorSlopeSchema.optional(),
  serviceHoles: z.array(FloorServiceHoleSchema),
  underfloorHeating: FloorUnderfloorHeatingSchema.optional(),

  coveredRoomIds: z.array(z.string()),
  boundingWallIds: z.array(z.string()),
  hostSlabId: z.string().optional(),
  hostRoomId: z.string().optional(),

  colour: z.string().optional(),
  opacity: z.number().min(0).max(1).optional(),
  visible: z.boolean(),

  properties: FloorPropertiesSchema,
  ifcData: FloorIfcDataSchema.optional(),
  revitId: z.string().optional(),

  phase: z.enum(['existing', 'new', 'demolished', 'temporary']).optional(),
  metadata: FloorMetadataSchema,
});

export type FloorDataSchemaType = z.infer<typeof FloorDataSchema>;

/** Throws ZodError with descriptive issues if data is invalid. */
export function validateFloorData(floor: unknown): void {
  FloorDataSchema.parse(floor);
}

/** Returns validation result without throwing. */
export function safeParseFloor(floor: unknown): ReturnType<typeof FloorDataSchema.safeParse> {
  return FloorDataSchema.safeParse(floor);
}
