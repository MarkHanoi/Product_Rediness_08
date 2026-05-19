// Slab handler smoke suite (S12-T2).

import { afterEach, describe, expect, it } from 'vitest';
import {
  CommandBus,
  PatchEmitter,
  UndoStack,
  type EventRecord,
} from '@pryzm/plugin-sdk';
import { attachStores } from '@pryzm/plugin-sdk';
import { createId } from '@pryzm/plugin-sdk';
import { SlabStore, type SlabData, type SlabsState } from '../src/store.js';
import {
  buildSlabHandlerSet,
  registerSlabHandlers,
  SLAB_HANDLER_TYPES,
} from '../src/handlers/index.js';

function buildEnv() {
  const slab = new SlabStore();
  const stores = { slab: slab as unknown as import('@pryzm/stores').Store<object> };
  const emitter = new PatchEmitter();
  const undoStack = new UndoStack({ maxSize: 50 });
  const bus = new CommandBus({
    audit: { actorId: 'test', projectId: 'p1', clientId: 't1' },
    emitter,
    undoStack,
    storesProvider: () => ({
      slab: Object.fromEntries(slab.getState()) as SlabsState,
    }),
  });
  for (const h of buildSlabHandlerSet()) bus.register(h);
  const detach = attachStores(emitter, stores);
  return { slab, bus, emitter, undoStack, detach };
}

function snap(store: SlabStore): Record<string, SlabData> {
  return JSON.parse(JSON.stringify(Object.fromEntries(store.getState())));
}

function undoLast(store: SlabStore, ev: EventRecord<unknown>): void {
  store.applyPatch([...ev.inverse].reverse());
}

const SQUARE = [
  { x: 0, y: 0, z: 0 },
  { x: 4, y: 0, z: 0 },
  { x: 4, y: 0, z: 4 },
  { x: 0, y: 0, z: 4 },
];

describe('slab handler registration', () => {
  it('registerSlabHandlers wires all 8 command types', () => {
    const env = buildEnv();
    const bus = new CommandBus({
      audit: { actorId: 'test', projectId: 'p1', clientId: 't1' },
      storesProvider: () => ({ slab: {} }),
    });
    const types = registerSlabHandlers(bus);
    expect([...types].sort()).toEqual([...SLAB_HANDLER_TYPES].sort());
    for (const t of SLAB_HANDLER_TYPES) expect(bus.has(t)).toBe(true);
    env.detach();
  });
});

describe('slab.create — round-trip', () => {
  let env: ReturnType<typeof buildEnv>;
  afterEach(() => env?.detach());

  it('creates a slab with caller-provided id and inverts cleanly', async () => {
    env = buildEnv();
    const id = createId('slab');
    const before = snap(env.slab);
    const ev = await env.bus.executeCommand('slab.create', {
      id,
      boundary: SQUARE,
      thickness: 0.25,
    });
    expect(env.slab.size()).toBe(1);
    expect(env.slab.get(id)?.thickness).toBe(0.25);
    undoLast(env.slab, ev);
    expect(snap(env.slab)).toEqual(before);
  });

  it('rejects degenerate boundary', async () => {
    env = buildEnv();
    await expect(
      env.bus.executeCommand('slab.create', {
        boundary: [{ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }],
      }),
    ).rejects.toThrow();
  });

  it('rejects closed boundary (first === last)', async () => {
    env = buildEnv();
    await expect(
      env.bus.executeCommand('slab.create', {
        boundary: [...SQUARE, { x: 0, y: 0, z: 0 }],
      }),
    ).rejects.toThrow();
  });
});

