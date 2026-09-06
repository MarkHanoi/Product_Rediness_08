// .pryzm-family — public Zod schema (S55 deliverable; format v1.1).
//
// Spec source: PHASE-3B-FAMILY-CREATOR-REWRITE-PLAN.md §5.2 + §5.3 +
// §5.4.  This file is the SINGLE source of truth for the on-disk
// shape; the editor's in-memory store types narrow it but never widen
// it.  Any breaking change requires bumping `formatVersion` AND
// adding a migrator (see `family-migrations/`).
//
// ⭐ GOVERNED BY C111 (ComponentDefinition & the .pryzm-family model).
//    ADR-0376 D5: `FamilyDefinition` ≡ `ComponentDefinition`.  The
//    `Family*` symbol spellings and the `fam_`/`typ_`/`par_`/`sol_`/
//    `prof_`/`slot_`/`plane_` id prefixes are FROZEN LEGACY SPELLINGS
//    (C111 §0.2 item 2) — wire identifiers under C69 §1.1, never
//    renamed.  ⛔ No NEW symbol may spell the concept `Family`
//    (C111 §0.2 item 3); the new symbols below spell it `Component`.
//
// ⭐ v1.1 (C111 §8.4-e, the first real migration) carries:
//    • §8.4-b  `formatVersion` becomes COMPARABLE — §FORMAT-VERSION-TABLE
//    • §5.3-b  `document.defaults` DELETED (D-5, the second default channel)
//    • §10.1-a a `boolean` solid-feature kind (D-7)
//    • §10.3-b `representations[]` (spec §21–§22)
//    • C112    `connectors[]` — POSE DELIBERATELY NOT STORED
//    • §9.1    `propertySets[]` — properties, NOT parameters
//    • §10.2   `featureEdges[]` — document order is NOT a dependency graph
//    • §5.1    `semanticClassId` — the C113 seam
//    See `family-migrations/v1_0-to-v1_1.ts` for the registered migrator.

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

/* --- v1.1 identity spaces (C111 §1.1-a: a new object kind mints its --- */
/* --- prefix in the same commit that adds the kind).  ⛔ §1.1-b: once  --- */
/* --- written a prefix is a WIRE IDENTIFIER and is permanent.         --- */
const RepresentationId = z.string().regex(/^rep_[0-9A-HJKMNP-TV-Z]{26}$/, 'representation id must be `rep_` + ULID');
const ConnectorId = z.string().regex(/^conn_[0-9A-HJKMNP-TV-Z]{26}$/, 'connector id must be `conn_` + ULID');
const PropertySetId = z.string().regex(/^pset_[0-9A-HJKMNP-TV-Z]{26}$/, 'property-set id must be `pset_` + ULID');

/* ------------------------------------------------------------------ */
/* §FORMAT-VERSION-TABLE — C111 §8.1 / §8.4-b                          */
/*                                                                     */
/* ⛔ THIS REPLACES `z.literal('1.0')` ON BOTH VERSION FIELDS, AND THE  */
/*    LITERAL WAS THE DEFECT.  C111 §8.1 measured it: a literal makes   */
/*    `'2.0'` *not a manifest* rather than *a later version*, so there  */
/*    is no ordering to compare, C47 §1.2's MAJOR/MINOR rule cannot be  */
/*    evaluated, and `unpackFamily`'s `unsupported-future-version`      */
/*    branch is UNREACHABLE FOR EVERY INPUT because `safeParse` has     */
/*    already rejected the file as malformed.  A user handed a v2 file  */
/*    was told their file was broken, not that their PRYZM was old.     */
/*                                                                     */
/*    §8.4-b: the comparable form is a MAJOR.MINOR pair parsed from the */
/*    string and validated by a REGEX.  MAJOR mismatch refuses; MINOR   */
/*    ahead refuses WITH UPGRADE ADVICE.  This widens the READER — it   */
/*    does not by itself change any byte a writer emits.                */
/* ------------------------------------------------------------------ */

/** `MAJOR.MINOR`.  Deliberately admits values this build cannot read, so
 *  that an unreadable-but-well-formed file is REFUSED BY NAME rather than
 *  reported as malformed (C111 §8.4-c). */
export const FORMAT_VERSION_PATTERN = /^(0|[1-9]\d{0,3})\.(0|[1-9]\d{0,4})$/;

const FormatVersion = z
  .string()
  .regex(FORMAT_VERSION_PATTERN, 'formatVersion must be `MAJOR.MINOR`');

