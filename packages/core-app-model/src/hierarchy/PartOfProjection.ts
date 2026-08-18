/**
 * §PARTOF-IS-A-PROJECTION — `partOf` is DERIVED from the hierarchy substrate,
 * never authored beside it.
 *
 * ADR-0328 (founder ruling, 2026-08-17), which supersedes ADR-0325 ¶1 (in part),
 * ¶2 and ¶4. C71 §2.1 #8 · §2.5 · §3.4 · §4.4 · §7.e/§7.h.
 *
 * ── THE RULING THIS FILE IMPLEMENTS ──────────────────────────────────────────
 *
 *   "parentId = storage/implementation substrate. partOf = graph-level semantic
 *    relationship. Do NOT create a second independent hierarchy source of truth.
 *    Graph projection should be DERIVED FROM the hierarchy store rather than
 *    maintained independently."
 *
 * So there is exactly ONE hierarchy source of truth and it is NOT this file:
 *   • `hierarchyStore` + `parentId`  — site / building / level / unit structure
 *   • `room.unitId`                  — room → unit containment
 *
 * The `partOf` edges in the SemanticGraph are a PROJECTION of those two fields.
 * They are re-derived, never accumulated. {@link PartOfProjection.refresh}
 * RECONCILES the graph to the derivation: every `partOf` edge the substrate does
 * not imply is REMOVED, including one written directly into the graph by
 * something else. That is the structural guarantee that no rival hierarchy can
 * come into existence — an independent write does not survive the next read.
 *
 * ── WHY THIS IS NOT THE `sitsOn` DEFECT (C71 §7.a / §2.5) ────────────────────
 *
 * C71 §2.5 forbids shipping a writer to satisfy a coverage gate. This writer is
 * not that. Before it existed, `partOf` was emitted ONLY by the loader's
 * reconstruction (`rebuildSemanticGraph`), so a room assigned to a unit
 * mid-session carried NO edge until the project was reloaded and the graph
 * disagreed with the authoritative field for the whole session. That
 * disagreement is the defect, and a projection is what removes it: derived state
 * cannot lag the field it is derived from.
 *
 * The FIRST CONSUMER §2.5 demands is `GraphQueryService.query(id, 'partOf')` —
 * the AI query surface, which until now REFUSED the question outright
 * (`hierarchy-not-in-graph`) because the edge could not be trusted. It can be
 * trusted now, so it is answered.
 *
 * ── WHY THE READ REFRESHES (and why that is not a side effect worth avoiding) ─
 *
 * A projection that is refreshed by its writers alone is a CACHE, and a cache is
 * the second record this ruling forbids: it can be stale, and stale is how two
 * records of one fact come to disagree. Refreshing at the READ makes staleness
 * structurally impossible — the answer is computed from the substrate at the
 * moment it is asked. The reconcile is a DIFF, so a substrate that has not moved
 * performs zero mutations.
 *
 * ── §CONTEXT-DATA-HONESTY: "no rooms" AND "cannot see rooms" ARE NOT ONE VALUE ─
 *
 * {@link PartOfSubstrateSnapshot.rooms} is `null` — not `[]` — when the room
 * store is not registered. A snapshot that reported an unreadable substrate as
 * empty would make this projection DELETE every room→unit edge the loader
 * rebuilt, and call it a derivation. With `rooms: null` the reconcile narrows to
 * the half it can actually see (hierarchy nodes) and the reader REFUSES a room
 * question rather than answering `[]`.
 *
 * ── WHAT THIS FILE DELIBERATELY DOES NOT DO ──────────────────────────────────
 *
 *   • It does not write `parentId` or `unitId`. The projection is one-way. A
 *     `partOf` edge is never a place to record a decision.
 *   • It does not persist. `partOf` keeps its REGENERATED-by-the-loader
 *     disposition (`rebuildSemanticGraph` rebuilds it from `room.unitId`), and a
 *     refresh reproduces exactly the same edges, so load and projection agree.
 *   • It does not unpark `unitOf` / `levelOf`. They stay parked (C71 §2.2), and
 *     `GraphQueryService` still refuses them.
 */

import { hierarchyStore } from './HierarchyStore.js';
import { storeRegistry } from '../StoreRegistry.js';
import { semanticGraphManager, type SemanticGraphManager } from '../SemanticGraph.js';

// ─────────────────────────────────────────────────────────────────────────────
// The substrate, as this projection needs to see it
// ─────────────────────────────────────────────────────────────────────────────

