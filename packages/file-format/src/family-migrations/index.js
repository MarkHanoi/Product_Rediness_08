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
/* ── lane UCE-ACCEPTANCES (§82.1-NAME-A-DATUM) — the RENAME half of §82.1.
 * A plane's NAME is its whole user-facing identity; the work-plane chooser
 * lists planes BY NAME, so this op enforces name uniqueness. The id never
 * moves, so a rename cannot orphan a profile. */
export { makeRenameReferencePlaneMigrator, } from './ops/rename-reference-plane.js';

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
/* ── lane CE-PARAMS-AND-PLANES (§82.1-PARAMETRIC-DATUM) — the op that makes a
 * reference plane FLEX. `add-reference-plane` puts a datum in the document and
 * `rename-reference-plane` gives it the identity the chooser lists it by; both
 * leave it at the model origin forever, because `origin` is a literal no
 * parameter can reach and no evaluator applies. `set-plane-offset` dimensions
 * the plane with an EXPRESSION over the definition's own parameters, and the
 * bake moves every extrude built on that plane by the resolved distance — the
 * Revit semantic rather than a number stored beside the geometry. */
export { makeSetPlaneOffsetMigrator, } from './ops/set-plane-offset.js';
/* ── lane CE-PARAMS-AND-PLANES (§PARAM-VALUE-IS-EDITABLE) — change a parameter's
 * VALUE without authoring a constant formula. Refuses a parameter carrying a
 * formula (ADR-0376 D4) and checks the value against the declared dataType. */
export { makeSetParameterDefaultMigrator, } from './ops/set-parameter-default.js';
/* ── lane CE-MAKE-IT-REACHABLE (§PROFILE-RING-IS-AUTHORABLE) — DRAW a profile:
 * insert and delete vertices, not only move them. Mints no id itself (the caller
 * supplies them, as `add-box-solid` does) and refuses an id-set change on a
 * profile carrying constraints (C111 §1.3-b, fail closed). */
export { makeSetProfileRingMigrator, } from './ops/set-profile-ring.js';
//# sourceMappingURL=index.js.map