// Plumbing handler smoke suite (S26 / ADR-0026).

import { afterEach, describe, expect, it } from 'vitest';
import { CommandBus, PatchEmitter, UndoStack, type EventRecord } from '@pryzm/plugin-sdk';
import { attachStores } from '@pryzm/plugin-sdk';
import { createId } from '@pryzm/plugin-sdk';
import { PlumbingStore, type PlumbingData, type PlumbingsState } from '../src/store.js';
import {
  buildPlumbingHandlerSet,
  registerPlumbingHandlers,
  PLUMBING_HANDLER_TYPES,
} from '../src/handlers/index.js';

function buildEnv() {
  const plumbing = new PlumbingStore();
  const stores = { plumbing: plumbing as unknown as import('@pryzm/stores').Store<object> };
  const emitter = new PatchEmitter();
  const undoStack = new UndoStack({ maxSize: 50 });
  const bus = new CommandBus({
    audit: { actorId: 'test', projectId: 'p1', clientId: 't1' },
    emitter,
    undoStack,
    storesProvider: () => ({
      plumbing: Object.fromEntries(plumbing.getState()) as PlumbingsState,
    }),
  });
  for (const h of buildPlumbingHandlerSet()) bus.register(h);
  const detach = attachStores(emitter, stores);
  return { plumbing, bus, detach };
}

function snap(s: PlumbingStore): Record<string, PlumbingData> {
  return JSON.parse(JSON.stringify(Object.fromEntries(s.getState())));
}

function undoLast(s: PlumbingStore, ev: EventRecord<unknown>): void {
  s.applyPatch([...ev.inverse].reverse());
}

describe('plumbing handler registration', () => {
  it('registerPlumbingHandlers wires all 4 command types', () => {
    const env = buildEnv();
    const bus = new CommandBus({
      audit: { actorId: 'test', projectId: 'p1', clientId: 't1' },
      storesProvider: () => ({ plumbing: {} }),
    });
    const types = registerPlumbingHandlers(bus);
    expect([...types].sort()).toEqual([...PLUMBING_HANDLER_TYPES].sort());
    env.detach();
  });
});

describe('plumbing.create / move / delete', () => {
  let env: ReturnType<typeof buildEnv>;
  afterEach(() => env?.detach());

  it('creates a straight pipe with defaults and inverts', async () => {
    env = buildEnv();
    const id = createId('plumbing');
    const before = snap(env.plumbing);
    const ev = await env.bus.executeCommand('plumbing.create', {
      id, kind: 'straight', diameter: 0.05, length: 1.5,
    }) as EventRecord<unknown>;
    expect(env.plumbing.get(id)).toBeDefined();
    expect(env.plumbing.get(id)!.length).toBeCloseTo(1.5);
    undoLast(env.plumbing, ev);
    expect(snap(env.plumbing)).toEqual(before);
  });

  it('rejects non-positive diameter at validation', async () => {
    env = buildEnv();
    await expect(env.bus.executeCommand('plumbing.create', { diameter: 0 })).rejects.toThrow();
  });

  it('moves and deletes', async () => {
    env = buildEnv();
    const id = createId('plumbing');
    await env.bus.executeCommand('plumbing.create', { id });
    await env.bus.executeCommand('plumbing.move', {
      plumbingId: id, delta: { x: 1, y: 0.5, z: -0.2 },
    });
    const p = env.plumbing.get(id)!;
    expect(p.origin.x).toBeCloseTo(1);
    expect(p.origin.y).toBeCloseTo(0.5);
    await env.bus.executeCommand('plumbing.delete', { plumbingId: id });
    expect(env.plumbing.get(id)).toBeUndefined();
  });
});

describe('plumbing.setSystem', () => {
  let env: ReturnType<typeof buildEnv>;
  afterEach(() => env?.detach());

  it('changes the system tag and inverts', async () => {
    env = buildEnv();
    const id = createId('plumbing');
    await env.bus.executeCommand('plumbing.create', { id });
    expect(env.plumbing.get(id)!.systemTag).toBe('cold-water');
    const ev = await env.bus.executeCommand('plumbing.setSystem', {
      plumbingId: id, systemTag: 'hot-water',
    }) as EventRecord<unknown>;
    expect(env.plumbing.get(id)!.systemTag).toBe('hot-water');
    undoLast(env.plumbing, ev);
    expect(env.plumbing.get(id)!.systemTag).toBe('cold-water');
  });

  it('rejects empty systemTag', async () => {
    env = buildEnv();
    const id = createId('plumbing');
    await env.bus.executeCommand('plumbing.create', { id });
    await expect(
      env.bus.executeCommand('plumbing.setSystem', { plumbingId: id, systemTag: '' }),
    ).rejects.toThrow();
  });
});
