// Plugin contributions exported by `@pryzm/plugin-wall`.
//
// F-launch.1 (S81 F.1.01) — first plugin contribution to land.  The
// canonical pattern this file establishes is repeated 36 more times
// across F.1.02 .. F.1.13 (the remaining 12 element-family rail tools)
// and the F.2.x panel-host migration (overlay / inspector / view-action
// contributions).
//
// Architecture note.  We deliberately do NOT take a static dep on
// `@pryzm/runtime-composer` here — that would create a workspace-package
// cycle (runtime-composer → @pryzm/editor → @pryzm/plugin-wall).  Instead
// the contribution is exported `as const` so its inferred shape is
// structurally compatible with `ToolbarDisciplineContribution` from
// runtime-composer/types.ts; structural compatibility is enforced where
// the contribution is *consumed* (in apps/editor/src/PluginRegistry.ts,
// where `gatherAllContributions()` returns `readonly PluginContribution[]`).
//
// The `activate` callback takes a structurally-typed minimal runtime
// (`{ tools: { activate(family, mode?) } }`) — a `PryzmRuntime` is
// assignable to that shape, so callers pass the real runtime in.

/** Minimal subset of `PryzmRuntime` that the wall toolbar contribution
 *  needs.  Declared locally so this file stays free of editor / runtime
 *  package imports (see file header for rationale). */
interface WallContributionRuntime {
  readonly tools: {
    activate(family: string, mode?: string): void;
  };
}

/** Wall → Architecture rail contribution.  `as const` preserves the
 *  literal `kind` / `discipline` discriminators so the consumer can
 *  type-check it against the `ToolbarDisciplineContribution` interface
 *  in `@pryzm/runtime-composer/types`. */
export const wallToolbarContribution = {
  kind: 'toolbar.discipline' as const,
  id: 'wall.tool',
  discipline: 'architecture' as const,
  label: 'Wall',
  // Resolved against `PryzmIcons` in `CreateRailPanel`; the legacy
  // hard-coded entry uses `PryzmIcons.wall` and we keep the same key.
  icon: 'wall',
  shortcut: 'Alt+W',
  activate: (runtime: WallContributionRuntime): void => {
    // Mirrors the legacy `_activateTool('wall', 'polyline_ortho')` call
    // site in `CreateRailPanel._buildSections()`.  Keeping the mode
    // string identical guarantees the contribution-driven path and the
    // legacy hard-coded path converge on the same `WallTool` activator
    // registered in `apps/editor/src/bootstrap.render.everything.ts`.
    runtime.tools.activate('wall', 'polyline_ortho');
  },
} as const;
