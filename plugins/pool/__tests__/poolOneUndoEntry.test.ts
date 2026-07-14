// §FEAT-SWIMMING-POOL-ELEMENT (L-292) — THE UNDO GUARD.
//
// ═══════════════════════════════════════════════════════════════════════════════
// "ONE GESTURE = ONE UNDO ENTRY. THIS IS THE INVARIANT THAT MAKES IT A PRODUCT
//  RATHER THAN A DEMO. Ctrl-Z must remove THE POOL — not one wall of it."
// ═══════════════════════════════════════════════════════════════════════════════
//
// These tests run the REAL CommandBus with a REAL RingBufferUndoStack, dispatch the
// REAL `pool.create` handler, and then apply the REAL inverse patch through the REAL
// multi-store router. Nothing is mocked that could hide the defect.
//
// THE ASSERTION THAT MATTERS MOST — and the one the ticket calls out explicitly:
//
//   > assert the slab's holes array is back to its prior state — not just that the
//   > pool elements are gone.
//
// A pool that vanishes on Ctrl+Z but leaves the hole is the failure the ticket names
// as "worse than no feature". So `T-3` compares the host slab's `holes` array against
// a deep snapshot taken BEFORE the pool existed, and a "the pool is gone" assertion
// alone would score a perfect pass on that bug. It is tested separately for that reason.

import { describe, it, expect, beforeEach } from 'vitest';
import { CommandBus, PatchEmitter, UndoStack, applyRingBufferSide } from '@pryzm/command-bus';
import { RingBufferUndoStack } from '@pryzm/runtime-undo-stack';
import { CreatePoolHandler } from '../src/handlers/CreatePool.js';
import { DeletePoolHandler } from '../src/handlers/DeletePool.js';

const HOST = 'slab_01ARZ3NDEKTSV4RRFFQ69G5FAV';
const POOL = 'pool_01ARZ3NDEKTSV4RRFFQ69G5FAV';

/** 4 × 2 m pool outline, world XZ, open loop. */
const BOUNDARY = [
  { x: 0, y: 0, z: 0 },
  { x: 4, y: 0, z: 0 },
  { x: 4, y: 0, z: 2 },
  { x: 0, y: 0, z: 2 },
];

const PAYLOAD = {
  poolId: POOL,
  levelId: 'level-1',
  hostSlabId: HOST,
  boundary: BOUNDARY,
  wallIds: ['wall-n', 'wall-e', 'wall-s', 'wall-w'],
  floorSlabId: 'slab-pool-floor',
  waterId: 'water-1',
};

/** A pre-existing hole (a stair void, say) that the pool MUST NOT disturb. */
const PRE_EXISTING_HOLE = [
  { x: 8, y: 0, z: 8 },
  { x: 9, y: 0, z: 8 },
  { x: 9, y: 0, z: 9 },
];

interface World {
  pool: Record<string, any>;
  wall: Record<string, any>;
  slab: Record<string, any>;
  water: Record<string, any>;
}

function freshWorld(): World {
  return {
    pool: {},
    wall: {},
    slab: {
      [HOST]: {
        id: HOST,
        type: 'slab',
        levelId: 'level-1',
        boundary: [
          { x: -5, y: 0, z: -5 }, { x: 15, y: 0, z: -5 },
          { x: 15, y: 0, z: 15 }, { x: -5, y: 0, z: 15 },
        ],
        // The host already has a hole. If the pool's undo restores "[]" instead of
        // the PRIOR array, this one vanishes — and that bug would pass a naive
        // "holes.length === 0 after undo" assertion. It does not pass T-3.
        holes: [PRE_EXISTING_HOLE],
        thickness: 0.2,
        baseOffset: 0,
      },
    },
    water: {},
  };
}

function freshBus(world: World) {
  const ring = new RingBufferUndoStack();
  const bus = new CommandBus({
    audit: { actorId: 'test', projectId: 'p1', clientId: 't1' },
    emitter: new PatchEmitter(),
    undoStack: new UndoStack({ maxSize: 50 }),
    ringBuffer: ring,
    // The handler reads its four stores through here. `nextStates` is written back
    // so a second dispatch (create → delete) sees the world the first one left.
    storesProvider: () => ({
      pool: world.pool,
      wall: world.wall,
      slab: world.slab,
      water: world.water,
    }),
  });
  bus.register(new CreatePoolHandler() as any);
  bus.register(new DeletePoolHandler() as any);
  return { bus, ring };
}

