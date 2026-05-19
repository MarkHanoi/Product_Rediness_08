// DeselectSelectionHandler — 1 happy + 1 error case (S16-T7).

import { describe, expect, it } from 'vitest';
import {
  CommandBus,
  PatchEmitter,
  UndoStack,
} from '@pryzm/plugin-sdk';
import { SelectionStore } from '@pryzm/plugin-sdk';
import { DeselectSelectionHandler } from '../../src/handlers/Deselect.js';

function buildEnv() {
  const selection = new SelectionStore();
  const bus = new CommandBus({
    audit: { actorId: 'test', projectId: 'p1', clientId: 't1' },
    emitter: new PatchEmitter(),
    undoStack: new UndoStack({ maxSize: 50 }),
    storesProvider: () => ({ selection }),
  });
  bus.register(new DeselectSelectionHandler());
  const exec = (payload: unknown) => bus.executeCommand('selection.deselect', payload);
  return { selection, exec };
}

describe('DeselectSelectionHandler (S16-T7)', () => {
  it('happy: deselect removes only listed ids', async () => {
    const { selection, exec } = buildEnv();
    selection.select([
      { id: 'a', kind: 'wall' },
      { id: 'b', kind: 'door' },
      { id: 'c', kind: 'window' },
    ]);
    await exec({ ids: ['b'] });
    expect(selection.ids().sort()).toEqual(['a', 'c']);
  });

  it('error: ids must be array', async () => {
    const { selection, exec } = buildEnv();
    selection.select([{ id: 'a', kind: 'wall' }]);
    await expect(exec({ ids: 'not-an-array' })).rejects.toThrow();
    expect(selection.ids()).toEqual(['a']);
  });
});
