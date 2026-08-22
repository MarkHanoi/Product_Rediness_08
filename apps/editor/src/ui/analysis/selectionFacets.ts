/**
 * selectionFacets — "walls AND level 1", as a composable question.
 *
 * Layer Affected:  UI — Analysis surface (L7)
 * File:            apps/editor/src/ui/analysis/selectionFacets.ts
 * CSS prefix:      anl-  (shares the Analysis sheet)
 * ADR:             ADR-0358 (the facet selection model) · ADR-0343 §D.3 · §D.6
 * SPEC:            SPEC-ANALYSIS-SURFACE-AND-WIDGETS §2.1
 * Contracts:       C27 §4 (SelectionBus is the single authorised entry point)
 * Issue log:       L-6602 · L-6603 · L-6604
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * ⭐ THE FOUNDER'S SENTENCE, AND WHY IT CANNOT BE ANSWERED BY A SET OF IDS
 * ═════════════════════════════════════════════════════════════════════════════
 *   "if walls for example and level 1 are selected - then wall in level 1
 *    should be highlighted"
 *
 * Those two things are picked on TWO DIFFERENT WIDGETS reading TWO DIFFERENT
 * AXES — the category donut and the elements-by-level bar. The join between them
 * has to live somewhere, and there were only two candidates:
 *
 *   A FLAT ID SET. Click "Walls" -> hold 312 ids. Now click "Level 1". The set
 *   has forgotten that it ever meant *walls*; all it holds is 312 opaque
 *   strings. It can REPLACE them, or UNION them — it cannot intersect with
 *   intent, because "walls on level 1" is not derivable from "these 312 ids"
 *   plus "these 208 ids" without re-asking what each list MEANT. It also decays:
 *   draw a new wall and the set is silently short by one, with nothing on screen
 *   saying so.
 *
 *   A FACET. Hold the QUESTION — `{axis:'category', key:'wall'}` — not the
 *   answer. Two questions on two axes compose by construction, and each one is
 *   re-asked of the read model on every refresh, so the answer is never stale.
 *
 * ⭐ FACETS COMPOSE; FLAT SETS DO NOT. That is the whole reason this file exists,
 * and it is the reason the ids are RESOLVED HERE and never STORED here.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * THE THREE RULES, AND THE ALTERNATIVES THAT WERE REJECTED (ADR-0358 §2)
 * ═════════════════════════════════════════════════════════════════════════════
 *
 * 1. ACROSS AXES: INTERSECTION. `category:wall` ∩ `level:L1`. This is the
 *    founder's sentence read literally, and it is the only reading under which
 *    a second click NARROWS — which is what a filter is for.
 *
 * 2. WITHIN ONE AXIS: REPLACEMENT, ONE FACET PER AXIS.
 *    ⛔ NOT the faceted-search convention (union within a facet), and the reason
 *    is not taste. Every card on this surface already carries `SeriesFocus`,
 *    which lights EXACTLY ONE key and whose `toggle()` clears on a second click.
 *    If the model held {wall, door} while the donut lit only `door`, the picture
 *    and the selection would be making different claims on the same card — and
 *    the chart, being the thing the reader is looking at, would be the one they
 *    believed. One facet per axis keeps the emphasis and the selection incapable
 *    of disagreeing. Union within an axis is a real feature and can be added,
 *    but only together with a chart emphasis that can light two slices.
 *    ⛔ Intersecting WITHIN an axis was never a candidate: walls ∩ doors is
 *    always empty, so it would answer every second click with an empty scene.
 *
 * 3. CLICKING THE SAME KEY AGAIN CLEARS THAT AXIS. There must always be a way
 *    BACK, by the same gesture that left — the rule `SeriesFocus.toggle` already
 *    states, applied to the model half.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * ⛔ AN INVISIBLE FILTER IS A BUG GENERATOR
 * ═════════════════════════════════════════════════════════════════════════════
 * A reader who has forgotten a facet is active reads every card as the whole
 * model. So `activeFacets()` is rendered as a chip bar on the surface header —
 * one chip per axis, each removable, plus a clear-all. `describeResolution()`
 * below produces the sentence beside it, and it states EACH FACET'S OWN COUNT
 * next to the intersection, so an empty result is self-diagnosing:
 *
 *   "Wall (312) ∩ Level 1 (208) -> nothing satisfies all of these"
 *
 * reads as "there are no walls on level 1", which is a fact about the building.
 * A bare "0 elements" would read as a broken dashboard.
 *
 * ⚠ NOT PERSISTED, and that is deliberate — the same rule `graphReadModel`'s
 * `_levelFilter` follows and for the same reason. A filter restored from a
 * previous session reopens the tab showing less than the model holds with
 * nothing on screen to explain it.
 *
 * ⚠ SURVIVES a model edit, a level change, a tab switch and a widget rearrange —
 * because a refresh RE-RESOLVES rather than re-reads. It is cleared by leaving
 * the Analysis workspace, because the emphasis it drives is cleared there too,
 * and a filter with no visible effect is the invisible-filter defect again.
 *
 * L7 file. No THREE (P2), no rAF (P3), no `(window as any)` (P4), no store
 * writes (P6) — the only outbound model call is a selection dispatch, which is
 * intent, not mutation. One OTel span per exported function (P8).
 */

