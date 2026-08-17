/**
 * ## MODIFICATION DECLARATION
 *
 * Layer Affected:    Core — Semantic Graph (NEW FILE)
 * Phase:             Phase D — D-1
 * Files Modified:    src/core/SemanticGraph.ts (new)
 * Classification:    A
 *
 * Contract:
 *   docs/02-decisions/contracts/03-BIM-SEMANTIC-MODEL-CONTRACT.md
 *   PRYZM_MASTER_ROADMAP_2026.md § D-1
 *
 * Impact Assessment:
 *   Store Reads:      NO — pure data structure
 *   Store Writes:     NO — pure data structure
 *   Event Bus:        NO — does not subscribe or emit
 *   Builder Calls:    NO
 *   Command Dispatch: NO
 *
 * Risk Level:   Low (pure data structure, no side effects)
 * Rationale:
 *   The SemanticGraph is the single most important architectural addition in Phase D.
 *   It provides a typed, indexed, traversable relationship store between all BIM elements.
 *   Persisted in ProjectSnapshot.semanticGraph (schema v3).
 *   Queried by DependencyResolver, WorldModelAdapter, RelationshipExplorerPanel, and IFC export.
 */

// ── Types ─────────────────────────────────────────────────────────────────────

/**
 * All valid relationship types between BIM elements.
 * Each type has a defined semantic direction (source → target).
 *
 * Bidirectional relationships (adjacentTo, connectedTo) are stored as TWO
 * directed relationships — one in each direction — so both sides are queryable.
 *
 * Phase G adds four new families:
 *   Temporal  — tracks design history and supersession
 *   Causal    — tracks compliance consequence chains
 *   Performance — links elements to measured physics results
 *   Lifecycle — tracks as-built / maintenance / decommissioning
 *   Intent    — links an element to an architect's recorded rationale
 */
export type RelationshipType =
    // ── Spatial / Structural (Phase D — original 13 types) ─────────────────
    | 'hosts'             // wall → door/window  (wall hosts an opening)
    | 'hostedBy'          // door/window → wall  (inverse of hosts)
    | 'connectedTo'       // room ↔ room via door (both directions stored)
    | 'adjacentTo'        // room ↔ room via shared wall (both directions stored)
    | 'boundedBy'         // room → wall (room is bounded by wall)
    | 'contains'          // room → furniture/equipment
    | 'sitsOn'            // wall → slab (wall sits on slab)
    | 'supports'          // slab → wall (inverse of sitsOn)
    | 'partOf'            // room → unit (room belongs to unit)
    | 'unitOf'            // unit → level
    | 'levelOf'           // level → building
    | 'servesZone'        // HVAC zone → room (future)
    | 'connectedByStair'  // floor → floor via stair
    | 'connectedByLift'   // floor → floor via lift (residential-building §4, additive peer of connectedByStair)
    // ── Wall connectivity (ADR-0321, C71 §3) ──────────────────────────────
    /**
     * `joinedTo` — wall ↔ wall via a RETAINED junction (both directions stored).
     *
     * NOT `connectedTo`: that type is room ↔ room via door and both of its
     * production readers (SemanticQueryEngine "rooms without a door",
     * WorldModelAdapter.connectedRoomIds) consume it as ROOM ids — the near-miss
     * ADR-0321 exists to prevent. Wall connectivity is a different relationship,
     * matching IFC's own split (IfcRelConnectsPathElements ≠ space connectivity).
     *
     * Writer: `WallRebuildCoordinator._flush` (via `replaceJoinedToForLevelWalls`
     * below), reading `WallFragmentBuilder.levelJunctions` — the ADR-0055 /
     * §CONNECT-3 retained junction index. Per C71 §3.4 the writer REMOVES the
     * level's existing `joinedTo` edges and re-emits at every flush: idempotency
     * alone would let a wall that STOPS joining keep a stale edge forever.
     * Metadata: `{ junctionType: 'L'|'T'|'Y'|'X'|'N-WAY', junctionDegree }`.
     * `WallJunctionRecord.id` is NEVER stored — it is a within-solve handle and
     * renumbers when walls move (C71 §3.5).
     *
     * Reader: `getJoinedWalls()` below — typed, refusal-bearing (C71 §4.4).
     *
     * Rebuild disposition (C71 §1.2 semantic 4, §3.6): REGENERATED. Deliberately
     * NOT rebuilt from the snapshot by `_rebuildSemanticGraph` — the source of
     * truth is the retained junction index, and the wall flush regenerates the
     * edges from it. `joinedTo` is therefore not persist-or-lose.
     *
     * Delete: the wall-family cascade (commit `3ee632f6`) purges every edge for
     * a deleted wall via `removeAllRelationshipsForElement` — `joinedTo`
     * included — and undo restores the purged edges verbatim.
     */
    | 'joinedTo'          // wall ↔ wall via a retained junction (both directions stored)
    // ── Temporal (Phase G) ─────────────────────────────────────────────────
    | 'precededBy'        // new element ← old element it replaced
    | 'supersedes'        // new element → old element (inverse of precededBy)
    | 'branchedFrom'      // design variant → element it was derived from
    // ── Causal (Phase G) ──────────────────────────────────────────────────
    | 'causedFailureOf'   // element whose change caused another to become non-compliant
    | 'wasMitigatedBy'    // compliance failure → the change that resolved it
    // ── Performance (Phase H) ─────────────────────────────────────────────
    | 'measuredAt'        // element → performance record node (physics result)
    | 'exceededBenchmark' // element → portfolio benchmark it exceeded
    // ── Lifecycle (Phase L) ───────────────────────────────────────────────
    | 'replacedBy'        // element → its physical replacement (as-built phase)
    | 'maintainedBy'      // element → maintenance event record
    | 'decommissionedBefore' // element that must be decommissioned before another
    // ── Intent (Phase G) ─────────────────────────────────────────────────
    | 'decidedBy';        // element → DecisionRecord (architect's rationale)

export interface Relationship {
    /** UUID — stable and immutable once created. */
    id: string;
    /** Semantic direction of the relationship. */
    type: RelationshipType;
    /** Source element ID. */
    sourceId: string;
    /** Target element ID. */
    targetId: string;
    /** Optional typed metadata (e.g. sharedWallId, doorId). */
    metadata?: Record<string, string | number | boolean>;
    /**
     * §FIX-CONNECTEDBY-EDGE-KEYING (ADR-0322) — OPTIONAL discriminator that
     * widens this edge's IDENTITY beyond `(sourceId, targetId, type)`.
     *
     * The default identity is metadata-BLIND, and that is correct for almost
     * every family: `DetectAllRoomsCommand` emits `adjacentTo` once per SHARED
     * WALL, so two rooms sharing three walls call `addRelationship` three times
     * with identical arguments and rely on the collapse; `boundedBy` is re-emitted
     * every detection cycle; `replaceJoinedToForLevelWalls` re-emits both
     * directions of every junction pair each flush. For all of those, "same two
     * endpoints, same type" IS the whole identity, and duplicate suppression is
     * the feature.
     *
     * It is WRONG for exactly one shape: an edge whose ENDPOINTS are not the
     * thing the edge is about. `connectedByStair` / `connectedByLift` join two
     * LEVELS and name the authoring stair/lift only in metadata. Two stairs
     * between the same level pair are two genuinely distinct facts, but they
     * collapse onto one edge — and then deleting either strands the survivor
     * (the defect ca0a7ce3 refused to paper over).
     *
     * Such a family passes `authoredBy: <stairId>` to say "the authoring element
     * is part of who I am". Edges that omit it keep byte-identical behaviour —
     * this is opt-in, never a global change to idempotency semantics.
     *
     * Persisted: it is part of edge identity, so it must survive
     * serialize()/deserialize() or two edges would re-collapse on reload.
     */
    authoredBy?: string;
    /** Unix timestamp (ms) when created. */
    createdAt: number;
    /** Creator identifier — 'system' for auto-detected, user ID otherwise. */
    createdBy: string;
}

/**
 * §FIX-CONNECTEDBY-EDGE-KEYING — the families whose edge identity INCLUDES the
 * authoring element. Declared here, next to the type union, so the decision is
 * visible at the point a new family is minted rather than buried in a command.
 *
 * Membership test: does the edge's (sourceId, targetId) pair identify the edge's
 * SUBJECT? For `hosts` (wall → door) it does — the door IS an endpoint. For
 * `connectedByStair` (level → level) it does not; the stair is the subject and
 * appears nowhere in the endpoints. Only the second shape belongs here.
 *
 * NOTE this list is advisory documentation, not an enforcement point:
 * `addRelationship` keys on the PRESENCE of `authoredBy`, not on membership
 * here, so a caller cannot get a silently-wrong answer by forgetting to
 * register. The list exists so the next reader can audit the shape.
 */
export const AUTHOR_KEYED_RELATIONSHIP_TYPES: readonly RelationshipType[] = [
    'connectedByStair',
    'connectedByLift',
];