/**
 * Commit an EventRecord into the world through its PER-STORE envelopes — i.e. exactly
 * the path production takes (`attachStores` → `store.applyPatch(entry.forwardPatches)`).
 *
 * This is deliberate, and it is load-bearing. Committing via `nextStates` instead would
 * bypass `record.patches[]` entirely — and `record.patches[]` is where the multi-store
 * store-key strip happens. A harness that used `nextStates` would go green while the
 * real app nested every element one level deep under a key named "wall"/"slab". That is
 * the "verify at the OUTCOME, not at the SEAM" rule, applied to the test harness itself.
 */
function commit(world: World, ev: any): void {
  for (const entry of ev.patches as { storeKey: string; forwardPatches: any[] }[]) {
    const slice = (world as any)[entry.storeKey] as Record<string, any>;
    for (const p of entry.forwardPatches) {
      const id = String(p.path[0]);
      if (p.path.length === 1) {
        if (p.op === 'remove') delete slice[id];
        else slice[id] = p.value;
      } else {
        const field = String(p.path[1]);
        if (slice[id]) slice[id] = { ...slice[id], [field]: p.value };
      }
    }
  }
}

/** Adapters that mutate the plain-object world the way the real legacy stores do. */
function storeMap(world: World) {
  const mk = (slice: () => Record<string, any>) => ({
    applyPatch(patches: readonly unknown[]): void {
      for (const raw of patches) {
        const p = raw as { op: string; path: (string | number)[]; value?: unknown };
        const id = String(p.path[0]);
        if (p.path.length === 1) {
          if (p.op === 'remove') delete slice()[id];
          else slice()[id] = p.value;
        } else {
          const field = String(p.path[1]);
          if (slice()[id]) slice()[id] = { ...slice()[id], [field]: p.value };
        }
      }
    },
  });
  return {
    pool:  mk(() => world.pool),
    wall:  mk(() => world.wall),
    slab:  mk(() => world.slab),
    water: mk(() => world.water),
  };
}

describe('§FEAT-SWIMMING-POOL-ELEMENT — ONE gesture = ONE undo entry (C16 §8.6)', () => {
  let world: World;
  let bus: ReturnType<typeof freshBus>['bus'];
  let ring: RingBufferUndoStack;

  beforeEach(() => {
    world = freshWorld();
    const f = freshBus(world);
    bus = f.bus;
    ring = f.ring;
  });

  it('T-1: ONE dispatch produces EXACTLY ONE ring-buffer entry — not four', async () => {
    expect(ring.canUndo()).toBe(false);

    commit(world, await bus.executeCommand('pool.create', PAYLOAD));

    // THE headline invariant. Four element families were written; ONE undo entry exists.
    // WHAT WOULD THE BUG SCORE? An executor that dispatched wall.batch.create +
    // slab.create + water.create + pool.create (even inside a runBatch — C16 §8.6 B-6
    // proves runBatch is UNDO-NEUTRAL) produces FOUR entries and fails here. So does
    // any refactor that splits this handler up "for clarity".
    let entries = 0;
    while (ring.canUndo()) { ring.undoPatch(); entries++; }
    expect(entries).toBe(1);
  });

  it('T-2: the ONE gesture creates the pool, N walls, the floor slab and the water', async () => {
    commit(world, await bus.executeCommand('pool.create', PAYLOAD));

    expect(Object.keys(world.pool)).toEqual([POOL]);
    expect([...Object.keys(world.wall)].sort()).toEqual(['wall-e', 'wall-n', 'wall-s', 'wall-w']);
    expect(world.slab['slab-pool-floor']).toBeDefined();
    expect(Object.keys(world.water)).toEqual(['water-1']);

    // ...and EXACTLY ONE new hole in the host slab (the pre-existing one + the pool's).
    expect(world.slab[HOST].holes).toHaveLength(2);

    // The pool OWNS its parts — one thing to select, edit, delete (ADR-0124 §3).
    expect([...world.pool[POOL].childrenIds].sort())
      .toEqual(['slab-pool-floor', 'wall-e', 'wall-n', 'wall-s', 'wall-w', 'water-1'].sort());
    for (const id of ['wall-n', 'wall-e', 'wall-s', 'wall-w']) {
      expect(world.wall[id].parentId).toBe(POOL);
      expect(world.wall[id].baseOffset).toBeLessThan(0);   // UNDER the level
    }
    expect(world.slab['slab-pool-floor'].parentId).toBe(POOL);
    expect(world.water['water-1'].parentId).toBe(POOL);
  });

  it('T-3: Ctrl-Z removes ALL of it **AND RESTORES THE SLAB** — holes back to their PRIOR state', async () => {
    // The deep "before" snapshot. This is the thing the ticket demands we compare to.
    const holesBefore = structuredClone(world.slab[HOST].holes);
    expect(holesBefore).toHaveLength(1);

    commit(world, await bus.executeCommand('pool.create', PAYLOAD));
    expect(world.slab[HOST].holes).toHaveLength(2);   // the pool cut its void

    // ── THE UNDO ──────────────────────────────────────────────────────────────
    const pair = ring.current()!;
    const inverse = ring.undoPatch()!;
    const outcome = applyRingBufferSide(inverse, pair.affectedStores!, storeMap(world));

    // Every one of the four stores actually applied. `applied: []` is the silent
    // failure mode the multi-store router had before L-292 — the undo "succeeded"
    // while touching nothing at all.
    expect(outcome.failed).toEqual([]);
    expect([...outcome.applied].sort()).toEqual(['pool', 'slab', 'wall', 'water']);

    // 1. The pool and every part of it is gone.
    expect(world.pool).toEqual({});
    expect(world.wall).toEqual({});
    expect(world.water).toEqual({});
    expect(world.slab['slab-pool-floor']).toBeUndefined();

    // 2. ── AND THE SLAB IS HEALED. ────────────────────────────────────────────
    // Not "the holes array is empty" — that would ALSO pass if undo had wiped the
    // pre-existing stair void, which is a different, worse bug. The array must be
    // EXACTLY what it was before the pool existed.
    expect(world.slab[HOST].holes).toEqual(holesBefore);
    expect(world.slab[HOST].holes).toHaveLength(1);
    expect(world.slab[HOST].holes[0]).toEqual(PRE_EXISTING_HOLE);

    // 3. The host slab itself survived (undo must not delete the floor plate).
    expect(world.slab[HOST].id).toBe(HOST);
    expect(world.slab[HOST].thickness).toBe(0.2);
  });

  it('T-4: REDO re-cuts the hole and rebuilds every part (the forward patch round-trips)', async () => {
    commit(world, await bus.executeCommand('pool.create', PAYLOAD));
    const pair = ring.current()!;
    const map = storeMap(world);

    applyRingBufferSide(ring.undoPatch()!, pair.affectedStores!, map);
    expect(world.pool).toEqual({});
    expect(world.slab[HOST].holes).toHaveLength(1);

    const forward = ring.redoPatch()!;
    const outcome = applyRingBufferSide(forward, pair.affectedStores!, map);

    expect(outcome.failed).toEqual([]);
    expect(Object.keys(world.pool)).toEqual([POOL]);
    expect(Object.keys(world.wall)).toHaveLength(4);
    expect(world.water['water-1']).toBeDefined();
    expect(world.slab[HOST].holes).toHaveLength(2);   // the void is back
  });
});

