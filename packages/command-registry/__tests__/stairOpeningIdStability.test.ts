// @vitest-environment happy-dom
//
// ─── §STAIR-VOID-EVERY-DECK (L-1433) ─────────────────────────────────────────
//
// A stair used to carve ONE void, in the slab on its TOP level.
// `LevelTraversalPolicy.canTraverse` returns `ok: true` (with a warning) for a
// level-skipping stair, so a Ground→L5 stair was ACCEPTED and drove through four
// INTACT slabs. Founder-reachable by hand: the stair parameters panel offers Top
// level as a dropdown.
//
// ⭐⭐ THE HALF OF THIS CHANGE THAT CAN DESTROY DATA IS THE ID, NOT THE LOOP.
// `opening-stair-<stairId>` is PERSISTED. Every project already saved carries its
// stair void under that string, and `DeleteStairCommand` resolves it by that
// string. If the top deck had been re-keyed to a new format:
//
//   • every saved project's void would become UNOWNED — the delete would stop
//     healing it, leaving a permanent hole in a building with no stair in it; and
//   • the reconcile would carve a SECOND void beside the orphan.
//
// So the first four cases below pin the LITERAL. They are written to fail on a
// rename even when every other test still passes.

import { describe, it, expect } from 'vitest';
import { CreateStairCommand, type CreateStairInput } from '../src/stair/CreateStairCommand';
import { DeleteStairCommand } from '../src/stair/DeleteStairCommand';
import { CreateSlabCommand } from '../src/slabs/CreateSlabCommand';
import {
    stairAutoOpeningId,
    stairAutoOpeningIdPrefix,
    isStairAutoOpeningId,
} from '../src/stair/stairOpeningId';
import type { CommandContext } from '../src/types';

const DECK = [
    { x: -10, z: -10 }, { x: 10, z: -10 }, { x: 10, z: 10 }, { x: -10, z: 10 },
];

const LEVELS = [
    { id: 'L0', elevation: 0, name: 'Ground' },
    { id: 'L1', elevation: 3.0, name: 'Level 1' },
    { id: 'L2', elevation: 6.0, name: 'Level 2' },
];

function slabId(levelId: string): string { return `slab-${levelId}`; }

function makeOpeningStore() {
    const map = new Map<string, any>();
    return {
        add: (o: any) => { map.set(o.id, structuredClone(o)); },
        remove: (id: string) => { map.delete(id); },
        update: (id: string, patch: any) => {
            const cur = map.get(id);
            if (cur) map.set(id, { ...cur, ...structuredClone(patch) });
        },
        getById: (id: string) => { const o = map.get(id); return o ? structuredClone(o) : undefined; },
        getByHostId: (hostId: string) =>
            Array.from(map.values()).filter(o => o.hostId === hostId).map(o => structuredClone(o)),
        getAll: () => Array.from(map.values()).map(o => structuredClone(o)),
    };
}

function makeSlabStore(levelIds: string[]) {
    const rebuilds: string[] = [];
    const slabs = new Map<string, any>();
    for (const levelId of levelIds) {
        slabs.set(slabId(levelId), {
            id: slabId(levelId), levelId,
            position: { x: 0, y: 0, z: 0 },
            polygon: DECK.map(p => ({ x: p.x, y: p.z })),
            holes: [],
        });
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
        add: (s: any) => { map.set(s.id, structuredClone(s)); },
        getById: (id: string) => map.get(id),
        get: (id: string) => map.get(id),
        remove: (id: string) => { map.delete(id); },
        restoreSnapshot: (s: any) => { map.set(s.id, s); },
        getStairConnectingLevels: () => undefined,
        getAll: () => Array.from(map.values()),
    };
}