/** The version this build WRITES. */
export const CURRENT_FORMAT_VERSION = '1.1';

/** Every version this build can READ without migrating. */
export const SUPPORTED_FORMAT_VERSIONS = ['1.0', '1.1'] as const;

export interface ParsedFormatVersion {
  readonly major: number;
  readonly minor: number;
}

/** Parse `MAJOR.MINOR`.  Returns `null` — never throws, and never
 *  guesses — when the string is not a version at all. */
export function parseFormatVersion(value: string): ParsedFormatVersion | null {
  const m = FORMAT_VERSION_PATTERN.exec(value);
  if (!m) return null;
  return { major: Number(m[1]), minor: Number(m[2]) };
}

/** Total order over well-formed versions.  `null` when either side is
 *  unparseable — ⛔ a comparison against a non-version is NOT `0`, and a
 *  caller that treats it as `0` has re-created the defect §8.1 names. */
export function compareFormatVersion(a: string, b: string): -1 | 0 | 1 | null {
  const pa = parseFormatVersion(a);
  const pb = parseFormatVersion(b);
  if (!pa || !pb) return null;
  if (pa.major !== pb.major) return pa.major < pb.major ? -1 : 1;
  if (pa.minor !== pb.minor) return pa.minor < pb.minor ? -1 : 1;
  return 0;
}

/** The closed set of readings a version string can produce.  ⛔ Each is a
 *  DISTINCT value: `unparseable` (not a version) and `future-major` (a
 *  version this build cannot read) are different facts and a reader that
 *  collapses them tells the user the wrong thing — which is exactly what
 *  C111 §8.1 Consequence 2 measured. */
export type FormatVersionSupport =
  | 'supported'
  | 'future-minor'
  | 'future-major'
  | 'past-major'
  | 'unparseable';

export function classifyFormatVersion(value: string): FormatVersionSupport {
  const parsed = parseFormatVersion(value);
  if (!parsed) return 'unparseable';
  if ((SUPPORTED_FORMAT_VERSIONS as readonly string[]).includes(value)) return 'supported';
  const current = parseFormatVersion(CURRENT_FORMAT_VERSION)!;
  if (parsed.major > current.major) return 'future-major';
  if (parsed.major < current.major) return 'past-major';
  return parsed.minor > current.minor ? 'future-minor' : 'past-major';
}

/** True iff this build can read `value` without migrating it. */
export function isSupportedFormatVersion(value: string): boolean {
  return classifyFormatVersion(value) === 'supported';
}

/** The refusal message for a version this build cannot read.  ⛔ C16 CA-18 /
 *  C112 §7: a refusal names BOTH numbers and the route back. */
export function formatVersionRefusal(value: string): string {
  switch (classifyFormatVersion(value)) {
    case 'supported':
      return '';
    case 'unparseable':
      return `formatVersion ${JSON.stringify(value)} is not a \`MAJOR.MINOR\` version; the file is malformed, not merely newer.`;
    case 'future-major':
      return `this file is format ${value}; this PRYZM writes ${CURRENT_FORMAT_VERSION} and can read ${SUPPORTED_FORMAT_VERSIONS.join(', ')}. A major-version change is not backward compatible — upgrade PRYZM to open it.`;
    case 'future-minor':
      return `this file is format ${value}; this PRYZM writes ${CURRENT_FORMAT_VERSION} and can read ${SUPPORTED_FORMAT_VERSIONS.join(', ')}. Upgrade PRYZM to open it.`;
    case 'past-major':
      return `this file is format ${value}; this PRYZM reads ${SUPPORTED_FORMAT_VERSIONS.join(', ')}. Run it through the migration chain (\`migrateFamily\`) to lift it to ${CURRENT_FORMAT_VERSION}.`;
  }
}

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

