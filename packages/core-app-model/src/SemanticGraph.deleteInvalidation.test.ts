// §GR12-DELETE-INVALIDATION (GR-12 · C71 §1.2 semantic 5 / §3.4; C79 §5.2)
//
// DELETE-TIME STALENESS IS THE FAILURE MODE these tests exist for — the twin of
// `SemanticGraph.boundedByInvalidation.test.ts`. Harness H7
// (`tools/rac-conformance/certification/__tests__/graphdelete.cert.ts`) measured,
// against real commands and real stores: delete a wall shared by two detected
// rooms and the `3ee632f6` cascade correctly purges every edge whose ENDPOINT is
// that wall, while each room's REMAINING `boundedBy` edges survive and
// `getBoundingWalls` answers **`ok:true ["east-lo","south","west-lo"]`** — a
// confident, complete-looking boundary for a ring that no longer closes.
//
// Before and after the delete the reader printed the same SHAPE. That is the
// whole row: "this boundary was re-derived" and "a wall it depended on was
// deleted and nobody recomputed" were the same value.
//
// The fix under test: `invalidateRegionConclusionsForDeletedElement`, called from
// `removeAllRelationshipsForElement` (the one call every delete path already
// makes, and which `check-graph-delete-integrity` ARM A already enforces per
// element kind) and from `WallRebuildCoordinator._flush` on `'remove'` events.
// It MARKS the affected rooms undetermined with a DELETE-specific reason and —
// unlike the move writer — does NOT remove their surviving edges; arm (d) is the
// executed reason why.

import { describe, it, expect } from 'vitest';
import { SemanticGraphManager } from './SemanticGraph';

/**
 * H7's world, in miniature: two rooms R and S sharing wall M.
 * R is bounded by A,B,M; S is bounded by C,D,M. A door in M authored the
 * `connectedTo` pair; sharing M authored the `adjacentTo` pair.
 */
function seed(): SemanticGraphManager {
    const g = new SemanticGraphManager();
    for (const w of ['A', 'B', 'M']) {
        g.addRelationship({ type: 'boundedBy', sourceId: 'R', targetId: w, createdBy: 'system' });
    }
    for (const w of ['C', 'D', 'M']) {
        g.addRelationship({ type: 'boundedBy', sourceId: 'S', targetId: w, createdBy: 'system' });
    }
    g.addRelationship({ type: 'adjacentTo', sourceId: 'R', targetId: 'S', createdBy: 'system' });
    g.addRelationship({ type: 'adjacentTo', sourceId: 'S', targetId: 'R', createdBy: 'system' });
    g.addRelationship({ type: 'connectedTo', sourceId: 'R', targetId: 'S', createdBy: 'system' });
    g.addRelationship({ type: 'connectedTo', sourceId: 'S', targetId: 'R', createdBy: 'system' });
    // Id-keyed edges on the wall being deleted (the dead-id arms) …
    g.addRelationship({ type: 'sitsOn', sourceId: 'M', targetId: 'L0', createdBy: 'system' });
    g.addRelationship({ type: 'hosts', sourceId: 'M', targetId: 'door-M', createdBy: 'system' });
    g.addRelationship({ type: 'hostedBy', sourceId: 'door-M', targetId: 'M', createdBy: 'system' });
    // … and on a wall that is NOT deleted (the invariant control arms).
    g.addRelationship({ type: 'sitsOn', sourceId: 'A', targetId: 'L0', createdBy: 'system' });
    g.addRelationship({ type: 'hosts', sourceId: 'A', targetId: 'door-A', createdBy: 'system' });
    return g;
}

