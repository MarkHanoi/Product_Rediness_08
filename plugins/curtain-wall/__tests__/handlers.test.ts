// Curtain-wall handler smoke suite (S12-T5).

import { afterEach, describe, expect, it } from 'vitest';
import { CommandBus, PatchEmitter, UndoStack, type EventRecord } from '@pryzm/plugin-sdk';
import { attachStores } from '@pryzm/plugin-sdk';
import { createId } from '@pryzm/plugin-sdk';
import { CurtainWallStore, type CurtainWallData, type CurtainWallsState } from '../src/store.js';
import {
  buildCurtainWallHandlerSet,
  registerCurtainWallHandlers,
  CURTAIN_WALL_HANDLER_TYPES,
} from '../src/handlers/index.js';

function buildEnv() {
  const cw = new CurtainWallStore();
  const stores = { curtainwall: cw as unknown as import('@pryzm/stores').Store<object> };
  const emitter = new PatchEmitter();
  const undoStack = new UndoStack({ maxSize: 50 });
  const bus = new CommandBus({
    audit: { actorId: 'test', projectId: 'p1', clientId: 't1' },
    emitter,
    undoStack,
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

describe('curtain-wall handler registration', () => {
  it('registers all 13 command types (9 from S12 + 4 from S13)', () => {
    const env = buildEnv();
    const bus = new CommandBus({
      audit: { actorId: 'test', projectId: 'p1', clientId: 't1' },
      storesProvider: () => ({ curtainwall: {} }),
    });
    const types = registerCurtainWallHandlers(bus);
    expect([...types].sort()).toEqual([...CURTAIN_WALL_HANDLER_TYPES].sort());
    env.detach();
  });
});

describe('curtainwall.create / delete / move', () => {
  let env: ReturnType<typeof buildEnv>;
  afterEach(() => env?.detach());

  it('creates with caller id and inverts', async () => {
    env = buildEnv();
    const id = createId('curtainwall');
    const before = snap(env.cw);
    const ev = await env.bus.executeCommand('curtainwall.create', { id, baseLine: [A, B], height: 4 });
    expect(env.cw.get(id)?.height).toBe(4);
    undoLast(env.cw, ev);
    expect(snap(env.cw)).toEqual(before);
  });

  it('rejects coincident endpoints', async () => {
    env = buildEnv();
    await expect(
      env.bus.executeCommand('curtainwall.create', { baseLine: [A, A] }),
    ).rejects.toThrow();
  });

  it('move translates both endpoints', async () => {
    env = buildEnv();
    const id = createId('curtainwall');
    await env.bus.executeCommand('curtainwall.create', { id, baseLine: [A, B] });
    const before = snap(env.cw);
    const ev = await env.bus.executeCommand('curtainwall.move', {
      curtainWallId: id, delta: { x: 1, y: 0, z: 1 },
    });
    expect(env.cw.get(id)?.baseLine[0]).toEqual({ x: 1, y: 0, z: 1 });
    undoLast(env.cw, ev);
    expect(snap(env.cw)).toEqual(before);
  });
});

describe('curtainwall.setGrid + setMullionType + setTransomType', () => {
  let env: ReturnType<typeof buildEnv>;
  afterEach(() => env?.detach());

  it('setGrid updates bay dims', async () => {
    env = buildEnv();
    const id = createId('curtainwall');
    await env.bus.executeCommand('curtainwall.create', { id, baseLine: [A, B] });
    await env.bus.executeCommand('curtainwall.setGrid', {
      curtainWallId: id, bayWidth: 1.5, bayHeight: 1.0,
    });
    const c = env.cw.get(id)!;
    expect(c.bayWidth).toBe(1.5);
    expect(c.bayHeight).toBe(1.0);
  });

  it('setGrid rejects with no fields', async () => {
    env = buildEnv();
    const id = createId('curtainwall');
    await env.bus.executeCommand('curtainwall.create', { id, baseLine: [A, B] });
    await expect(
      env.bus.executeCommand('curtainwall.setGrid', { curtainWallId: id }),
    ).rejects.toThrow();
  });

  it('setMullionType updates thickness + materialId', async () => {
    env = buildEnv();
    const id = createId('curtainwall');
    await env.bus.executeCommand('curtainwall.create', { id, baseLine: [A, B] });
    await env.bus.executeCommand('curtainwall.setMullionType', {
      curtainWallId: id, thickness: 0.08, systemTypeId: 'mullion.alu.50x80',
    });
    const c = env.cw.get(id)!;
    expect(c.mullionThickness).toBe(0.08);
    expect(c.materialId).toBe('mullion.alu.50x80');
  });

  it('setTransomType updates thickness (stub maps onto mullionThickness)', async () => {
    env = buildEnv();
    const id = createId('curtainwall');
    await env.bus.executeCommand('curtainwall.create', { id, baseLine: [A, B] });
    await env.bus.executeCommand('curtainwall.setTransomType', {
      curtainWallId: id, thickness: 0.06,
    });
    expect(env.cw.get(id)?.mullionThickness).toBe(0.06);
  });
});

describe('curtainwall.setPanelType', () => {
  let env: ReturnType<typeof buildEnv>;
  afterEach(() => env?.detach());

  it('upserts panel when not present and updates kind on subsequent call', async () => {
    env = buildEnv();
    const id = createId('curtainwall');
    await env.bus.executeCommand('curtainwall.create', { id, baseLine: [A, B] });
    await env.bus.executeCommand('curtainwall.setPanelType', {
      curtainWallId: id, panelId: 'p-0-0', kind: 'glazed', upsertAt: { row: 0, col: 0 },
    });
    expect(env.cw.get(id)?.panels.length).toBe(1);
    await env.bus.executeCommand('curtainwall.setPanelType', {
      curtainWallId: id, panelId: 'p-0-0', kind: 'spandrel',
    });
    expect(env.cw.get(id)?.panels[0]?.kind).toBe('spandrel');
  });

  it('rejects unknown panel without upsertAt', async () => {
    env = buildEnv();
    const id = createId('curtainwall');
    await env.bus.executeCommand('curtainwall.create', { id, baseLine: [A, B] });
    await expect(
      env.bus.executeCommand('curtainwall.setPanelType', {
        curtainWallId: id, panelId: 'p-1-1', kind: 'glazed',
      }),
    ).rejects.toThrow();
  });
});

describe('curtainwall.setOutline + resize', () => {
  let env: ReturnType<typeof buildEnv>;
  afterEach(() => env?.detach());

  it('setOutline replaces baseLine + height atomically', async () => {
    env = buildEnv();
    const id = createId('curtainwall');
    await env.bus.executeCommand('curtainwall.create', { id, baseLine: [A, B] });
    await env.bus.executeCommand('curtainwall.setOutline', {
      curtainWallId: id, baseLine: [{ x: 0, y: 0, z: 0 }, { x: 10, y: 0, z: 0 }], height: 4.5,
    });
    const c = env.cw.get(id)!;
    expect(c.baseLine[1]).toEqual({ x: 10, y: 0, z: 0 });
    expect(c.height).toBe(4.5);
  });

  it('resize scales baseLine length while preserving start + direction', async () => {
    env = buildEnv();
    const id = createId('curtainwall');
    await env.bus.executeCommand('curtainwall.create', {
      id, baseLine: [{ x: 0, y: 0, z: 0 }, { x: 6, y: 0, z: 0 }],
    });
    await env.bus.executeCommand('curtainwall.resize', { curtainWallId: id, length: 12 });
    const c = env.cw.get(id)!;
    expect(c.baseLine[0]).toEqual({ x: 0, y: 0, z: 0 });
    expect(c.baseLine[1]).toEqual({ x: 12, y: 0, z: 0 });
  });

  it('resize updates only height when length omitted', async () => {
    env = buildEnv();
    const id = createId('curtainwall');
    await env.bus.executeCommand('curtainwall.create', { id, baseLine: [A, B] });
    await env.bus.executeCommand('curtainwall.resize', { curtainWallId: id, height: 5 });
    expect(env.cw.get(id)?.height).toBe(5);
  });
});
