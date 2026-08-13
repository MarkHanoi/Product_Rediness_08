// §FIX-LEVEL-DELETE-LEAVES-GRAPH-EDGES (BIM 3.0 C71 §5.6 — graph integrity on
// delete) — deleting a level must purge its SemanticGraph edges, and undo must
// restore them VERBATIM.
//
// THE DEFECT: DeleteLevelCommand never purged the SemanticGraph at all. A
// well-formed edge pointing at a deleted id is not self-erasing: it survives
// serialize()/deserialize() and persists forever.
//
// WHAT ACTUALLY STRANDS — and why the childrenIds guard does NOT cover it.
// canExecute() refuses when `level.childrenIds.length > 0`, which makes the
// OBVIOUS strand set (one `sitsOn` per element on the level) mostly unreachable:
// the user must clear the level first, and clearing it deletes those elements
// with their edges. But `childrenIds` is populated by registerElement, and the
// LEVEL-PAIR families are registered against ONE endpoint only:
//
//   · CreateStairCommand:289 registers the stair on the BASE level, then writes
//     `connectedByStair` in BOTH directions between base and TOP level (:411).
//   · CreateVerticalCirculationCommand:195 registers the lift on the BASE level,
//     then writes `connectedByLift` both ways (:264).
//
// So the TOP level of every stair and lift holds two edges while its
// childrenIds stays EMPTY. It passes the guard, deletes cleanly, and leaves
// DependencyResolver believing a level that no longer exists is still reachable
// by stair. These tests reproduce exactly that configuration.
//
// THE VERBATIM TOOTH: reconstruction is not merely weaker here, it is
// IMPOSSIBLE — `Level` carries no record of the stairs and lifts connecting to
// it, so nothing in the snapshot names the edges to rebuild. The tests
// fingerprint the full (type, sourceId, targetId, createdBy, authoredBy,
// metadata) tuple, which also pins `authoredBy`: that field is part of the
// edge's IDENTITY for exactly these two families, and an undo that dropped it
// would silently merge two stairs' edges into one.

import { describe, it, expect, beforeEach } from 'vitest';
import { semanticGraphManager } from '@pryzm/core-app-model';
import { DeleteLevelCommand } from '../src/levels/DeleteLevelCommand';
import type { CommandContext } from '../src/types';

const BASE_LEVEL = 'L0';
const TOP_LEVEL = 'L1';      // the level under test — deleted with EMPTY childrenIds
const THIRD_LEVEL = 'L2';
const STAIR_ID = 'stair-a';
const LIFT_ID = 'lift-a';
const OTHER_STAIR_ID = 'stair-b';
const ALL_IDS = [BASE_LEVEL, TOP_LEVEL, THIRD_LEVEL, STAIR_ID, LIFT_ID, OTHER_STAIR_ID];

function makeLevel(id: string, elevation: number, childrenIds: string[] = []) {
    return { id, name: `Level ${id}`, elevation, childrenIds, height: 3.0 } as any;
}

function makeCtx() {
    const levels = new Map<string, any>([
        [BASE_LEVEL, makeLevel(BASE_LEVEL, 0)],
        // THE CONFIGURATION UNDER TEST: the stair's TOP level. It holds
        // connectedByStair edges but registers NO children, because
        // CreateStairCommand registered the stair against the base level.
        [TOP_LEVEL, makeLevel(TOP_LEVEL, 3)],
        [THIRD_LEVEL, makeLevel(THIRD_LEVEL, 6)],
    ]);
    const bimManager = {
        getLevelById: (id: string) => levels.get(id),
        getLevels: () => [...levels.values()],
        removeLevel: (id: string) => { levels.delete(id); },
        addLevel: (l: any) => { levels.set(l.id, l); },
        registerElement: () => {},
        unregisterElement: () => {},
    };
    const ctx = {
        bimManager,
        projectContext: { activeLevelId: TOP_LEVEL },
        stores: {
            wallStore: { getById: () => undefined, getWindow: () => undefined, getDoor: () => undefined, getByLevel: () => [], removeLevel: () => {} },
        },
    } as unknown as CommandContext;
    return { ctx, levels };
}

/**
 * The edges a real project carries against a stair's TOP level. NONE of them is
 * derivable from `Level`, and none of them puts anything in childrenIds.
 */