import { selectionBus } from '@pryzm/core-app-model';
import { withHandlerSpan } from '@pryzm/plugin-sdk';

import type { AnalysisAxis, AnalysisFigure } from './AnalysisTypes';
import { idsForFacet } from './analysisReadModel';

/** Fired whenever the facet set changes. `AnalysisSurface` redraws the chip bar. */
export const FACETS_EVENT = 'anl-facets-changed';

/**
 * One picked question. ⛔ Holds no resolved ids — see the file header.
 * `capturedIds` is the FALLBACK for axes `idsForFacet` refuses (today:
 * `relationship`), and a facet resolved from it is flagged `fresh:false` so the
 * chip can say so.
 */
export interface AnalysisFacet {
  readonly axis: AnalysisAxis;
  /** The figure key. Namespaced by the read model, never a display label. */
  readonly key: string;
  readonly label: string;
  /** The figure's ids as they stood when the reader clicked. Fallback only. */
  readonly capturedIds: readonly string[];
}

export interface ResolvedFacet {
  readonly facet: AnalysisFacet;
  readonly ids: ReadonlySet<string>;
  /**
   * `true`  — recomputed from the live read model just now;
   * `false` — the read model does not project this axis, so these are the ids
   *           captured at click time. A SNAPSHOT, and the chip says so.
   */
  readonly fresh: boolean;
}

export interface FacetResolution {
  readonly resolved: readonly ResolvedFacet[];
  /** The INTERSECTION, in stable order. Empty when no facet is active. */
  readonly ids: readonly string[];
}

// ── State ─────────────────────────────────────────────────────────────────────
//
// ⚠ MODULE STATE, deliberately shared rather than per-card — the same choice
// `graphReadModel._levelFilter` makes. A facet picked on the Overview tab must
// still be filtering when the reader opens Quantities, or the two tabs would
// show two different universes under one filter bar.
//
// Keyed by AXIS, which is rule 2 above expressed as a data structure rather than
// as a check: the map CANNOT hold two facets on one axis.
const _facets = new Map<AnalysisAxis, AnalysisFacet>();

/** Active facets, in insertion order — the order the reader picked them. */
export function activeFacets(): readonly AnalysisFacet[] {
  return [..._facets.values()];
}

/** Is this exact `(axis, key)` the active facet on its axis? Drives chart emphasis. */
export function isFacetActive(axis: AnalysisAxis, key: string): boolean {
  return _facets.get(axis)?.key === key;
}

/**
 * Pick, re-pick or clear one axis, then push the resolved intersection to the
 * selection bus. THE entry point a widget calls.
 *
 * Rule 2 + rule 3, in four lines: same key means clear that axis; a different
 * key means replace that axis; either way every OTHER axis is untouched, which
 * is what makes "now also filter to Level 1" work.
 */
export function toggleFacet(axis: AnalysisAxis, figure: AnalysisFigure): void {
  withHandlerSpan(
    'pryzm.analysis.facet.toggle',
    { 'pryzm.surface': 'analysis', 'pryzm.analysis.facet_axis': axis },
    () => {
      if (_facets.get(axis)?.key === figure.key) {
        _facets.delete(axis);
      } else {
        _facets.set(axis, {
          axis,
          key: figure.key,
          label: figure.label,
          capturedIds: [...figure.elementIds],
        });
      }
      applyFacets();
    },
  );
}

/** Drop one axis' facet. The chip's remove control. */
export function removeFacet(axis: AnalysisAxis): void {
  if (!_facets.delete(axis)) return;
  applyFacets();
}

/**
 * Drop every facet and clear the emphasis. The bar's "Clear all", and what
 * leaving the Analysis workspace calls.
 *
 * ⛔ Dispatches a real `clear` even when no facet was active, because the
 * emphasis it drives may have been set by a 3-D click rather than by a chip —
 * returning early on an empty map would leave purple on screen with an empty
 * filter bar above it.
 */
