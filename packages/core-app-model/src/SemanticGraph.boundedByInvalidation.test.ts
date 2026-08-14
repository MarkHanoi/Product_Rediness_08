// §GR12-BOUNDARY-INVALIDATION (GR-12 · C71 §1.2 semantic 5 / §1.4 / §3.4; C79 §5.2)
//
// MOVE-TIME STALENESS IS THE FAILURE MODE these tests exist for — the H6
// instrument (tools/rac-conformance/certification/__tests__/graphmove.cert.ts)
// measured `boundedBy` STALE after a real wall move: the move performed no
// invalidation and the edge still named a wall that no longer bounds the room.
// The fix under test: `invalidateRegionConclusionsForMovedElement` removes the
// affected rooms' region-derived conclusions and marks them UNDETERMINED (C79
// §5.2), and `getBoundingWalls` refuses rather than answering `[]` while a room
// is marked (C71 §4.4 / §7.h; §5.2.1 — undetermined never collapses into
// preserved). The detection writer's re-emit clears the mark at the writer
// (`addRelationship`), not in a follow-up (C71 §3.4 shape).

import { describe, it, expect } from 'vitest';
import { SemanticGraphManager } from './SemanticGraph';

/** A 1-room world: R bounded by A,B,C,D; neighbour room S shares wall A. */
function seed(): SemanticGraphManager {
    const g = new SemanticGraphManager();
    for (const w of ['A', 'B', 'C', 'D']) {
        g.addRelationship({ type: 'boundedBy', sourceId: 'R', targetId: w, createdBy: 'system' });
    }
    g.addRelationship({ type: 'boundedBy', sourceId: 'S', targetId: 'A', createdBy: 'system' });
    // Bidirectional pair conclusions, exactly as DetectAllRoomsCommand emits them.
    g.addRelationship({ type: 'adjacentTo', sourceId: 'R', targetId: 'S', createdBy: 'system' });
    g.addRelationship({ type: 'adjacentTo', sourceId: 'S', targetId: 'R', createdBy: 'system' });
    g.addRelationship({ type: 'connectedTo', sourceId: 'R', targetId: 'S', createdBy: 'system' });
    g.addRelationship({ type: 'connectedTo', sourceId: 'S', targetId: 'R', createdBy: 'system' });
    // Id-keyed edges — the move-INVARIANT control arms (H6's split).
    g.addRelationship({ type: 'sitsOn', sourceId: 'A', targetId: 'L0', createdBy: 'system' });
    g.addRelationship({ type: 'hosts', sourceId: 'A', targetId: 'door-1', createdBy: 'system' });
    g.addRelationship({ type: 'hostedBy', sourceId: 'door-1', targetId: 'A', createdBy: 'system' });
    return g;
}

