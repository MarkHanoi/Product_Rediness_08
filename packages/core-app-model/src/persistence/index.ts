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
    detectLeaks,
    // §L-676 (C13 §3.10) — project-scope probes: the audit's GIS/site-side eyes.
    registerProjectScopeProbe,
    listProjectScopeProbes,
    readProjectScopeProbes,
} from './ProjectIsolationAudit.js';
export type { ProjectScopeProbe, ScopeProbeReading } from './ProjectIsolationAudit.js';

export {
    isMigrationComplete,
    runVGToIntentMigration,
    prewarmIntentStyleCache,
} from './migrations/VGToIntentMigration.js';
