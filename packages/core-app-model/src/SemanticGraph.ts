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
    | 'decidedBy'         // element → DecisionRecord (architect's rationale)
    // ── The DEFINITION AXIS (C71 §2.7 · ADR-0376 · Universal Component Editor) ─
    //
    // ⭐ THE FIRST ENDPOINTS IN THIS GRAPH THAT ARE NOT ELEMENT INSTANCES.
    // Every member above joins two element instance ids by convention and by
    // nothing else (C71 §1.5). These three join an instance to a DEFINITION, a
    // TYPE to what it specialises, and a definition to a definition — so the
    // seventh semantic (node kind) is DECLARED for them, per endpoint, in
    // {@link DEFINITION_AXIS_ENDPOINT_KINDS}, and every reader below is written
    // against that declaration rather than against an id prefix (C71 §1.5 MUST
    // NOT — the prefix set is `ElementType` and contains no *definition*).
    /**
     * `instantiates` — a placed component occurrence → the ComponentDefinition
     * it was minted from. Endpoints: *instance* → *definition* (C71 §2.7).
     *
     * Writer (C71 §1.2 semantic 1): {@link SemanticGraphManager.recordInstantiation},
     * called by the component placement command. ⛔ NOT the loader — a rebuild is
     * a disposition, never a substitute for a writer (C71 §2.7 obligation 1).
     *
     * Reader (semantic 2): {@link SemanticGraphManager.getInstantiatedDefinition}
     * (forward — "what IS this thing?") and
     * {@link SemanticGraphManager.getInstancesOfDefinition} (reverse — "which
     * instances exist over this definition?", the count C65 §3.6 requires the UI
     * to state BEFORE a definition edit propagates). Both are refusal-bearing:
     * an id no writer covered is NO ANSWER, never `[]` (C71 §4.4).
     *
     * Persistence (semantic 3): serialized verbatim in the snapshot graph slice.
     *
     * Rebuild disposition (semantic 4): PERSIST-ONLY. Nothing about a placed
     * component's geometry lets a loader re-derive which definition minted it —
     * `instantiates` is an AUTHORED fact. ⛔ An instance that loses this edge on
     * load is an element that no longer knows what it is, which is the most
     * expensive silent loss this graph could carry (C71 §2.7 obligation 3).
     *
     * Invalidation (semantic 5): id-keyed, therefore move-INVARIANT by
     * construction — moving an instance does not change what it instantiates.
     *
     * Deletion (semantic 6) — ASYMMETRIC, and that is why it is not boilerplate:
     * deleting the INSTANCE purges its edges through the endpoint cascade
     * ({@link SemanticGraphManager.removeAllRelationshipsForElement}) and undo
     * restores them VERBATIM (`3ee632f6`, C71 §5.6). Deleting a DEFINITION that
     * still has instances is a REFUSAL question, not a cascade one — see
     * {@link SemanticGraphManager.getDefinitionDeleteDisposition}. ⛔ Deleting a
     * definition MUST NOT delete instances (C71 §2.7 obligation 4).
     *
     * Node kind (semantic 7): declared in {@link DEFINITION_AXIS_ENDPOINT_KINDS}.
     */
    | 'instantiates'
    /**
     * `specializes` — a ComponentType → the definition (or the parent type) it
     * refines. Endpoints: *type* → *definition*, and *type* → *type* (C71 §2.7),
     * which is C65's T1–T4 tiering made traversable.
     *
     * Writer: {@link SemanticGraphManager.recordSpecialization}.
     * Reader: {@link SemanticGraphManager.getSpecializedParent} (forward) and
     * {@link SemanticGraphManager.getSpecializationsOf} (reverse — "which types
     * exist over this definition").
     * Persistence: serialized verbatim.
     * Rebuild disposition: PERSIST-ONLY — a type's parent is authored, and no
     * geometry re-derives it.
     * Invalidation: id-keyed, move-invariant.
     * Deletion: deleting the TYPE purges through the endpoint cascade; deleting
     * the PARENT is the same refusal question as `instantiates`.
     * Node kind: declared in {@link DEFINITION_AXIS_ENDPOINT_KINDS}.
     */
    | 'specializes'
    /**
     * `dependsOnDefinition` — a ComponentDefinition → a definition it nests or
     * reuses. Endpoints: *definition* → *definition* (C71 §2.7). It answers
     * *"what breaks if this definition changes or is deleted?"*, and it is the
     * CYCLE question — a definition graph without this edge cannot detect a
     * definition that transitively contains itself, and `family-runtime`'s cycle
     * detection covers EXPRESSIONS, not definitions
     * ({@link SemanticGraphManager.findDefinitionDependencyCycle}).
     *
     * ⭐ AUTHOR-KEYED, and it is the only one of the three that is. C112 §3.2's
     * membership test is *"does the (sourceId, targetId) pair identify the edge's
     * SUBJECT?"* For `instantiates` and `specializes` it does — the instance and
     * the type ARE endpoints. For this family it does NOT: one definition may
     * nest another through TWO DIFFERENT SLOTS, which are two genuinely distinct
     * facts that an unkeyed insert collapses onto one edge — and then removing
     * either slot strands the survivor. That is `connectedByStair`'s defect one
     * family over, so this family takes `connectedByStair`'s fix: `authoredBy:
     * <slotId>` at write time (§FIX-CONNECTEDBY-EDGE-KEYING) AND the slot id in
     * `metadata` for the edge-wise purge at delete time (C112 §5 — "dropping
     * either one breaks a different half").
     *
     * Writer: {@link SemanticGraphManager.recordDefinitionDependency}.
     * Reader: {@link SemanticGraphManager.getDefinitionDependencies} (forward)
     * and {@link SemanticGraphManager.getDefinitionDependents} (reverse).
     * Persistence: serialized verbatim, `authoredBy` INCLUDED — it is part of
     * edge identity, so a wire that drops it re-collapses the pair on reload
     * (C112 §3.2 arm 6).
     * Rebuild disposition: PERSIST-ONLY.
     * Invalidation: id-keyed, move-invariant.
     * Deletion: removing ONE SLOT is the EDGE-WISE purge
     * ({@link SemanticGraphManager.removeDefinitionDependenciesAuthoredBy}),
     * never an endpoint purge — an endpoint purge tears down every OTHER slot's
     * edge between the same two definitions (C112 §5, the over-purge C71 §5.6
     * warns against). Undo re-adds the returned edges VERBATIM, `authoredBy`
     * included.
     * Node kind: declared in {@link DEFINITION_AXIS_ENDPOINT_KINDS}.
     */
    | 'dependsOnDefinition';

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
    // C71 §2.7 · C112 §3.2 — one definition may nest another through TWO SLOTS.
    // The slot is the subject and appears in neither endpoint, so it passes the
    // membership test above. `instantiates` and `specializes` FAIL it (the
    // instance and the type ARE endpoints) and are deliberately absent.
    'dependsOnDefinition',
];

// ── The DEFINITION AXIS (C71 §2.7) — node kinds, declared per endpoint ────────