describe('slab.move + setThickness + setBaseOffset', () => {
  let env: ReturnType<typeof buildEnv>;
  afterEach(() => env?.detach());

  it('move translates every boundary vertex and undoes', async () => {
    env = buildEnv();
    const id = createId('slab');
    await env.bus.executeCommand('slab.create', { id, boundary: SQUARE });
    const before = snap(env.slab);
    const ev = await env.bus.executeCommand('slab.move', {
      slabId: id,
      delta: { x: 1, y: 0, z: 2 },
    });
    expect(env.slab.get(id)?.boundary[0]).toEqual({ x: 1, y: 0, z: 2 });
    undoLast(env.slab, ev);
    expect(snap(env.slab)).toEqual(before);
  });

  it('setThickness rejects 0 / negative and accepts positive', async () => {
    env = buildEnv();
    const id = createId('slab');
    await env.bus.executeCommand('slab.create', { id, boundary: SQUARE });
    await expect(
      env.bus.executeCommand('slab.setThickness', { slabId: id, thickness: 0 }),
    ).rejects.toThrow();
    await env.bus.executeCommand('slab.setThickness', { slabId: id, thickness: 0.5 });
    expect(env.slab.get(id)?.thickness).toBe(0.5);
  });

  it('setBaseOffset accepts negative offsets', async () => {
    env = buildEnv();
    const id = createId('slab');
    await env.bus.executeCommand('slab.create', { id, boundary: SQUARE });
    await env.bus.executeCommand('slab.setBaseOffset', { slabId: id, baseOffset: -1.5 });
    expect(env.slab.get(id)?.baseOffset).toBe(-1.5);
  });
});

describe('slab holes (add/remove)', () => {
  let env: ReturnType<typeof buildEnv>;
  afterEach(() => env?.detach());

  const HOLE = [
    { x: 1, y: 0, z: 1 },
    { x: 2, y: 0, z: 1 },
    { x: 2, y: 0, z: 2 },
    { x: 1, y: 0, z: 2 },
  ];

  it('addHole appends and undo restores', async () => {
    env = buildEnv();
    const id = createId('slab');
    await env.bus.executeCommand('slab.create', { id, boundary: SQUARE });
    const before = snap(env.slab);
    const ev = await env.bus.executeCommand('slab.addHole', { slabId: id, hole: HOLE });
    expect(env.slab.get(id)?.holes.length).toBe(1);
    undoLast(env.slab, ev);
    expect(snap(env.slab)).toEqual(before);
  });

  it('removeHole splices the requested index and undoes', async () => {
    env = buildEnv();
    const id = createId('slab');
    await env.bus.executeCommand('slab.create', { id, boundary: SQUARE, holes: [HOLE] });
    const before = snap(env.slab);
    const ev = await env.bus.executeCommand('slab.removeHole', { slabId: id, holeIndex: 0 });
    expect(env.slab.get(id)?.holes.length).toBe(0);
    undoLast(env.slab, ev);
    expect(snap(env.slab)).toEqual(before);
  });

  it('removeHole rejects out-of-range index', async () => {
    env = buildEnv();
    const id = createId('slab');
    await env.bus.executeCommand('slab.create', { id, boundary: SQUARE });
    await expect(
      env.bus.executeCommand('slab.removeHole', { slabId: id, holeIndex: 0 }),
    ).rejects.toThrow();
  });
});

describe('slab.setType', () => {
  let env: ReturnType<typeof buildEnv>;
  afterEach(() => env?.detach());

  it('records systemTypeId without clobbering geometry', async () => {
    env = buildEnv();
    const id = createId('slab');
    await env.bus.executeCommand('slab.create', { id, boundary: SQUARE, thickness: 0.2 });
    await env.bus.executeCommand('slab.setType', {
      slabId: id,
      systemTypeId: 'slab.concrete.200mm',
      materialColor: '#bcbcbc',
    });
    const s = env.slab.get(id)!;
    expect(s.systemTypeId).toBe('slab.concrete.200mm');
    expect(s.materialColor).toBe('#bcbcbc');
    expect(s.thickness).toBe(0.2);
  });
});

describe('slab.delete', () => {
  let env: ReturnType<typeof buildEnv>;
  afterEach(() => env?.detach());

  it('removes slab and undo restores byte-for-byte', async () => {
    env = buildEnv();
    const id = createId('slab');
    await env.bus.executeCommand('slab.create', { id, boundary: SQUARE });
    const before = snap(env.slab);
    const ev = await env.bus.executeCommand('slab.delete', { slabId: id });
    expect(env.slab.size()).toBe(0);
    undoLast(env.slab, ev);
    expect(snap(env.slab)).toEqual(before);
  });
});
