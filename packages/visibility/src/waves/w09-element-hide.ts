// w09-element-hide — Wave 9.
//
// Spec: SPEC-30 §6 wave 9; PHASE-3A AI-VISIBILITY-COMPLETE.md §S53 D4.
// Per-view explicit element-hide list (the PRYZM 1 "Hide in View"
// gesture — right-click → Hide → in View).
//
// PRYZM 1 SEMANTICS (verbatim):
//
//   • `activeView.hiddenElementIds` is a Set of element IDs the user
//     has explicitly hidden in this view via the "Hide in View"
//     gesture.  Membership → `visible: false` short-circuit.
//   • This is PER-VIEW, NOT per-element — the same element can be
//     hidden in plan view A and visible in plan view B.  Persisted into
//     the saved view (manifest) so it survives reload.
//   • An element-override of 'show' (wave-2) does NOT un-hide a
//     wave-9 hide.  PRYZM 1 design: "hide" is explicit, "show" is
//     just an override of a category default.
//
// EDGE CASES PRESERVED
// ─────────────────────────────────────────────────────────────────────────────
//   • An ID present in `hiddenElementIds` that does NOT correspond to
//     an existing element (orphan hide, the element was deleted) —
//     wave-9 still hides; the hide-list cleanup runs at L4 sync time.
//     Bug #11580.

import type { VisibilityWaveContext, VisibilityResult } from './types.js';

export function w09ElementHide(ctx: VisibilityWaveContext): VisibilityResult {
  const { activeView, element } = ctx;
  const hides = activeView.hiddenElementIds;
  if (!hides || hides.size === 0) {
    return { visible: true, reason: 'no-hidden-elements' };
  }
  if (hides.has(element.id)) {
    return { visible: false, reason: 'element-hidden-in-view' };
  }
  return { visible: true, reason: 'not-in-hide-list' };
}
