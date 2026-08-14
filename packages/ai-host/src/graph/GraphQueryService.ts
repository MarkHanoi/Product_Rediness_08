/**
 * ## MODIFICATION DECLARATION
 *
 * Layer Affected:    AI / Graph Query (BIM 3.0 Phase 4 — the Level 5 exposure)
 * File:              packages/ai-host/src/graph/GraphQueryService.ts
 * Classification:    A (read-only projection; never mutates a store or the graph)
 *
 * Contract:
 *   docs/02-decisions/contracts/C70-BIM30-TARGET-AND-GOLDEN-CHAIN.md — D-INV-1/2/3
 *   docs/02-decisions/contracts/C71-GRAPH-AND-TOPOLOGY.md — §4 (the UBG vocabulary
 *     is the canonical QUERY vocabulary; the three graphs stay separate; §4.3 MUST
 *     NOT infer coverage across graphs).
 *   docs/03-execution/plans/BIM30-IMPLEMENTATION-ROADMAP.md — Phase 4.
 *
 * ── WHAT THIS IS ─────────────────────────────────────────────────────────────
 *
 * The read-only query surface behind the `graph.query` / `graph.neighbors` /
 * `graph.path` bus verbs (registered in
 * `apps/editor/src/engine/graphQueryBusHandlers.ts`). It answers topology
 * questions over the EXISTING healthy edges of the `SemanticGraphManager`
 * (hosts / hostedBy / boundedBy / adjacentTo / connectedTo / contains / sitsOn /
 * supports / joinedTo / part-of family) plus `RoomGraphService`'s BFS for
 * `path`. It writes nothing.
 *
 * ── THE INVARIANT THAT DEFINES PHASE 4 — FAILURE ≠ EMPTY (D-INV-1, L-INV-1) ──
 *
 * Every method returns a DISCRIMINATED result, never a bare `[]`. Four outcomes
 * are kept distinct, because conflating any two of them is the exact defect this
 * phase exists to end (RoomGraphService returning `[]` for three different
 * cases; SpeculativeEngine's dead `getEdges`):
 *
 *   • NO RESULTS      — `{ ok: true, … , [] }`. The element is genuinely in the
 *                       graph and has no such neighbour. A POSITIVE answer.
 *   • UNKNOWN ELEMENT — `{ ok: false, reason: 'unknown-element' }`. The id is not
 *                       a node of the graph at all. NOT the same value as empty.
 *   • GRAPH UNAVAILABLE — `{ ok: false, reason: 'graph-unavailable' }`. There is
 *                       no composed graph to answer over.
 *   • UNSUPPORTED RELATIONSHIP — `{ ok: false, reason: 'unsupported-relationship' }`.
 *                       A parked `RelationshipType` (the Phase-G/H/L temporal /
 *                       causal / performance / lifecycle / intent families) that
 *                       has no writer and no data. Answering it as empty would be
 *                       C71 §4.3 — inferring coverage a graph does not have.
 *   • HIERARCHY NOT IN GRAPH — `{ ok: false, reason: 'hierarchy-not-in-graph' }`.
 *                       See the block below. The graph is not the hierarchy
 *                       substrate, so it cannot answer a hierarchy question at
 *                       all — and it says so instead of returning `[]`.
 *
 * This is the `getJoinedWalls` refusal idiom (core-app-model/SemanticGraph.ts),
 * generalised to the whole query surface.
 *
 * ── ADR-0325: THE HIERARCHY FAMILIES ARE NOT THIS GRAPH'S TO ANSWER ──────────
 *
 * `partOf` / `unitOf` / `levelOf` used to sit in the supported set below, which
 * made `graph.query(roomId, 'partOf')` return a CONFIDENT `{ ok: true, targets:
 * [] }`. Measured (`check-graph-write-coverage`, C-INV-4 ledger): `partOf` has
 * **no production writer** — the only writer is the loader's reconstruction from
 * the authoritative `room.unitId` field, so the edge does not exist until a
 * reload — and `unitOf` / `levelOf` are PARKED with zero writers and zero
 * readers (C71 §2.2).
 *
 * The `unknown-element` refusal above does NOT cover this (C71 §4.4): it fires
 * only when the id is a node of NO edge at all, and a room carries
 * `boundedBy` / `adjacentTo` edges — so the room IS a node and the hierarchy
 * question got an answer nobody established. "Nobody ever wrote this edge" and
 * "this room is in no unit" were the same value: the §CONTEXT-DATA-HONESTY
 * defect, at the AI query surface, where the `[]` leaves the type system and
 * becomes English in a prompt.
 *
 * **ADR-0325 settles the prior question the C-INV-4 ledger recorded**:
 * `hierarchyStore` + `parentId` is the SOLE hierarchy substrate, and
 * `room.unitId` is the authoritative unit-containment field (shipped 806292f3).
 * Hierarchy nodes are not graph citizens. The three families therefore stay in
 * `RelationshipType` (C71 §2.4 — deleting them breaks `deserialize` on snapshot
 * v3) and stay PARKED (C71 §2.3 — parked is NOT a gap), but this surface must
 * REFUSE them and NAME the substrate that can answer.
 */

