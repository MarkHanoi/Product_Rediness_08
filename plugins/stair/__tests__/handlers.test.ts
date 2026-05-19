// Stair handler smoke suite (S14-T3).

import { afterEach, describe, expect, it } from 'vitest';
import {
  CommandBus, PatchEmitter, UndoStack, type EventRecord,
} from '@pryzm/plugin-sdk';
import { attachStores } from '@pryzm/plugin-sdk';
import { createId } from '@pryzm/plugin-sdk';
import { StairStore, type StairsState, type StairData } from '../src/store.js';
import {
  buildStairHandlerSet,
  registerStairHandlers,
  STAIR_HANDLER_TYPES,
} from '../src/handlers/index.js';

function buildEnv() {
  const stair = new StairStore();
  const stores = { stair: stair as unknown as import('@pryzm/stores').Store<object> };
  const emitter = new PatchEmitter();
  const undoStack = new UndoStack({ maxSize: 50 });
  const bus = new CommandBus({
    audit: { actorId: 'test', projectId: 'p1', clientId: 't1' },
    emitter,
    undoStack,
    storesProvider: () => ({
      stair: Object.fromEntries(stair.getState()) as StairsState,
    }),
  });
  for (const h of buildStairHandlerSet()) bus.register(h);
  const detach = attachStores(emitter, stores);
  return { stair, bus, emitter, undoStack, detach };
}

function snap(store: StairStore): Record<string, StairData> {
  return JSON.parse(JSON.stringify(Object.fromEntries(store.getState())));
}

function undoLast(store: StairStore, ev: EventRecord<unknown>): void {
  store.applyPatch([...ev.inverse].reverse());
}

describe('stair handler registration', () => {
  it('registers all 9 command types', () => {
    const env = buildEnv();
    const bus = new CommandBus({
      audit: { actorId: 't', projectId: 'p', clientId: 'c' },
      storesProvider: () => ({ stair: {} }),
    });
    const types = registerStairHandlers(bus);
    expect([...types].sort()).toEqual([...STAIR_HANDLER_TYPES].sort());
    for (const t of STAIR_HANDLER_TYPES) expect(bus.has(t)).toBe(true);
    env.detach();
  });
});

describe('stair.create / delete', () => {
  let env: ReturnType<typeof buildEnv>;
  afterEach(() => env?.detach());

  it('creates a stair with caller-provided id and inverts cleanly', async () => {
    env = buildEnv();
    const id = createId('stair');
    const before = snap(env.stair);
    const ev = await env.bus.executeCommand('stair.create', {
      id, levelId: 'level:0', topLevelId: 'level:1',
    });
    expect(env.stair.get(id)?.shape).toBe('straight');
    expect(env.stair.get(id)?.numRisers).toBe(15);
    undoLast(env.stair, ev);
    expect(snap(env.stair)).toEqual(before);
  });

  it('rejects invalid numRisers (< 2)', async () => {
    env = buildEnv();
    await expect(
      env.bus.executeCommand('stair.create', { id: createId('stair'), numRisers: 1 }),
    ).rejects.toThrow();
  });

  it('delete rejects unknown id', async () => {
    env = buildEnv();
    await expect(
      env.bus.executeCommand('stair.delete', { stairId: 'stair:missing' }),
    ).rejects.toThrow();
  });
});

describe('stair.move', () => {
  let env: ReturnType<typeof buildEnv>;
  afterEach(() => env?.detach());

  it('translates origin and undoes', async () => {
    env = buildEnv();
    const id = createId('stair');
    await env.bus.executeCommand('stair.create', { id });
    const ev = await env.bus.executeCommand('stair.move', {
      stairId: id, delta: { x: 1, y: 0, z: 2 },
    });
    expect(env.stair.get(id)?.origin).toEqual({ x: 1, y: 0, z: 2 });
    undoLast(env.stair, ev);
    expect(env.stair.get(id)?.origin).toEqual({ x: 0, y: 0, z: 0 });
  });
});

describe('stair.setShape / setTreadCount / setRiserHeight / setWidth / rotate', () => {
  let env: ReturnType<typeof buildEnv>;
  afterEach(() => env?.detach());

  it('round-trips each setter', async () => {
    env = buildEnv();
    const id = createId('stair');
    await env.bus.executeCommand('stair.create', { id });
    await env.bus.executeCommand('stair.setShape', { stairId: id, shape: 'l-shape' });
    await env.bus.executeCommand('stair.setTreadCount', { stairId: id, numRisers: 18 });
    await env.bus.executeCommand('stair.setRiserHeight', { stairId: id, riserHeight: 0.20 });
    await env.bus.executeCommand('stair.setWidth', { stairId: id, width: 1.3 });
    await env.bus.executeCommand('stair.rotate', { stairId: id, rotation: Math.PI / 4 });
    const dto = env.stair.get(id) as StairData;
    expect(dto.shape).toBe('l-shape');
    expect(dto.numRisers).toBe(18);
    expect(dto.riserHeight).toBeCloseTo(0.20);
    expect(dto.width).toBeCloseTo(1.3);
    expect(dto.rotation).toBeCloseTo(Math.PI / 4);
  });

  it('rejects setTreadCount < 2', async () => {
    env = buildEnv();
    const id = createId('stair');
    await env.bus.executeCommand('stair.create', { id });
    await expect(
      env.bus.executeCommand('stair.setTreadCount', { stairId: id, numRisers: 1 }),
    ).rejects.toThrow();
  });

  it('setType updates materialId', async () => {
    env = buildEnv();
    const id = createId('stair');
    await env.bus.executeCommand('stair.create', { id });
    await env.bus.executeCommand('stair.setType', { stairId: id, materialId: 'concrete.precast' });
    expect(env.stair.get(id)?.materialId).toBe('concrete.precast');
  });
});
