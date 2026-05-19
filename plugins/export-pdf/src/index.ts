// @pryzm/plugin-export-pdf — empty workspace-package shell (F-prereq.0).
//
// PRYZM 2 — empty PDF export plugin shell (F-prereq.0). PDF export pipelines (sheets → PDF, BCF → PDF) land in F.x; this scaffold reserves the workspace package.
//
// This file intentionally contains no handlers, stores, or contributions.
// Real wiring lands per-family in the F.x sub-phases of
// `PRYZM2-WIREUP-PLAN-S72`; until then, importers get a stable PLUGIN_ID
// + PLUGIN_NAME pair so descriptor registration code can compile.

export const PLUGIN_ID = 'export-pdf' as const;
export const PLUGIN_NAME = '@pryzm/plugin-export-pdf' as const;
