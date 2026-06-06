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

// GRAPH.5 / A.21.D16 — human labels + element RATIONALE (pure, read-only).
export {
  humanNodeLabel,
  doorRoomPair,
  roomRelationshipSentences,
  nodeRationale,
  humanize,
  type Facade,
  type RelationshipSentence,
  type NodeRationale,
} from './rationale.js';

export type { UbgAdapter, UbgAdapterRegistry } from './adapters.js';

export { withUbgSpan, _resetTracerCache, type UbgMutationOp } from './tracing.js';

// GRAPH.2 — concrete adapters that PROJECT the specialised graphs into the UBG.
// Each is a factory returning a UbgAdapter; the input shapes are plain
// structural snapshots (no higher-layer imports), keeping the core L2-/P5-pure.
export {
  createTopologyAdapter,
  createRoomGraphAdapter,
  createSemanticAdapter,
  createDependencyAdapter,
  createConstraintAdapter,
  ruleNodeId,
  TOPOLOGY_ADAPTER_NAME,
  ROOM_GRAPH_ADAPTER_NAME,
  SEMANTIC_ADAPTER_NAME,
  DEPENDENCY_ADAPTER_NAME,
  CONSTRAINT_ADAPTER_NAME,
  DERIVATION_TYPES,
  type DerivationType,
  type TopologyAdjacencyInput,
  type TopologySnapshot,
  type RoomGraphEdgeInput,
  type RoomGraphNodeInput,
  type RoomGraphSnapshot,
  type CirculationPathInput,
  type SemanticRelationshipInput,
  type SemanticSnapshot,
  type DependencyEdgeInput,
  type DependencySnapshot,
  type ConstraintViolationInput,
  type ConstraintSnapshot,
} from './adapters/index.js';
