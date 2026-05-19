// Ceiling handler smoke suite (S14-T8).

import { afterEach, describe, expect, it } from 'vitest';
import {
  CommandBus, PatchEmitter, UndoStack, type EventRecord,
} from '@pryzm/plugin-sdk';
import { attachStores } from '@pryzm/plugin-sdk';
import { createId } from '@pryzm/plugin-sdk';
import { CeilingStore, type CeilingsState, type CeilingData } from '../src/store.js';
import {
  buildCeilingHandlerSet,
  registerCeilingHandlers,
  CEILING_HANDLER_TYPES,
} from '../src/handlers/index.js';

function buildEnv() {
  const ceiling = new CeilingStore();
  const stores = { ceiling: ceiling as unknown as import('@pryzm/stores').Store<object> };
  const emitter = new PatchEmitter();
  const undoStack = new UndoStack({ maxSize: 50 });
  const bus = new CommandBus({
    audit: { actorId: 'test', projectId: 'p1', clientId: 't1' },
    emitter, undoStack,
    storesProvider: () => ({
      ceiling: Object.fromEntries(ceiling.getState()) as CeilingsState,
    }),
  });
  for (const h of buildCeilingHandlerSet()) bus.register(h);
  const detach = attachStores(emitter, stores);
  return { ceiling, bus, emitter, undoStack, detach };
}
function snap(s: CeilingStore): Record<string, CeilingData> {
  return JSON.parse(JSON.stringify(Object.fromEntries(s.getState())));
}
function undoLast(s: CeilingStore, ev: EventRecord<unknown>): void {
  s.applyPatch([...ev.inverse].reverse());
}

const RECT = [
  { x: 0, y: 0, z: 0 }, { x: 4, y: 0, z: 0 },
  { x: 4, y: 0, z: 3 }, { x: 0, y: 0, z: 3 },
];

describe('ceiling handler registration', () => {
  it('registers all 4 command types', () => {
    const bus = new CommandBus({
      audit: { actorId: 't', projectId: 'p', clientId: 'c' },
      storesProvider: () => ({ ceiling: {} }),
    });
    const types = registerCeilingHandlers(bus);
    expect([...types].sort()).toEqual([...CEILING_HANDLER_TYPES].sort());
  });
});

describe('ceiling.create / delete', () => {
  let env: ReturnType<typeof buildEnv>;
  afterEach(() => env?.detach());

  it('creates a default rect ceiling and undoes', async () => {
    env = buildEnv();
    const id = createId('ceiling');
    const before = snap(env.ceiling);
    const ev = await env.bus.executeCommand('ceiling.create', { id, boundary: RECT });
    const dto = env.ceiling.get(id) as CeilingData;
    expect(dto.boundary.length).toBe(4);
    expect(dto.ceilingHeight).toBeCloseTo(2.7);
    undoLast(env.ceiling, ev);
    expect(snap(env.ceiling)).toEqual(before);
  });

  it('rejects boundary < 3 points', async () => {
    env = buildEnv();
    await expect(env.bus.executeCommand('ceiling.create', {
      id: createId('ceiling'),
      boundary: [{ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }],
    })).rejects.toThrow();
  });

  it('rejects thickness >= ceilingHeight', async () => {
    env = buildEnv();
    await expect(env.bus.executeCommand('ceiling.create', {
      id: createId('ceiling'),
      boundary: RECT, ceilingHeight: 0.05, thickness: 0.05,
    })).rejects.toThrow();
  });
});

describe('ceiling.setBoundary / setHeight', () => {
  let env: ReturnType<typeof buildEnv>;
  afterEach(() => env?.detach());

  it('updates boundary + ceilingHeight', async () => {
    env = buildEnv();
    const id = createId('ceiling');
    await env.bus.executeCommand('ceiling.create', { id, boundary: RECT });
    const NEW = [...RECT, { x: -1, y: 0, z: 1.5 }];
    await env.bus.executeCommand('ceiling.setBoundary', { ceilingId: id, boundary: NEW });
    expect(env.ceiling.get(id)!.boundary.length).toBe(5);
    await env.bus.executeCommand('ceiling.setHeight', { ceilingId: id, ceilingHeight: 3.2 });
    expect(env.ceiling.get(id)!.ceilingHeight).toBeCloseTo(3.2);
  });

  it('setHeight rejects ceilingHeight <= thickness', async () => {
    env = buildEnv();
    const id = createId('ceiling');
    await env.bus.executeCommand('ceiling.create', { id, boundary: RECT });
    await expect(env.bus.executeCommand('ceiling.setHeight', {
      ceilingId: id, ceilingHeight: 0.04,
    })).rejects.toThrow();
  });
});