// ── joinedTo (ADR-0321 / C71 §3) — writer input + reader result types ─────────

/**
 * Junction classification vocabulary, mirrored from
 * `packages/geometry-wall/src/JunctionResolverV2.ts` (`WallJunctionType`).
 * Declared locally because core-app-model sits BELOW geometry-wall in the layer
 * order and must not import upward; the ADR-0321 metadata contract pins the
 * same five literals.
 */
export type JoinedToJunctionType = 'L' | 'T' | 'Y' | 'X' | 'N-WAY';
/**
 * The runtime membership test for {@link JoinedToJunctionType}. Declared beside
 * the union so a new member cannot be added to one without the other — the
 * `satisfies` pins them together at compile time.
 */
export const JOINED_TO_JUNCTION_TYPES = ['L', 'T', 'Y', 'X', 'N-WAY'] as const satisfies readonly JoinedToJunctionType[];

/**
 * One retained junction, as the `joinedTo` writer hands it over. Deliberately
 * carries NO junction id — `WallJunctionRecord.id` is a within-solve handle
 * that renumbers when walls move and MUST NOT be stored (C71 §3.5). The stored
 * identity of an edge is the participant wall id pair plus the junction type.
 */
export interface JoinedToJunctionInput {
    readonly junctionType: JoinedToJunctionType;
    readonly junctionDegree: number;
    /** Distinct participating wall ids (≥2). */
    readonly wallIds: readonly string[];
}

/**
 * Typed result of {@link SemanticGraphManager.getJoinedWalls}. FAILURE ≠
 * EMPTINESS (C71 §4.4): `{ok:true, joinedWallIds:[]}` means "the joinedTo
 * writer has covered this wall and it joins nothing" — a positive answer.
 * `{ok:false}` means the graph cannot answer for this wall id, and names why.
 * A caller that conflates the two converts absent evidence into a PASS.
 */
export type JoinedWallsQuery =
    | {
        readonly ok: true;
        readonly wallId: string;
        readonly joinedWallIds: readonly string[];
        /**
         * §C83 §10.6 — the per-partner junction DISCRIMINATOR, carried rather
         * than discarded.
         *
         * ⚠ This reader used to return `joinedWallIds` alone, and the metadata
         * it had already loaded went in the bin one line after being read. That
         * cost more than tidiness: `WallMoveReweld` cannot tell a MUTUAL corner
         * (the two walls jointly own it — the partner must follow) from a
         * TERMINATING one (an incumbent — the partner must not move), the two
         * are geometrically the same picture, and **the only thing that
         * separates them is this metadata**. Without it the engine refused both,
         * which is L-942: production wall-moves hard-blocked.
         *
         * One entry per id in `joinedWallIds`, same order. Fields are OPTIONAL
         * because an edge written before the junction writer stamped metadata
         * has none — and **absent means "I could not determine", never "L"**
         * (C70 L-INV-1). A consumer must take its conservative branch on
         * absence, never its permissive one.
         */
        readonly junctions: readonly JoinedWallJunction[];
    }
    | {
        readonly ok: false;
        readonly wallId: string;
        readonly reason: 'wall-unknown-to-joinedTo-writer';
        readonly detail: string;
    };

/** One partner's junction discriminator, as STORED on the `joinedTo` edge. */
export interface JoinedWallJunction {
    readonly wallId: string;
    readonly junctionType?: JoinedToJunctionType;
    readonly junctionDegree?: number;
}

/**
 * §GR12-BOUNDARY-INVALIDATION (C71 §1.2 semantic 5, C79 §5.2) — the typed
 * result of {@link SemanticGraphManager.getBoundingWalls}, the refusal-bearing
 * `boundedBy` reader ("which walls bound this room?").
 *
 * FAILURE ≠ EMPTINESS (C71 §4.4), and here the failure has TWO distinct
 * shapes that call for different repairs:
 *
 *   `boundary-undetermined-after-element-move` — a bounding element of this
 *     room MOVED and no re-derivation (room detection) has run since. This is
 *     C79 §5.2's **`undetermined`** recomputation state made representable for
 *     the boundary layer: the edges were removed by the move-time invalidation
 *     writer, and answering `[]` here would collapse `undetermined` into a
 *     confident "bounded by nothing" — the §5.2.1 defect. The C78 §8.1 member
 *     this maps to on the consequence path is `STALE_DERIVED_STATE` (the
 *     derived state is known out-of-date; an answer would be a guess); the
 *     graph channel keeps its own kebab union per C78 §8.2 (`graph-unavailable`
 *     row note) and the `getJoinedWalls` precedent.
 *
 *   `boundary-undetermined-after-element-delete` — §GR12-DELETE-INVALIDATION.
 *     A bounding element of this room was DELETED. Distinct from the move
 *     member, and NOT a cosmetic split: after a move the element MIGHT still
 *     bound the room, after a delete it PROVABLY cannot, and a reason string
 *     saying "moved" about a deletion would be a false name for the cause —
 *     the same two-facts-one-value defect this reader exists to prevent,
 *     committed inside the refusal itself (C79 §5.2 requires the reason be
 *     NAMED, not merely present). Maps to the same C78 §8.1 member,
 *     `STALE_DERIVED_STATE`; the repair is the same re-derivation. What the
 *     split buys a consumer is the ability to say *"the wall you deleted left
 *     this room un-enclosed"* rather than a generic staleness notice.
 *
 *   `room-unknown-to-boundedBy-writer` — the graph holds no `boundedBy` edge
 *     from this id and no undetermined mark: the id is not a room, or the
 *     boundary writers never covered it (C78 §8.1 `RELATIONSHIP_NOT_RECORDED`).
 *
 * There is no legitimate empty success: a detected room is bounded by ≥1
 * elements by construction, so zero edges is always one of the three refusals.
 */
export type BoundingWallsQuery =
    | { readonly ok: true; readonly roomId: string; readonly boundingWallIds: readonly string[] }
    | {
        readonly ok: false;
        readonly roomId: string;
        readonly reason: BoundaryUndeterminedReason | 'room-unknown-to-boundedBy-writer';
        readonly detail: string;
    };

/**
 * §GR12-DELETE-INVALIDATION — the named causes of C79 §5.2 `undetermined` on the
 * boundary layer. Declared as its own union because the MARK stores it (see
 * `_boundaryUndetermined`) and {@link getBoundingWalls} re-emits it verbatim:
 * one place to add a cause, and no way to mark with a code the reader cannot
 * report.
 */
export type BoundaryUndeterminedReason =
    | 'boundary-undetermined-after-element-move'
    | 'boundary-undetermined-after-element-delete';

/**
 * §SITSON-REVERSE-READER (C71 §2.1 #5, ADR-0320) — the typed result of
 * {@link SemanticGraphManager.getElementsSittingOn}, the REVERSE `sitsOn`
 * traversal (`level → the elements that sit on it`).
 *
 * `sitsOn` was the widest write-only family in the estate — eighteen writers
 * across every element kind, zero typed readers — and C71 §0 names it as THE
 * defect this contract was written about. The writer was never the gap. This
 * type exists so the gap closes with a CONSUMER, not with a call site added to
 * satisfy a gate (C71 §2.5).
 *
 * FAILURE ≠ EMPTINESS (C71 §4.4). `{ok:true, elementIds:[]}` means "this id is
 * a level the graph knows about and nothing sits on it" — a positive answer a
 * caller may act on. `{ok:false}` means the graph holds NO edge of ANY kind
 * touching this id, so it cannot distinguish "an empty level" from "a level the
 * `sitsOn` writers never covered" (an id that is not a level; a project loaded
 * from a pre-graph snapshot before the rebuild ran). A caller that conflates
 * the two turns absent evidence into a PASS — which, for the level-delete
 * guard, means deleting a populated level.
 */
export type SittingOnQuery =
    | { readonly ok: true; readonly levelId: string; readonly elementIds: readonly string[] }
    | {
        readonly ok: false;
        readonly levelId: string;
        readonly reason: 'level-unknown-to-sitsOn-writers';
        readonly detail: string;
    };

/**
 * §HOSTEDBY-REVERSE-READER (C71 §2.1 #1, ADR-0320) — the typed result of
 * {@link SemanticGraphManager.getHostWall}, the REVERSE `hosts`/`hostedBy`
 * traversal (`opening → the wall that hosts it`).
 *
 * `hosts` has had typed readers since Phase D; `hostedBy` — its inverse, the
 * half written on every opening creation and rebuilt on every load — had none.
 * The reference-shape PAIR (C71 §2.1 row 1) was half-read, and every consumer
 * needing the reverse direction did a linear scan of the wall store instead.
 *
 * FAILURE ≠ EMPTINESS (C71 §4.4), and here the distinction is sharper than for
 * `sitsOn`: a hosted element has EXACTLY ONE host by contract (C15 §1), so
 * there is no legitimate empty success. `{ok:false}` names WHICH of the two
 * failures occurred — `opening-unknown-to-hostedBy-writer` (no edge; the id is
 * not an opening, or the edge was never written) versus `multiple-hosts`
 * (a corrupt edge set — the graph holds two hosts for one opening, and picking
 * one would be a coin flip dressed as a determination).
 */
