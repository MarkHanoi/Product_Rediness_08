/**
 * §PARTOF-IS-A-PROJECTION — executed controls for ADR-0328.
 *
 * These are not coverage. Each one is a claim the ruling makes that would be
 * FALSE under a plausible wrong implementation, and the two load-bearing ones
 * were watched RED before they were watched green:
 *
 *   1. "the projection reflects hierarchyStore" — RED against an emit-only
 *      writer (the C71 §7.e shape): reparenting a node leaves the stale edge in
 *      place and the reader names BOTH parents.
 *   2. "no independent state was introduced" — RED against any implementation
 *      that answers from stored edges instead of re-deriving: a `partOf` edge
 *      written straight into the graph becomes an answer, and the graph has
 *      invented a containment nobody recorded in the substrate.
 *
 * The substrate is a plain mutable object driven by the test, and the graph is a
 * REAL SemanticGraphManager — not a mock. A control that cannot fail is not a
 * control, and a control against a fake graph proves only that the fake agrees.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { SemanticGraphManager } from '../SemanticGraph.js';
import {
    PartOfProjection,
    derivePartOfEdges,
    partOfCitizens,
    type PartOfSubstrateSnapshot,
    type PartOfSubstrateNode,
    type PartOfSubstrateRoom,
} from './PartOfProjection.js';

const SITE = 'site-1';
const BLD = 'bld-1';
const L0 = 'level-0';
const L1 = 'level-1';
const UNIT_A = 'unit-a';
const UNIT_B = 'unit-b';
const ROOM_1 = 'room-1';
const ROOM_2 = 'room-2';

describe('PartOfProjection — partOf is DERIVED from the hierarchy substrate (ADR-0328)', () => {
    let graph: SemanticGraphManager;
    let nodes: PartOfSubstrateNode[];
    let rooms: PartOfSubstrateRoom[] | null;
    let projection: PartOfProjection;

    const snapshot = (): PartOfSubstrateSnapshot => ({ nodes: [...nodes], rooms: rooms === null ? null : [...rooms] });

    beforeEach(() => {
        graph = new SemanticGraphManager();
        nodes = [
            { id: SITE },
            { id: BLD, parentId: SITE },
            { id: L0, parentId: BLD },
            { id: L1, parentId: BLD },
            { id: UNIT_A, parentId: L0 },
            { id: UNIT_B, parentId: L1 },
        ];
        rooms = [
            { id: ROOM_1, unitId: UNIT_A },
            { id: ROOM_2 }, // deliberately unassigned
        ];
        projection = new PartOfProjection(graph, snapshot);
    });

    // ── CONTROL 1 — the projection FOLLOWS the substrate ─────────────────────

    it('derives the whole chain from parentId, with no writer ever having run', () => {
        expect(projection.getParentOf(UNIT_A)).toEqual({ ok: true, elementId: UNIT_A, parentIds: [L0] });
        expect(projection.getParentOf(L0)).toEqual({ ok: true, elementId: L0, parentIds: [BLD] });
        expect(projection.getParentOf(BLD)).toEqual({ ok: true, elementId: BLD, parentIds: [SITE] });
    });

    it('⭐ REPARENT — moving a node in the substrate moves the edge, and does NOT leave the old one', () => {
        const before = projection.getParentOf(UNIT_A);
        expect(before).toEqual({ ok: true, elementId: UNIT_A, parentIds: [L0] });

        // The substrate — and ONLY the substrate — is changed.
        nodes = nodes.map((n) => (n.id === UNIT_A ? { id: UNIT_A, parentId: L1 } : n));

        const after = projection.getParentOf(UNIT_A);
        expect(after).toEqual({ ok: true, elementId: UNIT_A, parentIds: [L1] });
        // The RED half: an emit-only writer would answer [L0, L1] here.
        expect(after.ok && after.parentIds).not.toContain(L0);
        expect(graph.getSources(L0, 'partOf')).not.toContain(UNIT_A);
        expect(graph.getSources(L1, 'partOf')).toContain(UNIT_A);
    });

    it('REPARENT a room — room.unitId is the substrate for room→unit and the edge follows it', () => {
        expect(projection.getParentOf(ROOM_1)).toEqual({ ok: true, elementId: ROOM_1, parentIds: [UNIT_A] });
        rooms = [{ id: ROOM_1, unitId: UNIT_B }, { id: ROOM_2 }];
        expect(projection.getParentOf(ROOM_1)).toEqual({ ok: true, elementId: ROOM_1, parentIds: [UNIT_B] });
        expect(graph.getSources(UNIT_A, 'partOf')).not.toContain(ROOM_1);
    });

    it('UNPARENT — clearing the substrate field removes the edge and leaves a POSITIVE empty answer', () => {
        expect(projection.getParentOf(ROOM_1)).toEqual({ ok: true, elementId: ROOM_1, parentIds: [UNIT_A] });
        rooms = [{ id: ROOM_1 }, { id: ROOM_2 }];
        expect(projection.getParentOf(ROOM_1)).toEqual({ ok: true, elementId: ROOM_1, parentIds: [] });
    });

    it('DELETE — a node that leaves the substrate takes its edge with it', () => {
        projection.refresh();
        expect(graph.getTargets(UNIT_B, 'partOf')).toEqual([L1]);
        nodes = nodes.filter((n) => n.id !== UNIT_B);
        projection.refresh();
        expect(graph.getTargets(UNIT_B, 'partOf')).toEqual([]);
        expect(projection.getParentOf(UNIT_B).ok).toBe(false);
    });

    // ── CONTROL 2 — NO second, independent hierarchy source of truth ─────────

    it('⭐ MUTATING ONLY THE GRAPH DOES NOT INVENT A HIERARCHY — a hand-written edge is undone', () => {
        projection.refresh();

        // Somebody authors a containment directly into the graph. The substrate
        // says nothing of the kind: ROOM_2 is unassigned.
        graph.addRelationship({ type: 'partOf', sourceId: ROOM_2, targetId: UNIT_B, createdBy: 'rogue' });
        expect(graph.getTargets(ROOM_2, 'partOf')).toEqual([UNIT_B]); // it really is in there

        // The RED half: a reader that answers from stored edges reports UNIT_B.
        expect(projection.getParentOf(ROOM_2)).toEqual({ ok: true, elementId: ROOM_2, parentIds: [] });
        // …and the edge does not survive the read that disagreed with it.
        expect(graph.getTargets(ROOM_2, 'partOf')).toEqual([]);
    });

    it('a hand-written edge cannot promote a NON-citizen into an answerable id', () => {
        graph.addRelationship({ type: 'partOf', sourceId: 'ghost-9', targetId: UNIT_A, createdBy: 'rogue' });
        const q = projection.getParentOf('ghost-9');
        expect(q.ok).toBe(false);
        expect(q.ok === false && q.reason).toBe('element-not-in-hierarchy-substrate');
        // Citizenship is decided by the substrate, never by the graph.
        expect(projection.isCitizen('ghost-9')).toBe(false);
        expect(partOfCitizens(snapshot()).has('ghost-9')).toBe(false);
    });

    it('the projection never writes back — reading does not create hierarchy nodes or fields', () => {
        const nodesBefore = JSON.stringify(nodes);
        const roomsBefore = JSON.stringify(rooms);
        projection.getParentOf(ROOM_2);
        projection.getMembersOf(UNIT_A);
        projection.refresh();
        expect(JSON.stringify(nodes)).toBe(nodesBefore);
        expect(JSON.stringify(rooms)).toBe(roomsBefore);
    });

    // ── Idempotence — a derivation, not an accumulation ──────────────────────

    it('a second refresh over an unchanged substrate mutates nothing', () => {
        const first = projection.refresh();
        expect(first.added).toBeGreaterThan(0);
        const second = projection.refresh();
        expect(second).toMatchObject({ added: 0, removed: 0 });
        expect(second.derived).toBe(first.derived);
    });

    it('reports the removal it performed, so an independent writer is VISIBLE and not merely undone', () => {
        projection.refresh();
        graph.addRelationship({ type: 'partOf', sourceId: ROOM_2, targetId: UNIT_B, createdBy: 'rogue' });
        expect(projection.refresh()).toMatchObject({ added: 0, removed: 1 });
    });

    // ── C71 §4.4 — refusal vs a positive empty answer ────────────────────────

    it('a ROOT has no parent and says so POSITIVELY; an unknown id REFUSES', () => {
        expect(projection.getParentOf(SITE)).toEqual({ ok: true, elementId: SITE, parentIds: [] });
        const unknown = projection.getParentOf('not-an-element');
        expect(unknown.ok).toBe(false);
        expect(unknown.ok === false && unknown.reason).toBe('element-not-in-hierarchy-substrate');
        expect(unknown.ok === false && unknown.detail).toContain('NO ANSWER');
    });

    it('ABSENCE is answerable — the query ADR-0325 held an edge could never serve', () => {
        // "which rooms are in no unit" — derivable because the projection is
        // TOTAL over the substrate it read, not because an edge exists.
        const unassigned = (rooms ?? []).filter((r) => {
            const q = projection.getParentOf(r.id);
            return q.ok && q.parentIds.length === 0;
        });
        expect(unassigned.map((r) => r.id)).toEqual([ROOM_2]);
    });

    // ── §CONTEXT-DATA-HONESTY — unreadable is not empty ──────────────────────

    it('⭐ an UNREADABLE room substrate refuses, and does NOT delete loader-rebuilt room edges', () => {
        projection.refresh();
        expect(graph.getTargets(ROOM_1, 'partOf')).toEqual([UNIT_A]);

        rooms = null; // the room store is not registered

        const q = projection.getParentOf(ROOM_1);
        expect(q.ok).toBe(false);
        expect(q.ok === false && q.reason).toBe('hierarchy-substrate-unreadable');

        const stats = projection.refresh();
        expect(stats.roomsVisible).toBe(false);
        // The half it could not see is left alone rather than swept as absent.
        expect(graph.getTargets(ROOM_1, 'partOf')).toEqual([UNIT_A]);
        // The half it CAN see is still reconciled.
        expect(graph.getTargets(UNIT_A, 'partOf')).toEqual([L0]);
    });

    // ── The reverse read ─────────────────────────────────────────────────────

    it('getMembersOf answers over the same derivation as getParentOf', () => {
        expect(projection.getMembersOf(UNIT_A)).toEqual({ ok: true, parentId: UNIT_A, memberIds: [ROOM_1] });
        expect(projection.getMembersOf(BLD)).toEqual({ ok: true, parentId: BLD, memberIds: [L0, L1] });
        expect(projection.getMembersOf(UNIT_B)).toEqual({ ok: true, parentId: UNIT_B, memberIds: [] });
        expect(projection.getMembersOf('not-an-element').ok).toBe(false);
    });

    // ── The pure derivation ──────────────────────────────────────────────────

    it('derivePartOfEdges is pure, total and drops corrupt links', () => {
        const edges = derivePartOfEdges({
            nodes: [
                { id: 'a' },
                { id: 'b', parentId: 'a' },
                { id: 'c', parentId: 'c' }, // self-link
                { id: 'd', parentId: '' }, // blank
                { id: 'b', parentId: 'a' }, // duplicate
            ],
            rooms: [{ id: 'r', unitId: 'b' }],
        });
        expect(edges).toEqual([
            { childId: 'b', parentId: 'a' },
            { childId: 'r', parentId: 'b' },
        ]);
    });

    it('derivePartOfEdges over a null room half derives the node half only', () => {
        const edges = derivePartOfEdges({ nodes: [{ id: 'b', parentId: 'a' }], rooms: null });
        expect(edges).toEqual([{ childId: 'b', parentId: 'a' }]);
    });
});
