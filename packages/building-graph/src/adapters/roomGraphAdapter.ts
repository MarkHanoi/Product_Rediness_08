// @pryzm/building-graph — roomGraph adapter (GRAPH.2).
//
// Projects PRYZM's RoomGraphService (packages/spatial-index/src/RoomGraphService.ts)
// into the UBG: room nodes + door edges -> `connectsTo`, and optional D-TGL
// circulation paths -> `circulatesVia` (strategy §3). Dependency-injected with a
// plain {@link RoomGraphSnapshot} extracted by the caller from
// RoomGraphService.getGraph(levelId), so this package imports nothing from the
// L1 spatial-index service and stays L2-/P5-pure.
//
// Idempotent (ADR-0058 §4). P8: `pryzm.ubg.project` span (ubg.adapter =
// `roomGraph`).

import type { BuildingGraph } from '../BuildingGraph.js';
import type { UbgAdapter } from '../adapters.js';
import type { RoomGraphSnapshot } from './inputs.js';
import { withUbgSpan } from '../tracing.js';

/** Stable adapter name + edge `evidence` provenance. */
export const ROOM_GRAPH_ADAPTER_NAME = 'roomGraph';

/**
 * Build a roomGraph adapter over an already-extracted {@link RoomGraphSnapshot}.
 *
 * - every `nodes[i]` -> a `room` node (props copied through; `levelId` added).
 * - every `edges[i]` -> a `connectsTo` edge fromRoom -> toRoom, `weight` =
 *   doorWidth, `evidence` = `roomGraph`, `refs` carry the door id on a thin
 *   door node so the overlay can trace the opening.
 * - every `circulationPaths[i]` -> a `circulation` node + a `circulatesVia`
 *   edge from that node to each room it threads.
 *
 * Door connectivity is bidirectional in RoomGraphService; we emit ONE directed
 * `connectsTo` per edge (from->to) and let consumers treat it symmetrically, so
 * re-projection is stable (no per-run ordering divergence).
 */
export function createRoomGraphAdapter(snapshot: RoomGraphSnapshot): UbgAdapter {
  return {
    name: ROOM_GRAPH_ADAPTER_NAME,
    project(graph: BuildingGraph): void {
      withUbgSpan(
        'project',
        () => {
          const levelProps =
            snapshot.levelId !== undefined ? { levelId: snapshot.levelId } : {};

          for (const node of snapshot.nodes) {
            graph.addNode({
              id: node.roomId,
              kind: 'room',
              props: { ...levelProps, ...(node.props ?? {}) },
            });
          }

          for (const edge of snapshot.edges) {
            graph.addEdge({
              from: edge.fromRoomId,
              to: edge.toRoomId,
              type: 'connectsTo',
              ...(edge.doorWidth !== undefined ? { weight: edge.doorWidth } : {}),
              evidence: ROOM_GRAPH_ADAPTER_NAME,
            });
            // surface the door as a thin node so the opening is addressable.
            if (edge.doorId !== undefined) {
              graph.addNode({
                id: edge.doorId,
                kind: 'door',
                refs: [edge.fromRoomId, edge.toRoomId],
              });
            }
          }

          for (const path of snapshot.circulationPaths ?? []) {
            graph.addNode({
              id: path.id,
              kind: 'circulation',
              refs: [...path.viaRoomIds],
            });
            for (const roomId of path.viaRoomIds) {
              graph.addEdge({
                from: path.id,
                to: roomId,
                type: 'circulatesVia',
                evidence: ROOM_GRAPH_ADAPTER_NAME,
              });
            }
          }
        },
        { 'ubg.adapter': ROOM_GRAPH_ADAPTER_NAME },
      );
    },
  };
}