// @vitest-environment happy-dom
//
// §FIX-WALL-LAYERS-PLAN-VS-3D-CREATION — L-239 / L-211 regression suite.
//
// THE DEFECT (founder, recurrent): "The user chooses a layered interior wall and
// creates it on PLAN view. The wall is created, the correct thickness is applied —
// however the LAYERS are not present. Whereas if the user creates the wall in 3D,
// same interior wall, the wall IS created with the correct layers."
//
// ROOT CAUSE (from source): `CreateWallHandler` DECLARED `layers` on its payload
// but never wrote it into `Wall.parse` — the canonical bus handler dropped the
// field, and resolved NOTHING from `systemTypeId` except thickness
// (§WALL-TYPE-THICKNESS). 3D only *looked* right because `WallTool` ALSO
// dual-writes through the legacy `CreateWallCommand`, which does stamp `layers`.
// The plan tool is bus-only, so it had no stamp. BOTH renderers —
// WallFragmentBuilder (§03-1.3, 3D) and WallLayerPlanSymbolBuilder (plan) — read
// `wall.layers` off the INSTANCE, so a plan-created layered wall drew plain in
// BOTH views (L-239), and any wall missing a stamped stack showed layers in 3D but
// not in plan (L-211). Same defect, two ends.
//
// THE FIX (founder's binding decision): the INSTANCE is canonical. `systemTypeId`
// is resolved into `{ thickness, layers }` ONCE, at the `wall.create` COMMAND
// chokepoint — below every tool — and PERSISTED. No future tool can forget it.
//
// THE GUARD (the L-213 equality pattern): a layered wall created via the PLAN
// tool's payload and the SAME type created via the 3D tool's payload must produce
// IDENTICAL STORED RECORDS.
//
// This suite wires the PRODUCTION seam — `buildWallHandlerSet` with
// `buildSharedWallCatalogue()` (ADR-0116), backed by the geometry-wall singleton
// the type picker actually reads — so it exercises the real catalogue, not a
// fixture.
//
// Contracts: C11 §2/§3.2 (one element ⇒ one creation pipeline), C03 §2 (the schema
// record is canonical), ADR-0116 (one shared wall system-type catalogue).

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  CommandBus,
  PatchEmitter,
  UndoStack,
  attachStores,
  createId,
} from '@pryzm/plugin-sdk';
import { WallStore, buildWallHandlerSet, type WallsState } from '@pryzm/plugin-wall';
import { wallSystemTypeStore } from '@pryzm/geometry-wall';
import { buildSharedWallCatalogue } from '../src/PluginRegistry';

/** The layered interior partition the founder picks: plaster / stud / plaster. */
const LAYERED_TYPE_ID = 'wt-interior-partition';
/** Its total thickness: 0.012 + 0.076 + 0.012. */
const LAYERED_TOTAL = 0.1;
/** The placeholder a tool sends before the chokepoint resolves the real type. */
const TOOL_DEFAULT_THICKNESS = 0.2;

beforeEach(() => {
  (window as unknown as { wallSystemTypeStore: unknown }).wallSystemTypeStore = wallSystemTypeStore;
});

function buildEnv() {
  const store = new WallStore();
  const stores = { wall: store as unknown as import('@pryzm/stores').Store<object> };
  const emitter = new PatchEmitter();
  const bus = new CommandBus({
    audit: { actorId: 'test', projectId: 'p1', clientId: 't1' },
    emitter,
    undoStack: new UndoStack({ maxSize: 50 }),
    storesProvider: () => ({ wall: Object.fromEntries(store.getState()) as WallsState }),
  });
  // The REAL production adapter — the same catalogue the picker reads.
  for (const h of buildWallHandlerSet({ systemTypeStore: buildSharedWallCatalogue() })) {
    bus.register(h);
  }
  const detach = attachStores(emitter, stores);
  return { store, bus, detach };
}

/** Drop the per-wall unique id so two walls made by two different tools can be
 *  compared field-for-field. */
function comparable(w: unknown): Record<string, unknown> {
  const clone = JSON.parse(JSON.stringify(w)) as Record<string, unknown>;
  delete clone.id;
  return clone;
}

