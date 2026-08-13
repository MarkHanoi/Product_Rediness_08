// §FIX-STAIR-DELETE-LEAVES-GRAPH-EDGES (BIM 3.0 C71 §5.6 — graph integrity on
// delete) — deleting a stair must purge its SemanticGraph edges, and undo must
// restore them VERBATIM.
//
// THE BUG: DeleteStairCommand never called removeAllRelationshipsForElement, and
// since L-298 BOTH delete paths (the dedicated command and
// DeleteElementCommand's stair branch) delegate here — so EVERY stair delete in
// the product stranded every edge the stair owned. Graph edges are not
// self-erasing: a well-formed edge pointing at a deleted id survives
// serialize()/deserialize() and persists forever.
//
// THE STRAND SET is three edges wide, all written by CreateStairCommand:
//   · sitsOn            stair     → baseLevel
//   · connectedByStair  baseLevel → topLevel
//   · connectedByStair  topLevel  → baseLevel   (inverse; the level graph is
//     bidirectional for egress routing)
// The two connectedByStair edges are the interesting half: their ENDPOINTS are
// the two levels, and they name the stair only in metadata. So they are
// invisible to an id-scoped purge of the stair, and a deleted stair left
// DependencyResolver believing two levels were still connected by a stair that
// no longer exists.
//
// THE VERBATIM TOOTH: these tests do not merely COUNT edges after undo — a
// reconstruction would pass a count. They snapshot the full edge set
// (type/sourceId/targetId/createdBy/metadata) before the delete and assert
// field-by-field equality after the undo. A reconstruction from the stair
// snapshot would rebuild sitsOn but produce different metadata on the
// connectedByStair pair (or omit it entirely) and FAIL these assertions.

import { describe, it, expect, beforeEach } from 'vitest';
import { semanticGraphManager } from '@pryzm/core-app-model';
import { DeleteStairCommand } from '../src/stair/DeleteStairCommand';
import type { CommandContext } from '../src/types';

const STAIR_ID = 'stair-1';
const BASE_LEVEL = 'L0';
const TOP_LEVEL = 'L1';
const RAILING_ID = 'stair-1-railing-a';
const OTHER_STAIR_ID = 'stair-2';
const OTHER_ELEMENT_ID = 'wall-on-L0';
const ALL_IDS = [STAIR_ID, BASE_LEVEL, TOP_LEVEL, RAILING_ID, OTHER_STAIR_ID, OTHER_ELEMENT_ID];

function makeStairStore() {
    const map = new Map<string, any>();
    return {
        add: (s: any) => { map.set(s.id, s); },
        getById: (id: string) => map.get(id),
        remove: (id: string) => { map.delete(id); },
        restoreSnapshot: (s: any) => { map.set(s.id, s); },
        getStairConnectingLevels: () => undefined,
        getAll: () => Array.from(map.values()),
    };
}

function makeRailingStore() {
    const map = new Map<string, any>();
    return {
        add: (r: any) => { map.set(r.id, r); },
        getByStairId: (sid: string) => Array.from(map.values()).filter(r => r.stairId === sid),
        removeByStairId: (sid: string) => {
            for (const [id, r] of [...map.entries()]) if (r.stairId === sid) map.delete(id);
        },
    };
}

function makeCtx() {
    const stairStore = makeStairStore();
    const stairRailingStore = makeRailingStore();
    stairStore.add({
        id: STAIR_ID, type: 'stair', baseLevelId: BASE_LEVEL, topLevelId: TOP_LEVEL,
        shape: 'straight', position: { x: 0, y: 0, z: 0 },
        totalRise: 3.0, treadDepth: 0.28, riserHeight: 0.18, width: 1.0,
    });
    stairRailingStore.add({ id: RAILING_ID, stairId: STAIR_ID, side: 'left' });

    const ctx = {
        stores: { stairStore, stairRailingStore, wallStore: { getById: () => undefined } },
        bimManager: { registerElement: () => {}, unregisterElement: () => {} },
        projectContext: { activeLevelId: BASE_LEVEL },
    } as unknown as CommandContext;
    return { ctx, stairStore };
}

/** The exact three edges CreateStairCommand.ts:396-417 writes. */
function seedProductionEdges() {
    semanticGraphManager.addRelationship({
        type: 'sitsOn', sourceId: STAIR_ID, targetId: BASE_LEVEL,
        createdBy: 'CreateStairCommand', metadata: { addedBy: 'CreateStairCommand' },
    });
    semanticGraphManager.addRelationship({
        type: 'connectedByStair', sourceId: BASE_LEVEL, targetId: TOP_LEVEL,
        createdBy: 'CreateStairCommand', metadata: { stairId: STAIR_ID, shape: 'straight' },
    });
    semanticGraphManager.addRelationship({
        type: 'connectedByStair', sourceId: TOP_LEVEL, targetId: BASE_LEVEL,
        createdBy: 'CreateStairCommand', metadata: { stairId: STAIR_ID, shape: 'straight', inverse: true },
    });
}

