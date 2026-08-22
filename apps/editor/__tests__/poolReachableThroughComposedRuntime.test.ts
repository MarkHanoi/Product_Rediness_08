// §FIX-POOL-UNREACHABLE (L-5200..L-5203) — the pool is DISPATCHABLE, proven at the
// composed runtime rather than at a hand-built world.
//
// ═══════════════════════════════════════════════════════════════════════════════
// WHY THIS FILE EXISTS AND `plugins/pool/__tests__/poolOneUndoEntry.test.ts` DOES
// NOT COVER IT
// ═══════════════════════════════════════════════════════════════════════════════
//
// The pool plugin already had a thorough suite. It ran the REAL CommandBus, the REAL
// RingBufferUndoStack and the REAL multi-store router, and it passed — for months —
// while `pool.create` could not be dispatched by the application AT ALL.
//
// The reason is one line in that file: it builds its own `World` object carrying
// `{ pool, wall, slab, water }` and hands it to the bus as the stores provider. The
// storesProvider is the very thing that was broken, so a test that SUPPLIES it cannot
// observe its absence. [[fake-more-capable-than-real]]: a fake built to the handler's
// declared needs cannot falsify the claim that the app meets them.
//
// In production the provider is `storesAsRecordView(stores)` over `stores[storeKey]`
// accumulated from `ALL_PLUGINS` (bootstrap.everything.ts:145). No `pool` or `water`
// descriptor existed, so those two keys were absent, and `CommandBus.buildContext`
// (CommandBus.ts:286-292) threw
//
//     pool.create: required store 'pool' is missing from HandlerContext.stores
//
// BEFORE anything mutated. The handlers were registered (engineLauncher.ts:630) and
// undispatchable — [[authored-but-unwired-is-the-bottleneck]] exactly.
//
// ⭐ SO THE ONE RULE THIS FILE ENFORCES IS: the pool is reachable THROUGH THE REAL
// COMPOSITION ROOT. It deliberately never constructs a store, a stores object or a
// bus of its own. Delete the two descriptors from `PluginRegistry.ts` and every test
// below fails; that is the property that was missing.

import { describe, expect, it } from 'vitest';
import { bootstrapWithEverything } from '../src/bootstrap.everything.js';
import { PoolStore, WaterStore } from '@pryzm/plugin-pool';

// ⭐ NOTE ON WHAT IS *NOT* IMPORTED HERE, BECAUSE IT IS THE MORE INTERESTING HALF.
//
// The first draft of this file imported `POOL_DIMENSION_DEFAULTS` from
// `@pryzm/geometry-pool` and compared the built assembly against the founder's
// 1.2 m default. Two things were wrong with that, and only one of them was the
// module-resolution error that made it fail loudly:
//
//  1. `@pryzm/geometry-pool` is not a dependency of `apps/editor` — it is reached
//     transitively through `@pryzm/plugin-pool`, and pnpm's strict linking refuses
//     it. Adding it to `package.json` to satisfy a test would have dragged the
//     lockfile along for no production reason.
//  2. ⭐ More importantly it was the WRONG ASSERTION. "the depth equals the
//     documented default" goes red the day someone deliberately changes the
//     default, which is not a defect — and it stays GREEN if the resolution chain
//     silently ignores an explicit user override, which very much is one.
//
// So the depth is passed EXPLICITLY below and the assembly is asserted to HONOUR
// it, plus a separate case pins the geometric RELATIONSHIPS that must hold for any
// depth whatsoever. Neither names a dimensional literal, and between them they
// catch the failure the constant-comparison would have missed.

const AUDIT = { actorId: 'u', projectId: 'p', clientId: 'c', timestamp: '' } as const;

// ⚠ EVERY ID IS A REAL BRANDED ULID, NOT A READABLE SLUG.
// The first draft used `slab_host_pool_reachability` and `water_pool_1`, and
// `slab.create` rejected them: `Expected slab_<ulid> id`
// (`/^slab_[0-9A-HJKMNP-TV-Z]{26}$/`). That is the branded-id contract doing its
// job — Crockford base32, I/L/O/U excluded — and it is worth recording that the
// suite could not be written with convenient names. A test that had bypassed the
// bus to seed the store directly would never have met this rule, which is another
// reason it goes through `slab.create`.
const HOST_SLAB = 'slab_01ARZ3NDEKTSV4RRFFQ69G5FAV';
const POOL_ID   = 'pool_01ARZ3NDEKTSV4RRFFQ69G5FB0';
const FLOOR_ID  = 'slab_01ARZ3NDEKTSV4RRFFQ69G5FB1';
const WATER_ID  = 'water_01ARZ3NDEKTSV4RRFFQ69G5FB2';

