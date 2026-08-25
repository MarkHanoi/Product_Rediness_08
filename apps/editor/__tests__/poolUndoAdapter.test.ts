// @vitest-environment happy-dom
//
// §POOL95 (L-11350) — CTRL+Z AFTER DRAWING A POOL WAS A TOTAL NO-OP, AND THE HOLE
// STAYED IN THE FLOOR.
//
// ═══════════════════════════════════════════════════════════════════════════════
// THE DEFECT, AND WHY EVERY EXISTING TEST WAS GREEN THROUGH IT
// ═══════════════════════════════════════════════════════════════════════════════
// `plugins/pool/__tests__/poolOneUndoEntry.test.ts` T-3 already proved — against the
// REAL `CommandBus`, the REAL `RingBufferUndoStack` and the REAL multi-store router —
// that the inverse patch restores the host slab's `holes` array to its exact prior
// state. That test was, and is, correct. The patch was never the problem.
//
// It was never ROUTED. `pool.create` declares `['pool','wall','slab','water']`;
// `_covered()` is ALL-OR-NOTHING (`affectedStores.every(s => typeof
// map[s]?.applyPatch === 'function')`), `wall` and `slab` were adapted and `pool` and
// `water` were not — so the ENTIRE entry was declined and `performUndoRedo` fell
// through to the legacy `commandManager`, which has never heard of `pool.create`.
// The pool stayed. The void stayed.
//
// ⭐ THE GAP BETWEEN THOSE TWO FACTS IS THE WHOLE POINT OF THIS FILE.
// §COMMITTED-IS-NOT-REACHABLE: a correct inverse patch that nothing applies is
// indistinguishable, from the architect's chair, from no undo at all. ARM A tests the
// ROUTING — the thing T-3 structurally cannot see, because T-3 calls
// `applyRingBufferSide` directly and never asks whether production would have.
//
// ⚠ AND THE ROWS SAID IT COULD NOT HAPPEN. `performUndoRedo` carried `pool`/`water`
// as `{owner:'nothing', reason:'UNREACHABLE …'}` on a four-axis L-980 measurement that
// was HONEST in August and had since gone stale in three of its four axes. ARM D pins
// the re-measurement so the rows cannot quietly rot back.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { Patch } from '@pryzm/command-bus';
import { PoolStore, WaterStore } from '@pryzm/plugin-pool';
import { buildUndoStoreMap, UNMAPPED_BUS_STORE_KEYS } from '../src/engine/undo/performUndoRedo.js';
import {
    poolUndoAdapter,
    waterUndoAdapter,
    registerWaterRenderSink,
    __resetWaterRenderSinkForTests,
    resolvePoolStoresFromWindow,
    type PoolUndoStores,
    type WaterRenderInputLike,
} from '../src/engine/undo/poolUndoAdapter.js';

const POOL_ID = 'pool_01ARZ3NDEKTSV4RRFFQ69G5FAV';
const WATER_ID = 'water_01ARZ3NDEKTSV4RRFFQ69G5FAW';

const BOUNDARY = [
    { x: 0, y: 0, z: 0 },
    { x: 4, y: 0, z: 0 },
    { x: 4, y: 0, z: 2 },
    { x: 0, y: 0, z: 2 },
];

const WATER_RECORD = {
    id: WATER_ID,
    type: 'water',
    levelId: 'level-1',
    parentId: POOL_ID,
    poolId: POOL_ID,
    childrenIds: [],
    boundary: BOUNDARY,
    surfaceElevation: -0.1,
    bottomElevation: -1.2,
    color: '#2E86C1',
    opacity: 0.3,
};

const POOL_RECORD = {
    id: POOL_ID,
    type: 'pool',
    levelId: 'level-1',
    hostSlabId: 'slab_01ARZ3NDEKTSV4RRFFQ69G5FAV',
    boundary: BOUNDARY,
    childrenIds: [WATER_ID],
};

/** The stores the pool assembly really writes — the four `pool.create` declares. */
const POOL_CREATE_STORES = ['pool', 'wall', 'slab', 'water'] as const;

