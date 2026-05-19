// @pryzm/plugin-annotations — global Window augmentation
//
// Declares the minimum set of window-bridge globals that annotation source
// files access at runtime.  All properties are optional because they are set
// by the editor bootstrap sequence (engineLauncher / initTools) and are NOT
// guaranteed to be present in headless, test, or SSR environments.
//
// Architectural notes (ADR-0038 §7):
//   • These are temporary bridge globals pending full DI migration.
//   • Declare only what this package actually needs — do not mirror the full
//     runtime surface here.
//   • Types are `any` intentionally: the concrete store shapes live in
//     packages outside this plugin's dependency graph.
//   • This file is a script-mode .d.ts (no imports/exports) so the bare
//     `interface Window {}` augments the global Window directly.

interface Window {
    runtime?:              any;
    commandManager?:       any;
    toolManager?:          any;
    bimManager?:           any;
    selectionManager?:     any;
    annotationManager?:    any;
    annotationStore?:      any;
    constraintStore?:      any;
    constraintSolver?:     any;
    viewController?:       any;
    viewDefinitionStore?:  any;
    viewTemplateStore?:    any;
    vgGovernanceStore?:    any;
    resolverStores?:       any;
    wallStore?:            any;
    doorStore?:            any;
    windowStore?:          any;
    gridStore?:            any;
    roomStore?:            any;
}