/** A hierarchy node (site / building / level / unit) as `hierarchyStore` holds it. */
export interface PartOfSubstrateNode {
    readonly id: string;
    /** The SOLE structural link. `undefined` on a root (a site). */
    readonly parentId?: string | undefined;
}

/** A room, as the room store holds it. `unitId` is the authoritative field. */
export interface PartOfSubstrateRoom {
    readonly id: string;
    /** `undefined` on an unassigned room — a POSITIVE fact, not a missing one. */
    readonly unitId?: string | undefined;
}

/**
 * One reading of the hierarchy substrate.
 *
 * `rooms: null` means THE ROOM SUBSTRATE COULD NOT BE READ — never "there are no
 * rooms". The two are different facts and this projection behaves differently on
 * each; collapsing them would let an unreadable store look like an empty one and
 * delete correct edges.
 */
export interface PartOfSubstrateSnapshot {
    readonly nodes: readonly PartOfSubstrateNode[];
    readonly rooms: readonly PartOfSubstrateRoom[] | null;
}

/** One derived edge: `childId --partOf--> parentId`. */
export interface DerivedPartOfEdge {
    readonly childId: string;
    readonly parentId: string;
}

/** What one {@link PartOfProjection.refresh} did. */
export interface PartOfProjectionStats {
    /** Ids the snapshot could see — the set over which the reader can answer. */
    readonly citizens: number;
    /** Edges the substrate implies. */
    readonly derived: number;
    /** Edges written because the substrate implies them and the graph lacked them. */
    readonly added: number;
    /**
     * Edges removed because the substrate does NOT imply them. A non-zero value
     * with `added === 0` and an unchanged substrate means something wrote a
     * `partOf` edge independently and the projection has just undone it.
     */
    readonly removed: number;
    /** False when `rooms` was null — the reconcile was narrowed to nodes only. */
    readonly roomsVisible: boolean;
}

/** Why a `partOf` question has NO answer (C71 §4.4 — never an empty one). */
export type PartOfRefusalReason =
    /** The id is in neither `hierarchyStore` nor the room store. */
    | 'element-not-in-hierarchy-substrate'
    /** The room store is not registered, so a room question cannot be settled. */
    | 'hierarchy-substrate-unreadable';

/** `getParentOf` — the forward read (child → parent). */
export type PartOfParentQuery =
    | {
          readonly ok: true;
          readonly elementId: string;
          /**
           * `[]` is a POSITIVE answer here and only here: the element IS a
           * hierarchy citizen and genuinely has no parent (a root site, or a
           * room assigned to no unit). This is the ABSENCE set ADR-0325 held
           * an edge could never express — a projection can, because it is
           * TOTAL over the substrate it read.
           */
          readonly parentIds: readonly string[];
      }
    | {
          readonly ok: false;
          readonly elementId: string;
          readonly reason: PartOfRefusalReason;
          readonly detail: string;
      };

/** `getMembersOf` — the reverse read (parent → children). */
export type PartOfMembersQuery =
    | { readonly ok: true; readonly parentId: string; readonly memberIds: readonly string[] }
    | {
          readonly ok: false;
          readonly parentId: string;
          readonly reason: PartOfRefusalReason;
          readonly detail: string;
      };

// ─────────────────────────────────────────────────────────────────────────────
// The derivation — PURE. Substrate in, edges out. No graph, no store, no I/O.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The whole semantic of `partOf`, as one total function of the substrate.
 *
 * Deterministic and order-stable. Self-links (`parentId === id`) and blank ids
 * are dropped rather than emitted: a corrupt `parentId` must not become a graph
 * edge asserting that a level is part of itself.
 *
 * ⚠ The pair key is joined on `\u0000` — written as a SOURCE ESCAPE, never as a
 * literal control byte in this file. A NUL cannot occur inside an element id, so
 * it is the one separator that cannot make two different pairs collide onto one
 * key; a raw one in the source would make the file BINARY to git and grep.
 */
export function derivePartOfEdges(snapshot: PartOfSubstrateSnapshot): readonly DerivedPartOfEdge[] {
    const out: DerivedPartOfEdge[] = [];
    const seen = new Set<string>();
    const push = (childId: string | undefined, parentId: string | undefined): void => {
        if (typeof childId !== 'string' || childId.length === 0) return;
        if (typeof parentId !== 'string' || parentId.length === 0) return;
        if (childId === parentId) return;
        const key = `${childId}\u0000${parentId}`;
        if (seen.has(key)) return;
        seen.add(key);
        out.push({ childId, parentId });
    };
    for (const node of snapshot.nodes) push(node.id, node.parentId);
    for (const room of snapshot.rooms ?? []) push(room.id, room.unitId);
    return out;
}