import { trace, type Tracer } from '@opentelemetry/api';
import {
  semanticGraphManager as defaultSemanticGraphManager,
  type SemanticGraphManager,
  type RelationshipType,
} from '@pryzm/core-app-model';
import { roomGraphService as defaultRoomGraphService } from '@pryzm/spatial-index';

const TRACER_NAME = '@pryzm/ai-host';
let cachedTracer: Tracer | null = null;
function tracer(): Tracer {
  cachedTracer ??= trace.getTracer(TRACER_NAME, '0.1.0');
  return cachedTracer;
}

// ── The supported (healthy) query vocabulary ─────────────────────────────────
//
// C71 §4.2 — the UBG vocabulary IS the query vocabulary, but §4.3 forbids
// inferring coverage across graphs: a parked relationship must REFUSE, not
// answer empty. These eleven are the edges with a writer and live data today
// (the SemanticGraph's Phase-D spatial/structural set + `joinedTo`, landed
// 2026-08-12). Everything else in `RelationshipType` — the Phase G/H/L temporal,
// causal, performance, lifecycle and intent families — is PARKED and answers
// `unsupported-relationship`.
//
// ⚠ `partOf` / `unitOf` / `levelOf` were removed from this set by ADR-0325 and
// moved to PARKED_HIERARCHY_RELATIONSHIPS below. Do not put them back without
// superseding that ADR: re-adding them restores a confident `[]` to a question
// this graph has never been able to answer.
const SUPPORTED_RELATIONSHIP_TYPES = new Set<RelationshipType>([
  'hosts',
  'hostedBy',
  'connectedTo',
  'adjacentTo',
  'boundedBy',
  'contains',
  'sitsOn',
  'supports',
  'joinedTo',
  'connectedByStair',
  'connectedByLift',
]);

// ── The hierarchy families — declared, PARKED, and NOT this graph's to answer ─
//
// ADR-0325. They remain `RelationshipType` members (C71 §2.4) and remain parked
// (C71 §2.3 — parked is not a gap), but they are separated from the merely
// "unsupported" families because the refusal is DIFFERENT IN KIND and the caller
// deserves the difference: a temporal family has no answer anywhere, whereas a
// hierarchy question has a precise, authoritative answer — in another substrate.
const PARKED_HIERARCHY_RELATIONSHIPS = new Set<RelationshipType>([
  'partOf',
  'unitOf',
  'levelOf',
]);

/**
 * The C78 §8.1 `UndeterminedReason` member this surface produces beside a
 * hierarchy refusal.
 *
 * NO RIVAL VOCABULARY (C78 §8.1 — the union is CLOSED at eleven members and this
 * file adds none). `RELATIONSHIP_NOT_RECORDED` is the exact member for this case
 * per its own docblock in `packages/command-bus/src/consequence.ts`: *"the
 * relationship is known to exist as a concept but no producer writes it, so
 * nothing can be traversed (`contains`, `partOf`, …)"* — it names `partOf`
 * literally.
 *
 * WHY THE MEMBER IS NAMED HERE RATHER THAN IMPORTED, and it is a restatement of
 * ONE member, never of the union: `@pryzm/command-bus` is not a declared
 * dependency of `@pryzm/ai-host`, and adding one is a manifest + lockfile change
 * that collides with concurrent work in this shared tree. This is the SAME
 * decision, for the same reason, that `packages/ai-host/src/storeReadDetermination.ts`
 * documents at its §"WHY THE UNION IS RESTATED STRUCTURALLY"; the literal is
 * pinned by `graphQueryServiceParkedHierarchy.test.ts` so a drift in the closed
 * union fails a test rather than forking silently.
 *
 * @see packages/command-bus/src/consequence.ts `UndeterminedReason` — the authority.
 */
export type GraphHierarchyUndeterminedReason = 'RELATIONSHIP_NOT_RECORDED';