/**
 * C71 §1.5 semantic 7 — WHAT KIND OF THING an endpoint is.
 *
 * Measured at HEAD by C71 §1.5: `SemanticGraph` has no node record and no node
 * kind; every endpoint is an element instance id *by convention*. The moment an
 * endpoint is a DEFINITION or a TYPE, `getRelationships(id)` cannot tell the
 * caller what it just handed back, and a typed reader written for instances
 * consumes a definition id as if it were one — not a type error, a silently
 * wrong answer.
 *
 * This union names the three kinds the component programme introduces. It is a
 * VOCABULARY, not a node registry: nothing here stores a node. The kind of an
 * endpoint is decided by the FAMILY and the POSITION
 * ({@link DEFINITION_AXIS_ENDPOINT_KINDS}), which is what C71 §1.5 means by
 * "declares, per endpoint, which kind it is" — and it is the reason the same
 * clause forbids inferring the kind from an id prefix at a call site.
 */
export type GraphNodeKind = 'instance' | 'definition' | 'type';

/** The three families whose endpoints are not both element instances. */
export const DEFINITION_AXIS_RELATIONSHIP_TYPES = [
    'instantiates',
    'specializes',
    'dependsOnDefinition',
] as const satisfies readonly RelationshipType[];

/** A member of {@link DEFINITION_AXIS_RELATIONSHIP_TYPES}. */
export type DefinitionAxisRelationshipType = (typeof DEFINITION_AXIS_RELATIONSHIP_TYPES)[number];

/** The declared node kind of each endpoint of one definition-axis family. */
export interface DefinitionAxisEndpointKinds {
    /** What the SOURCE of this family's edges always is. */
    readonly source: GraphNodeKind;
    /**
     * What the TARGET may be. `specializes` is the one family with two legal
     * target kinds (a type refines a definition, or another type — C65's T1–T4
     * tiering), which is why this is a list and not a scalar.
     */
    readonly target: readonly GraphNodeKind[];
}

/**
 * C71 §1.5 / §2.7 — the per-endpoint node-kind DECLARATION for the definition
 * axis. This is the table every definition-axis reader is written against, and
 * the one {@link SemanticGraphManager.resolveDefinitionAxisNodeKind} consults.
 */
export const DEFINITION_AXIS_ENDPOINT_KINDS: Readonly<
    Record<DefinitionAxisRelationshipType, DefinitionAxisEndpointKinds>
> = {
    instantiates: { source: 'instance', target: ['definition'] },
    specializes: { source: 'type', target: ['definition', 'type'] },
    dependsOnDefinition: { source: 'definition', target: ['definition'] },
};

/** Runtime membership test for {@link DefinitionAxisRelationshipType}. */
export function isDefinitionAxisRelationship(
    type: RelationshipType,
): type is DefinitionAxisRelationshipType {
    return (DEFINITION_AXIS_RELATIONSHIP_TYPES as readonly RelationshipType[]).includes(type);
}

// ── The definition axis — typed reader result unions (C71 §4.4) ───────────────
//
// FAILURE ≠ EMPTINESS, for the same reason `getContainedElements` distinguishes
// them: `{ok:true, …:[]}` is a POSITIVE answer a writer established; `{ok:false}`
// is NO ANSWER, and it names why. The refusal reasons are per-family and
// per-SIDE, because "this id is not an instance the placement writer covered"
// and "this id is not a definition anything has been placed from" are different
// facts and a caller acts differently on each.

/**
 * Why a definition-axis question could not be answered.
 *
 * `…-node-kind-undetermined` is the refusal C71 §1.5 exists to make possible: the
 * graph cannot say whether the id is an instance or a definition, so it refuses
 * rather than guessing a direction. Guessing is the silently-wrong answer.
 */
export type DefinitionAxisUndeterminedReason =
    | 'id-unknown-to-instantiates-writer'
    | 'id-unknown-to-specializes-writer'
    | 'id-unknown-to-dependsOnDefinition-writer'
    | 'instance-instantiates-multiple-definitions'
    | 'type-specializes-multiple-parents'
    | 'definition-axis-node-kind-undetermined'
    | 'definition-axis-node-kind-ambiguous';

/**
 * `instantiates`, FORWARD — "what definition is this instance an occurrence of?"
 *
 * SINGLE-VALUED, and the multiplicity is a refusal rather than a list: an
 * occurrence is minted from exactly one definition, so two edges is CORRUPTION,
 * not a richer answer. Same shape and same reason as `getHostWall`'s
 * `multiple-hosts` (C15 §1).
 */
export type InstantiatedDefinitionQuery =
    | { readonly ok: true; readonly instanceId: string; readonly definitionId: string }
    | {
        readonly ok: false;
        readonly instanceId: string;
        readonly reason: DefinitionAxisUndeterminedReason;
        readonly detail: string;
    };

/**
 * `instantiates`, REVERSE — "which instances exist over this definition?"
 *
 * This is the count C65 §3.6 requires the UI to state BEFORE a definition edit
 * propagates, and the set {@link SemanticGraphManager.getDefinitionDeleteDisposition}
 * refuses a definition delete on. `{ok:true, instanceIds:[]}` means the graph
 * KNOWS this definition and nothing is placed from it — a positive answer, and a
 * very different fact from "no writer has ever mentioned this id".
 */
export type DefinitionInstancesQuery =
    | { readonly ok: true; readonly definitionId: string; readonly instanceIds: readonly string[] }
    | {
        readonly ok: false;
        readonly definitionId: string;
        readonly reason: DefinitionAxisUndeterminedReason;
        readonly detail: string;
    };

/** `specializes`, FORWARD — "what does this type refine?" Single-valued (one parent). */
export type SpecializedParentQuery =
    | {
        readonly ok: true;
        readonly typeId: string;
        readonly parentId: string;
        /** Which kind the parent is — a definition (T1) or another type (T2–T4). */
        readonly parentKind: GraphNodeKind;
    }
    | {
        readonly ok: false;
        readonly typeId: string;
        readonly reason: DefinitionAxisUndeterminedReason;
        readonly detail: string;
    };

/** `specializes`, REVERSE — "which types exist over this definition or type?" */
export type SpecializationsQuery =
    | { readonly ok: true; readonly parentId: string; readonly typeIds: readonly string[] }
    | {
        readonly ok: false;
        readonly parentId: string;
        readonly reason: DefinitionAxisUndeterminedReason;
        readonly detail: string;
    };

/** `dependsOnDefinition`, FORWARD — "what does this definition nest or reuse?" */
export type DefinitionDependenciesQuery =
    | { readonly ok: true; readonly definitionId: string; readonly dependsOnIds: readonly string[] }
    | {
        readonly ok: false;
        readonly definitionId: string;
        readonly reason: DefinitionAxisUndeterminedReason;
        readonly detail: string;
    };

/**
 * `dependsOnDefinition`, REVERSE — "what breaks if this definition changes or is
 * deleted?" The consumer C71 §2.7 names for the family (D6, nesting/reuse).
 */
export type DefinitionDependentsQuery =
    | { readonly ok: true; readonly definitionId: string; readonly dependentIds: readonly string[] }
    | {
        readonly ok: false;
        readonly definitionId: string;
        readonly reason: DefinitionAxisUndeterminedReason;
        readonly detail: string;
    };

