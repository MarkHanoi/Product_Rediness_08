// .pryzm-family migration framework — public surface (S57 deliverable).
//
// Spec source: PHASE-3B-FAMILY-CREATOR-REWRITE-PLAN.md §5.5 + §19.6.

export {
  type Migrator,
  type RawFamily,
  type ChainResult,
  type ChainStep,
  MigrationError,
} from './types.js';
export { MigratorRegistry } from './registry.js';
export { identityMigrator } from './identity.js';
export {
  makeV1_0ToV1_1Migrator,
  v1_0ToV1_1Migrator,
  assertVersionCoherent,
  ALL_VERSION_MIGRATORS,
  V1_0,
  V1_1,
} from './v1_0-to-v1_1.js';
export {
  migrateFamily,
  PRYZM_FAMILY_MIGRATE_TRACER,
  type MigrateFamilyOptions,
  type MigrateFamilyResult,
} from './migrate-family.js';

export {
  makeRenameParameterMigrator,
  type RenameParameterParams,
} from './ops/rename-parameter.js';
export {
  makeAddParameterMigrator,
  type AddParameterParams,
} from './ops/add-parameter.js';
export {
  makeDeleteParameterMigrator,
  type DeleteParameterParams,
} from './ops/delete-parameter.js';
export {
  makeChangeParameterTypeMigrator,
  type ChangeParameterTypeParams,
  type FamilyParameterDataType,
} from './ops/change-parameter-type.js';
export {
  makeIntroduceExpressionMigrator,
  type IntroduceExpressionParams,
} from './ops/introduce-expression.js';
export {
  makeRebindIfcMigrator,
  type RebindIfcParams,
} from './ops/rebind-ifc.js';
export {
  makeMergeMaterialSlotsMigrator,
  type MergeMaterialSlotsParams,
} from './ops/merge-material-slots.js';
export {
  makeSplitTypeMigrator,
  type SplitTypeParams,
} from './ops/split-type.js';

/* ── lane U8 (§U8-AUTHORED-SHAPE) — the GEOMETRY-authoring ops ──────────
 * The eight ops above could add a parameter and nothing else; these three are
 * the first that write `document.profiles` / `document.solids`. `readBoxSolid`
 * is exported WITH its writers on purpose — §U8-BOX-SPELLING has exactly one
 * authority and a UI that re-parsed those strings would be the second. */
export {
  makeAddBoxSolidMigrator,
  makeSetBoxDimensionsMigrator,
  readBoxSolid,
  type AddBoxSolidParams,
  type SetBoxDimensionsParams,
  type BoxDimension,
  type BoxDimensions,
  type BoxSolidReading,
} from './ops/box-solid.js';
export {
  makeAddReferencePlaneMigrator,
  type AddReferencePlaneParams,
} from './ops/add-reference-plane.js';
export {
  makeDeleteSolidMigrator,
  type DeleteSolidParams,
} from './ops/delete-solid.js';
