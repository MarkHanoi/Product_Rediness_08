// Furniture handler smoke suite (S27 / ADR-0027).

import { afterEach, describe, expect, it } from 'vitest';
import { CommandBus, PatchEmitter, UndoStack, type EventRecord } from '@pryzm/plugin-sdk';
import { attachStores } from '@pryzm/plugin-sdk';
import { createId } from '@pryzm/plugin-sdk';
import { FurnitureStore, type FurnitureData, type FurnituresState } from '../src/store.js';
import {
  buildFurnitureHandlerSet,
  registerFurnitureHandlers,
  FURNITURE_HANDLER_TYPES,
} from '../src/handlers/index.js';
import { SEED_FURNITURE_CATALOGUE } from '../src/catalogue/seed.js';

function buildEnv() {
  const furniture = new FurnitureStore();
  const stores = { furniture: furniture as unknown as import('@pryzm/stores').Store<object> };
  const emitter = new PatchEmitter();
  const undoStack = new UndoStack({ maxSize: 50 });
  const bus = new CommandBus({
    audit: { actorId: 'test', projectId: 'p1', clientId: 't1' },
    emitter,
    undoStack,
    storesProvider: () => ({
      furniture: Object.fromEntries(furniture.getState()) as FurnituresState,
    }),
  });
  for (const h of buildFurnitureHandlerSet()) bus.register(h);
  const detach = attachStores(emitter, stores);
  return { furniture, bus, detach };
}

function snap(s: FurnitureStore): Record<string, FurnitureData> {
  return JSON.parse(JSON.stringify(Object.fromEntries(s.getState())));
}

function undoLast(s: FurnitureStore, ev: EventRecord<unknown>): void {
  s.applyPatch([...ev.inverse].reverse());
}

const sofaSeed = SEED_FURNITURE_CATALOGUE.find((e) => e.id === 'pryzm/sofa-3s')!;

describe('furniture handler registration', () => {
  it('registerFurnitureHandlers wires all 7 command types', () => {
    const env = buildEnv();
    const bus = new CommandBus({
      audit: { actorId: 'test', projectId: 'p1', clientId: 't1' },
      storesProvider: () => ({ furniture: {} }),
    });
    const types = registerFurnitureHandlers(bus);
    expect([...types].sort()).toEqual([...FURNITURE_HANDLER_TYPES].sort());
    env.detach();
  });
});

describe('furniture.create / move / delete', () => {
  let env: ReturnType<typeof buildEnv>;
  afterEach(() => env?.detach());

  it('creates a furniture with caller id and inverts', async () => {
    env = buildEnv();
    const id = createId('furniture');
    const before = snap(env.furniture);
    const ev = await env.bus.executeCommand('furniture.create', {
      id,
      catalogId: sofaSeed.id,
      origin: { x: 1, y: 0, z: 2 },
      representations: sofaSeed.representations,
      activeLod: 2,
    }) as EventRecord<unknown>;
    expect(env.furniture.get(id)).toBeDefined();
    expect(env.furniture.get(id)!.catalogId).toBe(sofaSeed.id);
    expect(env.furniture.get(id)!.activeLod).toBe(2);
    undoLast(env.furniture, ev);
    expect(snap(env.furniture)).toEqual(before);
  });

  it('rejects negative scale at validation', async () => {
    env = buildEnv();
    await expect(
      env.bus.executeCommand('furniture.create', { scale: -1 }),
    ).rejects.toThrow();
  });

  it('rejects non-finite origin at validation', async () => {
    env = buildEnv();
    await expect(
      env.bus.executeCommand('furniture.create', { origin: { x: NaN, y: 0, z: 0 } }),
    ).rejects.toThrow();
  });

  it('rejects out-of-range activeLod at validation', async () => {
    env = buildEnv();
    await expect(
      env.bus.executeCommand('furniture.create', { activeLod: 5 }),
    ).rejects.toThrow();
  });

  it('moves an existing element by delta and inverts', async () => {
    env = buildEnv();
    const id = createId('furniture');
    await env.bus.executeCommand('furniture.create', { id, origin: { x: 0, y: 0, z: 0 } });
    const ev = await env.bus.executeCommand('furniture.move', {
      furnitureId: id, delta: { x: 5, y: 0, z: 3 },
    }) as EventRecord<unknown>;
    const moved = env.furniture.get(id)!;
    expect(moved.origin.x).toBeCloseTo(5);
    expect(moved.origin.z).toBeCloseTo(3);
    undoLast(env.furniture, ev);
    expect(env.furniture.get(id)!.origin.x).toBeCloseTo(0);
  });

  it('deletes and inverts', async () => {
    env = buildEnv();
    const id = createId('furniture');
    await env.bus.executeCommand('furniture.create', { id });
    const before = snap(env.furniture);
    const ev = await env.bus.executeCommand('furniture.delete', { furnitureId: id }) as EventRecord<unknown>;
    expect(env.furniture.get(id)).toBeUndefined();
    undoLast(env.furniture, ev);
    expect(snap(env.furniture)).toEqual(before);
  });
});

