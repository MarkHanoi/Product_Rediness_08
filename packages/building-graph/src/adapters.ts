// @pryzm/building-graph — the adapter contract (GRAPH.1).
//
// GRAPH.2 adapters implement {@link UbgAdapter} to PROJECT a specialised graph
// into the Unified Building Graph. The UBG core does NOT replace the specialised
// graphs — adapters read them and emit UBG nodes/edges, so the specialised
// graphs become projections, not competitors (ADR-0058).
//
// This module is the INTERFACE ONLY. No implementations live here — the
// concrete adapters (and their dependencies on the specialised services) are
// GRAPH.2 and live in their own package(s) so this core stays P5-pure.

import type { BuildingGraph } from './BuildingGraph.js';

/**
 * An adapter projects ONE relational source into the UBG. GRAPH.2 will provide:
 *
 * - `topology`   — TopologyLayer → `bounds` / `adjacentTo` edges.
 * - `roomGraph`  — RoomGraphService → `connectsTo` edges (door/opening links).
 * - `semantic`   — SemanticGraph → `derivesFrom` edges.
 * - `dependency` — DependencyResolver → `dependsOn` edges.
 * - `constraint` — ConstraintEngine → `violates` edges.
 *
 * Adapters are typically driven incrementally off the StoreEventBus, but the
 * core contract is a single deterministic `project(graph)` call: read the
 * source, then `graph.addNode(...)` / `graph.addEdge(...)`. An adapter MUST be
 * idempotent — re-running `project` on the same source state yields the same
 * graph (the store de-duplicates identical nodes/edges).
 */
export interface UbgAdapter {
  /**
   * Stable adapter name (e.g. `topology`, `roomGraph`, `semantic`,
   * `dependency`, `constraint`). Used as edge `evidence` provenance and for
   * registry/diagnostics.
   */
  readonly name: string;

  /**
   * Project this adapter's source into `graph`, mutating it in place by adding
   * nodes and edges. Implementations should be deterministic and idempotent.
   */
  project(graph: BuildingGraph): void;
}

/**
 * A registry of adapters that projects all of them into a single graph. A thin
 * convenience for GRAPH.2 wiring; kept here so the contract for "run all
 * adapters" is part of the core surface. Order is preserved.
 */
export interface UbgAdapterRegistry {
  /** Register an adapter (later registrations project later). */
  register(adapter: UbgAdapter): void;
  /** Project every registered adapter into `graph`, in registration order. */
  projectAll(graph: BuildingGraph): void;
  /** The registered adapters, in registration order. */
  readonly adapters: readonly UbgAdapter[];
}