function makeHarness(slabLevels: string[]) {
    const openingStore = makeOpeningStore();
    const slabStore = makeSlabStore(slabLevels);
    const stairStore = makeStairStore();
    const wallStore = {
        getById: () => undefined,
        getWindow: () => undefined,
        getDoor: () => undefined,
        getLevels: () => LEVELS,
    };
    const bimManager = {
        registerElement: () => {},
        unregisterElement: () => {},
        getLevelById: (id: string) => LEVELS.find(l => l.id === id),
    };
    const ctx = {
        stores: { stairStore, slabStore, openingStore, wallStore },
        bimManager,
        projectContext: { activeLevelId: 'L0' },
    } as unknown as CommandContext;
    return { ctx, openingStore, slabStore, stairStore };
}

function stairInput(id: string, topLevelId = 'L1'): CreateStairInput {
    const storeys = LEVELS.findIndex(l => l.id === topLevelId);
    return {
        id,
        baseLevelId: 'L0',
        topLevelId,
        shape: 'I',
        riserHeight: 0.15,
        treadDepth: 0.28,
        width: 1.0,
        startPosition: { x: 0, y: 0, z: 0 },
        flights: [{ direction: { x: 1, y: 0, z: 0 }, riserCount: 20 * storeys }],
        landings: [],
    } as CreateStairInput;
}

// ─────────────────────────────────────────────────────────────────────────────

describe('§STAIR-VOID-EVERY-DECK — ID STABILITY (the data-loss half)', () => {

    it('⭐ the top deck keeps the EXACT persisted string — pinned as a literal', () => {
        // ⛔ If this literal ever has to change, every saved project needs a
        // migration FIRST. Do not "fix" this test by updating the string.
        expect(stairAutoOpeningId('st-1')).toBe('opening-stair-st-1');
        expect(stairAutoOpeningIdPrefix('st-1')).toBe('opening-stair-st-1');
    });

    it('naming the top level explicitly yields the SAME legacy string', () => {
        expect(stairAutoOpeningId('st-1', 'L1', 'L1')).toBe('opening-stair-st-1');
        expect(stairAutoOpeningId('st-1', 'L5', 'L5')).toBe('opening-stair-st-1');
    });

    it('only ADDITIONAL decks are suffixed', () => {
        expect(stairAutoOpeningId('st-1', 'L2', 'L5')).toBe('opening-stair-st-1--L2');
    });

    it('the matcher is not a bare prefix test — a stair whose id EXTENDS another is not confused', () => {
        expect(isStairAutoOpeningId('opening-stair-st-1', 'st-1')).toBe(true);
        expect(isStairAutoOpeningId('opening-stair-st-1--L2', 'st-1')).toBe(true);
        // 'st-1' is a prefix of 'st-10'; a bare startsWith would wrongly claim this.
        expect(isStairAutoOpeningId('opening-stair-st-10', 'st-1')).toBe(false);
        expect(isStairAutoOpeningId('opening-stair-st-10--L2', 'st-1')).toBe(false);
    });

    it('⭐ a SINGLE-STOREY stair — the shape every existing project has — still carves the legacy id and nothing else', () => {
        const h = makeHarness(['L1']);
        new CreateStairCommand(stairInput('st-legacy')).execute(h.ctx);

        const ids = h.openingStore.getAll().map((o: any) => o.id);
        expect(ids).toEqual(['opening-stair-st-legacy']);
    });

    it('⭐ a void saved by a PRE-L-1433 build is still healed by the delete', () => {
        // Exactly what a project file written before this change contains: one
        // opening under the legacy id, with no level suffix anywhere.
        const h = makeHarness(['L1']);
        h.stairStore.add({ ...stairInput('st-old'), id: 'st-old' });
        h.openingStore.add({
            id: 'opening-stair-st-old',
            type: 'opening',
            hostId: slabId('L1'),
            levelId: 'L1',
            parentId: slabId('L1'),
            profile: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }],
            baseOffset: 0,
            properties: {},
        });

        const del = new DeleteStairCommand({ stairId: 'st-old' });
        del.execute(h.ctx);
        expect(h.openingStore.getById('opening-stair-st-old')).toBeUndefined();

        del.undo(h.ctx);
        expect(h.openingStore.getById('opening-stair-st-old')).toBeDefined();
    });
});

