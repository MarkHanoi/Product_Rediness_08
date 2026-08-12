// ADR-0321 / C71 §3 — `joinedTo` (wall ↔ wall via a retained junction).
//
// STALENESS IS THE FAILURE MODE these tests exist for: `addRelationship`
// idempotency prevents duplicates, never stale edges (C71 §7.e). The writer is
// remove-and-re-emit per level flush; the test that matters is (b) — a wall
// that STOPS joining loses its edge on the next flush.
//
// FAILURE ≠ EMPTINESS (C71 §4.4): `getJoinedWalls` on a wall the writer has
// never covered is a typed refusal, not `[]`.

import { describe, it, expect } from 'vitest';
import { SemanticGraphManager, type JoinedToJunctionInput } from './SemanticGraph';

const L_AB: JoinedToJunctionInput = { junctionType: 'L', junctionDegree: 2, wallIds: ['A', 'B'] };
const T_ABC: JoinedToJunctionInput = { junctionType: 'T', junctionDegree: 3, wallIds: ['A', 'B', 'C'] };

describe('joinedTo — writer (replaceJoinedToForLevelWalls)', () => {
    it('(a) two walls join → edges exist in BOTH directions with junction metadata, createdBy system', () => {
        const g = new SemanticGraphManager();
        g.replaceJoinedToForLevelWalls(['A', 'B'], [L_AB]);

        expect(g.hasRelationship('A', 'B', 'joinedTo')).toBe(true);
        expect(g.hasRelationship('B', 'A', 'joinedTo')).toBe(true);

        const edge = g.getRelationships('A', 'joinedTo').find(r => r.sourceId === 'A')!;
        expect(edge.metadata).toEqual({ junctionType: 'L', junctionDegree: 2 });
        expect(edge.createdBy).toBe('system');
        // C71 §3.5 — no within-solve junction handle is stored anywhere on the edge.
        expect(Object.keys(edge.metadata!).sort()).toEqual(['junctionDegree', 'junctionType']);
    });

    it('(a2) a T junction emits every distinct participant pair, both directions (6 directed edges)', () => {
        const g = new SemanticGraphManager();
        g.replaceJoinedToForLevelWalls(['A', 'B', 'C'], [T_ABC]);

        for (const [s, t] of [['A', 'B'], ['B', 'A'], ['A', 'C'], ['C', 'A'], ['B', 'C'], ['C', 'B']] as const) {
            expect(g.hasRelationship(s, t, 'joinedTo')).toBe(true);
        }
        expect(g.getAll().filter(r => r.type === 'joinedTo')).toHaveLength(6);
        expect(g.getRelationships('A', 'joinedTo')[0]!.metadata).toMatchObject({ junctionType: 'T', junctionDegree: 3 });
    });

    it('(b) THE STALENESS TEST — a wall that STOPS joining loses its edges on the next flush', () => {
        const g = new SemanticGraphManager();
        g.replaceJoinedToForLevelWalls(['A', 'B'], [L_AB]);
        expect(g.hasRelationship('A', 'B', 'joinedTo')).toBe(true);

        // Wall B moved away: the re-solve retains no junction. Idempotency alone
        // would keep the stale edge forever — remove-and-re-emit must not.
        g.replaceJoinedToForLevelWalls(['A', 'B'], []);

        expect(g.hasRelationship('A', 'B', 'joinedTo')).toBe(false);
        expect(g.hasRelationship('B', 'A', 'joinedTo')).toBe(false);
        // Both walls are still COVERED: "joins nothing" is a positive answer.
        expect(g.getJoinedWalls('A')).toEqual({ ok: true, wallId: 'A', joinedWallIds: [] });
        expect(g.getJoinedWalls('B')).toEqual({ ok: true, wallId: 'B', joinedWallIds: [] });
    });

    it('(b2) an edge whose PARTNER left the level is swept via its surviving endpoint', () => {
        const g = new SemanticGraphManager();
        g.replaceJoinedToForLevelWalls(['A', 'B'], [L_AB]);

        // B was deleted this cycle: the flush sees only A on the level. The stale
        // A↔B pair must still be removed (source AND target index sweep).
        g.replaceJoinedToForLevelWalls(['A'], []);

        expect(g.getAll().filter(r => r.type === 'joinedTo')).toHaveLength(0);
    });

    it('re-flushing the same junctions is idempotent — same edge count, no duplicates', () => {
        const g = new SemanticGraphManager();
        g.replaceJoinedToForLevelWalls(['A', 'B'], [L_AB]);
        g.replaceJoinedToForLevelWalls(['A', 'B'], [L_AB]);
        expect(g.getAll().filter(r => r.type === 'joinedTo')).toHaveLength(2);
    });

    it('does not touch other levels or other relationship types', () => {
        const g = new SemanticGraphManager();
        // Another level's joinedTo pair + an unrelated hosts edge on wall A.
        g.replaceJoinedToForLevelWalls(['X', 'Y'], [{ junctionType: 'L', junctionDegree: 2, wallIds: ['X', 'Y'] }]);
        g.addRelationship({ type: 'hosts', sourceId: 'A', targetId: 'door-1', createdBy: 'test' });

        g.replaceJoinedToForLevelWalls(['A', 'B'], [L_AB]);
        g.replaceJoinedToForLevelWalls(['A', 'B'], []); // and un-join again

        expect(g.hasRelationship('X', 'Y', 'joinedTo')).toBe(true);
        expect(g.hasRelationship('A', 'door-1', 'hosts')).toBe(true);
    });
});

