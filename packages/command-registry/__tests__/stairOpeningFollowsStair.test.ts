// §FIX-STAIR-MOVE-STRANDS-VOID (review C-02) — the void must FOLLOW the stair.
//
// THE BUG: `carveStairOpening` was called ONLY from CreateStairCommand and is
// idempotent by `opening-stair-<id>` — so MoveStairCommand and
// UpdateStairParametersCommand left the auto-carved slab void at the OLD
// footprint forever. A moved stair rendered under a solid slab while its
// abandoned hole floated where the stair used to be.
//
// THE FIX: `reconcileStairOpening` updates-or-recarves the opening KEYED BY THE
// SAME id (never a second void — the pre-W1-1 double-carve bug), and both
// commands revert the reconcile inside their OWN undo(), so move + void are one
// undo unit.
//
// WHERE THE ASSERTIONS HAVE TEETH: same discriminator as the L-298 suite — every
// assertion queries `openingStore.getByHostId(slabId)`, the exact collection
// SlabFragmentBuilder triangulates into the rendered void, and profiles are
// compared numerically against `computeStairFootprintRect`, not merely counted.

import { describe, it, expect } from 'vitest';
import { CreateStairCommand, type CreateStairInput } from '../src/stair/CreateStairCommand';
import { MoveStairCommand } from '../src/stair/MoveStairCommand';
import { UpdateStairParametersCommand } from '../src/stair/UpdateStairParametersCommand';
import { DeleteStairCommand } from '../src/stair/DeleteStairCommand';
import { stairAutoOpeningId } from '../src/stair/stairOpeningId';
import { computeStairFootprintRect, worldXZToSlabLocal } from '@pryzm/geometry-stair';
import type { CommandContext } from '../src/types';

const SLAB_ID = 'slab-L1';

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

function makeSlabStore(preSeed: boolean) {
    const rebuilds: string[] = [];
    const slabs = new Map<string, any>();
    if (preSeed) {
        slabs.set(SLAB_ID, { id: SLAB_ID, levelId: 'L1', position: { x: 0, y: 0, z: 0 }, holes: [] });
    }
    return {
        add: (s: any) => { slabs.set(s.id, s); },
        getAll: () => Array.from(slabs.values()),
        getById: (id: string) => slabs.get(id),
        remove: (id: string) => { slabs.delete(id); },
        triggerRebuild: (id: string) => { rebuilds.push(id); },
        rebuilds,
    };
}

/** stairStore double with the MERGE update semantics Move/Update rely on. */
function makeStairStore() {
    const map = new Map<string, any>();
    return {
        add: (s: any) => { map.set(s.id, s); },
        get: (id: string) => map.get(id),
        getById: (id: string) => map.get(id),
        update: (id: string, updates: any) => {
            const cur = map.get(id);
            if (!cur) return undefined;
            const merged = { ...cur, ...updates };
            if (updates.properties && cur.properties) {
                merged.properties = { ...cur.properties, ...updates.properties };
            }
            map.set(id, merged);
            return merged;
        },
        remove: (id: string) => { map.delete(id); },
        restoreSnapshot: (s: any) => { map.set(s.id, s); },
        getStairConnectingLevels: () => undefined,
        getAll: () => Array.from(map.values()),
    };
}