/** The ways a graph read can fail to produce a positive answer. */
export type GraphRefusalReason =
  | 'graph-unavailable'
  | 'unknown-element'
  | 'unsupported-relationship'
  /**
   * ADR-0325 — a hierarchy family (`partOf` / `unitOf` / `levelOf`). The
   * SemanticGraph is not the hierarchy substrate; `hierarchyStore` + `parentId`
   * is, and `room.unitId` is the authoritative unit-containment field. This is
   * NOT "no such edge": it is "this graph cannot answer that question".
   */
  | 'hierarchy-not-in-graph';

/**
 * The refusal text for a hierarchy family — it must NAME the substrate that can
 * answer, or the refusal is a dead end and the caller re-derives the `[]`.
 */
function hierarchyRefusalDetail(verb: string, relationshipType: string): string {
  return (
    `${verb}: '${relationshipType}' is a HIERARCHY relationship and the SemanticGraph is not ` +
    `the hierarchy substrate (ADR-0325). It has no production writer, so an empty answer here ` +
    `would mean "nobody ever wrote this edge", not "no such containment" — C71 §4.4 forbids ` +
    `conflating those. Ask the authoritative substrate instead: hierarchyStore ` +
    `(getChildren / getUnits / parentId) for structure, and the room.unitId field for room→unit ` +
    `containment.`
  );
}

/** One edge as `graph.neighbors` reports it — the neighbour and HOW it is reached. */
export interface GraphNeighbor {
  readonly id: string;
  readonly relationshipType: RelationshipType;
}

/**
 * `graph.query(elementId, relationshipType)` — the typed edge set, in the exact
 * `getTargets(id, type)` sense the existing readers use (directional, source →
 * target). `{ ok: true, targets: [] }` is a positive "no such edge" answer.
 */
export type GraphQueryResult =
  | {
      readonly ok: true;
      readonly elementId: string;
      readonly relationshipType: RelationshipType;
      readonly targets: readonly string[];
    }
  | {
      readonly ok: false;
      readonly elementId: string;
      readonly relationshipType: string;
      readonly reason: GraphRefusalReason;
      readonly detail: string;
      /**
       * The C78 §8.1 classification, present ONLY on `hierarchy-not-in-graph`
       * (ADR-0325) so a consequence consumer classifies this refusal with the
       * same closed vocabulary every other producer uses.
       */
      readonly undetermined?: GraphHierarchyUndeterminedReason;
    };

/**
 * `graph.neighbors(elementId, relationshipType?)` — the adjacent elements. With
 * a type, both directions of that type; without, every supported edge touching
 * the element. `unsupported-relationship` can only arise when a type is given.
 */
export type GraphNeighborsResult =
  | {
      readonly ok: true;
      readonly elementId: string;
      readonly relationshipType: RelationshipType | 'all';
      readonly neighbors: readonly GraphNeighbor[];
    }
  | {
      readonly ok: false;
      readonly elementId: string;
      readonly relationshipType: string;
      readonly reason: GraphRefusalReason;
      readonly detail: string;
      /** See {@link GraphQueryResult} — present only on `hierarchy-not-in-graph`. */
      readonly undetermined?: GraphHierarchyUndeterminedReason;
    };

/**
 * `graph.path(fromRoomId, toRoomId)` — the room-to-room route via door edges
 * (RoomGraphService BFS). `{ ok: true, connected: false, route: [] }` is the
 * positive "both rooms exist, no doorway path between them" answer — distinct
 * from a refusal that one of the rooms is unknown.
 */
export type GraphPathResult =
  | {
      readonly ok: true;
      readonly fromRoomId: string;
      readonly toRoomId: string;
      readonly connected: boolean;
      readonly route: readonly string[];
    }
  | {
      readonly ok: false;
      readonly fromRoomId: string;
      readonly toRoomId: string;
      readonly reason: 'graph-unavailable' | 'unknown-element';
      readonly detail: string;
    };

/** The minimal `RoomGraphService` surface this service consumes (for injection). */
export interface RoomGraphLike {
  getLevelForRoom(roomId: string): string | null;
  findPath(startRoomId: string, endRoomId: string): string[];
}

export interface GraphQueryServiceDeps {
  /** The composed SemanticGraph. `null` models "no composed graph" (D-INV-1). */
  readonly graph?: SemanticGraphManager | null;
  /** The room BFS service. `null` models "no composed room graph". */
  readonly rooms?: RoomGraphLike | null;
}

/**
 * GraphQueryService — the read-only, refusal-honest projection over the composed
 * SemanticGraph and RoomGraphService. Constructed once per runtime by the bus
 * handler set; the singletons are the production default, and the `null`-able
 * deps let a probe exercise the `graph-unavailable` refusal without a graph.
 */
