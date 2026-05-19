/**
 * @pryzm/core-app-model — persistence sub-barrel (Wave 10 Task 2 W10-A + P9-W5 + Sprint E P9-W10)
 */

// ── Sprint E P9-W10 (2026-05-10) — SNAPSHOT_SCHEMA_VERSION extracted from ProjectSerializer ──
export { SNAPSHOT_SCHEMA_VERSION } from './SnapshotConstants.js';

export type {
    ProjectScopedStore,
    ClearReport,
} from './ProjectScopeRegistry.js';

export { projectScopeRegistry } from './ProjectScopeRegistry.js';

export { projectScopedStorage } from './ProjectScopedStorage.js';

// ── P9-W5 additions ────────────────────────────────────────────────────────

export type {
    IProjectSnapshot,
    ILoadResult,
    IProjectSaveDelegate,
    IProjectLoadDelegate,
} from './DelegateTypes.js';

export {
    installProjectIsolationAudit,
    getIsolationLeakHistory,
} from './ProjectIsolationAudit.js';

export {
    isMigrationComplete,
    runVGToIntentMigration,
    prewarmIntentStyleCache,
} from './migrations/VGToIntentMigration.js';
