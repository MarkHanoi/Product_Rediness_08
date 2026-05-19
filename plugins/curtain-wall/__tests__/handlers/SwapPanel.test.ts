// SwapPanelHandler tests — S13-T1.

import { afterEach, describe, expect, it } from 'vitest';
import { CommandBus, PatchEmitter, UndoStack } from '@pryzm/plugin-sdk';
import { attachStores } from '@pryzm/plugin-sdk';
import { createId } from '@pryzm/plugin-sdk';
import {
  CurtainWallStore,
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

const A = { x: 0, y: 0, z: 0 };
const B = { x: 6, y: 0, z: 0 };

describe('curtainwall.swapPanel', () => {
  let env: ReturnType<typeof buildEnv>;
  afterEach(() => env?.detach());

  it('swaps kind in place and preserves the panel id', async () => {
    env = buildEnv();
    const id = createId('curtainwall');
    await env.bus.executeCommand('curtainwall.create', {
      id, baseLine: [A, B], height: 3, bayWidth: 1.5, bayHeight: 1.5,
    });
    await env.bus.executeCommand('curtainwall.addPanel', {
      curtainWallId: id, row: 0, col: 0, panelId: 'P1', kind: 'glazed',
    });
    await env.bus.executeCommand('curtainwall.swapPanel', {
      curtainWallId: id, panelId: 'P1', kind: 'spandrel',
    });
    const p = env.cw.get(id)!.panels[0]!;
    expect(p.id).toBe('P1');
    expect(p.kind).toBe('spandrel');
  });

  it('swaps materialId in place', async () => {
    env = buildEnv();
    const id = createId('curtainwall');
    await env.bus.executeCommand('curtainwall.create', {
      id, baseLine: [A, B], height: 3, bayWidth: 1.5, bayHeight: 1.5,
    });
    await env.bus.executeCommand('curtainwall.addPanel', {
      curtainWallId: id, row: 0, col: 0, panelId: 'P1', kind: 'glazed',
    });
    await env.bus.executeCommand('curtainwall.swapPanel', {
      curtainWallId: id, panelId: 'P1', materialId: 'panel.glass.lowE',
    });
    expect(env.cw.get(id)!.panels[0]!.materialId).toBe('panel.glass.lowE');
  });

  it('rejects when no field would actually change', async () => {
    env = buildEnv();
    const id = createId('curtainwall');
    await env.bus.executeCommand('curtainwall.create', {
      id, baseLine: [A, B], height: 3, bayWidth: 1.5, bayHeight: 1.5,
    });
    await env.bus.executeCommand('curtainwall.addPanel', {
      curtainWallId: id, row: 0, col: 0, panelId: 'P1', kind: 'glazed',
    });
    await expect(
      env.bus.executeCommand('curtainwall.swapPanel', { curtainWallId: id, panelId: 'P1' }),
    ).rejects.toThrow();
  });
});
