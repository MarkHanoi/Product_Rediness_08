// §G-NEW-05 undo round-trip pin for StairSlabOpeningReconciler.
//
// PURPOSE: assert BYTE-EQUAL restoration of the opening record across
// reconcileStairOpening → undoStairOpeningReconcile, directly against the
// reconciler (the owning-command paths are already pinned by
// stairOpeningFollowsStair.test.ts). Written and watched GREEN against the
// ORIGINAL structuredClone before/after-snapshot undo BEFORE the reconciler was
// migrated to produceWithPatches (Immer), so it measures restoration, not
// implementation.

import { describe, it, expect } from 'vitest';
import {
    carveStairOpening,
    reconcileStairOpening,
    undoStairOpeningReconcile,
    type StairFootprintSource,
} from '../src/stair/StairSlabOpeningReconciler';
import { stairAutoOpeningId } from '../src/stair/stairOpeningId';
import type { CommandContext } from '../src/types';

const SLAB_ID = 'slab-L1';

/** Opening store WITHOUT update — forces the remove+add fallback branch. */
function makeMinimalOpeningStore() {
    const map = new Map<string, any>();
    return {
        add: (o: any) => { map.set(o.id, structuredClone(o)); },
        remove: (id: string) => { map.delete(id); },
        getById: (id: string) => {
            const o = map.get(id);
            return o ? structuredClone(o) : undefined;
        },
        getAll: () => Array.from(map.values()).map(o => structuredClone(o)),
        raw: (id: string) => map.get(id),
        size: () => map.size,
    };
}

/** Opening store WITH merge-update — the production-shaped branch. */
function makeUpdatingOpeningStore() {
    const base = makeMinimalOpeningStore();
    return {
        ...base,
        update: (id: string, updates: any) => {
            const cur = (base as any).raw(id);
            if (!cur) return undefined;
            const merged = { ...cur, ...updates };
            base.remove(id);
            base.add(merged);
            return merged;
        },
    };
}

function makeSlabStore() {
    const rebuilds: string[] = [];
    const slabs = new Map<string, any>();
    slabs.set(SLAB_ID, { id: SLAB_ID, levelId: 'L1', position: { x: 0, y: 0, z: 0 }, holes: [] });
    return {
        getAll: () => Array.from(slabs.values()),
        getById: (id: string) => slabs.get(id),
        triggerRebuild: (id: string) => { rebuilds.push(id); },
        rebuilds,
    };
}

function makeCtx(openingStore: any) {
    const slabStore = makeSlabStore();
    const ctx = {
        stores: { openingStore, slabStore },
        bimManager: { registerElement: () => {}, unregisterElement: () => {} },
    } as unknown as CommandContext;
    return { ctx, slabStore };
}

function stair(id: string, x: number, z: number): StairFootprintSource {
    return {
        id,
        shape: 'I',
        width: 1.0,
        treadDepth: 0.28,
        startPosition: { x, y: 0, z },
        flights: [{ direction: { x: 1, y: 0, z: 0 }, riserCount: 20 }],
        landings: [],
        topLevelId: 'L1',
    };
}

const bytes = (v: unknown) => JSON.stringify(v);

describe('StairSlabOpeningReconciler — reconcile undo restores the opening byte-equal', () => {
    it('(a) update path, minimal store (remove+add fallback): moved stair → undo restores the FULL opening record byte-equal', () => {
        const openingStore = makeMinimalOpeningStore();
        const { ctx } = makeCtx(openingStore);
        const st = stair('st-a', 0, 0);
        expect(carveStairOpening(ctx, st)).not.toBeNull();
        const openingId = stairAutoOpeningId('st-a');
        const before = bytes(openingStore.raw(openingId));

        const rec = reconcileStairOpening(ctx, stair('st-a', 2, 1));
        expect(rec).not.toBeNull();
        expect(bytes(openingStore.raw(openingId))).not.toBe(before);
        expect(openingStore.size()).toBe(1); // same id, never a second void

        undoStairOpeningReconcile(ctx, rec);
        expect(openingStore.size()).toBe(1);
        expect(bytes(openingStore.raw(openingId))).toBe(before);
    });

    it('(b) update path, updating store: undo restores byte-equal through store.update', () => {
        const openingStore = makeUpdatingOpeningStore();
        const { ctx } = makeCtx(openingStore);
        const st = stair('st-b', 1, 1);
        expect(carveStairOpening(ctx, st)).not.toBeNull();
        const openingId = stairAutoOpeningId('st-b');
        const before = bytes((openingStore as any).raw(openingId));

        const rec = reconcileStairOpening(ctx, stair('st-b', -3, 4));
        expect(rec).not.toBeNull();
        expect(bytes((openingStore as any).raw(openingId))).not.toBe(before);

        undoStairOpeningReconcile(ctx, rec);
        expect(bytes((openingStore as any).raw(openingId))).toBe(before);
    });

    it('(c) carve path: reconcile with no prior opening carves; undo removes it — back to zero openings', () => {
        const openingStore = makeMinimalOpeningStore();
        const { ctx } = makeCtx(openingStore);
        expect(openingStore.size()).toBe(0);

        const rec = reconcileStairOpening(ctx, stair('st-c', 0, 0));
        expect(rec).not.toBeNull();
        expect(openingStore.size()).toBe(1);

        undoStairOpeningReconcile(ctx, rec);
        expect(openingStore.size()).toBe(0);
    });

    it('(d) unchanged footprint: reconcile returns null, the opening is untouched, and undo(null) is a no-op', () => {
        const openingStore = makeMinimalOpeningStore();
        const { ctx, slabStore } = makeCtx(openingStore);
        const st = stair('st-d', 0, 0);
        expect(carveStairOpening(ctx, st)).not.toBeNull();
        const openingId = stairAutoOpeningId('st-d');
        const before = bytes(openingStore.raw(openingId));
        slabStore.rebuilds.length = 0;

        const rec = reconcileStairOpening(ctx, stair('st-d', 0, 0));
        expect(rec).toBeNull();
        expect(bytes(openingStore.raw(openingId))).toBe(before);
        expect(slabStore.rebuilds).toEqual([]);

        undoStairOpeningReconcile(ctx, rec);
        expect(bytes(openingStore.raw(openingId))).toBe(before);
    });

    it('(e) both host slabs rebuild on undo of an update (renderer sees the healed void)', () => {
        const openingStore = makeMinimalOpeningStore();
        const { ctx, slabStore } = makeCtx(openingStore);
        expect(carveStairOpening(ctx, stair('st-e', 0, 0))).not.toBeNull();

        const rec = reconcileStairOpening(ctx, stair('st-e', 3, 3));
        expect(rec).not.toBeNull();

        slabStore.rebuilds.length = 0;
        undoStairOpeningReconcile(ctx, rec);
        expect(slabStore.rebuilds).toContain(SLAB_ID);
    });
});
