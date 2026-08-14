// @pryzm/building-graph — L0 relational schema (GRAPH.1).
//
// The canonical node/edge model for the Unified Building Graph (UBG). This is
// the pure, P5-safe substrate that PROJECTS PRYZM's existing specialised graphs
// (SemanticGraph / TopologyLayer / RoomGraphService / DependencyResolver /
// ConstraintEngine / D-TGL space-syntax) into ONE queryable node/edge surface.
//
// Spec: docs/01-strategy/PRYZM-BUILDING-GRAPH-AND-RELATIONAL-AI-FOUNDATION.md §3.
// Governance: ADR-0058 (UBG as the relational substrate; specialised graphs
// become adapters/projections). No THREE, no DOM, no I/O (P5).

import { z } from 'zod';

/**
 * The closed set of typed, directed relations the UBG models — one per the
 * relational vocabulary in strategy §3. Adapters (GRAPH.2) MUST emit only
 * these edge types so the cardinality stays finite (bounded P8 span/attribute
 * space) and every relation has a documented projection source.
 *
 * | type          | projected from              | meaning |
 * |---------------|-----------------------------|---------|
 * | `bounds`      | TopologyLayer               | A spatially bounds B (wall bounds room) |
 * | `adjacentTo`  | TopologyLayer               | A is spatially adjacent to B (rooms share an edge) |
 * | `connectsTo`  | RoomGraphService            | A connects to B via a door/opening |
 * | `circulatesVia` | D-TGL circulation         | circulation from A passes via B (path/corridor) |
 * | `hostedIn`    | hosted-element graph        | A is hosted in B (door hosted in wall) |
 * | `servesZone`  | zoning / aggregates         | A serves zone B (system serves a zone) |
 * | `derivesFrom` | SemanticGraph               | A was derived from B (semantic derivation) |
 * | `dependsOn`   | DependencyResolver          | A depends on B (cascade rebuild edge) |
 * | `precededBy`  | TemporalGraph               | A was preceded by B (mutation ordering) |
 * | `violates`    | ConstraintEngine            | A violates rule/relation B (constraint breach) |
 */
export const UBG_EDGE_TYPES = [
  'bounds',
  'adjacentTo',
  'connectsTo',
  'circulatesVia',
  'hostedIn',
  'servesZone',
  'derivesFrom',
  'dependsOn',
  'precededBy',
  'violates',
] as const;

export const UbgEdgeTypeSchema = z.enum(UBG_EDGE_TYPES);

/** Typed, directed relation between two UBG nodes. */
export type UbgEdgeType = (typeof UBG_EDGE_TYPES)[number];

/**
 * A UBG node — every BIM entity (Site, Building, Level, Unit, Room, Wall, Door,
 * Window, Furniture, System…) plus abstract nodes (Zone, Circulation path),
 * keyed by the existing element id.
 *
 * - `id`    — the canonical element id (shared with the element stores).
 * - `kind`  — the node kind (e.g. `room`, `wall`, `door`, `zone`). A free
 *             string so the substrate is typology-agnostic; adapters own the
 *             vocabulary, the UBG core does not constrain it.
 * - `props` — opaque projected attributes (area, name, role…); the core never
 *             interprets these.
 * - `refs`  — optional ids this node references but does not own (e.g. a
 *             circulation node referencing the rooms it threads).
 */
export const UbgNodeSchema = z
  .object({
    id: z.string().min(1),
    kind: z.string().min(1),
    props: z.record(z.string(), z.unknown()).optional(),
    refs: z.array(z.string()).optional(),
  })
  .strict();

export type UbgNode = z.infer<typeof UbgNodeSchema>;

/**
 * A UBG edge — a directed, typed relation `from → to`.
 *
 * - `weight`   — optional relation strength (e.g. adjacency length, dependency
 *                cost); the visual overlay (GRAPH.3) reads this for emphasis.
 * - `evidence` — optional provenance string (which adapter / rule produced it),
 *                so projections are auditable.
 */
export const UbgEdgeSchema = z
  .object({
    from: z.string().min(1),
    to: z.string().min(1),
    type: UbgEdgeTypeSchema,
    weight: z.number().optional(),
    evidence: z.string().optional(),
  })
  .strict();

export type UbgEdge = z.infer<typeof UbgEdgeSchema>;

/**
 * The serialisable UBG snapshot (strategy §5) — the wire/export shape, consumed
 * by {@link BuildingGraph.toJSON}/`fromJSON` and by the relational view exported
 * alongside IFC.
 *
 * ⚠ §GR-17 — CORRECTED 2026-08-14. This comment used to read *"persists in the
 * `.pryzm` snapshot"*. **It does not, and it deliberately must not.** Measured at
 * HEAD: `apps/editor/src/engine/persistence/ProjectSerializer.ts` writes
 * `semanticGraph: semanticGraphManager.serialize()` (line 1083) and carries **no
 * `ubg` key at all** — no writer, no reader, no schema slot. The doc claimed a
 * persistence guarantee the code never made, which is the same defect class as
 * L-809/L-812: a document describing machinery that does not exist.
 *
 * THE DRIFT IS RESOLVED IN FAVOUR OF THE CODE, and the code is RIGHT:
 *
 * The UBG is a **read-only projection**, not a store. Every one of the ten edge
 * types in {@link UBG_EDGE_TYPES} is documented above with the specialised graph
 * it is projected FROM, and `apps/editor/src/engine/buildBuildingGraph.ts` states
 * the same in its header — *"we never mutate any source graph — we only read each
 * service and emit UBG nodes/edges"*. It holds **zero authored state**: there is
 * no field of a `UbgNode` or `UbgEdge` that a user or a command originates, and
 * no production write path into a `BuildingGraph` other than the five adapters.
 * `ubgSnapshotIsDerivedNotAuthored.test.ts` beside this file MEASURES that, and
 * its negative arm shows a hand-added node is DESTROYED by the next rebuild —
 * i.e. the substrate has no authored state to lose.
 *
 * Persisting a wholly-derived structure would therefore buy nothing and cost the
 * two failure modes this repository keeps paying for: a snapshot that can go
 * STALE against the sources it was projected from (and then be believed), and an
 * unread persisted key — the authored-but-unwired hazard in a new costume. The
 * sources themselves already persist or rebuild (`semanticGraph` is serialised;
 * topology, room graph, dependency and constraint state are regenerated on load),
 * so the UBG is reconstructed by calling the adapters again. That is the C70
 * I-INV-2 / `check-derived-not-authored` position, not an omission.
 *
 * IF THAT EVER CHANGES — if some future adapter lets a user author a UBG-only
 * fact that no source graph holds — this comment is wrong again and the fix is a
 * `ubg` key in `ProjectSerializer` WITH a reader, not a re-edit of this comment.
 */
export const UbgSnapshotSchema = z
  .object({
    version: z.literal(1),
    nodes: z.array(UbgNodeSchema),
    edges: z.array(UbgEdgeSchema),
  })
  .strict();

export type UbgSnapshot = z.infer<typeof UbgSnapshotSchema>;

/** Filter for {@link BuildingGraph.query}. */
export interface UbgQuery {
  /** Restrict to nodes of this kind. */
  kind?: string;
  /** Restrict the returned edges to this relation type. */
  edgeType?: UbgEdgeType;
}

/** Result of {@link BuildingGraph.query}. */
export interface UbgQueryResult {
  nodes: UbgNode[];
  edges: UbgEdge[];
}
