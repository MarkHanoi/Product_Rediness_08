// THROWAWAY test stub for @pryzm/core-app-model, used ONLY by the worktree
// vitest config (vitest.worktree.lift.mjs). The worktree is not in the pnpm
// workspace and has no node_modules, and the real core-app-model barrel pulls a
// large dependency graph (incl. THREE-touching modules). For the geometry-lift
// store tests we only need `storeEventBus` (re-exported from the REAL standalone
// StoreEventBus.ts) + a minimal `ProjectContext` type. On merge into the
// workspace this stub + the worktree config are deleted and the real package
// resolves via the installed symlink.
export { storeEventBus } from '../../../core-app-model/src/StoreEventBus.js';

export interface ProjectContext {
    readonly activeLevelId: string;
}
