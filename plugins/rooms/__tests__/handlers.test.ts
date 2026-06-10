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

describe('room.move', () => {
  let env: ReturnType<typeof buildEnv>;
  afterEach(() => env?.detach());

  it('translates the seed point in wallBound mode and inverts', async () => {
    env = buildEnv();
    const id = createId('room');
    await env.bus.executeCommand('room.create', {
      id,
      boundaryMode: 'wallBound',
      seedPoint: { x: 1, y: 0, z: 2 },
    });
    const before = snap(env.room);
    const ev = await env.bus.executeCommand('room.move', {
      roomId: id,
      delta: { x: 5, y: 0, z: -3 },
    });
    expect(env.room.get(id)?.seedPoint).toEqual({ x: 6, y: 0, z: -1 });

    undoLast(env.room, ev);
    expect(snap(env.room)).toEqual(before);
  });

  it('translates every sketched-mode boundary vertex', async () => {
    env = buildEnv();
    const id = createId('room');
    await env.bus.executeCommand('room.create', {
      id,
      boundary: [
        { x: 0, y: 0, z: 0 },
        { x: 2, y: 0, z: 0 },
        { x: 2, y: 0, z: 2 },
        { x: 0, y: 0, z: 2 },
      ],
    });
    const before = snap(env.room);
    const ev = await env.bus.executeCommand('room.move', {
      roomId: id,
      delta: { x: 10, y: 0, z: 10 },
    });
    expect(env.room.get(id)?.boundary[0]).toEqual({ x: 10, y: 0, z: 10 });
    expect(env.room.get(id)?.boundary[2]).toEqual({ x: 12, y: 0, z: 12 });

    undoLast(env.room, ev);
    expect(snap(env.room)).toEqual(before);
  });
});

describe('room.setName / setNumber / setOccupancy / setMaterial / setHeightOffset', () => {
  let env: ReturnType<typeof buildEnv>;
  let id: string;
  afterEach(() => env?.detach());

  async function freshRoom() {
    env = buildEnv();
    id = createId('room');
    await env.bus.executeCommand('room.create', { id });
  }

  it('setName replaces and inverts', async () => {
    await freshRoom();
    const before = snap(env.room);
    const ev = await env.bus.executeCommand('room.setName', { roomId: id, name: 'Atrium' });
    expect(env.room.get(id)?.name).toBe('Atrium');
    undoLast(env.room, ev);
    expect(snap(env.room)).toEqual(before);
  });

  it('setName rejects empty', async () => {
    await freshRoom();
    await expect(
      env.bus.executeCommand('room.setName', { roomId: id, name: '' }),
    ).rejects.toThrow();
  });

  it('setNumber sets and clears', async () => {
    await freshRoom();
    await env.bus.executeCommand('room.setNumber', { roomId: id, number: '101' });
    expect(env.room.get(id)?.number).toBe('101');
    await env.bus.executeCommand('room.setNumber', { roomId: id, number: '' });
    expect(env.room.get(id)?.number).toBeUndefined();
  });

  it('setOccupancy sets and inverts', async () => {
    await freshRoom();
    const before = snap(env.room);
    const ev = await env.bus.executeCommand('room.setOccupancy', {
      roomId: id,
      occupancy: 'Bathroom',
    });
    expect(env.room.get(id)?.occupancy).toBe('Bathroom');
    undoLast(env.room, ev);
    expect(snap(env.room)).toEqual(before);
  });

  it('setMaterial requires at least one of materialId / materialColor', async () => {
    await freshRoom();
    await expect(
      env.bus.executeCommand('room.setMaterial', { roomId: id }),
    ).rejects.toThrow();
  });

  it('setMaterial sets the colour', async () => {
    await freshRoom();
    await env.bus.executeCommand('room.setMaterial', {
      roomId: id,
      materialColor: '#ff0000',
    });
    expect(env.room.get(id)?.materialColor).toBe('#ff0000');
  });

  it('setHeightOffset accepts in-range, rejects out-of-range', async () => {
    await freshRoom();
    await env.bus.executeCommand('room.setHeightOffset', {
      roomId: id,
      heightOffset: 0.5,
    });
    expect(env.room.get(id)?.heightOffset).toBeCloseTo(0.5);
    await expect(
      env.bus.executeCommand('room.setHeightOffset', {
        roomId: id,
        heightOffset: 11,
      }),
    ).rejects.toThrow();
    await expect(
      env.bus.executeCommand('room.setHeightOffset', {
        roomId: id,
        heightOffset: Number.NaN,
      }),
    ).rejects.toThrow();
  });
});
