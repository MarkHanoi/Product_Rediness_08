// @pryzm/plugin-visibility-intent — empty workspace-package shell (F-prereq.0).
//
// The Visual rail (a sibling of CreateRailPanel) routes its
// Visibility-Graphics + edge / transparency / isolate / hide / reveal
// gestures through this plugin per `PRYZM2-WIREUP-PLAN-S72`:
//   * §16.6.1 F.1.59 — VisualRailPanel "Visibility-Graphics" button
//   * §16.6.1 F.1.60 — edge style toggle
//   * §16.6.1 F.1.61 — transparency
//   * §16.6.1 F.1.62 — isolate selection
//   * §16.6.1 F.1.63 — hide selection
//   * §16.6.1 F.1.64 — reveal hidden
//   * §16.6.1 F.1.65 — VisualRailPanel rewrite (data-driven)
//   * §16.6.3 F.8.x  — VI panel + per-element OverridePanel + intent
//
// The plan deliberately splits the *rail name* (Visual) from the
// *plugin id* (visibility-intent) so the rail surface can host third-
// party VI-style contributions later without a rename.  See
// `15-subphases-E-families.md` §F.8 + the cast annotation map in
// `PHASES-A-F-MISSING-ITEMS-2026-04-29.md` §II.B.33.
//
// This file intentionally contains no handlers, stores, or
// contributions today.  Real wiring lands in S81-WIRE; until then,
// importers get a stable PLUGIN_ID + PLUGIN_NAME pair so descriptor
// registration code can compile.

export const PLUGIN_ID = 'visibility-intent' as const;
export const PLUGIN_NAME = '@pryzm/plugin-visibility-intent' as const;

export { visibilityIntentDescriptor, PLUGIN_VERSION } from './descriptor.js';
export { buildVisibilityIntentHandlerSet } from './handlers/index.js';
export type { VisibilityIntentHandler, VisibilityIntentCommand } from './handlers/index.js';