/* ------------------------------------------------------------------ */
/* §CATEGORY-TABLE — widened 8 -> 20 (spec §61 creation categories)     */
/*                                                                     */
/* ⛔ THE FIRST EIGHT ARE FROZEN WIRE VALUES (C69 §1.1 / C111 §0.2      */
/*    item 2).  They are already written into shipped manifests; a      */
/*    member is ADDED here, never renamed and never removed.            */
/*                                                                     */
/* ⚠ COUNT DISCREPANCY, MEASURED AND DECLARED RATHER THAN TRANSCRIBED.  */
/*   The Phase-4 audit row says *"widen FamilyCategorySchema from 8     */
/*   toward §61's 17 creation categories"*.  Counted in the spec's own  */
/*   §57–62 prose, the creation modal enumerates SIXTEEN, not           */
/*   seventeen: Wall · Window · Door · Floor · Roof · Ceiling ·         */
/*   Curtain Wall · Column · Beam · Stair · Railing · Furniture ·       */
/*   Equipment · MEP Component · Generic Component · Custom System.     */
/*   Three of those already exist here (Window, Door, Furniture) and    */
/*   "Generic Component" IS the existing `Generic` — spelling it a      */
/*   second way would mint the C84 EI-9 duplicate this suite keeps      */
/*   paying for.  So: 8 existing + 12 added = 20 members.               */
/*   ⛔ Do not "correct" this to 17 without re-counting the spec.        */
/*                                                                     */
/* ⚠ C111 §5.1: `category` becomes a DEFAULT SemanticClass reference    */
/*   when C113 lands.  It is NOT a rival classification vocabulary and  */
/*   MUST NOT be extended into one — see `semanticClassId` below.       */
/* ------------------------------------------------------------------ */
export const FamilyCategorySchema = z.enum([
  /* --- v1.0, FROZEN --- */
  'Door',
  'Window',
  'Furniture',
  'Casework',
  'Fixture',
  'Lighting',
  'Plumbing',
  'Generic',
  /* --- v1.1, added from spec §61 --- */
  'Wall',
  'Floor',
  'Roof',
  'Ceiling',
  'CurtainWall',
  'Column',
  'Beam',
  'Stair',
  'Railing',
  'Equipment',
  'MEPComponent',
  'CustomSystem',
]);
export type FamilyCategory = z.infer<typeof FamilyCategorySchema>;

/** The eight members that existed at format v1.0.  Exported so a
 *  migrator or a gate can assert that none was dropped, rather than
 *  trusting a comment. */
export const FAMILY_CATEGORIES_V1_0 = [
  'Door',
  'Window',
  'Furniture',
  'Casework',
  'Fixture',
  'Lighting',
  'Plumbing',
  'Generic',
] as const;

export const FamilyManifestSchema = z.object({
  formatVersion: FormatVersion,
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
  /** ⭐ THE C113 SEAM (C111 §5.1) — a reference to a semantic class in the
   *  classification vocabulary, which this contract deliberately does NOT
   *  own.  C111 §12 R-7 defers the classification MODEL to C113 (Phase 6,
   *  minted when the validator exists); this field is the reference that
   *  model will resolve, added now so a definition can carry one.
   *
   *  ⛔ DELIBERATELY NOT a prefixed ULID, and that is the restrained
   *  choice, not an oversight.  C111 §1.1-a requires a prefix for objects
   *  THIS format identifies; a semantic class is defined ELSEWHERE, and
   *  minting `scls_` + ULID here would fix a wire shape for a vocabulary
   *  C113 owns and may well express as `Uniclass:EF_25_10`.  Specifying
   *  more than the first writer needs is the C103 failure mode (C112
   *  §0.3) — so this is an opaque bounded reference until C113 narrows it.
   *
   *  ⛔ `.optional()` and NOT `.default(null)`, for C111 §5.4-a's exact
   *  reason: a defaulted key appears on every manifest of every existing
   *  document and changes its packed bytes, its `schemaHash` AND its
   *  signature.  ABSENT means "not classified"; it is not `null`. */
  semanticClassId: z.string().min(1).max(120).optional(),
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
  /** ⚠ DELIBERATELY STILL A LITERAL, AND DELIBERATELY STILL '1.0'.
   *  This is the THIRD version field in the container and it versions a
   *  DIFFERENT thing: the `ifc-mapping.json` sub-document, not the
   *  component model.  C111 §8 governs the manifest and document fields
   *  (both widened above); this envelope did not change in v1.1, so
   *  bumping or widening it would assert a change that did not happen.
   *  ⛔ Its writer (`family-unpack.ts`'s projection) mints the literal
   *  '1.0' directly and is NOT in this lane's ownership — widening the
   *  reader without its writer would be the writer-first defect C71 §2.5
   *  names.  When this envelope does change, it takes the same
   *  §FORMAT-VERSION-TABLE treatment, in one change-set with its writer. */
  formatVersion: z.literal('1.0'),
  predefinedType: z.string().nullable().default(null),
  parameters: z.array(IfcParameterMappingSchema).default([]),
});
export type IfcMappingFile = z.infer<typeof IfcMappingFileSchema>;

