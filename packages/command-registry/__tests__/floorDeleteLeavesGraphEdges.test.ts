// §FIX-FLOOR-DELETE-LEAVES-GRAPH-EDGES (BIM 3.0 C71 §5.6 — graph integrity on
// delete) — deleting a floor must purge its SemanticGraph edges, and undo must
// restore them VERBATIM. Both of the kind's two producers are covered here,
// because they had DIFFERENT defects — the divergence the gate exists to catch.
//
// THE TWO DEFECTS:
//   · RemoveFloorCommand         — never purged at all. It unregistered the
//     floor from elementRegistry AND BimManager, removed it from the store, and
//     even drove a full ReseatLevelElementsCommand consequence — while leaving
//     every SemanticGraph edge pointing at the dead id. One delete, one
//     cross-element consequence honoured and one silently skipped. A
//     well-formed edge at a deleted id is not self-erasing: it survives
//     serialize()/deserialize() and persists forever.
//   · DeleteElementCommand#floor — purged, but undo restored NOTHING. C71 §5.6
//     rates that worse than no purge because it looks correct: delete+undo
//     silently erased the floor's graph presence permanently.
//
// THE VERBATIM TOOTH: these tests do not merely COUNT edges after undo — a
// reconstruction would pass a count, and the floor snapshot makes reconstruction
// look FEASIBLE: FloorData carries levelId, coveredRoomIds AND boundingWallIds.
// So the tests seed an edge that is NOT derivable from ANY floor field — a
// furniture item's `sitsOn` against the floor, authored by another element's
// command — and assert it returns field-for-field.

import { describe, it, expect, beforeEach } from 'vitest';
import { semanticGraphManager } from '@pryzm/core-app-model';
import { RemoveFloorCommand } from '../src/floors/RemoveFloorCommand';
import { DeleteElementCommand } from '../src/walls/DeleteElementCommand';
import type { CommandContext } from '../src/types';

const FLOOR_ID = 'floor-1';
const LEVEL_ID = 'L1';
const ROOM_ID = 'room-over-floor';
const FURNITURE_ID = 'sofa-3';
const OTHER_ELEMENT_ID = 'slab-on-L1';
const ALL_IDS = [FLOOR_ID, LEVEL_ID, ROOM_ID, FURNITURE_ID, OTHER_ELEMENT_ID];

function makeFloor() {
    return {
        id: FLOOR_ID,
        type: 'floor',
        levelId: LEVEL_ID,
        label: 'Floor 1',
        floorNumber: 'F-101',
        boundary: { polygon: [[-2, -2], [2, -2], [2, 2], [-2, 2]] },
        finishSpec: {},
        serviceHoles: [],
        coveredRoomIds: [ROOM_ID],
        boundingWallIds: [],
    } as any;
}

function makeCtx() {
    const floors = new Map<string, any>([[FLOOR_ID, makeFloor()]]);
    const floorStore = {
        add: (d: any) => { floors.set(d.id, d); },
        restoreSnapshot: (d: any) => { floors.set(d.id, d); },
        remove: (id: string) => { floors.delete(id); },
        get: (id: string) => floors.get(id),
        getById: (id: string) => floors.get(id),
        has: (id: string) => floors.has(id),
        getAll: () => [...floors.values()],
    };
    const ctx = {
        bimManager: { registerElement: () => {}, unregisterElement: () => {} },
        projectContext: { activeLevelId: LEVEL_ID },
        stores: {
            floorStore,
            wallStore: { getById: () => undefined, getWindow: () => undefined, getDoor: () => undefined, getByLevel: () => [] },
        },
        topologyGraph: { removeNode: () => {} },
    } as unknown as CommandContext;
    return { ctx, floors };
}

/**
 * The edges a real project carries on a floor. Two of the three are
 * SNAPSHOT-DERIVABLE (levelId, coveredRoomIds) — a reconstruction would rebuild
 * exactly those and pass a count. The third is authored by the FURNITURE
 * command's side of the model and appears nowhere in FloorData: only a verbatim
 * capture can bring it back.
 */
function seedProductionEdges() {
    semanticGraphManager.addRelationship({
        type: 'sitsOn', sourceId: FLOOR_ID, targetId: LEVEL_ID,
        createdBy: 'CreateFloorCommand',
        metadata: { addedBy: 'CreateFloorCommand', floorNumber: 'F-101' },
    });
    semanticGraphManager.addRelationship({
        type: 'contains', sourceId: ROOM_ID, targetId: FLOOR_ID,
        createdBy: 'DetectAllRoomsCommand', metadata: { finish: 'oak' },
    });
    // THE EDGE A RECONSTRUCTION CANNOT SEE — the sofa seats itself on the floor
    // finish; FloorData has no field naming this furniture item.
    semanticGraphManager.addRelationship({
        type: 'sitsOn', sourceId: FURNITURE_ID, targetId: FLOOR_ID,
        createdBy: 'CreateFurnitureCommand', metadata: { fflOffset: 0.015, seated: true },
    });
}

function identity(r: any) {
    return {
        type: r.type, sourceId: r.sourceId, targetId: r.targetId,
        createdBy: r.createdBy, metadata: r.metadata ?? undefined,
    };
}

function floorFingerprint(): string[] {
    return semanticGraphManager.getRelationships(FLOOR_ID)
        .map(r => JSON.stringify(identity(r))).sort();
}

function edgesTouching(id: string) {
    return semanticGraphManager.getRelationships(id);
}

beforeEach(() => {
    for (const id of ALL_IDS) semanticGraphManager.removeAllRelationshipsForElement(id);
});

