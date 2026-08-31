/**
 * §G3-STALE-FIX (lane L3b, 2026-08-31) — CreateStairCommand registers the stair
 * with the ViewDependencyTracker, and its undo unregisters it.
 *
 * THE MEASURED DEFECT (L2b table, `no-registration-families-measurement.md` row
 * "stair"): the E.5.4 bridge → legacy CreateStairCommand path did
 * `bimManager.registerElement` (:340) but NEVER `viewDependencyTracker
 * .registerElement`, so `StairStore.ts:183`'s `'stair'` create emit fell into
 * the §G3-STALE fallback — console.warn + EVERY non-3D view marked dirty,
 * coarse (`ViewDependencyTracker.ts:893/906-930`) — instead of a targeted
 * invalidation of the base level's views.
 *
 * Precedent copied, not invented: `CW90VdtRegistration.test.ts` (the identical
 * wire on `CreateCurtainWallCommand`), harness from `stairDeleteHealsHole.test.ts`
 * (a proven-to-execute CreateStairCommand context of store doubles).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { viewDependencyTracker } from '@pryzm/core-app-model';
import { CreateStairCommand, type CreateStairInput } from '../src/stair/CreateStairCommand';
import type { CommandContext } from '../src/types';

const HOST_SLAB_ID = 'slab-L1';

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
    return { ctx, stairStore };
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

beforeEach(() => {
    vi.restoreAllMocks();
});

describe('§G3-STALE-FIX L3b — CreateStairCommand ↔ ViewDependencyTracker', () => {
    it('⭐ execute() registers (stairId, baseLevelId) BEFORE stairStore.add emits the create event', () => {
        const calls: string[] = [];
        const reg = vi
            .spyOn(viewDependencyTracker, 'registerElement')
            .mockImplementation(() => { calls.push('vdt'); });

        const { ctx, stairStore } = makeCtx();
        const add = stairStore.add.bind(stairStore);
        vi.spyOn(stairStore, 'add').mockImplementation((rec: any) => {
            calls.push('add');
            return add(rec);
        });

        const res = new CreateStairCommand(makeStairInput('stair-vdt-1')).execute(ctx);

        expect(res.success).toBe(true);
        expect(reg).toHaveBeenCalledWith('stair-vdt-1', 'L0');
        // Ordering is the point: register first, THEN the add whose 'stair' event
        // the VDT must resolve to a level (else §G3-STALE coarse fallback).
        expect(calls.indexOf('vdt')).toBeLessThan(calls.indexOf('add'));
    });

    it('undo() unregisters the stair id (symmetric — no phantom level association after Ctrl+Z)', () => {
        vi.spyOn(viewDependencyTracker, 'registerElement').mockImplementation(() => {});
        const unreg = vi
            .spyOn(viewDependencyTracker, 'unregisterElement')
            .mockImplementation(() => {});

        const { ctx, stairStore } = makeCtx();
        const cmd = new CreateStairCommand(makeStairInput('stair-vdt-2'));
        expect(cmd.execute(ctx).success).toBe(true);
        expect(stairStore.getById('stair-vdt-2')).toBeDefined();

        const res = cmd.undo(ctx);

        expect(res.success).toBe(true);
        expect(stairStore.getById('stair-vdt-2')).toBeUndefined();
        expect(unreg).toHaveBeenCalledWith('stair-vdt-2');
    });
});
