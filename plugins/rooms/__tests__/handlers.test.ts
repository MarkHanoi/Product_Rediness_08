// Room handler smoke suite (S25).
//
// Mirrors `plugins/slab/__tests__/handlers.test.ts`.  Asserts the
// 8 handlers register, accept their happy-path payloads, and produce
// invertible patches.  Boundary-detection correctness is in
// `packages/geometry-kernel/__tests__/produceRoom.parity.test.ts`.

import { afterEach, describe, expect, it } from 'vitest';
import {
  CommandBus,
  PatchEmitter,
  UndoStack,
  type EventRecord,
} from '@pryzm/plugin-sdk';
import { attachStores } from '@pryzm/plugin-sdk';
import { createId } from '@pryzm/plugin-sdk';
import { RoomStore, type RoomData, type RoomsState } from '../src/store.js';
import {
  buildRoomHandlerSet,
  registerRoomHandlers,
  ROOM_HANDLER_TYPES,
} from '../src/handlers/index.js';

function buildEnv() {
  const room = new RoomStore();
  const stores = { room: room as unknown as import('@pryzm/stores').Store<object> };
  const emitter = new PatchEmitter();
  const undoStack = new UndoStack({ maxSize: 50 });
  const bus = new CommandBus({
    audit: { actorId: 'test', projectId: 'p1', clientId: 't1' },
    emitter,
    undoStack,
    storesProvider: () => ({
      room: Object.fromEntries(room.getState()) as RoomsState,
    }),
  });
  for (const h of buildRoomHandlerSet()) bus.register(h);
  const detach = attachStores(emitter, stores);
  return { room, bus, emitter, undoStack, detach };
}

function snap(store: RoomStore): Record<string, RoomData> {
  return JSON.parse(JSON.stringify(Object.fromEntries(store.getState())));
}

function undoLast(store: RoomStore, ev: EventRecord<unknown>): void {
  store.applyPatch([...ev.inverse].reverse());
}

describe('room handler registration', () => {
  it('registerRoomHandlers wires all 8 command types', () => {
    const env = buildEnv();
    const bus = new CommandBus({
      audit: { actorId: 'test', projectId: 'p1', clientId: 't1' },
      storesProvider: () => ({ room: {} }),
    });
    const types = registerRoomHandlers(bus);
    expect([...types].sort()).toEqual([...ROOM_HANDLER_TYPES].sort());
    for (const t of ROOM_HANDLER_TYPES) expect(bus.has(t)).toBe(true);
    env.detach();
  });
});

describe('room.create — round-trip', () => {
  let env: ReturnType<typeof buildEnv>;
  afterEach(() => env?.detach());

  it('creates a sketched-mode room with caller-provided id and inverts cleanly', async () => {
    env = buildEnv();
    const id = createId('room');
    const before = snap(env.room);
    const ev = await env.bus.executeCommand('room.create', {
      id,
      levelId: 'L1',
      name: 'Office 101',
      number: '101',
    });
    expect(env.room.size()).toBe(1);
    expect(env.room.get(id)?.name).toBe('Office 101');
    expect(env.room.get(id)?.boundaryMode).toBe('sketched');

    undoLast(env.room, ev);
    expect(snap(env.room)).toEqual(before);
  });

  it('creates a wallBound room with a seed point', async () => {
    env = buildEnv();
    const id = createId('room');
    await env.bus.executeCommand('room.create', {
      id,
      boundaryMode: 'wallBound',
      seedPoint: { x: 1, y: 0, z: 1 },
    });
    expect(env.room.get(id)?.boundaryMode).toBe('wallBound');
    expect(env.room.get(id)?.seedPoint).toEqual({ x: 1, y: 0, z: 1 });
  });

  it('rejects wallBound mode without a seed', async () => {
    env = buildEnv();
    await expect(
      env.bus.executeCommand('room.create', { boundaryMode: 'wallBound' }),
    ).rejects.toThrow();
  });

  it('rejects out-of-range heightOffset', async () => {
    env = buildEnv();
    await expect(
      env.bus.executeCommand('room.create', { heightOffset: 100 }),
    ).rejects.toThrow();
  });
});

