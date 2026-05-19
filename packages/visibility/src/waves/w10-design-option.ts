// w10-design-option — Wave 10.
//
// Spec: SPEC-30 §6 wave 10; PHASE-3A VI-AI-ELEMENT-CREATOR.md §1.2
// lines 165-198.  Design-option visibility — Revit's "Design Options"
// system, where a project can carry multiple alternatives for the
// same area (e.g. Option A: open kitchen; Option B: galley kitchen)
// and each view picks which option to show.
//
// PRYZM 1 / Revit SEMANTICS (verbatim):
//
//   • Elements with `designOptionId === null` are part of the MAIN
//     model — always visible regardless of `activeDesignOptions`.
//     This is the "primary" set.
//   • Elements with `designOptionId !== null` are only visible if
//     their option ID is in `activeDesignOptions`.
//   • `activeDesignOptions === undefined` means "design options not
//     configured for this view" — the wave passes through (every
//     element visible regardless of designOptionId).  This matches
//     PRYZM 1's behavior for views created BEFORE design options
//     were added to the project.
//   • An element-override of 'show' (wave-2) does NOT make an
//     inactive-option element visible — design options are a
//     model-level construct, the per-view override is meaningless
//     in that context.
//
// EDGE CASES PRESERVED
// ─────────────────────────────────────────────────────────────────────────────
//   • `activeDesignOptions` empty Set (the user explicitly cleared all
//     options) → only main-model elements visible; every option
//     element hidden.  Tested in parity.
//   • An element with a `designOptionId` that has been DELETED (orphan
//     option) — wave-10 hides it.  PRYZM 1 design: orphan option
//     elements are unrecoverable through the UI; the cleanup pass at
//     L4 sync deletes them.

import type { VisibilityWaveContext, VisibilityResult } from './types.js';

export function w10DesignOption(ctx: VisibilityWaveContext): VisibilityResult {
  const { activeView, element } = ctx;
  const active = activeView.activeDesignOptions;
  // View has no design-option configuration → pass through.
  if (active === undefined) {
    return { visible: true, reason: 'no-design-option-config' };
  }
  // Main-model element → always visible.
  if (element.designOptionId === null || element.designOptionId === undefined) {
    return { visible: true, reason: 'main-model' };
  }
  // Option element → visible iff its option is active.
  if (active.has(element.designOptionId)) {
    return { visible: true, reason: `design-option-${element.designOptionId}-active` };
  }
  return { visible: false, reason: `design-option-${element.designOptionId}-inactive` };
}