/* ------------------------------------------------------------------ */
/* Reference planes / parameters / profiles / solids / types / slots   */
/* ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ */
/* §PARAMETRIC-DATUM (C110 §2.8 · C111 §5.1 D-9 · STR-UCE-MASTER-SPEC   */
/* §82.1) — the field that makes a reference plane a REVIT reference    */
/* plane rather than a persisted orientation.                           */
/*                                                                     */
/* ⭐ THE ACT IT EXPRESSES, IN THE AUTHOR'S WORDS: *"this datum sits    */
/*    `Height` above the origin"* — a DIMENSION, labelled with a        */
/*    PARAMETER, that positions the plane. Change the parameter and the */
/*    plane moves; the shapes built on that plane move with it. Without */
/*    it a plane can only say which way a shape GROWS (its `normal`,    */
/*    honoured since §82.4-DIRECTED-EXTRUDE) and never WHERE it sits.   */
/*                                                                     */
/* ⛔ IT DOES NOT DUPLICATE `origin`, AND THE TWO ARE NOT TWO ANSWERS   */
/*    TO ONE QUESTION (C110 §2.8 §TWO-DEFAULT-STORES, C84 EI-9).        */
/*    `origin` is the v1 LITERAL datum and is still NOT APPLIED by the  */
/*    bake — there is no per-solid transform on `SolidFeatureSchema`    */
/*    (see `box-solid.ts`'s declared absences), so a literal offset      */
/*    moves nothing and `set-extrude-work-plane` refuses one outright.  */
/*    `offsetExpression` is the channel that IS honoured. Exactly one    */
/*    of the two may be non-trivial: `set-plane-offset` REFUSES an      */
/*    expression on a plane whose `origin` is not the model origin, and */
/*    `bakeFamilyInstance` refuses the same pair a second time, because */
/*    a document that states a position twice states it wrongly once.   */
/*                                                                     */
/* ⚠ THE OFFSET IS SIGNED, ALONG `normal`, AND IT IS A RUNTIME LENGTH  */
/*   — the same unit `SolidFeature.lengthExpression` is in, crossing    */
/*   `§4D-ONE-LENGTH-SEAM` (`runtimeLengthToMetres`) exactly once at    */
/*   the bake. ⛔ Not metres here: minting a second length convention   */
/*   inside one document is the 1000× defect class ADR-0376 D3 names.   */
/*                                                                     */
/* ⚠ `.optional()` AND NOT `.default(null)`, for C111 §5.4-a's exact    */
/*   reason: a defaulted key appears on every plane of every existing   */
/*   document and changes its packed bytes, its `schemaHash` AND its    */
/*   signature. ABSENT means "this datum is not dimensioned"; it is not */
/*   `null`, and an absent field re-packs byte-identically.             */
/*                                                                     */
/* ⚠ DECLARED, NOT SILENT (C84 EI-6) — what this field does NOT close: */
/*   • The offset is measured from the MODEL ORIGIN, never from another */
/*     plane. Plane-to-plane dimensioning needs a datum graph and its   */
/*     own cycle detection; C110 §4.3's Kahn sort is over PARAMETERS,   */
/*     not planes, and reusing it would be a second graph wearing the   */
/*     first one's name. Not built, and not pretended.                  */
/*   • The plane's SPIN about its normal is STILL unpersisted           */
/*     (§4D-SCHEMA-DELTA). This field moves a plane along its normal;   */
/*     it does not rotate anything.                                     */
/*   • Only an `extrude` solid follows a moved plane, because only      */
/*     `extrude` bakes at all (`BAKEABLE_SOLID_KINDS`).                 */
/*                                                                     */
/* ⚠ VERSIONING, MEASURED RATHER THAN ASSUMED. This is an ADDITIVE     */
/*   optional key inside v1.1, not a `formatVersion` bump, and that is  */
/*   safe for one measured reason and no other:                         */
/*   `find . -name "*.pryzm-family"` (excluding node_modules) piped to  */
/*   `wc -l` → **0** (re-run 2026-09-06, as C110 §3.3-a instructs; the  */
/*   literal command is in that clause — it is not repeated here        */
/*   because its own glob would close this comment). There              */
/*   is no corpus, so there is no reader in the world that would strip  */
/*   this key and bake an un-offset shape. ⛔ If that command ever      */
/*   returns a file, this field belongs in C111 §12 D-12's version bump */
/*   with the rest of the byte-changing set — re-run it, do not         */
/*   transcribe this line.                                              */
/* ------------------------------------------------------------------ */