describe('boundedBy — delete-time invalidation (invalidateRegionConclusionsForDeletedElement)', () => {
    it('(a) THE ROW — after deleting a bounding wall the typed reader REFUSES; it no longer answers ok:true with the leftovers', () => {
        const g = seed();

        // BEFORE — a determined boundary, answered confidently. This half must
        // hold or the arm below proves nothing (H7's non-vacuity discipline).
        const before = g.getBoundingWalls('R');
        expect(before.ok).toBe(true);
        if (before.ok) expect([...before.boundingWallIds].sort()).toEqual(['A', 'B', 'M']);

        g.removeAllRelationshipsForElement('M');

        // AFTER — the reading H7 recorded as `ok:true ["A","B"]` is now a refusal.
        const after = g.getBoundingWalls('R');
        expect(after.ok).toBe(false);
        if (!after.ok) {
            expect(after.reason).toBe('boundary-undetermined-after-element-delete');
            // C79 §5.2 — the reason MUST name its cause.
            expect(after.detail).toContain('M');
            expect(after.detail).toContain('DELETED');
            expect(after.detail).toContain('UNDETERMINED');
        }
        // BOTH rooms, not just the one that happened to be scanned first.
        expect(g.getBoundingWalls('S').ok).toBe(false);
    });

    it('(b) a DELETE never prints "moved" — the two causes are distinguishable in the reason code', () => {
        // The move and delete marks are different FACTS: after a move the element
        // might still bound the room, after a delete it provably cannot. A shared
        // code would be the two-facts-one-value defect inside the refusal itself.
        const gMove = seed();
        gMove.invalidateRegionConclusionsForMovedElement('M');
        const qMove = gMove.getBoundingWalls('R');

        const gDel = seed();
        gDel.removeAllRelationshipsForElement('M');
        const qDel = gDel.getBoundingWalls('R');

        expect(qMove.ok).toBe(false);
        expect(qDel.ok).toBe(false);
        if (!qMove.ok && !qDel.ok) {
            expect(qMove.reason).toBe('boundary-undetermined-after-element-move');
            expect(qDel.reason).toBe('boundary-undetermined-after-element-delete');
            expect(qMove.reason).not.toBe(qDel.reason);
        }
    });

    it('(c) UNDETERMINED ≠ UNKNOWN — a room the writers never covered still refuses with its own, different reason', () => {
        const g = seed();
        g.removeAllRelationshipsForElement('M');
        const undetermined = g.getBoundingWalls('R');
        const unknown = g.getBoundingWalls('never-created');
        expect(undetermined.ok).toBe(false);
        expect(unknown.ok).toBe(false);
        if (!undetermined.ok && !unknown.ok) {
            expect(unknown.reason).toBe('room-unknown-to-boundedBy-writer');
            expect(undetermined.reason).not.toBe(unknown.reason);
        }
    });

    it('(d) THE UNDO CONTRACT — the surviving edges are MARKED, not removed, so restoring the delete restores the FULL boundary', () => {
        const g = seed();

        // `DeleteElementCommand._captureRelationships` snapshots exactly the edges
        // TOUCHING the deleted id — here `R —boundedBy→ M` and `S —boundedBy→ M`
        // (plus the wall's own id-keyed edges). R's edges to A and B are NOT in it.
        const captured = g.getRelationships('M').map((r) => ({ ...r }));
        expect(captured.some((r) => r.type === 'boundedBy' && r.sourceId === 'R')).toBe(true);
        expect(captured.some((r) => r.type === 'boundedBy' && r.targetId === 'A')).toBe(false);

        g.removeAllRelationshipsForElement('M');
        expect(g.getBoundingWalls('R').ok).toBe(false);

        // UNDO — restore verbatim, exactly as `_restoreRelationships` does.
        for (const rel of captured) {
            g.addRelationship({
                type: rel.type, sourceId: rel.sourceId, targetId: rel.targetId, createdBy: rel.createdBy,
            });
        }

        // The re-added `boundedBy` write clears the mark (addRelationship's
        // contract), and because the OTHER edges were never removed the room comes
        // back WHOLE. Had this writer removed them the way the move writer does,
        // this would read `ok:true ["M"]` — confident and wrong, strictly worse
        // than the defect (a) fixes. That is the executed reason for the
        // mark-don't-remove asymmetry, not a preference.
        const restored = g.getBoundingWalls('R');
        expect(restored.ok).toBe(true);
        if (restored.ok) expect([...restored.boundingWallIds].sort()).toEqual(['A', 'B', 'M']);
    });

    it('(e) DEAD-ID arms still purge, and UNTOUCHED elements keep their edges — invalidation is not data loss', () => {
        const g = seed();
        g.removeAllRelationshipsForElement('M');
        // Dead ids gone (the 3ee632f6 cascade, unchanged by this writer).
        expect(g.getTargets('M', 'hosts')).toEqual([]);
        expect(g.getTargets('M', 'sitsOn')).toEqual([]);
        expect(g.getTargets('door-M', 'hostedBy')).toEqual([]);
        expect(g.getTargets('R', 'boundedBy')).not.toContain('M');
        // An untouched wall is untouched.
        expect(g.getTargets('A', 'sitsOn')).toEqual(['L0']);
        expect(g.getTargets('A', 'hosts')).toEqual(['door-A']);
    });

    it('(f) the re-derivation clears the mark AT THE WRITER — a fresh boundedBy write makes the room answerable again', () => {
        const g = seed();
        g.removeAllRelationshipsForElement('M');
        expect(g.getBoundingWalls('R').ok).toBe(false);
        // Detection re-derives: with M gone, R and S are one region bounded by A,B,C,D.
        for (const w of ['A', 'B', 'C', 'D']) {
            g.addRelationship({ type: 'boundedBy', sourceId: 'R', targetId: w, createdBy: 'system' });
        }
        const q = g.getBoundingWalls('R');
        expect(q.ok).toBe(true);
        if (q.ok) expect([...q.boundingWallIds].sort()).toEqual(['A', 'B', 'C', 'D']);
    });

    it('(g) idempotent + honest no-op — deleting something no room is bounded by invalidates nothing, and never erases an earlier mark', () => {
        const g = seed();
        const first = g.invalidateRegionConclusionsForDeletedElement('M');
        expect([...first.invalidatedRoomIds].sort()).toEqual(['R', 'S']);

        // An element no room names: zero invalidated rooms, and R stays marked.
        const ghost = g.invalidateRegionConclusionsForDeletedElement('never-a-bounding-wall');
        expect(ghost.invalidatedRoomIds).toEqual([]);
        expect(g.getBoundingWalls('R').ok).toBe(false);

        // The full purge afterwards is also a no-op on the marks it must not touch.
        g.removeAllRelationshipsForElement('never-a-bounding-wall');
        expect(g.getBoundingWalls('R').ok).toBe(false);
    });

    it('(h) deleting the ROOM itself makes it UNKNOWN, not undetermined — a dead id is not a pending recomputation', () => {
        const g = seed();
        g.removeAllRelationshipsForElement('M');       // R is now undetermined …
        g.removeAllRelationshipsForElement('R');       // … and now R itself is gone.
        const q = g.getBoundingWalls('R');
        expect(q.ok).toBe(false);
        if (!q.ok) expect(q.reason).toBe('room-unknown-to-boundedBy-writer');
    });

    it('(i) MEASURED RESIDUAL, asserted so it cannot change unnoticed — adjacentTo/connectedTo SURVIVE the delete', () => {
        // H7's re-detect control proved these edges are not merely unverified but
        // FALSE after the delete. They are deliberately NOT removed here: both
        // endpoints are rooms, so no index reaches them; neither family has a
        // refusal-bearing reader to absorb the difference; and they are outside the
        // delete's undo snapshot. Removing them would trade a stale TRUE-shaped
        // answer for a silent empty one. This arm PINS the current behaviour so the
        // day a reader is added, this test is what says the other half is still open.
        const g = seed();
        g.removeAllRelationshipsForElement('M');
        expect(g.getTargets('R', 'adjacentTo')).toEqual(['S']);
        expect(g.getTargets('R', 'connectedTo')).toEqual(['S']);
    });

    it('(j) clear() resets the delete marks with the rest of the graph (project switch)', () => {
        const g = seed();
        g.removeAllRelationshipsForElement('M');
        g.clear();
        const q = g.getBoundingWalls('R');
        expect(q.ok).toBe(false);
        if (!q.ok) expect(q.reason).toBe('room-unknown-to-boundedBy-writer');
    });
});
