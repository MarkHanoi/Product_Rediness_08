// §FIX-STAIR-DELETE-LEAVES-HOLE (L-298) — guard D-1, made real.
//
// THE BUG: CreateStairCommand punches an auto-opening on the slab above the stair so
// the stair has headroom. Its undo() removes that opening. But a STRAIGHT (non-undo)
// delete was NOT removing it — the void stayed in the floor forever, unmarked and
// unclosable. The invariant is SYMMETRY: whatever the create adds, the delete must
// remove; whatever undo restores, delete must undo.
//
// WHERE THE ASSERTION HAS TEETH: the stair's *rendered* hole is an OpeningData in the
// openingStore, hosted on the slab. SlabFragmentBuilder.createSlabMeshWithEdges reads
// EXACTLY `openingStore.getByHostId(slab.id)` (source 2, `openingHoles`) and
// triangulates those into the real void. So every assertion below queries
// `openingStore.getByHostId(hostSlabId).length` — the same collection the renderer
// iterates. A vacuous `res.success === true` would pass even if the hole survived;
// asserting the getByHostId count returns to its pre-stair value FAILS unless the
// rendered hole is genuinely gone. THAT is the discriminator.

import { describe, it, expect, beforeEach } from 'vitest';
import { CreateStairCommand, type CreateStairInput } from '../src/stair/CreateStairCommand';
import { DeleteStairCommand } from '../src/stair/DeleteStairCommand';
import { DeleteElementCommand } from '../src/walls/DeleteElementCommand';
import { stairAutoOpeningId } from '../src/stair/stairOpeningId';
import type { CommandContext } from '../src/types';

const HOST_SLAB_ID = 'slab-L1';

/** Faithful openingStore double — mirrors OpeningStore's structuredClone semantics
 *  and, crucially, its `getByHostId` (the renderer's hole query). */
function makeOpeningStore() {
    const map = new Map<string, any>();
    return {
        add: (o: any) => { map.set(o.id, structuredClone(o)); },
        remove: (id: string) => { map.delete(id); },
        getById: (id: string) => { const o = map.get(id); return o ? structuredClone(o) : undefined; },
        getByHostId: (hostId: string) =>
            Array.from(map.values()).filter(o => o.hostId === hostId).map(o => structuredClone(o)),
        getAll: () => Array.from(map.values()).map(o => structuredClone(o)),
    };
}

/** slabStore double — one slab on the top level (L1) + a rebuild recorder. */
function makeSlabStore() {
    const rebuilds: string[] = [];
    const slabs = new Map<string, any>([
        [HOST_SLAB_ID, { id: HOST_SLAB_ID, levelId: 'L1', position: { x: 0, y: 0, z: 0 }, holes: [] }],
    ]);
    return {
        getAll: () => Array.from(slabs.values()),
        getById: (id: string) => slabs.get(id),
        triggerRebuild: (id: string) => { rebuilds.push(id); },
        rebuilds,
    };
}

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

function makeCtx() {
    const openingStore = makeOpeningStore();
    const slabStore = makeSlabStore();
    const stairStore = makeStairStore();
    const wallStore = {
        getById: () => undefined,
        getWindow: () => undefined,
        getDoor: () => undefined,
        getLevels: () => [
            { id: 'L0', elevation: 0, name: 'Ground' },
            { id: 'L1', elevation: 3.0, name: 'Level 1' },
        ],
    };
    const bimManager = {
        registerElement: () => {},
        unregisterElement: () => {},
        getLevelById: (id: string) => ({ id, elevation: id === 'L1' ? 3.0 : 0 }),
    };
    const ctx = {
        stores: { stairStore, slabStore, openingStore, wallStore },
        bimManager,
        projectContext: { activeLevelId: 'L0' },
    } as unknown as CommandContext;
    return { ctx, openingStore, slabStore, stairStore };
}

function makeStairInput(id: string): CreateStairInput {
    return {
        id,
        baseLevelId: 'L0',
        topLevelId: 'L1',
        shape: 'I',
        riserHeight: 0.15,
        treadDepth: 0.28,
        width: 1.0,
        startPosition: { x: 0, y: 0, z: 0 },
        flights: [{ direction: { x: 1, y: 0, z: 0 }, riserCount: 20 }],
        landings: [],
    };
}