/** A 10 x 8 m terrace slab for the pool to be cut into. */
const HOST_BOUNDARY = [
  { x: 0,  y: 0, z: 0 },
  { x: 10, y: 0, z: 0 },
  { x: 10, y: 0, z: 8 },
  { x: 0,  y: 0, z: 8 },
];

/** A 4 x 2 m pool outline, world XZ, OPEN loop (the Pool schema refuses a closed one). */
const POOL_BOUNDARY = [
  { x: 2, y: 0, z: 2 },
  { x: 6, y: 0, z: 2 },
  { x: 6, y: 0, z: 4 },
  { x: 2, y: 0, z: 4 },
];

const POOL_PAYLOAD = {
  poolId: POOL_ID,
  levelId: 'level-1',
  hostSlabId: HOST_SLAB,
  boundary: POOL_BOUNDARY,
  wallIds: [
    'wall_01ARZ3NDEKTSV4RRFFQ69G5FB3',
    'wall_01ARZ3NDEKTSV4RRFFQ69G5FB4',
    'wall_01ARZ3NDEKTSV4RRFFQ69G5FB5',
    'wall_01ARZ3NDEKTSV4RRFFQ69G5FB6',
  ],
  floorSlabId: FLOOR_ID,
  waterId: WATER_ID,
};

/** Boot the app's real composition root and give the pool a real host slab. */
async function bootWithPool() {
  const rt = await bootstrapWithEverything({ audit: AUDIT });
  await rt.bus.executeCommand('slab.create', {
    id: HOST_SLAB,
    levelId: 'level-1',
    boundary: HOST_BOUNDARY,
  });
  return rt;
}

