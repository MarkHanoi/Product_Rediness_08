// @pryzm/building-graph — dependency adapter (GRAPH.2).
//
// Projects PRYZM's DependencyResolver cascade edges
// (packages/core-app-model/src/DependencyResolver.ts) into the UBG: each
// "dependent rebuilds when dependsOn changes" pair -> a `dependsOn` edge
// (`dependent -> dependsOn`). DependencyResolver itself computes these from the
// SemanticGraph at runtime (RebuildTask); the caller extracts the pairs and
// passes a plain {@link DependencySnapshot}, so this package imports nothing
// from core-app-model and stays L2-/P5-pure.
//
// Idempotent (ADR-0058 §4). P8: `pryzm.ubg.project` span (ubg.adapter =
// `dependency`).

import type { BuildingGraph } from '../BuildingGraph.js';
import type { UbgAdapter } from '../adapters.js';
import type { DependencySnapshot } from './inputs.js';
import { withUbgSpan } from '../tracing.js';

/** Stable adapter name + edge `evidence` provenance. */
export const DEPENDENCY_ADAPTER_NAME = 'dependency';

/**
 * Build a dependency adapter over an already-extracted {@link DependencySnapshot}.
 * Each edge materialises both endpoint nodes (kind `element`) and a directed
 * `dependsOn` edge from the dependent element to the element it depends on, with
 * the cascade `priority` carried as the edge `weight` (lower = rebuilt earlier).
 */
export function createDependencyAdapter(snapshot: DependencySnapshot): UbgAdapter {
  return {
    name: DEPENDENCY_ADAPTER_NAME,
    project(graph: BuildingGraph): void {
      withUbgSpan(
        'project',
        () => {
          for (const edge of snapshot.edges) {
            graph.addNode({ id: edge.dependentId, kind: 'element' });
            graph.addNode({ id: edge.dependsOnId, kind: 'element' });
            graph.addEdge({
              from: edge.dependentId,
              to: edge.dependsOnId,
              type: 'dependsOn',
              ...(edge.priority !== undefined ? { weight: edge.priority } : {}),
              evidence: DEPENDENCY_ADAPTER_NAME,
            });
          }
        },
        { 'ubg.adapter': DEPENDENCY_ADAPTER_NAME },
      );
    },
  };
}