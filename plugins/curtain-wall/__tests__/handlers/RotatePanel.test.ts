// RotatePanelHandler tests — S13-T1.

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

async function seedWithPanel(env: ReturnType<typeof buildEnv>): Promise<{ id: string; panelId: string }> {
  const id = createId('curtainwall');
  await env.bus.executeCommand('curtainwall.create', {
    id, baseLine: [A, B], height: 3, bayWidth: 1.5, bayHeight: 1.5,
  });
  await env.bus.executeCommand('curtainwall.addPanel', {
    curtainWallId: id, row: 0, col: 0, panelId: 'P1', kind: 'door',
  });
  return { id, panelId: 'P1' };
}

describe('curtainwall.rotatePanel', () => {
  let env: ReturnType<typeof buildEnv>;
  afterEach(() => env?.detach());

  it('sets an absolute rotation', async () => {
    env = buildEnv();
    const { id, panelId } = await seedWithPanel(env);
    await env.bus.executeCommand('curtainwall.rotatePanel', {
      curtainWallId: id, panelId, rotation: 90,
    });
    expect(env.cw.get(id)!.panels[0]!.rotation).toBe(90);
  });

  it('applies a delta rotation and wraps modulo 360', async () => {
    env = buildEnv();
    const { id, panelId } = await seedWithPanel(env);
    await env.bus.executeCommand('curtainwall.rotatePanel', {
      curtainWallId: id, panelId, deltaDeg: 270,
    });
    expect(env.cw.get(id)!.panels[0]!.rotation).toBe(270);
    await env.bus.executeCommand('curtainwall.rotatePanel', {
      curtainWallId: id, panelId, deltaDeg: 180,
    });
    expect(env.cw.get(id)!.panels[0]!.rotation).toBe(90);
  });

  it('rejects when both rotation and deltaDeg are provided', async () => {
    env = buildEnv();
    const { id, panelId } = await seedWithPanel(env);
    await expect(
      env.bus.executeCommand('curtainwall.rotatePanel', {
        curtainWallId: id, panelId, rotation: 90, deltaDeg: 90,
      }),
    ).rejects.toThrow();
  });

  it('rejects an invalid rotation value', async () => {
    env = buildEnv();
    const { id, panelId } = await seedWithPanel(env);
    await expect(
      env.bus.executeCommand('curtainwall.rotatePanel', {
        curtainWallId: id, panelId, rotation: 45,
      }),
    ).rejects.toThrow();
  });

  it('rejects deltaDeg that is not a multiple of 90', async () => {
    env = buildEnv();
    const { id, panelId } = await seedWithPanel(env);
    await expect(
      env.bus.executeCommand('curtainwall.rotatePanel', {
        curtainWallId: id, panelId, deltaDeg: 17,
      }),
    ).rejects.toThrow();
  });
});