export type HostWallQuery =
    | { readonly ok: true; readonly openingId: string; readonly wallId: string }
    | {
        readonly ok: false;
        readonly openingId: string;
        readonly reason: 'opening-unknown-to-hostedBy-writer' | 'multiple-hosts';
        readonly detail: string;
    };

/**
 * §HOSTS-FORWARD-READER (C71 §2.1 #1, §4.4 · C78 §1.4 / §5.2) — the typed result
 * of {@link SemanticGraphManager.getHostedOpenings}, the FORWARD `hosts`
 * traversal (`wall → the openings it hosts`).
 *
 * This closes the second half of C71 §2.1 row 1, "the reference-shape PAIR".
 * `hostedBy` gained {@link HostWallQuery} / `getHostWall`; `hosts` — the half
 * written in the SAME statement pair by both writers (`CreateWallOpeningCommand`
 * and `rebuildSemanticGraphFromSnapshot`) — was still read exclusively through
 * bare `getTargets(wallId, 'hosts')`, which returns `[]` for BOTH "this wall
 * hosts nothing" and "I have never heard of this wall". C78 §1.4 forbids
 * inferring DETERMINED-unaffected from that value, so every consequential
 * operation asking "what does this wall host?" inherited the forbidden
 * inference no matter how well its planner was composed.
 *
 * FAILURE ≠ EMPTINESS (C71 §4.4). `{ok:true, openingIds:[]}` means "the `hosts`
 * writer has covered this wall and it hosts nothing" — a positive answer a
 * caller may act on. The two refusals are NAMED separately because they call
 * for different repairs:
 *
 *   `wall-unknown-to-hosts-writer` — no `hosts` edge from this id and no
 *     coverage mark. The id may not be a wall; the wall may have been created
 *     but never had an opening written to it; or the project was restored by
 *     `deserialize` and no writer has run since (see `_hostsCovered` for why
 *     that mark is derived-not-serialized). C78 §8.1's
 *     `RELATIONSHIP_NOT_RECORDED` is the consequence-path member this maps to.
 *
 *   `hosts-hostedBy-pair-broken` — a `hosts` edge exists whose INVERSE
 *     `hostedBy` edge does not point back to this wall. Both writers emit the
 *     two halves together, and {@link SemanticGraphManager.removeAllRelationshipsForElement}
 *     purges them together, so a half-pair is not a state either writer can
 *     produce — but `deserialize` drops malformed rows INDIVIDUALLY and
 *     continues (see {@link SemanticGraphLoadResult}), so one bad row in a
 *     saved slice is a live production path to exactly this shape. It is a
 *     refusal rather than a filtered-down success because the two halves of the
 *     reference pair would otherwise answer the same physical question
 *     differently while both looked confident: `getHostedOpenings(W)` would say
 *     "W hosts D" while `getHostWall(D)` refused or named another wall. C79
 *     §5.3's rule applies — the element-level state is the WORST of its edges,
 *     so a partially-corrupt edge set yields no confident partial answer.
 */
export type HostedOpeningsQuery =
    | { readonly ok: true; readonly wallId: string; readonly openingIds: readonly string[] }
    | {
        readonly ok: false;
        readonly wallId: string;
        readonly reason: 'wall-unknown-to-hosts-writer' | 'hosts-hostedBy-pair-broken';
        readonly detail: string;
    };

/**
 * Plain-JSON serialisation of the SemanticGraph.
 * Stored in ProjectSnapshot.semanticGraph.
 */
export interface SemanticGraph {
    version: number;
    relationships: Relationship[];
}

/**
 * §GR10-DESERIALIZE-DROP-REPORT — WHY a serialized relationship row did not
 * become an edge. A CLOSED union: every reason a row can fail to load is named
 * here, so a caller can branch on the cause instead of parsing prose.
 *
 * `duplicate-id` is on the list because the old `_rels.set(rel.id, rel)` made a
 * repeated id a SILENT overwrite — two rows in, one edge out, and the loader
 * logged the INPUT length as if both had survived.
 */
export type RelationshipDropReason =
    | 'not-an-object'
    | 'missing-id'
    | 'missing-type'
    | 'missing-sourceId'
    | 'missing-targetId'
    | 'duplicate-id';

/**
 * A serialized row the load REFUSED, named rather than silently discarded.
 *
 * `index` is carried because it is the only stable handle a row without an id
 * has: "row 4 of the slice" is reproducible against the saved file, which is
 * exactly what C71 §5.7 says a self-erasing defect denies its investigator.
 */
export interface DroppedRelationshipRow {
    /** Position in `SemanticGraph.relationships` — always available. */
    readonly index: number;
    /** The row's id, or null when it carried none. */
    readonly id: string | null;
    /** The row's declared type as it appeared, or null when it carried none. */
    readonly type: string | null;
    readonly reason: RelationshipDropReason;
    /** Human-readable amplification. Never the machine-readable channel. */
    readonly detail: string;
}

/**
 * §GR10-DESERIALIZE-DROP-REPORT (C71 §5.7 · C70 L-INV-1 / I-INV-3) — the typed
 * outcome of {@link SemanticGraphManager.deserialize}.
 *
 * The method used to return `void`, discard every unusable row, and leave the
 * graph's `size` as the sole observable. That made three different facts one
 * value: a project that genuinely had N edges, a project that had N+M and lost
 * M at load, and a project whose graph slice was unreadable altogether. Every
 * graph measurement in this programme is taken AFTER a load, so that collision
 * turned every edge count into an unknown understatement.
 *
 * FAILURE ≠ EMPTINESS (C70 L-INV-1). `absent` is non-null only when the slice
 * itself could not be read; `dropped: []` means "every row loaded", never "I did
 * not look". A malformed row is NEVER fatal — refusing to open a project because
 * one edge is broken is a worse product than dropping it. The requirement is
 * that the drop be VISIBLE and COUNTED. Report, then continue.
 *
 * Also STORED, not merely returned: see {@link SemanticGraphManager.lastLoadReport}.
 * A caller reading `size` five minutes after the load can still ask what the load
 * refused.
 */
export interface SemanticGraphLoadResult {
    /** Rows that became edges. Equal to `size` immediately after the load. */
    readonly loaded: number;
    /** Rows presented by the slice — `loaded + dropped.length` by construction. */
    readonly presented: number;
    /** Every refused row, NAMED. Never a bare count (C70 §L-INV-3). */
    readonly dropped: readonly DroppedRelationshipRow[];
    /**
     * Non-null when the SLICE could not be read at all, so `loaded: 0` means
     * "nothing was readable", not "this project has no relationships".
     * `no-slice` — nothing was passed (a v1/v2 snapshot).
     * `relationships-not-an-array` — the key exists and is the wrong shape.
     */
    readonly absent: 'no-slice' | 'relationships-not-an-array' | null;
}

// ── Manager ───────────────────────────────────────────────────────────────────

/**
 * SemanticGraphManager — the core relationship store.
 *
 * All lookups are O(1) or O(k) where k = result set size, via three indices:
 *   _rels        — id → Relationship
 *   _bySource    — sourceId → Set<rel id>
 *   _byTarget    — targetId → Set<rel id>
 *
 * Thread safety: single-threaded browser environment — no locking required.
 */
export class SemanticGraphManager {
    private readonly _rels      = new Map<string, Relationship>();
    private readonly _bySource  = new Map<string, Set<string>>();
    private readonly _byTarget  = new Map<string, Set<string>>();

    /**
     * §GR10-DESERIALIZE-DROP-REPORT — what the last `deserialize` refused.
     * `null` until a slice is loaded, and reset by {@link clear} so a project
     * switch never lets one project's load report describe another's graph.
     */
    private _lastLoadReport: SemanticGraphLoadResult | null = null;

    /**
     * ADR-0321 — wall ids the `joinedTo` writer has made a DEFINITIVE statement
     * about (they were on a level whose flush ran against a refreshed junction
     * index). This is what lets {@link getJoinedWalls} distinguish "covered,
     * joins nothing" (a positive empty answer) from "the writer has never seen
     * this id" (a refusal). Derived state, never serialized: on load it is
     * empty until the first wall flush regenerates it — matching the type's
     * REGENERATED rebuild disposition (C71 §3.6).
     */
    private readonly _joinedToCovered = new Set<string>();

