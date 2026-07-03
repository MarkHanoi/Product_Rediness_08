// @vitest-environment happy-dom
//
// §FIX-WALL-TYPE-UNIFY-CATALOGUE (L-50, ADR-0116) — end-to-end proof that the
// authoritative wall.create handler validates against, and derives thickness
// from, the SAME catalogue the type picker reads.
//
// Before this fix there were TWO divergent wall-type catalogues:
//   • plugins/wall/src/system-type-store.ts (the plugin store) — seeded FRESH by
//     PluginRegistry and consumed by the composeRuntime-registered CreateWall
//     handler. Its wt-monolithic body was 0.1 m.
//   • packages/geometry-wall/src/WallSystemTypeStore.ts (the geometry-wall
//     singleton = window.wallSystemTypeStore) — read by the type picker, the
//     plan-view create path, and the 3D thickness/layers stamping. Its
//     wt-monolithic body was 1.0 m; it also carried a DIFFERENT set of built-ins
//     and every user-defined type.
// The handler therefore resolved thickness against a store the user never saw
// (L-41 mechanism), and user-/picker-defined types were invisible to it.
//
// This suite wires the plugin handler set with the PRODUCTION shared-catalogue
// adapter (PluginRegistry.buildSharedWallCatalogue, backed by the geometry-wall
// singleton) and proves:
//   • a picker built-in resolves to the SHARED catalogue's thickness,
//   • a user-defined type added through the picker's store reaches the handler,
//   • a picker-only / unknown id is NOT rejected by canExecute (batch-safe).

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

// The adapter reads window.wallSystemTypeStore lazily (as it does in production,
// where initBuilders assigns it). Point it at the geometry-wall singleton — the
// SAME instance the type picker reads — so this suite exercises the real seam.
beforeEach(() => {
  (window as unknown as { wallSystemTypeStore: unknown }).wallSystemTypeStore = wallSystemTypeStore;
});

function buildEnv() {
  const store = new WallStore();
  const stores = { wall: store as unknown as import('@pryzm/stores').Store<object> };
  const emitter = new PatchEmitter();
  const undoStack = new UndoStack({ maxSize: 50 });
  const bus = new CommandBus({
    audit: { actorId: 'test', projectId: 'p1', clientId: 't1' },
    emitter,
    undoStack,
    storesProvider: () => ({
      wall: Object.fromEntries(store.getState()) as WallsState,
    }),
  });
  // The REAL production adapter — the SAME instance-backed catalogue the picker reads.
  for (const h of buildWallHandlerSet({ systemTypeStore: buildSharedWallCatalogue() })) {
    bus.register(h);
  }
  const detach = attachStores(emitter, stores);
  return { store, bus, detach };
}

describe('§FIX-WALL-TYPE-UNIFY-CATALOGUE (L-50) — one catalogue, picker == handler', () => {
  let env: ReturnType<typeof buildEnv>;
  const userTypeIds: string[] = [];
  afterEach(() => {
    env?.detach();
    // Keep the shared singleton clean for other suites in this worker.
    for (const id of userTypeIds.splice(0)) wallSystemTypeStore.remove(id);
  });

  it('a picker built-in type creates a wall at the SHARED catalogue thickness (not the old plugin 0.1 m default)', async () => {
    env = buildEnv();
    // The geometry-wall (picker) catalogue's wt-monolithic body is 1.0 m.
    const expected = wallSystemTypeStore.getById('wt-monolithic')!.totalThickness;
    expect(expected).toBe(1.0);
    const id = createId('wall');
    await env.bus.executeCommand('wall.create', {
      id,
      levelId: 'lvl_test',
      baseLine: [{ x: 0, y: 0, z: 0 }, { x: 3, y: 0, z: 0 }],
      systemTypeId: 'wt-monolithic',
    });
    expect(env.store.get(id)?.thickness).toBe(expected);
    expect(env.store.get(id)?.systemTypeId).toBe('wt-monolithic');
  });

  it('a USER-defined type added through the picker store reaches the handler and sets its thickness', async () => {
    env = buildEnv();
    // Simulate the picker's "New Type…" flow — it adds to the geometry-wall singleton.
    const created = wallSystemTypeStore.add({
      name: 'L-50 Custom 330mm',
      description: 'unification test',
      layers: [{ name: 'Body', thickness: 0.33, function: 'structure', materialColor: '#abcabc' }],
    });
    userTypeIds.push(created.id);
    expect(created.totalThickness).toBeCloseTo(0.33, 6);

    const id = createId('wall');
    await env.bus.executeCommand('wall.create', {
      id,
      levelId: 'lvl_test',
      baseLine: [{ x: 0, y: 0, z: 0 }, { x: 3, y: 0, z: 0 }],
      systemTypeId: created.id,
    });
    // The handler resolved thickness from the SAME store the picker wrote to.
    expect(env.store.get(id)?.thickness).toBeCloseTo(0.33, 6);
    expect(env.store.get(id)?.systemTypeId).toBe(created.id);
  });

  it('a picker-only / unknown systemTypeId is NOT rejected by canExecute (protects wall.batch.create)', async () => {
    env = buildEnv();
    const id = createId('wall');
    // Unknown id — permissive has() must let it through; thickness falls back to the explicit value.
    await env.bus.executeCommand('wall.create', {
      id,
      levelId: 'lvl_test',
      baseLine: [{ x: 0, y: 0, z: 0 }, { x: 3, y: 0, z: 0 }],
      thickness: 0.2,
      systemTypeId: 'wt-does-not-exist-yet',
    });
    expect(env.store.size()).toBe(1);
    expect(env.store.get(id)?.thickness).toBe(0.2);
  });
});
