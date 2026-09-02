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
 * **ADR-0325 settled the prior question the C-INV-4 ledger recorded**:
 * `hierarchyStore` + `parentId` is the SOLE hierarchy substrate, and
 * `room.unitId` is the authoritative unit-containment field (shipped 806292f3).
 * The three families stay in `RelationshipType` (C71 §2.4 — deleting them breaks
 * `deserialize` on snapshot v3), and this surface must never answer a hierarchy
 * question with an unestablished `[]`.
 *
 * ── ADR-0328 SUPERSEDES THE `partOf` HALF: IT IS ANSWERED, BY DERIVATION ─────
 *
 * The founder ruled (2026-08-17) that hierarchy nodes ARE graph citizens and
 * that `partOf` is the **DERIVED** graph semantic over the same sole substrate:
 * *"Do not create a second independent hierarchy source of truth. Graph
 * projection should be DERIVED FROM the hierarchy store rather than maintained
 * independently."*
 *
 * ADR-0325's reasoning is not overturned — its PREMISE is. It refused `partOf`
 * because the edge lagged the field until a reload, so an answer here could not
 * be trusted. `PartOfProjection` (@pryzm/core-app-model) removes the lag by
 * re-deriving from `hierarchyStore.parentId` + `room.unitId` at the moment of
 * the read, so there is no second record TO disagree. A refusal whose only
 * justification was staleness becomes a REGRESSION once the staleness is gone
 * (§REFUSING-HALF-NEEDS-ITS-ESCAPE-HATCH), so `partOf` is answered here.
 *
 * ⚠ `unitOf` / `levelOf` are UNCHANGED — still PARKED, still refused with
 * `hierarchy-not-in-graph`. ADR-0328 unparks one family, on one consumer's
 * evidence, exactly as C71 §2.5 requires; it does not unpark by association.
 *
 * ⚠ The `partOf` answer keeps the C71 §4.4 distinction that ADR-0325 was right
 * to insist on, and gets it from the SUBSTRATE rather than from the edge set:
 * an id the substrate does not know REFUSES (`unknown-element`), an id it knows
 * with no parent answers a positive `[]`, and an unreadable room store REFUSES
 * (`hierarchy-substrate-unreadable`) instead of reporting "in no unit".
 *
 * ── L-12860: THE SIX FAMILIES THAT HAD THE FIX ALL ALONG ────────────────────
 *
 * ADR-0325/0328 closed the confident `[]` for ONE family. Six others —
 * `hosts` · `boundedBy` · `connectedTo` · `adjacentTo` · `contains` ·
 * `joinedTo` — already had refusal-bearing typed readers on
 * `SemanticGraphManager`, with live production consumers, while THIS surface
 * still answered them from the bare `getTargets` and returned `{ ok: true,
 * targets: [] }` exactly where those readers say NO ANSWER. They are now
 * ROUTED to their readers (`TYPED_TARGET_READERS`) — a routing fix, not a new
 * capability; no seventh reader was written and no refusal reason invented.
 * See the block above that table for the two families excluded on purpose.
 *
 * ── C71 §2.7 — THE DEFINITION AXIS, AND WHY IT NEEDED A SECOND TABLE ────────
 *
 * `instantiates` · `specializes` · `dependsOnDefinition` are the first families
 * this surface answers whose endpoints are NOT both element instances. They are
 * routed through `DEFINITION_AXIS_READERS`, not `TYPED_TARGET_READERS`, and the
 * separation is load-bearing rather than tidy:
 *
 *   · A `getTargets`-shaped family has ONE question. `graph.query(instanceId,
 *     'instantiates')` asks *"what is this thing?"*; `graph.query(definitionId,
 *     'instantiates')` asks *"what is placed from this?"* — the SAME family, two
 *     questions, decided by the node kind of the subject (C71 §1.5 semantic 7).
 *   · This file already REFUSED to fold a reverse traversal into `query`: the
 *     block above excludes `sitsOn` because `getElementsSittingOn` is level →
 *     elements while `getTargets(id,'sitsOn')` is element → level, and *"routing
 *     them here would SILENTLY change the direction of the answer."* That
 *     objection is about the SILENCE, and it is answered here rather than
 *     evaded: a definition-axis answer carries `direction` and `targetNodeKind`
 *     on the result, so the caller is TOLD which question was answered and what
 *     kind of ids it holds. ⛔ Do NOT extend that to the twelve instance-only
 *     families by copying this table — for them `getTargets` IS the question,
 *     and `sitsOn` stays excluded for exactly the reason it always was.
 *   · An id neither side can be established for REFUSES
 *     (`definition-axis-node-kind-undetermined`) instead of picking a direction.
 *     Guessing is the silently-wrong answer C71 §1.5 exists to prevent.
 */

