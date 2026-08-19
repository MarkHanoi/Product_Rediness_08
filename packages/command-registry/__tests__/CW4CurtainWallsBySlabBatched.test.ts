// §CW4-CW-BY-SLAB-BATCH (L-1162) — "curtain walls from THIS slab" ran its creation
// loop OUTSIDE any batch, and every wall paid for it twice.
//
// ⭐ THE SAME DEFECT, IN THE SAME PLACE, IN A THIRD FAMILY.
// `CreateCurtainWallsOnAllSlabsCommand:566` wraps its slab loop in
// `batchCoordinator.runBatch()`. The single-slab command it CALLS — the one behind the
// By Slab button the founder presses — did not. Lane PERF2 fixed exactly this shape in
// the wall family (L-1151, `8a864ce9`, measured **400 REDETECT_ROOMS → 0**) and named
// THIS file as the next one. `PERF2WallsBySlabBatched.test.ts` is this file's template
// and its oracle is deliberately identical.
//
// ⭐ THE ORACLE IS THE FLAG THE GATE ITSELF READS, NOT A MOCK OF IT.
// `apps/editor/src/engine/perAddGeometryGate.ts:36` decides by reading
// `batchCoordinator.isBatching`. So this file uses the REAL coordinator and samples
// that REAL flag at the exact instant each curtain wall reaches the store — the same
// instant `bim-curtainwall-added` fires in production. A spy on `runBatch` would prove
// only that a function was CALLED, and would pass for a batch wrapped around a loop
// that adds nothing; sampling the flag proves the state the gate consults was true
// while the walls were landing.
//
// Both arms are asserted because the command has two callers: the By-Slab button and
// the batch catalogue (COLD — must OPEN), and `CreateCurtainWallsOnAllSlabsCommand` /
// AI envelopes (WARM — must JOIN, never nest a rival bracket).

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { CreateCurtainWallsFromSlabCommand } from '../src/curtainwall/CreateCurtainWallsFromSlabCommand';
import { batchCoordinator } from '@pryzm/core-app-model';
import type { CommandContext } from '../src/types';

/** A 6 m x 4 m rectangle -> 4 perimeter edges -> 4 curtain walls. */
const RECT = [{ x: 0, y: 0 }, { x: 6, y: 0 }, { x: 6, y: 4 }, { x: 0, y: 4 }];

/**
 * Build a context whose curtain-wall store RECORDS `batchCoordinator.isBatching` on
 * every `add()`. That array is the measurement: one sample per wall, taken at the
 * moment the per-add geometry gate would be consulted for it.
 */
function makeCtx(polygon: { x: number; y: number }[] = RECT) {
    const map = new Map<string, any>();
    const batchingAtAdd: boolean[] = [];
    const curtainWallStore = {
        add(cw: any) { batchingAtAdd.push(batchCoordinator.isBatching); map.set(cw.id, cw); },
        has(id: string) { return map.has(id); },
        remove(id: string) { map.delete(id); },
        getById(id: string) { return map.get(id); },
        getAll() { return [...map.values()]; },
        update(id: string, patch: any) { const w = map.get(id); if (w) map.set(id, { ...w, ...patch }); },
    };
    const slab = { id: 'slab-1', type: 'slab', levelId: 'L0', position: { x: 0, y: 0, z: 0 }, polygon };
    const level = { id: 'L0', elevation: 0, childrenIds: [] as string[] };
    const ctx = {
        stores: {
            curtainWallStore,
            slabStore: { getById: (id: string) => (id === 'slab-1' ? slab : undefined), getAll: () => [slab] },
        },
        bimManager: {
            getLevels: () => [level],
            getLevelById: (id: string) => (id === 'L0' ? level : undefined),
            registerElement: () => {},
            unregisterElement: () => {},
            registerMany: () => {},
        },
    } as unknown as CommandContext;
    return { ctx, curtainWallStore, batchingAtAdd, map };
}

