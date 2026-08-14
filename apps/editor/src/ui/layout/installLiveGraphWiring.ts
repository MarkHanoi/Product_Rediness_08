/**
 * installLiveGraphWiring.ts — PRODUCTION wiring for the Unified Building Graph.
 *
 * Split out of `apps/editor/src/dev/installPryzmTestFunctions.ts` (2026-08-14,
 * the C74-class unguarded-dev-tools fix). These four calls are NOT dev tooling —
 * they are load-bearing production capabilities that only happened to ride on
 * the dev installer:
 *
 *   1. provideLiveGraphSources — attaches the live SemanticGraphManager +
 *      AIService to the UBG resolver. WITHOUT this the constraint adapter has
 *      no source and the graph's `violates` projection (rule violations as
 *      graph edges, consumed by the AI panel + graph inspectors) is silently
 *      empty in production.
 *   2. installBuildBuildingGraph — the `window.pryzmBuildBuildingGraph()`
 *      rebuild hook + `pryzm:building-graph-rebuilt` event, which BOTH graph
 *      overlays and the post-edit resync path depend on.
 *   3. installBuildingGraphOverlay — the static Building-Graph view (GRAPH.3).
 *   4. installLivingGraphOverlay — the Living Building Graph (A.21.D17),
 *      intended to supersede the static view as the primary graph UI.
 *
 * Called UNCONDITIONALLY from `mountAIArea` (AIAreaLayout.ts) — never behind
 * `import.meta.env.DEV`. The dev-only `__pryzm*` DevTools helpers live in
 * `installDevTestFunctions.ts` beside this file, behind the DEV guard.
 *
 * Idempotent: every callee overwrites the same window slots / memoised refs,
 * so a second mount is safe.
 */
import { semanticGraphManager } from '@pryzm/core-app-model';
import { aiService } from '@pryzm/ai-host';
import {
    installBuildBuildingGraph,
    provideLiveGraphSources,
} from '../../engine/buildBuildingGraph';
import { installBuildingGraphOverlay } from '../graph';
import { installLivingGraphOverlay } from '../living-graph';

/** Wire the live UBG sources + install the graph hook and both overlays. */
export function installLiveGraphWiring(): void {
    // GRAPH.2-wiring — expose `window.pryzmBuildBuildingGraph()` (read-only UBG
    // projection of the live topology/roomGraph/semantic/dependency/constraint
    // graphs) + emit `pryzm:building-graph-rebuilt` on rebuild. Provide the live
    // semantic + constraint singletons so the resolver can read them (topology +
    // roomGraph come off window directly).
    provideLiveGraphSources({ semantic: semanticGraphManager, constraint: aiService });
    installBuildBuildingGraph();

    // GRAPH.3 — the living-blob Building-Graph overlay + the
    // `window.pryzmShowBuildingGraph()` toggle hook. Reads the UBG produced
    // above (read-only) and re-renders on `pryzm:building-graph-rebuilt`.
    installBuildingGraphOverlay();

    // A.21.D17 — the Living Building Graph overlay (force-directed, physics-
    // animated, 5 relationship layers) + the `window.pryzmOpenLivingGraph()` /
    // `pryzmCloseLivingGraph()` console openers. Consumes the SAME UBG
    // (read-only) and re-syncs on `pryzm:building-graph-rebuilt`.
    installLivingGraphOverlay();
}
