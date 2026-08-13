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
    | { readonly ok: true; readonly wallId: string; readonly joinedWallIds: readonly string[] }
    | {
        readonly ok: false;
        readonly wallId: string;
        readonly reason: 'wall-unknown-to-joinedTo-writer';
        readonly detail: string;
    };

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
 * Plain-JSON serialisation of the SemanticGraph.
 * Stored in ProjectSnapshot.semanticGraph.
 */
export interface SemanticGraph {
    version: number;
    relationships: Relationship[];
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
     * ADR-0321 — wall ids the `joinedTo` writer has made a DEFINITIVE statement
     * about (they were on a level whose flush ran against a refreshed junction
     * index). This is what lets {@link getJoinedWalls} distinguish "covered,
     * joins nothing" (a positive empty answer) from "the writer has never seen
     * this id" (a refusal). Derived state, never serialized: on load it is
     * empty until the first wall flush regenerates it — matching the type's
     * REGENERATED rebuild disposition (C71 §3.6).
     */
    private readonly _joinedToCovered = new Set<string>();

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
     */
    removeAllRelationshipsForElement(elementId: string): void {
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
        if (joinedWallIds.length > 0) return { ok: true, wallId, joinedWallIds };
        if (this._joinedToCovered.has(wallId)) return { ok: true, wallId, joinedWallIds: [] };
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
     * Reset the graph to empty.
     * Used for full project reload.
     */
    clear(): void {
        this._rels.clear();
        this._bySource.clear();
        this._byTarget.clear();
        this._joinedToCovered.clear();
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
     */
    deserialize(data: SemanticGraph): void {
        this.clear();
        if (!data || !Array.isArray(data.relationships)) return;
        for (const rel of data.relationships) {
            if (rel.id && rel.type && rel.sourceId && rel.targetId) {
                this._rels.set(rel.id, rel);
                this._addToIndex(this._bySource, rel.sourceId, rel.id);
                this._addToIndex(this._byTarget, rel.targetId, rel.id);
            }
        }
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
