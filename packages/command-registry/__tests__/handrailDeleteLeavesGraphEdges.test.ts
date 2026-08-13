// §FIX-HANDRAIL-DELETE-LEAVES-GRAPH-EDGES (BIM 3.0 C71 §5.6 — graph integrity
// on delete) — deleting a handrail must purge its SemanticGraph edges, and undo
// must restore them VERBATIM. Both of the kind's two producers are covered here,
// because they had DIFFERENT defects.
//
// THE TWO DEFECTS:
//   · DeleteHandrailCommand          — never purged at all. CreateHandrailCommand:111
//     writes a real `sitsOn` (handrail → level), so this path stranded a real
//     edge on every delete. A well-formed edge pointing at a deleted id is not
//     self-erasing: it survives serialize()/deserialize() and persists forever.
//   · DeleteElementCommand#handrail  — purged, but undo restored NOTHING. C71
//     §5.6 rates that WORSE than no purge, because it looks correct: delete+undo
//     silently erased the handrail's graph presence permanently.
// Two producers, two behaviours — exactly the divergence the gate exists to catch.
//
// THE VERBATIM TOOTH: these tests do not merely COUNT edges after undo — a
// reconstruction would pass a count, and `sitsOn` LOOKS reconstructible because
// the handrail snapshot carries levelId. So the tests seed an edge that is NOT
// derivable from the handrail's own fields (a stair's `contains` edge, authored
// by another element's command) and assert it comes back field-for-field. A
// reconstruction from the snapshot would restore sitsOn and silently drop it.

import { describe, it, expect, beforeEach } from 'vitest';
import { semanticGraphManager } from '@pryzm/core-app-model';
import { DeleteHandrailCommand } from '../src/handrails/DeleteHandrailCommand';
import { DeleteElementCommand } from '../src/walls/DeleteElementCommand';
import type { CommandContext } from '../src/types';

const RAIL_ID = 'handrail-1';
const LEVEL_ID = 'L0';
const STAIR_ID = 'stair-1';
const OTHER_ELEMENT_ID = 'wall-on-L0';
const ALL_IDS = [RAIL_ID, LEVEL_ID, STAIR_ID, OTHER_ELEMENT_ID];

function makeHandrail() {
    return {
        id: RAIL_ID, type: 'handrail', levelId: LEVEL_ID,
        path: [{ x: 0, y: 0, z: 0 }, { x: 3, y: 0, z: 0 }],
        height: 1.0, fillType: 'baluster', profileType: 'round',
    };
}

function makeCtx() {
    const map = new Map<string, any>([[RAIL_ID, makeHandrail()]]);
    const handrailStore = {
        getById: (id: string) => map.get(id),
        add: (h: any) => { map.set(h.id, h); },
        remove: (id: string) => { map.delete(id); },
        getAll: () => [...map.values()],
    };
    const ctx = {
        stores: {
            handrailStore,
            wallStore: { getById: () => undefined, getWindow: () => undefined, getDoor: () => undefined },
        },
        bimManager: { registerElement: () => {}, unregisterElement: () => {} },
    } as unknown as CommandContext;
    return { ctx, handrailStore, map };
}

/** The edge CreateHandrailCommand:111 writes, plus one authored by ANOTHER
 *  element's command — the edge a reconstruction cannot know about. */
function seedProductionEdges() {
    semanticGraphManager.addRelationship({
        type: 'sitsOn', sourceId: RAIL_ID, targetId: LEVEL_ID,
        createdBy: 'CreateHandrailCommand',
        metadata: { addedBy: 'CreateHandrailCommand', fillType: 'baluster' },
    });
    // Authored by the STAIR's command against the handrail: invisible in the
    // handrail's own snapshot, so only a verbatim capture can restore it.
    semanticGraphManager.addRelationship({
        type: 'contains', sourceId: STAIR_ID, targetId: RAIL_ID,
        createdBy: 'CreateStairCommand', metadata: { role: 'railing', side: 'left' },
    });
}

function identity(r: any) {
    return {
        type: r.type, sourceId: r.sourceId, targetId: r.targetId,
        createdBy: r.createdBy, metadata: r.metadata ?? undefined,
    };
}

function railFingerprint(): string[] {
    return semanticGraphManager.getRelationships(RAIL_ID)
        .map(r => JSON.stringify(identity(r))).sort();
}

function edgesTouching(id: string) {
    return semanticGraphManager.getRelationships(id);
}

beforeEach(() => {
    for (const id of ALL_IDS) semanticGraphManager.removeAllRelationshipsForElement(id);
});

