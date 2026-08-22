// §FEAT-BALCONY-COMPOUND (L-5600..L-5604) — the balcony is DISPATCHABLE, proven at the
// composed runtime rather than at a hand-built world.
//
// ═══════════════════════════════════════════════════════════════════════════════
// ⭐ THIS FILE IS THE LANE'S DELIVERABLE. THE GEOMETRY PACKAGE IS NOT.
// ═══════════════════════════════════════════════════════════════════════════════
//
// The pool had a thorough suite. It ran the REAL CommandBus, the REAL
// RingBufferUndoStack and the REAL multi-store router, and it passed — for weeks —
// while `pool.create` could not be dispatched by the application AT ALL.
//
// The reason is one line in that file: it builds its own `World` object and hands it
// to the bus as the stores provider. **The storesProvider is the very thing that was
// broken, so a test that SUPPLIES it cannot observe its absence.**
// [[fake-more-capable-than-real]] — a fake built to the handler's declared needs
// cannot falsify the claim that the app meets them.
//
// `plugins/balcony/__tests__/balconyCompound.test.ts` has exactly that shape and says
// so in its own header. THIS file is its complement: it deliberately never constructs
// a store, a stores object or a bus. It boots the app's REAL composition root and
// reads the stores the application reads. Delete the `balcony` descriptor from
// `PluginRegistry.ts` and every test below fails; that is the property that was
// missing for the pool and is the reason this file exists before the defect rather
// than after it.
//
// ⚠ WHAT THIS FILE STILL CANNOT PROVE — stated so it is not mistaken for proof:
// that a balcony RENDERS, that a click places one, or that the plan preview is
// dimensionally identical to the placed element. Those need a browser. They are
// recorded as NOT VERIFIED in the lane report and in L-5608.

import { describe, expect, it } from 'vitest';
import { bootstrapWithEverything } from '../src/bootstrap.everything.js';
import { BalconyStore } from '@pryzm/plugin-balcony';

const AUDIT = { actorId: 'u', projectId: 'p', clientId: 'c', timestamp: '' } as const;

// ⚠ EVERY ID IS A REAL BRANDED ULID, NOT A READABLE SLUG. `defineElement('balcony')`
// enforces /^balcony_[0-9A-HJKMNP-TV-Z]{26}$/ — Crockford base32, I/L/O/U excluded.
// A test that had bypassed the bus to seed the store directly would never have met
// this rule, which is another reason everything below goes through the bus.
const BALCONY_ID = 'balcony_01ARZ3NDEKTSV4RRFFQ69G5FAV';
const SLAB_ID = 'slab_01ARZ3NDEKTSV4RRFFQ69G5FB0';
const FLOOR_ID = 'floor_01ARZ3NDEKTSV4RRFFQ69G5FB1';
const RAIL_IDS = [
  'handrail_01ARZ3NDEKTSV4RRFFQ69G5FB2',
  'handrail_01ARZ3NDEKTSV4RRFFQ69G5FB3',
  'handrail_01ARZ3NDEKTSV4RRFFQ69G5FB4',
];
const EXTRA_RAIL = 'handrail_01ARZ3NDEKTSV4RRFFQ69G5FB5';
const HOST_WALL = 'wall_01ARZ3NDEKTSV4RRFFQ69G5FB6';

/** A 6 m façade running along X at z = 0. */
const HOST_SEGMENT = { a: { x: 0, z: 0 }, b: { x: 6, z: 0 } };

/**
 * The FOUNDER'S DEFAULT BALCONY: 1.00 m along the wall × 0.50 m projection, placed
 * 2 m along the façade. Written out as literal world coordinates rather than computed
 * here, so this file states the shape it expects instead of asking the code under
 * test what shape it produces.
 */
const BOUNDARY = [
  { x: 2, y: 0, z: 0 },
  { x: 3, y: 0, z: 0 },
  { x: 3, y: 0, z: 0.5 },
  { x: 2, y: 0, z: 0.5 },
];

const PAYLOAD = {
  balconyId: BALCONY_ID,
  levelId: 'level-1',
  boundary: BOUNDARY,
  hostWallId: HOST_WALL,
  hostOffset: 2,
  hostSegment: HOST_SEGMENT,
  slabId: SLAB_ID,
  floorId: FLOOR_ID,
  railingIds: RAIL_IDS,
};