export class GraphQueryService {
  private readonly _graph: SemanticGraphManager | null;
  private readonly _rooms: RoomGraphLike | null;

  constructor(deps: GraphQueryServiceDeps = {}) {
    this._graph = deps.graph === undefined ? defaultSemanticGraphManager : deps.graph;
    this._rooms = deps.rooms === undefined ? defaultRoomGraphService : deps.rooms;
  }

  /** Whether the element is a node of the graph (source OR target of any edge). */
  private _isKnown(graph: SemanticGraphManager, elementId: string): boolean {
    return graph.getRelationships(elementId).length > 0;
  }

  /**
   * `graph.query` — the typed edge set for one relationship, directional
   * (source → target), matching every existing `getTargets(id, type)` reader.
   */
  query(elementId: string, relationshipType: string): GraphQueryResult {
    return tracer().startActiveSpan('pryzm.graph.query', (span): GraphQueryResult => {
      try {
        span.setAttribute('pryzm.graph.relationshipType', relationshipType);
        const graph = this._graph;
        if (graph === null) {
          return {
            ok: false,
            elementId,
            relationshipType,
            reason: 'graph-unavailable',
            detail: 'graph.query: no composed SemanticGraph is available to answer over.',
          };
        }
        // ADR-0325 — CHECKED FIRST, and deliberately BEFORE `unknown-element`:
        // the answer does not depend on whether this element is in the graph,
        // because this graph cannot answer a hierarchy question about ANY element.
        if (PARKED_HIERARCHY_RELATIONSHIPS.has(relationshipType as RelationshipType)) {
          return {
            ok: false,
            elementId,
            relationshipType,
            reason: 'hierarchy-not-in-graph',
            undetermined: 'RELATIONSHIP_NOT_RECORDED',
            detail: hierarchyRefusalDetail('graph.query', relationshipType),
          };
        }
        if (!SUPPORTED_RELATIONSHIP_TYPES.has(relationshipType as RelationshipType)) {
          return {
            ok: false,
            elementId,
            relationshipType,
            reason: 'unsupported-relationship',
            detail:
              `graph.query: '${relationshipType}' is not a supported query relationship. ` +
              `It is either not a RelationshipType or a parked family (temporal / causal / ` +
              `performance / lifecycle / intent) with no writer and no data — answering it ` +
              `empty would infer coverage the graph does not have (C71 §4.3). Supported: ` +
              `${[...SUPPORTED_RELATIONSHIP_TYPES].join(', ')}.`,
          };
        }
        if (!this._isKnown(graph, elementId)) {
          return {
            ok: false,
            elementId,
            relationshipType,
            reason: 'unknown-element',
            detail:
              `graph.query: element ${elementId} is not a node of the SemanticGraph (it is ` +
              `neither source nor target of any edge). This is NO ANSWER, not "no ${relationshipType} edges".`,
          };
        }
        const targets = graph.getTargets(elementId, relationshipType as RelationshipType);
        return { ok: true, elementId, relationshipType: relationshipType as RelationshipType, targets };
      } finally {
        span.end();
      }
    });
  }