export function clearFacets(): void {
  _facets.clear();
  selectionBus.dispatch({ type: 'clear', source: 'analytics', elementIds: [] });
  window.dispatchEvent(new CustomEvent(FACETS_EVENT));
}

/**
 * Re-ask every active facet and intersect the answers.
 *
 * ⭐ THE INTERSECTION IS BUILT BY NARROWING, SMALLEST SET FIRST — not by unioning
 * then filtering. With `walls` (312) and `level 1` (208) the work is bounded by
 * the smaller set, and, more importantly, the result cannot contain an id that
 * failed any facet, which a union-then-filter can if one facet resolves empty.
 *
 * ⚠ An EMPTY intersection is a real, reportable answer and is dispatched as one
 * (a `clear`). It means "no element satisfies all of these", which for a reader
 * who picked Walls and Level 1 means *there are no walls on level 1* — a fact
 * about their building. `describeResolution()` renders it with each facet's own
 * count beside it so it can never read as a broken dashboard.
 */
export function resolveFacets(): FacetResolution {
  return withHandlerSpan(
    'pryzm.analysis.facet.resolve',
    { 'pryzm.surface': 'analysis', 'pryzm.analysis.facet_count': _facets.size },
    () => {
      const resolved: ResolvedFacet[] = [];
      for (const facet of _facets.values()) {
        const live = idsForFacet(facet.axis, facet.key);
        // ⛔ `null` is "not projectable", NOT "empty" — see `idsForFacet`. Only
        // `null` falls back to the captured snapshot; a genuinely empty live
        // answer stays empty, because it is the true one.
        resolved.push(
          live === null
            ? { facet, ids: new Set(facet.capturedIds), fresh: false }
            : { facet, ids: live, fresh: true },
        );
      }
      if (resolved.length === 0) return { resolved, ids: [] };

      const order = [...resolved].sort((a, b) => a.ids.size - b.ids.size);
      const seed = order[0]!;
      const ids: string[] = [];
      for (const id of seed.ids) {
        if (order.every((r) => r.ids.has(id))) ids.push(id);
      }
      return { resolved, ids };
    },
  );
}

/**
 * Resolve and publish. Called on every facet change AND on every surface refresh,
 * so a model edit re-derives the emphasis instead of leaving it pinned to ids
 * that may no longer exist.
 *
 * ⛔ Routed through `selectionBus` and nothing else. C27 §4 makes it the single
 * authorised entry point for selection, and `InspectModeCoordinator` subscribes
 * to it (§FIX-ANALYSIS-HIGHLIGHT-HAS-NO-EMITTER, L-6600) — so a facet pick and a
 * 3-D click reach the Analysis lens by the SAME path. Publishing a private event
 * here instead would be a second idea of what "selected" means.
 */
export function applyFacets(): void {
  const { ids } = resolveFacets();
  if (ids.length === 0) {
    selectionBus.dispatch({ type: 'clear', source: 'analytics', elementIds: [] });
  } else {
    selectionBus.dispatch({ type: 'select', source: 'analytics', elementIds: [...ids] });
  }
  window.dispatchEvent(new CustomEvent(FACETS_EVENT));
}

/**
 * The sentence beside the chips. ⭐ It states every operand, never just the
 * result — an intersection the reader cannot decompose is an intersection they
 * cannot check, and this surface exists to be checked.
 *
 * One facet   -> "Wall (312) — 312 element(s) highlighted…"
 * Two or more -> "Wall (312) ∩ Level 1 (208) -> 47 element(s) highlighted…"
 * Empty       -> the same line ending "nothing satisfies all of these", which is
 *                an answer about the building, not a failure of the tool.
 */
export function describeResolution(r: FacetResolution): string {
  if (r.resolved.length === 0) return '';
  const parts = r.resolved.map(
    (x) => `${x.facet.label} (${x.ids.size}${x.fresh ? '' : ', snapshot'})`,
  );
  if (r.resolved.length === 1) {
    return r.ids.length === 0
      ? `${parts[0]} — nothing to highlight.`
      : `${parts[0]} — ${r.ids.length} element(s) highlighted in the 3-D scene.`;
  }
  const lhs = parts.join(' ∩ ');
  return r.ids.length === 0
    ? `${lhs} -> nothing satisfies all of these. That is an answer about the model, not a failed query.`
    : `${lhs} -> ${r.ids.length} element(s) highlighted in the 3-D scene.`;
}
