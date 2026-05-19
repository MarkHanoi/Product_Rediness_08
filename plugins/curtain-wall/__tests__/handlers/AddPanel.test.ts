// AddPanelHandler tests — S13-T1.

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

describe('curtainwall.addPanel — happy path', () => {
  let env: ReturnType<typeof buildEnv>;
  afterEach(() => env?.detach());

  it('adds a panel at (0,0) and inverts cleanly', async () => {
    env = buildEnv();
    const id = createId('curtainwall');
    await env.bus.executeCommand('curtainwall.create', {
      id, baseLine: [A, B], height: 3, bayWidth: 1.5, bayHeight: 1.5,
    });
    const before = snap(env.cw);
    const ev = await env.bus.executeCommand('curtainwall.addPanel', {
      curtainWallId: id, row: 0, col: 0, kind: 'spandrel',
    });
    const cw = env.cw.get(id)!;
    expect(cw.panels).toHaveLength(1);
    expect(cw.panels[0]!.kind).toBe('spandrel');
    expect(cw.panels[0]!.row).toBe(0);
    expect(cw.panels[0]!.col).toBe(0);
    undoLast(env.cw, ev);
    expect(snap(env.cw)).toEqual(before);
  });

  it('mints a panel id when one is not provided', async () => {
    env = buildEnv();
    const id = createId('curtainwall');
    await env.bus.executeCommand('curtainwall.create', {
      id, baseLine: [A, B], height: 3, bayWidth: 1.5, bayHeight: 1.5,
    });
    await env.bus.executeCommand('curtainwall.addPanel', {
      curtainWallId: id, row: 1, col: 2,
    });
    expect(env.cw.get(id)!.panels[0]!.id).toMatch(/^panel_[0-9A-HJKMNP-TV-Z]{26}$/);
  });

  it('honours an explicit panel id', async () => {
    env = buildEnv();
    const id = createId('curtainwall');
    await env.bus.executeCommand('curtainwall.create', {
      id, baseLine: [A, B], height: 3, bayWidth: 1.5, bayHeight: 1.5,
    });
    await env.bus.executeCommand('curtainwall.addPanel', {
      curtainWallId: id, row: 0, col: 1, panelId: 'my-panel',
    });
    expect(env.cw.get(id)!.panels[0]!.id).toBe('my-panel');
  });
});

describe('curtainwall.addPanel — error paths', () => {
  let env: ReturnType<typeof buildEnv>;
  afterEach(() => env?.detach());

  it('rejects an out-of-grid cell', async () => {
    env = buildEnv();
    const id = createId('curtainwall');
    await env.bus.executeCommand('curtainwall.create', {
      id, baseLine: [A, B], height: 3, bayWidth: 1.5, bayHeight: 1.5,
    });
    await expect(
      env.bus.executeCommand('curtainwall.addPanel', { curtainWallId: id, row: 0, col: 5 }),
    ).rejects.toThrow();
  });

  it('rejects overlap with an existing panel', async () => {
    env = buildEnv();
    const id = createId('curtainwall');
    await env.bus.executeCommand('curtainwall.create', {
      id, baseLine: [A, B], height: 3, bayWidth: 1.5, bayHeight: 1.5,
    });
    await env.bus.executeCommand('curtainwall.addPanel', {
      curtainWallId: id, row: 0, col: 0,
    });
    await expect(
      env.bus.executeCommand('curtainwall.addPanel', { curtainWallId: id, row: 0, col: 0 }),
    ).rejects.toThrow();
  });

  it('rejects unknown curtain wall id', async () => {
    env = buildEnv();
    await expect(
      env.bus.executeCommand('curtainwall.addPanel', { curtainWallId: 'nope', row: 0, col: 0 }),
    ).rejects.toThrow();
  });
});