describe('room.delete — legacy bridge', () => {
  // DeleteRoomHandler is now an F-1.x bridge (like RenameRoomHandler): it does
  // NOT mutate the plugin RoomsState; it forwards to the legacy DeleteRoomCommand
  // via window.commandManager (where the detected/rendered rooms actually live).
  let env: ReturnType<typeof buildEnv>;
  const g = globalThis as unknown as { window?: unknown };
  const savedWindow = g.window;
  afterEach(() => {
    env?.detach();
    if (savedWindow === undefined) delete g.window;
    else g.window = savedWindow;
  });

  it('bridges to the legacy DeleteRoomCommand via window.commandManager', async () => {
    env = buildEnv();
    const executed: Array<{ targetIds?: readonly string[] }> = [];
    g.window = {
      __pryzmInitComplete: true,
      commandManager: { execute: (c: unknown) => executed.push(c as { targetIds?: readonly string[] }) },
    };
    await env.bus.executeCommand('room.delete', { roomId: 'room_abc' });
    // The bridge mutates no plugin store…
    expect(env.room.size()).toBe(0);
    // …and forwarded exactly one DeleteRoomCommand targeting the room.
    expect(executed).toHaveLength(1);
    expect(executed[0]?.targetIds).toContain('room_abc');
  });

  it('no-ops (does not throw) before the engine is initialised', async () => {
    env = buildEnv();
    g.window = {
      __pryzmInitComplete: false,
      commandManager: { execute: () => { throw new Error('must not run pre-init'); } },
    };
    await expect(env.bus.executeCommand('room.delete', { roomId: 'room_x' })).resolves.toBeDefined();
  });

  it('rejects an empty roomId payload', async () => {
    env = buildEnv();
    g.window = { __pryzmInitComplete: true, commandManager: { execute: () => {} } };
    await expect(
      env.bus.executeCommand('room.delete', { roomId: '' }),
    ).rejects.toThrow();
  });
});

// §FIX-ROOM-SIBLING-HANDLERS-STORE (L-79) — room.move is a LEGACY BRIDGE (like
// room.setName / room.delete): it forwards an UpdateRoomBoundaryCommand through
// window.commandManager (translating the legacy room's boundary polygon read from
// window.roomStore) and declares affectedStores:[]. The previous
// affectedStores:['room'] mismatched the bus storeKey 'rooms' and threw
// "required store 'room' is missing from HandlerContext.stores".
describe('room.move — legacy bridge (§FIX-ROOM-SIBLING-HANDLERS-STORE, L-79)', () => {
  let env: ReturnType<typeof buildEnv>;
  const g = globalThis as unknown as { window?: unknown };
  const savedWindow = g.window;
  afterEach(() => {
    env?.detach();
    if (savedWindow === undefined) delete g.window;
    else g.window = savedWindow;
  });

  function busWithoutRoomStore() {
    const bus = new CommandBus({
      audit: { actorId: 'test', projectId: 'p1', clientId: 't1' },
      storesProvider: () => ({}),
    });
    for (const h of buildRoomHandlerSet()) bus.register(h);
    return bus;
  }

  it('does NOT throw the missing-store error and forwards a translated UpdateRoomBoundaryCommand', async () => {
    env = buildEnv();
    const bus = busWithoutRoomStore();
    const executed: Array<{ type?: string; targetIds?: readonly string[] }> = [];
    g.window = {
      __pryzmInitComplete: true,
      commandManager: { execute: (c: unknown) => executed.push(c as { type?: string }) },
      roomStore: {
        getById: () => ({
          boundary: {
            polygon: [
              { x: 0, z: 0 },
              { x: 2, z: 0 },
              { x: 2, z: 2 },
            ],
            height: 2.4,
            baseOffset: 0,
            detectionMethod: 'auto-topology',
          },
        }),
      },
    };
    await expect(
      bus.executeCommand('room.move', { roomId: 'room_abc', delta: { x: 10, y: 1, z: 5 } }),
    ).resolves.toBeDefined();
    expect(executed).toHaveLength(1);
    expect(executed[0]?.type).toBe('UPDATE_ROOM_BOUNDARY');
    expect(executed[0]?.targetIds).toContain('room_abc');
    // The plugin RoomsState is NOT mutated by the bridge.
    expect(env.room.size()).toBe(0);
  });

  it('no-ops (does not throw) before the engine is initialised', async () => {
    env = buildEnv();
    const bus = busWithoutRoomStore();
    g.window = {
      __pryzmInitComplete: false,
      commandManager: { execute: () => { throw new Error('must not run pre-init'); } },
    };
    await expect(
      bus.executeCommand('room.move', { roomId: 'room_x', delta: { x: 1, y: 0, z: 0 } }),
    ).resolves.toBeDefined();
  });
});