/**
 * Every id the snapshot can make a statement about. Membership here is what
 * separates `{ ok: true, parentIds: [] }` from a refusal — the reader asks the
 * SUBSTRATE whether it knows the id, never the graph, so an edge written
 * independently can never promote an id into a citizen.
 */
export function partOfCitizens(snapshot: PartOfSubstrateSnapshot): ReadonlySet<string> {
    const ids = new Set<string>();
    for (const node of snapshot.nodes) if (node.id) ids.add(node.id);
    for (const room of snapshot.rooms ?? []) if (room.id) ids.add(room.id);
    return ids;
}

// ─────────────────────────────────────────────────────────────────────────────
// The projection
// ─────────────────────────────────────────────────────────────────────────────

const REFUSAL_SUBSTRATE = (id: string, verb: string): string =>
    `${verb} for ${id}: the hierarchy substrate (hierarchyStore + parentId, and room.unitId) ` +
    `does not know this id, so it has no partOf answer. This is NO ANSWER, not "part of nothing" ` +
    `(C71 §4.4). partOf is DERIVED from that substrate (ADR-0328) — an id absent from it cannot ` +
    `be given a containment by writing a graph edge.`;

const REFUSAL_UNREADABLE = (id: string, verb: string): string =>
    `${verb} for ${id}: the ROOM half of the hierarchy substrate could not be read (no 'room' ` +
    `store is registered with storeRegistry), so a room→unit answer cannot be established. ` +
    `Reporting an unreadable substrate as empty would make "nobody can see the rooms" and "this ` +
    `room is in no unit" the same value (§CONTEXT-DATA-HONESTY, C71 §4.4).`;

/**
 * The `partOf` projection over a SemanticGraph.
 *
 * Both the substrate reader and the graph are injected, so the derivation can be
 * driven against a real {@link SemanticGraphManager} in a test without any
 * global store — the controls that prove this projection follows the substrate
 * are only meaningful if the substrate can be moved under it.
 */
export class PartOfProjection {
    private readonly _graph: SemanticGraphManager;
    private readonly _readSubstrate: () => PartOfSubstrateSnapshot;

    constructor(graph: SemanticGraphManager, readSubstrate: () => PartOfSubstrateSnapshot) {
        this._graph = graph;
        this._readSubstrate = readSubstrate;
    }

    /**
     * THE WRITER (C71 §3.4) — reconcile the graph's `partOf` edges to the
     * substrate's derivation, as ONE operation.
     *
     * Remove-and-re-emit rather than emit-only, for the reason C71 §7.e names:
     * `addRelationship` is idempotent, so an emit-only writer lets an element
     * that STOPS being contained keep its stale edge forever. It is expressed as
     * a DIFF so an unchanged substrate performs zero mutations and the graph's
     * edge ids stay stable across reads.
     *
     * SCOPE, when `rooms` is null: only edges SOURCED AT AN ID THE SNAPSHOT CAN
     * SEE are swept. Sweeping everything on a partial reading would delete the
     * loader-rebuilt room→unit edges on the grounds that a store nobody
     * registered did not mention them.
     */
    refresh(): PartOfProjectionStats {
        return this._reconcile(this._readSubstrate());
    }

    /**
     * THE READER, forward (C71 §4.4, refusal-bearing) — "what is this element
     * part of?".
     *
     * Refreshes first, so the answer is derived from the substrate AS IT IS NOW
     * and never from an edge some other path left behind.
     */
    getParentOf(elementId: string): PartOfParentQuery {
        const snapshot = this._readSubstrate();
        const refusal = this._refuse(snapshot, elementId);
        if (refusal !== null) {
            return { ok: false, elementId, reason: refusal, detail: this._detail(refusal, elementId, 'partOf lookup') };
        }
        this._reconcile(snapshot);
        return { ok: true, elementId, parentIds: this._graph.getTargets(elementId, 'partOf') };
    }

