// @vitest-environment happy-dom
//
// (happy-dom, not node: `buildFurnitureHandlerSet` transitively imports
// `@pryzm/core-app-model`, whose index does `new ViewRenderCache()` at module
// load and touches `window.addEventListener` — a pre-existing condition that
// needs a DOM global. handlers.test.ts hits the same import.)
//
// §FIX-FURNISH-BATCH-PERF (L-100) — furniture.batch.create must create N items
// in ONE command (one produceCommand → one forward + one inverse patch → one
// undo-stack entry), instead of the N separate `furniture.create` commands the
// auto-furnish path used to dispatch (each an O(store) Immer snapshot → O(N²)).
//
// Standalone from handlers.test.ts so it does NOT import the catalogue seed
// (which transitively pulls a window-touching module) — this suite runs in the
// plain node env.

import { afterEach, describe, expect, it } from 'vitest';
import { CommandBus, PatchEmitter, UndoStack, type EventRecord } from '@pryzm/plugin-sdk';
import { attachStores } from '@pryzm/plugin-sdk';
import { createId } from '@pryzm/plugin-sdk';
import { FurnitureStore, type FurnitureData, type FurnituresState } from '../src/store.js';
import { buildFurnitureHandlerSet } from '../src/handlers/index.js';

function buildEnv() {
  const furniture = new FurnitureStore();
  const stores = { furniture: furniture as unknown as import('@pryzm/stores').Store<object> };
  const emitter = new PatchEmitter();
  const undoStack = new UndoStack({ maxSize: 50 });
  const bus = new CommandBus({
    audit: { actorId: 'test', projectId: 'p1', clientId: 't1' },
    emitter,
    undoStack,
    storesProvider: () => ({
      furniture: Object.fromEntries(furniture.getState()) as FurnituresState,
    }),
  });
  for (const h of buildFurnitureHandlerSet()) bus.register(h);
  const detach = attachStores(emitter, stores);
  return { furniture, bus, detach };
}

function snap(s: FurnitureStore): Record<string, FurnitureData> {
  return JSON.parse(JSON.stringify(Object.fromEntries(s.getState())));
}
function undoLast(s: FurnitureStore, ev: EventRecord<unknown>): void {
  s.applyPatch([...ev.inverse].reverse());
}

describe('furniture.batch.create (§FIX-FURNISH-BATCH-PERF, L-100)', () => {
  let env: ReturnType<typeof buildEnv>;
  afterEach(() => env?.detach());

  it('creates N items in ONE command and inverts them all in one undo', async () => {
    env = buildEnv();
    const before = snap(env.furniture);
    const ids = [createId('furniture'), createId('furniture'), createId('furniture')];
    // Legacy furnish-shaped entries (furnitureType + position), mirroring what
    // FurnishLayoutExecutor dispatches. The handler maps position → origin.
    const ev = await env.bus.executeCommand('furniture.batch.create', {
      levelId: 'level-1',
      furniture: ids.map((id, i) => ({
        id,
        furnitureType: 'sofa_3seat',
        position: { x: i, y: 0, z: i * 2 },
        width: 2, length: 0.9, height: 0.8,
        rotation: 0,
      })),
    }) as EventRecord<unknown>;

    for (const id of ids) {
      expect(env.furniture.get(id)).toBeDefined();
      expect(env.furniture.get(id)!.levelId).toBe('level-1');
    }
    // Legacy `position` mapped through to the PRYZM3 `origin`.
    expect(env.furniture.get(ids[2]!)!.origin.z).toBeCloseTo(4);
    // ONE undo entry reverts the whole batch.
    undoLast(env.furniture, ev);
    expect(snap(env.furniture)).toEqual(before);
  });

  it('applies the default levelId to entries that omit their own', async () => {
    env = buildEnv();
    const a = createId('furniture'); const b = createId('furniture');
    await env.bus.executeCommand('furniture.batch.create', {
      levelId: 'lvl-default',
      furniture: [
        { id: a, furnitureType: 'chair', position: { x: 0, y: 0, z: 0 } },
        { id: b, furnitureType: 'chair', position: { x: 1, y: 0, z: 0 }, levelId: 'lvl-override' },
      ],
    });
    expect(env.furniture.get(a)!.levelId).toBe('lvl-default');
    expect(env.furniture.get(b)!.levelId).toBe('lvl-override');
  });

  it('rejects an empty batch at validation', async () => {
    env = buildEnv();
    await expect(
      env.bus.executeCommand('furniture.batch.create', { furniture: [] }),
    ).rejects.toThrow();
  });

  it('rejects a batch entry with a non-finite position', async () => {
    env = buildEnv();
    await expect(
      env.bus.executeCommand('furniture.batch.create', {
        furniture: [{ furnitureType: 'x', position: { x: NaN, y: 0, z: 0 } }],
      }),
    ).rejects.toThrow();
  });
});
