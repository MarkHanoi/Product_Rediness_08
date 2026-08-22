// §FEAT-BALCONY-COMPOUND (L-5600) — THE UNDO GUARD AND THE PROFILE-EDIT PARTITION.
//
// ═══════════════════════════════════════════════════════════════════════════════
// "ONE GESTURE = ONE UNDO ENTRY." Ctrl-Z must remove THE BALCONY — not one rail of it.
// ═══════════════════════════════════════════════════════════════════════════════
//
// These tests run the REAL CommandBus with a REAL RingBufferUndoStack, dispatch the
// REAL handlers, and apply the REAL inverse patches through the REAL multi-store
// router. Nothing is mocked that could hide the defect.
//
// ⚠ WHAT THIS FILE CANNOT PROVE, STATED SO IT IS NOT MISTAKEN FOR PROOF. It supplies
// its own stores provider — which is EXACTLY the thing that was broken for the pool
// for weeks (`poolReachableThroughComposedRuntime.test.ts` header, and
// [[fake-more-capable-than-real]]). A suite that SUPPLIES the provider cannot observe
// its absence. Reachability through the real composition root is proven separately, in
// `apps/editor/__tests__/balconyReachableThroughComposedRuntime.test.ts`, and that is
// the test that closes this lane.

import { describe, it, expect, beforeEach } from 'vitest';
import { CommandBus, PatchEmitter, UndoStack } from '@pryzm/command-bus';
import { RingBufferUndoStack } from '@pryzm/runtime-undo-stack';
import { CreateBalconyHandler } from '../src/handlers/CreateBalcony.js';
import { DeleteBalconyHandler } from '../src/handlers/DeleteBalcony.js';
import { UpdateBalconyProfileHandler } from '../src/handlers/UpdateBalconyProfile.js';

// ⚠ Real branded ULIDs. `defineElement('balcony')` enforces
// /^balcony_[0-9A-HJKMNP-TV-Z]{26}$/ — Crockford base32, I/L/O/U excluded — so this
// suite could not have been written with readable slugs, which is the branded-id
// contract doing its job.
const BALCONY = 'balcony_01ARZ3NDEKTSV4RRFFQ69G5FAV';
const SLAB = 'slab_01ARZ3NDEKTSV4RRFFQ69G5FB0';
const FLOOR = 'floor_01ARZ3NDEKTSV4RRFFQ69G5FB1';
const RAILS = [
  'handrail_01ARZ3NDEKTSV4RRFFQ69G5FB2',
  'handrail_01ARZ3NDEKTSV4RRFFQ69G5FB3',
  'handrail_01ARZ3NDEKTSV4RRFFQ69G5FB4',
];
const EXTRA_RAIL = 'handrail_01ARZ3NDEKTSV4RRFFQ69G5FB5';
const HOST_WALL = 'wall_01ARZ3NDEKTSV4RRFFQ69G5FB6';

/** A 6 m wall along X at z = 0. */
const HOST_SEGMENT = { a: { x: 0, z: 0 }, b: { x: 6, z: 0 } };

/** The founder's default: 1.0 m along the wall × 0.5 m out, 2 m along. */
const BOUNDARY = [
  { x: 2, y: 0, z: 0 },
  { x: 3, y: 0, z: 0 },
  { x: 3, y: 0, z: 0.5 },
  { x: 2, y: 0, z: 0.5 },
];

const CREATE = {
  balconyId: BALCONY,
  levelId: 'level-1',
  boundary: BOUNDARY,
  hostWallId: HOST_WALL,
  hostOffset: 2,
  hostSegment: HOST_SEGMENT,
  slabId: SLAB,
  floorId: FLOOR,
  railingIds: RAILS,
};

interface World {
  balcony: Record<string, any>;
  slab: Record<string, any>;
  floor: Record<string, any>;
  handrail: Record<string, any>;
}

function freshWorld(): World {
  return {
    balcony: {},
    // A pre-existing slab and rail that the balcony MUST NOT disturb. A create/undo
    // that wipes the whole store would pass a naive "the balcony is gone" assertion.
    slab: { 'slab_01ARZ3NDEKTSV4RRFFQ69G5FC0': { id: 'slab_01ARZ3NDEKTSV4RRFFQ69G5FC0' } },
    floor: {},
    handrail: { 'handrail_01ARZ3NDEKTSV4RRFFQ69G5FC1': { id: 'handrail_01ARZ3NDEKTSV4RRFFQ69G5FC1' } },
  };
}

