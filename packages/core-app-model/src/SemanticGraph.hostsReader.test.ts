// §HOSTS-FORWARD-READER — C71 §2.1 #1 / §4.4 · C78 §1.4 / §5.2 · C79 §5.3.
//
// `hosts` is the FORWARD half of C71 §2.1 row 1, "the reference-shape pair".
// Its inverse `hostedBy` gained a typed refusal-bearing reader (`getHostWall`);
// `hosts` did not, and was read exclusively through bare
// `getTargets(wallId, 'hosts')`.
//
// ─── WHAT THIS FILE PROVES ───────────────────────────────────────────────────
// The bare read returns `[]` for TWO different facts — "this wall hosts
// nothing" and "I have never heard of this wall" — so C78 §1.4's forbidden
// inference (DETERMINED-unaffected from missing data) was unavoidable for every
// caller, however well its planner was composed. The centre of this file is
// `describe('THE DIFFERENTIATOR')`: the two states produce the SAME `[]` from
// the raw lookup and DIFFERENT answers from the typed reader, asserted side by
// side in one test so the claim cannot drift apart from its evidence.
//
// ─── THE NEGATIVE CONTROL (C70 §5.6) ─────────────────────────────────────────
// A "fix" that refused for every wall would satisfy every refusal assertion
// here and destroy the reader. `(neg)` pins the other direction: a covered wall
// answers `ok:true`, and a covered wall whose last opening was deleted answers
// `ok:true` with `[]` — a positive, actionable "hosts nothing".

import { describe, it, expect, beforeEach } from 'vitest';
import { SemanticGraphManager, semanticGraphManager } from './SemanticGraph';

const WALL = 'wall-1';
const OTHER_WALL = 'wall-2';
const DOOR = 'door-1';
const WINDOW = 'window-1';

/** Exactly what CreateWallOpeningCommand (and the snapshot rebuild) writes, per opening. */
function seedHosting(g: SemanticGraphManager, wallId: string, openingId: string): void {
    g.addRelationship({
        type: 'hosts', sourceId: wallId, targetId: openingId,
        createdBy: 'CreateWallOpeningCommand',
    });
    g.addRelationship({
        type: 'hostedBy', sourceId: openingId, targetId: wallId,
        createdBy: 'CreateWallOpeningCommand',
    });
}

let g: SemanticGraphManager;

beforeEach(() => {
    g = new SemanticGraphManager();
    semanticGraphManager.clear();
});

describe('hosts — the typed reader (getHostedOpenings)', () => {
    it('(a) returns the openings from the edges the opening-creation command writes', () => {
        seedHosting(g, WALL, DOOR);
        seedHosting(g, WALL, WINDOW);

        const q = g.getHostedOpenings(WALL);
        expect(q.ok).toBe(true);
        if (!q.ok) throw new Error('unreachable');
        expect([...q.openingIds].sort()).toEqual([DOOR, WINDOW]);
    });

    it('(a2) the reader is DIRECTIONAL — asking the OPENING is not the same question as asking the wall', () => {
        seedHosting(g, WALL, DOOR);
        // `hosts` is wall → opening. The opening is the TARGET, so a hosts
        // lookup on the opening must refuse, not return the wall.
        const q = g.getHostedOpenings(DOOR);
        expect(q.ok).toBe(false);
        if (q.ok) throw new Error('unreachable');
        expect(q.reason).toBe('wall-unknown-to-hosts-writer');
    });

    it('(b) C71 §4.4 — a wall the writer has never covered REFUSES; it does not answer empty', () => {
        const q = g.getHostedOpenings('never-seen');
        expect(q.ok).toBe(false);
        if (q.ok) throw new Error('unreachable');
        expect(q.reason).toBe('wall-unknown-to-hosts-writer');
        expect(q.detail).toContain('NO ANSWER');
    });
});

// ═════════════════════════════════════════════════════════════════════════════
// THE DIFFERENTIATOR — the whole point of the family
// ═════════════════════════════════════════════════════════════════════════════

describe('THE DIFFERENTIATOR — "hosts nothing" vs "I could not determine"', () => {
    it('(c) both states give the SAME [] from the bare lookup and DIFFERENT answers from the reader', () => {
        // State 1 — a wall the hosts writer has covered, whose only opening was
        // then deleted. It hosts nothing, and that is a DETERMINED fact.
        seedHosting(g, WALL, DOOR);
        g.removeAllRelationshipsForElement(DOOR);

        // State 2 — a wall id no writer has ever touched.
        const UNKNOWN = 'wall-never-written';

        // C78 §1.4, demonstrated: the raw index cannot tell them apart.
        expect(g.getTargets(WALL, 'hosts')).toEqual([]);
        expect(g.getTargets(UNKNOWN, 'hosts')).toEqual([]);

        // The typed reader can, and that is the capability being landed.
        const determined = g.getHostedOpenings(WALL);
        expect(determined.ok).toBe(true);
        if (!determined.ok) throw new Error('unreachable');
        expect(determined.openingIds).toEqual([]);

        const undetermined = g.getHostedOpenings(UNKNOWN);
        expect(undetermined.ok).toBe(false);
        if (undetermined.ok) throw new Error('unreachable');
        expect(undetermined.reason).toBe('wall-unknown-to-hosts-writer');
    });

    it('(neg) NEGATIVE CONTROL — the reader has not been made to refuse for everything', () => {
        // A reader that refused unconditionally would pass every refusal
        // assertion above and deliver nothing.
        seedHosting(g, WALL, DOOR);
        expect(g.getHostedOpenings(WALL).ok).toBe(true);

        g.removeAllRelationshipsForElement(DOOR);
        const emptied = g.getHostedOpenings(WALL);
        expect(emptied.ok).toBe(true);
        if (!emptied.ok) throw new Error('unreachable');
        expect(emptied.openingIds).toEqual([]);
    });
});