describe('§FIX-WALL-LAYERS-PLAN-VS-3D-CREATION — wall.create chokepoint (L-239 / L-211)', () => {
  let env: ReturnType<typeof buildEnv>;
  const userTypeIds: string[] = [];
  afterEach(() => {
    env?.detach();
    for (const id of userTypeIds.splice(0)) wallSystemTypeStore.remove(id);
  });

  it('PLAN payload: a layered type now PERSISTS layers[] on the instance (the bug)', async () => {
    env = buildEnv();
    const id = createId('wall');

    // Exactly what WallPlanToolHandler._commitWall dispatches — NO layers in the payload.
    await env.bus.executeCommand('wall.create', {
      id,
      levelId: 'lvl_test',
      baseLine: [{ x: 0, y: 0, z: 0 }, { x: 4, y: 0, z: 0 }],
      height: 2.7,
      thickness: TOOL_DEFAULT_THICKNESS,
      systemTypeId: LAYERED_TYPE_ID,
    });

    const wall = env.store.get(id)!;
    expect(wall).toBeDefined();
    // THE DEFECT: this used to be `undefined` — thickness right, layers absent.
    expect(wall.layers).toBeDefined();
    expect(wall.layers).toHaveLength(3);
    expect(wall.layers!.map((l) => l.function)).toEqual([
      'finish-interior', 'structure', 'finish-exterior',
    ]);
    // The shipped §WALL-TYPE-THICKNESS behaviour still holds.
    expect(wall.thickness).toBeCloseTo(LAYERED_TOTAL, 6);
    expect(wall.systemTypeId).toBe(LAYERED_TYPE_ID);
  });

  it('PLAN and 3D produce IDENTICAL stored records for the same type (the L-213 guard)', async () => {
    env = buildEnv();
    const planId = createId('wall');
    const threeDId = createId('wall');
    const geometry = {
      levelId: 'lvl_test',
      baseLine: [{ x: 0, y: 0, z: 0 }, { x: 4, y: 0, z: 0 }],
      height: 2.7,
      systemTypeId: LAYERED_TYPE_ID,
    };

    // PLAN tool — resolves the picked type's thickness locally (the L-41 fallback)…
    await env.bus.executeCommand('wall.create', {
      id: planId, ...geometry, thickness: LAYERED_TOTAL,
    });
    // …3D tool — sends its own default and trusts the command (WallTool §03-1.3:
    // "thickness is overridden by the command if a systemTypeId is set").
    await env.bus.executeCommand('wall.create', {
      id: threeDId, ...geometry, thickness: TOOL_DEFAULT_THICKNESS,
    });

    const planWall = env.store.get(planId)!;
    const threeDWall = env.store.get(threeDId)!;

    // The whole point: two creation paths, ONE record.
    expect(comparable(planWall)).toEqual(comparable(threeDWall));
    expect(planWall.layers).toEqual(threeDWall.layers);
    expect(planWall.layers).toHaveLength(3);
    expect(planWall.thickness).toBe(threeDWall.thickness);
  });

  it('BATCH / AI-generated walls inherit layers from systemTypeId too', async () => {
    env = buildEnv();
    const a = createId('wall');
    const b = createId('wall');

    // The apartment/house generators name a type and leave thickness + layers to the
    // pipeline. Before the fix, wall.batch.create resolved NEITHER.
    await env.bus.executeCommand('wall.batch.create', {
      levelId: 'lvl_test',
      walls: [
        { id: a, baseLine: [{ x: 0, y: 0, z: 0 }, { x: 4, y: 0, z: 0 }], systemTypeId: LAYERED_TYPE_ID },
        { id: b, baseLine: [{ x: 4, y: 0, z: 0 }, { x: 4, y: 0, z: 3 }], systemTypeId: LAYERED_TYPE_ID },
      ],
    });

    for (const id of [a, b]) {
      const w = env.store.get(id)!;
      expect(w.layers).toHaveLength(3);
      expect(w.thickness).toBeCloseTo(LAYERED_TOTAL, 6);
    }
  });

  it('a USER-defined layered type (picker "New Type…") reaches the instance as layers[]', async () => {
    env = buildEnv();
    const created = wallSystemTypeStore.add({
      name: 'L-239 Custom Layered 200mm',
      description: 'chokepoint test',
      layers: [
        { name: 'Skin',  thickness: 0.02, function: 'finish-exterior', materialColor: '#112233' },
        { name: 'Core',  thickness: 0.16, function: 'structure',       materialColor: '#445566' },
        { name: 'Board', thickness: 0.02, function: 'finish-interior', materialColor: '#778899' },
      ],
    });
    userTypeIds.push(created.id);

    const id = createId('wall');
    await env.bus.executeCommand('wall.create', {
      id,
      levelId: 'lvl_test',
      baseLine: [{ x: 0, y: 0, z: 0 }, { x: 4, y: 0, z: 0 }],
      thickness: TOOL_DEFAULT_THICKNESS,
      systemTypeId: created.id,
    });

    const w = env.store.get(id)!;
    expect(w.layers).toHaveLength(3);
    expect(w.layers![1]!.materialColor).toBe('#445566');
    expect(w.thickness).toBeCloseTo(0.2, 6);
  });

  it('an EXPLICIT layer stack is never clobbered by the catalogue (§RESI-FACADE-INTERIOR-WHITE)', async () => {
    env = buildEnv();
    const id = createId('wall');

    // The residential generator supplies a CUSTOMISED stack — façade colour outside,
    // white inside. The chokepoint must not overwrite it with the type's defaults.
    const custom = [
      { name: 'Render', function: 'finish-exterior', thickness: 0.02, materialColor: '#8899aa' },
      { name: 'Block',  function: 'structure',       thickness: 0.15, materialColor: '#a0a0a0' },
      { name: 'Paint',  function: 'finish-interior', thickness: 0.01, materialColor: '#ffffff' },
    ];
    await env.bus.executeCommand('wall.create', {
      id,
      levelId: 'lvl_test',
      baseLine: [{ x: 0, y: 0, z: 0 }, { x: 4, y: 0, z: 0 }],
      systemTypeId: LAYERED_TYPE_ID,
      layers: custom,
    });

    const w = env.store.get(id)!;
    expect(w.layers).toEqual(custom);
    expect(w.layers![0]!.materialColor).toBe('#8899aa');
  });

  it('an unknown / stale systemTypeId NEVER rejects the wall — it stores unlayered (ADR-0116)', async () => {
    env = buildEnv();
    const id = createId('wall');

    await env.bus.executeCommand('wall.create', {
      id,
      levelId: 'lvl_test',
      baseLine: [{ x: 0, y: 0, z: 0 }, { x: 4, y: 0, z: 0 }],
      thickness: TOOL_DEFAULT_THICKNESS,
      systemTypeId: 'wt-does-not-exist',
    });

    const w = env.store.get(id)!;
    expect(w).toBeDefined();                          // not rejected
    expect(w.layers).toBeUndefined();                 // nothing invented
    expect(w.thickness).toBe(TOOL_DEFAULT_THICKNESS); // caller's value stands
  });

  it('re-resolving a committed wall is a FIXED POINT (idempotency — the P4 backfill guarantee)', async () => {
    env = buildEnv();
    const first = createId('wall');
    const second = createId('wall');

    await env.bus.executeCommand('wall.create', {
      id: first,
      levelId: 'lvl_test',
      baseLine: [{ x: 0, y: 0, z: 0 }, { x: 4, y: 0, z: 0 }],
      thickness: TOOL_DEFAULT_THICKNESS,
      systemTypeId: LAYERED_TYPE_ID,
    });
    const committed = env.store.get(first)!;

    // Feed the COMMITTED wall's own resolved fields straight back in — a backfill
    // re-run must produce byte-identical layers, never a doubled/rewritten stack.
    await env.bus.executeCommand('wall.create', {
      id: second,
      levelId: 'lvl_test',
      baseLine: [{ x: 0, y: 0, z: 0 }, { x: 4, y: 0, z: 0 }],
      thickness: committed.thickness,
      systemTypeId: committed.systemTypeId,
      layers: committed.layers,
    });

    expect(env.store.get(second)!.layers).toEqual(committed.layers);
    expect(env.store.get(second)!.thickness).toBe(committed.thickness);
  });

  it('the layer stack is DEEP-CLONED — editing the type later cannot retro-mutate a committed wall', async () => {
    env = buildEnv();
    const id = createId('wall');
    await env.bus.executeCommand('wall.create', {
      id,
      levelId: 'lvl_test',
      baseLine: [{ x: 0, y: 0, z: 0 }, { x: 4, y: 0, z: 0 }],
      systemTypeId: LAYERED_TYPE_ID,
    });

    const catalogue = wallSystemTypeStore.getById(LAYERED_TYPE_ID)!;
    const w = env.store.get(id)!;
    // Same values, different objects — Contract §01 §2.2 "frozen snapshot at execution time".
    expect(w.layers![0]).not.toBe(catalogue.layers[0]);
    expect(w.layers![0]!.name).toBe(catalogue.layers[0]!.name);
  });
});
