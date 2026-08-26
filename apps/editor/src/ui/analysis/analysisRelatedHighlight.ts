/**
 * analysisRelatedHighlight — pushes the relationship graph's hop-N neighbourhood
 * of the current selection into the 3-D scene, so "related" is visible in the
 * MODEL, not only in the graph card.
 *
 * ## MODIFICATION DECLARATION
 *
 * Layer Affected:    UI — Analysis surface (L7)
 * File:              apps/editor/src/ui/analysis/analysisRelatedHighlight.ts
 * Contract:          C27 §4 (SelectionBus is the single authorised entry point)
 * Issue log:         §HILITE140 (L-12292)
 *
 * ── THE FOUNDER'S SENTENCE, WHICH IS THE SPEC ────────────────────────────────
 *
 *   "In Analysis → Relationships, when the user selects one element it gets
 *    highlighted in the 3-D scene — which is great — but I would like to also
 *    highlight the elements that are being highlighted as RELATED in the graph
 *    — which happens now [in the graph], but also in the model scene."
 *
 * ── WHY THIS IS A NEW, STANDALONE MODULE RATHER THAN A CHANGE TO THE CARD ────
 *
 * `widgetRenderers.ts::renderGraph` ALREADY computes exactly this neighbourhood
 * on every render — `focusNeighbourhood(projection, [...selected],
 * graphFocusDepth())` — to dim non-related nodes IN THE GRAPH. The obvious move
 * would be to push its result from there. It is a CONCURRENT lane's file, mid-edit
 * (§DEMO141, presentation-mode / graph-expand-controls work) at the time this
 * lane runs, and `AnalysisSurface.ts` / `analysisLayout.ts` are too — three files
 * in active use by another agent in this shared tree.
 *
 * So this module REUSES the same producers `renderGraph` does —
 * `focusNeighbourhood` (the BFS itself, now carrying `hopOf` per §HILITE140
 * L-12290), `projectHierarchy`, `projectGraph`, `graphView()`, `graphFocusDepth()`
 * — through its OWN `selectionBus` subscription, rather than touching the
 * renderer. It does not re-implement the traversal (C84 EI-9: one authority per
 * concept remains `focusNeighbourhood`); it re-runs the SAME small orchestration
 * `renderGraph` already performs, which is glue, not algorithm. The one
 * intentional duplication is `_censusFamilies()` below — six lines, derived
 * entirely from `getCensus()` (the one census snapshot), copied rather than
 * imported because the original is a private, unexported function inside the
 * dirty file. Fold the two together once §DEMO141 lands.
 *
 * ⭐ WIRED, NOT MERELY AUTHORED. `engineLauncher.ts` side-effect-imports this
 * file next to `AnalysisSurface` — see the comment there. A module whose only
 * effect is `selectionBus.subscribe(...)` at load time is invisible to every
 * static check if nothing ever imports it; the import IS the wiring.
 *
 * ── WHERE THE HOP MAP GOES FROM HERE ──────────────────────────────────────────
 *
 * Emits `pryzm-analysis-related-elements` (`packages/runtime-composer/src/types.ts`
 * declares the payload shape). `InspectModeCoordinator` subscribes and forwards
 * it to `DiagnosticMaterialManager.setAnalysisRelated()`, which is a SEPARATE
 * sink from `setAnalysisSelection` — `analysisHighlightReachability.spec.ts`
 * pins the latter's call count at exactly one, and this deliberately does not
 * touch it.
 *
 * ⚠ PERFORMANCE — once per selection change, not per frame. `selectionBus`
 * fires on 'select'/'clear' only (not on the decoration events 'highlight' /
 * 'isolate' / 'focus-camera' — the same filter `InspectModeCoordinator` and
 * `AnalysisSurface` already apply), so a hover does not trigger a graph BFS.
 * ⚠ L-12124 (OPEN, §QTYHL132) — there is no equality guard anywhere in this
 * selection→paint chain, so a `select` event that reselects the SAME ids still
 * re-traverses the whole scene. This module does not fix that (out of scope
 * here) and does not make it worse: it adds ONE more producer of the same
 * shape of work the chain already does on every change, not a new per-frame or
 * per-mesh cost.
 *
 * L7 file. No THREE (P2), no rAF (P3), no `(window as any)` (P4), no store
 * writes (P6) — the only outbound call is a runtime event emit, which is intent.
 */