// §FIX-ROOM-SETNAME-STORE (L-75) — room.setName is a LEGACY BRIDGE (like
// room.rename / room.delete): the detected/rendered/persisted rooms live in the
// legacy room-topology RoomStore (window.roomStore), not the plugin RoomsState,
// so the handler forwards a RenameRoomCommand through window.commandManager and
// declares affectedStores:[] (no plugin-store injection required — the previous
// affectedStores:['room'] mismatched the bus storeKey 'rooms' and threw
// "required store 'room' is missing from HandlerContext.stores").
describe('room.setName — legacy bridge (§FIX-ROOM-SETNAME-STORE, L-75)', () => {
  let env: ReturnType<typeof buildEnv>;
  const g = globalThis as unknown as { window?: unknown };
  const savedWindow = g.window;
  afterEach(() => {
    env?.detach();
    if (savedWindow === undefined) delete g.window;
    else g.window = savedWindow;
  });

  // Build a bus whose storesProvider has NO 'room' key — faithfully reproducing
  // the production wiring (PluginRegistry contributes the plugin RoomStore under
  // storeKey 'rooms', so 'room' is absent). Before the fix, room.setName declared
  // affectedStores:['room'] → buildContext threw the R1A-16 missing-store error.
  // This test fails if that regression returns.
  function busWithoutRoomStore() {
    const bus = new CommandBus({
      audit: { actorId: 'test', projectId: 'p1', clientId: 't1' },
      storesProvider: () => ({}),
    });
    for (const h of buildRoomHandlerSet()) bus.register(h);
    return bus;
  }

  it('does NOT throw the missing-store error and forwards a RenameRoomCommand', async () => {
    env = buildEnv();
    const bus = busWithoutRoomStore();
    const executed: Array<{ targetIds?: readonly string[]; [k: string]: unknown }> = [];
    g.window = {
      __pryzmInitComplete: true,
      commandManager: {
        execute: (c: unknown) => executed.push(c as { targetIds?: readonly string[] }),
      },
    };
    await expect(
      bus.executeCommand('room.setName', { roomId: 'room_abc', name: 'Atrium' }),
    ).resolves.toBeDefined();
    // Bridged exactly one RenameRoomCommand targeting the room, carrying the name.
    expect(executed).toHaveLength(1);
    expect(executed[0]?.targetIds).toContain('room_abc');
    expect(executed[0]?.type).toBe('RENAME_ROOM');
    // The plugin RoomsState is NOT mutated by the bridge.
    expect(env.room.size()).toBe(0);
  });

  it('no-ops (does not throw) before the engine is initialised', async () => {
    env = buildEnv();
    const bus = busWithoutRoomStore();
    g.window = {
      __pryzmInitComplete: false,
      commandManager: { execute: () => { throw new Error('must not run pre-init'); } },
    };
    await expect(
      bus.executeCommand('room.setName', { roomId: 'room_x', name: 'Late' }),
    ).resolves.toBeDefined();
  });

  it('rejects an empty name payload', async () => {
    env = buildEnv();
    const bus = busWithoutRoomStore();
    g.window = { __pryzmInitComplete: true, commandManager: { execute: () => {} } };
    await expect(
      bus.executeCommand('room.setName', { roomId: 'room_abc', name: '' }),
    ).rejects.toThrow();
  });

  it('rejects an empty roomId payload', async () => {
    env = buildEnv();
    const bus = busWithoutRoomStore();
    g.window = { __pryzmInitComplete: true, commandManager: { execute: () => {} } };
    await expect(
      bus.executeCommand('room.setName', { roomId: '', name: 'X' }),
    ).rejects.toThrow();
  });
});

