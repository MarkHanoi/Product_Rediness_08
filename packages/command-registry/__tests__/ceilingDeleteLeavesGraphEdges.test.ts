// §FIX-CEILING-DELETE-LEAVES-GRAPH-EDGES (BIM 3.0 C71 §5.6 — graph integrity on
// delete) — deleting a ceiling must purge its SemanticGraph edges, and undo must
// restore them VERBATIM. Both of the kind's two producers are covered here,
// because they had DIFFERENT defects — the divergence the gate exists to catch.
//
// THE TWO DEFECTS:
//   · RemoveCeilingCommand         — never purged at all. It unregistered the
//     ceiling from elementRegistry AND BimManager and removed it from the store,
//     while leaving every SemanticGraph edge pointing at the dead id. A
//     well-formed edge at a deleted id is not self-erasing: it survives
//     serialize()/deserialize() and persists forever.
//   · DeleteElementCommand#ceiling — purged, but undo restored NOTHING. C71 §5.6
//     rates that worse than no purge because it looks correct: delete+undo
//     silently erased the ceiling's graph presence permanently.
//
// THE VERBATIM TOOTH: these tests do not merely COUNT edges after undo — a
// reconstruction would pass a count, and the ceiling snapshot makes
// reconstruction look FEASIBLE: CeilingData carries levelId, coveredRoomIds AND
// boundingWallIds, so a re-authoring undo could plausibly rebuild sitsOn,
// covers and boundedBy from the snapshot alone. So the tests seed an edge that
// is NOT derivable from ANY ceiling field — a lighting fixture's `hostedBy`,
// authored by another element's command — and assert it returns field-for-field.

import { describe, it, expect, beforeEach } from 'vitest';
import { semanticGraphManager } from '@pryzm/core-app-model';
import { RemoveCeilingCommand } from '../src/ceilings/RemoveCeilingCommand';
import { DeleteElementCommand } from '../src/walls/DeleteElementCommand';
import type { CommandContext } from '../src/types';

const CEILING_ID = 'ceiling-1';
const LEVEL_ID = 'L1';
const ROOM_ID = 'room-under-ceiling';
const FIXTURE_ID = 'light-fixture-7';
const HOLE_ID = 'ceiling-hole-1';
const OTHER_ELEMENT_ID = 'slab-on-L1';
const ALL_IDS = [CEILING_ID, LEVEL_ID, ROOM_ID, FIXTURE_ID, HOLE_ID, OTHER_ELEMENT_ID];

function makeCeiling() {
    return {
        id: CEILING_ID,
        type: 'ceiling',
        levelId: LEVEL_ID,
        label: 'Ceiling 1',
        ceilingNumber: 'C-101',
        boundary: { polygon: [[-2, -2], [2, -2], [2, 2], [-2, 2]] },
        finishSpec: {},
        holeElements: [{ elementId: HOLE_ID, subType: 'light-fixture' }],
        holes: [{ elementId: HOLE_ID, subType: 'light-fixture' }],
        coveredRoomIds: [ROOM_ID],
        boundingWallIds: [],
        height: 2.7,
    } as any;
}

function makeCtx() {
    const ceilings = new Map<string, any>([[CEILING_ID, makeCeiling()]]);
    const ceilingStore = {
        add: (d: any) => { ceilings.set(d.id, d); },
        restoreSnapshot: (d: any) => { ceilings.set(d.id, d); },
        remove: (id: string) => { ceilings.delete(id); },
        get: (id: string) => ceilings.get(id),
        getById: (id: string) => ceilings.get(id),
        has: (id: string) => ceilings.has(id),
        getAll: () => [...ceilings.values()],
    };
    const ctx = {
        bimManager: { registerElement: () => {}, unregisterElement: () => {} },
        projectContext: { activeLevelId: LEVEL_ID },
        stores: {
            ceilingStore,
            wallStore: { getById: () => undefined, getWindow: () => undefined, getDoor: () => undefined, getByLevel: () => [] },
        },
        topologyGraph: { removeNode: () => {} },
    } as unknown as CommandContext;
    return { ctx, ceilings };
}

