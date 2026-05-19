// ─── Phase 1: Zod Data Model Schema ────────────────────────────────────────
// §01-STAIR-DATA-MODEL-CONTRACT §3 — StairDataSchema.ts must exist.
// §09-STAIR-SECURITY-DATABASE-CONTRACT §5 — server-side Zod validation.
// Used in StairStore.add() and server-side snapshot validation.

import { z } from 'zod';

export const Vec3Schema = z.object({
    x: z.number(),
    y: z.number(),
    z: z.number(),
});

export const StairFlightSchema = z.object({
    direction: Vec3Schema,
    riserCount: z.number().int().min(2, 'Each flight must have at least 2 risers'),
    startOverride: Vec3Schema.optional(),
});

export const StairLandingSchema = z.object({
    depth: z.number().positive('Landing depth must be positive'),
});

export const StairMaterialSchema = z.enum([
    'concrete', 'steel', 'timber', 'marble', 'glass', 'composite'
]);

export const StairNosingTypeSchema = z.enum(['none', 'standard', 'extended', 'rounded']);
export const StairStringerTypeSchema = z.enum(['none', 'closed', 'open', 'mono']);

export const StairPropertiesSchema = z.object({
    mark: z.string().optional(),
    material: StairMaterialSchema.optional(),
    treadMaterial: StairMaterialSchema.optional(),
    riserMaterial: StairMaterialSchema.optional(),
    riserVisible: z.boolean(),
    nosingType: StairNosingTypeSchema,
    nosingDepth: z.number().min(0, 'Nosing depth cannot be negative'),
    stringerType: StairStringerTypeSchema,
    stringerThickness: z.number().positive().optional(),
    handrailLeft: z.boolean(),
    handrailRight: z.boolean(),
    handrailHeight: z.number().positive('Handrail height must be positive'),
    description: z.string().optional(),
    tags: z.array(z.string()).optional(),
});

export const StairMetadataSchema = z.object({
    createdAt: z.string().datetime({ message: 'createdAt must be ISO 8601' }),
    modifiedAt: z.string().datetime({ message: 'modifiedAt must be ISO 8601' }),
    version: z.number().int().min(0, 'Version must be a non-negative integer'),
    source: z.enum(['user', 'ai', 'import']),
    createdBy: z.string().optional(),
});

export const StairTypeSnapshotSchema = z.object({
    typeId: z.string(),
    name: z.string(),
    defaults: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])),
    capturedAt: z.string().datetime(),
});

export const StairDataSchema = z.object({
    id: z.string().uuid('Stair id must be a valid UUID'),
    type: z.literal('stair'),
    levelId: z.string().uuid('levelId must be a valid UUID'),
    baseLevelId: z.string().uuid('baseLevelId must be a valid UUID'),
    topLevelId: z.string().uuid('topLevelId must be a valid UUID'),
    baseOffset: z.number(),
    topOffset: z.number(),
    shape: z.enum(['I', 'L', 'U', 'spiral', 'winder']),
    startPosition: Vec3Schema,
    width: z.number().positive('Width must be positive'),
    riserHeight: z.number().positive('Riser height must be positive'),
    treadDepth: z.number().positive('Tread depth must be positive'),
    riserCount: z.number().int().min(2, 'Total riser count must be at least 2'),
    flights: z.array(StairFlightSchema).min(1, 'At least one flight is required'),
    landings: z.array(StairLandingSchema),
    typeId: z.string().optional(),
    typeSnapshot: StairTypeSnapshotSchema.optional(),
    properties: StairPropertiesSchema,
    accessibilityType: z.enum(['standard', 'accessible']).optional(),
    fireRating: z.string().optional(),
    buildingCodeVariant: z.string().optional(),
    parameters: z.record(z.string(), z.union([z.number(), z.string(), z.boolean(), z.null()])),
    metadata: StairMetadataSchema,
    ifcData: z.object({
        guid: z.string(),
        ifcClass: z.enum(['IfcStair', 'IfcStairFlight']),
    }).optional(),
});

export const StairDataAddSchema = StairDataSchema;

export const StairDataUpdateSchema = StairDataSchema.partial().required({ id: true });

export type StairDataInput = z.infer<typeof StairDataSchema>;
export type StairDataUpdateInput = z.infer<typeof StairDataUpdateSchema>;
