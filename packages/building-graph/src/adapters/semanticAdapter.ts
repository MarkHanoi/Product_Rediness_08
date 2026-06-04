// @pryzm/building-graph — semantic adapter (GRAPH.2).
//
// Projects PRYZM's SemanticGraph (packages/core-app-model/src/SemanticGraph.ts)
// into the UBG: the DERIVATION family of semantic relationships
// (`branchedFrom`, `supersedes`, `precededBy`) -> `derivesFrom` edges. Only
// derivation relations are projected so the UBG `derivesFrom` edge has a single
// documented meaning ("A was derived from B"); spatial/structural relationships
// are owned by the topology + roomGraph adapters. Dependency-injected with a
// plain {@link SemanticSnapshot} (semanticGraphManager.getAll()), so this
// package imports nothing from core-app-model and stays L2-/P5-pure.
//
// Idempotent (ADR-0058 §4). P8: `pryzm.ubg.project` span (ubg.adapter =
// `semantic`).

import type { BuildingGraph } from '../BuildingGraph.js';
import type { UbgAdapter } from '../adapters.js';
import type { SemanticSnapshot } from './inputs.js';
import { DERIVATION_TYPES } from './inputs.js';
import { withUbgSpan } from '../tracing.js';

/** Stable adapter name + edge `evidence` provenance. */
export const SEMANTIC_ADAPTER_NAME = 'semantic';

const DERIVATION_SET = new Set<string>(DERIVATION_TYPES);

/**
 * Build a semantic adapter over an already-extracted {@link SemanticSnapshot}.
 *
 * For each relationship whose `type` is a derivation type, emit a `derivesFrom`
 * edge. Normalisation of direction: in SemanticGraph the derived element is the
 * SOURCE for `branchedFrom` (`variant -> origin`) and `supersedes`
 * (`new -> old`), and the TARGET for `precededBy` (`new <- old` i.e. the
 * source is the new element, target is the old it replaced). In all three the
 * NEW/derived element points at the element it derives FROM, so the source->
 * target direction already reads "derived -> origin". We keep source->target.
 */
export function createSemanticAdapter(snapshot: SemanticSnapshot): UbgAdapter {
  return {
    name: SEMANTIC_ADAPTER_NAME,
    project(graph: BuildingGraph): void {
      withUbgSpan(
        'project',
        () => {
          for (const rel of snapshot.relationships) {
            if (!DERIVATION_SET.has(rel.type)) continue;
            graph.addNode({ id: rel.sourceId, kind: 'element' });
            graph.addNode({ id: rel.targetId, kind: 'element' });
            graph.addEdge({
              from: rel.sourceId,
              to: rel.targetId,
              type: 'derivesFrom',
              evidence: `${SEMANTIC_ADAPTER_NAME}:${rel.type}`,
            });
          }
        },
        { 'ubg.adapter': SEMANTIC_ADAPTER_NAME },
      );
    },
  };
}