/**
 * The edges a real project carries on a ceiling. Two of the three are
 * SNAPSHOT-DERIVABLE (levelId, coveredRoomIds) — a reconstruction would rebuild
 * exactly those and pass a count. The third is authored by the LIGHTING
 * command's side of the model and appears nowhere in CeilingData: only a
 * verbatim capture can bring it back.
 */
function seedProductionEdges() {
    semanticGraphManager.addRelationship({
        type: 'sitsOn', sourceId: CEILING_ID, targetId: LEVEL_ID,
        createdBy: 'CreateCeilingCommand',
        metadata: { addedBy: 'CreateCeilingCommand', ceilingNumber: 'C-101' },
    });
    semanticGraphManager.addRelationship({
        type: 'contains', sourceId: ROOM_ID, targetId: CEILING_ID,
        createdBy: 'DetectAllRoomsCommand', metadata: { covers: true },
    });
    // THE EDGE A RECONSTRUCTION CANNOT SEE — the fixture hosts itself on the
    // ceiling; CeilingData has no field naming this fixture.
    semanticGraphManager.addRelationship({
        type: 'hostedBy', sourceId: FIXTURE_ID, targetId: CEILING_ID,
        createdBy: 'CreateLightingCommand', metadata: { mount: 'recessed', lumens: 1200 },
    });
}

function identity(r: any) {
    return {
        type: r.type, sourceId: r.sourceId, targetId: r.targetId,
        createdBy: r.createdBy, metadata: r.metadata ?? undefined,
    };
}

function ceilingFingerprint(): string[] {
    return semanticGraphManager.getRelationships(CEILING_ID)
        .map(r => JSON.stringify(identity(r))).sort();
}

function edgesTouching(id: string) {
    return semanticGraphManager.getRelationships(id);
}

beforeEach(() => {
    for (const id of ALL_IDS) semanticGraphManager.removeAllRelationshipsForElement(id);
});

describe('§FIX-CEILING-DELETE-LEAVES-GRAPH-EDGES — producer 1: RemoveCeilingCommand (never purged)', () => {
    it('THE TOOTH: after delete NO edge referencing the ceiling survives', () => {
        const { ctx } = makeCtx();
        seedProductionEdges();
        expect(edgesTouching(CEILING_ID)).toHaveLength(3);

        const cmd = new RemoveCeilingCommand(CEILING_ID);
        expect(cmd.canExecute(ctx).ok).toBe(true);
        expect(cmd.execute(ctx).success).toBe(true);

        // On the OLD code ALL THREE survived — the ceiling left the store, the
        // registry and BimManager, and stayed in the graph forever.
        expect(edgesTouching(CEILING_ID)).toHaveLength(0);
        expect(edgesTouching(ROOM_ID).some(r => r.targetId === CEILING_ID)).toBe(false);
        expect(edgesTouching(FIXTURE_ID).some(r => r.targetId === CEILING_ID)).toBe(false);
    });

    it('THE VERBATIM TOOTH: undo restores all three edges BYTE-IDENTICAL, including the fixture-authored one', () => {
        const { ctx } = makeCtx();
        seedProductionEdges();
        const before = ceilingFingerprint();
        expect(before).toHaveLength(3);

        const cmd = new RemoveCeilingCommand(CEILING_ID);
        cmd.execute(ctx);
        expect(ceilingFingerprint()).toHaveLength(0);
        cmd.undo(ctx);

        expect(ceilingFingerprint()).toEqual(before);
        // A reconstruction from CeilingData would rebuild sitsOn (levelId) and
        // the room edge (coveredRoomIds) — and DROP this one, while still
        // passing an edge count of 2-of-3 that a count-based test would miss.
        expect(ceilingFingerprint()).toContain(JSON.stringify(identity({
            type: 'hostedBy', sourceId: FIXTURE_ID, targetId: CEILING_ID,
            createdBy: 'CreateLightingCommand', metadata: { mount: 'recessed', lumens: 1200 },
        })));
    });

    it('the HOLE elements are purged too — execute() unregisters them, so their edges must die with them', () => {
        const { ctx } = makeCtx();
        seedProductionEdges();
        semanticGraphManager.addRelationship({
            type: 'hostedBy', sourceId: HOLE_ID, targetId: CEILING_ID,
            createdBy: 'CreateCeilingHoleCommand', metadata: { subType: 'light-fixture' },
        });
        const holeBefore = edgesTouching(HOLE_ID).map(r => JSON.stringify(identity(r))).sort();
        expect(holeBefore).toHaveLength(1);

        const cmd = new RemoveCeilingCommand(CEILING_ID);
        cmd.execute(ctx);
        expect(edgesTouching(HOLE_ID)).toHaveLength(0);

        cmd.undo(ctx);
        expect(edgesTouching(HOLE_ID).map(r => JSON.stringify(identity(r))).sort()).toEqual(holeBefore);
    });

    it('the purge is SCOPED: an unrelated sitsOn to the same level survives', () => {
        const { ctx } = makeCtx();
        seedProductionEdges();
        semanticGraphManager.addRelationship({
            type: 'sitsOn', sourceId: OTHER_ELEMENT_ID, targetId: LEVEL_ID,
            createdBy: 'CreateSlabCommand', metadata: {},
        });

        new RemoveCeilingCommand(CEILING_ID).execute(ctx);

        expect(edgesTouching(OTHER_ELEMENT_ID).some(
            r => r.type === 'sitsOn' && r.targetId === LEVEL_ID)).toBe(true);
    });

    it('redo purges again; a second undo restores exactly 3 edges, not 6 (idempotency)', () => {
        const { ctx } = makeCtx();
        seedProductionEdges();
        const before = ceilingFingerprint();

        const cmd = new RemoveCeilingCommand(CEILING_ID);
        cmd.execute(ctx);
        cmd.undo(ctx);
        cmd.execute(ctx); // redo
        expect(ceilingFingerprint()).toHaveLength(0);
        cmd.undo(ctx);

        expect(ceilingFingerprint()).toEqual(before);
    });

    it('SAVE/RELOAD after delete: the serialized graph holds no edge referencing the ceiling', () => {
        const { ctx } = makeCtx();
        seedProductionEdges();
        new RemoveCeilingCommand(CEILING_ID).execute(ctx);

        const persisted = semanticGraphManager.serialize();
        expect(persisted.relationships.some(
            (r: any) => r.sourceId === CEILING_ID || r.targetId === CEILING_ID)).toBe(false);

        semanticGraphManager.deserialize(persisted);
        expect(ceilingFingerprint()).toHaveLength(0);
    });
});