async function boot() {
  return bootstrapWithEverything({ audit: AUDIT });
}

describe('§FEAT-BALCONY-COMPOUND — the balcony compound is dispatchable through the composed runtime', () => {
  it('R-1: the composition root contributes the balcony store AND the three member stores', async () => {
    const rt = await boot();
    // The four stores `balcony.create` declares in `affectedStores` must ALL resolve.
    // `slab`, `floor` and `handrail` always did; `balcony` is what this lane added,
    // and it is the one whose absence made the pool undispatchable for weeks.
    expect(rt.stores.balcony).toBeInstanceOf(BalconyStore);
    expect(rt.stores.slab).toBeDefined();
    expect(rt.stores.floor).toBeDefined();
    expect(rt.stores.handrail).toBeDefined();
    rt.tearDown();
  });

  it('R-2: balcony.create DISPATCHES — it does not throw at CommandBus.buildContext', async () => {
    const rt = await boot();
    // The assertion that matters: without the PluginRegistry descriptor this line
    // throws `balcony.create: required store 'balcony' is missing from
    // HandlerContext.stores` BEFORE any mutation. The THROW is what is pinned — a
    // `.toBeDefined()` on the result would also pass on a handler that silently did
    // nothing.
    await expect(rt.bus.executeCommand('balcony.create', PAYLOAD)).resolves.toBeDefined();
    rt.tearDown();
  });

  it('R-3: ONE dispatch lands the plate, the finish and THREE rails in the REAL stores', async () => {
    const rt = await boot();
    await rt.bus.executeCommand('balcony.create', PAYLOAD);

    // Read the stores the application reads, not the handler's return value.
    // [[committed-is-not-reachable]] — a handler result proves the function ran,
    // never that the patch reached the store the renderer and schedule consume.
    expect(rt.stores.balcony.getState().get(BALCONY_ID)).toBeDefined();
    expect(rt.stores.slab.getState().get(SLAB_ID)).toBeDefined();
    expect(rt.stores.floor.getState().get(FLOOR_ID)).toBeDefined();
    for (const id of RAIL_IDS) {
      expect(rt.stores.handrail.getState().get(id), `balcony rail ${id}`).toBeDefined();
    }
    rt.tearDown();
  });

  it('R-4: ⭐ the members are REAL records of EXISTING families — a plate IS a slab', async () => {
    const rt = await boot();
    const slabsBefore = rt.stores.slab.getState().size;
    const railsBefore = rt.stores.handrail.getState().size;
    await rt.bus.executeCommand('balcony.create', PAYLOAD);

    // The founder asked for a compound "composed by a slab, floor finish and railing".
    // This is the assertion that the composition is REAL rather than three bespoke
    // meshes: the members sit in the same stores every other slab, finish and rail
    // lives in — which is what makes a balcony measurable (C28), exportable (C25),
    // material-editable, and — his other requirement — INDIVIDUALLY SELECTABLE by
    // every panel that already reads those stores.
    expect(rt.stores.slab.getState().size).toBe(slabsBefore + 1);
    expect(rt.stores.handrail.getState().size).toBe(railsBefore + RAIL_IDS.length);

    expect((rt.stores.slab.getState().get(SLAB_ID) as { type: string }).type).toBe('slab');
    expect((rt.stores.floor.getState().get(FLOOR_ID) as { type: string }).type).toBe('floor');
    for (const id of RAIL_IDS) {
      expect((rt.stores.handrail.getState().get(id) as { type: string }).type).toBe('handrail');
    }
    rt.tearDown();
  });

  it('R-5: the balcony OWNS its members — parentId on each, childrenIds on the parent', async () => {
    const rt = await boot();
    await rt.bus.executeCommand('balcony.create', PAYLOAD);

    const b = rt.stores.balcony.getState().get(BALCONY_ID) as { childrenIds: string[] };
    expect(b.childrenIds).toEqual([SLAB_ID, FLOOR_ID, ...RAIL_IDS]);
    expect((rt.stores.slab.getState().get(SLAB_ID) as { parentId: string }).parentId).toBe(BALCONY_ID);
    expect((rt.stores.floor.getState().get(FLOOR_ID) as { parentId: string }).parentId).toBe(BALCONY_ID);
    for (const id of RAIL_IDS) {
      expect((rt.stores.handrail.getState().get(id) as { parentId: string }).parentId).toBe(BALCONY_ID);
    }
    rt.tearDown();
  });

  it('R-6: ⭐ THE FOUNDER\'S DEFAULTS reach the model — 1.0 × 0.5 plan, 1.0 m rail', async () => {
    const rt = await boot();
    // No width/projection/railingHeight in the payload: this exercises the
    // record → systemType → documented default chain end-to-end, through the real
    // bus, and asserts what a PERSON would see.
    await rt.bus.executeCommand('balcony.create', PAYLOAD);

    const slab = rt.stores.slab.getState().get(SLAB_ID) as {
      boundary: { x: number; z: number }[];
    };
    const xs = slab.boundary.map((p) => p.x);
    const zs = slab.boundary.map((p) => p.z);
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(1.0, 9); // 1 m along the wall
    expect(Math.max(...zs) - Math.min(...zs)).toBeCloseTo(0.5, 9); // 0.5 m projection

    for (const id of RAIL_IDS) {
      expect((rt.stores.handrail.getState().get(id) as { height: number }).height).toBeCloseTo(1.0, 9);
    }
    rt.tearDown();
  });

  it('R-7: an EXPLICIT railing height is HONOURED — the chain never ignores an override', async () => {
    const rt = await boot();
    // A height deliberately NOT the documented default, so a chain that silently fell
    // back would fail here. That is the failure a comparison against the default
    // constant could not see.
    const H = 1.35;
    await rt.bus.executeCommand('balcony.create', { ...PAYLOAD, railingHeight: H });
    for (const id of RAIL_IDS) {
      expect((rt.stores.handrail.getState().get(id) as { height: number }).height).toBeCloseTo(H, 9);
    }
    rt.tearDown();
  });

  it('R-8: the vertical stack holds for ANY dimensions — relationships, no literal named', async () => {
    const rt = await boot();
    await rt.bus.executeCommand('balcony.create', PAYLOAD);

    const slab = rt.stores.slab.getState().get(SLAB_ID) as { baseOffset: number; thickness: number };
    const floor = rt.stores.floor.getState().get(FLOOR_ID) as {
      baseOffset: number;
      thickness: number;
    };
    const rail = rt.stores.handrail.getState().get(RAIL_IDS[0]!) as {
      path: { y: number }[];
      height: number;
    };

    // (a) The plate's TOP face is the level datum — you walk out onto the storey.
    expect(slab.baseOffset).toBe(0);
    expect(slab.thickness).toBeGreaterThan(0);
    // (b) The finish RESTS ON the plate: FFL = slab top + finish thickness. Same
    //     arithmetic `FloorSlabBindingHandler._onSlabUpdated` uses for a bound finish.
    expect(floor.baseOffset).toBeCloseTo(slab.baseOffset + floor.thickness, 9);
    // (c) ⭐ The rail stands on the FINISHED floor, not on the structural plate —
    //     which is where every guard code measures a guard height from.
    expect(rail.path[0]!.y).toBeCloseTo(floor.baseOffset, 9);
    expect(rail.path[1]!.y).toBeCloseTo(floor.baseOffset, 9);
    expect(rail.height).toBeGreaterThan(0);
    rt.tearDown();
  });

  it('R-9: THREE rails, not four — the wall-facing edge stays OPEN as the access', async () => {
    const rt = await boot();
    await rt.bus.executeCommand('balcony.create', PAYLOAD);

    // The residential generator's shipped rule, now measured rather than indexed:
    // "the outer U; the wall-facing edge stays OPEN as the access from the room".
    // A four-rail balcony is sealed off from its own doorway.
    const b = rt.stores.balcony.getState().get(BALCONY_ID) as { childrenIds: string[] };
    expect(b.childrenIds.slice(2)).toHaveLength(3);

    // ...and none of the three runs along the façade.
    for (const id of RAIL_IDS) {
      const r = rt.stores.handrail.getState().get(id) as { path: { x: number; z: number }[] };
      const onWall = r.path.every((p) => Math.abs(p.z) < 1e-9);
      expect(onWall, `rail ${id} must not run along the host wall`).toBe(false);
    }
    rt.tearDown();
  });

  it('R-10: ⭐ balcony.updateProfile RESHAPES the compound — the finish and rails follow', async () => {
    const rt = await boot();
    await rt.bus.executeCommand('balcony.create', PAYLOAD);

    // The founder's last sentence, at the layer a person experiences it: change the
    // slab's shape, and the finish and railings adapt.
    const DEEPER = [
      { x: 2, y: 0, z: 0 },
      { x: 3, y: 0, z: 0 },
      { x: 3, y: 0, z: 1.4 },
      { x: 2, y: 0, z: 1.4 },
    ];
    await rt.bus.executeCommand('balcony.updateProfile', {
      balconyId: BALCONY_ID,
      boundary: DEEPER,
      hostSegment: HOST_SEGMENT,
    });

    const slab = rt.stores.slab.getState().get(SLAB_ID) as { boundary: { z: number }[] };
    const floor = rt.stores.floor.getState().get(FLOOR_ID) as { boundary: { z: number }[] };
    expect(Math.max(...slab.boundary.map((p) => p.z))).toBeCloseTo(1.4, 9);
    // The finish is not a copy taken at creation — it is the SAME polygon, recomputed.
    expect(floor.boundary).toEqual(slab.boundary);
    // The outer rail moved out with it.
    const outer = rt.stores.handrail.getState().get(RAIL_IDS[1]!) as { path: { z: number }[] };
    expect(outer.path[0]!.z).toBeCloseTo(1.4, 9);
    rt.tearDown();
  });

  it('R-11: a reshape that ADDS an edge adds a rail — and refuses without a pre-minted id', async () => {
    const rt = await boot();
    await rt.bus.executeCommand('balcony.create', PAYLOAD);

    const PENTAGON = [
      { x: 2, y: 0, z: 0 },
      { x: 3, y: 0, z: 0 },
      { x: 3, y: 0, z: 0.6 },
      { x: 2.5, y: 0, z: 1.1 },
      { x: 2, y: 0, z: 0.6 },
    ];
    await expect(
      rt.bus.executeCommand('balcony.updateProfile', {
        balconyId: BALCONY_ID,
        boundary: PENTAGON,
        hostSegment: HOST_SEGMENT,
      }),
    ).rejects.toThrow();

    await rt.bus.executeCommand('balcony.updateProfile', {
      balconyId: BALCONY_ID,
      boundary: PENTAGON,
      hostSegment: HOST_SEGMENT,
      addedRailingIds: [EXTRA_RAIL],
    });
    expect(rt.stores.handrail.getState().get(EXTRA_RAIL)).toBeDefined();
    rt.tearDown();
  });

  it('R-12: balcony.delete removes the WHOLE compound — no rail left floating', async () => {
    const rt = await boot();
    await rt.bus.executeCommand('balcony.create', PAYLOAD);
    await rt.bus.executeCommand('balcony.delete', { balconyId: BALCONY_ID });

    expect(rt.stores.balcony.getState().get(BALCONY_ID)).toBeUndefined();
    expect(rt.stores.slab.getState().get(SLAB_ID)).toBeUndefined();
    expect(rt.stores.floor.getState().get(FLOOR_ID)).toBeUndefined();
    for (const id of RAIL_IDS) {
      expect(rt.stores.handrail.getState().get(id), `rail ${id} after delete`).toBeUndefined();
    }
    rt.tearDown();
  });

  it('R-13: a NAMED host that cannot be resolved is REFUSED, not silently railed shut', async () => {
    const rt = await boot();
    // [[context-data-honesty-family]] — "could not resolve the host" and "there is no
    // host" are different facts with opposite correct outputs.
    await expect(
      rt.bus.executeCommand('balcony.create', { ...PAYLOAD, hostSegment: undefined }),
    ).rejects.toThrow(/hostSegment/i);
    expect(rt.stores.balcony.getState().get(BALCONY_ID)).toBeUndefined();
    rt.tearDown();
  });
});
