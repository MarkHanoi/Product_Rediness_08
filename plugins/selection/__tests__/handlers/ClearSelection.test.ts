// ClearSelectionHandler — 1 happy + 1 error case (S16-T7).
//
// "Error" for clear is unusual — the handler always validates true.
// We exercise the edge case where the selection is empty (no-op clear)
// and verify the bus still records an event without throwing.

import { describe, expect, it } from 'vitest';
import {
  CommandBus,
  PatchEmitter,
  UndoStack,
} from '@pryzm/plugin-sdk';
import { SelectionStore } from '@pryzm/plugin-sdk';
import { ClearSelectionHandler } from '../../src/handlers/ClearSelection.js';

function buildEnv() {
  const selection = new SelectionStore();
  const bus = new CommandBus({
    audit: { actorId: 'test', projectId: 'p1', clientId: 't1' },
    emitter: new PatchEmitter(),
    undoStack: new UndoStack({ maxSize: 50 }),
    storesProvider: () => ({ selection }),
  });
  bus.register(new ClearSelectionHandler());
  const exec = (payload: unknown) => bus.executeCommand('selection.clear', payload);
  return { selection, exec };
}

describe('ClearSelectionHandler (S16-T7)', () => {
  it('happy: clear with non-empty selection empties the store', async () => {
    const { selection, exec } = buildEnv();
    selection.select([
      { id: 'a', kind: 'wall' },
      { id: 'b', kind: 'door' },
    ]);
    await exec({});
    expect(selection.ids()).toEqual([]);
  });

  it('edge: clear when selection is already empty is a no-op (no throw)', async () => {
    const { selection, exec } = buildEnv();
    expect(selection.ids()).toEqual([]);
    await expect(exec({})).resolves.toBeDefined();
    expect(selection.ids()).toEqual([]);
  });
});