describe('joinedTo — typed reader (getJoinedWalls)', () => {
    it('(e) UNKNOWN wall ≠ wall with no joins — refusal is typed, never []-conflated', () => {
        const g = new SemanticGraphManager();
        g.replaceJoinedToForLevelWalls(['A'], []); // A covered, joins nothing

        const covered = g.getJoinedWalls('A');
        expect(covered.ok).toBe(true);
        if (covered.ok) expect(covered.joinedWallIds).toEqual([]);

        const unknown = g.getJoinedWalls('never-flushed');
        expect(unknown.ok).toBe(false);
        if (!unknown.ok) {
            expect(unknown.reason).toBe('wall-unknown-to-joinedTo-writer');
            expect(unknown.detail).toContain('never-flushed');
        }
    });

    it('answers with joined wall ids after a flush (the Q4 lookup)', () => {
        const g = new SemanticGraphManager();
        g.replaceJoinedToForLevelWalls(['A', 'B', 'C'], [T_ABC]);
        const q = g.getJoinedWalls('A');
        expect(q.ok).toBe(true);
        if (q.ok) expect([...q.joinedWallIds].sort()).toEqual(['B', 'C']);
    });

    it('clear() resets coverage — a full project reload makes every wall unknown again', () => {
        const g = new SemanticGraphManager();
        g.replaceJoinedToForLevelWalls(['A'], []);
        g.clear();
        expect(g.getJoinedWalls('A').ok).toBe(false);
    });

    it('REGENERATED disposition: deserialize restores edges (edge branch answers) but never coverage', () => {
        const g = new SemanticGraphManager();
        g.replaceJoinedToForLevelWalls(['A', 'B', 'C'], [L_AB]); // C covered, joinless
        const snapshot = g.serialize();

        const g2 = new SemanticGraphManager();
        g2.deserialize(snapshot);

        // Edges came back verbatim → the joined pair still answers.
        const qa = g2.getJoinedWalls('A');
        expect(qa.ok).toBe(true);
        if (qa.ok) expect(qa.joinedWallIds).toEqual(['B']);
        // Coverage is derived state and was NOT persisted: the joinless wall is
        // a refusal until the flush regenerates — honest, not "joins nothing".
        expect(g2.getJoinedWalls('C').ok).toBe(false);
    });
});

describe('joinedTo — delete behaviour (the 3ee632f6 cascade mechanism)', () => {
    it('(c) removeAllRelationshipsForElement purges every joinedTo edge referencing the wall, and the wall becomes UNKNOWN', () => {
        const g = new SemanticGraphManager();
        g.replaceJoinedToForLevelWalls(['A', 'B', 'C'], [T_ABC]);

        // The exact call the wall-family delete cascade makes.
        g.removeAllRelationshipsForElement('A');

        expect(g.getAll().some(r => r.type === 'joinedTo' && (r.sourceId === 'A' || r.targetId === 'A'))).toBe(false);
        // B↔C survives — only A's edges were purged.
        expect(g.hasRelationship('B', 'C', 'joinedTo')).toBe(true);
        // A deleted wall is unknown again, not "covered, joins nothing".
        expect(g.getJoinedWalls('A').ok).toBe(false);
    });

    it('(c2) undo restores the purged edges VERBATIM (the cascade prevState pattern), and the reader answers again', () => {
        const g = new SemanticGraphManager();
        g.replaceJoinedToForLevelWalls(['A', 'B'], [L_AB]);

        // The cascade captures getRelationships() verbatim before removal…
        const captured = g.getRelationships('A');
        g.removeAllRelationshipsForElement('A');
        expect(g.getRelationships('A')).toHaveLength(0);

        // …and re-adds on undo.
        for (const rel of captured) {
            g.addRelationship({ type: rel.type, sourceId: rel.sourceId, targetId: rel.targetId, metadata: rel.metadata, createdBy: rel.createdBy });
        }

        expect(g.hasRelationship('A', 'B', 'joinedTo')).toBe(true);
        expect(g.hasRelationship('B', 'A', 'joinedTo')).toBe(true);
        const q = g.getJoinedWalls('A');
        expect(q.ok).toBe(true);
        if (q.ok) expect(q.joinedWallIds).toEqual(['B']);
        // Metadata survived the round trip.
        expect(g.getRelationships('A', 'joinedTo')[0]!.metadata).toMatchObject({ junctionType: 'L', junctionDegree: 2 });
    });
});
