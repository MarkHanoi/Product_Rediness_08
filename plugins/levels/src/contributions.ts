// @pryzm/plugin-levels — contribution surface (F-prereq.1).
//
// Empty placeholder array; the F.4.x sub-phases of
// `PRYZM2-WIREUP-PLAN-S72` populate this list with the level-set /
// story navigation contributions (LevelsGridsRailPanel actions,
// elevation marker gestures, story-bound visibility filters).  See also
// `PHASES-A-F-MISSING-ITEMS-2026-04-29.md` §II.F.0.1 — the F-prereq.1
// baseline that lets the per-family F.x sub-phases land race-free.
//
// The `as const` convention preserves literal discriminators
// (`kind: 'toolbar.discipline' as const`, etc.) so that
// `apps/editor/src/PluginRegistry.gatherAllContributions()` can
// structurally type-check each entry against the `PluginContribution[]`
// shape from `@pryzm/runtime-composer/types`.

export const contributions = [] as const;
