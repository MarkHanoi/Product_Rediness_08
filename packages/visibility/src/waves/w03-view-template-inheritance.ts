// w03-view-template-inheritance — Wave 3.
//
// Spec: SPEC-30 §6 wave 3.  Inherits category-VG from a chain of view
// templates when the active view itself doesn't pin the category.
//
// PRYZM 1 SEMANTICS (verbatim):
//
//   • View templates form a parent chain (`template -> template.parent -> ...`).
//   • For an element's category, walk the chain from the active view's
//     template upward.  The FIRST template that has a non-undefined entry
//     for that category wins; templates further up the chain are ignored.
//   • If wave-2 already produced a definitive answer (visible: false from a
//     hide, halftone: true from a halftone), wave-3 SHOULD NOT override it
//     — the short-circuit short-circuits.  This is enforced by the chain
//     runner (waves run left-to-right; a `visible: false` stops the chain).
//   • Wave-3 only fires when wave-2 returned a "view-category-show" /
//     "view-category-halftone" / "element-override-show" verdict — i.e.
//     when the view didn't make a hard decision.  The chain runner
//     guarantees this by the short-circuit rule.
//
// EDGE CASES PRESERVED
// ─────────────────────────────────────────────────────────────────────────────
//   • Templates that pin 'show' explicitly are TREATED THE SAME as the
//     view itself pinning 'show' — i.e. they let later waves run.  This
//     was bug #8214 ("explicit show in template ignored").
//   • An element-override of 'show' (handled in wave-2) makes wave-3 a
//     pass-through — the user's choice wins.

import type { VisibilityWaveContext, VisibilityResult, VisibilityViewTemplate } from './types.js';

export function w03ViewTemplateInheritance(ctx: VisibilityWaveContext): VisibilityResult {
  const { activeView, element } = ctx;
  // Element-override of 'show' wins outright (preserves wave-2 element
  // override).  Wave-2 already handled it, but we re-check defensively
  // because waves are pure and the chain runner doesn't pass wave-2's
  // verdict directly to wave-3.
  if (element.categoryOverride === 'show') {
    return { visible: true, reason: 'element-override-show' };
  }
  // The active view itself defines the category → wave-2 already covered.
  if (activeView.categoryVisibility.has(element.category)) {
    return { visible: true, reason: 'view-defines-category' };
  }
  // Walk the template chain.
  let template: VisibilityViewTemplate | null | undefined = activeView.viewTemplate;
  while (template) {
    const setting = template.categoryVisibility.get(element.category);
    if (setting === 'hide') return { visible: false, reason: `template-${template.id}-hide` };
    if (setting === 'halftone') return { visible: true, halftone: true, reason: `template-${template.id}-halftone` };
    if (setting === 'show') return { visible: true, reason: `template-${template.id}-show` };
    template = template.parent ?? null;
  }
  // No template makes a decision → pass through.
  return { visible: true, reason: 'no-template-pin' };
}