describe('§FIX-CEILING-DELETE-LEAVES-GRAPH-EDGES — producer 2: DeleteElementCommand#ceiling (purged, restored nothing)', () => {
    it('purges on delete (unchanged) AND now restores verbatim on undo', () => {
        const { ctx } = makeCtx();
        seedProductionEdges();
        const before = ceilingFingerprint();
        expect(before).toHaveLength(3);

        const cmd = new DeleteElementCommand(CEILING_ID);
        expect(cmd.canExecute(ctx).ok).toBe(true);
        cmd.execute(ctx);
        expect(ceilingFingerprint()).toHaveLength(0);

        cmd.undo(ctx);

        // On the OLD code this was still 0 — the purge was irreversible.
        expect(ceilingFingerprint()).toEqual(before);
    });

    it('the two producers now AGREE: same delete state and same undo state from either path', () => {
        const a = makeCtx();
        seedProductionEdges();
        const baseline = ceilingFingerprint();
        const cmdA = new RemoveCeilingCommand(CEILING_ID);
        cmdA.execute(a.ctx);
        const afterDeleteA = ceilingFingerprint();
        cmdA.undo(a.ctx);
        const afterUndoA = ceilingFingerprint();

        for (const id of ALL_IDS) semanticGraphManager.removeAllRelationshipsForElement(id);
        const b = makeCtx();
        seedProductionEdges();
        const cmdB = new DeleteElementCommand(CEILING_ID);
        cmdB.execute(b.ctx);
        const afterDeleteB = ceilingFingerprint();
        cmdB.undo(b.ctx);
        const afterUndoB = ceilingFingerprint();

        expect(afterDeleteA).toEqual(afterDeleteB); // both empty
        expect(afterUndoA).toEqual(afterUndoB);     // both the verbatim baseline
        expect(afterUndoA).toEqual(baseline);
    });
});