import { trace, type Tracer } from '@opentelemetry/api';
import {
  semanticGraphManager as defaultSemanticGraphManager,
  partOfProjection as defaultPartOfProjection,
  DEFINITION_AXIS_RELATIONSHIP_TYPES,
  type SemanticGraphManager,
  type RelationshipType,
  type PartOfParentQuery,
  type GraphNodeKind,
  type DefinitionAxisRelationshipType,
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
// ⚠ `unitOf` / `levelOf` were removed from this set by ADR-0325 and live in
// PARKED_HIERARCHY_RELATIONSHIPS below. Do not put them back without superseding
// that ADR: re-adding them restores a confident `[]` to a question this graph
// has never been able to answer.
//
// ⚠ `partOf` IS here, and it is the one member of this set that is NOT answered
// by a raw `getTargets`. ADR-0328 makes it a DERIVED projection, so both `query`
// and `neighbors` route it through `_partOf` — which re-derives from the
// hierarchy substrate before reading. Its presence in this set is what lets it
// appear in the untyped `neighbors` sweep; it is NOT a licence to read the edge
// directly, and a future caller that does will read a value nobody refreshed.
const SUPPORTED_RELATIONSHIP_TYPES = new Set<RelationshipType>([
  'partOf',
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
  // C71 §2.7 — the definition axis. Routed through DEFINITION_AXIS_READERS, not
  // through the raw `getTargets`; membership here is what lets them appear in the
  // untyped `neighbors` sweep, exactly as the `partOf` note above records.
  ...DEFINITION_AXIS_RELATIONSHIP_TYPES,
]);

// ── The hierarchy families — declared, PARKED, and NOT this graph's to answer ─
//
// ADR-0325. They remain `RelationshipType` members (C71 §2.4) and remain parked
// (C71 §2.3 — parked is not a gap), but they are separated from the merely
// "unsupported" families because the refusal is DIFFERENT IN KIND and the caller
// deserves the difference: a temporal family has no answer anywhere, whereas a
// hierarchy question has a precise, authoritative answer — in another substrate.
//
// ⚠ ADR-0328 removed `partOf` from this set: it is now DERIVED and answerable.
// `unitOf` and `levelOf` remain, because no consumer has asked for either and
// C71 §2.5 unparks a family for a CONSUMER, never by family resemblance.
const PARKED_HIERARCHY_RELATIONSHIPS = new Set<RelationshipType>([
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

// ── L-12860 — THE DYNAMIC PATH MUST NOT BE MORE CONFIDENT THAN THE TYPED READER ─
//
// STR-06 §6-bis · C71 §4.4 · C78 §1.4 · §CONTEXT-DATA-HONESTY.
//
// THE DEFECT. Six of the supported families already HAVE a typed, refusal-bearing
// reader on `SemanticGraphManager`, each of which can say "NO ANSWER" where the
// raw edge set says `[]`:
//
//   hosts       → getHostedOpenings(wallId)     (a wall the opening writer never covered,
//                                                or a hosts/hostedBy pair broken at load)
//   boundedBy   → getBoundingWalls(roomId)      (boundary UNDETERMINED after a move/delete,
//                                                or a room no boundary writer covered)
//   connectedTo → getConnectedRooms(roomId)     (region conclusion undetermined, or no
//                                                completed detection pass over this room)
//   adjacentTo  → getAdjacentRooms(roomId)      (same two, same one conclusion)
//   contains    → getContainedElements(roomId)  (a room the furniture writer never covered)
//   joinedTo    → getJoinedWalls(wallId)        (a wall the junction flush never covered)
//
// `GraphQueryService.query` answered ALL of them through the bare
// `graph.getTargets(id, type)` and returned a CONFIDENT `{ ok: true, targets: [] }`
// EXACTLY where those readers refuse. That `[]` leaves the type system at the
// `graph.query` bus verb and becomes English in an AI prompt, where "this wall
// bounds nothing" and "I could not determine what this wall bounds" are the same
// sentence — and the model states the first with confidence. It is the same
// defect ADR-0325 fixed for `partOf`, left live for the six families that had
// the fix available all along.
//
// ⛔ THIS IS A ROUTING FIX, NOT A NEW CAPABILITY (hard stop 3). No seventh reader
// is introduced and no refusal vocabulary is invented: every reason and every
// detail string below is the reader's OWN, forwarded verbatim (C84 EI-9 — mirror
// the refusal shape exactly). Adding a reader here would be the rival; the
// readers are AUTHORED and REACHABLE (SemanticQueryEngine, WorldModelAdapter,
// WallDeleteConsequencePlanner, HierarchyTreePanel all call them) and were merely
// not COMPOSABLE through this surface.
//
// ⚠ TWO FAMILIES WITH TYPED READERS ARE DELIBERATELY EXCLUDED, because their
// reader answers a DIFFERENT QUESTION than `getTargets(id, type)` does and
// routing them here would silently change the direction of the answer:
//   · `sitsOn`   — `getElementsSittingOn(levelId)` is the REVERSE traversal
//                  (level → elements); `getTargets(id,'sitsOn')` is element → level.
//   · `hostedBy` — `getHostWall(openingId)` returns ONE host (C15 §1) and carries a
//                  `multiple-hosts` corruption refusal; folding a single-valued
//                  reader into a list-valued verb needs its own decision, not a
//                  table row. Both stay on the raw path and keep their existing
//                  behaviour, which is stated here so the omission is a NAMED
//                  unproven axis rather than an oversight.

/** A typed reader's answer, flattened to the shape this surface reports. */
type TypedTargetsOutcome =
  | { readonly ok: true; readonly targets: readonly string[] }
  | { readonly ok: false; readonly reason: string; readonly detail: string };

/**
 * The `reason` literals of the refusal half of a typed reader's result union.
 *
 * Written as a DISTRIBUTIVE CONDITIONAL rather than `Extract<T, { ok: false }>['reason']`
 * because the indexed form does not typecheck over an unconstrained parameter
 * (TS2536) — and constraining the parameter to make the index legal would have
 * restated the very shape this alias exists to read off the readers themselves.
 */
type RefusalReasonOf<T> = T extends { ok: false; reason: infer R } ? R : never;

/**
 * Every refusal reason the delegated typed readers can produce, DERIVED from
 * their own return types rather than restated as literals. A reader that grows a
 * new refusal reason widens this union automatically; a hand-copied list would
 * rot the way every other hand-copied vocabulary in this repository has.
 */
export type GraphTypedReaderRefusalReason =
  | RefusalReasonOf<ReturnType<SemanticGraphManager['getHostedOpenings']>>
  | RefusalReasonOf<ReturnType<SemanticGraphManager['getBoundingWalls']>>
  | RefusalReasonOf<ReturnType<SemanticGraphManager['getConnectedRooms']>>
  | RefusalReasonOf<ReturnType<SemanticGraphManager['getAdjacentRooms']>>
  | RefusalReasonOf<ReturnType<SemanticGraphManager['getContainedElements']>>
  | RefusalReasonOf<ReturnType<SemanticGraphManager['getJoinedWalls']>>;

/**
 * The delegation table: relationship → the typed reader that owns the question.
 * A family in this map is NEVER answered from `getTargets`; the reader decides,
 * including when it decides it cannot.
 */
const TYPED_TARGET_READERS: ReadonlyMap<
  RelationshipType,
  (graph: SemanticGraphManager, elementId: string) => TypedTargetsOutcome
> = new Map<RelationshipType, (graph: SemanticGraphManager, elementId: string) => TypedTargetsOutcome>([
  [
    'hosts',
    (g, id) => {
      const q = g.getHostedOpenings(id);
      return q.ok ? { ok: true, targets: q.openingIds } : { ok: false, reason: q.reason, detail: q.detail };
    },
  ],
  [
    'boundedBy',
    (g, id) => {
      const q = g.getBoundingWalls(id);
      return q.ok ? { ok: true, targets: q.boundingWallIds } : { ok: false, reason: q.reason, detail: q.detail };
    },
  ],
  [
    'connectedTo',
    (g, id) => {
      const q = g.getConnectedRooms(id);
      return q.ok ? { ok: true, targets: q.connectedRoomIds } : { ok: false, reason: q.reason, detail: q.detail };
    },
  ],
  [
    'adjacentTo',
    (g, id) => {
      const q = g.getAdjacentRooms(id);
      return q.ok ? { ok: true, targets: q.adjacentRoomIds } : { ok: false, reason: q.reason, detail: q.detail };
    },
  ],
  [
    'contains',
    (g, id) => {
      const q = g.getContainedElements(id);
      return q.ok ? { ok: true, targets: q.containedIds } : { ok: false, reason: q.reason, detail: q.detail };
    },
  ],
  [
    'joinedTo',
    (g, id) => {
      const q = g.getJoinedWalls(id);
      return q.ok ? { ok: true, targets: q.joinedWallIds } : { ok: false, reason: q.reason, detail: q.detail };
    },
  ],
]);

/**
 * The families this surface answers through a typed reader, exported so a gate
 * or probe can assert the routing rather than infer it.
 */
export const GRAPH_QUERY_TYPED_READER_RELATIONSHIPS: readonly RelationshipType[] = [
  ...TYPED_TARGET_READERS.keys(),
];

// ── C71 §2.7 — THE DEFINITION AXIS ──────────────────────────────────────────

/**
 * A definition-axis reader's answer. Unlike {@link TypedTargetsOutcome} it
 * carries the DIRECTION it answered in and the KIND of the ids it is handing
 * back — the seventh semantic (C71 §1.5), made observable at the surface where
 * `[]` stops being a value and becomes English in a prompt.
 */
type DefinitionAxisOutcome =
  | {
      readonly ok: true;
      readonly targets: readonly string[];
      /** `outgoing` = the subject is the edge's SOURCE; `incoming` = its TARGET. */
      readonly direction: 'outgoing' | 'incoming';
      /** What kind of thing the returned ids are. */
      readonly targetNodeKind: GraphNodeKind;
    }
  | { readonly ok: false; readonly reason: string; readonly detail: string };

/**
 * Every refusal reason the definition-axis readers can produce, DERIVED from
 * their own return types — the {@link GraphTypedReaderRefusalReason} idiom, for
 * the same reason: a reader that grows a refusal widens this automatically, and
 * a hand-copied list rots.
 */
export type GraphDefinitionAxisRefusalReason =
  | RefusalReasonOf<ReturnType<SemanticGraphManager['getInstantiatedDefinition']>>
  | RefusalReasonOf<ReturnType<SemanticGraphManager['getInstancesOfDefinition']>>
  | RefusalReasonOf<ReturnType<SemanticGraphManager['getSpecializedParent']>>
  | RefusalReasonOf<ReturnType<SemanticGraphManager['getSpecializationsOf']>>
  | RefusalReasonOf<ReturnType<SemanticGraphManager['getDefinitionDependencies']>>
  | RefusalReasonOf<ReturnType<SemanticGraphManager['getDefinitionDependents']>>;

/**
 * The refusal for an id the graph cannot place on either side of a
 * definition-axis family — so it will not guess a direction (C71 §1.5).
 */
function definitionAxisUndetermined(
  family: DefinitionAxisRelationshipType,
  elementId: string,
): DefinitionAxisOutcome {
  return {
    ok: false,
    reason: 'definition-axis-node-kind-undetermined',
    detail:
      `graph.query: '${family}' joins nodes of two different KINDS, and no coverage mark and no ` +
      `edge places ${elementId} on either side of it — so the graph cannot tell whether you are ` +
      `asking "what does this instantiate/specialize/depend on" or "what instantiates/specializes/` +
      `depends on this". This is NO ANSWER, not an empty set: picking a direction would return a ` +
      `confident list of the WRONG KIND OF ID (C71 §1.5 — a silently wrong answer, not a type error).`,
  };
}

/**
 * The definition-axis delegation table. Each entry resolves the subject's NODE
 * KIND from the graph's own declarations (the writer's coverage marks and the
 * id's position in this family's edges — never an id prefix, C71 §1.5), then
 * asks the reader that owns the question that kind can be asked.
 */
const DEFINITION_AXIS_READERS: ReadonlyMap<
  RelationshipType,
  (graph: SemanticGraphManager, elementId: string) => DefinitionAxisOutcome
> = new Map<RelationshipType, (graph: SemanticGraphManager, elementId: string) => DefinitionAxisOutcome>([
  [
    'instantiates',
    (g, id) => {
      const at = g.resolveDefinitionAxisNodeKind(id, 'instantiates');
      if (at === null) return definitionAxisUndetermined('instantiates', id);
      if (at.side === 'target') {
        // ⭐ THE ACCEPTANCE: `graph.query(<definition>, 'instantiates')` returns
        // the INSTANCES, and says so — `direction: 'incoming'`, kind `instance`.
        const q = g.getInstancesOfDefinition(id);
        return q.ok
          ? { ok: true, targets: q.instanceIds, direction: 'incoming', targetNodeKind: 'instance' }
          : { ok: false, reason: q.reason, detail: q.detail };
      }
      const q = g.getInstantiatedDefinition(id);
      return q.ok
        ? { ok: true, targets: [q.definitionId], direction: 'outgoing', targetNodeKind: 'definition' }
        : { ok: false, reason: q.reason, detail: q.detail };
    },
  ],
  [
    'specializes',
    (g, id) => {
      const at = g.resolveDefinitionAxisNodeKind(id, 'specializes');
      if (at === null) return definitionAxisUndetermined('specializes', id);
      if (at.side === 'target') {
        const q = g.getSpecializationsOf(id);
        return q.ok
          ? { ok: true, targets: q.typeIds, direction: 'incoming', targetNodeKind: 'type' }
          : { ok: false, reason: q.reason, detail: q.detail };
      }
      const q = g.getSpecializedParent(id);
      return q.ok
        ? { ok: true, targets: [q.parentId], direction: 'outgoing', targetNodeKind: q.parentKind }
        : { ok: false, reason: q.reason, detail: q.detail };
    },
  ],
  [
    'dependsOnDefinition',
    (g, id) => {
      const at = g.resolveDefinitionAxisNodeKind(id, 'dependsOnDefinition');
      if (at === null) return definitionAxisUndetermined('dependsOnDefinition', id);
      if (at.side === 'target') {
        const q = g.getDefinitionDependents(id);
        return q.ok
          ? { ok: true, targets: q.dependentIds, direction: 'incoming', targetNodeKind: 'definition' }
          : { ok: false, reason: q.reason, detail: q.detail };
      }
      const q = g.getDefinitionDependencies(id);
      return q.ok
        ? { ok: true, targets: q.dependsOnIds, direction: 'outgoing', targetNodeKind: 'definition' }
        : { ok: false, reason: q.reason, detail: q.detail };
    },
  ],
]);

/**
 * The definition-axis families, exported beside the other two vocabularies so a
 * gate or probe can assert the routing — and assert that this set is DISJOINT
 * from {@link GRAPH_QUERY_TYPED_READER_RELATIONSHIPS}, which is the property
 * that stops one of them drifting into the `getTargets` path and losing its
 * direction discriminator.
 */
export const GRAPH_QUERY_DEFINITION_AXIS_RELATIONSHIPS: readonly RelationshipType[] = [
  ...DEFINITION_AXIS_READERS.keys(),
];

/** The ways a graph read can fail to produce a positive answer. */
export type GraphRefusalReason =
  | 'graph-unavailable'
  | 'unknown-element'
  | 'unsupported-relationship'
  /**
   * L-12860 — the typed reader that owns this family refused, and its reason is
   * forwarded VERBATIM rather than flattened into a reason of this file's own.
   * See {@link GraphTypedReaderRefusalReason} and `TYPED_TARGET_READERS`.
   */
  | GraphTypedReaderRefusalReason
  /**
   * C71 §2.7 — the definition-axis reader that owns this family refused, and its
   * reason is forwarded VERBATIM. Includes
   * `definition-axis-node-kind-undetermined`, which is this axis's own refusal:
   * the graph cannot place the subject on either side of a family whose two
   * endpoints are different KINDS of thing, so it declines to guess a direction.
   * @see {@link GraphDefinitionAxisRefusalReason} and `DEFINITION_AXIS_READERS`.
   */
  | GraphDefinitionAxisRefusalReason
  /**
   * ADR-0325 — a hierarchy family (`partOf` / `unitOf` / `levelOf`). The
   * SemanticGraph is not the hierarchy substrate; `hierarchyStore` + `parentId`
   * is, and `room.unitId` is the authoritative unit-containment field. This is
   * NOT "no such edge": it is "this graph cannot answer that question".
   *
   * ⚠ ADR-0328 narrowed this to `unitOf` / `levelOf`. `partOf` is derived and
   * answered; see `hierarchy-substrate-unreadable` for its refusal.
   */
  | 'hierarchy-not-in-graph'
  /**
   * ADR-0328 — a `partOf` question whose SUBSTRATE could not be read (the room
   * store is not registered). Distinct from `hierarchy-not-in-graph`: that says
   * "this graph never answers this family", whereas this says "this family IS
   * answerable and the authority was unreachable right now". Distinct from a
   * positive `[]`, which would mean "established: in no unit"
   * (§CONTEXT-DATA-HONESTY — failure and empty are not one value).
   */
  | 'hierarchy-substrate-unreadable';

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
      /**
       * C71 §1.5 semantic 7 — WHICH QUESTION was answered, present ONLY for the
       * definition-axis families (C71 §2.7).
       *
       * OPTIONAL, and the absence is meaningful rather than lazy: the other
       * twelve families join two element instances, so `query` is directional
       * `source → target` by construction and a discriminator would be noise on
       * every one of them. The definition axis is the first family where the
       * subject's KIND decides the direction, and where a caller handed a bare
       * list genuinely cannot tell whether it holds instance ids or a definition
       * id — the measured hazard C71 §1.5 names. It is reported rather than
       * inferred, which is what separates this from the `sitsOn` folding the
       * header block refuses.
       */
      readonly direction?: 'outgoing' | 'incoming';
      /** What KIND of node the returned ids are. Present with {@link direction}. */
      readonly targetNodeKind?: GraphNodeKind;
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
       *
       * ⚠ L-12860 — the forwarded TYPED-READER refusals deliberately do NOT carry
       * one. `RELATIONSHIP_NOT_RECORDED` means "no producer writes this family";
       * `wall-unknown-to-hosts-writer` means the producer exists and has not
       * covered THIS id, which is a different member of that closed union and this
       * lane did not establish which. Naming the wrong member would be a rival
       * vocabulary wearing the right field's name, so the field is absent and the
       * reader's own `reason` + `detail` carry the account.
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
  /**
   * ADR-0328 — the DERIVED `partOf` projection over the hierarchy substrate.
   * Injected so a test can drive the substrate under the service; the
   * production default is the singleton bound to `hierarchyStore` + the
   * registered room store.
   */
  readonly partOf?: PartOfProjectionLike | null;
}

/**
 * The slice of `PartOfProjection` this surface uses. Structural on purpose: the
 * service must not be able to reach the projection's WRITER, only its
 * refusal-bearing reads and the reconcile that keeps them honest.
 */
export interface PartOfProjectionLike {
  getParentOf(elementId: string): PartOfParentQuery;
  refresh(): unknown;
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
  private readonly _partOf: PartOfProjectionLike | null;

  constructor(deps: GraphQueryServiceDeps = {}) {
    this._graph = deps.graph === undefined ? defaultSemanticGraphManager : deps.graph;
    this._rooms = deps.rooms === undefined ? defaultRoomGraphService : deps.rooms;
    this._partOf = deps.partOf === undefined ? defaultPartOfProjection : deps.partOf;
  }

  /**
   * ADR-0328 — `graph.query(id, 'partOf')`, answered by DERIVATION.
   *
   * The projection's own refusals are mapped onto this surface's vocabulary
   * rather than flattened: `element-not-in-hierarchy-substrate` is the
   * `unknown-element` case (the hierarchy authority does not know this id), and
   * `hierarchy-substrate-unreadable` is its own reason because "the authority
   * was unreachable" is not "the id is unknown".
   *
   * The `unknown-element` check the other families use is deliberately NOT
   * applied here: it asks whether the element is a node of the GRAPH, and a room
   * that is a hierarchy citizen with no edges at all would fail it while having
   * a perfectly good answer. Citizenship for this family is the substrate's
   * question, and the projection is the only thing entitled to answer it.
   */
  private _queryPartOf(elementId: string): GraphQueryResult {
    if (this._partOf === null) {
      return {
        ok: false,
        elementId,
        relationshipType: 'partOf',
        reason: 'graph-unavailable',
        detail:
          'graph.query: no composed hierarchy projection is available, so `partOf` — which is ' +
          'DERIVED from hierarchyStore + room.unitId (ADR-0328), never read raw — cannot be answered.',
      };
    }
    const answer = this._partOf.getParentOf(elementId);
    if (answer.ok) {
      return { ok: true, elementId, relationshipType: 'partOf', targets: answer.parentIds };
    }
    return {
      ok: false,
      elementId,
      relationshipType: 'partOf',
      reason:
        answer.reason === 'hierarchy-substrate-unreadable'
          ? 'hierarchy-substrate-unreadable'
          : 'unknown-element',
      undetermined: 'RELATIONSHIP_NOT_RECORDED',
      detail: answer.detail,
    };
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
        // ADR-0328 — DERIVED, so it is answered before every check below: the
        // graph's own edge set is not the authority for this family and
        // `unknown-element` would be asking the wrong store.
        if (relationshipType === 'partOf') return this._queryPartOf(elementId);
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
        // C71 §2.7 — the DEFINITION AXIS, delegated before everything below for
        // the same reason `partOf` is: the subject's NODE KIND decides which
        // question this family answers, and `unknown-element` — which only knows
        // the edge set — would pre-empt a positive answer the writer's coverage
        // mark is entitled to give (a definition created and never placed IS
        // known, and has zero instances).
        const axis = DEFINITION_AXIS_READERS.get(relationshipType as RelationshipType);
        if (axis !== undefined) {
          const answer = axis(graph, elementId);
          if (answer.ok) {
            return {
              ok: true,
              elementId,
              relationshipType: relationshipType as RelationshipType,
              targets: answer.targets,
              direction: answer.direction,
              targetNodeKind: answer.targetNodeKind,
            };
          }
          return {
            ok: false,
            elementId,
            relationshipType,
            // Narrowed, never cast — the union is derived from the readers
            // themselves, so this re-narrows a value that came from them.
            reason: answer.reason as GraphDefinitionAxisRefusalReason,
            detail: answer.detail,
          };
        }
        // L-12860 — DELEGATE before reading the raw edge set. The typed reader is
        // the authority for its family: it holds the coverage marks and the
        // undetermined marks that separate "no such edge" from "nobody ever
        // looked", and `getTargets` holds neither. Placed BEFORE `unknown-element`
        // for the same reason ADR-0328 places `partOf` there — a positive answer
        // the authority is entitled to give must not be pre-empted by a check
        // that only knows the edge set.
        const delegate = TYPED_TARGET_READERS.get(relationshipType as RelationshipType);
        if (delegate !== undefined) {
          const answer = delegate(graph, elementId);
          if (answer.ok) {
            return {
              ok: true,
              elementId,
              relationshipType: relationshipType as RelationshipType,
              targets: answer.targets,
            };
          }
          // The reader refused. An id the graph has never heard of keeps the
          // PRE-EXISTING `unknown-element` reason — that refusal is not wrong and
          // callers already branch on it — with the reader's own account appended
          // so nothing it knew is thrown away. Anything else reports the reader's
          // reason verbatim.
          if (!this._isKnown(graph, elementId)) {
            return {
              ok: false,
              elementId,
              relationshipType,
              reason: 'unknown-element',
              detail:
                `graph.query: element ${elementId} is not a node of the SemanticGraph (it is ` +
                `neither source nor target of any edge). This is NO ANSWER, not "no ${relationshipType} edges". ` +
                `The typed ${relationshipType} reader also refused: ${answer.detail}`,
            };
          }
          return {
            ok: false,
            elementId,
            relationshipType,
            // Narrowed, never cast: the map's outcome type widens `reason` to
            // `string`, and this union is derived from the readers themselves, so
            // the assertion is a re-narrowing of a value that came from them.
            reason: answer.reason as GraphTypedReaderRefusalReason,
            detail: answer.detail,
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
        // ADR-0328 — `partOf` is DERIVED, and the sweep below reads the edge
        // set directly. Reconcile it to the substrate FIRST, or this surface
        // would report a `partOf` neighbour that the hierarchy no longer holds.
        // Covers the untyped call too, which now includes `partOf` because the
        // family is in SUPPORTED_RELATIONSHIP_TYPES.
        if (
          this._partOf !== null &&
          (relationshipType === undefined || relationshipType === 'partOf')
        ) {
          this._partOf.refresh();
        }
        // ADR-0325 — same precedence as `query`. Note the untyped call
        // (`relationshipType === undefined`) is unaffected: the neighbourhood
        // sweep below already filters to SUPPORTED_RELATIONSHIP_TYPES, so a
        // parked hierarchy edge left over from a load can never leak into it.
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
        // L-12860 — an EMPTY typed sweep is the confident `[]` this fix exists to
        // stop, so it is the one case that must be checked against the reader.
        //
        // WHY THIS IS A GATE AND NOT A DELEGATION, unlike `query`: this sweep is
        // BIDIRECTIONAL and the readers are DIRECTIONAL (`getHostedOpenings` is
        // wall → openings; `neighbors(openingId,'hosts')` legitimately reports the
        // hosting wall through the reverse edge). Replacing the sweep with the
        // reader would drop the reverse half. So a NON-EMPTY sweep is left exactly
        // as it was — the defect cannot arise there, because the answer is not
        // empty — and only the empty answer is put to the reader: if the reader
        // can establish the emptiness it stands, and if the reader refuses, so
        // does this.
        //
        // ⚠ The UNTYPED sweep (`relationshipType === undefined`) is NOT gated: it
        // spans twelve families with six readers between them, and an "all" answer
        // is already refused by `unknown-element` when the element has no edges at
        // all. A per-family verdict for the untyped verb is a NAMED unproven axis,
        // not something this fix quietly asserts.
        if (relationshipType !== undefined && neighbors.length === 0) {
          const delegate = TYPED_TARGET_READERS.get(relationshipType as RelationshipType);
          if (delegate !== undefined) {
            const answer = delegate(graph, elementId);
            if (!answer.ok) {
              return {
                ok: false,
                elementId,
                relationshipType,
                reason: answer.reason as GraphTypedReaderRefusalReason,
                detail:
                  `graph.neighbors: no ${relationshipType} edge touches ${elementId} in either ` +
                  `direction, and the typed reader cannot establish that as an answer: ${answer.detail}`,
              };
            }
          }
          // C71 §2.7 — the definition axis takes the SAME gate, and needs it more
          // than the six do: an empty neighbourhood for `instantiates` is either
          // "this definition is known and nothing is placed from it" (an answer
          // C65 §3.6 must be able to state) or "nobody has ever heard of this id"
          // — and this surface is where the difference becomes a sentence in a
          // prompt. Note an id with NO definition-axis edge at all still reaches
          // here only when it holds some OTHER edge, so `unknown-element` above
          // has not already covered it.
          const axisDelegate = DEFINITION_AXIS_READERS.get(relationshipType as RelationshipType);
          if (axisDelegate !== undefined) {
            const answer = axisDelegate(graph, elementId);
            if (!answer.ok) {
              return {
                ok: false,
                elementId,
                relationshipType,
                reason: answer.reason as GraphDefinitionAxisRefusalReason,
                detail:
                  `graph.neighbors: no ${relationshipType} edge touches ${elementId} in either ` +
                  `direction, and the definition-axis reader cannot establish that as an answer: ${answer.detail}`,
              };
            }
          }
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
