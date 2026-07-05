// @vitest-environment happy-dom
//
// §FIX-FURNISH-BATCH-PERF (L-100) — before/after micro-measurement.
//
// Measures the SAME furniture set created two ways against the real plugin
// CommandBus + FurnitureStore:
//   BEFORE — N separate `furniture.create` commands (the old furnish path). Each
//            dispatch runs its own `produceCommand`, whose Immer snapshot is
//            O(current store size) → the whole furnish is O(N²).
//   AFTER  — ONE `furniture.batch.create` (the new path) → one `produceCommand`
//            over one Immer draft → O(N).
//
// The HARD assertion is STRUCTURAL, not timing (CI machines vary): the N
// single-creates push N undo-stack entries (N produceCommands), the ONE batch
// pushes exactly 1 (one produceCommand) — that is the O(N²)→O(N) win. The
// wall-clock is LOGGED so the ratio is visible in the run output.

import { describe, expect, it } from 'vitest';
import { CommandBus, PatchEmitter, UndoStack } from '@pryzm/plugin-sdk';
import { attachStores } from '@pryzm/plugin-sdk';
import { createId } from '@pryzm/plugin-sdk';
import { FurnitureStore, type FurnituresState } from '../src/store.js';
import { buildFurnitureHandlerSet } from '../src/handlers/index.js';

function buildEnv() {
  const furniture = new FurnitureStore();
  const stores = { furniture: furniture as unknown as import('@pryzm/stores').Store<object> };
  const emitter = new PatchEmitter();
  const undoStack = new UndoStack({ maxSize: 5000 });
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
  return { furniture, bus, undoStack, detach };
}

function itemsFor(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    id: createId('furniture'),
    furnitureType: 'sofa_3seat',
    position: { x: i, y: 0, z: (i % 40) * 0.5 },
    width: 2, length: 0.9, height: 0.8, rotation: 0,
    levelId: 'level-1',
  }));
}

describe('furnish batch perf (§FIX-FURNISH-BATCH-PERF, L-100)', () => {
  it('one batch command matches N single-creates and is not slower', async () => {
    const N = 300; // ~ a fully-furnished multi-apartment floor

    // BEFORE — N single-create commands.
    const a = buildEnv();
    const single = itemsFor(N);
    const t0 = performance.now();
    for (const it of single) await a.bus.executeCommand('furniture.create', it);
    const beforeMs = performance.now() - t0;
    const beforeCount = a.furniture.ids().length;
    const beforeUndoDepth = a.undoStack.size;
    a.detach();

    // AFTER — one batch command.
    const b = buildEnv();
    const batch = itemsFor(N);
    const t1 = performance.now();
    await b.bus.executeCommand('furniture.batch.create', { furniture: batch, levelId: 'level-1' });
    const afterMs = performance.now() - t1;
    const afterCount = b.furniture.ids().length;
    const afterUndoDepth = b.undoStack.size;
    b.detach();

    const speedup = beforeMs / Math.max(afterMs, 0.001);
    // eslint-disable-next-line no-console
    console.log(
      `[furnish-perf] N=${N}  single(${beforeUndoDepth} cmds)=${beforeMs.toFixed(1)}ms  ` +
      `batch(${afterUndoDepth} cmd)=${afterMs.toFixed(1)}ms  speedup=${speedup.toFixed(1)}x`,
    );

    // Same result set — both paths create all N items.
    expect(afterCount).toBe(N);
    expect(beforeCount).toBe(N);

    // STRUCTURAL win (deterministic, not timing): N single-creates = N
    // produceCommands = N undo entries; the batch = exactly ONE. This is the
    // O(N²)→O(N) collapse §FIX-FURNISH-BATCH-PERF delivers.
    expect(beforeUndoDepth).toBe(N);
    expect(afterUndoDepth).toBe(1);
  });
});
