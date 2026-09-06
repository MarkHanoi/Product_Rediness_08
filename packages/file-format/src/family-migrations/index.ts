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

/* ── lane UCE-ACCEPTANCES (§82.4-DIRECTED-EXTRUDE) — the op that makes a
 * reference plane CONSEQUENTIAL. `add-reference-plane` could put a datum in the
 * document and nothing read it; `produceExtrude` now sweeps along any axis, so
 * this op binds a solid to a plane and writes that plane's unit normal as the
 * sweep direction — both fields in one act, because two ops would make
 * "profile on the wall plane, extrusion still vertical" persistable. */
export {
  makeSetExtrudeWorkPlaneMigrator,
  type SetExtrudeWorkPlaneParams,
} from './ops/set-extrude-work-plane.js';
/* ── lane UCE-ACCEPTANCES (§82.1-NAME-A-DATUM) — the RENAME half of §82.1.
 * A plane's NAME is its whole user-facing identity: the `plane_…` id never
 * reaches a surface, and the work-plane chooser lists planes BY NAME. So a
 * definition with two planes called the same thing is one where the author
 * cannot tell which datum a shape is built on — which is why THIS op enforces
 * name uniqueness and `add-reference-plane`, written before the chooser
 * existed, does not. The id never moves, so a rename cannot orphan a profile. */
export {
  makeRenameReferencePlaneMigrator,
  type RenameReferencePlaneParams,
} from './ops/rename-reference-plane.js';

/* ── lane CE-PARAMS-AND-PLANES (§82.1-PARAMETRIC-DATUM) — the op that makes a
 * reference plane FLEX. `add-reference-plane` puts a datum in the document and
 * `rename-reference-plane` gives it the identity the chooser lists it by; both
 * leave it at the model origin forever, because `origin` is a literal no
 * parameter can reach and no evaluator applies. `set-plane-offset` dimensions
 * the plane with an EXPRESSION over the definition's own parameters, and the
 * bake moves every extrude built on that plane by the resolved distance — the
 * Revit semantic (geometry locked to planes, planes positioned by parametric
 * dimensions) rather than a number stored beside the geometry. */
export {
  makeSetPlaneOffsetMigrator,
  type SetPlaneOffsetParams,
} from './ops/set-plane-offset.js';


/* ── lane UCE-FAMILY — the two ops that make the definition EDITOR half real ──
 * `update-profile` is lane U3's OWED O-1 (profile geometry write-back — without
 * it a mounted sketch surface cannot persist a single dragged vertex);
 * `delete-expression` is its O-2 (the pair `introduce-expression` names in its
 * own refusal, whose absence made every formula write-once). */
export {
  makeUpdateProfileMigrator,
  type UpdateProfileParams,
  type ProfilePointUpdate,
} from './ops/update-profile.js';
export {
  makeDeleteExpressionMigrator,
  type DeleteExpressionParams,
} from './ops/delete-expression.js';

/* ── lane UCE-FAMILY — the EDIT half of the type system, and the ONE checksum ──
 * `ComponentTypeCatalog` could create a type (split-type) and delete one, but
 * EDITED one through a raw `document.types` transform that carried the per-type
 * `checksum` UNCHANGED — stale forever, in a content-addressed format, because
 * nothing recomputes it at pack time (measured: `grep -c checksum family-pack.ts`
 * → 0). `set-type-values` is that missing op; `typeValuesChecksum` is the single
 * digest both it and `split-type` write. */
export {
  makeSetTypeValuesMigrator,
  typeValuesChecksum,
  type SetTypeValuesParams,
  type TypeValueMap,
} from './ops/type-values.js';