describe('§FEAT-SWIMMING-POOL-ELEMENT — DELETE heals the slab (ADR-0124 §6)', () => {
  it('D-1: deleting the pool removes its walls, floor and water AND closes the hole', async () => {
    const world = freshWorld();
    const { bus } = freshBus(world);

    const holesBefore = structuredClone(world.slab[HOST].holes);

    commit(world, await bus.executeCommand('pool.create', PAYLOAD));
    expect(world.slab[HOST].holes).toHaveLength(2);
    expect(Object.keys(world.wall)).toHaveLength(4);

    commit(world, await bus.executeCommand('pool.delete', { poolId: POOL }));

    // Everything the pool owned is gone...
    expect(world.pool).toEqual({});
    expect(world.wall).toEqual({});
    expect(world.water).toEqual({});
    expect(world.slab['slab-pool-floor']).toBeUndefined();

    // ...AND THE FLOOR PLATE IS WHOLE AGAIN.
    //
    // WHAT WOULD THE BUG SCORE? This is the EXACT defect that is live in the tree
    // today for the STAIR: `DeleteStairCommand` removes the stair, its railings and
    // its landings, and leaves the void punched through the slab forever. A delete
    // handler that forgot the heal passes every other assertion in this file and
    // fails only this one.
    expect(world.slab[HOST].holes).toEqual(holesBefore);
    expect(world.slab[HOST].holes).toHaveLength(1);

    // And the pre-existing (non-pool) hole is untouched — the delete removed the
    // pool's OWN void, not "the last hole" and not "all holes".
    expect(world.slab[HOST].holes[0]).toEqual(PRE_EXISTING_HOLE);

    // The host slab still exists.
    expect(world.slab[HOST]).toBeDefined();
  });

  it('D-2: deleting a pool is ONE undo entry too', async () => {
    const world = freshWorld();
    const { bus, ring } = freshBus(world);

    commit(world, await bus.executeCommand('pool.create', PAYLOAD));
    const afterCreate = (() => { let n = 0; const r = ring as any; return n; })();
    void afterCreate;

    commit(world, await bus.executeCommand('pool.delete', { poolId: POOL }));

    // create + delete = 2 entries, so the delete added exactly ONE.
    let entries = 0;
    while (ring.canUndo()) { ring.undoPatch(); entries++; }
    expect(entries).toBe(2);
  });
});