function seedProductionEdges() {
    // Stair A: base L0 → top L1. Both directions, keyed by authoredBy.
    semanticGraphManager.addRelationship({
        type: 'connectedByStair', sourceId: BASE_LEVEL, targetId: TOP_LEVEL,
        authoredBy: STAIR_ID, createdBy: 'CreateStairCommand',
        metadata: { stairId: STAIR_ID, shape: 'straight' },
    });
    semanticGraphManager.addRelationship({
        type: 'connectedByStair', sourceId: TOP_LEVEL, targetId: BASE_LEVEL,
        authoredBy: STAIR_ID, createdBy: 'CreateStairCommand',
        metadata: { stairId: STAIR_ID, shape: 'straight', inverse: true },
    });
    // Lift A: base L0 → top L1, a SECOND family on the same level pair.
    semanticGraphManager.addRelationship({
        type: 'connectedByLift', sourceId: BASE_LEVEL, targetId: TOP_LEVEL,
        authoredBy: LIFT_ID, createdBy: 'CreateVerticalCirculationCommand',
        metadata: { liftId: LIFT_ID, kind: 'passenger' },
    });
    semanticGraphManager.addRelationship({
        type: 'connectedByLift', sourceId: TOP_LEVEL, targetId: BASE_LEVEL,
        authoredBy: LIFT_ID, createdBy: 'CreateVerticalCirculationCommand',
        metadata: { liftId: LIFT_ID, kind: 'passenger', inverse: true },
    });
}

function identity(r: any) {
    return {
        type: r.type, sourceId: r.sourceId, targetId: r.targetId,
        createdBy: r.createdBy,
        authoredBy: r.authoredBy ?? undefined,
        metadata: r.metadata ?? undefined,
    };
}

function fingerprintOf(id: string): string[] {
    return semanticGraphManager.getRelationships(id)
        .map(r => JSON.stringify(identity(r))).sort();
}

function edgesTouching(id: string) {
    return semanticGraphManager.getRelationships(id);
}

beforeEach(() => {
    for (const id of ALL_IDS) semanticGraphManager.removeAllRelationshipsForElement(id);
});