describe('furniture.rotate / setScale', () => {
  let env: ReturnType<typeof buildEnv>;
  afterEach(() => env?.detach());

  it('rotate sets absolute Y-rotation', async () => {
    env = buildEnv();
    const id = createId('furniture');
    await env.bus.executeCommand('furniture.create', { id, rotation: 0 });
    await env.bus.executeCommand('furniture.rotate', { furnitureId: id, rotation: Math.PI / 2 });
    expect(env.furniture.get(id)!.rotation).toBeCloseTo(Math.PI / 2);
  });

  it('rotate rejects non-finite rotation', async () => {
    env = buildEnv();
    const id = createId('furniture');
    await env.bus.executeCommand('furniture.create', { id });
    await expect(
      env.bus.executeCommand('furniture.rotate', { furnitureId: id, rotation: Infinity }),
    ).rejects.toThrow();
  });

  it('setScale sets absolute uniform scale and inverts', async () => {
    env = buildEnv();
    const id = createId('furniture');
    await env.bus.executeCommand('furniture.create', { id, scale: 1 });
    const ev = await env.bus.executeCommand('furniture.setScale', {
      furnitureId: id, scale: 2.5,
    }) as EventRecord<unknown>;
    expect(env.furniture.get(id)!.scale).toBeCloseTo(2.5);
    undoLast(env.furniture, ev);
    expect(env.furniture.get(id)!.scale).toBeCloseTo(1);
  });

  it('setScale rejects 0 and negative', async () => {
    env = buildEnv();
    const id = createId('furniture');
    await env.bus.executeCommand('furniture.create', { id });
    await expect(
      env.bus.executeCommand('furniture.setScale', { furnitureId: id, scale: 0 }),
    ).rejects.toThrow();
    await expect(
      env.bus.executeCommand('furniture.setScale', { furnitureId: id, scale: -1 }),
    ).rejects.toThrow();
  });
});

describe('furniture.setActiveLod / setRepresentation', () => {
  let env: ReturnType<typeof buildEnv>;
  afterEach(() => env?.detach());

  it('setActiveLod swaps the active level and inverts', async () => {
    env = buildEnv();
    const id = createId('furniture');
    await env.bus.executeCommand('furniture.create', {
      id, representations: sofaSeed.representations, activeLod: 2,
    });
    const ev = await env.bus.executeCommand('furniture.setActiveLod', {
      furnitureId: id, lod: 4,
    }) as EventRecord<unknown>;
    expect(env.furniture.get(id)!.activeLod).toBe(4);
    undoLast(env.furniture, ev);
    expect(env.furniture.get(id)!.activeLod).toBe(2);
  });

  it('setActiveLod rejects out-of-range lod', async () => {
    env = buildEnv();
    const id = createId('furniture');
    await env.bus.executeCommand('furniture.create', { id });
    await expect(
      env.bus.executeCommand('furniture.setActiveLod', { furnitureId: id, lod: 5 }),
    ).rejects.toThrow();
    await expect(
      env.bus.executeCommand('furniture.setActiveLod', { furnitureId: id, lod: -1 }),
    ).rejects.toThrow();
  });

  it('setRepresentation overwrites a single LOD slot', async () => {
    env = buildEnv();
    const id = createId('furniture');
    await env.bus.executeCommand('furniture.create', { id });
    const rep = sofaSeed.representations['3'];
    expect(rep).toBeDefined();
    await env.bus.executeCommand('furniture.setRepresentation', {
      furnitureId: id, lod: 3, representation: rep,
    });
    expect(env.furniture.get(id)!.representations['3']).toBeDefined();
    expect(env.furniture.get(id)!.representations['3']!.indices.length).toBe(rep!.indices.length);
  });

  it('setRepresentation with undefined clears the slot', async () => {
    env = buildEnv();
    const id = createId('furniture');
    await env.bus.executeCommand('furniture.create', {
      id, representations: { '2': sofaSeed.representations['2']! },
    });
    expect(env.furniture.get(id)!.representations['2']).toBeDefined();
    await env.bus.executeCommand('furniture.setRepresentation', {
      furnitureId: id, lod: 2, representation: undefined,
    });
    expect(env.furniture.get(id)!.representations['2']).toBeUndefined();
  });

  it('setRepresentation rejects malformed representation', async () => {
    env = buildEnv();
    const id = createId('furniture');
    await env.bus.executeCommand('furniture.create', { id });
    await expect(
      env.bus.executeCommand('furniture.setRepresentation', {
        furnitureId: id, lod: 2,
        // Length 4 — not divisible by 3, must fail the schema refine.
        representation: { positions: [0, 0, 0, 1], indices: [] },
      }),
    ).rejects.toThrow();
  });
});

describe('handlers reject missing entities', () => {
  let env: ReturnType<typeof buildEnv>;
  afterEach(() => env?.detach());

  it('move / rotate / setScale / setActiveLod / setRepresentation / delete all reject unknown id', async () => {
    env = buildEnv();
    const ghostId = createId('furniture');
    await expect(
      env.bus.executeCommand('furniture.move', { furnitureId: ghostId, delta: { x: 0, y: 0, z: 0 } }),
    ).rejects.toThrow();
    await expect(
      env.bus.executeCommand('furniture.rotate', { furnitureId: ghostId, rotation: 0 }),
    ).rejects.toThrow();
    await expect(
      env.bus.executeCommand('furniture.setScale', { furnitureId: ghostId, scale: 1 }),
    ).rejects.toThrow();
    await expect(
      env.bus.executeCommand('furniture.setActiveLod', { furnitureId: ghostId, lod: 0 }),
    ).rejects.toThrow();
    await expect(
      env.bus.executeCommand('furniture.setRepresentation', { furnitureId: ghostId, lod: 0 }),
    ).rejects.toThrow();
    await expect(
      env.bus.executeCommand('furniture.delete', { furnitureId: ghostId }),
    ).rejects.toThrow();
  });
});
