// w01-level-scope — Wave 1 of the PRYZM 1 visibility system.
//
// Spec: `phases/PHASE-2D-Q4-M22-M24-SYNC-AWARENESS-BETA.md` §S46 lines
// 526-538 (canonical pattern); SPEC-30 §6 (literal preservation).
//
// PRYZM 1 SOURCE (verbatim semantics):
//
//   "An element is visible in a view if its level is in the view's
//    visible-levels set OR the view is unlevel-scoped."
//
// EDGE CASES PRESERVED FROM PRYZM 1
// ─────────────────────────────────────────────────────────────────────────────
//   • Project-root pseudo-level (`'__root__'`) is treated as a regular level
//     — i.e. it must be IN `visibleLevels` to render, unless the view is
//     unlevel-scoped.  This was bug #4421 in PRYZM 1; the fix landed via
//     adding `'__root__'` to every default plan-view's `visibleLevels` set.
//     We carry the convention forward; the bake worker / view producer is
//     responsible for adding `'__root__'` to default plan views.
//   • An empty `visibleLevels` set on a level-scoped view hides EVERY
//     element.  This was bug #5118; fixed at view-creation time, not in
//     the wave.

import type { VisibilityWaveContext, VisibilityResult } from './types.js';

export function w01LevelScope(ctx: VisibilityWaveContext): VisibilityResult {
  const { activeView, element } = ctx;
  if (activeView.unlevelScoped) {
    return { visible: true, reason: 'view-unlevel-scoped' };
  }
  if (activeView.visibleLevels.has(element.levelId)) {
    return { visible: true, reason: 'level-in-scope' };
  }
  return { visible: false, reason: 'level-out-of-scope' };
}
