// Roof handler end-to-end test suite (S11-T3).

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
  RoofStore,
  type RoofData,
  type RoofsState,
} from '../src/store.js';
import {
  buildRoofHandlerSet,
  registerRoofHandlers,
  ROOF_HANDLER_TYPES,
} from '../src/handlers/index.js';
import { BUILTIN_ROOF_TYPES } from '@pryzm/plugin-sdk';

function buildEnv() {
  const roof = new RoofStore();
  const stores = { roof: roof as unknown as import('@pryzm/stores').Store<object> };
  const emitter = new PatchEmitter();
  const undoStack = new UndoStack({ maxSize: 50 });
  const bus = new CommandBus({
    audit: { actorId: 'test', projectId: 'p1', clientId: 't1' },
    emitter,
    undoStack,
    storesProvider: () => ({
      roof: Object.fromEntries(roof.getState()) as RoofsState,
    }),
  });
  for (const h of buildRoofHandlerSet()) bus.register(h);
  const detach = attachStores(emitter, stores);
  return { roof, bus, emitter, undoStack, detach };
}

function snap(store: RoofStore): Record<string, RoofData> {
  return JSON.parse(JSON.stringify(Object.fromEntries(store.getState())));
}

function undoLast(store: RoofStore, ev: EventRecord<unknown>): void {
  store.applyPatch([...ev.inverse].reverse());
}

const SQUARE = [
  { x: 0, y: 0, z: 0 },
  { x: 5, y: 0, z: 0 },
  { x: 5, y: 0, z: 5 },
  { x: 0, y: 0, z: 5 },
];

describe('roof handler registration', () => {
  it('registerRoofHandlers wires all 8 command types', () => {
    const env = buildEnv();
    const bus = new CommandBus({
      audit: { actorId: 'test', projectId: 'p1', clientId: 't1' },
      storesProvider: () => ({ roof: {} }),
    });
    const types = registerRoofHandlers(bus);
    expect([...types].sort()).toEqual([...ROOF_HANDLER_TYPES].sort());
    for (const t of ROOF_HANDLER_TYPES) expect(bus.has(t)).toBe(true);
    env.detach();
  });
});

describe('roof.create', () => {
  let env: ReturnType<typeof buildEnv>;
  afterEach(() => env?.detach());

  it('creates a roof with caller-provided id and round-trips on undo', async () => {
    env = buildEnv();
    const id = createId('roof');
    const before = snap(env.roof);
    const ev = await env.bus.executeCommand('roof.create', {
      id, levelId: 'lvl_1', boundary: SQUARE,
    });
    expect(env.roof.size()).toBe(1);
    expect(env.roof.get(id)?.shape).toBe('flat');
    undoLast(env.roof, ev);
    expect(snap(env.roof)).toEqual(before);
  });

  it('applies type defaults from systemTypeId', async () => {
    env = buildEnv();
    const id = createId('roof');
    const t = BUILTIN_ROOF_TYPES[1]!; // gable
    await env.bus.executeCommand('roof.create', {
      id, levelId: 'lvl_1', boundary: SQUARE, systemTypeId: t.id,
    });
    const created = env.roof.get(id)!;
    expect(created.shape).toBe(t.shape);
    expect(created.pitch).toBeCloseTo(t.pitch);
    expect(created.thickness).toBe(t.thickness);
  });

  it('rejects unknown systemTypeId', async () => {
    env = buildEnv();
    await expect(
      env.bus.executeCommand('roof.create', {
        boundary: SQUARE,
        systemTypeId: 'roof.does.not.exist',
      }),
    ).rejects.toThrow(/not found/i);
  });

  it('rejects pitch out of range', async () => {
    env = buildEnv();
    await expect(
      env.bus.executeCommand('roof.create', {
        boundary: SQUARE,
        pitch: Math.PI,
      }),
    ).rejects.toThrow();
  });
});

describe('roof.delete', () => {
  let env: ReturnType<typeof buildEnv>;
  afterEach(() => env?.detach());

  it('removes a roof and round-trips on undo', async () => {
    env = buildEnv();
    const id = createId('roof');
    await env.bus.executeCommand('roof.create', { id, boundary: SQUARE });
    const before = snap(env.roof);
    const ev = await env.bus.executeCommand('roof.delete', { roofId: id });
    expect(env.roof.get(id)).toBeUndefined();
    undoLast(env.roof, ev);
    expect(snap(env.roof)).toEqual(before);
  });

  it('rejects unknown roof', async () => {
    env = buildEnv();
    await expect(
      env.bus.executeCommand('roof.delete', { roofId: 'roof_nope' }),
    ).rejects.toThrow(/not found/i);
  });
});

describe('roof.setShape', () => {
  let env: ReturnType<typeof buildEnv>;
  afterEach(() => env?.detach());

  it('updates shape and forces pitch=0 when switching to flat', async () => {
    env = buildEnv();
    const id = createId('roof');
    await env.bus.executeCommand('roof.create', {
      id, boundary: SQUARE, shape: 'gable', pitch: 0.4,
    });
    const ev = await env.bus.executeCommand('roof.setShape', {
      roofId: id, shape: 'flat',
    });
    expect(env.roof.get(id)?.shape).toBe('flat');
    expect(env.roof.get(id)?.pitch).toBe(0);
    undoLast(env.roof, ev);
    expect(env.roof.get(id)?.shape).toBe('gable');
  });
});

