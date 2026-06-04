// @pryzm/building-graph — topology adapter (GRAPH.2).
//
// Projects PRYZM's TopologyLayer (packages/room-topology/src/TopologyLayer.ts)
// into the UBG: `adjacentTo` adjacency relationships -> `adjacentTo` edges, and
// `intersects` relationships -> `bounds` edges (a bounding element such as a
// wall spatially bounds the element it overlaps). The adapter is dependency-
// injected with a plain {@link TopologySnapshot} (extracted by the caller from
// TopologyLayer.getAdjacencyRelationships) so this package imports nothing from
// the L1 topology service and stays L2-/P5-pure.
//
// Idempotent (ADR-0058 §4): re-projecting the same snapshot yields the same
// graph -- nodes dedupe by id, edges by from/to/type. P8: the project boundary
// emits a `pryzm.ubg.project` span (ubg.adapter = `topology`).

import type { BuildingGraph } from '../BuildingGraph.js';
import type { UbgAdapter } from '../adapters.js';
import type { TopologySnapshot } from './inputs.js';
import { withUbgSpan } from '../tracing.js';

/** Stable adapter name + edge `evidence` provenance. */
export const TOPOLOGY_ADAPTER_NAME = 'topology';

/**
 * Build a topology adapter over an already-extracted {@link TopologySnapshot}.
 * Each adjacency relationship materialises both endpoint nodes (labelled via
 * `snapshot.kindOf`, default `element`) and one directed edge:
 *
 * - `intersects` -> `bounds` (source bounds target)
 * - `adjacentTo` -> `adjacentTo`
 *
 * Topology adjacency is symmetric; we emit a single directed edge per source
 * relationship (the caller de-dups symmetric pairs upstream, and the store
 * de-dups identical from/to/type), so re-projection is stable.
 */
export function createTopologyAdapter(snapshot: TopologySnapshot): UbgAdapter {
  return {
    name: TOPOLOGY_ADAPTER_NAME,
    project(graph: BuildingGraph): void {
      withUbgSpan(
        'project',
        () => {
          const kindOf = snapshot.kindOf ?? (() => undefined);
          for (const rel of snapshot.relationships) {
            const fromKind = kindOf(rel.sourceId) ?? 'element';
            const toKind = kindOf(rel.targetId) ?? 'element';
            graph.addNode({ id: rel.sourceId, kind: fromKind });
            graph.addNode({ id: rel.targetId, kind: toKind });
            graph.addEdge({
              from: rel.sourceId,
              to: rel.targetId,
              type: rel.kind === 'intersects' ? 'bounds' : 'adjacentTo',
              evidence: TOPOLOGY_ADAPTER_NAME,
            });
          }
        },
        { 'ubg.adapter': TOPOLOGY_ADAPTER_NAME },
      );
    },
  };
}