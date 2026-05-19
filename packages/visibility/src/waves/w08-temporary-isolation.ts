// w08-temporary-isolation — Wave 8.
//
// Spec: SPEC-30 §6 wave 8; PHASE-3A AI-VISIBILITY-COMPLETE.md §S53 D3.
// User's ad-hoc "Isolate selection" gesture (PRYZM 1's "Temporary
// Hide / Isolate" tool).
//
// PRYZM 1 SEMANTICS (verbatim):
//
//   • When `temporaryIsolation.active === true`, ONLY the elements in
//     `elementIds` are visible; everything else short-circuits to
//     `visible: false`.  This includes elements that wave-2..7 would
//     otherwise have shown.
//   • When `active === false` or `temporaryIsolation == null`, the
//     wave passes through.
//   • Isolation is per-view (not per-project) and per-session — it does
//     NOT persist into the saved view-state (wave-10).  Closing the
//     view clears it.  This is why isolation lives in `activeView` and
//     not in the manifest.
//
// EDGE CASES PRESERVED
// ─────────────────────────────────────────────────────────────────────────────
//   • Empty `elementIds` set with `active === true` → ALL elements
//     hidden.  This is intentional ("isolate nothing" is how the user
//     dismisses a stuck isolation in PRYZM 1; the toolbar then says
//     "Reset Isolation").  Bug #8901.
//   • Element-override of 'show' (wave-2) does NOT bypass isolation.
//     This was a 2019 design decision (CR-2019-44): "isolation is the
//     user explicitly saying 'I want to focus on JUST these things'".

import type { VisibilityWaveContext, VisibilityResult } from './types.js';

export function w08TemporaryIsolation(ctx: VisibilityWaveContext): VisibilityResult {
  const { activeView, element } = ctx;
  const iso = activeView.temporaryIsolation;
  if (!iso || !iso.active) {
    return { visible: true, reason: 'no-isolation' };
  }
  if (iso.elementIds.has(element.id)) {
    return { visible: true, reason: 'isolated-included' };
  }
  return { visible: false, reason: 'isolated-excluded' };
}