describe('roof.setPitch', () => {
  let env: ReturnType<typeof buildEnv>;
  afterEach(() => env?.detach());

  it('updates pitch on a pitched roof', async () => {
    env = buildEnv();
    const id = createId('roof');
    await env.bus.executeCommand('roof.create', {
      id, boundary: SQUARE, shape: 'gable', pitch: 0.3,
    });
    const ev = await env.bus.executeCommand('roof.setPitch', {
      roofId: id, pitch: 0.5,
    });
    expect(env.roof.get(id)?.pitch).toBeCloseTo(0.5);
    undoLast(env.roof, ev);
    expect(env.roof.get(id)?.pitch).toBeCloseTo(0.3);
  });

  it('rejects non-zero pitch on a flat roof', async () => {
    env = buildEnv();
    const id = createId('roof');
    await env.bus.executeCommand('roof.create', { id, boundary: SQUARE });
    await expect(
      env.bus.executeCommand('roof.setPitch', { roofId: id, pitch: 0.3 }),
    ).rejects.toThrow();
  });
});

describe('roof.setThickness', () => {
  let env: ReturnType<typeof buildEnv>;
  afterEach(() => env?.detach());

  it('updates thickness and round-trips on undo', async () => {
    env = buildEnv();
    const id = createId('roof');
    await env.bus.executeCommand('roof.create', { id, boundary: SQUARE });
    const before = snap(env.roof);
    const ev = await env.bus.executeCommand('roof.setThickness', {
      roofId: id, thickness: 0.4,
    });
    expect(env.roof.get(id)?.thickness).toBe(0.4);
    undoLast(env.roof, ev);
    expect(snap(env.roof)).toEqual(before);
  });

  it('rejects non-positive thickness', async () => {
    env = buildEnv();
    const id = createId('roof');
    await env.bus.executeCommand('roof.create', { id, boundary: SQUARE });
    await expect(
      env.bus.executeCommand('roof.setThickness', { roofId: id, thickness: 0 }),
    ).rejects.toThrow();
  });
});

describe('roof.setOverhang', () => {
  let env: ReturnType<typeof buildEnv>;
  afterEach(() => env?.detach());

  it('updates overhang and round-trips on undo', async () => {
    env = buildEnv();
    const id = createId('roof');
    await env.bus.executeCommand('roof.create', { id, boundary: SQUARE });
    const before = snap(env.roof);
    const ev = await env.bus.executeCommand('roof.setOverhang', {
      roofId: id, overhang: 0.6,
    });
    expect(env.roof.get(id)?.overhang).toBe(0.6);
    undoLast(env.roof, ev);
    expect(snap(env.roof)).toEqual(before);
  });

  it('rejects negative overhang', async () => {
    env = buildEnv();
    const id = createId('roof');
    await env.bus.executeCommand('roof.create', { id, boundary: SQUARE });
    await expect(
      env.bus.executeCommand('roof.setOverhang', { roofId: id, overhang: -0.1 }),
    ).rejects.toThrow();
  });
});

describe('roof.move', () => {
  let env: ReturnType<typeof buildEnv>;
  afterEach(() => env?.detach());

  it('translates the boundary and round-trips on undo', async () => {
    env = buildEnv();
    const id = createId('roof');
    await env.bus.executeCommand('roof.create', { id, boundary: SQUARE });
    const before = snap(env.roof);
    const ev = await env.bus.executeCommand('roof.move', {
      roofId: id, delta: { x: 1, y: 0, z: 2 },
    });
    const after = env.roof.get(id)!;
    expect(after.boundary[0]!.x).toBeCloseTo(1);
    expect(after.boundary[0]!.z).toBeCloseTo(2);
    undoLast(env.roof, ev);
    expect(snap(env.roof)).toEqual(before);
  });
});

describe('roof.changeLevel', () => {
  let env: ReturnType<typeof buildEnv>;
  afterEach(() => env?.detach());

  it('updates levelId and round-trips on undo', async () => {
    env = buildEnv();
    const id = createId('roof');
    await env.bus.executeCommand('roof.create', {
      id, levelId: 'lvl_1', boundary: SQUARE,
    });
    const before = snap(env.roof);
    const ev = await env.bus.executeCommand('roof.changeLevel', {
      roofId: id, levelId: 'lvl_2',
    });
    expect(env.roof.get(id)?.levelId).toBe('lvl_2');
    undoLast(env.roof, ev);
    expect(snap(env.roof)).toEqual(before);
  });

  it('rejects empty levelId', async () => {
    env = buildEnv();
    const id = createId('roof');
    await env.bus.executeCommand('roof.create', { id, boundary: SQUARE });
    await expect(
      env.bus.executeCommand('roof.changeLevel', { roofId: id, levelId: '' }),
    ).rejects.toThrow();
  });
});
