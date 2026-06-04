// @pryzm/building-graph — GRAPH.2 concrete adapters barrel.
//
// Re-exports the five concrete UBG adapters plus their plain dependency-injected
// input shapes. Each adapter is a factory `create<Source>Adapter(snapshot)`
// returning a {@link UbgAdapter} (the `project(graph)` contract) — the factory
// variant is used because every adapter needs its already-extracted source data
// injected so the core stays L2-/P5-pure (no import of the higher-layer
// specialised services; only plain structural inputs from `./inputs.js`).
//
// | adapter       | factory                   | edge types emitted        |
// |---------------|---------------------------|---------------------------|
// | topology      | createTopologyAdapter     | `bounds`, `adjacentTo`    |
// | roomGraph     | createRoomGraphAdapter    | `connectsTo`, `circulatesVia` |
// | semantic      | createSemanticAdapter     | `derivesFrom`             |
// | dependency    | createDependencyAdapter   | `dependsOn`               |
// | constraint    | createConstraintAdapter   | `violates`                |
//
// Governance: ADR-0058 §4 (GRAPH.2). P8: every factory's `project` emits a
// `pryzm.ubg.project` span carrying `ubg.adapter`.

export {
  createTopologyAdapter,
  TOPOLOGY_ADAPTER_NAME,
} from './topologyAdapter.js';
export {
  createRoomGraphAdapter,
  ROOM_GRAPH_ADAPTER_NAME,
} from './roomGraphAdapter.js';
export {
  createSemanticAdapter,
  SEMANTIC_ADAPTER_NAME,
} from './semanticAdapter.js';
export {
  createDependencyAdapter,
  DEPENDENCY_ADAPTER_NAME,
} from './dependencyAdapter.js';
export {
  createConstraintAdapter,
  CONSTRAINT_ADAPTER_NAME,
  ruleNodeId,
} from './constraintAdapter.js';

export {
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
} from './inputs.js';