describe('§FIX-HANDRAIL-DELETE-LEAVES-GRAPH-EDGES — producer 1: DeleteHandrailCommand (never purged)', () => {
    it('THE TOOTH: after delete NO edge referencing the handrail survives', () => {
        const { ctx } = makeCtx();
        seedProductionEdges();
        expect(edgesTouching(RAIL_ID)).toHaveLength(2);

        const cmd = new DeleteHandrailCommand(RAIL_ID);
        expect(cmd.canExecute(ctx).ok).toBe(true);
        expect(cmd.execute(ctx).success).toBe(true);

        // On the OLD code BOTH edges survived — this path never purged.
        expect(edgesTouching(RAIL_ID)).toHaveLength(0);
        expect(edgesTouching(STAIR_ID).some(r => r.targetId === RAIL_ID)).toBe(false);
    });

    it('THE VERBATIM TOOTH: undo restores both edges BYTE-IDENTICAL, including the stair-authored one', () => {
        const { ctx } = makeCtx();
        seedProductionEdges();
        const before = railFingerprint();
        expect(before).toHaveLength(2);

        const cmd = new DeleteHandrailCommand(RAIL_ID);
        cmd.execute(ctx);
        expect(railFingerprint()).toHaveLength(0);
        cmd.undo(ctx);

        expect(railFingerprint()).toEqual(before);
        // Spelled out: a reconstruction from the handrail snapshot would restore
        // sitsOn (levelId is in the snapshot) and DROP this one.
        expect(railFingerprint()).toContain(JSON.stringify(identity({
            type: 'contains', sourceId: STAIR_ID, targetId: RAIL_ID,
            createdBy: 'CreateStairCommand', metadata: { role: 'railing', side: 'left' },
        })));
    });

    it('the purge is SCOPED: an unrelated sitsOn to the same level survives', () => {
        const { ctx } = makeCtx();
        seedProductionEdges();
        semanticGraphManager.addRelationship({
            type: 'sitsOn', sourceId: OTHER_ELEMENT_ID, targetId: LEVEL_ID,
            createdBy: 'CreateWallCommand', metadata: {},
        });

        new DeleteHandrailCommand(RAIL_ID).execute(ctx);

        expect(edgesTouching(OTHER_ELEMENT_ID).some(
            r => r.type === 'sitsOn' && r.targetId === LEVEL_ID)).toBe(true);
    });

    it('redo purges again; a second undo restores exactly 2 edges, not 4 (idempotency)', () => {
        const { ctx } = makeCtx();
        seedProductionEdges();
        const before = railFingerprint();

        const cmd = new DeleteHandrailCommand(RAIL_ID);
        cmd.execute(ctx);
        cmd.undo(ctx);
        cmd.execute(ctx); // redo
        expect(railFingerprint()).toHaveLength(0);
        cmd.undo(ctx);

        expect(railFingerprint()).toEqual(before);
    });

    it('SAVE/RELOAD after delete: the serialized graph holds no edge referencing the handrail', () => {
        const { ctx } = makeCtx();
        seedProductionEdges();
        new DeleteHandrailCommand(RAIL_ID).execute(ctx);

        const persisted = semanticGraphManager.serialize();
        expect(persisted.relationships.some(
            (r: any) => r.sourceId === RAIL_ID || r.targetId === RAIL_ID)).toBe(false);

        semanticGraphManager.deserialize(persisted);
        expect(railFingerprint()).toHaveLength(0);
    });
});

describe('§FIX-HANDRAIL-DELETE-LEAVES-GRAPH-EDGES — producer 2: DeleteElementCommand#handrail (purged, restored nothing)', () => {
    it('purges on delete (unchanged) AND now restores verbatim on undo', () => {
        const { ctx } = makeCtx();
        seedProductionEdges();
        const before = railFingerprint();
        expect(before).toHaveLength(2);

        const cmd = new DeleteElementCommand(RAIL_ID);
        expect(cmd.canExecute(ctx).ok).toBe(true);
        cmd.execute(ctx);
        expect(railFingerprint()).toHaveLength(0);

        cmd.undo(ctx);

        // On the OLD code this was still 0 — the purge was irreversible.
        expect(railFingerprint()).toEqual(before);
    });

    it('the two producers now AGREE: same delete state and same undo state from either path', () => {
        // Producer 1
        const a = makeCtx();
        seedProductionEdges();
        const baseline = railFingerprint();
        const cmdA = new DeleteHandrailCommand(RAIL_ID);
        cmdA.execute(a.ctx);
        const afterDeleteA = railFingerprint();
        cmdA.undo(a.ctx);
        const afterUndoA = railFingerprint();

        // Reset, then producer 2 from the identical starting graph.
        for (const id of ALL_IDS) semanticGraphManager.removeAllRelationshipsForElement(id);
        const b = makeCtx();
        seedProductionEdges();
        const cmdB = new DeleteElementCommand(RAIL_ID);
        cmdB.execute(b.ctx);
        const afterDeleteB = railFingerprint();
        cmdB.undo(b.ctx);
        const afterUndoB = railFingerprint();

        expect(afterDeleteA).toEqual(afterDeleteB); // both empty
        expect(afterUndoA).toEqual(afterUndoB);     // both the verbatim baseline
        expect(afterUndoA).toEqual(baseline);
    });
});
