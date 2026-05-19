// SelectSelectionHandler — 1 happy + 1 error case (S16-T7).

import { describe, expect, it } from 'vitest';
import {
  CommandBus,
  PatchEmitter,
  UndoStack,
} from '@pryzm/plugin-sdk';
import { SelectionStore } from '@pryzm/plugin-sdk';
import { SelectSelectionHandler } from '../../src/handlers/Select.js';

function buildEnv() {
  const selection = new SelectionStore();
  const bus = new CommandBus({
    audit: { actorId: 'test', projectId: 'p1', clientId: 't1' },
    emitter: new PatchEmitter(),
    undoStack: new UndoStack({ maxSize: 50 }),
    // Selection handlers receive the STORE INSTANCE directly (not a
    // POJO state map) — they mutate the store in place because
    // selection mutations are ephemeral and bypass produceCommand.
    storesProvider: () => ({ selection }),
  });
  bus.register(new SelectSelectionHandler());
  const exec = (payload: unknown) => bus.executeCommand('selection.select', payload);
  return { selection, bus, exec };
}

describe('SelectSelectionHandler (S16-T7)', () => {
  it('happy: select two ids replaces empty selection', async () => {
    const { selection, exec } = buildEnv();
    await exec({
      targets: [
        { id: 'wall-1', kind: 'wall' },
        { id: 'door-1', kind: 'door' },
      ],
    });
    expect(selection.ids().sort()).toEqual(['door-1', 'wall-1']);
    expect(selection.isSelected('wall-1')).toBe(true);
  });

  it('error: targets[0].id empty → CommandBusError, store unchanged', async () => {
    const { selection, exec } = buildEnv();
    selection.select([{ id: 'pre-existing', kind: 'wall' }]);
    await expect(
      exec({ targets: [{ id: '', kind: 'wall' }] }),
    ).rejects.toThrow();
    // Store untouched.
    expect(selection.ids()).toEqual(['pre-existing']);
  });
});