// §FIX-ROOM-SIBLING-HANDLERS-STORE (L-79) — setNumber / setOccupancy / setMaterial
// / setHeightOffset are now LEGACY BRIDGES (like room.setName): each forwards the
// corresponding legacy command through window.commandManager and declares
// affectedStores:[]. Before the fix each declared affectedStores:['room'] against
// the bus storeKey 'rooms' → buildContext threw the R1A-16 missing-store error, and
// the mutation targeted the disconnected plugin RoomsState the renderer/persistence
// never read. Each test runs a bus with NO 'room' store key (production wiring) and
// asserts the right legacy CommandType is forwarded with no throw.
describe('room.setNumber / setOccupancy / setMaterial / setHeightOffset — legacy bridges (§FIX-ROOM-SIBLING-HANDLERS-STORE, L-79)', () => {
  let env: ReturnType<typeof buildEnv>;
  const g = globalThis as unknown as { window?: unknown };
  const savedWindow = g.window;
  afterEach(() => {
    env?.detach();
    if (savedWindow === undefined) delete g.window;
    else g.window = savedWindow;
  });

  function busWithoutRoomStore() {
    const bus = new CommandBus({
      audit: { actorId: 'test', projectId: 'p1', clientId: 't1' },
      storesProvider: () => ({}),
    });
    for (const h of buildRoomHandlerSet()) bus.register(h);
    return bus;
  }

  function stubWindow(executed: Array<{ type?: string; targetIds?: readonly string[] }>) {
    g.window = {
      __pryzmInitComplete: true,
      commandManager: { execute: (c: unknown) => executed.push(c as { type?: string }) },
      roomStore: {
        getById: () => ({
          boundary: {
            polygon: [
              { x: 0, z: 0 },
              { x: 2, z: 0 },
              { x: 2, z: 2 },
            ],
            height: 2.4,
            baseOffset: 0,
            detectionMethod: 'auto-topology',
          },
        }),
      },
    };
  }

  it('setNumber forwards a RenameRoomCommand (empty string clears)', async () => {
    env = buildEnv();
    const bus = busWithoutRoomStore();
    const executed: Array<{ type?: string; targetIds?: readonly string[] }> = [];
    stubWindow(executed);
    await expect(
      bus.executeCommand('room.setNumber', { roomId: 'room_abc', number: '101' }),
    ).resolves.toBeDefined();
    expect(executed).toHaveLength(1);
    expect(executed[0]?.type).toBe('RENAME_ROOM');
    expect(executed[0]?.targetIds).toContain('room_abc');
    // Clearing (empty string) still forwards a RenameRoomCommand.
    await bus.executeCommand('room.setNumber', { roomId: 'room_abc', number: '' });
    expect(executed).toHaveLength(2);
    expect(env.room.size()).toBe(0);
  });

  it('setOccupancy forwards a SetRoomOccupancyCommand', async () => {
    env = buildEnv();
    const bus = busWithoutRoomStore();
    const executed: Array<{ type?: string; targetIds?: readonly string[] }> = [];
    stubWindow(executed);
    await expect(
      bus.executeCommand('room.setOccupancy', { roomId: 'room_abc', occupancy: 'bathroom' }),
    ).resolves.toBeDefined();
    expect(executed).toHaveLength(1);
    expect(executed[0]?.type).toBe('SET_ROOM_OCCUPANCY');
    expect(executed[0]?.targetIds).toContain('room_abc');
  });

  it('setMaterial forwards an UpdateRoomCommand carrying the colour', async () => {
    env = buildEnv();
    const bus = busWithoutRoomStore();
    const executed: Array<{ type?: string; targetIds?: readonly string[] }> = [];
    stubWindow(executed);
    await expect(
      bus.executeCommand('room.setMaterial', { roomId: 'room_abc', materialColor: '#ff0000' }),
    ).resolves.toBeDefined();
    expect(executed).toHaveLength(1);
    expect(executed[0]?.type).toBe('UPDATE_ROOM');
    expect(executed[0]?.targetIds).toContain('room_abc');
  });

  it('setMaterial still requires at least one of materialId / materialColor', async () => {
    env = buildEnv();
    const bus = busWithoutRoomStore();
    const executed: Array<{ type?: string }> = [];
    stubWindow(executed);
    await expect(
      bus.executeCommand('room.setMaterial', { roomId: 'room_abc' }),
    ).rejects.toThrow();
  });

  it('setHeightOffset forwards an UpdateRoomCommand (in-range) and rejects out-of-range', async () => {
    env = buildEnv();
    const bus = busWithoutRoomStore();
    const executed: Array<{ type?: string; targetIds?: readonly string[] }> = [];
    stubWindow(executed);
    await expect(
      bus.executeCommand('room.setHeightOffset', { roomId: 'room_abc', heightOffset: 0.5 }),
    ).resolves.toBeDefined();
    expect(executed).toHaveLength(1);
    expect(executed[0]?.type).toBe('UPDATE_ROOM');
    expect(executed[0]?.targetIds).toContain('room_abc');
    await expect(
      bus.executeCommand('room.setHeightOffset', { roomId: 'room_abc', heightOffset: 11 }),
    ).rejects.toThrow();
    await expect(
      bus.executeCommand('room.setHeightOffset', { roomId: 'room_abc', heightOffset: Number.NaN }),
    ).rejects.toThrow();
  });

  it('no-ops (does not throw) before the engine is initialised', async () => {
    env = buildEnv();
    const bus = busWithoutRoomStore();
    g.window = {
      __pryzmInitComplete: false,
      commandManager: { execute: () => { throw new Error('must not run pre-init'); } },
    };
    await expect(
      bus.executeCommand('room.setNumber', { roomId: 'room_x', number: '9' }),
    ).resolves.toBeDefined();
  });
});

