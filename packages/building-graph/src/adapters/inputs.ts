// @pryzm/building-graph — GRAPH.2 adapter INPUT shapes.
//
// The UBG core stays P5-pure (no THREE, no DOM, no I/O) and L2-pure (no import
// of the heavy specialised services that live in higher layers). Adapters
// therefore DEPENDENCY-INJECT already-extracted plain data: the caller (the
// editor / runtime, GRAPH.2 wiring) reads each specialised service and passes
// these structurally-typed snapshots in. These interfaces deliberately mirror a
// MINIMAL subset of the real service outputs (structural typing) so the real
// objects satisfy them without importing the real types:
//
//   topology   <- TopologyLayer.getAdjacencyRelationships() / getBounds()
//                (packages/room-topology/src/TopologyLayer.ts: AdjacencyRelationship)
//   roomGraph  <- RoomGraphService.getGraph(levelId) -> RoomGraph{ nodes, edges }
//                (packages/spatial-index/src/RoomGraphService.ts: RoomNode/RoomEdge)
//   semantic   <- semanticGraphManager.getAll() -> Relationship[]
//                (packages/core-app-model/src/SemanticGraph.ts: Relationship)
//   dependency <- dependency pairs derived from SemanticGraph relationships
//                (packages/core-app-model/src/DependencyResolver.ts: RebuildTask)
//   constraint <- validation report violations
//                (packages/ai-host/src/AITypes.ts: RuleViolation / ComplianceRuleSummary)
//
// Spec: docs/01-strategy/PRYZM-BUILDING-GRAPH-AND-RELATIONAL-AI-FOUNDATION.md §3.
// Governance: ADR-0058 §4 (adapters project; idempotent).

// -- topology adapter input ----------------------------------------------------

/**
 * One spatial relationship from {@link TopologyLayer.getAdjacencyRelationships}.
 * `kind` mirrors `AdjacencyRelationship['kind']`. The topology layer is keyed by
 * element id; we do not know each element's kind here, so the adapter accepts an
 * optional `kindOf` resolver to label nodes (defaults to `element`).
 */
export interface TopologyAdjacencyInput {
  /** id of the first (source) element. */
  readonly sourceId: string;
  /** id of the second (target) element. */
  readonly targetId: string;
  /**
   * `adjacentTo` -- the two share a face/edge within tolerance (rooms, walls).
   * `intersects` -- bounding boxes overlap (treated as `bounds`: a bounding
   * element such as a wall spatially bounds the element it overlaps).
   */
  readonly kind: 'adjacentTo' | 'intersects';
}

/**
 * The plain snapshot the topology adapter projects. `relationships` is the union
 * of every element's `getAdjacencyRelationships(id)`; `kindOf` optionally maps an
 * element id to a UBG node `kind` (e.g. `wall`, `room`) so the projected nodes
 * carry vocabulary. Without it, nodes are labelled `element`.
 */
export interface TopologySnapshot {
  readonly relationships: ReadonlyArray<TopologyAdjacencyInput>;
  readonly kindOf?: (id: string) => string | undefined;
}

// -- roomGraph adapter input ---------------------------------------------------

/** A door/opening edge from {@link RoomGraphService} (`RoomEdge` subset). */
export interface RoomGraphEdgeInput {
  readonly fromRoomId: string;
  readonly toRoomId: string;
  /** the door id linking the two rooms (edge `evidence`/refs). */
  readonly doorId?: string;
  /** clear width of the connecting door, metres (becomes edge `weight`). */
  readonly doorWidth?: number;
}

/** A room node from {@link RoomGraphService} (`RoomNode` subset). */
export interface RoomGraphNodeInput {
  readonly roomId: string;
  /** opaque projected props (name, area, role...), copied onto the UBG node. */
  readonly props?: Record<string, unknown>;
}