  /**
   * `graph.neighbors` — the adjacent elements. With a `relationshipType`, both
   * directions of that type; without one, every supported edge touching the
   * element (its full immediate neighbourhood).
   */
  neighbors(elementId: string, relationshipType?: string): GraphNeighborsResult {
    return tracer().startActiveSpan('pryzm.graph.neighbors', (span): GraphNeighborsResult => {
      try {
        if (relationshipType !== undefined) {
          span.setAttribute('pryzm.graph.relationshipType', relationshipType);
        }
        const graph = this._graph;
        if (graph === null) {
          return {
            ok: false,
            elementId,
            relationshipType: relationshipType ?? 'all',
            reason: 'graph-unavailable',
            detail: 'graph.neighbors: no composed SemanticGraph is available to answer over.',
          };
        }
        // ADR-0325 — same precedence as `query`. Note the untyped call
        // (`relationshipType === undefined`) is unaffected: the neighbourhood
        // sweep below already filters to SUPPORTED_RELATIONSHIP_TYPES, so a
        // hierarchy edge left over from a load can never leak into it.
        if (
          relationshipType !== undefined &&
          PARKED_HIERARCHY_RELATIONSHIPS.has(relationshipType as RelationshipType)
        ) {
          return {
            ok: false,
            elementId,
            relationshipType,
            reason: 'hierarchy-not-in-graph',
            undetermined: 'RELATIONSHIP_NOT_RECORDED',
            detail: hierarchyRefusalDetail('graph.neighbors', relationshipType),
          };
        }
        if (
          relationshipType !== undefined &&
          !SUPPORTED_RELATIONSHIP_TYPES.has(relationshipType as RelationshipType)
        ) {
          return {
            ok: false,
            elementId,
            relationshipType,
            reason: 'unsupported-relationship',
            detail:
              `graph.neighbors: '${relationshipType}' is not a supported query relationship ` +
              `(parked family or not a RelationshipType). Answering empty would infer coverage ` +
              `the graph does not have (C71 §4.3). Supported: ` +
              `${[...SUPPORTED_RELATIONSHIP_TYPES].join(', ')}.`,
          };
        }
        if (!this._isKnown(graph, elementId)) {
          return {
            ok: false,
            elementId,
            relationshipType: relationshipType ?? 'all',
            reason: 'unknown-element',
            detail:
              `graph.neighbors: element ${elementId} is not a node of the SemanticGraph. ` +
              `This is NO ANSWER, not "has no neighbours".`,
          };
        }
        // getRelationships covers BOTH directions; map each edge to the OTHER
        // endpoint so a caller sees the neighbour, not the element itself.
        const rels = graph.getRelationships(
          elementId,
          relationshipType as RelationshipType | undefined,
        );
        const seen = new Set<string>();
        const neighbors: GraphNeighbor[] = [];
        for (const rel of rels) {
          if (relationshipType === undefined && !SUPPORTED_RELATIONSHIP_TYPES.has(rel.type)) continue;
          const other = rel.sourceId === elementId ? rel.targetId : rel.sourceId;
          if (other === elementId) continue;
          const key = `${other}|${rel.type}`;
          if (seen.has(key)) continue;
          seen.add(key);
          neighbors.push({ id: other, relationshipType: rel.type });
        }
        return {
          ok: true,
          elementId,
          relationshipType: (relationshipType as RelationshipType | undefined) ?? 'all',
          neighbors,
        };
      } finally {
        span.end();
      }
    });
  }

  /**
   * `graph.path` — the room-to-room route via door edges (RoomGraphService BFS,
   * the 20/20-tested `findPath`). Distinguishes an unknown room (a refusal) from
   * two known rooms with no doorway path (a positive `connected: false`).
   */
  path(fromRoomId: string, toRoomId: string): GraphPathResult {
    return tracer().startActiveSpan('pryzm.graph.path', (span): GraphPathResult => {
      try {
        const rooms = this._rooms;
        if (rooms === null) {
          return {
            ok: false,
            fromRoomId,
            toRoomId,
            reason: 'graph-unavailable',
            detail: 'graph.path: no composed RoomGraphService is available to answer over.',
          };
        }
        // getLevelForRoom returns null when the room is not in the RoomStore —
        // that is "unknown room", distinct from "no path". A same-id query is a
        // trivial positive answer.
        if (fromRoomId !== toRoomId) {
          if (rooms.getLevelForRoom(fromRoomId) === null) {
            return {
              ok: false,
              fromRoomId,
              toRoomId,
              reason: 'unknown-element',
              detail: `graph.path: from-room ${fromRoomId} is not a known room. NO ANSWER, not "no route".`,
            };
          }
          if (rooms.getLevelForRoom(toRoomId) === null) {
            return {
              ok: false,
              fromRoomId,
              toRoomId,
              reason: 'unknown-element',
              detail: `graph.path: to-room ${toRoomId} is not a known room. NO ANSWER, not "no route".`,
            };
          }
        }
        const route = rooms.findPath(fromRoomId, toRoomId);
        return { ok: true, fromRoomId, toRoomId, connected: route.length > 0, route };
      } finally {
        span.end();
      }
    });
  }
}

/** The supported query vocabulary, exported so a gate or probe can assert it. */
export const GRAPH_QUERY_SUPPORTED_RELATIONSHIPS: readonly RelationshipType[] = [
  ...SUPPORTED_RELATIONSHIP_TYPES,
];

/**
 * The hierarchy families this surface REFUSES (ADR-0325), exported alongside the
 * supported set so a gate or probe can assert the two are DISJOINT — which is the
 * property that stops `partOf` drifting back into "supported" and restoring the
 * confident `[]`.
 */
export const GRAPH_QUERY_PARKED_HIERARCHY_RELATIONSHIPS: readonly RelationshipType[] = [
  ...PARKED_HIERARCHY_RELATIONSHIPS,
];
