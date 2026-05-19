// .pryzm-family migration framework — public surface (S57 deliverable).
//
// Spec source: PHASE-3B-FAMILY-CREATOR-REWRITE-PLAN.md §5.5 + §19.6.
export { MigrationError, } from './types.js';
export { MigratorRegistry } from './registry.js';
export { identityMigrator } from './identity.js';
export { migrateFamily, PRYZM_FAMILY_MIGRATE_TRACER, } from './migrate-family.js';
export { makeRenameParameterMigrator, } from './ops/rename-parameter.js';
export { makeAddParameterMigrator, } from './ops/add-parameter.js';
export { makeDeleteParameterMigrator, } from './ops/delete-parameter.js';
export { makeChangeParameterTypeMigrator, } from './ops/change-parameter-type.js';
export { makeIntroduceExpressionMigrator, } from './ops/introduce-expression.js';
export { makeRebindIfcMigrator, } from './ops/rebind-ifc.js';
export { makeMergeMaterialSlotsMigrator, } from './ops/merge-material-slots.js';
export { makeSplitTypeMigrator, } from './ops/split-type.js';
//# sourceMappingURL=index.js.map