/** Identity of an edge for verbatim comparison — everything EXCEPT the
 *  regenerated uuid/timestamp, which addRelationship necessarily re-mints. */
function identity(r: any) {
    return {
        type: r.type, sourceId: r.sourceId, targetId: r.targetId,
        createdBy: r.createdBy, metadata: r.metadata ?? undefined,
    };
}

/** Stable, order-independent fingerprint of every edge this stair owns. */
function stairEdgeFingerprint(): string[] {
    const seen = new Map<string, any>();
    for (const id of [STAIR_ID, BASE_LEVEL, TOP_LEVEL, RAILING_ID]) {
        for (const rel of semanticGraphManager.getRelationships(id)) {
            const isStairs =
                rel.sourceId === STAIR_ID || rel.targetId === STAIR_ID ||
                rel.sourceId === RAILING_ID || rel.targetId === RAILING_ID ||
                (rel.type === 'connectedByStair' && rel.metadata?.stairId === STAIR_ID);
            if (isStairs) seen.set(rel.id, rel);
        }
    }
    return [...seen.values()].map(r => JSON.stringify(identity(r))).sort();
}

function edgesTouching(id: string) {
    return semanticGraphManager.getRelationships(id);
}

beforeEach(() => {
    for (const id of ALL_IDS) semanticGraphManager.removeAllRelationshipsForElement(id);
});