export const ReferencePlaneSchema = z.object({
  id: PlaneId,
  name: z.string().min(1),
  origin: Vec3,
  normal: Vec3,
  isHost: z.boolean().default(false),
  /** ⭐ §PARAMETRIC-DATUM — signed offset along `normal`, in RUNTIME length
   *  units, as an expression over the definition's parameters. Read the block
   *  above before adding a second positional channel. */
  offsetExpression: z.string().min(1).optional(),
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
  /** ADR-0376 D4 provenance: the `defaultValue` an `introduce-expression`
   *  migration pre-empted. `.optional()` and NOT `.default(null)` on purpose —
   *  a defaulted key would appear on every parameter of every existing
   *  document and change its packed bytes and its signature. */
  supersededDefault: z.union([z.number().finite(), z.string()]).optional(),
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
  /* ---------------------------------------------------------------- */
  /* §BOOLEAN-FEATURE (C111 §10.1-a, delta D-7) — v1.1                  */
  /*                                                                   */
  /* C111 §10.1 measured the gap exactly: *"There is no boolean feature */
  /* in the schema at all — so a window definition CANNOT express       */
  /* 'frame minus glazing void' as a feature, even though              */
  /* `produceBoolean` exists and works."*  The Window vertical slice is */
  /* precisely that shape, so the kind lands here.                      */
  /*                                                                   */
  /* ⭐ `op` REUSES `BooleanOp` from `@pryzm/geometry-kernel`           */
  /*    (`producers/boolean.ts`), whose signature that file marks       */
  /*    FROZEN: `'union' | 'subtract' | 'intersect'`.  ⛔ The spellings  */
  /*    are copied EXACTLY.  Writing `difference`/`intersection` here   */
  /*    would mint a second vocabulary for one concept (C84 EI-9) and   */
  /*    force a translation table at the one seam that must not have    */
  /*    one.  The value is not re-exported from the kernel because      */
  /*    `packages/schemas`-tier code may not depend on L2 — the         */
  /*    coupling is asserted by test instead (see the boolean-op arm    */
  /*    in `__tests__/family-schema-v1_1.test.ts`).                     */
  /*                                                                   */
  /* ⭐ BINARY, matching the frozen producer 1:1.                       */
  /*    `produceBoolean(op, a, b, opts)` takes exactly TWO operands.    */
  /*    Modelling N tools here would specify a folding order this       */
  /*    format has no producer for — and an unevaluable authored shape  */
  /*    is precisely what C111 §9.3 / C74 §4.1 refuse.  N-ary folding   */
  /*    is DECLARED ABSENT: chain two boolean features instead.         */
  /* ---------------------------------------------------------------- */
  z.object({
    id: SolidId,
    kind: z.literal('boolean'),
    /** ⛔ FROZEN spelling — see `BooleanOp` in geometry-kernel. */
    op: z.enum(['union', 'subtract', 'intersect']),
    /** The solid operated ON (the frame). */
    subjectSolidId: SolidId,
    /** The solid operated WITH (the glazing void). */
    toolSolidId: SolidId,
    materialSlotId: SlotId.nullable().default(null),
    lod: z.object({
      coarse: z.boolean().default(false),
      medium: z.boolean().default(true),
      fine: z.boolean().default(true),
    }),
  }),
]);
export type SolidFeature = z.infer<typeof SolidFeatureSchema>;

/** ⚠ DECLARED ABSENCE (C84 EI-6, C111 §10.1).  `bakeFamilyInstance`
 *  implements `extrude` ONLY; `sweep`, `loft`, `revolve` and now
 *  `boolean` return a structured `unsupported-feature` per solid and the
 *  bake completes the rest.  ⭐ C111 §10.1: *"That refusal is spec §75
 *  already satisfied. Do not 'fix' it by substituting an extrude."*
 *  Adding the KIND makes the intent expressible and persistable; it does
 *  NOT make it bakeable, and this comment exists so the next reader does
 *  not mistake the one for the other. Wiring the bake is lane 4D's. */
export const BAKEABLE_SOLID_KINDS = ['extrude'] as const;

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

/* ------------------------------------------------------------------ */
/* REPRESENTATIONS (C111 §10.3-b · spec §21–§22) — v1.1                */
/* ------------------------------------------------------------------ */

