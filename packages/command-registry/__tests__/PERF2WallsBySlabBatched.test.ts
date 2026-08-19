// §PERF2-WALLS-BY-SLAB-BATCH (L-1151) — "walls from the selected slab" ran its
// creation loop OUTSIDE any batch, and every wall paid for it twice.
//
// THE COST, as lane INSTR1 measured it on the instrumented build:
//   unbatched 367 adds -> 734 ACTUAL scene traversals
//   batched   367 adds ->   0 actual, 367 deferred
// The two traversals per add are `collectNewPbrMeshes` + the tier `countMeshes`
// inside `initScene`'s per-`bim-*-added` handler, and they walk a scene that is
// still GROWING — so the total is quadratic in the element count, which is what
// a 367-element gesture turned into a 32.7 s viewport freeze.
//
// ⭐ THE ORACLE IS THE FLAG THE GATE ITSELF READS, NOT A MOCK OF IT.
// `apps/editor/src/engine/perAddGeometryGate.ts:36` decides by reading
// `batchCoordinator.isBatching`. So this file uses the REAL coordinator and
// samples that REAL flag at the exact instant each wall reaches the store —
// the same instant `bim-wall-added` fires in production. A spy on `runBatch`
// would have proved only that a function was CALLED; sampling the flag proves
// the state the gate consults was actually true while the walls were landing.
// (A batch that opens and closes around a loop that adds nothing would pass the
// first oracle and fail this one.)
//
// This pins BEHAVIOUR, not implementation: it does not care whether the command
// opens a batch or joins one, only that no wall is ever added with the flag
// false. Both arms are asserted, because the command has two callers —
// `batchCatalogue` (cold: must OPEN) and `CreateWallsOnAllSlabsCommand` /
// AI envelopes (warm: must JOIN, never nest a rival bracket).

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { CreateWallsFromSlabCommand } from '../src/walls/CreateWallsFromSlabCommand';
import { batchCoordinator } from '@pryzm/core-app-model';
import type { CommandContext } from '../src/types';

type Pt = { x: number; y: number; z: number };

interface W {
    id: string;
    levelId: string;
    baseLine: [Pt, Pt];
    height: number;
    thickness: number;
    openings: unknown[];
    childrenIds: string[];
}

/** A 6 m x 4 m rectangle -> 4 boundary segments -> 4 walls. */
const RECT = [{ x: 0, y: 0 }, { x: 6, y: 0 }, { x: 6, y: 4 }, { x: 0, y: 4 }];

/**
 * Build a context whose wall store RECORDS `batchCoordinator.isBatching` on every
 * `add()`. That array is the measurement: one sample per wall, taken at the
 * moment the per-add geometry gate would be consulted for it.
 */
function makeCtx(polygon: { x: number; y: number }[] = RECT) {
    const map = new Map<string, W>();
    /** One entry per wall added, holding the flag the gate reads at that instant. */
    const batchingAtAdd: boolean[] = [];
    const wallStore = {
        add(w: W) { batchingAtAdd.push(batchCoordinator.isBatching); map.set(w.id, w); },
        remove(id: string) { map.delete(id); },
        getById(id: string) { return map.get(id); },
        getAll() { return [...map.values()]; },
        getByLevel(levelId: string) { return [...map.values()].filter(w => w.levelId === levelId); },
        update(id: string, patch: Partial<W>) { const w = map.get(id); if (w) map.set(id, { ...w, ...patch } as W); },
    };
    const slab = { id: 'slab-1', type: 'slab', levelId: 'L0', position: { x: 0, y: 0, z: 0 }, polygon };
    const level = { id: 'L0', elevation: 0, childrenIds: [] as string[] };
    const ctx = {
        stores: {
            wallStore,
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
    return { ctx, wallStore, batchingAtAdd };
}

describe('§PERF2-WALLS-BY-SLAB-BATCH — every wall lands inside a batch, so the per-add traversal defers', () => {
    beforeEach(() => {
        vi.spyOn(console, 'log').mockImplementation(() => {});
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        vi.spyOn(console, 'error').mockImplementation(() => {});
    });
    afterEach(() => {
        vi.restoreAllMocks();
        // The drain completes on a FrameScheduler 'pre-render' slot that never
        // arrives in this environment, so the flag would otherwise leak into the
        // next test and make the JOIN arm pass for the wrong reason.
        batchCoordinator.forceReset();
        delete (window as unknown as { runtime?: unknown }).runtime;
    });

    it('COLD — the command opens a batch, and isBatching is true for EVERY wall added', () => {
        const { ctx, batchingAtAdd } = makeCtx();
        expect(batchCoordinator.isBatching).toBe(false); // precondition, measured not assumed

        const res = new CreateWallsFromSlabCommand({ slabId: 'slab-1' }).execute(ctx);

        expect(res.success).toBe(true);
        // The walls exist at all — a batch around an empty loop must not pass.
        expect(batchingAtAdd.length).toBe(4);
        expect(res.affectedElementIds.length).toBe(4);
        // THE ASSERTION THAT IS THE POINT: not one wall was added with the gate
        // able to see "no batch". Before this fix every sample here was `false`.
        expect(batchingAtAdd).toEqual([true, true, true, true]);
        expect(batchingAtAdd.filter(b => !b).length).toBe(0);
    });

    it('WARM — dispatched inside a live batch it JOINS: still batched for every wall, and it does not tear the outer bracket down', () => {
        const { ctx, batchingAtAdd } = makeCtx();
        let innerRan = false;

        // The shape `CreateWallsOnAllSlabsCommand` produces: an outer batch whose
        // fn() dispatches this command per slab.
        batchCoordinator.runBatch(() => {
            innerRan = true;
            const r = new CreateWallsFromSlabCommand({ slabId: 'slab-1' }).execute(ctx);
            expect(r.success).toBe(true);
            // The outer batch must still be live AFTER the inner command returns —
            // a nested bracket that closed early would show up here as `false`.
            expect(batchCoordinator.isBatching).toBe(true);
        }, { levelIds: ['L0'], totalElementCount: 4 });

        expect(innerRan).toBe(true);
        expect(batchingAtAdd.length).toBe(4);
        expect(batchingAtAdd).toEqual([true, true, true, true]);
    });

    it('the per-wall console.log is gone — one line for the gesture, not one per element', () => {
        const logs: string[] = [];
        (console.log as unknown as { mockImplementation: (f: (...a: unknown[]) => void) => void })
            .mockImplementation((...a: unknown[]) => { logs.push(a.map(String).join(' ')); });

        const { ctx } = makeCtx();
        new CreateWallsFromSlabCommand({ slabId: 'slab-1' }).execute(ctx);

        // The old code emitted `Executing CreateWallCommand for level …` once per
        // wall — 4 here, 367 in the founder's gesture — each carrying the SAME
        // levelId and elevation. Console writes inside a per-element loop are real
        // main-thread cost, so the line is now a single post-loop summary.
        const perWall = logs.filter(l => l.includes('Executing CreateWallCommand'));
        expect(perWall.length).toBe(0);
        const summary = logs.filter(l => l.includes('[CreateWallsFromSlab] created'));
        expect(summary.length).toBe(1);
        expect(summary[0]).toContain('created 4 of 4 wall(s)');
    });
});