    /**
     * §HOSTS-FORWARD-READER (C71 §2.1 #1) — wall ids the `hosts` writer has made
     * a DEFINITIVE statement about. This is what lets
     * {@link getHostedOpenings} distinguish "covered, hosts nothing" (a positive
     * empty answer) from "the writer has never seen this id" (a refusal), which
     * bare `getTargets(wallId, 'hosts')` cannot: it returns `[]` for both.
     *
     * MAINTAINED AT THE WRITER (C71 §3.4), which for this family is
     * {@link addRelationship} itself — every `hosts` edge is written through it
     * by both writers (`CreateWallOpeningCommand` and
     * `rebuildSemanticGraphFromSnapshot`), so there is no second call site to
     * keep in step and no way to write the edge without marking the wall.
     * Contrast `_joinedToCovered`, whose writer is a per-level flush and so
     * needs its own explicit marking pass.
     *
     * WHY THE MARK OUTLIVES THE EDGES, and why that is the whole point: when a
     * wall's LAST opening is deleted, the cascade purges the edge keyed on the
     * OPENING id, so the wall keeps its mark and the reader answers
     * `{ok:true, openingIds:[]}` — "this wall is known and now hosts nothing".
     * Without the mark that case is indistinguishable from an unknown id, and
     * the delete would silently downgrade a determined answer to an undetermined
     * one. Deleting the WALL does clear it (see
     * {@link removeAllRelationshipsForElement}) — a dead id is *unknown*, not
     * "covered, hosts nothing".
     *
     * Derived state, never serialized — same disposition as `_joinedToCovered`.
     * A graph restored by {@link deserialize} (which writes the indices directly
     * and never goes through `addRelationship`) has no marks until a writer
     * runs. That is honest rather than unfortunate: a wall whose `hosts` edges
     * came back from a slice still answers through the EDGE branch, and a wall
     * with no edges genuinely cannot be told from an id that is not a wall.
     */
    private readonly _hostsCovered = new Set<string>();

    /**
     * §GR12-BOUNDARY-INVALIDATION (C71 §1.2 semantic 5, C79 §5.2) — room ids
     * whose boundary conclusion is **`undetermined`**: a bounding element
     * moved, or was deleted, and no re-derivation (room detection) has run
     * since. Value = the named CAUSE plus its prose (C79 §5.2 says the reason
     * MUST be named), keyed on the durable room id, never on a transient
     * handle.
     *
     * Populated by {@link invalidateRegionConclusionsForMovedElement} (the
     * move-time invalidation writer) and
     * {@link invalidateRegionConclusionsForDeletedElement} (§GR12-DELETE-
     * INVALIDATION, the delete-time one); cleared the moment a fresh
     * `boundedBy` edge is written for the room (the detection writer's re-emit
     * IS the re-derivation), or when the room itself leaves the graph
     * ({@link removeAllRelationshipsForElement} — a dead id is *unknown*, not
     * undetermined). Read by {@link getBoundingWalls}, which refuses rather
     * than answering `[]` while a room is marked (C71 §4.4 / §7.h; C79 §5.2.1
     * — `undetermined` must never collapse into `preserved`).
     *
     * The cause is stored rather than folded into one prose string so the
     * reader can emit a machine-readable code that MATCHES what happened: a
     * delete reported as `…-after-element-move` would be a false name in the
     * refusal itself.
     *
     * Derived state, never serialized — same disposition as `_joinedToCovered`.
     */
    private readonly _boundaryUndetermined = new Map<
        string,
        { readonly reason: BoundaryUndeterminedReason; readonly detail: string }
    >();

    // ── Mutation ──────────────────────────────────────────────────────────────

    /**
     * Add a relationship to the graph.
     * If an identical relationship already exists it is returned unchanged
     * (idempotent insert).
     *
     * IDENTITY is `(sourceId, targetId, type)` — metadata-blind — UNLESS the
     * caller supplies {@link Relationship.authoredBy}, in which case identity is
     * `(sourceId, targetId, type, authoredBy)`. See the `authoredBy` doc comment
     * for why the default is right for nearly every family and wrong for the
     * level↔level circulation edges (§FIX-CONNECTEDBY-EDGE-KEYING).
     *
     * The two keyings do not interfere. An `authoredBy` insert never matches an
     * unkeyed edge and an unkeyed insert never matches a keyed one, so a caller
     * that does not pass the field gets byte-identical behaviour to before.
     *
     * @returns The ID of the relationship (existing or newly created).
     */
    addRelationship(rel: Omit<Relationship, 'id' | 'createdAt'>): string {
        // §GR12-BOUNDARY-INVALIDATION — a fresh `boundedBy` write for a room IS
        // the re-derivation the undetermined mark was waiting for (the detection
        // writer re-emits the whole conclusion per room), so the mark clears
        // here, at the writer, not in a follow-up (C71 §3.4 shape). Runs before
        // the idempotency guard on purpose: a re-derivation that reproduces an
        // existing edge byte-identically is still a re-derivation.
        if (rel.type === 'boundedBy') this._boundaryUndetermined.delete(rel.sourceId);

        // §HOSTS-FORWARD-READER — writing a `hosts` edge IS the writer's
        // definitive statement about this wall, so the coverage mark is taken
        // here rather than in a follow-up (C71 §3.4). Before the idempotency
        // guard on purpose: a re-emit of an existing edge is still a statement,
        // and a wall whose only opening edge already existed must not be left
        // unmarked by the early return below.
        if (rel.type === 'hosts') this._hostsCovered.add(rel.sourceId);

        // Idempotency guard — don't duplicate the same logical relationship
        const existing = this._findExact(rel.sourceId, rel.targetId, rel.type, rel.authoredBy);
        if (existing) return existing.id;

        const id = crypto.randomUUID();
        const full: Relationship = { ...rel, id, createdAt: Date.now() };

        this._rels.set(id, full);
        this._addToIndex(this._bySource, rel.sourceId, id);
        this._addToIndex(this._byTarget, rel.targetId, id);

        return id;
    }

    /**
     * Remove a single relationship by its ID.
     * No-op if the ID does not exist.
     */
    removeRelationship(id: string): void {
        const rel = this._rels.get(id);
        if (!rel) return;

        this._removeFromIndex(this._bySource, rel.sourceId, id);
        this._removeFromIndex(this._byTarget, rel.targetId, id);
        this._rels.delete(id);
    }

    /**
     * Remove ALL relationships where the element is either source OR target.
     * Called by DeleteWallCommand, etc.
     *
     * §GR12-DELETE-INVALIDATION — this is also THE delete chokepoint for the
     * boundary layer. It runs {@link invalidateRegionConclusionsForDeletedElement}
     * FIRST, before the purge destroys the evidence of which rooms named this
     * element. Placing it here rather than in each command is deliberate: this
     * method is the single call every delete path already makes, and
     * `tools/rac-conformance/certification/gates/check-graph-delete-integrity.ts`
     * ARM A already fails any element kind whose delete path does not call it.
     * The delete-time invalidation therefore inherits that gate's coverage
     * instead of needing a second, parallel one (C71 §3.4 — clear derived state
     * at the writer).
     */
    removeAllRelationshipsForElement(elementId: string): void {
        // MUST precede the purge: it reads `getSources(elementId, 'boundedBy')`,
        // which the purge below is about to empty.
        this.invalidateRegionConclusionsForDeletedElement(elementId);

        const toRemove = new Set<string>();

        // Collect all rel IDs where element is source
        const sourceSet = this._bySource.get(elementId);
        if (sourceSet) for (const id of sourceSet) toRemove.add(id);

        // Collect all rel IDs where element is target
        const targetSet = this._byTarget.get(elementId);
        if (targetSet) for (const id of targetSet) toRemove.add(id);

        for (const id of toRemove) this.removeRelationship(id);

        // ADR-0321 — a deleted element is UNKNOWN to the joinedTo writer again,
        // not "covered, joins nothing". If the delete is undone, the cascade
        // (3ee632f6) restores the purged edges verbatim, so getJoinedWalls
        // answers through the edge branch; a joinless wall stays a refusal
        // until the next flush covers it — honest, per C71 §4.4.
        this._joinedToCovered.delete(elementId);

        // §HOSTS-FORWARD-READER — a deleted WALL is unknown to the hosts writer
        // again, not "covered, hosts nothing": getHostedOpenings must refuse for
        // a dead id. Keyed on `elementId`, so deleting an OPENING never clears
        // its host wall's mark — that is precisely the case the mark exists for
        // (the wall is still known; it now hosts nothing). Same disposition as
        // `_joinedToCovered` above.
        this._hostsCovered.delete(elementId);

        // §GR12-BOUNDARY-INVALIDATION — a room whose every edge is purged
        // (deleted, or replaced by a detection cycle) is UNKNOWN again, not
        // undetermined: `getBoundingWalls` must refuse with
        // `room-unknown-to-boundedBy-writer`, not with a stale move mark for a
        // dead id. Mirrors the `_joinedToCovered` disposition above.
        this._boundaryUndetermined.delete(elementId);
    }

