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
  CreateWindowHandler,
  type CreateWindowPayload,
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

/**
 * §FIX-CREATE-LIVENESS-LIE (BIM20 C5/C6, Wave 4) — seed a window WITHOUT dispatching
 * `window.create`.
 *
 * That verb now REFUSES: the CA-21 executed read-back caught it reporting success
 * while the authoritative `windowStore` (the store `ProjectSerializer` reads) did not
 * change. Tests that used it merely as a SEED would otherwise be testing the refusal
 * instead of the verb under test, and a seed failure must never be reported as a
 * verdict about a different verb.
 *
 * `CreateWindowHandler.execute` is still a correct plugin-store mutation for a host
 * that binds the authoritative store under this key. Seeding through it deliberately
 * does NOT go through the bus — the bus is where the refusal lives. Bypassing a
 * refusal in production code would be the defect; bypassing it to build a fixture is
 * the reason `execute()` was kept intact.
 */
function seedWindow(env: ReturnType<typeof buildEnv>, payload: CreateWindowPayload): void {
  const ctx = {
    stores: { window: Object.fromEntries(env.window.getState()) as WindowsState },
  } as unknown as Parameters<CreateWindowHandler['execute']>[0];
  const res = new CreateWindowHandler().execute(ctx, payload);
  env.window.applyPatch([...res.forward]);
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

  it('window.create REFUSES, names wall.createOpening, and mutates nothing', async () => {
    // §FIX-CREATE-LIVENESS-LIE (BIM20 C5/C6, Wave 4) — this used to assert the PLUGIN
    // DTO store gained a window, and passed while the user's model gained nothing:
    // the CA-21 executed read-back dispatched this verb against the real composed
    // runtime and found the AUTHORITATIVE windowStore unchanged. What is pinned now
    // is the REFUSAL, that it names the real creation path, and the ABSENCE of any
    // mutation. An assertion about the wrong store reads as proof and is worse than
    // no assertion at all.
    env = buildEnv();
    const before = snap(env.window);
    await expect(
      env.bus.executeCommand('window.create', {
        id: createId('window'), wallId: createId('wall'), openingId: 'op_1', offset: 1.0,
      }),
    ).rejects.toThrow(/wall\.createOpening/);
    expect(env.window.size()).toBe(0);
    expect(snap(env.window)).toEqual(before);
  });

  it('the retained execute() still applies type defaults from systemTypeId', () => {
    // The refusal lives in canExecute; execute() is kept intact for a host that binds
    // the authoritative store under this key. This pins that retained logic, and says
    // plainly that it is NOT a claim about the bus verb.
    env = buildEnv();
    const id = createId('window');
    seedWindow(env, {
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
    seedWindow(env, {
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

  it('refuses a well-formed payload, names window.setOffset, and mutates nothing', async () => {
    env = buildEnv();
    const id = createId('window');
    seedWindow(env, {
      id, wallId: createId('wall'), openingId: 'op_1', offset: 1.0,
    });
    const before = snap(env.window);
    // §FIX-DEAD-MOVE-VERB-REFUSE (W3-4) — this used to assert the PLUGIN DTO store
    // mutated, and passed while the user's model never changed: in production the bus
    // binds the DETACHED plugin store here, no renderer/exporter/persistence path reads
    // it, and NO surface dispatches `window.move`. Moving a window commits through `window.setOffset`.
    // What is pinned is now the REFUSAL, its reason, and the ABSENCE of any mutation —
    // an assertion about the wrong store is worse than none, because it reads as proof.
    // `execute()` is deliberately left intact for a host that binds the authoritative
    // store under this key; `canExecute` is the gate the bus honours.
    await expect(
      env.bus.executeCommand('window.move', { windowId: id, offset: 2.5 }),
    ).rejects.toThrow(/window\.setOffset/);
    expect(snap(env.window)).toEqual(before);
  });

  it('rejects negative offset', async () => {
    env = buildEnv();
    const id = createId('window');
    seedWindow(env, {
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
    seedWindow(env, {
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
    seedWindow(env, {
      id, wallId: createId('wall'), openingId: 'op_1',
    });
    await expect(
      env.bus.executeCommand('window.setType', {
        windowId: id, systemTypeId: 'window.no.such',
      }),
    ).rejects.toThrow(/not found/i);
  });
});

describe('window.setSize / window.setSillHeight — RETIRED from this plugin (§FIX-DIMS-REACH-RECORD, L-815)', () => {
  let env: ReturnType<typeof buildEnv>;
  afterEach(() => env?.detach());

  // The plugin handlers wrote the DETACHED plugin window store — accepted,
  // logged, rendered nothing, persisted nothing in production. The verbs are
  // now owned by same-name legacy bridges in apps/editor initBusHandlers
  // routing through UpdateElementParameterCommand → the geometry wallStore.
  // This pin asserts the plugin no longer claims them: registering the plugin
  // set must leave the verbs UNHANDLED on a bare bus (the production bus gets
  // them from the bridge registrations, which CommandBus would reject as
  // duplicates if these handlers ever returned).
  it('the plugin handler set no longer registers the dimension verbs', async () => {
    env = buildEnv();
    const id = createId('window');
    seedWindow(env, {
      id, wallId: createId('wall'), openingId: 'op_1',
    });
    await expect(
      env.bus.executeCommand('window.setSize', { windowId: id, width: 1.6, height: 1.5 }),
    ).rejects.toThrow(/no handler/i);
    await expect(
      env.bus.executeCommand('window.setSillHeight', { windowId: id, sillHeight: 1 }),
    ).rejects.toThrow(/no handler/i);
  });
});
