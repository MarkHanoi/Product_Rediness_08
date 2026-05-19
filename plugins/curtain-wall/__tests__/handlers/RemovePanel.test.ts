// RemovePanelHandler tests — S13-T1.

import { afterEach, describe, expect, it } from 'vitest';
import { CommandBus, PatchEmitter, UndoStack, type EventRecord } from '@pryzm/plugin-sdk';
import { attachStores } from '@pryzm/plugin-sdk';
import { createId } from '@pryzm/plugin-sdk';
import {
  CurtainWallStore,
  type CurtainWallData,
  type CurtainWallsState,
} from '../../src/store.js';
import { buildCurtainWallHandlerSet } from '../../src/handlers/index.js';

function buildEnv() {
  const cw = new CurtainWallStore();
  const stores = { curtainwall: cw as unknown as import('@pryzm/stores').Store<object> };
  const emitter = new PatchEmitter();
  const undoStack = new UndoStack({ maxSize: 50 });
  const bus = new CommandBus({
    audit: { actorId: 'test', projectId: 'p1', clientId: 't1' },
    emitter, undoStack,
    storesProvider: () => ({ curtainwall: Object.fromEntries(cw.getState()) as CurtainWallsState }),
  });
  for (const h of buildCurtainWallHandlerSet()) bus.register(h);
  const detach = attachStores(emitter, stores);
  return { cw, bus, detach };
}

function snap(s: CurtainWallStore): Record<string, CurtainWallData> {
  return JSON.parse(JSON.stringify(Object.fromEntries(s.getState())));
}
function undoLast(s: CurtainWallStore, ev: EventRecord<unknown>): void {
  s.applyPatch([...ev.inverse].reverse());
}

const A = { x: 0, y: 0, z: 0 };
const B = { x: 6, y: 0, z: 0 };

describe('curtainwall.removePanel', () => {
  let env: ReturnType<typeof buildEnv>;
  afterEach(() => env?.detach());

  it('removes the panel and inverts cleanly', async () => {
    env = buildEnv();
    const id = createId('curtainwall');
    await env.bus.executeCommand('curtainwall.create', {
      id, baseLine: [A, B], height: 3, bayWidth: 1.5, bayHeight: 1.5,
    });
    await env.bus.executeCommand('curtainwall.addPanel', {
      curtainWallId: id, row: 0, col: 1, panelId: 'P1', kind: 'spandrel',
    });
    const before = snap(env.cw);
    const ev = await env.bus.executeCommand('curtainwall.removePanel', {
      curtainWallId: id, panelId: 'P1',
    });
    expect(env.cw.get(id)!.panels).toHaveLength(0);
    undoLast(env.cw, ev);
    expect(snap(env.cw)).toEqual(before);
  });

  it('rejects an unknown panel id', async () => {
    env = buildEnv();
    const id = createId('curtainwall');
    await env.bus.executeCommand('curtainwall.create', {
      id, baseLine: [A, B], height: 3, bayWidth: 1.5, bayHeight: 1.5,
    });
    await expect(
      env.bus.executeCommand('curtainwall.removePanel', {
        curtainWallId: id, panelId: 'does-not-exist',
      }),
    ).rejects.toThrow();
  });
});
