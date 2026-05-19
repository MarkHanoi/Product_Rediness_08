// w07-phase-filter — Wave 7.
//
// Spec: SPEC-30 §6 wave 7; PHASE-3A VI-AI-ELEMENT-CREATOR.md §1.2
// lines 113-145.  Construction-phase visibility — the BIM-canonical
// "show only New Construction" / "show only Existing" / etc. filter.
//
// PRYZM 1 / Revit SEMANTICS (verbatim):
//
//   • Every element has `createdInPhase` (when it appears) and optionally
//     `demolishedInPhase` (when it goes away).  Phases form a strict
//     total order via `phaseOrder`.
//   • The view's `phaseState.mode` decides which slice to show:
//       - `'show-all'`        → every element existing in or before
//                                active phase; demolished elements
//                                halftoned.
//       - `'show-new'`        → only `createdInPhase === activePhase`.
//       - `'show-existing'`   → only `createdInPhase < activePhase`
//                                AND not demolished by active phase.
//       - `'show-demolished'` → only `demolishedInPhase === activePhase`.
//       - `'show-temporary'`  → only created AND demolished in active
//                                phase.
//   • Elements with no `createdInPhase` ("not phased") pass through
//     unconditionally — PRYZM 1 treats them as project-wide elements
//     (e.g. survey points, base levels).
//   • `phaseState === null` → wave passes through (view has no phasing).
//
// EDGE CASES PRESERVED
// ─────────────────────────────────────────────────────────────────────────────
//   • An element whose `createdInPhase` is NOT in `phaseOrder` is treated
//     as "not phased" (orphan phase, e.g. phase deleted but element not
//     migrated).  Bug #12010 — Revit crashes on this; we pass through.
//   • `demolishedInPhase < createdInPhase` is ill-formed; wave treats the
//     element as never-demolished (defensive).

import type { VisibilityWaveContext, VisibilityResult } from './types.js';

function indexOf(order: readonly string[], phase: string | null | undefined): number {
  if (!phase) return -1;
  return order.indexOf(phase);
}

export function w07PhaseFilter(ctx: VisibilityWaveContext): VisibilityResult {
  const { activeView, element } = ctx;
  const ps = activeView.phaseState;
  if (!ps) return { visible: true, reason: 'no-phase-state' };

  const created = element.createdInPhase ?? null;
  const demolished = element.demolishedInPhase ?? null;

  if (created === null) {
    return { visible: true, reason: 'not-phased' };
  }

  const activeIdx = indexOf(ps.phaseOrder, ps.activePhase);
  const createdIdx = indexOf(ps.phaseOrder, created);
  const demolishedIdx = indexOf(ps.phaseOrder, demolished);

  // Orphan phase (bug #12010): treat as not phased.
  if (createdIdx === -1) {
    return { visible: true, reason: 'orphan-phase-pass-through' };
  }
  // Active phase orphan: defensive pass through.
  if (activeIdx === -1) {
    return { visible: true, reason: 'orphan-active-phase-pass-through' };
  }

  // Defensive: demolished < created → treat as never-demolished.
  const effDemolishedIdx =
    demolishedIdx >= 0 && demolishedIdx < createdIdx ? -1 : demolishedIdx;

  switch (ps.mode) {
    case 'show-new':
      if (createdIdx === activeIdx) {
        return { visible: true, reason: 'phase-new' };
      }
      return { visible: false, reason: 'phase-new-mismatch' };

    case 'show-existing':
      if (createdIdx < activeIdx && (effDemolishedIdx === -1 || effDemolishedIdx > activeIdx)) {
        return { visible: true, reason: 'phase-existing' };
      }
      return { visible: false, reason: 'phase-existing-mismatch' };

    case 'show-demolished':
      if (effDemolishedIdx === activeIdx) {
        return { visible: true, reason: 'phase-demolished' };
      }
      return { visible: false, reason: 'phase-demolished-mismatch' };

    case 'show-temporary':
      if (createdIdx === activeIdx && effDemolishedIdx === activeIdx) {
        return { visible: true, reason: 'phase-temporary' };
      }
      return { visible: false, reason: 'phase-temporary-mismatch' };

    case 'show-all':
    default:
      // Future / not-yet-built → hide.
      if (createdIdx > activeIdx) {
        return { visible: false, reason: 'phase-future' };
      }
      // Demolished by or before active phase → halftoned.
      if (effDemolishedIdx >= 0 && effDemolishedIdx <= activeIdx) {
        return { visible: true, halftone: true, reason: 'phase-demolished-halftone' };
      }
      return { visible: true, reason: 'phase-all-existing' };
  }
}