/** ⛔ `derived` is the DEFAULT and `authored` is the OVERRIDE — C111
 *  §10.3-b states the direction explicitly: *"derived is the default and
 *  an authored plan symbol is the override, NEVER THE ONLY PATH."*  A
 *  representation that exists only as authored artwork is a drawing, not
 *  a model, and the World Model cannot answer spec §69 from it. */
export const RepresentationSourceSchema = z.enum(['derived', 'authored']);

export const RepresentationKindSchema = z.enum([
  'mesh',
  'plan',
  'elevation',
  'section',
  'symbolic',
  'analysis',
]);

export const RepresentationSchema = z.object({
  id: RepresentationId,
  kind: RepresentationKindSchema,
  source: RepresentationSourceSchema.default('derived'),
  /** Which LODs this representation serves.
   *  ⚠ C111 §10.3-a / delta D-8: the LOD triple on `SolidFeature` is
   *  DECLARED INERT — measured, the only code reading it is the rival
   *  `apps/component-editor`; `bakeFamilyInstance`, `family-loader` and
   *  the bake worker read it NOWHERE and the bake emits every solid
   *  regardless.  ⛔ This field inherits that status: it is persisted and
   *  currently honoured by no producer.  Declaring the absence is C84
   *  EI-13; claiming it works would be spec §75. */
  lod: z
    .object({
      coarse: z.boolean().default(false),
      medium: z.boolean().default(true),
      fine: z.boolean().default(true),
    })
    .default({ coarse: false, medium: true, fine: true }),
  /** Set ONLY when `source === 'authored'` — the profile carrying the
   *  drawn symbol.  ⛔ Absent on a derived representation; a derived
   *  representation that names a profile is contradicting itself. */
  authoredProfileId: ProfileId.optional(),
});
export type Representation = z.infer<typeof RepresentationSchema>;

/* ------------------------------------------------------------------ */
/* CONNECTORS (C112) — v1.1                                            */
/*                                                                     */
/* ⭐ READ C112 §2.3 BEFORE ADDING A FIELD HERE.  THE POSE IS NOT       */
/*    STORED, AND ITS ABSENCE IS THE CONTRACT'S CENTRAL RULING —       */
/*    a §76 gate B ruling (no duplicate source of truth), not an        */
/*    omission and not a simplification:                                */
/*                                                                     */
/*      "A hosted element's frame IS its host's frame. Every transform  */
/*       the host carries, the hosted element carries — the arc         */
/*       tangent, the base datum, and the RAKE."   (C15 §2.1)           */
/*                                                                     */
/*    Position comes from the host wall Opening.offset + sillHeight;    */
/*    orientation comes from the host's frame, rake included.  ⛔ A      */
/*    connector record carrying its own world position or normal is     */
/*    REFUSED: the moment the host moves, rakes or curves the stored    */
/*    copy is stale AND NOTHING SAYS SO.                                */
/*                                                                     */
/* ⛔ ALSO DELIBERATELY ABSENT, each DEFERRED WITH ITS TRIGGER WRITTEN   */
/*    IN ADVANCE (C112 §2.4) so it cannot be rationalised in later:     */
/*      - free connectors (stored pose): unparked by the first element  */
/*        family with a ROUTED RUN whose ends must be proven to join;   */
/*      - direction (supply/return/in/out): same trigger; direction is  */
/*        meaningless without a routed system and a window insertion    */
/*        has no flow;                                                  */
/*      - compatibility beyond host-class matching: same trigger, and   */
/*        concrete — Plumbing.ts already carries `diameter` and         */
/*        `systemTag`, exactly what such a rule would match on.         */
/*    ⚠ `plumbing` is a real family (C99) with NO routing today, so the */
/*      trigger is genuinely ahead of us — stating the distance is the  */
/*      point, not a hedge.                                             */
/* ------------------------------------------------------------------ */

/** C112 §2.2 — the vocabulary opens with the members that have a WRITER;
 *  the rest are PARKED on the C71 §2.2 precedent.  ⛔ Parked is not a gap
 *  (C71 §2.3) and a parked member may NOT be deleted (C71 §2.4). */
export const ConnectorKindSchema = z.enum([
  /** REQUIRED at the first writer — a window's insertion into a wall
   *  opening.  The Window vertical slice IS this member. */
  'insertion',
  /** REQUIRED at the first writer — the host side of the same join. */
  'opening',
  /* --- PARKED: zero writers, zero readers.  Shipping one before its
     writer is C71 §2.5's "defect, not progress". --- */
  'mep',
  'structural',
  'facade',
  'attachment',
]);
export type ConnectorKind = z.infer<typeof ConnectorKindSchema>;

