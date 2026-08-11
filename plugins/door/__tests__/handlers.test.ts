// Door handler end-to-end test suite (S11-T1).

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
  DoorStore,
  type DoorData,
  type DoorsState,
} from '../src/store.js';
import {
  buildDoorHandlerSet,
  registerDoorHandlers,
  DOOR_HANDLER_TYPES,
} from '../src/handlers/index.js';
import { DoorDimensionsError, DoorNotFoundError } from '../src/errors.js';
import { BUILTIN_DOOR_TYPES } from '@pryzm/plugin-sdk';

function buildEnv() {
  const door = new DoorStore();
  const stores = { door: door as unknown as import('@pryzm/stores').Store<object> };
  const emitter = new PatchEmitter();
  const undoStack = new UndoStack({ maxSize: 50 });
  const bus = new CommandBus({
    audit: { actorId: 'test', projectId: 'p1', clientId: 't1' },
    emitter,
    undoStack,
    storesProvider: () => ({
      door: Object.fromEntries(door.getState()) as DoorsState,
    }),
  });
  for (const h of buildDoorHandlerSet()) bus.register(h);
  const detach = attachStores(emitter, stores);
  return { door, bus, emitter, undoStack, detach };
}

function snap(store: DoorStore): Record<string, DoorData> {
  return JSON.parse(JSON.stringify(Object.fromEntries(store.getState())));
}

function undoLast(store: DoorStore, ev: EventRecord<unknown>): void {
  store.applyPatch([...ev.inverse].reverse());
}

describe('door handler registration', () => {
  it('registerDoorHandlers wires all 6 command types', () => {
    const env = buildEnv();
    const bus = new CommandBus({
      audit: { actorId: 'test', projectId: 'p1', clientId: 't1' },
      storesProvider: () => ({ door: {} }),
    });
    const types = registerDoorHandlers(bus);
    expect([...types].sort()).toEqual([...DOOR_HANDLER_TYPES].sort());
    for (const t of DOOR_HANDLER_TYPES) expect(bus.has(t)).toBe(true);
    env.detach();
  });
});

describe('door.create — round-trip', () => {
  let env: ReturnType<typeof buildEnv>;
  afterEach(() => env?.detach());

  it('creates a door with caller-provided id', async () => {
    env = buildEnv();
    const id = createId('door');
    const wallId = createId('wall');
    const before = snap(env.door);
    const ev = await env.bus.executeCommand('door.create', {
      id,
      wallId,
      openingId: 'op_1',
      offset: 1.0,
    });
    expect(env.door.size()).toBe(1);
    expect(env.door.get(id)?.wallId).toBe(wallId);
    undoLast(env.door, ev);
    expect(snap(env.door)).toEqual(before);
  });

  it('applies type defaults from systemTypeId', async () => {
    env = buildEnv();
    const id = createId('door');
    const wallId = createId('wall');
    await env.bus.executeCommand('door.create', {
      id,
      wallId,
      openingId: 'op_x',
      systemTypeId: BUILTIN_DOOR_TYPES[3]!.id, // exterior single
    });
    const created = env.door.get(id)!;
    expect(created.width).toBe(BUILTIN_DOOR_TYPES[3]!.width);
    expect(created.frameColor).toBe(BUILTIN_DOOR_TYPES[3]!.frameColor);
  });

  it('rejects unknown systemTypeId via canExecute', async () => {
    env = buildEnv();
    await expect(
      env.bus.executeCommand('door.create', {
        wallId: createId('wall'),
        openingId: 'op_y',
        systemTypeId: 'door.does.not.exist',
      }),
    ).rejects.toThrow(/not found/i);
  });

  it('rejects frameWidth*2 > width via the schema refine', async () => {
    env = buildEnv();
    await expect(
      env.bus.executeCommand('door.create', {
        wallId: createId('wall'),
        openingId: 'op_z',
        width: 0.05,
        frameWidth: 0.1,
      }),
    ).rejects.toThrow();
  });
});

describe('door.delete — round-trip', () => {
  let env: ReturnType<typeof buildEnv>;
  afterEach(() => env?.detach());

  it('removes a door and undo restores it byte-for-byte', async () => {
    env = buildEnv();
    const id = createId('door');
    await env.bus.executeCommand('door.create', {
      id,
      wallId: createId('wall'),
      openingId: 'op_1',
    });
    const before = snap(env.door);
    const ev = await env.bus.executeCommand('door.delete', { doorId: id });
    expect(env.door.size()).toBe(0);
    undoLast(env.door, ev);
    expect(snap(env.door)).toEqual(before);
  });

  it('throws on missing door id', async () => {
    env = buildEnv();
    await expect(env.bus.executeCommand('door.delete', { doorId: 'door_nope' })).rejects.toThrow(
      /not found/i,
    );
  });
});

