// @pryzm/plugin-visibility-intent — contribution surface (F-prereq.1).
//
// Empty placeholder array; the F.8.x sub-phases of
// `PRYZM2-WIREUP-PLAN-S72` populate this list with the Visual rail
// contributions and per-element OverridePanel intent gestures, per
// `15-subphases-E-families.md` §F.8 + the cast annotation map in
// `PHASES-A-F-MISSING-ITEMS-2026-04-29.md` §II.B.33:
//
//   • F.1.59 — VisualRailPanel "Visibility-Graphics" button
//   • F.1.60 — edge style toggle
//   • F.1.61 — transparency
//   • F.1.62 — isolate selection
//   • F.1.63 — hide selection
//   • F.1.64 — reveal hidden
//   • F.1.65 — VisualRailPanel rewrite (data-driven)
//   • F.8.x  — VI panel + per-element OverridePanel + intent gestures
//
// See also `PHASES-A-F-MISSING-ITEMS-2026-04-29.md` §II.F.0.1 — the
// F-prereq.1 baseline that lets the per-family F.x sub-phases land
// race-free.
//
// The `as const` convention preserves literal discriminators
// (`kind: 'toolbar.discipline' as const`, etc.) so that
// `apps/editor/src/PluginRegistry.gatherAllContributions()` can
// structurally type-check each entry against the `PluginContribution[]`
// shape from `@pryzm/runtime-composer/types`.

export const contributions = [
  {
    kind: 'panel' as const,
    id: 'visibility-intent.visual-rail',
    location: 'sidebar-left' as const,
    label: 'Visibility / Graphics',
  },
] as const;