    /**
     * ADR-0321 / C71 §3.4 — the `joinedTo` write, as ONE operation:
     * remove every existing `joinedTo` edge touching a wall on this level,
     * then re-emit from the retained junction index. Called by the level
     * flush (`WallRebuildCoordinator._flush`) AFTER the ADR-0055 V2 cache
     * refresh, and ONLY when the junction index answered without a refusal —
     * a refusal is NOT zero junctions, and the caller must not invoke this
     * on one.
     *
     * Remove-and-re-emit is deliberate: `addRelationship` idempotency alone
     * lets a wall that STOPS joining keep its stale edge forever (C71 §7.e).
     * Removal keys off level membership (source OR target in `levelWallIds`),
     * so an edge whose partner was deleted this cycle is still swept via its
     * surviving endpoint.
     *
     * Emits BOTH directions per participant pair, with
     * `metadata: { junctionType, junctionDegree }`, `createdBy: 'system'`.
     * No junction record id is ever stored (C71 §3.5).
     */
    replaceJoinedToForLevelWalls(
        levelWallIds: readonly string[],
        junctions: readonly JoinedToJunctionInput[],
    ): void {
        const onLevel = new Set(levelWallIds);

        // 1) Remove this level's existing joinedTo edges (both directions —
        //    sweep source and target indices so a stale edge whose OTHER
        //    endpoint left the level is still caught).
        const toRemove = new Set<string>();
        for (const wallId of onLevel) {
            for (const index of [this._bySource, this._byTarget]) {
                const set = index.get(wallId);
                if (!set) continue;
                for (const relId of set) {
                    const rel = this._rels.get(relId);
                    if (rel && rel.type === 'joinedTo') toRemove.add(relId);
                }
            }
        }
        for (const relId of toRemove) this.removeRelationship(relId);

        // 2) Re-emit from the retained index: every distinct participant pair
        //    of every junction, both directions.
        for (const j of junctions) {
            const metadata = { junctionType: j.junctionType, junctionDegree: j.junctionDegree };
            for (let a = 0; a < j.wallIds.length; a++) {
                for (let b = a + 1; b < j.wallIds.length; b++) {
                    const idA = j.wallIds[a]!;
                    const idB = j.wallIds[b]!;
                    if (idA === idB) continue;
                    this.addRelationship({ type: 'joinedTo', sourceId: idA, targetId: idB, metadata, createdBy: 'system' });
                    this.addRelationship({ type: 'joinedTo', sourceId: idB, targetId: idA, metadata, createdBy: 'system' });
                }
            }
        }

        // 3) Coverage — every wall in this flush now has a definitive answer,
        //    including the ones that join nothing.
        for (const wallId of onLevel) this._joinedToCovered.add(wallId);
    }

    /**
     * ADR-0321 — the typed `joinedTo` reader (the Q4 lookup: "which walls
     * connect to wall Y", as a graph LOOKUP, never a resolver re-run).
     * Same read idiom as `getTargets(id, 'adjacentTo')` consumers, but
     * refusal-bearing: an unknown wall id is NOT an empty result (C71 §4.4).
     */
    getJoinedWalls(wallId: string): JoinedWallsQuery {
        const joinedWallIds = this.getTargets(wallId, 'joinedTo');
        if (joinedWallIds.length > 0) {
            // §C83 §10.6 — carry the discriminator this reader already holds.
            // Built by INDEXING the edges by target rather than by walking them
            // per id: `getRelationships` is O(edges) and doing it inside the map
            // would make a hot move-path reader quadratic in junction count.
            const byTarget = new Map<string, Relationship>();
            for (const r of this.getRelationships(wallId, 'joinedTo')) {
                if (!byTarget.has(r.targetId)) byTarget.set(r.targetId, r);
            }
            const junctions: JoinedWallJunction[] = joinedWallIds.map(id => {
                const m = byTarget.get(id)?.metadata;
                const t = m?.['junctionType'];
                const d = m?.['junctionDegree'];
                return {
                    wallId: id,
                    // Narrowed, never cast: metadata is `string | number |
                    // boolean`, so an unexpected value must read ABSENT rather
                    // than be asserted into the union. A wrong 'L' here would
                    // authorise moving an incumbent.
                    junctionType: typeof t === 'string' && JOINED_TO_JUNCTION_TYPES.includes(t as JoinedToJunctionType)
                        ? (t as JoinedToJunctionType)
                        : undefined,
                    junctionDegree: typeof d === 'number' && Number.isFinite(d) ? d : undefined,
                };
            });
            return { ok: true, wallId, joinedWallIds, junctions };
        }
        if (this._joinedToCovered.has(wallId)) return { ok: true, wallId, joinedWallIds: [], junctions: [] };
        return {
            ok: false,
            wallId,
            reason: 'wall-unknown-to-joinedTo-writer',
            detail:
                `joinedTo lookup for wall ${wallId}: the junction→graph writer has never ` +
                `covered this id (no flush has run over its level since load, or the id is ` +
                `not a wall). This is NO ANSWER, not "joins nothing".`,
        };
    }

    /**
     * §GR12-BOUNDARY-INVALIDATION (GR-12 · C71 §1.2 semantic 5 / §1.4 / §3.4;
     * C79 §5.2) — move-time invalidation of the REGION-DERIVED conclusion
     * families, called by the geometry-mutation writers the moment a bounding
     * element's geometry changes (`UpdateWallBaselineCommand` on the command
     * path; `WallRebuildCoordinator._flush` — the same chokepoint as the
     * `joinedTo` writer — for every other wall-geometry mutation path).
     *
     * WHY THE WRITER AND NOT A FOLLOW-UP (C71 §3.4): `boundedBy` /
     * `adjacentTo` / `connectedTo` are CONCLUSIONS recomputed from geometry —
     * which walls enclose this room, which rooms touch. Move a bounding wall
     * and the conclusion can become false while the edge still reads true and
     * confident (H6's measured STALE reading, `graphmove.cert.ts`). Whether a
     * re-detect follows the move is a REACHABILITY question (GR-18/CE-05) the
     * move writer must not depend on: stale-edge removal is part of the move
     * itself, exactly as a wall that stops joining drops its `joinedTo` edge
     * at flush.
     *
     * WHAT IT DOES, per room R holding a `boundedBy` edge to the moved
     * element: removes R's ENTIRE region-derived conclusion — every
     * `boundedBy` edge from R and every `adjacentTo`/`connectedTo` edge
     * touching R in either direction — and marks R's boundary
     * **`undetermined`** with a named reason. The whole conclusion goes, not
     * just the edge naming the moved element, because at move time NOTHING is
     * re-derived: whether the moved wall still bounds R, and whether R still
     * closes at all, are both unknowable without a detection pass, and keeping
     * the other edges would assert a confident partial boundary no one has
     * verified (C79 §5.3 — the element-level state is the WORST of its edges).
     * The re-emit half belongs to the next detection pass, whose `boundedBy`
     * writes clear the mark (see `addRelationship`).
     *
     * The paired adjacency room S (of a removed R↔S edge) is NOT marked: S's
     * own boundary was not touched — only the pair conclusion involving R was,
     * and R's mark carries that. Identity is durable ids only, never a
     * transient handle (C71 §3.5 discipline).
     *
     * ID-KEYED families (`sitsOn`, `hosts`/`hostedBy`, `contains`,
     * `supports`) are deliberately untouched: a moved wall still sits on the
     * same level and hosts the same door — surviving a move is their CORRECT
     * behaviour, proven by H6's id-keyed control arms.
     *
     * A caller may invoke this for an element that bounds nothing (or on a
     * path where a re-detect already ran) — the answer is an honest no-op,
     * reported as zero invalidated rooms, and calling twice is idempotent.
     */
    invalidateRegionConclusionsForMovedElement(
        movedElementId: string,
    ): { readonly invalidatedRoomIds: readonly string[] } {
        const roomIds = [...new Set(this.getSources(movedElementId, 'boundedBy'))];
        for (const roomId of roomIds) {
            const toRemove = new Set<string>();
            for (const index of [this._bySource, this._byTarget]) {
                const set = index.get(roomId);
                if (!set) continue;
                for (const relId of set) {
                    const rel = this._rels.get(relId);
                    if (!rel) continue;
                    const regionDerived =
                        (rel.type === 'boundedBy' && rel.sourceId === roomId) ||
                        rel.type === 'adjacentTo' ||
                        rel.type === 'connectedTo';
                    if (regionDerived) toRemove.add(relId);
                }
            }
            for (const relId of toRemove) this.removeRelationship(relId);
            this._boundaryUndetermined.set(roomId, {
                reason: 'boundary-undetermined-after-element-move',
                detail:
                    `bounding element ${movedElementId} moved and the boundary has not been ` +
                    `re-derived since — the room may no longer be bounded by it, or may no ` +
                    `longer close at all. Re-derivation (room detection) resolves this state.`,
            });
        }
        return { invalidatedRoomIds: roomIds };
    }

