// ADR-0321 / C71 §3 — `writeJoinedToEdgesForLevel`, the flush-time joinedTo
// writer (the §CONNECT-3 handoff landed).
//
// THE REFUSAL RULE is what this file proves: `levelJunctions` is `[]` both for
// "no junctions" and "cache never refreshed", so the writer probes
// `junctionsForWall` first and a typed refusal writes NOTHING — a refusal is
// NOT zero junctions (test d). The happy path and the staleness path run
// against the REAL WallPipelineV2Cache (the retained junction index itself),
// not a hand-rolled fake of it.

import { describe, it, expect } from 'vitest';
import { SemanticGraphManager } from '@pryzm/core-app-model';
import { WallPipelineV2Cache, type LevelWallSpec } from '@pryzm/geometry-wall';
import {
    writeJoinedToEdgesForLevel,
    type JoinedToJunctionIndexReader,
} from '../src/engine/WallRebuildCoordinator';

/** Adapter presenting a real WallPipelineV2Cache through the same read surface
 *  `WallFragmentBuilder` exposes to the flush (junctionsForWall/levelJunctions). */
function asIndexReader(cache: WallPipelineV2Cache): JoinedToJunctionIndexReader {
    return {
        junctionsForWall: (id: string) => cache.junctionsFor(id),
        get levelJunctions() { return cache.junctions; },
    };
}

const T = 0.2;
/** L-corner pair: A runs (0,0)→(4,0), B runs (4,0)→(4,3). */
const WALL_A: LevelWallSpec = { id: 'A', startXZ: { x: 0, z: 0 }, endXZ: { x: 4, z: 0 }, thickness: T };
const WALL_B_JOINED: LevelWallSpec = { id: 'B', startXZ: { x: 4, z: 0 }, endXZ: { x: 4, z: 3 }, thickness: T };
/** B moved far away — no junction with A. */
const WALL_B_AWAY: LevelWallSpec = { id: 'B', startXZ: { x: 20, z: 20 }, endXZ: { x: 24, z: 20 }, thickness: T };

describe('writeJoinedToEdgesForLevel — refusal gating (test d)', () => {
    it('(d) an UNREFRESHED index writes nothing and does not throw — a refusal is NOT zero junctions', () => {
        const graph = new SemanticGraphManager();
        // Pre-existing edge that a wrong "write empty" would have swept away.
        graph.replaceJoinedToForLevelWalls(['A', 'B'], [{ junctionType: 'L', junctionDegree: 2, wallIds: ['A', 'B'] }]);

        const cache = new WallPipelineV2Cache(); // refresh() has never run
        const outcome = writeJoinedToEdgesForLevel(asIndexReader(cache), ['A', 'B'], graph);

        expect(outcome.wrote).toBe(false);
        if (!outcome.wrote) {
            expect(outcome.reason).toBe('index-refused');
            expect(outcome.detail).toContain('never been');
        }
        // NOTHING was written or removed on the refusal.
        expect(graph.hasRelationship('A', 'B', 'joinedTo')).toBe(true);
        expect(graph.hasRelationship('B', 'A', 'joinedTo')).toBe(true);
    });

    it('a probe wall the cache did not see (wall-not-on-level) also refuses without writing', () => {
        const graph = new SemanticGraphManager();
        const cache = new WallPipelineV2Cache();
        cache.refresh([WALL_A, WALL_B_JOINED]);

        const outcome = writeJoinedToEdgesForLevel(asIndexReader(cache), ['ghost-wall'], graph);

        expect(outcome).toMatchObject({ wrote: false, reason: 'index-refused' });
        expect(graph.getAll()).toHaveLength(0);
    });

    it('a builder without the §CONNECT-3 accessors (older runtime) writes nothing and does not throw', () => {
        const graph = new SemanticGraphManager();
        const outcome = writeJoinedToEdgesForLevel({} as JoinedToJunctionIndexReader, ['A'], graph);
        expect(outcome).toMatchObject({ wrote: false, reason: 'builder-lacks-junction-index' });
        expect(graph.getAll()).toHaveLength(0);
    });

    it('an empty level is a no-op (delete-cascade owns edge purge for removed walls)', () => {
        const graph = new SemanticGraphManager();
        const cache = new WallPipelineV2Cache();
        cache.refresh([]);
        const outcome = writeJoinedToEdgesForLevel(asIndexReader(cache), [], graph);
        expect(outcome).toMatchObject({ wrote: false, reason: 'no-walls-on-level' });
    });
});

