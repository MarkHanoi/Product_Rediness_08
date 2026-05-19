// Window handler end-to-end test suite (S11-T2).

import { afterEach, describe, expect, it } from 'vitest';
import {
  CommandBus,
  PatchEmitter,
  UndoStack,
  type EventRecord,
} from '@pryzm/plugin-sdk';
import { attachStores } from '@pryzm/plugin-sdk';
import { createId } from '@pryzm/plugin-sdk';
import {
  WindowStore,
  type WindowData,
  type WindowsState,
} from '../src/store.js';
import {
  buildWindowHandlerSet,
  registerWindowHandlers,
  WINDOW_HANDLER_TYPES,
} from '../src/handlers/index.js';
import { BUILTIN_WINDOW_TYPES } from '@pryzm/plugin-sdk';

function buildEnv() {
  const window = new WindowStore();
  const stores = { window: window as unknown as import('@pryzm/stores').Store<object> };
  const emitter = new PatchEmitter();
  const undoStack = new UndoStack({ maxSize: 50 });
  const bus = new CommandBus({
    audit: { actorId: 'test', projectId: 'p1', clientId: 't1' },
    emitter,
    undoStack,
    storesProvider: () => ({
      window: Object.fromEntries(window.getState()) as WindowsState,
    }),
  });
  for (const h of buildWindowHandlerSet()) bus.register(h);
  const detach = attachStores(emitter, stores);
  return { window, bus, emitter, undoStack, detach };
}

function snap(store: WindowStore): Record<string, WindowData> {
  return JSON.parse(JSON.stringify(Object.fromEntries(store.getState())));
}

function undoLast(store: WindowStore, ev: EventRecord<unknown>): void {
  store.applyPatch([...ev.inverse].reverse());
}

describe('window handler registration', () => {
  it('registerWindowHandlers wires all 5 command types', () => {
    const env = buildEnv();
    const bus = new CommandBus({
      audit: { actorId: 'test', projectId: 'p1', clientId: 't1' },
      storesProvider: () => ({ window: {} }),
    });
    const types = registerWindowHandlers(bus);
    expect([...types].sort()).toEqual([...WINDOW_HANDLER_TYPES].sort());
    for (const t of WINDOW_HANDLER_TYPES) expect(bus.has(t)).toBe(true);
    env.detach();
  });
});

describe('window.create', () => {
  let env: ReturnType<typeof buildEnv>;
  afterEach(() => env?.detach());

  it('creates a window with caller-provided id and round-trips on undo', async () => {
    env = buildEnv();
    const id = createId('window');
    const wallId = createId('wall');
    const before = snap(env.window);
    const ev = await env.bus.executeCommand('window.create', {
      id, wallId, openingId: 'op_1', offset: 1.0,
    });
    expect(env.window.size()).toBe(1);
    expect(env.window.get(id)?.wallId).toBe(wallId);
    undoLast(env.window, ev);
    expect(snap(env.window)).toEqual(before);
  });

  it('applies type defaults from systemTypeId', async () => {
    env = buildEnv();
    const id = createId('window');
    await env.bus.executeCommand('window.create', {
      id,
      wallId: createId('wall'),
      openingId: 'op_x',
      systemTypeId: BUILTIN_WINDOW_TYPES[1]!.id, // picture window
    });
    const created = env.window.get(id)!;
    expect(created.width).toBe(BUILTIN_WINDOW_TYPES[1]!.width);
    expect(created.frameColor).toBe(BUILTIN_WINDOW_TYPES[1]!.frameColor);
  });

  it('rejects unknown systemTypeId via canExecute', async () => {
    env = buildEnv();
    await expect(
      env.bus.executeCommand('window.create', {
        wallId: createId('wall'),
        openingId: 'op_y',
        systemTypeId: 'window.does.not.exist',
      }),
    ).rejects.toThrow(/not found/i);
  });

  it('rejects frameWidth*2 > width via the schema refine', async () => {
    env = buildEnv();
    await expect(
      env.bus.executeCommand('window.create', {
        wallId: createId('wall'),
        openingId: 'op_z',
        width: 0.05,
        frameWidth: 0.1,
      }),
    ).rejects.toThrow();
  });
});