describe('§FIX-FLOOR-DELETE-LEAVES-GRAPH-EDGES — producer 1: RemoveFloorCommand (never purged)', () => {
    it('THE TOOTH: after delete NO edge referencing the floor survives', () => {
        const { ctx } = makeCtx();
        seedProductionEdges();
        expect(edgesTouching(FLOOR_ID)).toHaveLength(3);

        const cmd = new RemoveFloorCommand({ floorId: FLOOR_ID });
        expect(cmd.canExecute(ctx).ok).toBe(true);
        expect(cmd.execute(ctx).success).toBe(true);

        // On the OLD code ALL THREE survived, even though the same execute() had
        // already driven a full ReseatLevelElementsCommand consequence.
        expect(edgesTouching(FLOOR_ID)).toHaveLength(0);
        expect(edgesTouching(ROOM_ID).some(r => r.targetId === FLOOR_ID)).toBe(false);
        expect(edgesTouching(FURNITURE_ID).some(r => r.targetId === FLOOR_ID)).toBe(false);
    });

    it('THE VERBATIM TOOTH: undo restores all three edges BYTE-IDENTICAL, including the furniture-authored one', () => {
        const { ctx } = makeCtx();
        seedProductionEdges();
        const before = floorFingerprint();
        expect(before).toHaveLength(3);

        const cmd = new RemoveFloorCommand({ floorId: FLOOR_ID });
        cmd.execute(ctx);
        expect(floorFingerprint()).toHaveLength(0);
        cmd.undo(ctx);

        expect(floorFingerprint()).toEqual(before);
        // A reconstruction from FloorData would rebuild sitsOn (levelId) and the
        // room edge (coveredRoomIds) — and DROP this one, while still passing an
        // edge count of 2-of-3 that a count-based test would miss.
        expect(floorFingerprint()).toContain(JSON.stringify(identity({
            type: 'sitsOn', sourceId: FURNITURE_ID, targetId: FLOOR_ID,
            createdBy: 'CreateFurnitureCommand', metadata: { fflOffset: 0.015, seated: true },
        })));
    });

    it('the purge is SCOPED: an unrelated sitsOn to the same level survives', () => {
        const { ctx } = makeCtx();
        seedProductionEdges();
        semanticGraphManager.addRelationship({
            type: 'sitsOn', sourceId: OTHER_ELEMENT_ID, targetId: LEVEL_ID,
            createdBy: 'CreateSlabCommand', metadata: {},
        });

        new RemoveFloorCommand({ floorId: FLOOR_ID }).execute(ctx);

        expect(edgesTouching(OTHER_ELEMENT_ID).some(
            r => r.type === 'sitsOn' && r.targetId === LEVEL_ID)).toBe(true);
        // …and the furniture element itself is NOT purged — only its edge TO the
        // floor died. The furniture is still a live element on the level.
        expect(edgesTouching(FURNITURE_ID).every(r => r.targetId !== FLOOR_ID)).toBe(true);
    });

    it('redo purges again; a second undo restores exactly 3 edges, not 6 (idempotency)', () => {
        const { ctx } = makeCtx();
        seedProductionEdges();
        const before = floorFingerprint();

        const cmd = new RemoveFloorCommand({ floorId: FLOOR_ID });
        cmd.execute(ctx);
        cmd.undo(ctx);
        cmd.execute(ctx); // redo
        expect(floorFingerprint()).toHaveLength(0);
        cmd.undo(ctx);

        expect(floorFingerprint()).toEqual(before);
    });

    it('SAVE/RELOAD after delete: the serialized graph holds no edge referencing the floor', () => {
        const { ctx } = makeCtx();
        seedProductionEdges();
        new RemoveFloorCommand({ floorId: FLOOR_ID }).execute(ctx);

        const persisted = semanticGraphManager.serialize();
        expect(persisted.relationships.some(
            (r: any) => r.sourceId === FLOOR_ID || r.targetId === FLOOR_ID)).toBe(false);

        semanticGraphManager.deserialize(persisted);
        expect(floorFingerprint()).toHaveLength(0);
    });
});

describe('§FIX-FLOOR-DELETE-LEAVES-GRAPH-EDGES — producer 2: DeleteElementCommand#floor (purged, restored nothing)', () => {
    it('purges on delete (unchanged) AND now restores verbatim on undo', () => {
        const { ctx } = makeCtx();
        seedProductionEdges();
        const before = floorFingerprint();
        expect(before).toHaveLength(3);

        const cmd = new DeleteElementCommand(FLOOR_ID);
        expect(cmd.canExecute(ctx).ok).toBe(true);
        cmd.execute(ctx);
        expect(floorFingerprint()).toHaveLength(0);

        cmd.undo(ctx);

        // On the OLD code this was still 0 — the purge was irreversible.
        expect(floorFingerprint()).toEqual(before);
    });

    it('the two producers now AGREE: same delete state and same undo state from either path', () => {
        const a = makeCtx();
        seedProductionEdges();
        const baseline = floorFingerprint();
        const cmdA = new RemoveFloorCommand({ floorId: FLOOR_ID });
        cmdA.execute(a.ctx);
        const afterDeleteA = floorFingerprint();
        cmdA.undo(a.ctx);
        const afterUndoA = floorFingerprint();

        for (const id of ALL_IDS) semanticGraphManager.removeAllRelationshipsForElement(id);
        const b = makeCtx();
        seedProductionEdges();
        const cmdB = new DeleteElementCommand(FLOOR_ID);
        cmdB.execute(b.ctx);
        const afterDeleteB = floorFingerprint();
        cmdB.undo(b.ctx);
        const afterUndoB = floorFingerprint();

        expect(afterDeleteA).toEqual(afterDeleteB); // both empty
        expect(afterUndoA).toEqual(afterUndoB);     // both the verbatim baseline
        expect(afterUndoA).toEqual(baseline);
    });
});