/** The two connector kinds that have a writer in the Window slice.
 *  Exported so a gate can assert the parked members stayed parked
 *  instead of a comment asserting it. */
export const CONNECTOR_KINDS_WITH_WRITER = ['insertion', 'opening'] as const;

/** The opening a connector requires its host to provide (C112 §2.5).
 *  ⛔ ALL LENGTHS ARE METRES (ADR-0376 D3, C112 §2.1).  A connector field
 *  carrying millimetres is a D3 defect, not a local convention.
 *  ⛔ This DECLARES A DEMAND.  The host's `Opening` record remains the
 *  single authority for the void actually cut; where the two disagree
 *  THE CUT VOID IS THE FACT and the disagreement is a refusal naming
 *  both numbers (C112 §7), never a silent reconciliation. */
export const DemandedVoidSchema = z.object({
  width: z.number().finite().positive(),
  height: z.number().finite().positive(),
  sillHeight: z.number().finite().optional(),
});

export const ConnectorSchema = z.object({
  /** C112 §3.1 — stable, minted once on the definition.  ⛔ NOT derived
   *  from an array index and NOT from the name. */
  id: ConnectorId,
  name: z.string().min(1).max(120),
  kind: ConnectorKindSchema,
  /** Semantic class references naming what this connector may meet.
   *
   *  ⛔ `.optional()`, AND THE OPTIONALITY IS LOAD-BEARING (C112 §2.2):
   *  "An EMPTY list means 'joins nothing'; a MISSING list means 'not yet
   *  declared'. They are different values and NO READER MAY CONFLATE
   *  THEM."  A `.default([])` here would erase that distinction at parse
   *  time and hand every reader "joins nothing" for every undeclared
   *  connector — failure and empty collapsing into one value, which is
   *  the defect class this repository has paid for repeatedly.
   *  C112 §7: a MISSING list refuses as UNKNOWN, not as "joins nothing". */
  allowedHostClasses: z.array(z.string().min(1)).optional(),
  /** Optional: not every connector demands a void. */
  demandedVoid: DemandedVoidSchema.optional(),
});
export type Connector = z.infer<typeof ConnectorSchema>;

/* ------------------------------------------------------------------ */
/* PROPERTY SETS (C111 §9.1 · spec §8) — v1.1                          */
/* ------------------------------------------------------------------ */

/** ⛔ A PROPERTY IS NOT A PARAMETER, AND THE TWO ARE NOT COLLAPSED
 *  (C111 §9.1-a).  Spec §8: a PARAMETER controls generation
 *  (`FrameWidth = 75 mm`); a PROPERTY describes (`FrameMaterial =
 *  Aluminium`).  ⛔ A property MUST NOT be smuggled in as a `string`
 *  parameter, and a parameter MUST NOT be re-labelled a property to
 *  dodge the expression engine.  That is why this is a SEPARATE
 *  collection and not a flag on `FamilyParameter`.
 *
 *  ⭐ `dataType` REUSES `FamilyParameterDataTypeSchema` rather than
 *  minting a second quantity vocabulary.  C111 §9.1-b is explicit that
 *  the quantity-kind answer is C110's and C113's subject and "a declared
 *  gap here so NO LANE INVENTS A THIRD ANSWER" — and C110 §3.4 binds the
 *  runtime's `CanonicalKind` to this very enum.  One declaration, three
 *  consumers.
 *
 *  ⚠ NO `.passthrough()` — spec §33 forbids uncontrolled text, and an
 *  open bag here is how a classification vocabulary gets minted by
 *  accident.  Zod strips unknown keys by default; keep it that way. */
export const ComponentPropertySchema = z.object({
  name: ParameterName,
  dataType: FamilyParameterDataTypeSchema,
  value: z.union([z.number().finite(), z.string(), z.boolean(), z.null()]),
});
export type ComponentProperty = z.infer<typeof ComponentPropertySchema>;

export const PropertySetSchema = z.object({
  id: PropertySetId,
  /** e.g. `Pset_WindowCommon`.  The IFC projection is `ifcMapping`'s job
   *  on the parameter side; this name is the SET's identity, not a
   *  binding.  C111 §12 R-7: no IFC / IDS / bSDD model is minted here. */
  name: z.string().min(1).max(120),
  properties: z.array(ComponentPropertySchema).default([]),
});
export type PropertySet = z.infer<typeof PropertySetSchema>;

