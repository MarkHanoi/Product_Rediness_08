// §FIX-ROOF-DELETE-LEAVES-GRAPH-EDGES (BIM 3.0 C71 §5.6 — graph integrity on
// delete) — deleting a roof must purge its SemanticGraph edges, and undo must
// restore them VERBATIM. Both of the kind's two producers are covered here,
// because they had DIFFERENT defects.
//
// THE TWO DEFECTS:
//   · DeleteRoofCommand         — never purged at all. CreateRoofCommand:236
//     writes a real `sitsOn` (roof → level), so this path stranded a real edge
//     on every delete. A well-formed edge pointing at a deleted id is not
//     self-erasing: it survives serialize()/deserialize() and persists forever.
//     Note the asymmetry this exposed: execute() ALREADY called
//     topologyGraph.removeNode(roofId), so the roof was torn out of the TOPOLOGY
//     graph while its SEMANTIC edges were left behind — two graphs, one delete,
//     opposite behaviours.
//   · DeleteElementCommand#roof — purged, but undo restored NOTHING. C71 §5.6
//     rates that worse than no purge because it looks correct: delete+undo
//     silently erased the roof's graph presence permanently.
//
// THE VERBATIM TOOTH: these tests do not merely COUNT edges after undo — a
// reconstruction would pass a count, and `sitsOn` LOOKS reconstructible because
// the roof snapshot carries levelId. So the tests seed an edge that is NOT
// derivable from the roof's own fields (a room's `coveredBy`, authored by
// another element's command) and assert it returns field-for-field.

import { describe, it, expect, beforeEach } from 'vitest';
import { semanticGraphManager } from '@pryzm/core-app-model';
import { DeleteRoofCommand } from '../src/roofs/DeleteRoofCommand';
import { DeleteElementCommand } from '../src/walls/DeleteElementCommand';
import type { CommandContext } from '../src/types';

const ROOF_ID = 'roof-1';
const LEVEL_ID = 'L1';
const WALL_ID = 'wall-under-roof';
const OTHER_ELEMENT_ID = 'slab-on-L1';
const ALL_IDS = [ROOF_ID, LEVEL_ID, WALL_ID, OTHER_ELEMENT_ID];

function makeRoof() {
    return {
        id: ROOF_ID, type: 'roof', levelId: LEVEL_ID, roofType: 'gable',
        footprint: {
            polygon: [[-2, -2], [2, -2], [2, 2], [-2, 2]] as [number, number][],
            centroid: [0, 0] as [number, number],
        },
        baseElevation: 3.0, pitch: 30, thickness: 0.25,
        metadata: {}, properties: {},
    };
}

function makeCtx() {
    const roofs = new Map<string, any>([[ROOF_ID, makeRoof()]]);
    const roofStore = {
        add: (d: any) => { roofs.set(d.id, d); },
        remove: (id: string) => { roofs.delete(id); },
        get: (id: string) => roofs.get(id),
        getById: (id: string) => roofs.get(id),
        getAll: () => [...roofs.values()],
    };
    const ctx = {
        bimManager: { registerElement: () => {}, unregisterElement: () => {} },
        projectContext: { activeLevelId: LEVEL_ID },
        stores: {
            roofStore,
            wallStore: { getById: () => undefined, getWindow: () => undefined, getDoor: () => undefined, getByLevel: () => [] },
        },
        // The topology stub the roof branch already drove — recorded so the test
        // can show the SEMANTIC purge is new while this one was always there.
        topologyGraph: { removeNode: () => {} },
    } as unknown as CommandContext;
    return { ctx, roofs };
}

/** The edge CreateRoofCommand:236 writes, plus one authored by ANOTHER
 *  element's command — the edge a reconstruction cannot know about. */
function seedProductionEdges() {
    semanticGraphManager.addRelationship({
        type: 'sitsOn', sourceId: ROOF_ID, targetId: LEVEL_ID,
        createdBy: 'CreateRoofCommand',
        metadata: { addedBy: 'CreateRoofCommand', roofType: 'gable' },
    });
    // Authored against the roof by the WALL's side of the model: invisible in
    // the roof snapshot, so only a verbatim capture can bring it back.
    semanticGraphManager.addRelationship({
        type: 'supports', sourceId: WALL_ID, targetId: ROOF_ID,
        createdBy: 'DetectAllRoomsCommand', metadata: { bearing: 'eave' },
    });
}

function identity(r: any) {
    return {
        type: r.type, sourceId: r.sourceId, targetId: r.targetId,
        createdBy: r.createdBy, metadata: r.metadata ?? undefined,
    };
}

function roofFingerprint(): string[] {
    return semanticGraphManager.getRelationships(ROOF_ID)
        .map(r => JSON.stringify(identity(r))).sort();
}

function edgesTouching(id: string) {
    return semanticGraphManager.getRelationships(id);
}

beforeEach(() => {
    for (const id of ALL_IDS) semanticGraphManager.removeAllRelationshipsForElement(id);
});