describe('boundedBy — move-time invalidation (invalidateRegionConclusionsForMovedElement)', () => {
    it('(a) a moved bounding wall removes the ENTIRE region-derived conclusion of every room it bounded', () => {
        const g = seed();
        const { invalidatedRoomIds } = g.invalidateRegionConclusionsForMovedElement('A');
        expect([...invalidatedRoomIds].sort()).toEqual(['R', 'S']);

        // The whole conclusion goes — not just the edge naming the moved wall —
        // because nothing is re-derived at move time (C79 §5.3: worst of edges).
        expect(g.getTargets('R', 'boundedBy')).toEqual([]);
        expect(g.getTargets('S', 'boundedBy')).toEqual([]);
        expect(g.getTargets('R', 'adjacentTo')).toEqual([]);
        expect(g.getTargets('S', 'adjacentTo')).toEqual([]);
        expect(g.getTargets('R', 'connectedTo')).toEqual([]);
        expect(g.getTargets('S', 'connectedTo')).toEqual([]);
    });

    it('(b) id-keyed families SURVIVE the invalidation — a moved wall still sits on its level and hosts its door', () => {
        const g = seed();
        g.invalidateRegionConclusionsForMovedElement('A');
        expect(g.getTargets('A', 'sitsOn')).toEqual(['L0']);
        expect(g.getTargets('A', 'hosts')).toEqual(['door-1']);
        expect(g.getTargets('door-1', 'hostedBy')).toEqual(['A']);
    });

    it('(c) C71 §4.4 — the typed reader REFUSES with the undetermined reason, never answers []', () => {
        const g = seed();
        g.invalidateRegionConclusionsForMovedElement('A');
        const q = g.getBoundingWalls('R');
        expect(q.ok).toBe(false);
        if (!q.ok) {
            expect(q.reason).toBe('boundary-undetermined-after-element-move');
            // C79 §5.2 — the reason MUST name its cause (the moved element).
            expect(q.detail).toContain('A');
            expect(q.detail).toContain('UNDETERMINED');
        }
    });

    it('(d) C79 §5.2.1 — undetermined is DISTINGUISHABLE from preserved (untouched room answers ok)', () => {
        const g = seed();
        // Move wall B — it bounds only R, so S's conclusion must stay answerable…
        // (use a fresh graph where B does NOT bound S)
        const g2 = new SemanticGraphManager();
        g2.addRelationship({ type: 'boundedBy', sourceId: 'R', targetId: 'B', createdBy: 'system' });
        g2.addRelationship({ type: 'boundedBy', sourceId: 'S', targetId: 'C', createdBy: 'system' });
        g2.invalidateRegionConclusionsForMovedElement('B');
        expect(g2.getBoundingWalls('R').ok).toBe(false);   // undetermined
        const s = g2.getBoundingWalls('S');
        expect(s.ok).toBe(true);                            // untouched — still answerable
        if (s.ok) expect(s.boundingWallIds).toEqual(['C']);
        void g;
    });

    it('(e) the re-emit clears the mark AT THE WRITER — a fresh boundedBy write makes the room answerable again', () => {
        const g = seed();
        g.invalidateRegionConclusionsForMovedElement('A');
        expect(g.getBoundingWalls('R').ok).toBe(false);
        // The detection pass re-derives and re-emits (here: R is now bounded by B,C,D,E).
        for (const w of ['B', 'C', 'D', 'E']) {
            g.addRelationship({ type: 'boundedBy', sourceId: 'R', targetId: w, createdBy: 'system' });
        }
        const q = g.getBoundingWalls('R');
        expect(q.ok).toBe(true);
        if (q.ok) expect([...q.boundingWallIds].sort()).toEqual(['B', 'C', 'D', 'E']);
    });

    it('(f) a room REPLACED by the detection cycle (edge purge) is UNKNOWN again, not stuck undetermined', () => {
        const g = seed();
        g.invalidateRegionConclusionsForMovedElement('A');
        // DetectAllRoomsCommand purges a replaced room via removeAllRelationshipsForElement.
        g.removeAllRelationshipsForElement('R');
        const q = g.getBoundingWalls('R');
        expect(q.ok).toBe(false);
        if (!q.ok) expect(q.reason).toBe('room-unknown-to-boundedBy-writer');
    });

    it('(g) idempotent + honest no-op — a wall that bounds nothing invalidates nothing', () => {
        const g = seed();
        const first = g.invalidateRegionConclusionsForMovedElement('A');
        expect(first.invalidatedRoomIds.length).toBe(2);
        // Second call: the edges are already gone — the moved wall bounds nothing now.
        const second = g.invalidateRegionConclusionsForMovedElement('A');
        expect(second.invalidatedRoomIds).toEqual([]);
        // A wall no room ever named:
        const ghost = g.invalidateRegionConclusionsForMovedElement('never-a-bounding-wall');
        expect(ghost.invalidatedRoomIds).toEqual([]);
        // The mark from the FIRST call still stands — a later no-op must not erase it.
        expect(g.getBoundingWalls('R').ok).toBe(false);
    });

    it('(h) phantom control — an id the writers never covered refuses as UNKNOWN, with a named reason', () => {
        const g = seed();
        const q = g.getBoundingWalls('never-created');
        expect(q.ok).toBe(false);
        if (!q.ok) expect(q.reason).toBe('room-unknown-to-boundedBy-writer');
    });

    it('(i) clear() resets the undetermined marks with the rest of the graph (project switch)', () => {
        const g = seed();
        g.invalidateRegionConclusionsForMovedElement('A');
        g.clear();
        const q = g.getBoundingWalls('R');
        expect(q.ok).toBe(false);
        if (!q.ok) expect(q.reason).toBe('room-unknown-to-boundedBy-writer');
    });
});