/* ------------------------------------------------------------------ */
/* FEATURE EDGES (C111 §10.2 · spec §16) — v1.1                        */
/* ------------------------------------------------------------------ */

/** ⛔ DOCUMENT ORDER IS NOT A DEPENDENCY GRAPH (C111 §10.2-a), and no
 *  consumer may treat it as one (§1.1-c: never use an array position as
 *  semantic identity).  `FamilyDocument.solids` is a FLAT array evaluated
 *  in document order with no dependency edges — this array makes the
 *  dependency EXPLICIT so the ordering stops being load-bearing.
 *
 *  ⚠ DECLARED INERT ON ARRIVAL, and the declaration is the honest part.
 *  C111 §10.2-b: the feature graph is spec §16's subject and D7 is OPEN —
 *  it governs how a feature graph reconciles with an undo model that
 *  forbids selective undo.  ⛔ "Do not plan it on the undo stack."  So
 *  this format now PERSISTS the edges and NOTHING EXECUTES THEM.  An
 *  emitter with no consumer is a declared gap (C84 EI-13), not a working
 *  feature; a lane that reads these edges to order a rebuild before D7
 *  rules is deciding D7 by writing code. */
export const FeatureEdgeKindSchema = z.enum([
  /** `from` consumes `to` as an operand (a boolean's tool solid). */
  'consumes',
  /** `from` must be evaluated after `to`, without consuming it. */
  'dependsOn',
]);

export const FeatureEdgeSchema = z.object({
  from: SolidId,
  to: SolidId,
  kind: FeatureEdgeKindSchema,
});
export type FeatureEdge = z.infer<typeof FeatureEdgeSchema>;

export const FamilyDocumentSchema = z.object({
  formatVersion: FormatVersion,
  referencePlanes: z.array(ReferencePlaneSchema).default([]),
  parameters: z.array(FamilyParameterSchema).default([]),
  profiles: z.array(ProfileSchema).default([]),
  solids: z.array(SolidFeatureSchema).default([]),
  materialSlots: z.array(MaterialSlotSchema).default([]),
  types: z.array(FamilyTypeSchema).min(1),
  /* --- v1.1 additions --- */
  representations: z.array(RepresentationSchema).default([]),
  connectors: z.array(ConnectorSchema).default([]),
  propertySets: z.array(PropertySetSchema).default([]),
  featureEdges: z.array(FeatureEdgeSchema).default([]),
  /* ------------------------------------------------------------------ */
  /* ⛔ §C111-TWO-DEFAULT-CHANNELS — `defaults` IS GONE AS OF v1.1.       */
  /*    C111 delta D-5, clause §5.3-b.  DO NOT RE-ADD IT.                */
  /*                                                                     */
  /*    It was `Record<string, number|string|boolean|null>`, MAINTAINED   */
  /*    BY THREE MIGRATION OPS — `add-parameter` seeded it,               */
  /*    `change-parameter-type` converted it, `delete-parameter` removed  */
  /*    from it — AND READ BY NO RESOLVER.  `resolveParameter` takes      */
  /*    `{parameters, type, instanceOverrides}`; it never sees the        */
  /*    document, so `document.defaults` could not reach a resolved value */
  /*    BY ANY PATH.  Re-measured independently by this lane before       */
  /*    removal (three writers, zero readers) rather than taken on trust. */
  /*                                                                     */
  /*    ⭐ THE DANGEROUS PROPERTY, and the reason this comment is long:    */
  /*    the DEAD channel was the one the migration framework maintained,  */
  /*    SO IT LOOKED ALIVE.  Two answers to one question is C84 EI-9.     */
  /*                                                                     */
  /*    §5.3-a `FamilyParameter.defaultValue` is the SOLE definition-     */
  /*    default authority.                                                */
  /*    §5.3-c ⛔ ADDING A READER FOR IT IS THE FORBIDDEN FIX — that mints */
  /*    the second source of truth §76 gate B exists to prevent.          */
  /*                                                                     */
  /*    Zod strips unknown keys, so a v1.0 document carrying `defaults`   */
  /*    still parses here and the key is dropped — which is exactly the   */
  /*    removal.  `v1_0-to-v1_1.ts` performs it explicitly anyway, so the */
  /*    deletion is a NAMED migration step and not a silent side effect   */
  /*    of parser behaviour that a future Zod release could change.       */
  /* ------------------------------------------------------------------ */
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