    /**
     * THE READER, reverse (C71 §4.4) — "what is part of this element?".
     *
     * This is the shape the eight `roomStore.getAll().filter(r => r.unitId ===
     * unitId)` reverse scans hand-roll today, and the shape a unit-level
     * consumer wants. It answers over the SAME derivation as the forward read,
     * so the two can never disagree.
     */
    getMembersOf(parentId: string): PartOfMembersQuery {
        const snapshot = this._readSubstrate();
        const refusal = this._refuse(snapshot, parentId);
        if (refusal !== null) {
            return { ok: false, parentId, reason: refusal, detail: this._detail(refusal, parentId, 'partOf reverse lookup') };
        }
        this._reconcile(snapshot);
        return { ok: true, parentId, memberIds: this._graph.getSources(parentId, 'partOf') };
    }

    /** Whether the substrate — not the graph — can make a statement about this id. */
    isCitizen(elementId: string): boolean {
        return partOfCitizens(this._readSubstrate()).has(elementId);
    }

    // ── internals ───────────────────────────────────────────────────────────

    private _refuse(snapshot: PartOfSubstrateSnapshot, id: string): PartOfRefusalReason | null {
        if (partOfCitizens(snapshot).has(id)) return null;
        // An id the node half does not hold, on a reading whose room half is
        // blind, is UNSETTLED rather than absent: it may well be a room.
        if (snapshot.rooms === null) return 'hierarchy-substrate-unreadable';
        return 'element-not-in-hierarchy-substrate';
    }

    private _detail(reason: PartOfRefusalReason, id: string, verb: string): string {
        return reason === 'hierarchy-substrate-unreadable'
            ? REFUSAL_UNREADABLE(id, verb)
            : REFUSAL_SUBSTRATE(id, verb);
    }

    private _reconcile(snapshot: PartOfSubstrateSnapshot): PartOfProjectionStats {
        const derived = derivePartOfEdges(snapshot);
        const wanted = new Map<string, DerivedPartOfEdge>();
        for (const edge of derived) wanted.set(`${edge.childId}\u0000${edge.parentId}`, edge);

        const roomsVisible = snapshot.rooms !== null;
        const owned = roomsVisible ? null : partOfCitizens(snapshot);

        let removed = 0;
        // `getAll()` returns a copy, so removing while iterating it is safe.
        for (const rel of this._graph.getAll()) {
            if (rel.type !== 'partOf') continue;
            if (owned !== null && !owned.has(rel.sourceId)) continue; // out of a narrowed scope
            if (wanted.delete(`${rel.sourceId}\u0000${rel.targetId}`)) continue; // already correct
            this._graph.removeRelationship(rel.id);
            removed++;
        }

        let added = 0;
        for (const edge of wanted.values()) {
            this._graph.addRelationship({
                type: 'partOf',
                sourceId: edge.childId,
                targetId: edge.parentId,
                createdBy: 'system',
            });
            added++;
        }

        return {
            citizens: partOfCitizens(snapshot).size,
            derived: derived.length,
            added,
            removed,
            roomsVisible,
        };
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// The production substrate reader + singleton
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Read the live hierarchy substrate.
 *
 * Rooms come through `storeRegistry` (registered as `'room'` by `composeRuntime`)
 * rather than by importing `@pryzm/room-topology`: that package depends on this
 * one, so a value import here would close a module cycle at load time — the
 * failure mode §SCC-NO-BARREL-ACCESS-AT-MODULE-LOAD exists to prevent. An
 * unregistered store yields `rooms: null`, which is a REFUSAL upstream, not an
 * empty set.
 */
export function readHierarchySubstrate(): PartOfSubstrateSnapshot {
    const nodes: PartOfSubstrateNode[] = hierarchyStore
        .getAll()
        .map((n) => ({ id: n.id, parentId: n.parentId }));

    const store = storeRegistry.getStoreForType('room');
    if (!store) return { nodes, rooms: null };

    const rooms: PartOfSubstrateRoom[] = [];
    for (const raw of store.getAll()) {
        if (raw === null || typeof raw !== 'object') continue;
        const rec = raw as { id?: unknown; unitId?: unknown };
        if (typeof rec.id !== 'string' || rec.id.length === 0) continue;
        rooms.push({
            id: rec.id,
            unitId: typeof rec.unitId === 'string' && rec.unitId.length > 0 ? rec.unitId : undefined,
        });
    }
    return { nodes, rooms };
}

/** The production projection — over the singleton graph and the live substrate. */
export const partOfProjection = new PartOfProjection(semanticGraphManager, readHierarchySubstrate);