describe('window.delete', () => {
  let env: ReturnType<typeof buildEnv>;
  afterEach(() => env?.detach());

  it('removes a window and round-trips on undo', async () => {
    env = buildEnv();
    const id = createId('window');
    await env.bus.executeCommand('window.create', {
      id, wallId: createId('wall'), openingId: 'op_1',
    });
    const before = snap(env.window);
    const ev = await env.bus.executeCommand('window.delete', { windowId: id });
    expect(env.window.get(id)).toBeUndefined();
    undoLast(env.window, ev);
    expect(snap(env.window)).toEqual(before);
  });

  it('rejects unknown windowId', async () => {
    env = buildEnv();
    await expect(
      env.bus.executeCommand('window.delete', { windowId: 'window_nope' }),
    ).rejects.toThrow(/not found/i);
  });
});

describe('window.move', () => {
  let env: ReturnType<typeof buildEnv>;
  afterEach(() => env?.detach());

  it('updates offset and round-trips on undo', async () => {
    env = buildEnv();
    const id = createId('window');
    await env.bus.executeCommand('window.create', {
      id, wallId: createId('wall'), openingId: 'op_1', offset: 1.0,
    });
    const before = snap(env.window);
    const ev = await env.bus.executeCommand('window.move', {
      windowId: id, offset: 2.5,
    });
    expect(env.window.get(id)?.offset).toBe(2.5);
    undoLast(env.window, ev);
    expect(snap(env.window)).toEqual(before);
  });

  it('rejects negative offset', async () => {
    env = buildEnv();
    const id = createId('window');
    await env.bus.executeCommand('window.create', {
      id, wallId: createId('wall'), openingId: 'op_1',
    });
    await expect(
      env.bus.executeCommand('window.move', { windowId: id, offset: -1 }),
    ).rejects.toThrow();
  });
});

describe('window.setType', () => {
  let env: ReturnType<typeof buildEnv>;
  afterEach(() => env?.detach());

  it('reapplies catalogue defaults and round-trips on undo', async () => {
    env = buildEnv();
    const id = createId('window');
    await env.bus.executeCommand('window.create', {
      id, wallId: createId('wall'), openingId: 'op_1',
      systemTypeId: BUILTIN_WINDOW_TYPES[0]!.id,
    });
    const before = snap(env.window);
    const target = BUILTIN_WINDOW_TYPES[1]!;
    const ev = await env.bus.executeCommand('window.setType', {
      windowId: id, systemTypeId: target.id,
    });
    expect(env.window.get(id)?.width).toBe(target.width);
    undoLast(env.window, ev);
    expect(snap(env.window)).toEqual(before);
  });

  it('rejects unknown type', async () => {
    env = buildEnv();
    const id = createId('window');
    await env.bus.executeCommand('window.create', {
      id, wallId: createId('wall'), openingId: 'op_1',
    });
    await expect(
      env.bus.executeCommand('window.setType', {
        windowId: id, systemTypeId: 'window.no.such',
      }),
    ).rejects.toThrow(/not found/i);
  });
});

describe('window.setSize', () => {
  let env: ReturnType<typeof buildEnv>;
  afterEach(() => env?.detach());

  it('updates width and height and round-trips on undo', async () => {
    env = buildEnv();
    const id = createId('window');
    await env.bus.executeCommand('window.create', {
      id, wallId: createId('wall'), openingId: 'op_1',
    });
    const before = snap(env.window);
    const ev = await env.bus.executeCommand('window.setSize', {
      windowId: id, width: 1.6, height: 1.5,
    });
    expect(env.window.get(id)?.width).toBe(1.6);
    expect(env.window.get(id)?.height).toBe(1.5);
    undoLast(env.window, ev);
    expect(snap(env.window)).toEqual(before);
  });

  it('rejects width <= 2 * frameWidth', async () => {
    env = buildEnv();
    const id = createId('window');
    await env.bus.executeCommand('window.create', {
      id, wallId: createId('wall'), openingId: 'op_1',
      frameWidth: 0.1,
    });
    await expect(
      env.bus.executeCommand('window.setSize', { windowId: id, width: 0.15 }),
    ).rejects.toThrow();
  });

  it('requires at least one of width / height', async () => {
    env = buildEnv();
    const id = createId('window');
    await env.bus.executeCommand('window.create', {
      id, wallId: createId('wall'), openingId: 'op_1',
    });
    await expect(
      env.bus.executeCommand('window.setSize', { windowId: id }),
    ).rejects.toThrow();
  });
});
