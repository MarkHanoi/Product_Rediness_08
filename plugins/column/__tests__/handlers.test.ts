// Column handler smoke suite (S12-T3).

import { afterEach, describe, expect, it } from 'vitest';
import { CommandBus, PatchEmitter, UndoStack, type EventRecord } from '@pryzm/plugin-sdk';
import { attachStores } from '@pryzm/plugin-sdk';
import { createId } from '@pryzm/plugin-sdk';
import { ColumnStore, type ColumnData, type ColumnsState } from '../src/store.js';
import {
  buildColumnHandlerSet,
  registerColumnHandlers,
  COLUMN_HANDLER_TYPES,
} from '../src/handlers/index.js';

function buildEnv() {
  const column = new ColumnStore();
  const stores = { column: column as unknown as import('@pryzm/stores').Store<object> };
  const emitter = new PatchEmitter();
  const undoStack = new UndoStack({ maxSize: 50 });
  const bus = new CommandBus({
    audit: { actorId: 'test', projectId: 'p1', clientId: 't1' },
    emitter,
    undoStack,
    storesProvider: () => ({
      column: Object.fromEntries(column.getState()) as ColumnsState,
    }),
  });
  for (const h of buildColumnHandlerSet()) bus.register(h);
  const detach = attachStores(emitter, stores);
  return { column, bus, detach };
}

function snap(s: ColumnStore): Record<string, ColumnData> {
  return JSON.parse(JSON.stringify(Object.fromEntries(s.getState())));
}
function undoLast(s: ColumnStore, ev: EventRecord<unknown>): void {
  s.applyPatch([...ev.inverse].reverse());
}

describe('column handler registration', () => {
  it('registerColumnHandlers wires all 5 command types', () => {
    const env = buildEnv();
    const bus = new CommandBus({
      audit: { actorId: 'test', projectId: 'p1', clientId: 't1' },
      storesProvider: () => ({ column: {} }),
    });
    const types = registerColumnHandlers(bus);
    expect([...types].sort()).toEqual([...COLUMN_HANDLER_TYPES].sort());
    env.detach();
  });
});

describe('column.create / delete / move', () => {
  let env: ReturnType<typeof buildEnv>;
  afterEach(() => env?.detach());

  it('creates with caller id and inverts', async () => {
    env = buildEnv();
    const id = createId('column');
    const before = snap(env.column);
    const ev = await env.bus.executeCommand('column.create', {
      id, origin: { x: 1, y: 0, z: 2 }, height: 4,
    });
    expect(env.column.get(id)?.height).toBe(4);
    undoLast(env.column, ev);
    expect(snap(env.column)).toEqual(before);
  });

  it('rejects non-square circular column', async () => {
    env = buildEnv();
    await expect(
      env.bus.executeCommand('column.create', { shape: 'circular', width: 0.4, depth: 0.5 }),
    ).rejects.toThrow();
  });

  it('refuses a well-formed payload, names column.update, and mutates nothing', async () => {
    env = buildEnv();
    const id = createId('column');
    await env.bus.executeCommand('column.create', { id });
    const before = snap(env.column);
    // §FIX-DEAD-MOVE-VERB-REFUSE (W3-4) — this used to assert the PLUGIN DTO store
    // mutated, and passed while the user's model never changed: in production the bus
    // binds the DETACHED plugin store here, no renderer/exporter/persistence path reads
    // it, and NO surface dispatches `column.move`. Moving a column commits through `column.update` (id, updates).
    // What is pinned is now the REFUSAL, its reason, and the ABSENCE of any mutation —
    // an assertion about the wrong store is worse than none, because it reads as proof.
    // `execute()` is deliberately left intact for a host that binds the authoritative
    // store under this key; `canExecute` is the gate the bus honours.
    await expect(
      env.bus.executeCommand('column.move', { columnId: id, delta: { x: 1, y: 0, z: 1 } }),
    ).rejects.toThrow(/column\.update/);
    expect(snap(env.column)).toEqual(before);
  });
});

describe('column.setHeight + setType', () => {
  let env: ReturnType<typeof buildEnv>;
  afterEach(() => env?.detach());

  it('setHeight rejects 0 and accepts positive', async () => {
    env = buildEnv();
    const id = createId('column');
    await env.bus.executeCommand('column.create', { id });
    await expect(
      env.bus.executeCommand('column.setHeight', { columnId: id, height: 0 }),
    ).rejects.toThrow();
    await env.bus.executeCommand('column.setHeight', { columnId: id, height: 4.5 });
    expect(env.column.get(id)?.height).toBe(4.5);
  });

  it('setType swaps shape + dims atomically', async () => {
    env = buildEnv();
    const id = createId('column');
    await env.bus.executeCommand('column.create', { id });
    await env.bus.executeCommand('column.setType', {
      columnId: id, shape: 'circular', width: 0.5, depth: 0.5,
    });
    const c = env.column.get(id)!;
    expect(c.shape).toBe('circular');
    expect(c.width).toBe(0.5);
  });

  it('setType rejects circular with mismatched dims', async () => {
    env = buildEnv();
    const id = createId('column');
    await env.bus.executeCommand('column.create', { id });
    await expect(
      env.bus.executeCommand('column.setType', { columnId: id, shape: 'circular', width: 0.4 }),
    ).rejects.toThrow();
  });
});

describe('column.setMaterial', () => {
  // §FEAT-UNIFORM-MATERIAL-COMMAND — L-08 uniform material-set command.
  let env: ReturnType<typeof buildEnv>;
  afterEach(() => env?.detach());

  // §FIX-DEAD-VERB-REFUSE (W3-3) — these two used to assert the PLUGIN DTO store mutated,
  // and passed for years while the user's model never changed: in production the bus binds
  // the DETACHED plugin ColumnStore here, and no renderer, 2-D projector, IFC exporter or
  // persistence path reads it. The verb now refuses with a reason naming the live route
  // (`column.update`), so what is pinned is the REFUSAL, its reason, and the absence of any
  // mutation. An assertion about the wrong store is worse than no assertion, because it
  // reads as proof. C03 §4.6 U-4.
  it('refuses a well-formed materialId payload and names column.update', async () => {
    env = buildEnv();
    const id = createId('column');
    await env.bus.executeCommand('column.create', { id });
    const before = snap(env.column);
    await expect(
      env.bus.executeCommand('column.setMaterial', { columnId: id, materialId: 'steel-s355' }),
    ).rejects.toThrow(/column\.update/);
    // A refusal must not mutate anything.
    expect(snap(env.column)).toEqual(before);
  });

  it('refuses a materialId clear too — the refusal is not payload-shaped', async () => {
    env = buildEnv();
    const id = createId('column');
    await env.bus.executeCommand('column.create', { id });
    const before = snap(env.column);
    await expect(
      env.bus.executeCommand('column.setMaterial', { columnId: id, materialId: null }),
    ).rejects.toThrow(/plugin DTO store/);
    expect(snap(env.column)).toEqual(before);
  });

  it('rejects when neither materialId nor materialColor provided', async () => {
    env = buildEnv();
    const id = createId('column');
    await env.bus.executeCommand('column.create', { id });
    await expect(
      env.bus.executeCommand('column.setMaterial', { columnId: id }),
    ).rejects.toThrow();
  });

  it('rejects unknown column id', async () => {
    env = buildEnv();
    await expect(
      env.bus.executeCommand('column.setMaterial', { columnId: createId('column'), materialId: 'x' }),
    ).rejects.toThrow();
  });
});
