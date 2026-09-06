// .pryzm-family migration framework — public surface (S57 deliverable).
//
// Spec source: PHASE-3B-FAMILY-CREATOR-REWRITE-PLAN.md §5.5 + §19.6.
export { MigrationError, } from './types.js';
export { MigratorRegistry } from './registry.js';
export { identityMigrator } from './identity.js';
export { makeV1_0ToV1_1Migrator, v1_0ToV1_1Migrator, assertVersionCoherent, ALL_VERSION_MIGRATORS, V1_0, V1_1, } from './v1_0-to-v1_1.js';
export { migrateFamily, PRYZM_FAMILY_MIGRATE_TRACER, } from './migrate-family.js';
export { makeRenameParameterMigrator, } from './ops/rename-parameter.js';
export { makeAddParameterMigrator, } from './ops/add-parameter.js';
export { makeDeleteParameterMigrator, } from './ops/delete-parameter.js';
export { makeChangeParameterTypeMigrator, } from './ops/change-parameter-type.js';
export { makeIntroduceExpressionMigrator, } from './ops/introduce-expression.js';
export { makeRebindIfcMigrator, } from './ops/rebind-ifc.js';
export { makeMergeMaterialSlotsMigrator, } from './ops/merge-material-slots.js';
export { makeSplitTypeMigrator, } from './ops/split-type.js';
/* ── lane U8 (§U8-AUTHORED-SHAPE) — the GEOMETRY-authoring ops ──────────
 * The eight ops above could add a parameter and nothing else; these three are
 * the first that write `document.profiles` / `document.solids`. `readBoxSolid`
 * is exported WITH its writers on purpose — §U8-BOX-SPELLING has exactly one
 * authority and a UI that re-parsed those strings would be the second. */
export { makeAddBoxSolidMigrator, makeSetBoxDimensionsMigrator, readBoxSolid, } from './ops/box-solid.js';
export { makeAddReferencePlaneMigrator, } from './ops/add-reference-plane.js';
export { makeDeleteSolidMigrator, } from './ops/delete-solid.js';
/* ── lane UCE-ACCEPTANCES (§82.4-DIRECTED-EXTRUDE) — the op that makes a
 * reference plane CONSEQUENTIAL. `add-reference-plane` could put a datum in the
 * document and nothing read it; `produceExtrude` now sweeps along any axis, so
 * this op binds a solid to a plane and writes that plane's unit normal as the
 * sweep direction — both fields in one act, because two ops would make
 * "profile on the wall plane, extrusion still vertical" persistable. */
export { makeSetExtrudeWorkPlaneMigrator, } from './ops/set-extrude-work-plane.js';
/* ── lane UCE-FAMILY — the two ops that make the definition EDITOR half real ──
 * `update-profile` is lane U3's OWED O-1 (profile geometry write-back — without
 * it a mounted sketch surface cannot persist a single dragged vertex);
 * `delete-expression` is its O-2 (the pair `introduce-expression` names in its
 * own refusal, whose absence made every formula write-once). */
export { makeUpdateProfileMigrator, } from './ops/update-profile.js';
export { makeDeleteExpressionMigrator, } from './ops/delete-expression.js';
/* ── lane UCE-FAMILY — the EDIT half of the type system, and the ONE checksum ──
 * `ComponentTypeCatalog` could create a type (split-type) and delete one, but
 * EDITED one through a raw `document.types` transform that carried the per-type
 * `checksum` UNCHANGED — stale forever, in a content-addressed format, because
 * nothing recomputes it at pack time (measured: `grep -c checksum family-pack.ts`
 * → 0). `set-type-values` is that missing op; `typeValuesChecksum` is the single
 * digest both it and `split-type` write. */
export { makeSetTypeValuesMigrator, typeValuesChecksum, } from './ops/type-values.js';
//# sourceMappingURL=index.js.map