    /**
     * §GR12-DELETE-INVALIDATION (GR-12 · C71 §1.2 semantic 5 / §3.4; C79 §5.2)
     * — the DELETE twin of {@link invalidateRegionConclusionsForMovedElement},
     * called from {@link removeAllRelationshipsForElement} (every delete path,
     * by way of the one call `check-graph-delete-integrity` ARM A already
     * enforces) and from `WallRebuildCoordinator._flush` on `'remove'` events
     * (the chokepoint every wall-store mutation drains through, including
     * direct store writes that never went near a command).
     *
     * THE DEFECT IT CLOSES, measured before it existed by harness H7
     * (`tools/rac-conformance/certification/__tests__/graphdelete.cert.ts`,
     * `results/graphdelete.json`): delete one wall shared by two detected rooms
     * and the `3ee632f6` cascade correctly purges every edge whose ENDPOINT is
     * that wall — `hosts` → `[]`, `sitsOn` → `[]`, and the two
     * `room —boundedBy→ wall` edges gone. But each room's REMAINING `boundedBy`
     * edges survive, and `getBoundingWalls` answered
     * **`ok:true ["east-lo","south","west-lo"]`** — a confident, complete-looking
     * boundary for a ring that no longer closes. Before and after the delete the
     * reader printed the same SHAPE, so "this boundary was re-derived" and "a
     * wall it depended on was deleted and nobody recomputed" were the same
     * value. That is the C79 §5.2.1 collapse the move half was written to
     * prevent, reappearing on the delete path.
     *
     * WHY THIS MARKS BUT DOES NOT REMOVE — the one deliberate difference from
     * the move writer, and the reason it is not an oversight:
     *
     *   The move path has no undo snapshot of the graph; a move is geometry, and
     *   the conclusion is re-derived by detection. Removal there costs nothing
     *   recoverable.
     *
     *   The delete path DOES have one. `DeleteElementCommand._captureRelationships`
     *   snapshots exactly the edges TOUCHING the deleted id and
     *   `_restoreRelationships` re-adds them on undo. Removing a room's OTHER
     *   `boundedBy` edges here would put them outside that snapshot: undo would
     *   restore only `room —boundedBy→ deletedWall`, the re-add would clear the
     *   room's mark (that is `addRelationship`'s contract), and the reader would
     *   then answer **`ok:true` with ONE wall** — confident and wrong, strictly
     *   worse than the defect being fixed. The invalidation must stay inside what
     *   the delete's own undo can restore.
     *
     *   The mark alone is SUFFICIENT for the row, because the refusal — not the
     *   edge set — is what carries the honesty here: while a room is marked,
     *   `getBoundingWalls` cannot answer at all, so no consumer can mistake an
     *   undetermined boundary for a determined one. The raw `getTargets` stays
     *   raw, exactly as this file already documents for `getJoinedWalls` and
     *   `getBoundingWalls` ("the raw lookup stays raw, and THIS is the surface
     *   that can say it does not know").
     *
     * NOT CLOSED BY THIS WRITER, and measured as still-open by the same harness:
     * `adjacentTo` / `connectedTo` (room ↔ room) survive a delete of the wall or
     * door that authored them. BOTH endpoints are rooms, so the deleted id
     * appears in no index and no purge can reach them — the `connectedByStair`
     * shape the `authoredBy` docblock above already names. H7's re-detect control
     * proves those edges are not merely unverified but FALSE (a re-detect takes
     * them to `[]`). They are left alone here on purpose rather than half-fixed:
     * neither family has a refusal-bearing reader to absorb the difference, so
     * removing them would trade a stale TRUE-shaped answer for a silent empty
     * one — this repository's signature defect — and restoring them on undo is
     * likewise outside the delete snapshot. That needs its own reader first.
     *
     * Idempotent, and an honest no-op for an element no room is bounded by
     * (reported as zero invalidated rooms). A later no-op never erases an
     * earlier mark.
     */
    invalidateRegionConclusionsForDeletedElement(
        deletedElementId: string,
    ): { readonly invalidatedRoomIds: readonly string[] } {
        const roomIds = [...new Set(this.getSources(deletedElementId, 'boundedBy'))];
        for (const roomId of roomIds) {
            this._boundaryUndetermined.set(roomId, {
                reason: 'boundary-undetermined-after-element-delete',
                detail:
                    `bounding element ${deletedElementId} was DELETED and the boundary has not ` +
                    `been re-derived since. Unlike a move, this element provably no longer bounds ` +
                    `the room; whether the room still closes at all — and whether it is still a ` +
                    `room — is unknown until re-derivation (room detection) runs.`,
            });
        }
        return { invalidatedRoomIds: roomIds };
    }

    /**
     * §GR12-BOUNDARY-INVALIDATION — the typed, refusal-bearing `boundedBy`
     * reader ("which walls bound room R?"). Same idiom as
     * {@link getJoinedWalls}: the raw `getTargets(roomId, 'boundedBy')` stays
     * raw, and THIS is the surface that can say it does not know (C71 §4.4).
     * See {@link BoundingWallsQuery} for the two refusal shapes and the C79
     * §5.2 / C78 §8.1 mapping.
     */
    getBoundingWalls(roomId: string): BoundingWallsQuery {
        const undetermined = this._boundaryUndetermined.get(roomId);
        if (undetermined !== undefined) {
            return {
                ok: false,
                roomId,
                // §GR12-DELETE-INVALIDATION — the code is whatever the WRITER
                // recorded, never a hard-coded 'move'. A deletion reported as
                // `…-after-element-move` would be a false name for the cause.
                reason: undetermined.reason,
                detail:
                    `boundedBy lookup for room ${roomId}: the boundary is UNDETERMINED — ` +
                    undetermined.detail +
                    ` This is C79 §5.2's undetermined state, NOT "bounded by nothing" ` +
                    `(§5.2.1), and NOT a preserved boundary.`,
            };
        }
        const boundingWallIds = this.getTargets(roomId, 'boundedBy');
        if (boundingWallIds.length > 0) return { ok: true, roomId, boundingWallIds };
        return {
            ok: false,
            roomId,
            reason: 'room-unknown-to-boundedBy-writer',
            detail:
                `boundedBy lookup for room ${roomId}: the graph holds no boundedBy edge ` +
                `from this id and no undetermined mark. The id may not be a room, or the ` +
                `boundary writers never covered it. This is NO ANSWER, not "bounded by ` +
                `nothing" — a detected room is bounded by at least one element by ` +
                `construction (C71 §4.4).`,
        };
    }

    /**
     * §SITSON-REVERSE-READER — the typed `sitsOn` REVERSE reader (C71 §2.1 #5):
     * "which elements sit on this level?", as a graph LOOKUP rather than a
     * union of per-store `getByLevel` scans.
     *
     * CONSUMER: `DeleteLevelCommand.canExecute`. That guard asks exactly this
     * question and answers it from `level.childrenIds` — a side index populated
     * ONLY by `bimManager.registerElement`, which the command's own class
     * docblock documents as incomplete (a stair registers on its BASE level and
     * writes edges to its TOP level, so the top level holds edges while its
     * `childrenIds` stays empty). The `sitsOn` edge set is the authoritative
     * answer: it is written by every creation command AND reconstructed from
     * each element's authoritative `levelId` by `rebuildSemanticGraphFromSnapshot`,
     * so it survives a reload that `childrenIds` does not.
     *
     * Refusal-bearing per C71 §4.4: see {@link SittingOnQuery}. Coverage is
     * decided by "does the graph hold ANY edge touching this id" rather than by
     * a separate covered-set, because — unlike `joinedTo`, whose writer runs per
     * level flush — `sitsOn` has no single flush that could maintain one. Every
     * level that exists in a graph-bearing project is an endpoint of at least
     * its own elements' edges or its stair/lift circulation edges; an id with no
     * edges at all is one the writers have genuinely never covered.
     *
     * Complexity: O(k) in the number of edges touching the level.
     */
    getElementsSittingOn(levelId: string): SittingOnQuery {
        const elementIds = this.getSources(levelId, 'sitsOn');
        if (elementIds.length > 0) return { ok: true, levelId, elementIds };

        const touchesGraph =
            (this._bySource.get(levelId)?.size ?? 0) > 0 ||
            (this._byTarget.get(levelId)?.size ?? 0) > 0;
        if (touchesGraph) return { ok: true, levelId, elementIds: [] };

        return {
            ok: false,
            levelId,
            reason: 'level-unknown-to-sitsOn-writers',
            detail:
                `sitsOn reverse lookup for level ${levelId}: the graph holds no edge of any ` +
                `kind touching this id, so "nothing sits on it" and "the sitsOn writers have ` +
                `never covered it" are the same value here (the id may not be a level, or the ` +
                `project may predate the graph and not yet have been rebuilt). This is NO ` +
                `ANSWER, not "the level is empty" — C71 §4.4.`,
        };
    }

