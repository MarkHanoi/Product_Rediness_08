/**
 * CeilingDataSchema — Zod runtime validation for the ceiling semantic model.
 * Matches the CeilingData interface in CeilingTypes.ts exactly.
 * No Three.js, no store, no commands.
 */

import { z } from 'zod';

// ── Vertex ─────────────────────────────────────────────────────────────────
const CeilingVertexSchema = z.object({
  x: z.number().finite(),
  z: z.number().finite(),
});

// ── Layer function ─────────────────────────────────────────────────────────
const CeilingLayerFunctionSchema = z.enum([
  'structure',
  'air-gap',
  'insulation',
  'substrate',
  'finish',
  'suspended-grid',
]);

// ── Layer ──────────────────────────────────────────────────────────────────
const CeilingLayerSchema = z.object({
  name: z.string().min(1),
  function: CeilingLayerFunctionSchema,
  thickness: z.number().positive(),
  materialId: z.string().optional(),
  materialColor: z.string().optional(),
  visible: z.boolean().optional(),
  lambda: z.number().optional(),
  rValue: z.number().optional(),
  acousticAbsorption: z.number().min(0).max(1).optional(),
});

// ── Hole ───────────────────────────────────────────────────────────────────
const CeilingHoleSubTypeSchema = z.enum([
  'light-fixture',
  'hvac-diffuser',
  'skylight',
  'access-hatch',
  'structural-beam',
  'generic',
]);

const CeilingHoleShapeSchema = z.enum(['rectangular', 'circular', 'polygon']);

const CeilingHoleElementSchema = z.object({
  id: z.string().min(1),
  subType: CeilingHoleSubTypeSchema,
  shape: CeilingHoleShapeSchema,
  offsetX: z.number().optional(),
  offsetZ: z.number().optional(),
  width: z.number().positive().optional(),
  depth: z.number().positive().optional(),
  centerX: z.number().optional(),
  centerZ: z.number().optional(),
  radius: z.number().positive().optional(),
  polygon: z.array(CeilingVertexSchema).min(3).optional(),
  label: z.string().optional(),
  elementId: z.string().min(1),
  materialId: z.string().optional(),
  frameColor: z.string().optional(),
  depth3d: z.number().positive().optional(),
});

// ── Boundary ───────────────────────────────────────────────────────────────
const CeilingDetectionMethodSchema = z.enum([
  'manual-polygon',
  'from-room',
  'from-slab',
  'ai-generated',
  'ifc-import',
]);

const CeilingBoundarySchema = z.object({
  polygon: z.array(CeilingVertexSchema).min(3),
  height: z.number().positive(),
  thickness: z.number().positive(),
  baseOffset: z.number(),
  detectionMethod: CeilingDetectionMethodSchema,
});

// ── Finish spec ────────────────────────────────────────────────────────────
const CeilingPatternSchema = z.enum([
  'none',
  'grid-600x600',
  'grid-1200x600',
  'grid-1200x300',
  'strip-planks',
  'coffered',
  'linear-baffles',
]);

const CeilingFinishSpecSchema = z.object({
  soffitMaterialId: z.string().optional(),
  soffitColor: z.string().optional(),
  soffitPattern: CeilingPatternSchema.optional(),
  exposedStructure: z.boolean(),
  materialName: z.string().optional(),
});

// ── IFC data ───────────────────────────────────────────────────────────────
const CeilingIfcDataSchema = z.object({
  guid: z.string().min(1),
  ifcClass: z.literal('IfcCovering'),
  predefinedType: z.literal('CEILING'),
  objectType: z.string().optional(),
  description: z.string().optional(),
  longName: z.string().optional(),
  psets: z.record(z.string(), z.record(z.string(), z.union([z.string(), z.number(), z.boolean()]))).optional(),
});

// ── Metadata ───────────────────────────────────────────────────────────────
const CeilingMetadataSchema = z.object({
  createdAt: z.number().int(),
  modifiedAt: z.number().int(),
  createdBy: z.string().min(1),
  version: z.number().int().positive(),
  tags: z.array(z.string()).optional(),
  description: z.string().optional(),
});

// ── Properties bag ─────────────────────────────────────────────────────────
const CeilingPropertiesSchema = z
  .object({
    mark: z.string().optional(),
    comments: z.string().optional(),
    manufacturer: z.string().optional(),
    productCode: z.string().optional(),
    installationDate: z.string().optional(),
    fireRating: z.string().optional(),
    acousticRating: z.string().optional(),
    cleanroomClass: z.string().optional(),
    humidityZone: z.enum(['dry', 'wet', 'intermittent']).optional(),
    thermalTransmittance: z.number().optional(),
  })
  .passthrough();

// ── Primary record schema ─────────────────────────────────────────────────
export const CeilingDataSchema = z.object({
  id: z.string().min(1),
  type: z.literal('ceiling'),
  levelId: z.string().min(1),
  parentId: z.string().optional(),

  label: z.string().min(1),
  ceilingNumber: z.string(),
  department: z.string().optional(),

  boundary: CeilingBoundarySchema,

  systemTypeId: z.string().optional(),
  layers: z.array(CeilingLayerSchema).optional(),
  finishSpec: CeilingFinishSpecSchema,
  holeElements: z.array(CeilingHoleElementSchema),

  coveredRoomIds: z.array(z.string()),
  boundingWallIds: z.array(z.string()),
  hostSlabId: z.string().optional(),
  hostRoomId: z.string().optional(),

  colour: z.string().optional(),
  opacity: z.number().min(0).max(1).optional(),
  visible: z.boolean(),

  properties: CeilingPropertiesSchema,
  ifcData: CeilingIfcDataSchema.optional(),
  revitId: z.string().optional(),

  phase: z.enum(['existing', 'new', 'demolished', 'temporary']).optional(),
  metadata: CeilingMetadataSchema,
});

export type CeilingDataSchemaType = z.infer<typeof CeilingDataSchema>;

/** Throws ZodError with descriptive .issues if data is invalid. */
export function validateCeilingData(ceiling: unknown): void {
  CeilingDataSchema.parse(ceiling);
}

/** Returns validation result without throwing. */
export function safeParseCeiling(ceiling: unknown): ReturnType<typeof CeilingDataSchema.safeParse> {
  return CeilingDataSchema.safeParse(ceiling);
}
