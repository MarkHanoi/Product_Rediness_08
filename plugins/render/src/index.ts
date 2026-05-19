// @pryzm/plugin-render — empty workspace-package shell (F-prereq.0).
//
// PRYZM 2 — empty render plugin shell (F-prereq.0). Render-pipeline contributions (post-FX, lighting presets) land in F.x; this scaffold reserves the workspace package.
//
// This file intentionally contains no handlers, stores, or contributions.
// Real wiring lands per-family in the F.x sub-phases of
// `PRYZM2-WIREUP-PLAN-S72`; until then, importers get a stable PLUGIN_ID
// + PLUGIN_NAME pair so descriptor registration code can compile.

export const PLUGIN_ID = 'render' as const;
export const PLUGIN_NAME = '@pryzm/plugin-render' as const;