/**
 * C71 §2.7 obligation 4 — the DEFINITION half of the delete behaviour, which is
 * a REFUSAL question and not a cascade question.
 *
 * ⛔ Deleting a definition MUST NOT delete the user's placed elements. The
 * disposition names the live instances and the dependent definitions so the
 * deleting command can refuse with BOTH numbers, in the C65 §3.4 shape: the
 * instances resolve to a visible, named unresolved state — never a silent
 * default, and never a silent cascade.
 */
export type DefinitionDeleteDisposition =
    | {
        /** No instance and no dependent definition — the delete is unobstructed. */
        readonly ok: true;
        readonly definitionId: string;
    }
    | {
        readonly ok: false;
        readonly definitionId: string;
        readonly reason: 'definition-has-live-instances' | 'definition-has-dependents' | DefinitionAxisUndeterminedReason;
        /** The placed occurrences that would be orphaned. NEVER a bare count. */
        readonly instanceIds: readonly string[];
        /** The definitions that nest or reuse this one. */
        readonly dependentIds: readonly string[];
        readonly detail: string;
    };

/**
 * The cycle answer for `dependsOnDefinition`. A definition that transitively
 * contains itself is unbuildable, and `family-runtime`'s cycle detection covers
 * EXPRESSIONS, not definitions (C71 §2.7).
 *
 * `{ok:true, cycle:null}` is the positive "no cycle reachable from here" answer;
 * `cycle` is the ordered path, first id repeated last, so the caller can name the
 * loop rather than report that one exists.
 */
export type DefinitionCycleQuery =
    | { readonly ok: true; readonly definitionId: string; readonly cycle: readonly string[] | null }
    | {
        readonly ok: false;
        readonly definitionId: string;
        readonly reason: DefinitionAxisUndeterminedReason;
        readonly detail: string;
    };

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
 * §GR13-ADJACENCY-READER — the shared refusal vocabulary of the two ROOM↔ROOM
 * region-derived families, `adjacentTo` and `connectedTo`.
 *
 * These are CONCLUSIONS of a detection pass, not id-keyed facts, so they have
 * exactly the three failure modes `boundedBy` has plus one of their own:
 *
 *  · `adjacency-undetermined-after-element-move` / `…-after-element-delete` —
 *    forwarded verbatim from {@link BoundaryUndeterminedReason}, because the
 *    region conclusion is ONE conclusion: the writer that marks the boundary
 *    undetermined has, by the same act, made the room's adjacency undetermined.
 *    On the DELETE path this is the load-bearing member — the `adjacentTo` /
 *    `connectedTo` edges SURVIVE the purge (both endpoints are rooms, so the
 *    deleted wall appears in no index) and harness H7 measured them not merely
 *    unverified but FALSE. A bare `getTargets` hands those false edges back
 *    looking confident; this reader refuses instead.
 *
 *  · `room-unknown-to-adjacency-writer` — no covered mark and no edges: the
 *    detection pass has never completed over this room (or the id is not a
 *    room). NOT "adjacent to nothing".
 */
export type AdjacencyUndeterminedReason =
    | BoundaryUndeterminedReason
    | 'room-unknown-to-adjacency-writer';

/**
 * §GR13-ADJACENCY-READER — typed result of
 * {@link SemanticGraphManager.getAdjacentRooms}. FAILURE ≠ EMPTINESS (C71
 * §4.4): `{ok:true, adjacentRoomIds:[]}` means "a detection pass covered this
 * room and it touches no other room" — a positive, actionable answer.
 * `{ok:false}` means the graph cannot answer, and names why.
 */
export type AdjacentRoomsQuery =
    | { readonly ok: true; readonly roomId: string; readonly adjacentRoomIds: readonly string[] }
    | {
        readonly ok: false;
        readonly roomId: string;
        readonly reason: AdjacencyUndeterminedReason;
        readonly detail: string;
    };

/**
 * §GR13-ADJACENCY-READER — typed result of
 * {@link SemanticGraphManager.getConnectedRooms}. `{ok:true,
 * connectedRoomIds:[]}` is the answer the "rooms without a door" query has
 * always needed and never had: "a detection pass covered this room and no door
 * connects it to any other room". `{ok:false}` is the answer that query used to
 * render — silently — as the same sentence.
 */
export type ConnectedRoomsQuery =
    | { readonly ok: true; readonly roomId: string; readonly connectedRoomIds: readonly string[] }
    | {
        readonly ok: false;
        readonly roomId: string;
        readonly reason: AdjacencyUndeterminedReason;
        readonly detail: string;
    };

/**
 * §GR13-CONTAINS-READER — typed result of
 * {@link SemanticGraphManager.getContainedElements}. `contains` is ID-KEYED
 * (room → furniture/equipment), so unlike the two adjacency families it does
 * NOT consult the region-invalidation mark: a moved bounding wall leaves the
 * furniture in the room, and surviving a move is this family's CORRECT
 * behaviour (see {@link SemanticGraphManager.invalidateRegionConclusionsForMovedElement}).
 * Its only refusal is the `hosts` one: the writer has never covered this id.
 */