// §FIX-ROOM-SIBLING-HANDLERS-STORE (L-79) — room.recomputeBoundary (fired by the
// wall→room cascade on every wall edit) is now a NO-OP legacy bridge with
// affectedStores:[]. Before the fix it declared affectedStores:['room'] and threw
// "required store 'room' is missing" on every wall create/move/resize. The legacy
// RoomStore owns room analytics, so the plugin recompute is a redundant no-op.
describe('room.recomputeBoundary — no-op legacy bridge (§FIX-ROOM-SIBLING-HANDLERS-STORE, L-79)', () => {
  let env: ReturnType<typeof buildEnv>;
  afterEach(() => env?.detach());

  function busWithoutRoomStore() {
    const bus = new CommandBus({
      audit: { actorId: 'test', projectId: 'p1', clientId: 't1' },
      storesProvider: () => ({}),
    });
    for (const h of buildRoomHandlerSet()) bus.register(h);
    return bus;
  }

  it('does NOT throw the missing-store error and mutates no store', async () => {
    env = buildEnv();
    const bus = busWithoutRoomStore();
    await expect(
      bus.executeCommand('room.recomputeBoundary', { roomId: 'room_abc', cascadedFrom: 'wall.move' }),
    ).resolves.toBeDefined();
    expect(env.room.size()).toBe(0);
  });

  it('rejects an empty roomId payload', async () => {
    env = buildEnv();
    const bus = busWithoutRoomStore();
    await expect(
      bus.executeCommand('room.recomputeBoundary', { roomId: '' }),
    ).rejects.toThrow();
  });
});