function freshBus(world: World) {
  const ring = new RingBufferUndoStack();
  const bus = new CommandBus({
    audit: { actorId: 'test', projectId: 'p1', clientId: 't1' },
    emitter: new PatchEmitter(),
    undoStack: new UndoStack({ maxSize: 50 }),
    ringBuffer: ring,
    storesProvider: () => ({
      balcony: world.balcony,
      slab: world.slab,
      floor: world.floor,
      handrail: world.handrail,
    }),
  });
  bus.register(new CreateBalconyHandler() as any);
  bus.register(new UpdateBalconyProfileHandler() as any);
  bus.register(new DeleteBalconyHandler() as any);
  return { bus, ring };
}

/**
 * Commit an EventRecord into the world through its PER-STORE envelopes — i.e. exactly
 * the path production takes (`attachStores` → `store.applyPatch(entry.forwardPatches)`).
 *
 * Committing via `nextStates` instead would bypass `record.patches[]`, which is where
 * the multi-store store-key strip happens — a harness that used `nextStates` would go
 * green while the real app nested every element one level deep under a key named
 * "slab"/"handrail". "Verify at the OUTCOME, not at the SEAM", applied to the harness.
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

function applyInverse(world: World, ev: any): void {
  for (const entry of ev.patches as { storeKey: string; inversePatches: any[] }[]) {
    const slice = (world as any)[entry.storeKey] as Record<string, any>;
    for (const p of entry.inversePatches) {
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

describe('§FEAT-BALCONY-COMPOUND — ONE gesture = ONE undo entry (C16 §8.6)', () => {
  let world: World;
  let bus: ReturnType<typeof freshBus>['bus'];
  let ring: RingBufferUndoStack;

  beforeEach(() => {
    world = freshWorld();
    const f = freshBus(world);
    bus = f.bus;
    ring = f.ring;
  });

  it('T-1: ONE dispatch produces EXACTLY ONE ring-buffer entry — not five', async () => {
    expect(ring.canUndo()).toBe(false);
    commit(world, await bus.executeCommand('balcony.create', CREATE));

    // THE headline invariant. Four element families were written; ONE undo entry
    // exists. An executor that dispatched slab.create + floor.create +
    // handrail.create ×3 (even inside a runBatch — C16 §8.6 B-6 proves runBatch is
    // UNDO-NEUTRAL) produces FIVE entries and fails here. So does any refactor that
    // splits this handler up "for clarity".
    let entries = 0;
    while (ring.canUndo()) {
      ring.undoPatch();
      entries++;
    }
    expect(entries).toBe(1);
  });

  it('T-2: the ONE gesture creates the plate, the finish and THREE rails — the outer U', async () => {
    commit(world, await bus.executeCommand('balcony.create', CREATE));

    expect(world.balcony[BALCONY]).toBeDefined();
    expect(world.slab[SLAB]).toBeDefined();
    expect(world.floor[FLOOR]).toBeDefined();
    for (const r of RAILS) expect(world.handrail[r], `rail ${r}`).toBeDefined();

    // The wall-facing edge is OPEN — three rails, not four.
    const mine = Object.keys(world.handrail).filter((id) => RAILS.includes(id));
    expect(mine).toHaveLength(3);

    // The balcony OWNS its members — one thing to select, move and delete (C103 §2).
    expect(world.balcony[BALCONY].childrenIds).toEqual([SLAB, FLOOR, ...RAILS]);
    expect(world.slab[SLAB].parentId).toBe(BALCONY);
    expect(world.floor[FLOOR].parentId).toBe(BALCONY);
    expect(world.handrail[RAILS[0]!].parentId).toBe(BALCONY);
  });

  it('T-3: Ctrl-Z removes ALL of it — no orphan rail floating in the air', async () => {
    const before = structuredClone(world);
    const ev = await bus.executeCommand('balcony.create', CREATE);
    commit(world, ev);
    applyInverse(world, ev);

    // Not just "the balcony record is gone" — a balcony that vanishes and leaves its
    // railing in mid-air is the failure this handler exists to not have, and a
    // `expect(world.balcony).toEqual({})` assertion would score a perfect pass on it.
    expect(world).toEqual(before);
  });

  it('T-4: DELETE takes the whole compound, in ONE entry', async () => {
    commit(world, await bus.executeCommand('balcony.create', CREATE));
    const beforeDelete = structuredClone(world);

    const ev = await bus.executeCommand('balcony.delete', { balconyId: BALCONY });
    commit(world, ev);

    expect(world.balcony[BALCONY]).toBeUndefined();
    expect(world.slab[SLAB]).toBeUndefined();
    expect(world.floor[FLOOR]).toBeUndefined();
    for (const r of RAILS) expect(world.handrail[r], `rail ${r}`).toBeUndefined();
    // ...and the neighbours it does not own are untouched.
    expect(world.slab['slab_01ARZ3NDEKTSV4RRFFQ69G5FC0']).toBeDefined();
    expect(world.handrail['handrail_01ARZ3NDEKTSV4RRFFQ69G5FC1']).toBeDefined();

    applyInverse(world, ev);
    expect(world).toEqual(beforeDelete);
  });

  it('T-5: refuses a NAMED host it cannot resolve — never quietly rails the doorway', async () => {
    // [[context-data-honesty-family]] — "could not resolve the host" and "there is no
    // host" are DIFFERENT FACTS with opposite correct outputs. Taking the
    // free-standing branch here would seal the balcony's own doorway.
    await expect(
      bus.executeCommand('balcony.create', { ...CREATE, hostSegment: undefined }),
    ).rejects.toThrow(/hostSegment/i);
  });
});

describe('§FEAT-BALCONY-COMPOUND — the profile edit: re-derive geometry, PRESERVE the rest', () => {
  let world: World;
  let bus: ReturnType<typeof freshBus>['bus'];
  let ring: RingBufferUndoStack;

  beforeEach(async () => {
    world = freshWorld();
    const f = freshBus(world);
    bus = f.bus;
    ring = f.ring;
    commit(world, await bus.executeCommand('balcony.create', CREATE));
    while (ring.canUndo()) ring.undoPatch(); // clear the ring; the create is set-up
  });

  /** The same balcony pushed 0.4 m further out — a plain vertex drag, 4 edges still. */
  const DEEPER = [
    { x: 2, y: 0, z: 0 },
    { x: 3, y: 0, z: 0 },
    { x: 3, y: 0, z: 0.9 },
    { x: 2, y: 0, z: 0.9 },
  ];

  it('P-1: ⭐ the finish and the railings FOLLOW the new outline (the founder\'s sentence)', async () => {
    commit(
      world,
      await bus.executeCommand('balcony.updateProfile', {
        balconyId: BALCONY,
        boundary: DEEPER,
        hostSegment: HOST_SEGMENT,
      }),
    );

    // Slab.
    expect(world.slab[SLAB].boundary.map((p: any) => p.z)).toEqual([0, 0, 0.9, 0.9]);
    // ⭐ Finish — the same polygon, not a stale copy of the old one.
    expect(world.floor[FLOOR].boundary).toEqual(world.slab[SLAB].boundary);
    // ⭐ Railings — the outer edge moved out with it.
    const outer = world.handrail[RAILS[1]!].path;
    expect(outer[0].z).toBeCloseTo(0.9, 9);
    expect(outer[1].z).toBeCloseTo(0.9, 9);
  });

  it('P-2: ONE reshape = ONE undo entry, and undo restores all three members', async () => {
    const before = structuredClone(world);
    const ev = await bus.executeCommand('balcony.updateProfile', {
      balconyId: BALCONY,
      boundary: DEEPER,
      hostSegment: HOST_SEGMENT,
    });
    commit(world, ev);

    let entries = 0;
    while (ring.canUndo()) {
      ring.undoPatch();
      entries++;
    }
    expect(entries).toBe(1);

    applyInverse(world, ev);
    expect(world).toEqual(before);
  });

  it('P-3: ⭐ THE PARTITION — a per-member edit SURVIVES the reshape', async () => {
    // The founder asked for two things that pull against each other: "the finish and
    // railings should adapt" AND "default options that can be changed on demand by
    // selecting the independent elements afterwards independently". A naive
    // re-derive satisfies the first and destroys the second.
    //
    // Simulate the user selecting ONE rail and giving it a taller glass balustrade,
    // and the plate a thicker section — the edits a property panel makes.
    world.handrail[RAILS[1]!] = { ...world.handrail[RAILS[1]!], height: 1.4, shape: 'flat' };
    world.slab[SLAB] = { ...world.slab[SLAB], thickness: 0.35, materialId: 'mat-oak' };
    world.floor[FLOOR] = { ...world.floor[FLOOR], materialId: 'mat-teak' };

    commit(
      world,
      await bus.executeCommand('balcony.updateProfile', {
        balconyId: BALCONY,
        boundary: DEEPER,
        hostSegment: HOST_SEGMENT,
      }),
    );

    // The GEOMETRY moved...
    expect(world.slab[SLAB].boundary.map((p: any) => p.z)).toEqual([0, 0, 0.9, 0.9]);
    expect(world.handrail[RAILS[1]!].path[0].z).toBeCloseTo(0.9, 9);
    // ...and NOTHING ELSE DID.
    expect(world.handrail[RAILS[1]!].height).toBe(1.4);
    expect(world.handrail[RAILS[1]!].shape).toBe('flat');
    expect(world.slab[SLAB].thickness).toBe(0.35);
    expect(world.slab[SLAB].materialId).toBe('mat-oak');
    expect(world.floor[FLOOR].materialId).toBe('mat-teak');
  });

  it('P-4: reshaping into MORE edges needs a new rail id — and REFUSES without one', async () => {
    // A five-sided balcony has four free edges. Building the shorter set would leave
    // an unguarded drop, so the refusal names the exact number required.
    const PENTAGON = [
      { x: 2, y: 0, z: 0 },
      { x: 3, y: 0, z: 0 },
      { x: 3, y: 0, z: 0.6 },
      { x: 2.5, y: 0, z: 1.1 },
      { x: 2, y: 0, z: 0.6 },
    ];
    await expect(
      bus.executeCommand('balcony.updateProfile', {
        balconyId: BALCONY,
        boundary: PENTAGON,
        hostSegment: HOST_SEGMENT,
      }),
    ).rejects.toThrow(/4 free edges/i);

    commit(
      world,
      await bus.executeCommand('balcony.updateProfile', {
        balconyId: BALCONY,
        boundary: PENTAGON,
        hostSegment: HOST_SEGMENT,
        addedRailingIds: [EXTRA_RAIL],
      }),
    );
    expect(world.handrail[EXTRA_RAIL]).toBeDefined();
    expect(world.balcony[BALCONY].childrenIds).toEqual([SLAB, FLOOR, ...RAILS, EXTRA_RAIL]);
  });

  it('P-5: reshaping into FEWER edges DELETES the surplus rail — no orphan', async () => {
    // A triangle against the wall has two free edges, so the third rail must go.
    const TRIANGLE = [
      { x: 2, y: 0, z: 0 },
      { x: 3, y: 0, z: 0 },
      { x: 2.5, y: 0, z: 0.9 },
    ];
    commit(
      world,
      await bus.executeCommand('balcony.updateProfile', {
        balconyId: BALCONY,
        boundary: TRIANGLE,
        hostSegment: HOST_SEGMENT,
      }),
    );
    expect(world.handrail[RAILS[0]!]).toBeDefined();
    expect(world.handrail[RAILS[1]!]).toBeDefined();
    expect(world.handrail[RAILS[2]!]).toBeUndefined();
    expect(world.balcony[BALCONY].childrenIds).toEqual([SLAB, FLOOR, RAILS[0], RAILS[1]]);
  });

  it('P-6: a degenerate reshape is REFUSED — the balcony is never left collapsed', async () => {
    await expect(
      bus.executeCommand('balcony.updateProfile', {
        balconyId: BALCONY,
        boundary: [
          { x: 2, y: 0, z: 0 },
          { x: 2.01, y: 0, z: 0 },
          { x: 2.01, y: 0, z: 0.01 },
        ],
        hostSegment: HOST_SEGMENT,
      }),
    ).rejects.toThrow(/non-degenerate/i);
  });
});