    /**
     * §HOSTEDBY-REVERSE-READER — the typed `hostedBy` reader (C71 §2.1 #1):
     * "which wall hosts this door/window?", as an O(k) graph LOOKUP rather than
     * a linear scan of the wall store's `openings[]` arrays.
     *
     * CONSUMER: `SyncStateEngine._findHostWall`, on the door/window branch of
     * the affected-node computation that drives every sync-state recompute. It
     * reads the denormalized `door.wallId` / `window.wallId` field first and,
     * when that is absent, falls back to iterating EVERY wall in the store and
     * scanning each one's `openings[]`. The `hostedBy` edge is written on every
     * opening creation (`CreateWallOpeningCommand`) and reconstructed on load
     * from `wall.openings[]` (`rebuildSemanticGraphFromSnapshot`), so it answers
     * the same question in one indexed hop — and, unlike the scan, can say that
     * it does NOT know rather than returning `null` for both "no host" and
     * "host not found".
     *
     * Refusal-bearing per C71 §4.4: see {@link HostWallQuery}. There is no
     * legitimate empty success — C15 §1 gives a hosted element exactly one host
     * — so zero edges and two edges are BOTH refusals, and they are named
     * separately because they call for different repairs.
     */
    getHostWall(openingId: string): HostWallQuery {
        const wallIds = [...new Set(this.getTargets(openingId, 'hostedBy'))];
        if (wallIds.length === 1) return { ok: true, openingId, wallId: wallIds[0]! };

        if (wallIds.length === 0) {
            return {
                ok: false,
                openingId,
                reason: 'opening-unknown-to-hostedBy-writer',
                detail:
                    `hostedBy lookup for opening ${openingId}: the graph holds no hostedBy edge ` +
                    `from this id. The id may not be an opening, the opening may have been ` +
                    `created before the graph existed, or the host edge was never written. ` +
                    `This is NO ANSWER, not "it has no host" — a hosted element has exactly ` +
                    `one host by contract (C15 §1), so "no host" is never a valid state.`,
            };
        }

        return {
            ok: false,
            openingId,
            reason: 'multiple-hosts',
            detail:
                `hostedBy lookup for opening ${openingId}: the graph holds ${wallIds.length} ` +
                `host walls (${wallIds.join(', ')}). C15 §1 gives a hosted element exactly ONE ` +
                `host, so this edge set is corrupt. This reader does NOT pick one: an opening's ` +
                `offset is measured along a specific host's baseLine, so choosing arbitrarily ` +
                `would return a confident answer for a coin flip.`,
        };
    }

    /**
     * §HOSTS-FORWARD-READER — the typed `hosts` reader (C71 §2.1 #1, the other
     * half of the reference-shape pair): "which openings does this wall host?",
     * as a refusal-bearing graph LOOKUP rather than a bare `getTargets`.
     *
     * CONSUMER: `SemanticQueryEngine`'s "what's in wall X" handler
     * (`packages/ai-host/src/SemanticQueryEngine.ts`). That handler already
     * asked exactly this question through `getTargets(wall.id, 'hosts')` and
     * reported the length as a fact — so a wall the graph had never heard of
     * produced the sentence *"0 element(s) hosted in wall"*, which is the C78
     * §1.4 forbidden inference rendered directly into user-visible prose. It now
     * distinguishes the two, in the same shape as that engine's model-summary
     * handler already distinguishes an empty type from an unreadable one.
     *
     * Refusal-bearing per C71 §4.4: see {@link HostedOpeningsQuery} for the two
     * named refusals and why a broken pair refuses rather than filtering.
     *
     * WHY THE PAIR CHECK IS AFFORDABLE: it is O(k) in the openings of ONE wall
     * — a handful — and reuses the same index the forward read already touched.
     *
     * Complexity: O(k) in the number of `hosts` edges from this wall.
     */
    getHostedOpenings(wallId: string): HostedOpeningsQuery {
        const openingIds = [...new Set(this.getTargets(wallId, 'hosts'))];

        if (openingIds.length > 0) {
            // The inverse half must agree. Both writers emit `hosts` and
            // `hostedBy` together; `deserialize` can drop either one alone.
            const orphaned = openingIds.filter(
                (id) => !this.getTargets(id, 'hostedBy').includes(wallId),
            );
            if (orphaned.length > 0) {
                return {
                    ok: false,
                    wallId,
                    reason: 'hosts-hostedBy-pair-broken',
                    detail:
                        `hosts lookup for wall ${wallId}: ${orphaned.length} of ${openingIds.length} ` +
                        `hosted opening(s) (${orphaned.join(', ')}) carry no hostedBy edge back to ` +
                        `this wall. C71 §2.1 row 1 writes the pair together and the delete cascade ` +
                        `purges it together, so this edge set is corrupt — most likely a slice whose ` +
                        `inverse row was dropped at load (see lastLoadReport). This reader does NOT ` +
                        `return the consistent subset: getHostWall would answer differently for the ` +
                        `orphans, and two halves of one pair disagreeing while both look confident is ` +
                        `the defect this reader exists to prevent. NO ANSWER, not a partial one.`,
                };
            }
            return { ok: true, wallId, openingIds };
        }

        // No edges. Only the coverage mark can tell "hosts nothing" from
        // "never seen" — `[]` from the raw lookup means both.
        if (this._hostsCovered.has(wallId)) return { ok: true, wallId, openingIds: [] };

        return {
            ok: false,
            wallId,
            reason: 'wall-unknown-to-hosts-writer',
            detail:
                `hosts lookup for wall ${wallId}: the graph holds no hosts edge from this id and ` +
                `the opening writer has never covered it (the id may not be a wall; the wall may ` +
                `exist but have never had an opening written to it; or the project was restored ` +
                `from a slice and no writer has run since — the coverage mark is derived state and ` +
                `is not serialized). This is NO ANSWER, not "hosts nothing" — C71 §4.4, C78 §1.4.`,
        };
    }

    /**
     * Reset the graph to empty.
     * Used for full project reload.
     */
    clear(): void {
        this._rels.clear();
        this._bySource.clear();
        this._byTarget.clear();
        this._joinedToCovered.clear();
        this._hostsCovered.clear();
        this._boundaryUndetermined.clear();
        // §GR10-DESERIALIZE-DROP-REPORT — the report describes ONE load of ONE
        // slice. Carrying it across a clear would let a project switch answer
        // "what did this graph's load refuse?" with the previous project's
        // drops. `deserialize` clears first and re-records after.
        this._lastLoadReport = null;
    }

    // ── Queries ───────────────────────────────────────────────────────────────

    /**
     * All relationships where elementId is source OR target.
     * Optionally filtered by relationship type.
     * Complexity: O(k) where k = number of relationships for this element.
     */
    getRelationships(elementId: string, type?: RelationshipType): Relationship[] {
        const ids = new Set<string>();

        const sourceSet = this._bySource.get(elementId);
        if (sourceSet) for (const id of sourceSet) ids.add(id);

        const targetSet = this._byTarget.get(elementId);
        if (targetSet) for (const id of targetSet) ids.add(id);

        const results: Relationship[] = [];
        for (const id of ids) {
            const rel = this._rels.get(id);
            if (rel && (!type || rel.type === type)) results.push(rel);
        }
        return results;
    }

    /**
     * All target IDs reachable from sourceId via the given relationship type.
     * Example: getTargets(wallId, 'hosts') → [doorId, windowId]
     */
    getTargets(sourceId: string, type: RelationshipType): string[] {
        const sourceSet = this._bySource.get(sourceId);
        if (!sourceSet) return [];
        const results: string[] = [];
        for (const id of sourceSet) {
            const rel = this._rels.get(id);
            if (rel && rel.type === type) results.push(rel.targetId);
        }
        return results;
    }

    /**
     * All source IDs pointing TO targetId via the given relationship type.
     * Example: getSources(roomId, 'boundedBy') → [] (boundedBy: room→wall, so check target)
     * Example: getSources(wallId, 'hosts') → [] (hosts: wall→opening, wall is source)
     */
    getSources(targetId: string, type: RelationshipType): string[] {
        const targetSet = this._byTarget.get(targetId);
        if (!targetSet) return [];
        const results: string[] = [];
        for (const id of targetSet) {
            const rel = this._rels.get(id);
            if (rel && rel.type === type) results.push(rel.sourceId);
        }
        return results;
    }

    /**
     * Whether a specific directional relationship exists.
     * Complexity: O(k) where k = source relationships.
     *
     * §FIX-CONNECTEDBY-EDGE-KEYING — this is an EXISTENCE question and stays
     * author-BLIND on purpose. Readers ask "are these two levels connected by a
     * stair?", not "…by stair-7". Delegating to the author-strict `_findExact`
     * arm would have made this return `false` for every author-keyed edge —
     * silently breaking egress routing the moment the keying shipped. Pass an
     * `authoredBy` to ask the narrower question.
     */
    hasRelationship(
        sourceId: string,
        targetId: string,
        type: RelationshipType,
        authoredBy?: string,
    ): boolean {
        if (authoredBy !== undefined) {
            return this._findExact(sourceId, targetId, type, authoredBy) !== undefined;
        }
        const sourceSet = this._bySource.get(sourceId);
        if (!sourceSet) return false;
        for (const id of sourceSet) {
            const rel = this._rels.get(id);
            if (rel && rel.targetId === targetId && rel.type === type) return true;
        }
        return false;
    }

