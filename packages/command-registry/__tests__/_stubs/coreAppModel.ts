// THROWAWAY test stub for @pryzm/core-app-model (+ /element-registry subpath),
// used ONLY by the worktree vitest config (vitest.worktree.lift-cmd.mjs). The real
// barrel pulls a large THREE-touching dependency graph. CreateVerticalCirculationCommand
// imports `semanticGraphManager` (barrel) + `elementRegistry` (subpath); neither is
// exercised by canExecute(), so a no-op surface is sufficient for the validation tests.
// On merge into the workspace this stub is deleted and the real package resolves.

export const semanticGraphManager = {
    addRelationship: (_r: unknown) => {},
    removeAllRelationshipsForElement: (_id: string) => {},
};

export const elementRegistry = {
    registerRoot: (_id: string, _root: unknown) => {},
    registerSemanticOrReplace: (_id: string, _type: string) => {},
    unregister: (_id: string) => {},
};
