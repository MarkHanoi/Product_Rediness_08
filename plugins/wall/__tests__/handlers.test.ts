// 5-handler end-to-end test suite (S07-T4 / T5 / T8).
//
// Each test: build a CommandBus + WallStore, register the handler,
// execute a command, assert (a) the forward patch updates the store,
// (b) the inverse patch undoes the change byte-for-byte, (c) the
// `EventRecord` carries the audit + ULID metadata, (d) the second
// undo re-undoes nothing and is byte-equal to the original state.

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
  WallStore,
  type WallData,
  type WallsState,
} from '../src/store.js';
import {
  buildWallHandlerSet,
  registerWallHandlers,
  WALL_HANDLER_TYPES,
} from '../src/handlers/index.js';
import { WallSystemTypeStore } from '../src/system-type-store.js';

function buildEnv(opts: { systemTypeStore?: WallSystemTypeStore } = {}) {
  const store = new WallStore();
  const stores = { wall: store as unknown as import('@pryzm/stores').Store<object> };
  const emitter = new PatchEmitter();
  const undoStack = new UndoStack({ maxSize: 50 });
  const bus = new CommandBus({
    audit: { actorId: 'test', projectId: 'p1', clientId: 't1' },
    emitter,
    undoStack,
    storesProvider: () => ({
      wall: Object.fromEntries(store.getState()) as WallsState,
    }),
  });
  for (const h of buildWallHandlerSet({ systemTypeStore: opts.systemTypeStore })) {
    bus.register(h);
  }
  const detach = attachStores(emitter, stores);
  return { store, bus, emitter, undoStack, detach };
}

function snapState(store: WallStore): Record<string, WallData> {
  // Deep clone via JSON for byte-equality comparisons.
  return JSON.parse(JSON.stringify(Object.fromEntries(store.getState())));
}

function undoLast(store: WallStore, record: EventRecord<unknown>): void {
  // Apply inverse patches in reverse order against the store.
  const reversed = [...record.inverse].reverse();
  store.applyPatch(reversed);
}

describe('wall handler registration', () => {
  it('registerWallHandlers wires all 14 command types (S10 expanded the set from 5 → 14)', () => {
    const env = buildEnv();
    // Build a fresh bus to avoid duplicate-registration error (handlers
    // already registered in buildEnv()).
    const bus = new CommandBus({
      audit: { actorId: 'test', projectId: 'p1', clientId: 't1' },
      storesProvider: () => ({ wall: {} }),
    });
    const types = registerWallHandlers(bus);
    expect([...types].sort()).toEqual([...WALL_HANDLER_TYPES].sort());
    for (const t of WALL_HANDLER_TYPES) expect(bus.has(t)).toBe(true);
    env.detach();
  });
});

describe('wall.create — round-trip', () => {
  let env: ReturnType<typeof buildEnv>;
  afterEach(() => env?.detach());

  it('creates a wall with caller-provided id and reflects it in the store', async () => {
    env = buildEnv();
    const id = createId('wall');
    const before = snapState(env.store);
    const ev = await env.bus.executeCommand('wall.create', {
      id,
      levelId: 'lvl_test',
      height: 2.4,
      thickness: 0.1,
    });
    expect(env.store.size()).toBe(1);
    expect(env.store.get(id)?.height).toBe(2.4);
    // Round-trip: undo restores the EXACT prior snapshot.
    undoLast(env.store, ev);
    expect(snapState(env.store)).toEqual(before);
  });

  it('throws WallSchemaError on degenerate baseLine via the schema refine', async () => {
    env = buildEnv();
    await expect(
      env.bus.executeCommand('wall.create', {
        id: createId('wall'),
        levelId: 'lvl_test',
        baseLine: [
          { x: 0, y: 0, z: 0 },
          { x: 0.001, y: 0, z: 0.001 },
        ],
      }),
    ).rejects.toThrow();
    expect(env.store.size()).toBe(0);
    expect(env.undoStack.size).toBe(0);
  });
});

describe('wall.delete — round-trip', () => {
  let env: ReturnType<typeof buildEnv>;
  afterEach(() => env?.detach());

  it('removes the wall and inverse patch re-adds the exact pre-delete row', async () => {
    env = buildEnv();
    const id = createId('wall');
    await env.bus.executeCommand('wall.create', { id, levelId: 'lvl_test' });
    const before = snapState(env.store);
    const ev = await env.bus.executeCommand('wall.delete', { id });
    expect(env.store.size()).toBe(0);
    undoLast(env.store, ev);
    expect(snapState(env.store)).toEqual(before);
  });

  it('rejects unknown id at canExecute (no event emitted)', async () => {
    env = buildEnv();
    const before = env.undoStack.size;
    await expect(env.bus.executeCommand('wall.delete', { id: 'wall_NOPE' })).rejects.toThrow();
    expect(env.undoStack.size).toBe(before);
  });
});

describe('wall.move — round-trip', () => {
  let env: ReturnType<typeof buildEnv>;
  afterEach(() => env?.detach());

  it('replaces baseLine and undo restores the original endpoints', async () => {
    env = buildEnv();
    const id = createId('wall');
    await env.bus.executeCommand('wall.create', { id, levelId: 'lvl_test' });
    const before = snapState(env.store);
    const ev = await env.bus.executeCommand('wall.move', {
      id,
      baseLine: [
        { x: 1, y: 0, z: 1 },
        { x: 5, y: 0, z: 1 },
      ],
    });
    expect(env.store.get(id)?.baseLine[1].x).toBe(5);
    undoLast(env.store, ev);
    expect(snapState(env.store)).toEqual(before);
  });

  it('rejects mismatched-y endpoints at canExecute', async () => {
    env = buildEnv();
    const id = createId('wall');
    await env.bus.executeCommand('wall.create', { id, levelId: 'lvl_test' });
    await expect(
      env.bus.executeCommand('wall.move', {
        id,
        baseLine: [
          { x: 0, y: 0, z: 0 },
          { x: 1, y: 1, z: 0 },
        ],
      }),
    ).rejects.toThrow(/same y/);
  });
});