// ═════════════════════════════════════════════════════════════════════════════
// The pair-integrity refusal
// ═════════════════════════════════════════════════════════════════════════════

describe('hosts — the reference-shape PAIR must agree (C79 §5.3)', () => {
    it('(d) a hosts edge with no hostedBy inverse is a NAMED corruption refusal, not a filtered success', () => {
        // Reachable in production: `deserialize` drops malformed rows
        // INDIVIDUALLY and continues, so a slice can restore one half of a pair.
        seedHosting(g, WALL, DOOR);
        g.addRelationship({
            type: 'hosts', sourceId: WALL, targetId: WINDOW, createdBy: 'corrupt-slice',
        });

        const q = g.getHostedOpenings(WALL);
        expect(q.ok).toBe(false);
        if (q.ok) throw new Error('unreachable');
        expect(q.reason).toBe('hosts-hostedBy-pair-broken');
        expect(q.detail).toContain(WINDOW);
    });

    it('(d2) the refusal is what keeps the two halves of the pair from disagreeing', () => {
        g.addRelationship({
            type: 'hosts', sourceId: WALL, targetId: DOOR, createdBy: 'corrupt-slice',
        });

        // getHostWall cannot see a host for this opening…
        const inverse = g.getHostWall(DOOR);
        expect(inverse.ok).toBe(false);

        // …so the forward half must not confidently claim it does.
        const forward = g.getHostedOpenings(WALL);
        expect(forward.ok).toBe(false);
    });

    it('(d3) a wall hosting a DIFFERENT wall\'s opening does not poison this wall\'s answer', () => {
        seedHosting(g, WALL, DOOR);
        seedHosting(g, OTHER_WALL, WINDOW);

        const q = g.getHostedOpenings(WALL);
        expect(q.ok).toBe(true);
        if (!q.ok) throw new Error('unreachable');
        expect(q.openingIds).toEqual([DOOR]);
    });
});

// ═════════════════════════════════════════════════════════════════════════════
// C71 §1.2 semantic 6 (deletion) and the coverage mark's disposition
// ═════════════════════════════════════════════════════════════════════════════

describe('hosts — coverage lifecycle', () => {
    it('(e) deleting the WALL makes it unknown again — a dead id is not "covered, hosts nothing"', () => {
        seedHosting(g, WALL, DOOR);
        expect(g.getHostedOpenings(WALL).ok).toBe(true);

        g.removeAllRelationshipsForElement(WALL);

        const q = g.getHostedOpenings(WALL);
        expect(q.ok).toBe(false);
        if (q.ok) throw new Error('unreachable');
        expect(q.reason).toBe('wall-unknown-to-hosts-writer');
    });

    it('(f) clear() drops coverage — a project switch never answers with the previous project\'s marks', () => {
        seedHosting(g, WALL, DOOR);
        g.clear();

        expect(g.getHostedOpenings(WALL).ok).toBe(false);
    });

    it('(g) the mark is DERIVED, not serialized — a restored slice answers from edges, never from an invented mark', () => {
        seedHosting(g, WALL, DOOR);
        const slice = g.serialize();

        const restored = new SemanticGraphManager();
        const load = restored.deserialize(slice);
        expect(load.dropped).toEqual([]);

        // The wall has edges, so it answers through the EDGE branch.
        const q = restored.getHostedOpenings(WALL);
        expect(q.ok).toBe(true);
        if (!q.ok) throw new Error('unreachable');
        expect(q.openingIds).toEqual([DOOR]);

        // A wall with no edges in the slice was not silently marked covered.
        expect(restored.getHostedOpenings(OTHER_WALL).ok).toBe(false);
    });

    it('(h) re-emitting an existing edge still marks coverage (idempotent insert is still a statement)', () => {
        seedHosting(g, WALL, DOOR);
        g.clear();

        // Re-emit the SAME logical edge into a cleared graph, then delete the
        // opening: the wall must be covered, not unknown.
        seedHosting(g, WALL, DOOR);
        seedHosting(g, WALL, DOOR); // idempotent — hits addRelationship's early return
        g.removeAllRelationshipsForElement(DOOR);

        const q = g.getHostedOpenings(WALL);
        expect(q.ok).toBe(true);
        if (!q.ok) throw new Error('unreachable');
        expect(q.openingIds).toEqual([]);
    });
});