function makeCtx(preSeedSlab: boolean) {
    const openingStore = makeOpeningStore();
    const slabStore = makeSlabStore(preSeedSlab);
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

function stairInput(id: string, x = 0, z = 0): CreateStairInput {
    return {
        id,
        baseLevelId: 'L0',
        topLevelId: 'L1',
        shape: 'I',
        riserHeight: 0.15,
        treadDepth: 0.28,
        width: 1.0,
        startPosition: { x, y: 0, z },
        flights: [{ direction: { x: 1, y: 0, z: 0 }, riserCount: 20 }],
        landings: [],
    } as CreateStairInput;
}

/** The profile the reconciler MUST produce for `stair` on the L1 slab at origin. */
function expectedProfile(stair: any): Array<{ x: number; y: number }> {
    const rect = computeStairFootprintRect({
        shape: stair.shape,
        width: stair.width,
        treadDepth: stair.treadDepth,
        startPosition: stair.startPosition,
        flights: stair.flights,
        landings: stair.landings,
    })!;
    return rect.map(p => worldXZToSlabLocal(p, { x: 0, z: 0 }));
}

function profileCloseTo(actual: any[], expected: Array<{ x: number; y: number }>): void {
    expect(actual.length).toBe(expected.length);
    for (let i = 0; i < expected.length; i++) {
        expect(actual[i].x).toBeCloseTo(expected[i].x, 6);
        expect(actual[i].y).toBeCloseTo(expected[i].y, 6);
    }
}

describe('§FIX-STAIR-MOVE-STRANDS-VOID — the slab void follows the stair', () => {
    it('(a) move a stair → the SAME opening moves with it (no second void, no stranded void)', () => {
        const { ctx, openingStore, slabStore, stairStore } = makeCtx(true);
        new CreateStairCommand(stairInput('st-mv')).execute(ctx);
        const before = openingStore.getByHostId(SLAB_ID);
        expect(before.length).toBe(1);

        slabStore.rebuilds.length = 0;
        const move = new MoveStairCommand({ stairId: 'st-mv', delta: { x: 2, z: 1 } });
        expect(move.execute(ctx).success).toBe(true);

        const after = openingStore.getByHostId(SLAB_ID);
        expect(after.length).toBe(1); // never a second void
        expect(after[0].id).toBe(stairAutoOpeningId('st-mv'));
        // The void is at the NEW footprint — recomputed from the moved stair record.
        profileCloseTo(after[0].profile, expectedProfile(stairStore.get('st-mv')));
        // …which is the OLD profile translated by exactly the move delta.
        for (let i = 0; i < before[0].profile.length; i++) {
            expect(after[0].profile[i].x).toBeCloseTo(before[0].profile[i].x + 2, 6);
            expect(after[0].profile[i].y).toBeCloseTo(before[0].profile[i].y + 1, 6);
        }
        // The host slab was rebuilt so the renderer sees the moved hole.
        expect(slabStore.rebuilds).toContain(SLAB_ID);
    });

    it('(b) ONE undo reverts both the move and the void', () => {
        const { ctx, openingStore, stairStore } = makeCtx(true);
        new CreateStairCommand(stairInput('st-un', 1, 2)).execute(ctx);
        const original = openingStore.getByHostId(SLAB_ID)[0];

        const move = new MoveStairCommand({ stairId: 'st-un', delta: { x: 3, z: -1 } });
        move.execute(ctx);
        expect(openingStore.getById(original.id)!.profile).not.toEqual(original.profile);

        expect(move.undo(ctx).success).toBe(true);
        // Stair back…
        expect(stairStore.get('st-un').startPosition).toEqual({ x: 1, y: 0, z: 2 });
        // …and the void back, in the SAME undo unit — still exactly one opening.
        const healed = openingStore.getByHostId(SLAB_ID);
        expect(healed.length).toBe(1);
        expect(healed[0].profile).toEqual(original.profile);
        expect(healed[0].hostId).toBe(original.hostId);
    });

    it('(c) footprint-changing parameter edit → the void matches computeStairFootprintRect; undo reverts both', () => {
        const { ctx, openingStore, stairStore } = makeCtx(true);
        new CreateStairCommand(stairInput('st-pr')).execute(ctx);
        const original = openingStore.getByHostId(SLAB_ID)[0];

        const upd = new UpdateStairParametersCommand({
            stairId: 'st-pr',
            updates: { treadDepth: 0.32 }, // lengthens the run → footprint changes
        });
        expect(upd.execute(ctx).success).toBe(true);

        const after = openingStore.getByHostId(SLAB_ID);
        expect(after.length).toBe(1);
        expect(after[0].id).toBe(stairAutoOpeningId('st-pr'));
        // The discriminator: the void IS the recomputed footprint of the stair as
        // it now stands in the store (incl. anything the geometry rebuild derived).
        profileCloseTo(after[0].profile, expectedProfile(stairStore.get('st-pr')));
        expect(after[0].profile).not.toEqual(original.profile);

        expect(upd.undo(ctx).success).toBe(true);
        const healed = openingStore.getByHostId(SLAB_ID);
        expect(healed.length).toBe(1);
        expect(healed[0].profile).toEqual(original.profile);
    });

    it('(d) NON-geometric edit (fireRating) → the void is NOT touched and no slab rebuild fires', () => {
        const { ctx, openingStore, slabStore } = makeCtx(true);
        new CreateStairCommand(stairInput('st-ng')).execute(ctx);
        const before = openingStore.getById(stairAutoOpeningId('st-ng'));

        slabStore.rebuilds.length = 0;
        const upd = new UpdateStairParametersCommand({
            stairId: 'st-ng',
            updates: { fireRating: '60min' },
        });
        expect(upd.execute(ctx).success).toBe(true);

        expect(openingStore.getById(stairAutoOpeningId('st-ng'))).toEqual(before);
        expect(slabStore.rebuilds).toEqual([]); // untouched means UNTOUCHED
        // And the undo of a no-op reconcile must not invent a void change either.
        upd.undo(ctx);
        expect(openingStore.getById(stairAutoOpeningId('st-ng'))).toEqual(before);
    });

    it('(e) a move can CARVE: stair had no void (no slab at create time), slab exists at move time', () => {
        const { ctx, openingStore, slabStore } = makeCtx(false);
        new CreateStairCommand(stairInput('st-cv')).execute(ctx);
        expect(openingStore.getAll().length).toBe(0); // nothing to carve into yet

        // The slab appears OUTSIDE any stair/slab command (e.g. project load path).
        slabStore.add({ id: SLAB_ID, levelId: 'L1', position: { x: 0, y: 0, z: 0 }, holes: [] });

        const move = new MoveStairCommand({ stairId: 'st-cv', delta: { x: 1, z: 0 } });
        expect(move.execute(ctx).success).toBe(true);
        expect(openingStore.getByHostId(SLAB_ID).length).toBe(1);
        expect(openingStore.getByHostId(SLAB_ID)[0].id).toBe(stairAutoOpeningId('st-cv'));

        // Undo removes the carve it performed — back to the pre-move world.
        expect(move.undo(ctx).success).toBe(true);
        expect(openingStore.getAll().length).toBe(0);
    });

    it('(f) move with NO slab anywhere → no void, no crash, move still succeeds and undoes', () => {
        const { ctx, openingStore, stairStore } = makeCtx(false);
        new CreateStairCommand(stairInput('st-ns', 4, 4)).execute(ctx);

        const move = new MoveStairCommand({ stairId: 'st-ns', delta: { x: -2, z: 5 } });
        expect(move.execute(ctx).success).toBe(true);
        expect(openingStore.getAll().length).toBe(0);
        expect(move.undo(ctx).success).toBe(true);
        expect(stairStore.get('st-ns').startPosition).toEqual({ x: 4, y: 0, z: 4 });
    });

    it('(g) REGRESSION PIN (L-298) — delete AFTER a move still removes the (moved) void', () => {
        const { ctx, openingStore } = makeCtx(true);
        new CreateStairCommand(stairInput('st-dl')).execute(ctx);
        new MoveStairCommand({ stairId: 'st-dl', delta: { x: 2, z: 2 } }).execute(ctx);
        expect(openingStore.getByHostId(SLAB_ID).length).toBe(1);

        expect(new DeleteStairCommand({ stairId: 'st-dl' }).execute(ctx).success).toBe(true);
        expect(openingStore.getByHostId(SLAB_ID).length).toBe(0);
        expect(openingStore.getAll().length).toBe(0);
    });
});
