// ─── §FIX-STAIR-SLAB-OPENING-SYMMETRY ────────────────────────────────────────
//
// FOUNDER REQUIREMENT: "On STAIR creation a HOLE is created on the SLAB ABOVE.
// This is GREAT. But I would like THE OPPOSITE TOO: if there IS a stair already
// created, and then the SLAB on the floor above is created, an AUTOMATIC HOLE
// should be created."
//
// The log showed only one direction worked:
//   [CreateStairCommand] Auto-opening skipped: no slab on top level "level-…"
//   … later …
//   [CreateSlabsOnAllFloorsCommand] COMPLETE created=2      ← zero openings carved
//
// The invariant — "for every stair, the slab at its TOP level (if one exists)
// carries exactly ONE opening matching that stair's footprint" — is symmetric in
// TIME, so it has ONE owner (`StairSlabOpeningReconciler`) that both directions
// call. These tests have teeth because they query
// `openingStore.getByHostId(slabId)` — the exact collection
// `SlabFragmentBuilder.createSlabMeshWithEdges` triangulates into the real void —
// and because direction B's PROFILE is compared against direction A's, not merely
// counted.

import { describe, it, expect } from 'vitest';
import { CreateStairCommand, type CreateStairInput } from '../src/stair/CreateStairCommand';
import { CreateSlabCommand } from '../src/slabs/CreateSlabCommand';
import { stairAutoOpeningId } from '../src/stair/stairOpeningId';
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

/** slabStore double. `preSeed` decides whether the L1 slab exists up-front. */
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

function makeStairStore() {
    const map = new Map<string, any>();
    return {
        add: (s: any) => { map.set(s.id, s); },
        getById: (id: string) => map.get(id),
        get: (id: string) => map.get(id),
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

function slabPayload(id = SLAB_ID) {
    return {
        id,
        ifcGuid: `guid-${id}`,
        width: 20, depth: 20, thickness: 0.25,
        position: { x: 0, y: 0, z: 0 },
        levelId: 'L1',
    };
}

describe('§FIX-STAIR-SLAB-OPENING-SYMMETRY', () => {
    it('(a) REGRESSION — slab first, then stair: still exactly one opening', () => {
        const { ctx, openingStore } = makeCtx(true);
        expect(openingStore.getByHostId(SLAB_ID).length).toBe(0);

        expect(new CreateStairCommand(stairInput('st-a')).execute(ctx).success).toBe(true);

        const holes = openingStore.getByHostId(SLAB_ID);
        expect(holes.length).toBe(1);
        expect(holes[0].id).toBe(stairAutoOpeningId('st-a'));
    });

    it('(b) stair first, then slab: the hole is carved, with the SAME footprint as (a)', () => {
        // Direction A — the reference result.
        const a = makeCtx(true);
        new CreateStairCommand(stairInput('st-xa')).execute(a.ctx);
        const referenceProfile = a.openingStore.getByHostId(SLAB_ID)[0].profile;

        // Direction B — stair authored FIRST, no slab yet.
        const b = makeCtx(false);
        // A DIFFERENT id (the ElementRegistry is a process singleton), same geometry —
        // so the profile comparison below tests the FOOTPRINT, not the id.
        expect(new CreateStairCommand(stairInput('st-xb')).execute(b.ctx).success).toBe(true);
        expect(b.openingStore.getAll().length).toBe(0); // nothing to carve into — correct

        // …then the slab arrives.
        expect(new CreateSlabCommand(slabPayload()).execute(b.ctx).success).toBe(true);

        const holes = b.openingStore.getByHostId(SLAB_ID);
        expect(holes.length).toBe(1);
        expect(holes[0].id).toBe(stairAutoOpeningId('st-xb'));
        // The discriminator: not "an opening exists" but "the SAME void".
        expect(holes[0].profile).toEqual(referenceProfile);
        expect(holes[0].levelId).toBe('L1');
        expect(holes[0].hostId).toBe(SLAB_ID);
    });

    it('(c) N stairs on one level + one slab ⇒ N openings and ONE slab rebuild', () => {
        const { ctx, openingStore, slabStore } = makeCtx(false);
        for (let i = 0; i < 4; i++) new CreateStairCommand(stairInput(`st-n${i}`, i * 5)).execute(ctx);
        expect(openingStore.getAll().length).toBe(0);

        slabStore.rebuilds.length = 0;
        new CreateSlabCommand(slabPayload()).execute(ctx);

        expect(openingStore.getByHostId(SLAB_ID).length).toBe(4);
        // MAXIMUM PERFORMANCE: one SlabFragmentBuilder pass for the whole set,
        // never one rebuild per hole.
        expect(slabStore.rebuilds).toEqual([SLAB_ID]);
    });

    it('(d) undo of the slab removes its auto-openings', () => {
        const { ctx, openingStore } = makeCtx(false);
        new CreateStairCommand(stairInput('st-u1')).execute(ctx);
        new CreateStairCommand(stairInput('st-u2', 6)).execute(ctx);

        const slabCmd = new CreateSlabCommand(slabPayload());
        slabCmd.execute(ctx);
        expect(openingStore.getByHostId(SLAB_ID).length).toBe(2);

        expect(slabCmd.undo(ctx).success).toBe(true);
        expect(openingStore.getAll().length).toBe(0);
    });

    it('(e) no opening is created when no stair tops out on the slab level', () => {
        const { ctx, openingStore, slabStore } = makeCtx(false);
        // A stair that tops out on L2, not L1.
        const other = { ...stairInput('st-elsewhere'), topLevelId: 'L2' } as CreateStairInput;
        new CreateStairCommand(other).execute(ctx);

        slabStore.rebuilds.length = 0;
        new CreateSlabCommand(slabPayload()).execute(ctx);

        expect(openingStore.getAll().length).toBe(0);
        expect(slabStore.rebuilds).toEqual([]); // no needless rebuild either
    });

    it('(f) the reconcile is IDEMPOTENT — a second slab on the level cannot double-carve', () => {
        const { ctx, openingStore } = makeCtx(false);
        new CreateStairCommand(stairInput('st-idem')).execute(ctx);

        new CreateSlabCommand(slabPayload()).execute(ctx);
        new CreateSlabCommand(slabPayload('slab-L1-b')).execute(ctx);

        expect(openingStore.getAll().length).toBe(1);
    });
});
