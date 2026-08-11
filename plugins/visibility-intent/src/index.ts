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

// ─── §P7-INTENT-IS-DOMAIN (2026-08-11) — where the handlers went ─────────────
// `buildVisibilityIntentHandlerSet` and its four types are NO LONGER exported
// here. They moved to `packages/visibility/src/intents/`, and the re-export that
// used to sit below was deleted with them.
//
// This is P7 applied to its own plugin. Visibility intent is a DOMAIN concept,
// not UI: a function turning "hide these ids in this view" into a store write is
// domain logic. Keeping it in an L6 plugin meant `runtime-composer` had to import
// UPWARD to reach it, which the layer gate correctly counted as a violation
// (102 → 103). The fix was not to widen the gate but to move the code.
//
// Re-exporting the new home through this file would undo that: it would put an L6
// facade back in front of domain logic and invite exactly the upward import again
// — and it would need `@pryzm/visibility` as a dependency of a plugin that
// deliberately has none. Consumers import from `@pryzm/visibility` directly;
// `composeRuntime.ts:165-170` already does.
//
// The plugin keeps what a plugin should own: the descriptor, the keybindings and
// the rail contribution — the surface a user actually touches.

export const PLUGIN_ID = 'visibility-intent' as const;
export const PLUGIN_NAME = '@pryzm/plugin-visibility-intent' as const;

export { visibilityIntentDescriptor, PLUGIN_VERSION } from './descriptor.js';
