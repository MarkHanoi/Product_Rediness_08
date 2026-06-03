// @pryzm/building-graph — Unified Building Graph (UBG) core (GRAPH.1).
//
// Pure, P5-safe relational substrate: the canonical node/edge model that
// projects PRYZM's specialised graphs into one queryable surface. Adapters
// (GRAPH.2) and the visual overlay (GRAPH.3) are separate packages.
//
// Spec: docs/01-strategy/PRYZM-BUILDING-GRAPH-AND-RELATIONAL-AI-FOUNDATION.md.
// Governance: ADR-0058.

export {
  UBG_EDGE_TYPES,
  UbgEdgeTypeSchema,
  UbgNodeSchema,
  UbgEdgeSchema,
  UbgSnapshotSchema,
  type UbgEdgeType,
  type UbgNode,
  type UbgEdge,
  type UbgSnapshot,
  type UbgQuery,
  type UbgQueryResult,
} from './types.js';

export { BuildingGraph } from './BuildingGraph.js';

export type { UbgAdapter, UbgAdapterRegistry } from './adapters.js';

export { withUbgSpan, _resetTracerCache, type UbgMutationOp } from './tracing.js';
