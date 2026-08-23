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

// GRAPH48 / ADR-0360 — ONE graph, SIX projections. A hierarchy view is a subset
// of the ten declared edge families, never a rival graph (C71 §4.1/§4.2).
export {
  disciplineOfFamily,
  ifcClassLabel,
  knownFamilies,
  DISCIPLINE_ORDER,
  DISCIPLINE_LABEL,
  DISCIPLINE_BASIS,
  type Discipline,
  type ElementFamilyResolver,
  type IfcClassResolution,
  type IfcClassResolver,
} from './discipline.js';

export {
  HIERARCHY_VIEWS,
  UNDIRECTED_FAMILIES,
  viewDef,
  familyOfNode,
  projectHierarchy,
  focusNeighbourhood,
  describeFocus,
  edgeKey,
  type HierarchyView,
  type HierarchyViewDef,
  type HierarchyProjection,
  type HierarchyOptions,
  type DisciplineBucket,
  type FamilyBucket,
  type NeighbourhoodFocus,
} from './hierarchy.js';

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
