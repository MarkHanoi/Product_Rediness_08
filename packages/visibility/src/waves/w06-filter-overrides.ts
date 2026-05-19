// w06-filter-overrides — Wave 6.
//
// Spec: SPEC-30 §6 wave 6; PHASE-3A AI-VISIBILITY-COMPLETE.md §S53 D2.
// Saved per-view filter rules (the PRYZM 1 "View Filters" panel).
//
// PRYZM 1 SEMANTICS (verbatim):
//
//   • Each view carries an ORDERED list of `ViewFilterOverride` records;
//     wave-6 evaluates them in order and the FIRST matching filter wins.
//     This is the same first-match-wins precedence PRYZM 1 used (the
//     panel exposed Up / Down buttons exactly because order was load-
//     bearing).
//   • Filter verbs:
//       - `'hide'`     → element hidden in this view (short-circuit).
//       - `'halftone'` → element halftoned in this view; later waves run.
//       - `'show'`     → explicit show; later waves run (overrides nothing,
//                        just terminates the wave-6 search).
//   • An element-override of `'show'` (wave-2) does NOT bypass wave-6 —
//     PRYZM 1 deliberately allowed filters to override individual element
//     "Show in View" gestures so power users could have a global "hide
//     all R-15 walls" filter that beat per-element gestures.  Bug #9341
//     was filed against this and rejected.
//   • Empty filter list → pass through.
//
// EDGE CASES PRESERVED
// ─────────────────────────────────────────────────────────────────────────────
//   • A filter `matches` predicate that THROWS is treated as "did not
//     match" — wave continues to the next filter.  This was bug #11920
//     ("malformed filter brings down entire view"); the fix was to swallow
//     predicate errors at the wave boundary.
//   • Two filters that both match: only the first one's verb is applied;
//     the second is ignored.  Tested in `parity-w06`.

import type { VisibilityWaveContext, VisibilityResult } from './types.js';

export function w06FilterOverrides(ctx: VisibilityWaveContext): VisibilityResult {
  const { activeView, element } = ctx;
  const filters = activeView.filterOverrides;
  if (!filters || filters.length === 0) {
    return { visible: true, reason: 'no-filters' };
  }
  for (const f of filters) {
    let matched: boolean;
    try {
      matched = f.matches(element);
    } catch {
      // Bug #11920 fix: predicate errors are silently skipped.
      continue;
    }
    if (!matched) continue;
    if (f.verb === 'hide') {
      return { visible: false, reason: `filter-${f.id}-hide` };
    }
    if (f.verb === 'halftone') {
      return { visible: true, halftone: true, reason: `filter-${f.id}-halftone` };
    }
    // 'show' — just terminate the search; later waves still run.
    return { visible: true, reason: `filter-${f.id}-show` };
  }
  // No filter matched.
  return { visible: true, reason: 'no-filter-matched' };
}
