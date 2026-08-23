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
    // §C13-INSTANCED-RENDERER-OWNER (L-8100) — exported so a project-switch regression
    // test can drive the REAL traversal + the REAL coverage summary over a REAL
    // THREE.Scene. Pinning the detector against hand-written object literals is the
    // §C13-SCENE-ID-KEY mistake: the control then validates the detector against the
    // detector's own model of the world instead of against the world.
    collectSceneObjects,
    summariseSceneCoverage,
    formatSceneCoverage,
    PROJECT_INDEPENDENT_SCENE_ROOTS,
    SCENE_GRAPHS_NOT_TRAVERSED,
    // §L-676 (C13 §3.10) — project-scope probes: the audit's GIS/site-side eyes.
    registerProjectScopeProbe,
    listProjectScopeProbes,
    readProjectScopeProbes,
} from './ProjectIsolationAudit.js';
export type { SceneCoverage, SceneObjectLike } from './ProjectIsolationAudit.js';
export type { ProjectScopeProbe, ScopeProbeReading } from './ProjectIsolationAudit.js';

// ── ADR-0298 §PROBE-SET-DECLARED — the declared expected probe set ──────────
export {
    DECLARED_PROJECT_SCOPES,
    DECLARED_PROJECT_SCOPE_NAMES,
    DECLARED_PROJECT_SCOPE_SET_VERSION,
    DECLARED_SCOPES_REQUIRING_PRESENCE,
    LOAD_DERIVED_ELEMENT_TYPES,
} from './declaredProjectScopes.js';
export type { DeclaredProjectScope, ProjectScopePresence } from './declaredProjectScopes.js';

export {
    isMigrationComplete,
    runVGToIntentMigration,
    prewarmIntentStyleCache,
} from './migrations/VGToIntentMigration.js';