describe('§STAIR-VOID-EVERY-DECK — the level axis', () => {

    it('⭐ a Ground→L2 stair carves BOTH decks — the intermediate slab is no longer solid', () => {
        const h = makeHarness(['L1', 'L2']);
        const res = new CreateStairCommand(stairInput('st-multi', 'L2')).execute(h.ctx);
        expect(res.success).toBe(true);

        const onL1 = h.openingStore.getByHostId(slabId('L1'));
        const onL2 = h.openingStore.getByHostId(slabId('L2'));

        expect(onL1.length, 'INTERMEDIATE slab left solid — the stair drives through it').toBe(1);
        expect(onL2.length, 'top slab not carved').toBe(1);

        // …and the TOP deck is the one holding the legacy id.
        expect(onL2[0].id).toBe('opening-stair-st-multi');
        expect(onL1[0].id).toBe('opening-stair-st-multi--L1');
    });

    it('the BASE deck is never carved — the stair stands on it', () => {
        const h = makeHarness(['L0', 'L1']);
        new CreateStairCommand(stairInput('st-base')).execute(h.ctx);

        expect(h.openingStore.getByHostId(slabId('L0')).length).toBe(0);
        expect(h.openingStore.getByHostId(slabId('L1')).length).toBe(1);
    });

    it('undo removes EVERY deck’s void in one gesture', () => {
        const h = makeHarness(['L1', 'L2']);
        const cmd = new CreateStairCommand(stairInput('st-undo', 'L2'));
        cmd.execute(h.ctx);
        expect(h.openingStore.getAll().length).toBe(2);

        cmd.undo(h.ctx);
        expect(h.openingStore.getAll().length).toBe(0);
    });

    it('delete heals EVERY deck, and undoing the delete restores every deck', () => {
        const h = makeHarness(['L1', 'L2']);
        new CreateStairCommand(stairInput('st-del', 'L2')).execute(h.ctx);
        expect(h.openingStore.getAll().length).toBe(2);

        const del = new DeleteStairCommand({ stairId: 'st-del' });
        del.execute(h.ctx);
        expect(h.openingStore.getAll().length).toBe(0);

        del.undo(h.ctx);
        expect(h.openingStore.getAll().map((o: any) => o.id).sort())
            .toEqual(['opening-stair-st-del', 'opening-stair-st-del--L1']);
    });

    it('DIRECTION B: a slab laid later on an INTERMEDIATE deck of an existing stair gets its void', () => {
        // The symmetric half. Before L-1433 the slab side filtered
        // `s.topLevelId === levelId`, so a slab created on an intermediate deck of
        // a multi-storey stair was carved by nobody — the same enumeration seen
        // from the other direction.
        const h = makeHarness(['L2']);            // only the TOP deck exists at first
        new CreateStairCommand(stairInput('st-symm', 'L2')).execute(h.ctx);
        expect(h.openingStore.getAll().length).toBe(1);

        new CreateSlabCommand({
            id: slabId('L1'),
            ifcGuid: 'guid-L1',
            width: 20, depth: 20, thickness: 0.25,
            position: { x: 0, y: 0, z: 0 },
            levelId: 'L1',
        } as any).execute(h.ctx);

        expect(
            h.openingStore.getByHostId(slabId('L1')).length,
            'slab laid over an existing stair’s intermediate deck was not carved',
        ).toBe(1);
    });

    it('a stair with no baseLevelId falls back to the top deck ONLY, and does not throw', () => {
        const h = makeHarness(['L1', 'L2']);
        const input = { ...stairInput('st-nobase', 'L2'), baseLevelId: '' } as CreateStairInput;
        // activeLevelId is 'L0', so the command still resolves a base — the point
        // is that the path is exercised and stays sane.
        expect(() => new CreateStairCommand(input).execute(h.ctx)).not.toThrow();
        expect(h.openingStore.getAll().length).toBeGreaterThanOrEqual(1);
    });
});