describe('§CW4-CW-BY-SLAB-BATCH — every curtain wall lands inside a batch, so the per-add traversal defers', () => {
    beforeEach(() => {
        vi.spyOn(console, 'log').mockImplementation(() => {});
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        vi.spyOn(console, 'error').mockImplementation(() => {});
    });
    afterEach(() => {
        vi.restoreAllMocks();
        // The drain completes on a FrameScheduler 'pre-render' slot that never arrives
        // in this environment, so the flag would otherwise leak into the next test and
        // make the JOIN arm pass for the wrong reason.
        batchCoordinator.forceReset();
        delete (window as unknown as { runtime?: unknown }).runtime;
    });

    it('COLD — the By-Slab path opens a batch, and isBatching is true for EVERY wall added', () => {
        const { ctx, batchingAtAdd, map } = makeCtx();
        expect(batchCoordinator.isBatching).toBe(false); // precondition, measured not assumed

        const res = new CreateCurtainWallsFromSlabCommand({ slabId: 'slab-1' }).execute(ctx);

        // The walls exist at all — a batch around an empty loop must not pass.
        expect(map.size).toBe(4);
        expect(batchingAtAdd.length).toBe(4);
        expect(res.affectedElementIds?.length ?? 0).toBe(4);
        // THE ASSERTION THAT IS THE POINT: not one wall was added with the gate able
        // to see "no batch". Before this fix every sample here was `false`.
        expect(batchingAtAdd).toEqual([true, true, true, true]);
        expect(batchingAtAdd.filter(b => !b).length).toBe(0);
    });

    it('WARM — dispatched inside a live batch it JOINS, and does not tear the outer bracket down', () => {
        const { ctx, batchingAtAdd } = makeCtx();
        let innerRan = false;

        // The shape `CreateCurtainWallsOnAllSlabsCommand` produces: an outer batch
        // whose fn() dispatches this command per slab.
        batchCoordinator.runBatch(() => {
            innerRan = true;
            new CreateCurtainWallsFromSlabCommand({ slabId: 'slab-1' }).execute(ctx);
            // The outer batch must still be live AFTER the inner command returns — a
            // nested bracket that closed early would show up here as `false`.
            expect(batchCoordinator.isBatching).toBe(true);
        }, { levelIds: ['L0'], totalElementCount: 4 });

        expect(innerRan).toBe(true);
        expect(batchingAtAdd.length).toBe(4);
        expect(batchingAtAdd).toEqual([true, true, true, true]);
    });

    it('an 8-sided slab batches all 8 — the win scales with the gesture, it is not a 4-wall special case', () => {
        const OCT = [
            { x: 0, y: 2 }, { x: 2, y: 0 }, { x: 6, y: 0 }, { x: 8, y: 2 },
            { x: 8, y: 6 }, { x: 6, y: 8 }, { x: 2, y: 8 }, { x: 0, y: 6 },
        ];
        const { ctx, batchingAtAdd } = makeCtx(OCT);

        new CreateCurtainWallsFromSlabCommand({ slabId: 'slab-1' }).execute(ctx);

        expect(batchingAtAdd.length).toBe(8);
        expect(batchingAtAdd.every(Boolean)).toBe(true);
    });

    it('redo re-enters the batch too — the second execute must not run naked', () => {
        const { ctx, batchingAtAdd, map } = makeCtx();
        const cmd = new CreateCurtainWallsFromSlabCommand({ slabId: 'slab-1' });

        cmd.execute(ctx);
        expect(batchingAtAdd).toEqual([true, true, true, true]);

        // Undo removes them, so redo takes the real add() path again rather than the
        // `has()` idempotency skip — otherwise this arm would assert nothing.
        cmd.undo(ctx);
        expect(map.size).toBe(0);
        batchCoordinator.forceReset();

        cmd.execute(ctx);
        expect(map.size).toBe(4);
        expect(batchingAtAdd.length).toBe(8);
        expect(batchingAtAdd.every(Boolean)).toBe(true);
    });
});