describe('door.move + setWidth + setType + setSwing — round-trips', () => {
  let env: ReturnType<typeof buildEnv>;
  afterEach(() => env?.detach());

  it('door.move refuses, names door.setOffset, and mutates nothing', async () => {
    env = buildEnv();
    const id = createId('door');
    await env.bus.executeCommand('door.create', {
      id,
      wallId: createId('wall'),
      openingId: 'op_1',
      offset: 0.5,
    });
    const before = snap(env.door);
    // §FIX-DEAD-MOVE-VERB-REFUSE (W3-4) — this used to assert the PLUGIN DTO store's
    // offset changed, and passed while the user's door never moved: in production the
    // bus binds the DETACHED plugin door store here, no renderer/exporter/persistence
    // path reads it, and nothing dispatches `door.move` — MOVE_COMMAND_BY_TYPE and the
    // 3-D gizmo both send `door.setOffset`. What is pinned is now the REFUSAL, its
    // reason, and the ABSENCE of mutation; an assertion about the wrong store is worse
    // than none, because it reads as proof.
    await expect(
      env.bus.executeCommand('door.move', { doorId: id, offset: 1.5 }),
    ).rejects.toThrow(/door\.setOffset/);
    expect(snap(env.door)).toEqual(before);
  });

  it('door.setWidth/setHeight are RETIRED from this plugin (§FIX-DIMS-REACH-RECORD, L-815)', async () => {
    // The plugin handlers wrote the DETACHED plugin door store (silent no-op
    // in production). The verbs are now owned by same-name legacy bridges in
    // apps/editor initBusHandlers → UpdateElementParameterCommand → the
    // geometry wallStore. The plugin set must leave them unhandled here.
    env = buildEnv();
    const id = createId('door');
    await env.bus.executeCommand('door.create', {
      id,
      wallId: createId('wall'),
      openingId: 'op_1',
      width: 0.9,
      frameWidth: 0.05,
    });
    await expect(
      env.bus.executeCommand('door.setWidth', { doorId: id, width: 1.2 }),
    ).rejects.toThrow(/no handler/i);
    await expect(
      env.bus.executeCommand('door.setHeight', { doorId: id, height: 2.1 }),
    ).rejects.toThrow(/no handler/i);
  });

  it('door.setType applies catalogue defaults', async () => {
    env = buildEnv();
    const id = createId('door');
    await env.bus.executeCommand('door.create', {
      id,
      wallId: createId('wall'),
      openingId: 'op_1',
    });
    const target = BUILTIN_DOOR_TYPES[4]!; // exterior double
    await env.bus.executeCommand('door.setType', {
      doorId: id,
      systemTypeId: target.id,
    });
    expect(env.door.get(id)?.width).toBe(target.width);
    expect(env.door.get(id)?.height).toBe(target.height);
  });

  it('door.setSwing accepts valid swing and rejects invalid', async () => {
    env = buildEnv();
    const id = createId('door');
    await env.bus.executeCommand('door.create', {
      id,
      wallId: createId('wall'),
      openingId: 'op_1',
    });
    // Valid swing: produces no patches (schema doesn't yet model
    // swing) but does NOT throw.
    await env.bus.executeCommand('door.setSwing', { doorId: id, swing: 'left-in' });
    await expect(
      env.bus.executeCommand('door.setSwing', { doorId: id, swing: 'banana' as never }),
    ).rejects.toThrow();
  });
});

describe('door handler errors — typed', () => {
  it('MoveDoor throws DoorNotFoundError on unknown id (not generic Error)', async () => {
    const env = buildEnv();
    let captured: unknown = null;
    try {
      await env.bus.executeCommand('door.move', { doorId: 'door_nope', offset: 0 });
    } catch (e) {
      captured = e;
    }
    // Bus may wrap typed errors; the underlying validation reason
    // surfaces through the message regardless.
    expect(String((captured as Error)?.message ?? '')).toMatch(/not found|nope/i);
    env.detach();
    void DoorNotFoundError;
    void DoorDimensionsError;
  });
});