describe('§FIX-STAIR-DELETE-LEAVES-GRAPH-EDGES — delete purges, undo restores verbatim', () => {
    it('THE TOOTH: after stair delete NO edge referencing the stair survives — sitsOn included', () => {
        const { ctx } = makeCtx();
        seedProductionEdges();
        expect(edgesTouching(STAIR_ID).length).toBe(1);

        const cmd = new DeleteStairCommand({ stairId: STAIR_ID });
        expect(cmd.canExecute(ctx).ok).toBe(true);
        expect(cmd.execute(ctx).success).toBe(true);

        // On the OLD code this edge survived — the C71 §5.6 gap.
        expect(edgesTouching(STAIR_ID)).toHaveLength(0);
    });

    it('THE TOOTH: both level→level connectedByStair edges are purged — they name the stair only in metadata', () => {
        const { ctx } = makeCtx();
        seedProductionEdges();
        const stairLinks = () => edgesTouching(BASE_LEVEL).filter(
            r => r.type === 'connectedByStair' && r.metadata?.stairId === STAIR_ID);
        expect(stairLinks()).toHaveLength(2);

        new DeleteStairCommand({ stairId: STAIR_ID }).execute(ctx);

        expect(stairLinks()).toHaveLength(0);
        expect(edgesTouching(TOP_LEVEL).filter(
            r => r.type === 'connectedByStair' && r.metadata?.stairId === STAIR_ID)).toHaveLength(0);
    });

    it('the purge is SCOPED: unrelated edges on the same levels survive an endpoint-wide blast', () => {
        const { ctx } = makeCtx();
        seedProductionEdges();
        // An unrelated element sitting on the base level, and a lift connecting
        // the same pair — neither belongs to this stair.
        semanticGraphManager.addRelationship({
            type: 'sitsOn', sourceId: OTHER_ELEMENT_ID, targetId: BASE_LEVEL,
            createdBy: 'CreateWallCommand', metadata: {},
        });
        semanticGraphManager.addRelationship({
            type: 'connectedByLift', sourceId: BASE_LEVEL, targetId: TOP_LEVEL,
            createdBy: 'CreateVerticalCirculationCommand', metadata: { liftId: 'lift-1' },
        });

        new DeleteStairCommand({ stairId: STAIR_ID }).execute(ctx);

        // removeAllRelationshipsForElement(BASE_LEVEL) would have destroyed both.
        // This is why the level→level pair is removed EDGE-WISE by id instead.
        expect(edgesTouching(OTHER_ELEMENT_ID).some(
            r => r.type === 'sitsOn' && r.targetId === BASE_LEVEL)).toBe(true);
        expect(edgesTouching(BASE_LEVEL).some(r => r.type === 'connectedByLift')).toBe(true);
    });

    // §UPSTREAM-LIMITATION — NOT fixed by this commit, asserted so it cannot
    // regress silently and so the next reader is not misled.
    //
    // addRelationship() is idempotent on (sourceId, targetId, type) and IGNORES
    // metadata (SemanticGraph.ts:213 `_findExact`). Two stairs connecting the
    // SAME level pair therefore share ONE connectedByStair edge — the second
    // CreateStairCommand's write is a silent no-op that returns the FIRST
    // stair's edge id. Consequence: deleting either stair correctly removes the
    // one edge that exists, and the surviving stair is left with no
    // connectedByStair edge at all.
    //
    // This is an upstream KEYING defect in the edge model, not a delete defect,
    // and fixing it means keying connectedByStair on the stair (or making
    // idempotency metadata-aware) — a change to CreateStairCommand and the graph
    // that belongs in its own lane. This delete cannot paper over it: with only
    // one edge present there is nothing for the delete to preserve. Recorded
    // here rather than left as a passing illusion.
    it('KNOWN UPSTREAM GAP: two stairs on one level pair collapse to a single edge (metadata-blind idempotency)', () => {
        seedProductionEdges();
        const linksBefore = edgesTouching(BASE_LEVEL).filter(r => r.type === 'connectedByStair');
        expect(linksBefore).toHaveLength(2); // one per direction, for stair-1

        // A rival stair between the SAME pair — both directions.
        semanticGraphManager.addRelationship({
            type: 'connectedByStair', sourceId: BASE_LEVEL, targetId: TOP_LEVEL,
            createdBy: 'CreateStairCommand', metadata: { stairId: OTHER_STAIR_ID, shape: 'l-shaped' },
        });
        semanticGraphManager.addRelationship({
            type: 'connectedByStair', sourceId: TOP_LEVEL, targetId: BASE_LEVEL,
            createdBy: 'CreateStairCommand', metadata: { stairId: OTHER_STAIR_ID, inverse: true },
        });

        // THE GAP: still 2, not 4 — the rival's writes were swallowed whole, and
        // the surviving edges still carry stair-1's metadata.
        const linksAfter = edgesTouching(BASE_LEVEL).filter(r => r.type === 'connectedByStair');
        expect(linksAfter).toHaveLength(2);
        expect(linksAfter.every(r => r.metadata?.stairId === STAIR_ID)).toBe(true);
    });

    it('THE VERBATIM TOOTH: undo restores all three edges BYTE-IDENTICAL — a reconstruction would not', () => {
        const { ctx } = makeCtx();
        seedProductionEdges();
        const before = stairEdgeFingerprint();
        expect(before).toHaveLength(3);

        const cmd = new DeleteStairCommand({ stairId: STAIR_ID });
        cmd.execute(ctx);
        expect(stairEdgeFingerprint()).toHaveLength(0);

        cmd.undo(ctx);

        const after = stairEdgeFingerprint();
        // Not a count — the full (type, source, target, createdBy, metadata)
        // tuple of every edge, compared field-for-field.
        expect(after).toEqual(before);
        // And spelled out, so the failure message names the missing edge:
        expect(after).toContain(JSON.stringify(identity({
            type: 'connectedByStair', sourceId: TOP_LEVEL, targetId: BASE_LEVEL,
            createdBy: 'CreateStairCommand',
            metadata: { stairId: STAIR_ID, shape: 'straight', inverse: true },
        })));
    });

    it('metadata survives verbatim: the inverse flag and shape are not re-derived', () => {
        const { ctx } = makeCtx();
        seedProductionEdges();
        const cmd = new DeleteStairCommand({ stairId: STAIR_ID });
        cmd.execute(ctx);
        cmd.undo(ctx);

        const inverse = edgesTouching(TOP_LEVEL).find(
            r => r.type === 'connectedByStair' && r.sourceId === TOP_LEVEL &&
                 r.metadata?.stairId === STAIR_ID);
        expect(inverse).toBeDefined();
        expect(inverse!.metadata).toEqual({ stairId: STAIR_ID, shape: 'straight', inverse: true });
        expect(inverse!.createdBy).toBe('CreateStairCommand');
    });

    it('redo purges again and a second undo restores exactly 3 edges, not 6 (idempotency)', () => {
        const { ctx } = makeCtx();
        seedProductionEdges();
        const before = stairEdgeFingerprint();

        const cmd = new DeleteStairCommand({ stairId: STAIR_ID });
        cmd.execute(ctx);
        cmd.undo(ctx);
        cmd.execute(ctx); // redo
        expect(stairEdgeFingerprint()).toHaveLength(0);
        cmd.undo(ctx);

        expect(stairEdgeFingerprint()).toEqual(before); // 3, not 6
    });

    it('SAVE/RELOAD after delete: the serialized graph holds no edge referencing the stair', () => {
        const { ctx } = makeCtx();
        seedProductionEdges();
        new DeleteStairCommand({ stairId: STAIR_ID }).execute(ctx);

        const persisted = semanticGraphManager.serialize();
        expect(persisted.relationships.some(
            (r: any) => r.sourceId === STAIR_ID || r.targetId === STAIR_ID ||
                        (r.type === 'connectedByStair' && r.metadata?.stairId === STAIR_ID),
        )).toBe(false);

        semanticGraphManager.deserialize(persisted);
        expect(stairEdgeFingerprint()).toHaveLength(0);
    });
});
