// w02-category-visibility — Wave 2.
//
// Spec: SPEC-30 §6 wave 2.  Resolves the per-view category-VG (visibility
// graph) override.
//
// PRYZM 1 SEMANTICS (verbatim):
//
//   1. If the element carries an EXPLICIT `categoryOverride` ('show' /
//      'hide' / 'halftone'), that wins outright — it bypasses the
//      view-level setting entirely.  This is the "lockable per-element
//      visibility" feature in the PRYZM 1 plan editor.
//   2. Otherwise, look up the view's `categoryVisibility` map for the
//      element's category.
//        - 'show' / undefined      → continue (visible: true, no halftone)
//        - 'hide'                  → short-circuit (visible: false)
//        - 'halftone'              → continue (visible: true, halftone: true)
//
// EDGE CASES PRESERVED
// ─────────────────────────────────────────────────────────────────────────────
//   • The element's `categoryOverride: 'show'` MUST override a view-level
//     'hide' — this was the most-reported behavioural quirk in PRYZM 1
//     ("I un-hid this wall but the category is hidden in the view") and
//     the fix went into wave 2 in 2019 (bug #6701).  Preserved here.
//   • The element's `categoryOverride: 'halftone'` against a view-level
//     'show' produces halftone, NOT solid.  This was bug #7122.

import type { VisibilityWaveContext, VisibilityResult } from './types.js';

export function w02CategoryVisibility(ctx: VisibilityWaveContext): VisibilityResult {
  const { activeView, element } = ctx;
  const override = element.categoryOverride;
  if (override === 'hide') return { visible: false, reason: 'element-override-hide' };
  if (override === 'show') return { visible: true, reason: 'element-override-show' };
  if (override === 'halftone') return { visible: true, halftone: true, reason: 'element-override-halftone' };

  const viewSetting = activeView.categoryVisibility.get(element.category);
  if (viewSetting === 'hide') return { visible: false, reason: 'view-category-hide' };
  if (viewSetting === 'halftone') return { visible: true, halftone: true, reason: 'view-category-halftone' };
  // 'show' or undefined → pass through.
  return { visible: true, reason: 'view-category-show' };
}