import { selectionBus } from '@pryzm/core-app-model';
import {
  focusNeighbourhood,
  projectHierarchy,
  type ElementFamilyResolver,
} from '@pryzm/building-graph';

import { projectGraph } from './graphReadModel';
import { getCensus, censusPlacement } from './analysisReadModel';
import { graphView, graphFocusDepth } from './graphViewState';

/**
 * The element census, as a family resolver — the SAME six lines
 * `widgetRenderers.ts`'s private `censusFamilies()` computes, from the SAME
 * `getCensus()` snapshot. See the file header for why this is copied rather
 * than imported.
 */
function _censusFamilies(): ElementFamilyResolver {
  const snap = getCensus();
  const map = new Map<string, string>();
  for (const group of snap.groups) {
    for (const rec of group.records) map.set(rec.id, group.key);
  }
  return { familyOf: (id) => map.get(id) };
}

/**
 * The current relationship view's hop-N neighbourhood of `selectedIds`, as
 * `[id, hop][]` — the SEEDS (`hop === 0`, i.e. the selection itself) excluded,
 * because those are already painted by the EXISTING selected-element highlight
 * (`setAnalysisSelection`); this is "related", never "selected again".
 *
 * Returns `[]` — never throws, never a stale value — for every honesty case
 * `renderGraph` itself refuses on: no selection, the graph unreachable, or the
 * current view empty (§SYSTEM, C71). An empty related-set is the correct,
 * honest answer in each of those cases, not a degraded one.
 */
export function computeRelatedHops(
  selectedIds: readonly string[],
): ReadonlyArray<readonly [string, number]> {
  if (selectedIds.length === 0) return [];

  const g = projectGraph(censusPlacement());
  if (g.unreachable.length > 0) return [];

  const projection = projectHierarchy(g.nodes, g.edges, graphView(), {
    families: _censusFamilies(),
    ifc: null,
  });
  if (projection.empty !== null) return [];

  const focus = focusNeighbourhood(projection, [...selectedIds], graphFocusDepth());

  const out: Array<[string, number]> = [];
  for (const [id, hop] of focus.hopOf) {
    if (hop === 0) continue; // a seed — the SELECTION, not a related element
    out.push([id, hop]);
  }
  return out;
}

function _publish(selectedIds: readonly string[]): void {
  const hops = computeRelatedHops(selectedIds);
  window.runtime?.events?.emit('pryzm-analysis-related-elements', { hops });
}

let _unsubSelection: (() => void) | null = null;

/**
 * Wire the `selectionBus` → related-hops → runtime-event chain. Idempotent —
 * a second call is a no-op, so re-importing this module (hot reload, a test
 * harness) cannot register two subscriptions that both re-publish on one click.
 */
export function initAnalysisRelatedHighlight(): void {
  if (_unsubSelection) return;
  _unsubSelection = selectionBus.subscribe((ev) => {
    // Mirrors `InspectModeCoordinator`'s own filter: 'highlight' / 'isolate' /
    // 'focus-camera' are decorations OVER the current selection and do not
    // mean the SET moved (`SelectionBus.dispatch` itself refuses to let them
    // rewrite `currentIds`) — repainting on them would recompute a hop map for
    // a selection that did not change.
    if (ev.type !== 'select' && ev.type !== 'clear') return;
    _publish(ev.type === 'clear' ? [] : selectionBus.currentIds);
  });
}

/** Test seam / teardown — drop the subscription. */
export function disposeAnalysisRelatedHighlight(): void {
  _unsubSelection?.();
  _unsubSelection = null;
}

// §HILITE140 — module-load wiring, the same shape `graphViewState.ts`'s own
// `projectScopeRegistry.register()` call at its foot already uses: importing
// this file IS what subscribes it. See `engineLauncher.ts` for the import.
initAnalysisRelatedHighlight();