export type ContainedElementsQuery =
    | { readonly ok: true; readonly roomId: string; readonly containedIds: readonly string[] }
    | {
        readonly ok: false;
        readonly roomId: string;
        readonly reason: 'room-unknown-to-contains-writer';
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
     * §GR13-CONTAINS-READER — room ids the `contains` writer
     * (`CreateFurnitureCommand`) has made a DEFINITIVE statement about. Exactly
     * the `_hostsCovered` disposition and for exactly the same reason: every
     * `contains` edge is written through {@link addRelationship}, so the mark is
     * taken at the writer with no second call site to keep in step, and it
     * OUTLIVES the edges — a room whose last piece of furniture is deleted stays
     * marked and answers `{ok:true, containedIds:[]}`, "known, and now contains
     * nothing". Deleting the ROOM clears it (a dead id is unknown).
     *
     * Derived state, never serialized — same disposition as `_joinedToCovered`.
     */
    private readonly _containsCovered = new Set<string>();

    /**
     * §GR13-ADJACENCY-READER — room ids a COMPLETED room-detection adjacency
     * pass has made a definitive statement about, letting
     * {@link getAdjacentRooms} / {@link getConnectedRooms} distinguish "covered,
     * touches nothing" from "no pass has ever covered this id".
     *
     * WHY AN EXPLICIT MARK AND NOT A PROXY. The obvious proxy — "the room holds
     * `boundedBy` edges, so detection ran" — is UNSOUND against the writer as it
     * is actually written: `DetectAllRoomsCommand` emits `boundedBy` per room in
     * one try/catch and computes the pairwise adjacency scan in a SECOND,
     * separate try/catch that warns and swallows. A pass whose adjacency half
     * threw leaves every room bounded and none adjacent, and the proxy would
     * read that as a confident "adjacent to nothing" for the whole level —
     * manufacturing precisely the determined-from-missing-data answer this
     * reader exists to prevent. The mark is therefore taken by
     * {@link markAdjacencyCoverage}, which the writer calls only AFTER the scan
     * completes; the `_joinedToCovered` idiom, whose writer is likewise a
     * whole-level flush rather than a per-edge insert.
     *
     * It is NOT consulted before {@link _boundaryUndetermined}: an invalidated
     * room is undetermined even though a pass once covered it.
     *
     * Derived state, never serialized — same disposition as `_joinedToCovered`.
     */
    private readonly _adjacencyCovered = new Set<string>();

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

    /**
     * C71 §1.5 / §2.7 — the definition-axis coverage marks, kept PER FAMILY AND
     * PER SIDE, which is the whole reason there are five sets here and not one.
     *
     * WHY NOT ONE SET. A single "the definition-axis writers have seen this id"
     * mark cannot tell an INSTANCE from a DEFINITION, so a reader consulting it
     * would answer *"which instances instantiate this id?"* with a confident `[]`
     * for a TYPE id — a category error stated as an established fact, which is
     * exactly the silently-wrong answer C71 §1.5 was written to prevent. The
     * side of the mark IS the node-kind declaration, taken at the writer, from
     * {@link DEFINITION_AXIS_ENDPOINT_KINDS}.
     *
     * WHY THE MARKS OUTLIVE THE EDGES — the `_hostsCovered` disposition, and the
     * case they exist for: a definition whose LAST instance is deleted keeps its
     * mark (the purge is keyed on the INSTANCE id) and answers
     * `{ok:true, instanceIds:[]}` — "known, and now placed nowhere". Without the
     * mark that is indistinguishable from an id nothing has ever heard of, and
     * the delete would silently downgrade a determined answer to an undetermined
     * one. Deleting the DEFINITION itself does clear its marks — a dead id is
     * *unknown*, not "known, and empty".
     *
     * Derived state, NEVER serialized — same disposition as `_joinedToCovered`.
     * The EDGES are persist-only and come back from the slice, so a reloaded
     * project answers through the edge branch; only the genuinely-empty case
     * reverts to a refusal until a writer runs, which is honest rather than
     * unfortunate.
     */
    private readonly _instantiatesCoveredInstances = new Set<string>();
    private readonly _instantiatesCoveredDefinitions = new Set<string>();
    private readonly _specializesCoveredTypes = new Set<string>();
    private readonly _specializesCoveredParents = new Set<string>();
    /**
     * `dependsOnDefinition` needs ONE set, not two: C71 §2.7 declares BOTH
     * endpoints *definition*, so the side carries no kind information and
     * splitting it would be two names for one fact (C84 EI-8).
     */
    private readonly _definitionDependencyCovered = new Set<string>();

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

        // §GR13-CONTAINS-READER — same shape, same reason: writing a `contains`
        // edge IS the furniture writer's definitive statement about this room,
        // and a re-emit of an existing edge is still a statement, so the mark
        // precedes the idempotency guard.
        if (rel.type === 'contains') this._containsCovered.add(rel.sourceId);

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

        // §GR13-CONTAINS-READER / §GR13-ADJACENCY-READER — a deleted ROOM is
        // unknown to both writers again, not "covered, contains/touches
        // nothing". Keyed on `elementId`, so deleting a piece of FURNITURE never
        // clears its room's contains mark — that is the case the mark exists for
        // — and deleting a WALL never clears a room's adjacency mark here (the
        // wall is not the room; the delete-time invalidation above is what
        // downgrades that room, and it downgrades it to UNDETERMINED, which is a
        // different and stronger statement than "unknown").
        this._containsCovered.delete(elementId);
        this._adjacencyCovered.delete(elementId);

        // §GR12-BOUNDARY-INVALIDATION — a room whose every edge is purged
        // (deleted, or replaced by a detection cycle) is UNKNOWN again, not
        // undetermined: `getBoundingWalls` must refuse with
        // `room-unknown-to-boundedBy-writer`, not with a stale move mark for a
        // dead id. Mirrors the `_joinedToCovered` disposition above.
        this._boundaryUndetermined.delete(elementId);

        // C71 §2.7 obligation 4, the INSTANCE half of the asymmetric delete: a
        // deleted node is UNKNOWN to the definition-axis writers again, not
        // "known, and instantiates nothing". Keyed on `elementId`, which is what
        // makes the asymmetry work: deleting an INSTANCE never clears its
        // definition's mark — that is precisely the case the mark exists for
        // (the definition is still known; it now has no instances). The
        // DEFINITION half is not a purge at all: see
        // {@link getDefinitionDeleteDisposition} — deleting a definition with
        // live instances is a REFUSAL question, and this cascade must never be
        // the thing that answers it.
        this._instantiatesCoveredInstances.delete(elementId);
        this._instantiatesCoveredDefinitions.delete(elementId);
        this._specializesCoveredTypes.delete(elementId);
        this._specializesCoveredParents.delete(elementId);
        this._definitionDependencyCovered.delete(elementId);
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

    // ── The DEFINITION AXIS — writers (C71 §2.6 obligation 1, §2.7) ───────────
    //
    // ⛔ THESE ARE THE WRITE API, NOT THE WRITER. C71 §2.7 obligation 1 is
    // explicit that the writer is "the command that creates the relationship, and
    // ONLY that command", and that the loader is a *disposition*, never a
    // substitute. These three methods are the same shape as
    // `replaceJoinedToForLevelWalls` — a family-specific, typed entry point that
    // maintains its own derived state at the writer (C71 §3.4) — and the
    // component placement / type / nesting commands are what call them.
    //
    // Their existence buys no coverage on its own, and this file says so in the
    // one place a future reader will look: `check-graph-write-coverage` EXCLUDES
    // `SemanticGraph.ts` from its corpus precisely so a declaration site cannot
    // prove its own coverage, and credits a helper only through its
    // `HELPER_WRITERS` map plus a real production call site.

    /**
     * C71 §2.7 — record that a placed component occurrence was minted from a
     * definition. The `instantiates` write API.
     *
     * Marks BOTH endpoints (C71 §1.5): the instance as an *instance*, the
     * definition as a *definition*, per {@link DEFINITION_AXIS_ENDPOINT_KINDS}.
     * The marks are what let the readers answer a positive empty rather than
     * refuse, and what let {@link resolveDefinitionAxisNodeKind} name a side
     * without ever reading an id prefix.
     *
     * Idempotent on `(instanceId, definitionId, 'instantiates')` — re-placing the
     * same occurrence from the same definition is one fact, and the edge is NOT
     * author-keyed (C112 §3.2: the instance IS an endpoint).
     *
     * @returns the relationship id (existing or new).
     */
    recordInstantiation(instanceId: string, definitionId: string): string {
        this._instantiatesCoveredInstances.add(instanceId);
        this._instantiatesCoveredDefinitions.add(definitionId);
        return this.addRelationship({
            type: 'instantiates',
            sourceId: instanceId,
            targetId: definitionId,
            createdBy: 'system',
        });
    }

    /**
     * C71 §2.7 — record that a component TYPE refines a definition (T1) or
     * another type (T2–T4). The `specializes` write API.
     *
     * `parentKind` is REQUIRED and is not inferred: C71 §1.5 forbids deducing an
     * endpoint's kind at a call site, and `specializes` is the one family with
     * two legal target kinds, so the caller — which knows which it created — is
     * the only party entitled to say. It is stored in `metadata.parentKind` so a
     * reader that loads the edge from a snapshot still has the declaration.
     */
    recordSpecialization(typeId: string, parentId: string, parentKind: 'definition' | 'type'): string {
        this._specializesCoveredTypes.add(typeId);
        this._specializesCoveredParents.add(parentId);
        if (parentKind === 'type') this._specializesCoveredTypes.add(parentId);
        return this.addRelationship({
            type: 'specializes',
            sourceId: typeId,
            targetId: parentId,
            metadata: { parentKind },
            createdBy: 'system',
        });
    }

    /**
     * C71 §2.7 / C112 §3.2 — record that one definition nests or reuses another
     * through a NAMED SLOT. The `dependsOnDefinition` write API.
     *
     * ⭐ `slotId` is not optional and it is written TWICE, deliberately, and the
     * two are not redundant (C112 §5): as `authoredBy` it is part of the edge's
     * IDENTITY, which is what keeps two slots onto the same definition from
     * collapsing onto one edge at WRITE time; in `metadata` it is what the
     * edge-wise purge matches on at DELETE time
     * ({@link removeDefinitionDependenciesAuthoredBy}). Dropping either one
     * breaks a different half.
     */
    recordDefinitionDependency(definitionId: string, dependsOnId: string, slotId: string): string {
        this._definitionDependencyCovered.add(definitionId);
        this._definitionDependencyCovered.add(dependsOnId);
        return this.addRelationship({
            type: 'dependsOnDefinition',
            sourceId: definitionId,
            targetId: dependsOnId,
            authoredBy: slotId,
            metadata: { slotId },
            createdBy: 'system',
        });
    }

    /**
     * C71 §3.4 / §1.5 — the definition registry declaring which definition-axis
     * nodes it has made a DEFINITIVE statement about, for the nodes that carry no
     * edge yet: a definition just created and never placed, a type just created
     * and never refined.
     *
     * The `markAdjacencyCoverage` idiom, one axis over. Without it, a brand-new
     * definition and an id nothing has ever heard of are the same value at every
     * reader below — the §CONTEXT-DATA-HONESTY collision, in the substrate that
     * answers "what is this thing?".
     *
     * ⚠ `kind` is the CALLER's declaration (C71 §1.5 MUST NOT infer), and a node
     * declared under two kinds is left AMBIGUOUS rather than silently resolved:
     * see {@link resolveDefinitionAxisNodeKind}.
     */
    markDefinitionAxisCoverage(kind: GraphNodeKind, ids: readonly string[]): void {
        for (const id of ids) {
            if (!id) continue;
            if (kind === 'instance') this._instantiatesCoveredInstances.add(id);
            else if (kind === 'type') this._specializesCoveredTypes.add(id);
            else {
                this._instantiatesCoveredDefinitions.add(id);
                this._specializesCoveredParents.add(id);
                this._definitionDependencyCovered.add(id);
            }
        }
    }

    /**
     * C112 §5 · §FIX-STAIR-DELETE-LEAVES-GRAPH-EDGES — remove the
     * `dependsOnDefinition` edges authored by ONE nesting slot, EDGE-WISE.
     *
     * ⛔ NOT an endpoint purge. `removeAllRelationshipsForElement(definitionId)`
     * would tear down every OTHER slot's edge between the same two definitions —
     * the over-purge C71 §5.6 warns against and C112 §5 measures. The match is on
     * `metadata.slotId`, exactly as `DeleteStairCommand._stairAuthoredLevelEdges`
     * matches `metadata.stairId`, because the subject of the edge (the slot) is
     * not one of its endpoints and the two endpoint indices cannot see it.
     *
     * @returns the removed edges, VERBATIM and by value, so the calling command
     *   can hold them for undo and re-add them with `authoredBy` intact. An undo
     *   that RE-DERIVES the edge instead of restoring it loses the key and
     *   re-collapses the pair (C112 §5).
     */
    removeDefinitionDependenciesAuthoredBy(
        slotId: string,
        definitionIds: readonly string[],
    ): Relationship[] {
        const removed = new Map<string, Relationship>();
        for (const id of definitionIds) {
            if (!id) continue;
            for (const rel of this.getRelationships(id, 'dependsOnDefinition')) {
                if (rel.metadata?.['slotId'] === slotId || rel.authoredBy === slotId) {
                    removed.set(rel.id, { ...rel });
                }
            }
        }
        for (const id of removed.keys()) this.removeRelationship(id);
        return [...removed.values()];
    }

    /**
     * §GR13-ADJACENCY-READER (C71 §3.4 — maintain derived state AT the writer)
     * — the room-detection adjacency pass declaring which rooms it has just made
     * a definitive `adjacentTo` / `connectedTo` statement about.
     *
     * CALLED BY `DetectAllRoomsCommand` and `ReDetectRoomsCommand`, at the END
     * of the pairwise scan and INSIDE its try block, so a scan that throws
     * part-way marks nothing and every room on the level keeps refusing. That
     * placement is the whole point (see {@link _adjacencyCovered}): both
     * commands wrap the scan in a catch that logs a warning and continues, so a
     * half-run pass is a live production state, not a hypothetical.
     *
     * Idempotent. Marking does NOT clear an undetermined boundary mark — only a
     * fresh `boundedBy` write does that (see {@link addRelationship}) — so the
     * two marks cannot be used to talk each other out of a refusal.
     */
    markAdjacencyCoverage(roomIds: readonly string[]): void {
        for (const roomId of roomIds) this._adjacencyCovered.add(roomId);
    }

    /**
     * §GR13-ADJACENCY-READER — the typed, refusal-bearing `adjacentTo` reader
     * ("which rooms share a wall with room R?").
     *
     * THE ROW THIS CLOSES, named in this file before it was written — see
     * {@link invalidateRegionConclusionsForDeletedElement}'s "NOT CLOSED BY THIS
     * WRITER" note: `adjacentTo` / `connectedTo` survive a delete of the wall
     * that authored them, because both endpoints are rooms and the deleted id
     * appears in no index. Harness H7 proved those survivors FALSE, and the
     * delete writer deliberately left them rather than trade a stale TRUE-shaped
     * answer for a silent empty one — *"That needs its own reader first."* This
     * is that reader: the undetermined mark is checked BEFORE the edges, so a
     * room whose bounding element was deleted or moved refuses even while the
     * stale edges are still there to be handed back.
     *
     * CONSUMERS: `SemanticQueryEngine`'s "rooms adjacent to X" handler, which
     * printed `${adjacent.length} room(s) adjacent to "X"` straight from the bare
     * lookup — so an undetermined room rendered as *"0 room(s) adjacent"*, C78
     * §1.4's forbidden inference in user-visible prose; and
     * `WorldModelAdapter`'s room summary, which fed the same `[]` to an AI
     * prompt as fact.
     *
     * Order of decision, and none of it is interchangeable:
     *   1. undetermined mark → refuse (dominates edges: the delete case has
     *      edges AND is wrong).
     *   2. edges → answer.
     *   3. covered, no edges → the positive empty answer.
     *   4. neither → refuse, unknown id.
     *
     * Complexity: O(k) in the edges from this room.
     */
    getAdjacentRooms(roomId: string): AdjacentRoomsQuery {
        const undetermined = this._boundaryUndetermined.get(roomId);
        if (undetermined !== undefined) {
            return {
                ok: false,
                roomId,
                reason: undetermined.reason,
                detail:
                    `adjacentTo lookup for room ${roomId}: the room's region conclusion is ` +
                    `UNDETERMINED — ` + undetermined.detail +
                    ` Adjacency is part of that ONE conclusion (C79 §5.3 — the element-level ` +
                    `state is the WORST of its edges), so any adjacentTo edges still present ` +
                    `are UNVERIFIED and, on the delete path, measured FALSE. This is NOT ` +
                    `"adjacent to nothing" and NOT a preserved adjacency.`,
            };
        }
        const adjacentRoomIds = [...new Set(this.getTargets(roomId, 'adjacentTo'))];
        if (adjacentRoomIds.length > 0) return { ok: true, roomId, adjacentRoomIds };
        if (this._adjacencyCovered.has(roomId)) return { ok: true, roomId, adjacentRoomIds: [] };
        return {
            ok: false,
            roomId,
            reason: 'room-unknown-to-adjacency-writer',
            detail:
                `adjacentTo lookup for room ${roomId}: the graph holds no adjacentTo edge from ` +
                `this id, no undetermined mark, and no completed detection pass has covered it ` +
                `(the id may not be a room; the project may have been restored from a slice with ` +
                `no detection run since — the coverage mark is derived state and is not ` +
                `serialized; or the pass's adjacency scan threw and was swallowed). This is NO ` +
                `ANSWER, not "adjacent to nothing" — C71 §4.4, C78 §1.4.`,
        };
    }

    /**
     * §GR13-ADJACENCY-READER — the typed, refusal-bearing `connectedTo` reader
     * ("which rooms does a door connect this room to?"). Same four-step decision
     * as {@link getAdjacentRooms} and the same marks, because ONE detection pass
     * writes both families in one loop: `connectedTo` is emitted for exactly the
     * adjacent pairs whose shared wall carries a door.
     *
     * CONSUMER: `SemanticQueryEngine`'s "rooms without a door" handler. It read
     * `getTargets(r.id, 'connectedTo')`, found `[]`, and listed the room under
     * *"N room(s) without a door"* — a COMPLIANCE-SHAPED claim (a room with no
     * door is an egress defect) manufactured from missing data. Before any
     * detection has run, that handler indicted every room in the project.
     *
     * WHY THE EMPTY SUCCESS MATTERS MORE HERE THAN ANYWHERE ELSE: `{ok:true,
     * connectedRoomIds:[]}` is that query's actual subject. The reader must be
     * able to say it — refusing for every room would destroy the feature just as
     * surely as answering `[]` for every room defamed it.
     *
     * Complexity: O(k) in the edges from this room.
     */
    getConnectedRooms(roomId: string): ConnectedRoomsQuery {
        const undetermined = this._boundaryUndetermined.get(roomId);
        if (undetermined !== undefined) {
            return {
                ok: false,
                roomId,
                reason: undetermined.reason,
                detail:
                    `connectedTo lookup for room ${roomId}: the room's region conclusion is ` +
                    `UNDETERMINED — ` + undetermined.detail +
                    ` Door connectivity is part of that ONE conclusion: the very wall that ` +
                    `moved or was deleted may be the one that carried the door. This is NOT ` +
                    `"connected to nothing", and a caller must not report it as a room ` +
                    `without a door.`,
            };
        }
        const connectedRoomIds = [...new Set(this.getTargets(roomId, 'connectedTo'))];
        if (connectedRoomIds.length > 0) return { ok: true, roomId, connectedRoomIds };
        if (this._adjacencyCovered.has(roomId)) return { ok: true, roomId, connectedRoomIds: [] };
        return {
            ok: false,
            roomId,
            reason: 'room-unknown-to-adjacency-writer',
            detail:
                `connectedTo lookup for room ${roomId}: the graph holds no connectedTo edge ` +
                `from this id, no undetermined mark, and no completed detection pass has ` +
                `covered it. This is NO ANSWER, not "no door connects this room" — reporting ` +
                `it as a room without a door is C78 §1.4's forbidden inference dressed as a ` +
                `compliance finding.`,
        };
    }

    /**
     * §GR13-CONTAINS-READER — the typed, refusal-bearing `contains` reader
     * ("which furniture/equipment is in room R?").
     *
     * CONSUMERS: `WorldModelAdapter`'s room summary (`containedElementIds`, fed
     * verbatim into AI prompts) and `HierarchyTreePanel`, which renders the
     * room's children in the data workbench tree. Both read the bare lookup, so
     * a room the furniture writer had never touched displayed as an EMPTY room
     * rather than an unknown one.
     *
     * NO BOUNDARY MARK IS CONSULTED, deliberately: `contains` is id-keyed, and
     * {@link invalidateRegionConclusionsForMovedElement} names it among the
     * families a move must leave alone — a moved bounding wall does not move the
     * furniture. Its only refusal is the `hosts` one.
     *
     * Complexity: O(k) in the edges from this room.
     */
    getContainedElements(roomId: string): ContainedElementsQuery {
        const containedIds = [...new Set(this.getTargets(roomId, 'contains'))];
        if (containedIds.length > 0) return { ok: true, roomId, containedIds };
        if (this._containsCovered.has(roomId)) return { ok: true, roomId, containedIds: [] };
        return {
            ok: false,
            roomId,
            reason: 'room-unknown-to-contains-writer',
            detail:
                `contains lookup for room ${roomId}: the graph holds no contains edge from this ` +
                `id and the furniture writer has never covered it (the id may not be a room; the ` +
                `room may exist and have never had anything placed in it; or the project was ` +
                `restored from a slice and no writer has run since — the coverage mark is ` +
                `derived state and is not serialized). This is NO ANSWER, not "the room is ` +
                `empty" — C71 §4.4, C78 §1.4.`,
        };
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

    // ── The DEFINITION AXIS — node-kind resolution + typed readers ────────────

    /**
     * C71 §1.5 semantic 7 — which SIDE of a definition-axis family this id sits
     * on, and therefore WHAT KIND OF THING it is.
     *
     * ⛔ It never looks at the id itself. Two DECLARED sources decide: the
     * coverage marks (taken at the writer, from
     * {@link DEFINITION_AXIS_ENDPOINT_KINDS}) and the id's POSITION in this
     * family's existing edges. Both are declarations; an id prefix is not, and
     * C71 §1.5 forbids it — the prefix set is `ElementType` and contains no
     * *definition*.
     *
     * SOURCE WINS WHEN BOTH APPLY, and that is a decision rather than an
     * accident: `specializes` and `dependsOnDefinition` legitimately have MIDDLE
     * nodes (a T2 type refines a T1 type and is refined by a T3; a definition
     * nests one definition and is nested by another), so an id can honestly be
     * both. The forward reading is preferred because it matches the directional
     * `source → target` sense every existing `getTargets(id, type)` consumer
     * uses — and the choice is never silent: the surface that routes on this
     * REPORTS the direction it took (`GraphQueryService`'s `direction` field).
     *
     * @returns the resolved side and node kind, or `null` when neither a mark nor
     *   an edge places this id on either side — the refusal C71 §1.5 exists to
     *   make possible, because guessing a direction is the silently wrong answer.
     */
    resolveDefinitionAxisNodeKind(
        id: string,
        family: DefinitionAxisRelationshipType,
    ): { readonly side: 'source' | 'target'; readonly nodeKind: GraphNodeKind } | null {
        const kinds = DEFINITION_AXIS_ENDPOINT_KINDS[family];
        const marks = this._definitionAxisMarks(family);
        const hasOut = this.getTargets(id, family).length > 0;
        const hasIn = this.getSources(id, family).length > 0;
        if (hasOut || marks.source.has(id)) return { side: 'source', nodeKind: kinds.source };
        if (hasIn || marks.target.has(id)) {
            return { side: 'target', nodeKind: this._definitionAxisTargetKind(id, family) };
        }
        return null;
    }

    /** The (source-side, target-side) coverage marks for one definition-axis family. */
    private _definitionAxisMarks(
        family: DefinitionAxisRelationshipType,
    ): { readonly source: ReadonlySet<string>; readonly target: ReadonlySet<string> } {
        if (family === 'instantiates') {
            return { source: this._instantiatesCoveredInstances, target: this._instantiatesCoveredDefinitions };
        }
        if (family === 'specializes') {
            return { source: this._specializesCoveredTypes, target: this._specializesCoveredParents };
        }
        return { source: this._definitionDependencyCovered, target: this._definitionDependencyCovered };
    }

    /**
     * The declared kind of an id sitting on the TARGET side of a family.
     *
     * `specializes` is the only family with two legal target kinds, and the
     * writer records which one it created in `metadata.parentKind` — so this
     * reads the DECLARATION off the edge rather than deducing it. Narrowed, never
     * cast: `metadata` is `string | number | boolean`, and an unexpected value
     * falls back to the family's first declared target kind rather than being
     * asserted into the union.
     */
    private _definitionAxisTargetKind(
        id: string,
        family: DefinitionAxisRelationshipType,
    ): GraphNodeKind {
        const declared = DEFINITION_AXIS_ENDPOINT_KINDS[family].target;
        if (family !== 'specializes') return declared[0]!;
        for (const rel of this.getRelationships(id, 'specializes')) {
            if (rel.targetId !== id) continue;
            const k = rel.metadata?.['parentKind'];
            if (k === 'type' || k === 'definition') return k;
        }
        return 'definition';
    }

    /** The shared prose every definition-axis refusal appends, so no refusal is a dead end. */
    private _definitionAxisRefusalDetail(id: string, family: DefinitionAxisRelationshipType): string {
        return (
            `${family} lookup for ${id}: the graph holds no ${family} edge touching this id and no ` +
            `definition-axis writer has covered it (the id may not be a ${DEFINITION_AXIS_ENDPOINT_KINDS[family].source} ` +
            `or a ${DEFINITION_AXIS_ENDPOINT_KINDS[family].target.join('/')}; the node may exist and have no ` +
            `${family} relationship yet; or the project was restored from a slice and no writer has run ` +
            `since — the coverage marks are derived state and are not serialized, though the EDGES are ` +
            `persist-only and do come back). This is NO ANSWER, not an empty set — C71 §4.4, C78 §1.4.`
        );
    }

    /**
     * C71 §2.7 — `instantiates`, FORWARD: "what definition is this occurrence of?"
     *
     * CONSUMER: the property panel's *what is this thing?* row, the schedule
     * (C28) and IFC entity resolution (C25). Without it an instance's definition
     * is recoverable only by reading a field nothing else can traverse.
     *
     * SINGLE-VALUED: two edges is CORRUPTION, not a richer answer, and it refuses
     * — the `getHostWall` `multiple-hosts` shape (C15 §1).
     */
    getInstantiatedDefinition(instanceId: string): InstantiatedDefinitionQuery {
        const definitionIds = [...new Set(this.getTargets(instanceId, 'instantiates'))];
        if (definitionIds.length === 1) return { ok: true, instanceId, definitionId: definitionIds[0]! };
        if (definitionIds.length > 1) {
            return {
                ok: false,
                instanceId,
                reason: 'instance-instantiates-multiple-definitions',
                detail:
                    `instantiates lookup for instance ${instanceId}: the graph holds ${definitionIds.length} ` +
                    `definitions for one occurrence (${definitionIds.join(', ')}). An occurrence is minted ` +
                    `from exactly one definition, so this is CORRUPTION, not a richer answer, and picking ` +
                    `one would make the corruption invisible — C15 §1's multiple-hosts shape.`,
            };
        }
        return {
            ok: false,
            instanceId,
            reason: 'id-unknown-to-instantiates-writer',
            detail: this._definitionAxisRefusalDetail(instanceId, 'instantiates'),
        };
    }

    /**
     * C71 §2.7 — `instantiates`, REVERSE: "which instances exist over this
     * definition?"
     *
     * ⭐ THE ACCEPTANCE READER. `{ok:true, instanceIds:[]}` is the positive
     * answer C65 §3.6 needs before a definition edit propagates ("this will
     * affect 0 placed instances"), and it is a different fact from a refusal —
     * which is what an id no writer ever covered gets.
     */
    getInstancesOfDefinition(definitionId: string): DefinitionInstancesQuery {
        const instanceIds = [...new Set(this.getSources(definitionId, 'instantiates'))];
        if (instanceIds.length > 0) return { ok: true, definitionId, instanceIds };
        if (this._instantiatesCoveredDefinitions.has(definitionId)) {
            return { ok: true, definitionId, instanceIds: [] };
        }
        return {
            ok: false,
            definitionId,
            reason: 'id-unknown-to-instantiates-writer',
            detail: this._definitionAxisRefusalDetail(definitionId, 'instantiates'),
        };
    }

    /** C71 §2.7 — `specializes`, FORWARD: "what does this type refine?" Single-valued. */
    getSpecializedParent(typeId: string): SpecializedParentQuery {
        const parentIds = [...new Set(this.getTargets(typeId, 'specializes'))];
        if (parentIds.length === 1) {
            const parentId = parentIds[0]!;
            return { ok: true, typeId, parentId, parentKind: this._definitionAxisTargetKind(parentId, 'specializes') };
        }
        if (parentIds.length > 1) {
            return {
                ok: false,
                typeId,
                reason: 'type-specializes-multiple-parents',
                detail:
                    `specializes lookup for type ${typeId}: the graph holds ${parentIds.length} parents ` +
                    `(${parentIds.join(', ')}). C65's tiering is a TREE — a type refines exactly one ` +
                    `definition or one parent type — so this is corruption, and choosing one would hide it.`,
            };
        }
        return {
            ok: false,
            typeId,
            reason: 'id-unknown-to-specializes-writer',
            detail: this._definitionAxisRefusalDetail(typeId, 'specializes'),
        };
    }

    /**
     * C71 §2.7 — `specializes`, REVERSE: "which types exist over this definition
     * or type?" The count C65 §3.6 requires the UI to state BEFORE an edit
     * propagates.
     */
    getSpecializationsOf(parentId: string): SpecializationsQuery {
        const typeIds = [...new Set(this.getSources(parentId, 'specializes'))];
        if (typeIds.length > 0) return { ok: true, parentId, typeIds };
        if (this._specializesCoveredParents.has(parentId)) return { ok: true, parentId, typeIds: [] };
        return {
            ok: false,
            parentId,
            reason: 'id-unknown-to-specializes-writer',
            detail: this._definitionAxisRefusalDetail(parentId, 'specializes'),
        };
    }

    /** C71 §2.7 — `dependsOnDefinition`, FORWARD: "what does this definition nest or reuse?" */
    getDefinitionDependencies(definitionId: string): DefinitionDependenciesQuery {
        const dependsOnIds = [...new Set(this.getTargets(definitionId, 'dependsOnDefinition'))];
        if (dependsOnIds.length > 0) return { ok: true, definitionId, dependsOnIds };
        if (this._definitionDependencyCovered.has(definitionId)) {
            return { ok: true, definitionId, dependsOnIds: [] };
        }
        return {
            ok: false,
            definitionId,
            reason: 'id-unknown-to-dependsOnDefinition-writer',
            detail: this._definitionAxisRefusalDetail(definitionId, 'dependsOnDefinition'),
        };
    }

    /**
     * C71 §2.7 — `dependsOnDefinition`, REVERSE: *"what breaks if this definition
     * changes or is deleted?"* The consumer the contract names for this family.
     *
     * ⚠ DEDUPED BY DEFINITION, not by edge: two slots nesting the same definition
     * are two EDGES (that is why the family is author-keyed) but ONE answer to
     * "what breaks" — reporting the same dependent twice would overstate the
     * blast radius.
     */
    getDefinitionDependents(definitionId: string): DefinitionDependentsQuery {
        const dependentIds = [...new Set(this.getSources(definitionId, 'dependsOnDefinition'))];
        if (dependentIds.length > 0) return { ok: true, definitionId, dependentIds };
        if (this._definitionDependencyCovered.has(definitionId)) {
            return { ok: true, definitionId, dependentIds: [] };
        }
        return {
            ok: false,
            definitionId,
            reason: 'id-unknown-to-dependsOnDefinition-writer',
            detail: this._definitionAxisRefusalDetail(definitionId, 'dependsOnDefinition'),
        };
    }

    /**
     * C71 §2.7 obligation 4 — the DEFINITION half of the delete behaviour.
     *
     * ⛔ Deleting a definition is a REFUSAL question, never a cascade one:
     * deleting it MUST NOT delete the user's placed elements. This hands the
     * deleting command BOTH numbers so it can refuse with them (the C65 §3.4
     * shape — instances resolve to a visible, named unresolved state, never a
     * silent default and never a silent cascade).
     *
     * ⚠ An id the graph has never heard of REFUSES rather than returning
     * `{ok:true}`. A confident "nothing depends on this, delete away" derived
     * from *no data* is the most dangerous possible reading of `[]` in this file,
     * because the consequence is destructive and irreversible in the user's eyes.
     */
    getDefinitionDeleteDisposition(definitionId: string): DefinitionDeleteDisposition {
        // Read the two edge sets and the two marks DIRECTLY rather than through
        // the readers above. Not a duplicate source of truth: the readers exist
        // to give a CALLER the failure/emptiness distinction, and this method
        // makes exactly the same distinction one level down, once, for both
        // families at a time — routing through them would mean mapping two
        // refusal unions into one and would state each mark twice.
        const instanceIds = [...new Set(this.getSources(definitionId, 'instantiates'))];
        const dependentIds = [...new Set(this.getSources(definitionId, 'dependsOnDefinition'))];
        const known =
            instanceIds.length > 0 ||
            dependentIds.length > 0 ||
            this._instantiatesCoveredDefinitions.has(definitionId) ||
            this._definitionDependencyCovered.has(definitionId);
        if (!known) {
            return {
                ok: false,
                definitionId,
                reason: 'definition-axis-node-kind-undetermined',
                instanceIds: [],
                dependentIds: [],
                detail:
                    `definition-delete disposition for ${definitionId}: NO definition-axis writer has ` +
                    `covered this id, so neither "which instances exist over it" nor "what depends on it" ` +
                    `has an established answer. This is NO ANSWER, not "nothing depends on it" — and the ` +
                    `difference matters here more than anywhere else in this file, because acting on the ` +
                    `wrong one destroys placed elements. ` +
                    this._definitionAxisRefusalDetail(definitionId, 'instantiates'),
            };
        }
        if (instanceIds.length > 0) {
            return {
                ok: false,
                definitionId,
                reason: 'definition-has-live-instances',
                instanceIds,
                dependentIds,
                detail:
                    `definition ${definitionId} has ${instanceIds.length} placed instance(s) ` +
                    `(${instanceIds.join(', ')}). C71 §2.7 obligation 4: deleting a definition MUST NOT ` +
                    `delete instances. Either refuse, or resolve the instances to a visible, named ` +
                    `UNRESOLVED state first (C65 §3.4) — never a silent default, never a silent cascade.`,
            };
        }
        if (dependentIds.length > 0) {
            return {
                ok: false,
                definitionId,
                reason: 'definition-has-dependents',
                instanceIds,
                dependentIds,
                detail:
                    `definition ${definitionId} is nested or reused by ${dependentIds.length} other ` +
                    `definition(s) (${dependentIds.join(', ')}). Those definitions break if it is deleted — ` +
                    `the question C71 §2.7 gives dependsOnDefinition its consumer for.`,
            };
        }
        return { ok: true, definitionId };
    }

    /**
     * C71 §2.7 — the CYCLE question for `dependsOnDefinition`: does this
     * definition transitively contain itself?
     *
     * A definition graph without this edge cannot ask it at all, and
     * `family-runtime`'s cycle detection covers EXPRESSIONS, not definitions —
     * two different graphs, and C71 §4.3 forbids inferring one's coverage from
     * the other.
     *
     * Returns the ORDERED path with the repeated id last, so a caller can name
     * the loop rather than report that one exists. Depth-first, iterative, and
     * bounded by the node count — a cyclic graph is exactly what this walks.
     */
    findDefinitionDependencyCycle(definitionId: string): DefinitionCycleQuery {
        if (this.resolveDefinitionAxisNodeKind(definitionId, 'dependsOnDefinition') === null) {
            return {
                ok: false,
                definitionId,
                reason: 'id-unknown-to-dependsOnDefinition-writer',
                detail: this._definitionAxisRefusalDetail(definitionId, 'dependsOnDefinition'),
            };
        }
        const path: string[] = [];
        const onPath = new Set<string>();
        const done = new Set<string>();
        const walk = (id: string): readonly string[] | null => {
            if (onPath.has(id)) return [...path.slice(path.indexOf(id)), id];
            if (done.has(id)) return null;
            onPath.add(id);
            path.push(id);
            for (const next of new Set(this.getTargets(id, 'dependsOnDefinition'))) {
                const found = walk(next);
                if (found) return found;
            }
            path.pop();
            onPath.delete(id);
            done.add(id);
            return null;
        };
        return { ok: true, definitionId, cycle: walk(definitionId) };
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
        this._containsCovered.clear();
        this._adjacencyCovered.clear();
        this._boundaryUndetermined.clear();
        // C71 §2.7 — the definition-axis marks are derived state with the same
        // disposition as every mark above: a project switch must not let one
        // project's definitions answer for another's.
        this._instantiatesCoveredInstances.clear();
        this._instantiatesCoveredDefinitions.clear();
        this._specializesCoveredTypes.clear();
        this._specializesCoveredParents.clear();
        this._definitionDependencyCovered.clear();
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
