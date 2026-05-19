// @pryzm/plugin-navigate — empty workspace-package shell (F-prereq.0).
//
// PRYZM 2 — empty navigate plugin shell (F-prereq.0). Navigation rail / camera-bookmark contributions land in F.x; this scaffold reserves the workspace package.
//
// This file intentionally contains no handlers, stores, or contributions.
// Real wiring lands per-family in the F.x sub-phases of
// `PRYZM2-WIREUP-PLAN-S72`; until then, importers get a stable PLUGIN_ID
// + PLUGIN_NAME pair so descriptor registration code can compile.

export const PLUGIN_ID = 'navigate' as const;
export const PLUGIN_NAME = '@pryzm/plugin-navigate' as const;

export { navigateDescriptor, PLUGIN_VERSION } from './descriptor.js';
export type { } from './descriptor.js';
export { buildNavigateHandlerSet } from './handlers/index.js';
export type { NavigateHandler, NavigateCommand } from './handlers/index.js';
