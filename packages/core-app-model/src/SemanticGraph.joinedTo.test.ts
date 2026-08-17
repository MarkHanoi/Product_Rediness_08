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
        // §C83 §10.6 — the positive-but-empty answer carries an EMPTY junctions
        // list, not an absent one: zero partners means zero discriminators.
        expect(g.getJoinedWalls('A')).toEqual({ ok: true, wallId: 'A', joinedWallIds: [], junctions: [] });
        expect(g.getJoinedWalls('B')).toEqual({ ok: true, wallId: 'B', joinedWallIds: [], junctions: [] });
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

// ─────────────────────────────────────────────────────────────────────────────
// §C83 §10.6 / L-942 — the JUNCTION DISCRIMINATOR the reader used to bin.
//
// A mutual corner (subject + exactly ONE partner, jointly owned — the partner
// must follow) and a terminating corner (an incumbent — the partner must NOT
// move) are geometrically THE SAME PICTURE. The only thing that separates them
// is the stored `junctionType`/`junctionDegree` on the joinedTo edge. This
// reader held that metadata and dropped it one line after reading it, so
// `WallMoveReweld` could not tell the two apart and refused BOTH — production
// wall-moves hard-blocked (L-942).
//
// ⚠ THE NARROWING ARM IS THE SAFETY ARM. `metadata` is typed
// `string | number | boolean`, so a value outside the union must read ABSENT,
// never be asserted into it. ABSENT MEANS "I COULD NOT DETERMINE", NEVER 'L'
// (C70 L-INV-1): a wrong 'L' here would authorise moving an INCUMBENT, which
// is exactly the L-922 defect (a perimeter dragged 2.19 m, three hosted doors
// re-seated). These tests feed the reader junk and assert `undefined`.
// ─────────────────────────────────────────────────────────────────────────────
describe('joinedTo — reader carries the junction discriminator (§C83 §10.6)', () => {
    /** Write one raw joinedTo edge with arbitrary metadata (what a pre-§10.6
     *  writer, or a future writer with a new vocabulary, would leave behind). */
    const rawEdge = (
        g: SemanticGraphManager,
        source: string,
        target: string,
        metadata?: Record<string, string | number | boolean>,
    ) => g.addRelationship({ type: 'joinedTo', sourceId: source, targetId: target, metadata, createdBy: 'test' });

    it('one junction record PER joined id, IN THE SAME ORDER as joinedWallIds — and per-partner, not per-query', () => {
        const g = new SemanticGraphManager();
        // A participates in TWO different junctions: an L with B (degree 2) and a
        // T with C+D (degree 3). One metadata blob for the whole answer would be
        // wrong for at least one partner — the mapping must be per-id.
        g.replaceJoinedToForLevelWalls(['A', 'B', 'C', 'D'], [
            { junctionType: 'L', junctionDegree: 2, wallIds: ['A', 'B'] },
            { junctionType: 'T', junctionDegree: 3, wallIds: ['A', 'C', 'D'] },
        ]);

        const q = g.getJoinedWalls('A');
        expect(q.ok).toBe(true);
        if (!q.ok) return;

        // Positional contract: same length, same order, id-for-id. A consumer
        // zips these two arrays by index (MoveReweldPartner), so a reordered
        // junctions array would hand each partner ANOTHER partner's verdict.
        expect(q.junctions).toHaveLength(q.joinedWallIds.length);
        expect(q.junctions.map(j => j.wallId)).toEqual([...q.joinedWallIds]);

        const byId = new Map(q.junctions.map(j => [j.wallId, j]));
        expect(byId.get('B')).toEqual({ wallId: 'B', junctionType: 'L', junctionDegree: 2 });
        expect(byId.get('C')).toEqual({ wallId: 'C', junctionType: 'T', junctionDegree: 3 });
        expect(byId.get('D')).toEqual({ wallId: 'D', junctionType: 'T', junctionDegree: 3 });
    });

    it('junctionType NARROWS, never casts — a junk stored value reads ABSENT, and absent is NOT "L"', () => {
        const g = new SemanticGraphManager();
        // 'CORNER' is a plausible-looking vocabulary that is NOT in the union.
        rawEdge(g, 'A', 'B', { junctionType: 'CORNER', junctionDegree: 2 });

        const q = g.getJoinedWalls('A');
        expect(q.ok).toBe(true);
        if (!q.ok) return;

        const j = q.junctions[0]!;
        expect(j.wallId).toBe('B');
        // ⚠ THE ASSERTION THAT MATTERS: absent, not 'L'. A cast here would have
        // told WallMoveReweld "mutual corner, degree 2 — move the partner", and
        // the partner might be an incumbent perimeter (L-922).
        expect(j.junctionType).toBeUndefined();
        expect(j.junctionType).not.toBe('L');
        // The degree was well-formed and survives — narrowing is per-field, one
        // bad field does not poison the other.
        expect(j.junctionDegree).toBe(2);
    });

    it('junctionType of the WRONG PRIMITIVE TYPE (number / boolean) also reads ABSENT', () => {
        const g = new SemanticGraphManager();
        rawEdge(g, 'A', 'B', { junctionType: 2, junctionDegree: 2 });
        rawEdge(g, 'A', 'C', { junctionType: true, junctionDegree: 2 });

        const q = g.getJoinedWalls('A');
        expect(q.ok).toBe(true);
        if (!q.ok) return;
        for (const j of q.junctions) expect(j.junctionType).toBeUndefined();
    });

    it('junctionDegree reads ABSENT unless it is a FINITE number (string / NaN / Infinity all refuse)', () => {
        const g = new SemanticGraphManager();
        rawEdge(g, 'A', 'B', { junctionType: 'L', junctionDegree: 'two' });
        rawEdge(g, 'A', 'C', { junctionType: 'L', junctionDegree: Number.NaN });
        rawEdge(g, 'A', 'D', { junctionType: 'L', junctionDegree: Number.POSITIVE_INFINITY });

        const q = g.getJoinedWalls('A');
        expect(q.ok).toBe(true);
        if (!q.ok) return;

        expect(q.junctions).toHaveLength(3);
        for (const j of q.junctions) {
            // The TYPE was well-formed on all three, so it survives…
            expect(j.junctionType).toBe('L');
            // …and the degree does not. `isMutualCorner` is `L && degree === 2`;
            // an absent degree must fail that test rather than pass it by
            // coercion (`NaN === 2` is false, but `'two'` cast to number would
            // not be, and Infinity is not a junction degree).
            expect(j.junctionDegree).toBeUndefined();
        }
    });

    it('an edge with NO metadata at all still yields a record — with BOTH fields absent', () => {
        const g = new SemanticGraphManager();
        // The pre-§10.6 shape: an edge written before the junction writer
        // stamped its discriminator. There is still a partner, so there must
        // still be a record — silently dropping it would desynchronise the
        // positional zip against joinedWallIds.
        rawEdge(g, 'A', 'B', undefined);

        const q = g.getJoinedWalls('A');
        expect(q.ok).toBe(true);
        if (!q.ok) return;

        expect(q.joinedWallIds).toEqual(['B']);
        expect(q.junctions).toEqual([{ wallId: 'B', junctionType: undefined, junctionDegree: undefined }]);
        expect(q.junctions).toHaveLength(1);
    });

    it('COVERED-BUT-JOINS-NOTHING answers junctions: [] — a positive empty, alongside joinedWallIds: []', () => {
        const g = new SemanticGraphManager();
        g.replaceJoinedToForLevelWalls(['A'], []);

        const q = g.getJoinedWalls('A');
        expect(q.ok).toBe(true);
        if (!q.ok) return;
        expect(q.joinedWallIds).toEqual([]);
        expect(q.junctions).toEqual([]);
        // Present-and-empty, never absent: a consumer iterating `q.junctions`
        // must not have to guard for undefined on the ok arm.
        expect(Array.isArray(q.junctions)).toBe(true);
    });

    it('the REFUSAL arm is unchanged — failure is not emptiness, and it carries NO junctions field (C71 §4.4)', () => {
        const g = new SemanticGraphManager();
        const q = g.getJoinedWalls('never-flushed');

        expect(q.ok).toBe(false);
        if (q.ok) return;
        expect(q).toEqual({
            ok: false,
            wallId: 'never-flushed',
            reason: 'wall-unknown-to-joinedTo-writer',
            detail: expect.stringContaining('never-flushed'),
        });
        // The widening must not have grown a `junctions: []` onto the refusal:
        // that would let a consumer read "no junctions" out of "no answer".
        expect('junctions' in q).toBe(false);
    });

    it('the discriminator SURVIVES serialize/deserialize — it is on the edge, not in derived state', () => {
        const g = new SemanticGraphManager();
        g.replaceJoinedToForLevelWalls(['A', 'B'], [L_AB]);

        const g2 = new SemanticGraphManager();
        g2.deserialize(g.serialize());

        const q = g2.getJoinedWalls('A');
        expect(q.ok).toBe(true);
        if (!q.ok) return;
        expect(q.junctions).toEqual([{ wallId: 'B', junctionType: 'L', junctionDegree: 2 }]);
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
