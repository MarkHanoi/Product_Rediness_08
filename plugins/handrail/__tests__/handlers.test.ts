// Handrail handler smoke suite (S14-T6).

import { afterEach, describe, expect, it } from 'vitest';
import {
  CommandBus, PatchEmitter, UndoStack, type EventRecord,
} from '@pryzm/plugin-sdk';
import { attachStores } from '@pryzm/plugin-sdk';
import { createId } from '@pryzm/plugin-sdk';
import { HandrailStore, type HandrailsState, type HandrailData } from '../src/store.js';
import {
  buildHandrailHandlerSet,
  registerHandrailHandlers,
  HANDRAIL_HANDLER_TYPES,
} from '../src/handlers/index.js';

function buildEnv() {
  const handrail = new HandrailStore();
  const stores = { handrail: handrail as unknown as import('@pryzm/stores').Store<object> };
  const emitter = new PatchEmitter();
  const undoStack = new UndoStack({ maxSize: 50 });
  const bus = new CommandBus({
    audit: { actorId: 'test', projectId: 'p1', clientId: 't1' },
    emitter, undoStack,
    storesProvider: () => ({
      handrail: Object.fromEntries(handrail.getState()) as HandrailsState,
    }),
  });
  for (const h of buildHandrailHandlerSet()) bus.register(h);
  const detach = attachStores(emitter, stores);
  return { handrail, bus, emitter, undoStack, detach };
}

function snap(store: HandrailStore): Record<string, HandrailData> {
  return JSON.parse(JSON.stringify(Object.fromEntries(store.getState())));
}
function undoLast(store: HandrailStore, ev: EventRecord<unknown>): void {
  store.applyPatch([...ev.inverse].reverse());
}

describe('handrail handler registration', () => {
  it('registers all 6 command types', () => {
    const bus = new CommandBus({
      audit: { actorId: 't', projectId: 'p', clientId: 'c' },
      storesProvider: () => ({ handrail: {} }),
    });
    const types = registerHandrailHandlers(bus);
    expect([...types].sort()).toEqual([...HANDRAIL_HANDLER_TYPES].sort());
  });
});

describe('handrail.create / delete', () => {
  let env: ReturnType<typeof buildEnv>;
  afterEach(() => env?.detach());

  it('inserts default rail and undoes', async () => {
    env = buildEnv();
    const id = createId('handrail');
    const before = snap(env.handrail);
    const ev = await env.bus.executeCommand('handrail.create', { id, levelId: 'level:0' });
    const dto = env.handrail.get(id) as HandrailData;
    expect(dto.shape).toBe('round');
    expect(dto.path.length).toBe(2);
    undoLast(env.handrail, ev);
    expect(snap(env.handrail)).toEqual(before);
  });

  it('rejects coincident endpoints', async () => {
    env = buildEnv();
    await expect(env.bus.executeCommand('handrail.create', {
      id: createId('handrail'),
      path: [{ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }],
    })).rejects.toThrow();
  });
});

describe('handrail.setPath / setShape / setHost / recompute', () => {
  let env: ReturnType<typeof buildEnv>;
  afterEach(() => env?.detach());

  it('round-trips each setter', async () => {
    env = buildEnv();
    const id = createId('handrail');
    await env.bus.executeCommand('handrail.create', { id });
    await env.bus.executeCommand('handrail.setPath', {
      handrailId: id,
      path: [{ x: 0, y: 0, z: 0 }, { x: 1, y: 1, z: 0 }, { x: 2, y: 1, z: 0 }],
    });
    await env.bus.executeCommand('handrail.setShape', { handrailId: id, shape: 'square' });
    await env.bus.executeCommand('handrail.setHost', { handrailId: id, hostId: 'stair:foo' });
    const dto = env.handrail.get(id) as HandrailData;
    expect(dto.shape).toBe('square');
    expect(dto.path.length).toBe(3);
    expect(dto.hostId).toBe('stair:foo');

    await env.bus.executeCommand('handrail.recompute', {
      handrailId: id,
      path: [{ x: 5, y: 0, z: 0 }, { x: 6, y: 0, z: 0 }],
      cause: 'cascade:test',
    });
    expect(env.handrail.get(id)!.path[0]!.x).toBe(5);
  });
});