/**
 * The plain snapshot the roomGraph adapter projects -- one level's `RoomGraph`.
 * `nodes` materialises room nodes; `edges` produces `connectsTo`. If
 * `circulationPaths` is supplied (D-TGL circulation, strategy §3), the adapter
 * also emits `circulatesVia` from each path node to the rooms it threads.
 */
export interface RoomGraphSnapshot {
  /** the level these rooms belong to (carried as a node prop). */
  readonly levelId?: string;
  readonly nodes: ReadonlyArray<RoomGraphNodeInput>;
  readonly edges: ReadonlyArray<RoomGraphEdgeInput>;
  /** optional D-TGL circulation paths threading rooms -> `circulatesVia`. */
  readonly circulationPaths?: ReadonlyArray<CirculationPathInput>;
}

/** A circulation path (corridor / route) threading an ordered list of rooms. */
export interface CirculationPathInput {
  /** stable id of the circulation node (corridor / route). */
  readonly id: string;
  /** ordered ids of the rooms this path passes via. */
  readonly viaRoomIds: ReadonlyArray<string>;
}

// -- semantic adapter input ----------------------------------------------------

/**
 * One semantic relationship from {@link SemanticGraphManager.getAll}
 * (`Relationship` subset). The adapter projects DERIVATION relations
 * (`branchedFrom`, `supersedes`, `precededBy`) to `derivesFrom`; all are
 * "A derived from B" once normalised to a single direction.
 */
export interface SemanticRelationshipInput {
  readonly sourceId: string;
  readonly targetId: string;
  /**
   * the semantic relationship type. The adapter only projects the derivation
   * family (see {@link DERIVATION_TYPES}); other types are ignored so the UBG
   * `derivesFrom` edge has a single documented meaning.
   */
  readonly type: string;
}

/** The plain snapshot the semantic adapter projects. */
export interface SemanticSnapshot {
  readonly relationships: ReadonlyArray<SemanticRelationshipInput>;
}

// -- dependency adapter input --------------------------------------------------

/**
 * One dependency edge: `dependentId` rebuilds when `dependsOnId` changes -- the
 * cascade edge {@link DependencyResolver} computes from the SemanticGraph.
 * Callers derive these from `RebuildTask`s (the affected element depends on the
 * trigger) or directly from structural relationships.
 */
export interface DependencyEdgeInput {
  /** the element that must rebuild (UBG edge `from`). */
  readonly dependentId: string;
  /** the element it depends on / rebuilds in response to (UBG edge `to`). */
  readonly dependsOnId: string;
  /** optional cascade priority (1 highest) -> edge `weight`. */
  readonly priority?: number;
}

/** The plain snapshot the dependency adapter projects. */
export interface DependencySnapshot {
  readonly edges: ReadonlyArray<DependencyEdgeInput>;
}

// -- constraint adapter input --------------------------------------------------

/**
 * One constraint violation (`RuleViolation` / `ComplianceRuleSummary` subset).
 * Projects to a `violates` edge from the offending element to a synthetic rule
 * node (`rule:{ruleId}`), so the overlay/AI can ask "what violates this rule?".
 */
export interface ConstraintViolationInput {
  /** the rule that was breached (becomes the synthetic `rule:{ruleId}` node). */
  readonly ruleId: string;
  /** the offending element (UBG edge `from`). */
  readonly elementId: string;
  /** optional human-readable rule name (rule node prop). */
  readonly ruleName?: string;
  /** optional severity (`error`, `warning`...) -> edge prop / node prop. */
  readonly severity?: string;
  /** optional violation message (edge `evidence` detail). */
  readonly message?: string;
}

/** The plain snapshot the constraint adapter projects. */
export interface ConstraintSnapshot {
  readonly violations: ReadonlyArray<ConstraintViolationInput>;
}

/**
 * SemanticGraph relationship types that mean "A was derived from B". Exposed so
 * the caller and tests share the exact filter the semantic adapter applies.
 */
export const DERIVATION_TYPES = ['branchedFrom', 'supersedes', 'precededBy'] as const;
export type DerivationType = (typeof DERIVATION_TYPES)[number];