    /**
     * BFS traversal from startId following the given relationship types.
     * Returns all reachable element IDs (not including startId).
     * Follows BOTH source→target and target→source for bidirectional types.
     *
     * @param maxDepth - Maximum traversal depth (default: 10)
     */
    traverse(startId: string, types: RelationshipType[], maxDepth = 10): string[] {
        const visited = new Set<string>([startId]);
        const queue: Array<{ id: string; depth: number }> = [{ id: startId, depth: 0 }];
        const results: string[] = [];

        while (queue.length > 0) {
            const { id, depth } = queue.shift()!;
            if (depth >= maxDepth) continue;

            // Follow source → target
            const sourceSet = this._bySource.get(id);
            if (sourceSet) {
                for (const relId of sourceSet) {
                    const rel = this._rels.get(relId);
                    if (rel && types.includes(rel.type) && !visited.has(rel.targetId)) {
                        visited.add(rel.targetId);
                        results.push(rel.targetId);
                        queue.push({ id: rel.targetId, depth: depth + 1 });
                    }
                }
            }

            // Follow target → source (for bidirectional traversal)
            const targetSet = this._byTarget.get(id);
            if (targetSet) {
                for (const relId of targetSet) {
                    const rel = this._rels.get(relId);
                    if (rel && types.includes(rel.type) && !visited.has(rel.sourceId)) {
                        visited.add(rel.sourceId);
                        results.push(rel.sourceId);
                        queue.push({ id: rel.sourceId, depth: depth + 1 });
                    }
                }
            }
        }

        return results;
    }

    /**
     * Total number of relationships in the graph.
     */
    get size(): number {
        return this._rels.size;
    }

    /**
     * All relationships as an array (for iteration).
     */
    getAll(): Relationship[] {
        return Array.from(this._rels.values());
    }

    // ── Persistence ───────────────────────────────────────────────────────────

    /**
     * Serialise the graph to a plain JSON object for ProjectSnapshot.
     */
    serialize(): SemanticGraph {
        return {
            version: 1,
            relationships: Array.from(this._rels.values()),
        };
    }

    /**
     * Restore the graph from a serialised ProjectSnapshot.
     * Clears the graph before loading.
     *
     * §GR10-DESERIALIZE-DROP-REPORT (C71 §5.7 · C70 L-INV-1 / I-INV-3) — every
     * row this refuses is COUNTED and NAMED in the returned
     * {@link SemanticGraphLoadResult}, and the same report is retained on
     * {@link lastLoadReport}. Before this, an unusable row fell through the
     * `if` with no else and vanished: a malformed edge could be written, saved
     * without complaint, and disappear on the next load — a defect that
     * self-erases on reload is a defect nobody can reproduce.
     *
     * A malformed row is deliberately NOT fatal. This method never throws on
     * bad data and never refuses the load: it reports, and continues. The
     * caller decides what to do with the report; ignoring it is a caller
     * defect, not a silence this method chose.
     */
    deserialize(data: SemanticGraph): SemanticGraphLoadResult {
        this.clear();

        if (!data || !Array.isArray(data.relationships)) {
            // The slice itself is unreadable. `loaded: 0` here is NOT the same
            // value as a project with no relationships, and saying so is the
            // whole point (C70 L-INV-1).
            return this._recordLoad({
                loaded: 0,
                presented: 0,
                dropped: [],
                absent: !data ? 'no-slice' : 'relationships-not-an-array',
            });
        }

        const dropped: DroppedRelationshipRow[] = [];
        const rows = data.relationships;
        const drop = (
            index: number,
            row: Partial<Relationship> | null,
            reason: RelationshipDropReason,
            detail: string,
        ): void => {
            dropped.push({
                index,
                id: typeof row?.id === 'string' && row.id.length > 0 ? row.id : null,
                type: typeof row?.type === 'string' && row.type.length > 0 ? row.type : null,
                reason,
                detail,
            });
        };

        for (let i = 0; i < rows.length; i++) {
            const rel = rows[i] as Relationship | null | undefined;
            if (rel === null || rel === undefined || typeof rel !== 'object') {
                drop(i, null, 'not-an-object', `row ${i} is ${rel === null ? 'null' : typeof rel}, not a relationship object`);
                continue;
            }
            if (!rel.id) {
                drop(i, rel, 'missing-id', `row ${i} carries no id — it cannot be keyed, addressed or deleted`);
                continue;
            }
            if (!rel.type) {
                drop(i, rel, 'missing-type', `row ${i} (id ${rel.id}) carries no relationship type — no reader could ever match it`);
                continue;
            }
            if (!rel.sourceId) {
                drop(i, rel, 'missing-sourceId', `row ${i} (id ${rel.id}, type ${rel.type}) has no sourceId — one half of the reference is gone`);
                continue;
            }
            if (!rel.targetId) {
                drop(i, rel, 'missing-targetId', `row ${i} (id ${rel.id}, type ${rel.type}) has no targetId — one half of the reference is gone`);
                continue;
            }
            if (this._rels.has(rel.id)) {
                // Was a silent overwrite: two rows in, one edge out, and the
                // loader printed the input length as the restored count.
                drop(i, rel, 'duplicate-id', `row ${i} repeats id ${rel.id}, already loaded from an earlier row — the later row is refused rather than silently overwriting the earlier one`);
                continue;
            }
            this._rels.set(rel.id, rel);
            this._addToIndex(this._bySource, rel.sourceId, rel.id);
            this._addToIndex(this._byTarget, rel.targetId, rel.id);
        }

        return this._recordLoad({
            loaded: this._rels.size,
            presented: rows.length,
            dropped,
            absent: null,
        });
    }

    /**
     * §GR10-DESERIALIZE-DROP-REPORT — the report from the most recent
     * {@link deserialize}, or `null` when this graph was never loaded from a
     * slice (a fresh session, or one cleared by a project switch).
     *
     * STORED, not merely returned, because the readings this defect corrupts
     * happen LONG after the load: anything asking "why does this graph have N
     * edges?" can now be answered with what the load refused, instead of having
     * to trust a number nobody can audit. `null` is itself informative and is
     * not the same value as a report with zero drops.
     */
    get lastLoadReport(): SemanticGraphLoadResult | null {
        return this._lastLoadReport;
    }

    private _recordLoad(r: SemanticGraphLoadResult): SemanticGraphLoadResult {
        const frozen: SemanticGraphLoadResult = { ...r, dropped: Object.freeze([...r.dropped]) };
        this._lastLoadReport = frozen;
        return frozen;
    }

    // ── Private helpers ───────────────────────────────────────────────────────

    private _addToIndex(index: Map<string, Set<string>>, key: string, relId: string): void {
        let set = index.get(key);
        if (!set) { set = new Set(); index.set(key, set); }
        set.add(relId);
    }

    private _removeFromIndex(index: Map<string, Set<string>>, key: string, relId: string): void {
        const set = index.get(key);
        if (!set) return;
        set.delete(relId);
        if (set.size === 0) index.delete(key);
    }

    /**
     * §FIX-CONNECTEDBY-EDGE-KEYING — exact-identity lookup.
     *
     * `authoredBy` is compared STRICTLY, including its absence: `undefined`
     * matches only edges that carry no author. That symmetry is what keeps the
     * change non-breaking — an unkeyed caller (every family but the two
     * circulation ones) compares `undefined === undefined` on every existing
     * edge and reproduces the old metadata-blind behaviour exactly.
     *
     * Deliberately NOT a deep metadata compare. Keying on metadata equality
     * would have made `adjacentTo`, `boundedBy` and `joinedTo` duplicate-creating
     * the moment any metadata field differed between two logically-identical
     * writes, and would put a deep compare on a hot path.
     */
    private _findExact(
        sourceId: string,
        targetId: string,
        type: RelationshipType,
        authoredBy?: string,
    ): Relationship | undefined {
        const sourceSet = this._bySource.get(sourceId);
        if (!sourceSet) return undefined;
        for (const id of sourceSet) {
            const rel = this._rels.get(id);
            if (rel && rel.targetId === targetId && rel.type === type && rel.authoredBy === authoredBy) return rel;
        }
        return undefined;
    }
}

// ── Singleton ─────────────────────────────────────────────────────────────────

/** Global singleton — imported by commands, DependencyResolver, and WorldModelAdapter. */
export const semanticGraphManager = new SemanticGraphManager();

import { projectScopeRegistry } from './persistence/ProjectScopeRegistry';
projectScopeRegistry.register({
    scopeName: 'semanticGraphManager',
    clear: () => semanticGraphManager.clear(),
});