describe('§POOL95 (L-11350) — the pool assembly is undoable', () => {
    let pool: PoolStore;
    let water: WaterStore;
    let sunk: { updated: WaterRenderInputLike[]; removed: string[] };
    const w = window as unknown as Record<string, unknown>;

    const resolve = (): PoolUndoStores | null => ({
        pool: pool as unknown as PoolUndoStores['pool'],
        water: water as unknown as PoolUndoStores['water'],
    });

    beforeEach(() => {
        pool = new PoolStore();
        water = new WaterStore();
        // The forward create the bus applied on `pool.create`.
        pool.applyPatch([{ op: 'add', path: [POOL_ID], value: POOL_RECORD } as unknown as Patch]);
        water.applyPatch([{ op: 'add', path: [WATER_ID], value: WATER_RECORD } as unknown as Patch]);
        expect(pool.get(POOL_ID)).toBeDefined();
        expect(water.get(WATER_ID)).toBeDefined();

        sunk = { updated: [], removed: [] };
        registerWaterRenderSink({
            update: (input) => sunk.updated.push(input),
            remove: (id) => sunk.removed.push(id),
        });
    });

    afterEach(() => {
        __resetWaterRenderSinkForTests();
        delete w['runtime'];
        delete w['wallStore'];
        delete w['slabStore'];
    });

    it('ARM A: `_covered()` now accepts a pool entry — all FOUR stores have a working adapter', () => {
        // ⚠ THE POOL'S OTHER TWO STORES ARE LEGACY GLOBALS, AND THE STUBS BELOW ARE
        // WHY THIS ARM IS HONEST RATHER THAN CONVENIENT. `buildUndoStoreMap()` reads
        // `window.wallStore` / `window.slabStore` and `adaptElementStoreMap` yields
        // `undefined` for any falsy entry — so in a bare happy-dom document `wall`
        // and `slab` are uncovered too, and a four-key assertion would fail for a
        // reason that has nothing to do with this lane. Installing them reproduces
        // the PRODUCTION shape (`initBuilders.ts` assigns both), so the arm measures
        // the thing it claims to measure. Any truthy object is enough — the adapter
        // is built from presence, and this arm tests ROUTING, not application (ARM B
        // does that against the real stores).
        w['wallStore'] = { getById: () => undefined, update: () => undefined };
        w['slabStore'] = { getById: () => undefined, update: () => undefined };

        const map = buildUndoStoreMap();

        // ⭐ THIS IS THE ASSERTION THE DEFECT FAILS, and it is a re-implementation of
        // `_covered()`'s exact body (it is private). Before this lane `pool` and
        // `water` were `undefined` here, `.every()` returned false, and the whole
        // four-store PatchPair was stranded — Ctrl+Z a total no-op, hole and all.
        const covered = POOL_CREATE_STORES.every(s => typeof map[s]?.applyPatch === 'function');
        expect(covered, 'pool.create declares four stores and _covered() is all-or-nothing').toBe(true);

        // Named individually, so a failure says WHICH key regressed rather than just
        // "false".
        for (const key of POOL_CREATE_STORES) {
            expect(typeof map[key]?.applyPatch, `store '${key}' must have an applyPatch adapter`).toBe('function');
        }

        // ⭐ AND THE TWO THIS LANE ADDED ARE COVERED WITHOUT ANY LEGACY GLOBAL — they
        // resolve off the composed runtime lazily, so unlike `wall`/`slab` above they
        // need no `window.*` assignment to be PRESENT in the map. That difference is
        // the whole reason L-980 could not simply "wire the globals": there are none
        // to wire, and inventing them would have created a second authority.
        delete w['wallStore'];
        delete w['slabStore'];
        const bare = buildUndoStoreMap();
        expect(typeof bare['pool']?.applyPatch).toBe('function');
        expect(typeof bare['water']?.applyPatch).toBe('function');
    });

    it('ARM B: undo REMOVES the water and tears its mesh down; redo restores both', () => {
        const adapter = waterUndoAdapter(resolve);

        // ── UNDO: the inverse of the create. ───────────────────────────────────
        adapter.applyPatch([{ op: 'remove', path: [WATER_ID] } as unknown as Patch]);

        expect(water.get(WATER_ID), 'the record is gone from the store').toBeUndefined();
        // ⭐ AND OFF THE SCREEN. `performUndoRedo` emits NO bus events (measured:
        // zero `events.emit` in that file), so without the render sink the water
        // would revert in the model and stay visible — the exact "committed is not
        // reachable" shape, one layer up.
        expect(sunk.removed, 'the mesh is torn down too').toEqual([WATER_ID]);
        expect(sunk.updated, 'nothing is redrawn for a removed body').toEqual([]);

        // ── REDO: the forward again. ───────────────────────────────────────────
        sunk.removed.length = 0;
        adapter.applyPatch([{ op: 'add', path: [WATER_ID], value: WATER_RECORD } as unknown as Patch]);

        expect(water.get(WATER_ID), 'the record is back').toBeDefined();
        expect(sunk.updated, 'and the body is redrawn').toHaveLength(1);

        const drawn = sunk.updated[0]!;
        expect(drawn.id).toBe(WATER_ID);
        // ⚠ ABSOLUTE elevations, read as STORED. A redo that re-derived the surface
        // from a depth and a freeboard would rebuild the blue slab inside the undo
        // path and re-couple the water to the floor (ADR-0124 §4.1).
        expect(drawn.surfaceElevation).toBe(-0.1);
        expect(drawn.bottomElevation).toBe(-1.2);
        // The founder's appearance survives the round trip, rather than the body
        // coming back at some renderer default.
        expect(drawn.color).toBe('#2E86C1');
        expect(drawn.opacity).toBe(0.3);
    });

    it('ARM C: the POOL adapter applies its patch and renders NOTHING — by contract', () => {
        const adapter = poolUndoAdapter(resolve);
        adapter.applyPatch([{ op: 'remove', path: [POOL_ID] } as unknown as Patch]);

        expect(pool.get(POOL_ID), 'the parent record is reverted').toBeUndefined();
        // ADR-0124 §3 — the pool record "carries NO geometry of its own". Its walls
        // and floor are real `wall`/`slab` records redrawn by their OWN families'
        // undo path; drawing them from here would be the double-render C104 §13
        // forbids for the lift, for the same reason.
        expect(sunk.updated, 'the pool record has no mesh').toEqual([]);
        expect(sunk.removed, 'and nothing to tear down').toEqual([]);
    });

    it('ARM D: with NO composed runtime the adapter THROWS BY NAME — never a silent no-op', () => {
        // The L-980 rule, kept rather than bent. `_covered()` saw a working
        // `applyPatch` and PROMISED this side would land; if the runtime is genuinely
        // absent the promise is broken and `applyRingBufferSide` must report a
        // per-store FAILURE. Returning empty sets would make a broken undo
        // indistinguishable from a successful one — which is the defect this whole
        // lane is about, in miniature.
        expect(resolvePoolStoresFromWindow(), 'no window.runtime in this test').toBeNull();

        const deadPool = poolUndoAdapter(resolvePoolStoresFromWindow);
        const deadWater = waterUndoAdapter(resolvePoolStoresFromWindow);

        expect(() => deadPool.applyPatch([])).toThrow(/runtime\.stores\.pool is not reachable/);
        expect(() => deadWater.applyPatch([])).toThrow(/runtime\.stores\.water is not reachable/);
    });

    it('ARM E: `pool` and `water` are GONE from UNMAPPED_BUS_STORE_KEYS — the rows moved with the fix', () => {
        // ⭐ THE DURABLE HALF. The stale rows are why this defect survived a week: a
        // four-axis measurement that was honest on 2026-08-18 ("UNREACHABLE, so
        // Ctrl+Z after a pool is not a live defect") INVERTED the day another lane
        // wired `PoolPlanToolHandler`, and nothing re-read it. Claiming coverage in
        // `buildUndoStoreMap()` while `UNMAPPED_BUS_STORE_KEYS` still says
        // `owner:'nothing'` would leave the same trap set for the next reader.
        expect(UNMAPPED_BUS_STORE_KEYS['pool'], 'pool is adapted now, so it must not be listed unmapped').toBeUndefined();
        expect(UNMAPPED_BUS_STORE_KEYS['water'], 'water is adapted now, so it must not be listed unmapped').toBeUndefined();

        // ...and the guard is not vacuous: the table is still populated with the keys
        // that really are unmapped, so this arm cannot pass by the table being empty.
        expect(Object.keys(UNMAPPED_BUS_STORE_KEYS).length).toBeGreaterThan(3);
    });
});