describe('writeJoinedToEdgesForLevel — against the REAL retained junction index', () => {
    it('(a) two walls join → both directions written with L junction metadata, createdBy system', () => {
        const graph = new SemanticGraphManager();
        const cache = new WallPipelineV2Cache();
        cache.refresh([WALL_A, WALL_B_JOINED]);

        const outcome = writeJoinedToEdgesForLevel(asIndexReader(cache), ['A', 'B'], graph);

        expect(outcome).toMatchObject({ wrote: true, junctionCount: 1, wallsCovered: 2 });
        expect(graph.hasRelationship('A', 'B', 'joinedTo')).toBe(true);
        expect(graph.hasRelationship('B', 'A', 'joinedTo')).toBe(true);
        const edge = graph.getRelationships('A', 'joinedTo')[0]!;
        expect(edge.metadata).toMatchObject({ junctionType: 'L', junctionDegree: 2 });
        expect(edge.createdBy).toBe('system');
        // C71 §3.5 — the within-solve junction handle is not stored.
        expect(Object.keys(edge.metadata!)).not.toContain('junctionId');

        const q = graph.getJoinedWalls('A');
        expect(q.ok).toBe(true);
        if (q.ok) expect(q.joinedWallIds).toEqual(['B']);

        // §C83 §10.6 — THE END-TO-END NARROWING CHECK, and it is the one that
        // cannot be faked by a unit test that hand-feeds 'L'. The vocabulary
        // here comes from the REAL retained junction index, and the reader
        // NARROWS rather than casts: if the solver ever emitted a value outside
        // `JoinedToJunctionType`, `junctionType` would read `undefined` and
        // §10.6's mutual-corner pivot would silently never fire in production
        // (absent ⇒ DO NOT FOLLOW, §10.6.3 #1). This asserts the real value
        // survives the narrowing, not merely that metadata exists on the edge.
        if (q.ok) expect(q.junctions).toEqual([{ wallId: 'B', junctionType: 'L', junctionDegree: 2 }]);
    });

    it('(b) THE STALENESS TEST — move a wall away, re-refresh, re-write → edges GONE', () => {
        const graph = new SemanticGraphManager();
        const cache = new WallPipelineV2Cache();

        cache.refresh([WALL_A, WALL_B_JOINED]);
        writeJoinedToEdgesForLevel(asIndexReader(cache), ['A', 'B'], graph);
        expect(graph.hasRelationship('A', 'B', 'joinedTo')).toBe(true);

        // The move: same walls on the level, junction no longer exists. This is
        // exactly the case addRelationship idempotency can never clean up.
        cache.refresh([WALL_A, WALL_B_AWAY]);
        const outcome = writeJoinedToEdgesForLevel(asIndexReader(cache), ['A', 'B'], graph);

        expect(outcome).toMatchObject({ wrote: true, junctionCount: 0 });
        expect(graph.hasRelationship('A', 'B', 'joinedTo')).toBe(false);
        expect(graph.hasRelationship('B', 'A', 'joinedTo')).toBe(false);
        // Both walls remain COVERED: "joins nothing" is a positive, typed answer.
        // §C83 §10.6 — and it carries an EMPTY `junctions` list, not an absent
        // one: zero partners means zero per-partner discriminators.
        expect(graph.getJoinedWalls('A')).toEqual({ ok: true, wallId: 'A', joinedWallIds: [], junctions: [] });
        expect(graph.getJoinedWalls('B')).toEqual({ ok: true, wallId: 'B', joinedWallIds: [], junctions: [] });
    });

    it('a T junction writes pairwise edges for all three participants', () => {
        const graph = new SemanticGraphManager();
        const cache = new WallPipelineV2Cache();
        // C butts into the BODY of A at (2,0): a T (A is the passthrough host).
        const wallC: LevelWallSpec = { id: 'C', startXZ: { x: 2, z: 0 }, endXZ: { x: 2, z: 3 }, thickness: T };
        cache.refresh([WALL_A, WALL_B_JOINED, wallC]);

        const outcome = writeJoinedToEdgesForLevel(asIndexReader(cache), ['A', 'B', 'C'], graph);
        expect(outcome.wrote).toBe(true);

        const qc = graph.getJoinedWalls('C');
        expect(qc.ok).toBe(true);
        if (qc.ok) expect(qc.joinedWallIds).toContain('A');
        const tEdge = graph.getRelationships('C', 'joinedTo').find(r => r.targetId === 'A' || r.sourceId === 'A')!;
        expect(tEdge.metadata!.junctionType).toBe('T');
    });
});
