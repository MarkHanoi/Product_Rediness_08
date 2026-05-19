// w04-wall-end-joins — Wave 4.
//
// Spec: SPEC-30 §6 wave 4.  Wall-end-join geometry inherits the parent
// wall's visibility (a join cap is a derived geometry — it must hide
// when its wall hides, and halftone when its wall halftones).
//
// PRYZM 1 SEMANTICS (verbatim):
//
//   • If `element.parentWallId` is set, this is a join cap.  Look up the
//     parent wall's visibility from `ctx.resolvedVisibility` (populated by
//     waves 1-3 for the parent wall earlier in the same pass).  Inherit
//     `visible` and `halftone` verbatim.
//   • If the parent wall is not in `resolvedVisibility` (the runner hasn't
//     reached it yet), default to visible — this is the "visible by
//     default in pre-resolution" semantic from PRYZM 1.  The runner
//     re-resolves join caps after walls in the same pass; pre-resolution
//     visibility is just the cold-start state.
//   • For non-join elements (no `parentWallId`), this wave is a no-op
//     (returns visible).
//
// EDGE CASES PRESERVED
// ─────────────────────────────────────────────────────────────────────────────
//   • A join cap whose parent wall has `visible: true` from waves 1-3 stays
//     visible even if the join's own category is otherwise hidden — this was
//     bug #9018 ("missing wall corners after hiding the wall-cap category").
//     The fix put the parent-wall short-circuit AHEAD of category checks for
//     join caps; we replicate that ordering by running wave-4 before the
//     opening-culling wave-5 and after waves 1-3 (which ran for the parent).
//   • A join cap whose parent wall is hidden short-circuits with visible: false.

import type { VisibilityWaveContext, VisibilityResult } from './types.js';

export function w04WallEndJoins(ctx: VisibilityWaveContext): VisibilityResult {
  const { element, resolvedVisibility } = ctx;
  if (!element.parentWallId) {
    // Not a wall-end-join cap → pass through.
    return { visible: true, reason: 'not-a-join-cap' };
  }
  // Look up the parent wall's resolved visibility (waves 1-3 should have
  // run for the parent earlier in the same pass).
  if (!resolvedVisibility.has(element.parentWallId)) {
    // Pre-resolution: visible by default per PRYZM 1.
    return { visible: true, reason: 'parent-wall-pre-resolved' };
  }
  const parentVisible = resolvedVisibility.get(element.parentWallId) ?? true;
  if (!parentVisible) {
    return { visible: false, reason: 'parent-wall-hidden' };
  }
  return { visible: true, reason: 'parent-wall-visible' };
}
