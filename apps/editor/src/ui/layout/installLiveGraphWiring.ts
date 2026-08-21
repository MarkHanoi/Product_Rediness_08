/**
 * installLiveGraphWiring.ts — PRODUCTION wiring for the Unified Building Graph.
 *
 * Split out of `apps/editor/src/dev/installPryzmTestFunctions.ts` (2026-08-14,
 * the C74-class unguarded-dev-tools fix). These FIVE calls are NOT dev tooling —
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
 *   3. ⭐ installBuildingGraphMaintainer — L-3251, NEW. Subscribes the UBG to the
 *      StoreEventBus so it is INCREMENTALLY MAINTAINED (STR-14 §3) instead of
 *      holding the model as it stood the last time somebody opened a graph
 *      overlay (L-2131). Until this line existed, the header below said "four
 *      calls" and every one of them was an INSTALL — this function subscribed to
 *      nothing at all, which is the whole of why the graphs could not move onto
 *      the Analysis surface (ADR-0343 §D.7's binding precondition).
 *   4. installBuildingGraphOverlay — the static Building-Graph view (GRAPH.3).
 *   5. installLivingGraphOverlay — the Living Building Graph (A.21.D17),
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
import { installBuildingGraphMaintainer } from '../../engine/buildingGraphMaintainer';
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

    // ⭐ L-3251 — SUBSCRIBE THE GRAPH TO THE MODEL. Until this call, this
    // function made four install calls and subscribed to NOTHING, so the UBG
    // held the model as it stood the last time somebody opened a graph overlay
    // (L-2131; STR-14 §3 was corrected in place to say so). The maintainer
    // applies StoreEventBus deltas — retract-then-re-project, coalesced onto the
    // frame bus (P3), O(Δ) in the topology leg — and forces a full rebuild on
    // `pryzm-project-loaded`, because the bus DROPS events during project
    // switch/clear (`suppressDuring` / `discardBatch`, both declared exceptions
    // to the §9 no-drops guarantee). It also publishes
    // `window.__pryzmUbgLiveness`, so a surface rendering the graph can state
    // its freshness instead of implying one.
    installBuildingGraphMaintainer();

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