describe('§FIX-LEVEL-DELETE-LEAVES-GRAPH-EDGES — DeleteLevelCommand (never purged)', () => {
    it('THE REACHABILITY PROOF: the level under test has EMPTY childrenIds and still holds four edges', () => {
        const { ctx, levels } = makeCtx();
        seedProductionEdges();

        // This is the whole point. The guard sees nothing; the graph sees four.
        expect(levels.get(TOP_LEVEL).childrenIds).toHaveLength(0);
        expect(edgesTouching(TOP_LEVEL)).toHaveLength(4);
        expect(new DeleteLevelCommand({ levelId: TOP_LEVEL }).canExecute(ctx).ok).toBe(true);
    });

    it('THE TOOTH: after delete NO edge referencing the level survives', () => {
        const { ctx } = makeCtx();
        seedProductionEdges();
        expect(edgesTouching(TOP_LEVEL)).toHaveLength(4);

        const cmd = new DeleteLevelCommand({ levelId: TOP_LEVEL });
        expect(cmd.canExecute(ctx).ok).toBe(true);
        expect(cmd.execute(ctx).success).toBe(true);

        // On the OLD code ALL FOUR survived, and DependencyResolver went on
        // believing a level that no longer exists was reachable by stair.
        expect(edgesTouching(TOP_LEVEL)).toHaveLength(0);
        expect(edgesTouching(BASE_LEVEL).some(
            r => r.sourceId === TOP_LEVEL || r.targetId === TOP_LEVEL)).toBe(false);
    });

    it('THE VERBATIM TOOTH: undo restores all four edges BYTE-IDENTICAL, authoredBy and metadata included', () => {
        const { ctx } = makeCtx();
        seedProductionEdges();
        const before = fingerprintOf(TOP_LEVEL);
        expect(before).toHaveLength(4);

        const cmd = new DeleteLevelCommand({ levelId: TOP_LEVEL });
        cmd.execute(ctx);
        expect(fingerprintOf(TOP_LEVEL)).toHaveLength(0);
        cmd.undo(ctx);

        expect(fingerprintOf(TOP_LEVEL)).toEqual(before);
        // Reconstruction is IMPOSSIBLE here — Level names no stair or lift — so
        // any undo that passed this test did so by capturing verbatim.
        expect(fingerprintOf(TOP_LEVEL)).toContain(JSON.stringify(identity({
            type: 'connectedByStair', sourceId: BASE_LEVEL, targetId: TOP_LEVEL,
            authoredBy: STAIR_ID, createdBy: 'CreateStairCommand',
            metadata: { stairId: STAIR_ID, shape: 'straight' },
        })));
        expect(fingerprintOf(TOP_LEVEL)).toContain(JSON.stringify(identity({
            type: 'connectedByLift', sourceId: TOP_LEVEL, targetId: BASE_LEVEL,
            authoredBy: LIFT_ID, createdBy: 'CreateVerticalCirculationCommand',
            metadata: { liftId: LIFT_ID, kind: 'passenger', inverse: true },
        })));
    });

    it('AUTHOREDBY SURVIVES: two stairs on the same level pair stay TWO edges through delete+undo', () => {
        const { ctx } = makeCtx();
        seedProductionEdges();
        // A SECOND stair between the same two levels. §FIX-CONNECTEDBY-EDGE-KEYING
        // makes this a distinct edge only because authoredBy is in its identity.
        semanticGraphManager.addRelationship({
            type: 'connectedByStair', sourceId: BASE_LEVEL, targetId: TOP_LEVEL,
            authoredBy: OTHER_STAIR_ID, createdBy: 'CreateStairCommand',
            metadata: { stairId: OTHER_STAIR_ID, shape: 'dogleg' },
        });
        const before = fingerprintOf(TOP_LEVEL);
        expect(before).toHaveLength(5);

        const cmd = new DeleteLevelCommand({ levelId: TOP_LEVEL });
        cmd.execute(ctx);
        cmd.undo(ctx);

        // An undo that dropped authoredBy would restore these two as ONE edge
        // and silently eat the second stair's connection — 5 would become 4.
        expect(fingerprintOf(TOP_LEVEL)).toEqual(before);
        expect(fingerprintOf(TOP_LEVEL)).toHaveLength(5);
        const stairEdges = edgesTouching(TOP_LEVEL).filter(
            r => r.type === 'connectedByStair' && r.sourceId === BASE_LEVEL);
        expect(new Set(stairEdges.map(r => r.authoredBy))).toEqual(new Set([STAIR_ID, OTHER_STAIR_ID]));
    });

    it('the purge is SCOPED: an unrelated level pair (L0↔L2) is untouched', () => {
        const { ctx } = makeCtx();
        seedProductionEdges();
        semanticGraphManager.addRelationship({
            type: 'connectedByStair', sourceId: BASE_LEVEL, targetId: THIRD_LEVEL,
            authoredBy: OTHER_STAIR_ID, createdBy: 'CreateStairCommand',
            metadata: { stairId: OTHER_STAIR_ID },
        });
        const thirdBefore = fingerprintOf(THIRD_LEVEL);
        expect(thirdBefore).toHaveLength(1);

        new DeleteLevelCommand({ levelId: TOP_LEVEL }).execute(ctx);

        // The purge takes the DELETED level's endpoint only. L0 survives as an
        // element and keeps every edge that does not name L1.
        expect(fingerprintOf(THIRD_LEVEL)).toEqual(thirdBefore);
        expect(edgesTouching(BASE_LEVEL).some(r => r.targetId === THIRD_LEVEL)).toBe(true);
    });

    it('redo purges again; a second undo restores exactly 4 edges, not 8 (idempotency)', () => {
        const { ctx } = makeCtx();
        seedProductionEdges();
        const before = fingerprintOf(TOP_LEVEL);

        const cmd = new DeleteLevelCommand({ levelId: TOP_LEVEL });
        cmd.execute(ctx);
        cmd.undo(ctx);
        cmd.execute(ctx); // redo
        expect(fingerprintOf(TOP_LEVEL)).toHaveLength(0);
        cmd.undo(ctx);

        expect(fingerprintOf(TOP_LEVEL)).toEqual(before);
    });

    it('SAVE/RELOAD after delete: the serialized graph holds no edge referencing the level', () => {
        const { ctx } = makeCtx();
        seedProductionEdges();
        new DeleteLevelCommand({ levelId: TOP_LEVEL }).execute(ctx);

        const persisted = semanticGraphManager.serialize();
        expect(persisted.relationships.some(
            (r: any) => r.sourceId === TOP_LEVEL || r.targetId === TOP_LEVEL)).toBe(false);

        semanticGraphManager.deserialize(persisted);
        expect(fingerprintOf(TOP_LEVEL)).toHaveLength(0);
    });

    it('a level carrying element sitsOn edges purges those too, and undo brings them back verbatim', () => {
        // The strand set canExecute's guard was MEANT to cover. Reachable via
        // any path that registers a sitsOn without registerElement (batch
        // import, snapshot rebuild) — rebuildSemanticGraph writes sitsOn from
        // element.levelId alone, with no BimManager registration at all.
        const { ctx } = makeCtx();
        seedProductionEdges();
        semanticGraphManager.addRelationship({
            type: 'sitsOn', sourceId: 'imported-slab-9', targetId: TOP_LEVEL,
            createdBy: 'system', metadata: { source: 'rebuildSemanticGraph' },
        });
        const before = fingerprintOf(TOP_LEVEL);
        expect(before).toHaveLength(5);

        const cmd = new DeleteLevelCommand({ levelId: TOP_LEVEL });
        cmd.execute(ctx);
        expect(edgesTouching('imported-slab-9')).toHaveLength(0);
        cmd.undo(ctx);

        expect(fingerprintOf(TOP_LEVEL)).toEqual(before);
        semanticGraphManager.removeAllRelationshipsForElement('imported-slab-9');
    });
});