describe('§FIX-ROOF-DELETE-LEAVES-GRAPH-EDGES — producer 1: DeleteRoofCommand (never purged)', () => {
    it('THE TOOTH: after delete NO edge referencing the roof survives', () => {
        const { ctx } = makeCtx();
        seedProductionEdges();
        expect(edgesTouching(ROOF_ID)).toHaveLength(2);

        const cmd = new DeleteRoofCommand(ROOF_ID);
        expect(cmd.canExecute(ctx).ok).toBe(true);
        expect(cmd.execute(ctx).success).toBe(true);

        // On the OLD code BOTH edges survived, even though the same execute()
        // had already removed the roof from the TOPOLOGY graph.
        expect(edgesTouching(ROOF_ID)).toHaveLength(0);
        expect(edgesTouching(WALL_ID).some(r => r.targetId === ROOF_ID)).toBe(false);
    });

    it('THE VERBATIM TOOTH: undo restores both edges BYTE-IDENTICAL, including the wall-authored one', () => {
        const { ctx } = makeCtx();
        seedProductionEdges();
        const before = roofFingerprint();
        expect(before).toHaveLength(2);

        const cmd = new DeleteRoofCommand(ROOF_ID);
        cmd.execute(ctx);
        expect(roofFingerprint()).toHaveLength(0);
        cmd.undo(ctx);

        expect(roofFingerprint()).toEqual(before);
        // A reconstruction from the roof snapshot would restore sitsOn (levelId
        // is in the snapshot) and DROP this one.
        expect(roofFingerprint()).toContain(JSON.stringify(identity({
            type: 'supports', sourceId: WALL_ID, targetId: ROOF_ID,
            createdBy: 'DetectAllRoomsCommand', metadata: { bearing: 'eave' },
        })));
    });

    it('the purge is SCOPED: an unrelated sitsOn to the same level survives', () => {
        const { ctx } = makeCtx();
        seedProductionEdges();
        semanticGraphManager.addRelationship({
            type: 'sitsOn', sourceId: OTHER_ELEMENT_ID, targetId: LEVEL_ID,
            createdBy: 'CreateSlabCommand', metadata: {},
        });

        new DeleteRoofCommand(ROOF_ID).execute(ctx);

        expect(edgesTouching(OTHER_ELEMENT_ID).some(
            r => r.type === 'sitsOn' && r.targetId === LEVEL_ID)).toBe(true);
    });

    it('redo purges again; a second undo restores exactly 2 edges, not 4 (idempotency)', () => {
        const { ctx } = makeCtx();
        seedProductionEdges();
        const before = roofFingerprint();

        const cmd = new DeleteRoofCommand(ROOF_ID);
        cmd.execute(ctx);
        cmd.undo(ctx);
        cmd.execute(ctx); // redo
        expect(roofFingerprint()).toHaveLength(0);
        cmd.undo(ctx);

        expect(roofFingerprint()).toEqual(before);
    });

    it('SAVE/RELOAD after delete: the serialized graph holds no edge referencing the roof', () => {
        const { ctx } = makeCtx();
        seedProductionEdges();
        new DeleteRoofCommand(ROOF_ID).execute(ctx);

        const persisted = semanticGraphManager.serialize();
        expect(persisted.relationships.some(
            (r: any) => r.sourceId === ROOF_ID || r.targetId === ROOF_ID)).toBe(false);

        semanticGraphManager.deserialize(persisted);
        expect(roofFingerprint()).toHaveLength(0);
    });
});

describe('§FIX-ROOF-DELETE-LEAVES-GRAPH-EDGES — producer 2: DeleteElementCommand#roof (purged, restored nothing)', () => {
    it('purges on delete (unchanged) AND now restores verbatim on undo', () => {
        const { ctx } = makeCtx();
        seedProductionEdges();
        const before = roofFingerprint();
        expect(before).toHaveLength(2);

        const cmd = new DeleteElementCommand(ROOF_ID);
        expect(cmd.canExecute(ctx).ok).toBe(true);
        cmd.execute(ctx);
        expect(roofFingerprint()).toHaveLength(0);

        cmd.undo(ctx);

        // On the OLD code this was still 0 — the purge was irreversible.
        expect(roofFingerprint()).toEqual(before);
    });

    it('the two producers now AGREE: same delete state and same undo state from either path', () => {
        const a = makeCtx();
        seedProductionEdges();
        const baseline = roofFingerprint();
        const cmdA = new DeleteRoofCommand(ROOF_ID);
        cmdA.execute(a.ctx);
        const afterDeleteA = roofFingerprint();
        cmdA.undo(a.ctx);
        const afterUndoA = roofFingerprint();

        for (const id of ALL_IDS) semanticGraphManager.removeAllRelationshipsForElement(id);
        const b = makeCtx();
        seedProductionEdges();
        const cmdB = new DeleteElementCommand(ROOF_ID);
        cmdB.execute(b.ctx);
        const afterDeleteB = roofFingerprint();
        cmdB.undo(b.ctx);
        const afterUndoB = roofFingerprint();

        expect(afterDeleteA).toEqual(afterDeleteB); // both empty
        expect(afterUndoA).toEqual(afterUndoB);     // both the verbatim baseline
        expect(afterUndoA).toEqual(baseline);
    });
});