describe('wall.setDimensions — round-trip', () => {
  let env: ReturnType<typeof buildEnv>;
  afterEach(() => env?.detach());

  it('atomically sets height + thickness in one inverse patch group', async () => {
    env = buildEnv();
    const id = createId('wall');
    await env.bus.executeCommand('wall.create', { id, levelId: 'lvl_test' });
    const before = snapState(env.store);
    const ev = await env.bus.executeCommand('wall.setDimensions', {
      id,
      height: 3.2,
      thickness: 0.2,
      baseOffset: 0.05,
    });
    const w = env.store.get(id);
    expect(w?.height).toBe(3.2);
    expect(w?.thickness).toBe(0.2);
    expect(w?.baseOffset).toBe(0.05);
    undoLast(env.store, ev);
    expect(snapState(env.store)).toEqual(before);
  });

  it('rejects when no dimension is provided', async () => {
    env = buildEnv();
    const id = createId('wall');
    await env.bus.executeCommand('wall.create', { id, levelId: 'lvl_test' });
    await expect(env.bus.executeCommand('wall.setDimensions', { id })).rejects.toThrow();
  });
});

describe('wall.setColor — round-trip', () => {
  let env: ReturnType<typeof buildEnv>;
  afterEach(() => env?.detach());

  it('sets materialColor and undo restores prior value', async () => {
    env = buildEnv();
    const id = createId('wall');
    await env.bus.executeCommand('wall.create', {
      id,
      levelId: 'lvl_test',
      materialColor: '#aabbcc',
    });
    const before = snapState(env.store);
    const ev = await env.bus.executeCommand('wall.setColor', {
      id,
      materialColor: '#112233',
    });
    expect(env.store.get(id)?.materialColor).toBe('#112233');
    undoLast(env.store, ev);
    expect(snapState(env.store)).toEqual(before);
  });

  it('clears materialId when set to null and undo restores it', async () => {
    env = buildEnv();
    const id = createId('wall');
    await env.bus.executeCommand('wall.create', {
      id,
      levelId: 'lvl_test',
      materialId: 'mat-1',
    });
    const before = snapState(env.store);
    const ev = await env.bus.executeCommand('wall.setColor', { id, materialId: null });
    expect(env.store.get(id)?.materialId).toBeUndefined();
    undoLast(env.store, ev);
    expect(snapState(env.store)).toEqual(before);
  });

  it('rejects malformed hex color', async () => {
    env = buildEnv();
    const id = createId('wall');
    await env.bus.executeCommand('wall.create', { id, levelId: 'lvl_test' });
    await expect(
      env.bus.executeCommand('wall.setColor', { id, materialColor: 'red' }),
    ).rejects.toThrow();
  });
});

describe('wall.create — systemTypeId catalogue validation (S07 cleanup)', () => {
  let env: ReturnType<typeof buildEnv>;
  afterEach(() => env?.detach());

  it('accepts a known catalogue id when the WallSystemTypeStore is wired', async () => {
    const sysTypes = new WallSystemTypeStore();
    env = buildEnv({ systemTypeStore: sysTypes });
    const id = createId('wall');
    await env.bus.executeCommand('wall.create', {
      id,
      levelId: 'lvl_test',
      systemTypeId: 'wt-monolithic',
    });
    expect(env.store.get(id)?.systemTypeId).toBe('wt-monolithic');
  });

  it('rejects an unknown catalogue id at canExecute when the catalogue is wired', async () => {
    const sysTypes = new WallSystemTypeStore();
    env = buildEnv({ systemTypeStore: sysTypes });
    const before = env.undoStack.size;
    await expect(
      env.bus.executeCommand('wall.create', {
        id: createId('wall'),
        levelId: 'lvl_test',
        systemTypeId: 'wt-NOPE',
      }),
    ).rejects.toThrow(/unknown systemTypeId/);
    expect(env.store.size()).toBe(0);
    expect(env.undoStack.size).toBe(before);
  });

  it('accepts any systemTypeId when no catalogue is wired (back-compat)', async () => {
    env = buildEnv(); // no systemTypeStore
    const id = createId('wall');
    await env.bus.executeCommand('wall.create', {
      id,
      levelId: 'lvl_test',
      systemTypeId: 'wt-not-in-catalogue',
    });
    expect(env.store.get(id)?.systemTypeId).toBe('wt-not-in-catalogue');
  });
});

describe('EventRecord shape', () => {
  it('every wall command emits ULID id + per-store patch envelope', async () => {
    const env = buildEnv();
    const id = createId('wall');
    const ev = await env.bus.executeCommand('wall.create', { id, levelId: 'lvl_test' });
    expect(ev.id).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
    expect(ev.affectedStores).toEqual(['wall']);
    expect(ev.patches).toHaveLength(1);
    expect(ev.patches[0]?.storeKey).toBe('wall');
    expect(ev.patches[0]?.forwardPatches.length).toBeGreaterThan(0);
    env.detach();
  });
});
