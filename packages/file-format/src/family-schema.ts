// .pryzm-family v1 — public Zod schema (S55 deliverable).
//
// Spec source: PHASE-3B-FAMILY-CREATOR-REWRITE-PLAN.md §5.2 + §5.3 +
// §5.4.  This file is the SINGLE source of truth for the on-disk
// shape; the editor's in-memory store types narrow it but never widen
// it.  Any breaking change requires bumping `formatVersion` AND
// adding a migrator (see `family-migrations/`).

import { z } from 'zod';

/* ------------------------------------------------------------------ */
/* Scalar primitives                                                   */
/* ------------------------------------------------------------------ */

const ULID = z.string().regex(/^[0-9A-HJKMNP-TV-Z]{26}$/, 'ULID must be 26 Crockford-base32 chars');
const FamilyId = z.string().regex(/^fam_[0-9A-HJKMNP-TV-Z]{26}$/, 'family id must be `fam_` + ULID');
const TypeId = z.string().regex(/^typ_[0-9A-HJKMNP-TV-Z]{26}$/, 'type id must be `typ_` + ULID');
const ParameterId = z.string().regex(/^par_[0-9A-HJKMNP-TV-Z]{26}$/, 'parameter id must be `par_` + ULID');
const SolidId = z.string().regex(/^sol_[0-9A-HJKMNP-TV-Z]{26}$/, 'solid id must be `sol_` + ULID');
const ProfileId = z.string().regex(/^prof_[0-9A-HJKMNP-TV-Z]{26}$/, 'profile id must be `prof_` + ULID');
const SlotId = z.string().regex(/^slot_[0-9A-HJKMNP-TV-Z]{26}$/, 'material slot id must be `slot_` + ULID');
const PlaneId = z.string().regex(/^plane_[0-9A-HJKMNP-TV-Z]{26}$/, 'reference plane id must be `plane_` + ULID');
const Sha256 = z.string().regex(/^sha256:[0-9a-f]{64}$/, 'sha256 hash literal');
const Semver = z.string().regex(/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/, 'semver');
const ParameterName = z.string().regex(/^[A-Za-z][A-Za-z0-9_ ]{0,63}$/, 'parameter name');

const Vec3 = z.object({ x: z.number().finite(), y: z.number().finite(), z: z.number().finite() });

/* ------------------------------------------------------------------ */
/* Manifest                                                            */
/* ------------------------------------------------------------------ */

export const FamilyIfcEntitySchema = z.enum([
  'IfcDoor',
  'IfcWindow',
  'IfcFurniture',
  'IfcFurnishingElement',
  'IfcBuildingElementProxy',
  'IfcPlate',
  'IfcMember',
  'IfcDistributionElement',
  'IfcFlowTerminal',
  'IfcLightFixture',
  'IfcSanitaryTerminal',
]);
export type FamilyIfcEntity = z.infer<typeof FamilyIfcEntitySchema>;

export const FamilyCategorySchema = z.enum([
  'Door',
  'Window',
  'Furniture',
  'Casework',
  'Fixture',
  'Lighting',
  'Plumbing',
  'Generic',
]);
export type FamilyCategory = z.infer<typeof FamilyCategorySchema>;

export const FamilyManifestSchema = z.object({
  formatVersion: z.literal('1.0'),
  id: FamilyId,
  name: z.string().min(1).max(120),
  semver: Semver,
  author: z.object({
    id: z.string().min(1),
    displayName: z.string().min(1),
  }),
  description: z.string().max(2_000).default(''),
  ifcEntity: FamilyIfcEntitySchema,
  category: FamilyCategorySchema,
  tags: z.array(z.string()).max(32).default([]),
  minPRYZMVersion: z.string().default('2.0.0'),
  schemaHash: Sha256,
  createdAt: z.string().datetime(),
  lastModifiedAt: z.string().datetime(),
});
export type FamilyManifest = z.infer<typeof FamilyManifestSchema>;

/* ------------------------------------------------------------------ */
/* IFC mapping                                                         */
/* ------------------------------------------------------------------ */

export const IfcParameterMappingSchema = z.object({
  parameterId: ParameterId,
  psetName: z.string().min(1),
  propertyName: z.string().min(1),
});
export type IfcParameterMapping = z.infer<typeof IfcParameterMappingSchema>;

export const IfcMappingFileSchema = z.object({
  formatVersion: z.literal('1.0'),
  predefinedType: z.string().nullable().default(null),
  parameters: z.array(IfcParameterMappingSchema).default([]),
});
export type IfcMappingFile = z.infer<typeof IfcMappingFileSchema>;

/* ------------------------------------------------------------------ */
/* Reference planes / parameters / profiles / solids / types / slots   */
/* ------------------------------------------------------------------ */

export const ReferencePlaneSchema = z.object({
  id: PlaneId,
  name: z.string().min(1),
  origin: Vec3,
  normal: Vec3,
  isHost: z.boolean().default(false),
});
export type ReferencePlane = z.infer<typeof ReferencePlaneSchema>;

export const FamilyParameterDataTypeSchema = z.enum([
  'length',
  'angle',
  'number',
  'count',
  'boolean',
  'string',
]);
export const FamilyParameterKindSchema = z.enum(['type', 'instance']);