describe('§FIX-POOL-UNREACHABLE — the pool assembly is dispatchable through the composed runtime', () => {
  it('R-1: the composition root contributes BOTH the pool and the water store', async () => {
    const rt = await bootstrapWithEverything({ audit: AUDIT });
    // The four stores `pool.create` declares in `affectedStores` must ALL resolve.
    // `wall` and `slab` always did; `pool` and `water` are what L-5200 added.
    expect(rt.stores.pool).toBeInstanceOf(PoolStore);
    expect(rt.stores.water).toBeInstanceOf(WaterStore);
    expect(rt.stores.wall).toBeDefined();
    expect(rt.stores.slab).toBeDefined();
    rt.tearDown();
  });

  it('R-2: pool.create DISPATCHES — it no longer throws at CommandBus.buildContext', async () => {
    const rt = await bootWithPool();
    // The assertion that matters: this line THREW before L-5200, at
    // CommandBus.buildContext, before any mutation. The THROW is what is pinned —
    // a `.toBeDefined()` on the result would also pass on a handler that silently
    // did nothing.
    await expect(rt.bus.executeCommand('pool.create', POOL_PAYLOAD)).resolves.toBeDefined();
    rt.tearDown();
  });

  it('R-3: ONE dispatch lands the pool, its 4 walls, its floor slab and its water in the REAL stores', async () => {
    const rt = await bootWithPool();
    await rt.bus.executeCommand('pool.create', POOL_PAYLOAD);

    // Read the stores the application reads, not the handler's return value.
    // [[committed-is-not-reachable]] — a handler result proves the function ran,
    // never that the patch reached the store the renderer and schedule consume.
    expect(rt.stores.pool.getState().get(POOL_ID)).toBeDefined();
    expect(rt.stores.water.getState().get(WATER_ID)).toBeDefined();
    expect(rt.stores.slab.getState().get(FLOOR_ID)).toBeDefined();
    for (const id of POOL_PAYLOAD.wallIds) {
      expect(rt.stores.wall.getState().get(id), `pool wall ${id}`).toBeDefined();
    }
    rt.tearDown();
  });

  it('R-4: the pool CUTS A HOLE in the host slab — a void in the floor plate, not a box on top of it', async () => {
    const rt = await bootWithPool();
    const before = rt.stores.slab.getState().get(HOST_SLAB) as { holes?: unknown[] };
    expect(before.holes ?? []).toHaveLength(0);

    await rt.bus.executeCommand('pool.create', POOL_PAYLOAD);

    const after = rt.stores.slab.getState().get(HOST_SLAB) as { holes: unknown[][] };
    expect(after.holes).toHaveLength(1);
    // The hole IS the pool outline — one polygon drives the hole, the walls, the
    // floor and the water, so they cannot drift apart (PoolAssembly.ts section 1).
    expect(after.holes[0]).toHaveLength(POOL_BOUNDARY.length);
    rt.tearDown();
  });

  it('R-5: an EXPLICIT depth is HONOURED — the whole assembly is rebuilt to the depth the user asked for', async () => {
    const rt = await bootWithPool();
    // A depth that is deliberately NOT the documented default, so a resolution
    // chain that silently fell back to the default would fail here. That is the
    // failure a comparison against `POOL_DIMENSION_DEFAULTS.depth` could not see.
    const DEPTH = 1.8;
    await rt.bus.executeCommand('pool.create', { ...POOL_PAYLOAD, depth: DEPTH });

    for (const id of POOL_PAYLOAD.wallIds) {
      const w = rt.stores.wall.getState().get(id) as { baseOffset: number; height: number };
      // A negative baseOffset is the entire "goes underground" mechanism.
      expect(w.baseOffset, `${id} baseOffset`).toBeLessThan(0);
      expect(w.baseOffset).toBeCloseTo(-DEPTH, 10);
      expect(w.height).toBeCloseTo(DEPTH, 10);
    }
    // The floor slab's top face sits at -depth, so the pool floor IS the wall base.
    expect((rt.stores.slab.getState().get(FLOOR_ID) as { baseOffset: number }).baseOffset)
      .toBeCloseTo(-DEPTH, 10);
    expect((rt.stores.water.getState().get(WATER_ID) as { bottomElevation: number }).bottomElevation)
      .toBeCloseTo(-DEPTH, 10);
    rt.tearDown();
  });

  it('R-5b: the vertical model holds for ANY depth — the relationships, with no literal named', async () => {
    const rt = await bootWithPool();
    // No depth in the payload: this exercises the record → systemType → documented
    // default resolution chain WITHOUT asserting which value it landed on. The
    // relationships below must hold whatever the default is, so this case survives
    // a deliberate change to it and still catches a broken assembly.
    await rt.bus.executeCommand('pool.create', POOL_PAYLOAD);

    const wall  = rt.stores.wall.getState().get(POOL_PAYLOAD.wallIds[0]!) as { baseOffset: number; height: number };
    const floor = rt.stores.slab.getState().get(FLOOR_ID) as { baseOffset: number };
    const water = rt.stores.water.getState().get(WATER_ID) as {
      surfaceElevation: number; bottomElevation: number;
    };

    // (a) The pool is BELOW the level datum, and its walls span exactly the depth.
    expect(wall.baseOffset).toBeLessThan(0);
    expect(wall.height).toBeCloseTo(-wall.baseOffset, 10);
    // (b) Every wall agrees — one polygon, one depth, no per-edge drift.
    for (const id of POOL_PAYLOAD.wallIds) {
      const w = rt.stores.wall.getState().get(id) as { baseOffset: number; height: number };
      expect(w.baseOffset, `${id} baseOffset`).toBeCloseTo(wall.baseOffset, 10);
      expect(w.height, `${id} height`).toBeCloseTo(wall.height, 10);
    }
    // (c) The pool floor's top face IS the wall base — no gap, no overlap.
    expect(floor.baseOffset).toBeCloseTo(wall.baseOffset, 10);
    // (d) The water bottom sits on the pool floor...
    expect(water.bottomElevation).toBeCloseTo(wall.baseOffset, 10);
    // (e) ...and its surface sits BELOW the coping (freeboard > 0) but ABOVE the
    //     floor. These two elevations are INDEPENDENT, which is exactly why water
    //     is its own family and not a blue slab whose thickness would tie them
    //     together (ADR-0124 section 4).
    expect(water.surfaceElevation).toBeLessThan(0);
    expect(water.surfaceElevation).toBeGreaterThan(water.bottomElevation);
    rt.tearDown();
  });

  it('R-6: the pool OWNS its parts — parentId on each child, childrenIds on the parent', async () => {
    const rt = await bootWithPool();
    await rt.bus.executeCommand('pool.create', POOL_PAYLOAD);

    // This is what makes a pool ONE thing to select, inspect and delete, and it is
    // the blessed C15 hosting mechanism rather than a new compound pattern.
    const pool = rt.stores.pool.getState().get(POOL_ID) as { childrenIds: string[] };
    expect(new Set(pool.childrenIds)).toEqual(
      new Set([...POOL_PAYLOAD.wallIds, FLOOR_ID, WATER_ID]),
    );
    for (const id of POOL_PAYLOAD.wallIds) {
      expect((rt.stores.wall.getState().get(id) as { parentId: string }).parentId).toBe(POOL_ID);
    }
    expect((rt.stores.slab.getState().get(FLOOR_ID) as { parentId: string }).parentId).toBe(POOL_ID);
    expect((rt.stores.water.getState().get(WATER_ID) as { parentId: string }).parentId).toBe(POOL_ID);
    rt.tearDown();
  });

  it('R-7: the pool walls are REAL walls in the WALL store — so the take-off and IFC export find them', async () => {
    const rt = await bootWithPool();
    const wallsBefore = rt.stores.wall.getState().size;
    await rt.bus.executeCommand('pool.create', POOL_PAYLOAD);

    // The founder asked for a COMPOUND SYSTEM ELEMENT "done with walls, slabs and
    // finishes". This is the assertion that the composition is REAL rather than
    // bespoke meshes: the parts sit in the same stores every other wall and slab
    // lives in, which is what makes a pool measurable (C28) and exportable (C25).
    expect(rt.stores.wall.getState().size).toBe(wallsBefore + POOL_PAYLOAD.wallIds.length);
    const first = rt.stores.wall.getState().get(POOL_PAYLOAD.wallIds[0]!) as { thickness: number };
    for (const id of POOL_PAYLOAD.wallIds) {
      const w = rt.stores.wall.getState().get(id) as { type: string; thickness: number };
      // `type: 'wall'` is the load-bearing claim: it is what makes every wall-aware
      // consumer (schedule, IFC exporter, material dispatcher) pick these up.
      expect(w.type).toBe('wall');
      // Thickness is asserted as a RULE — positive, and identical on every edge —
      // rather than against the documented default, which would go red on a
      // deliberate change to it rather than on a defect.
      expect(w.thickness, `${id} thickness`).toBeGreaterThan(0);
      expect(w.thickness, `${id} thickness`).toBeCloseTo(first.thickness, 10);
    }
    expect((rt.stores.slab.getState().get(FLOOR_ID) as { type: string }).type).toBe('slab');
    rt.tearDown();
  });

  it('R-8: pool.delete removes the whole assembly AND HEALS the hole', async () => {
    const rt = await bootWithPool();
    await rt.bus.executeCommand('pool.create', POOL_PAYLOAD);
    await rt.bus.executeCommand('pool.delete', { poolId: POOL_ID });

    expect(rt.stores.pool.getState().get(POOL_ID)).toBeUndefined();
    expect(rt.stores.water.getState().get(WATER_ID)).toBeUndefined();
    expect(rt.stores.slab.getState().get(FLOOR_ID)).toBeUndefined();
    for (const id of POOL_PAYLOAD.wallIds) {
      expect(rt.stores.wall.getState().get(id), `pool wall ${id} after delete`).toBeUndefined();
    }
    // A pool that vanishes but leaves the hole is "worse than no feature" — asserted
    // separately from the "the pool is gone" checks above, because those would score
    // a perfect pass on exactly that bug.
    const host = rt.stores.slab.getState().get(HOST_SLAB) as { holes: unknown[] };
    expect(host.holes).toHaveLength(0);
    rt.tearDown();
  });
});