describe('§FIX-STAIR-DELETE-LEAVES-HOLE (L-298) — delete heals the slab', () => {
    let n = 0;
    let stairId: string;
    beforeEach(() => { stairId = `st-heal-${++n}`; });

    it('D-1: create punches exactly one hole in the RENDERED field; delete removes it', () => {
        const { ctx, openingStore, slabStore } = makeCtx();

        // Pre-stair baseline: the renderer sees no hole on this slab.
        expect(openingStore.getByHostId(HOST_SLAB_ID).length).toBe(0);

        const create = new CreateStairCommand(makeStairInput(stairId));
        expect(create.execute(ctx).success).toBe(true);

        // Create punched exactly one hole — in the field SlabFragmentBuilder triangulates.
        expect(openingStore.getByHostId(HOST_SLAB_ID).length).toBe(1);
        expect(openingStore.getById(stairAutoOpeningId(stairId))).toBeDefined();

        const del = new DeleteStairCommand({ stairId });
        expect(del.execute(ctx).success).toBe(true);

        // TEETH: the hole is GONE from the exact collection the renderer reads —
        // count returns to the pre-stair value. (res.success alone would be vacuous.)
        expect(openingStore.getByHostId(HOST_SLAB_ID).length).toBe(0);
        expect(openingStore.getById(stairAutoOpeningId(stairId))).toBeUndefined();
        // …and the host slab was told to rebuild so the void actually closes on screen.
        expect(slabStore.rebuilds).toContain(HOST_SLAB_ID);
    });

    it('ONE undo restores BOTH the stair AND its hole (pre-delete state exactly)', () => {
        const { ctx, openingStore, stairStore } = makeCtx();

        new CreateStairCommand(makeStairInput(stairId)).execute(ctx);
        const del = new DeleteStairCommand({ stairId });
        del.execute(ctx);
        expect(stairStore.getById(stairId)).toBeUndefined();
        expect(openingStore.getByHostId(HOST_SLAB_ID).length).toBe(0);

        // A single Ctrl-Z after delete = one undo entry = both come back.
        expect(del.undo(ctx).success).toBe(true);
        expect(stairStore.getById(stairId)).toBeDefined();
        expect(openingStore.getByHostId(HOST_SLAB_ID).length).toBe(1);
        expect(openingStore.getById(stairAutoOpeningId(stairId))).toBeDefined();
    });

    it('deleting ONE stair leaves a SIBLING hole on the same slab untouched', () => {
        const { ctx, openingStore } = makeCtx();

        // A pre-existing, unrelated hole on the SAME slab (e.g. a pool or a 2nd stair).
        openingStore.add({
            id: 'opening-pool-xyz', type: 'opening', hostId: HOST_SLAB_ID,
            levelId: 'L1', parentId: HOST_SLAB_ID, profile: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }],
            baseOffset: 0, properties: {},
        });

        new CreateStairCommand(makeStairInput(stairId)).execute(ctx);
        expect(openingStore.getByHostId(HOST_SLAB_ID).length).toBe(2);

        new DeleteStairCommand({ stairId }).execute(ctx);

        // The stair's hole is gone; the sibling SURVIVES (guards against whole-collection clear).
        const remaining = openingStore.getByHostId(HOST_SLAB_ID);
        expect(remaining.length).toBe(1);
        expect(remaining[0].id).toBe('opening-pool-xyz');
    });

    it('the REAL UI path (DeleteElementCommand) also heals the hole and one undo reopens it', () => {
        const { ctx, openingStore, stairStore } = makeCtx();

        new CreateStairCommand(makeStairInput(stairId)).execute(ctx);
        expect(openingStore.getByHostId(HOST_SLAB_ID).length).toBe(1);

        // deleteSelected() dispatches DeleteElementCommand — the branch users actually hit.
        const del = new DeleteElementCommand(stairId);
        expect(del.canExecute(ctx).ok).toBe(true);
        expect(del.execute(ctx).success).toBe(true);
        expect(stairStore.getById(stairId)).toBeUndefined();
        expect(openingStore.getByHostId(HOST_SLAB_ID).length).toBe(0);

        del.undo(ctx);
        expect(stairStore.getById(stairId)).toBeDefined();
        expect(openingStore.getByHostId(HOST_SLAB_ID).length).toBe(1);
    });
});