export const FamilyParameterSchema = z.object({
  id: ParameterId,
  name: ParameterName,
  kind: FamilyParameterKindSchema,
  dataType: FamilyParameterDataTypeSchema,
  defaultValue: z.union([z.number().finite(), z.string(), z.null()]).default(null),
  expression: z.string().nullable().default(null),
  ifcMapping: z.union([
    z.object({ psetName: z.string().min(1), propertyName: z.string().min(1) }),
    z.null(),
  ]).default(null),
  exposed: z.boolean().default(true),
});
export type FamilyParameter = z.infer<typeof FamilyParameterSchema>;

export const ProfileEntitySchema = z.object({
  id: ULID,
  kind: z.enum(['point', 'line', 'arc', 'circle', 'spline']),
  data: z.record(z.string(), z.union([z.number(), z.string(), z.boolean(), z.null()])),
});

export const ProfileConstraintSchema = z.object({
  id: ULID,
  kind: z.enum([
    'coincident',
    'parallel',
    'perpendicular',
    'horizontal',
    'vertical',
    'tangent',
    'distance',
    'radius',
    'angle',
    'diameter',
    'equalLength',
    'distancePointLine',
  ]),
  entityIds: z.array(ULID),
  parameterRef: ParameterId.nullable().default(null),
  value: z.number().nullable().default(null),
});

export const ProfileSchema = z.object({
  id: ProfileId,
  name: z.string().min(1),
  planeId: PlaneId,
  entities: z.array(ProfileEntitySchema).default([]),
  constraints: z.array(ProfileConstraintSchema).default([]),
});
export type Profile = z.infer<typeof ProfileSchema>;

export const SolidFeatureSchema = z.discriminatedUnion('kind', [
  z.object({
    id: SolidId,
    kind: z.literal('extrude'),
    profileId: ProfileId,
    materialSlotId: SlotId.nullable().default(null),
    lod: z.object({
      coarse: z.boolean().default(false),
      medium: z.boolean().default(true),
      fine: z.boolean().default(true),
    }),
    /** Length expression source (e.g. `Height`, `Width / 2`).  May be a literal number expressed as a string. */
    lengthExpression: z.string().min(1),
    /** Direction unit vector (defaults to +Y). */
    direction: Vec3.default({ x: 0, y: 1, z: 0 }),
  }),
  z.object({
    id: SolidId,
    kind: z.literal('sweep'),
    profileId: ProfileId,
    pathProfileId: ProfileId,
    materialSlotId: SlotId.nullable().default(null),
    lod: z.object({
      coarse: z.boolean().default(false),
      medium: z.boolean().default(true),
      fine: z.boolean().default(true),
    }),
  }),
  z.object({
    id: SolidId,
    kind: z.literal('loft'),
    profileIds: z.array(ProfileId).min(2),
    materialSlotId: SlotId.nullable().default(null),
    lod: z.object({
      coarse: z.boolean().default(false),
      medium: z.boolean().default(true),
      fine: z.boolean().default(true),
    }),
  }),
  z.object({
    id: SolidId,
    kind: z.literal('revolve'),
    profileId: ProfileId,
    materialSlotId: SlotId.nullable().default(null),
    lod: z.object({
      coarse: z.boolean().default(false),
      medium: z.boolean().default(true),
      fine: z.boolean().default(true),
    }),
    sweepDeg: z.number().finite().default(360),
    segments: z.number().int().min(3).default(24),
  }),
]);
export type SolidFeature = z.infer<typeof SolidFeatureSchema>;

export const MaterialSlotSchema = z.object({
  id: SlotId,
  name: z.string().min(1),
  defaultCategory: z.string().nullable().default(null),
});
export type MaterialSlot = z.infer<typeof MaterialSlotSchema>;

export const FamilyTypeSchema = z.object({
  id: TypeId,
  name: z.string().min(1),
  values: z.record(ParameterId, z.union([z.number(), z.string(), z.boolean()])).default({}),
  /** Per-type checksum (canonical-JSON sha256 of the values map).  Allows
   *  the writer to detect dirty types without re-serialising the whole doc. */
  checksum: Sha256,
});
export type FamilyType = z.infer<typeof FamilyTypeSchema>;

export const FamilyDocumentSchema = z.object({
  formatVersion: z.literal('1.0'),
  referencePlanes: z.array(ReferencePlaneSchema).default([]),
  parameters: z.array(FamilyParameterSchema).default([]),
  profiles: z.array(ProfileSchema).default([]),
  solids: z.array(SolidFeatureSchema).default([]),
  materialSlots: z.array(MaterialSlotSchema).default([]),
  types: z.array(FamilyTypeSchema).min(1),
  defaults: z.record(z.string(), z.union([z.number(), z.string(), z.boolean(), z.null()])).default({}),
});
export type FamilyDocument = z.infer<typeof FamilyDocumentSchema>;

/* ------------------------------------------------------------------ */
/* Event-log entry (one line of `event-log.ndjson`)                    */
/* ------------------------------------------------------------------ */

export const FamilyEventSchema = z.object({
  id: ULID,
  ts: z.string().datetime(),
  kind: z.string().min(1),
  payload: z.unknown(),
});
export type FamilyEvent = z.infer<typeof FamilyEventSchema>;
