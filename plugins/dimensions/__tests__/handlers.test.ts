// Dimension handler smoke suite (S29 / ADR-0028).

import { afterEach, describe, expect, it } from 'vitest';
import { CommandBus, PatchEmitter, UndoStack, type EventRecord } from '@pryzm/plugin-sdk';
import { attachStores } from '@pryzm/plugin-sdk';
import { createId } from '@pryzm/plugin-sdk';
import { DimensionStore, type DimensionData, type DimensionsState } from '../src/store.js';
import {
  buildDimensionHandlerSet,
  registerDimensionHandlers,
  DIMENSION_HANDLER_TYPES,
} from '../src/handlers/index.js';

function buildEnv() {
  const dimension = new DimensionStore();
  const stores = { dimension: dimension as unknown as import('@pryzm/stores').Store<object> };
  const emitter = new PatchEmitter();
  const undoStack = new UndoStack({ maxSize: 50 });
  const bus = new CommandBus({
    audit: { actorId: 'test', projectId: 'p1', clientId: 't1' },
    emitter,
    undoStack,
    storesProvider: () => ({
      dimension: Object.fromEntries(dimension.getState()) as DimensionsState,
    }),
  });
  for (const h of buildDimensionHandlerSet()) bus.register(h);
  const detach = attachStores(emitter, stores);
  return { dimension, bus, detach };
}

function snap(s: DimensionStore): Record<string, DimensionData> {
  return JSON.parse(JSON.stringify(Object.fromEntries(s.getState())));
}

function undoLast(s: DimensionStore, ev: EventRecord<unknown>): void {
  s.applyPatch([...ev.inverse].reverse());
}

describe('dimension handler registration', () => {
  it('registerDimensionHandlers wires all 6 command types', () => {
    const env = buildEnv();
    const bus = new CommandBus({
      audit: { actorId: 'test', projectId: 'p1', clientId: 't1' },
      storesProvider: () => ({ dimension: {} }),
    });
    const types = registerDimensionHandlers(bus);
    expect([...types].sort()).toEqual([...DIMENSION_HANDLER_TYPES].sort());
    env.detach();
  });

  it('buildDimensionHandlerSet returns 7 handlers', () => {
    expect(buildDimensionHandlerSet()).toHaveLength(7);
  });
});

describe('dimension.createMany (§FEAT-AUTODIMENSION-P1)', () => {
  let env: ReturnType<typeof buildEnv>;
  afterEach(() => env?.detach());

  it('creates every dimension in ONE command and inverts as ONE undo', async () => {
    env = buildEnv();
    const before = snap(env.dimension);
    const ev = await env.bus.executeCommand('dimension.createMany', {
      dimensions: [
        { points: [{ x: 0, y: 0, z: 0 }, { x: 4, y: 0, z: 0 }], levelId: 'L1', offsetMm: 8 },
        { points: [{ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 3 }], levelId: 'L1', offsetMm: 16 },
        { points: [{ x: 1, y: 0, z: 0 }, { x: 2, y: 0, z: 0 }], levelId: 'L1', offsetMm: 24 },
      ],
    }) as EventRecord<unknown>;
    expect(Object.keys(snap(env.dimension))).toHaveLength(3);
    // Single inverse patch set restores the pre-batch state → one undo unit.
    undoLast(env.dimension, ev);
    expect(snap(env.dimension)).toEqual(before);
  });

  it('rejects an empty batch and non-finite points', async () => {
    env = buildEnv();
    await expect(env.bus.executeCommand('dimension.createMany', { dimensions: [] })).rejects.toThrow();
    await expect(env.bus.executeCommand('dimension.createMany', {
      dimensions: [{ points: [{ x: Number.NaN, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }] }],
    })).rejects.toThrow();
  });
});

describe('dimension.create / move / delete', () => {
  let env: ReturnType<typeof buildEnv>;
  afterEach(() => env?.detach());

  it('creates a linear dimension with caller id and inverts cleanly', async () => {
    env = buildEnv();
    const id = createId('dimension');
    const before = snap(env.dimension);
    const ev = await env.bus.executeCommand('dimension.create', {
      id,
      kind: 'linear',
      points: [{ x: 0, y: 0, z: 0 }, { x: 4, y: 0, z: 0 }],
      levelId: 'L1',
      units: 'm',
      precision: 2,
    }) as EventRecord<unknown>;
    expect(env.dimension.get(id)).toBeDefined();
    expect(env.dimension.get(id)!.points).toHaveLength(2);
    expect(env.dimension.get(id)!.units).toBe('m');
    undoLast(env.dimension, ev);
    expect(snap(env.dimension)).toEqual(before);
  });

  it('rejects non-finite points at validation', async () => {
    env = buildEnv();
    await expect(env.bus.executeCommand('dimension.create', {
      points: [{ x: Number.NaN, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }],
    })).rejects.toThrow();
  });

  it('rejects out-of-range precision at validation', async () => {
    env = buildEnv();
    await expect(env.bus.executeCommand('dimension.create', { precision: 99 })).rejects.toThrow();
  });

  it('move refuses; nothing dispatches it and annotation.move is the live route', async () => {
    env = buildEnv();
    const id = createId('dimension');
    await env.bus.executeCommand('dimension.create', {
      id,
      points: [{ x: 0, y: 0, z: 0 }, { x: 4, y: 0, z: 0 }],
    });
    const before = env.dimension.get(id)!.points.map((p) => ({ ...p }));
    // §FIX-DEAD-MOVE-VERB-REFUSE (W3-4) — `dimension.move` writes the DETACHED plugin
    // dimension store and NO surface dispatches it: not MOVE_COMMAND_BY_TYPE, not the
    // 3-D gizmo, not the Align tool, not the property panel. The dimensions a user can
    // actually see are annotation elements on the canonical annotationStore
    // (§ANN-ONE-STORE), and `annotation.move` — which IS live, and is deliberately NOT
    // refused by this wave — is the verb that translates them.
    await expect(
      env.bus.executeCommand('dimension.move', { dimensionId: id, delta: { x: 1, y: 2, z: 3 } }),
    ).rejects.toThrow(/annotation\.move/);
    expect(env.dimension.get(id)!.points).toEqual(before);
  });

  it('rejects move with non-finite delta', async () => {
    env = buildEnv();
    const id = createId('dimension');
    await env.bus.executeCommand('dimension.create', { id });
    await expect(env.bus.executeCommand('dimension.move', {
      dimensionId: id, delta: { x: Number.NaN, y: 0, z: 0 },
    })).rejects.toThrow();
  });

  it('rejects move on missing dimension', async () => {
    env = buildEnv();
    await expect(env.bus.executeCommand('dimension.move', {
      dimensionId: 'dimension_01HZZZZZZZZZZZZZZZZZZZZZZZ',
      delta: { x: 1, y: 0, z: 0 },
    })).rejects.toThrow();
  });

  it('deletes a dimension and inverts back', async () => {
    env = buildEnv();
    const id = createId('dimension');
    await env.bus.executeCommand('dimension.create', { id });
    expect(env.dimension.get(id)).toBeDefined();
    const ev = await env.bus.executeCommand('dimension.delete', { dimensionId: id }) as EventRecord<unknown>;
    expect(env.dimension.get(id)).toBeUndefined();
    undoLast(env.dimension, ev);
    expect(env.dimension.get(id)).toBeDefined();
  });
});

describe('dimension.setPrecision / setUnit / setText', () => {
  let env: ReturnType<typeof buildEnv>;
  afterEach(() => env?.detach());

  it('setPrecision patches precision', async () => {
    env = buildEnv();
    const id = createId('dimension');
    await env.bus.executeCommand('dimension.create', { id, precision: 0 });
    await env.bus.executeCommand('dimension.setPrecision', { dimensionId: id, precision: 3 });
    expect(env.dimension.get(id)!.precision).toBe(3);
  });

  it('setPrecision rejects non-integers and out-of-range', async () => {
    env = buildEnv();
    const id = createId('dimension');
    await env.bus.executeCommand('dimension.create', { id });
    await expect(env.bus.executeCommand('dimension.setPrecision', { dimensionId: id, precision: 1.5 })).rejects.toThrow();
    await expect(env.bus.executeCommand('dimension.setPrecision', { dimensionId: id, precision: -1 })).rejects.toThrow();
    await expect(env.bus.executeCommand('dimension.setPrecision', { dimensionId: id, precision: 7 })).rejects.toThrow();
  });

  it('setUnit patches units', async () => {
    env = buildEnv();
    const id = createId('dimension');
    await env.bus.executeCommand('dimension.create', { id, units: 'mm' });
    await env.bus.executeCommand('dimension.setUnit', { dimensionId: id, units: 'ft' });
    expect(env.dimension.get(id)!.units).toBe('ft');
  });

  it('setUnit rejects unknown unit', async () => {
    env = buildEnv();
    const id = createId('dimension');
    await env.bus.executeCommand('dimension.create', { id });
    await expect(env.bus.executeCommand('dimension.setUnit', { dimensionId: id, units: 'parsecs' })).rejects.toThrow();
  });

  it('setText sets override text and clears with null', async () => {
    env = buildEnv();
    const id = createId('dimension');
    await env.bus.executeCommand('dimension.create', { id });
    expect(env.dimension.get(id)!.overridden).toBe(false);

    await env.bus.executeCommand('dimension.setText', { dimensionId: id, overrideText: 'EQ' });
    expect(env.dimension.get(id)!.overridden).toBe(true);
    expect(env.dimension.get(id)!.overrideText).toBe('EQ');

    await env.bus.executeCommand('dimension.setText', { dimensionId: id, overrideText: null });
    expect(env.dimension.get(id)!.overridden).toBe(false);
    expect(env.dimension.get(id)!.overrideText).toBeUndefined();
  });

  it('setText rejects non-string non-null payload', async () => {
    env = buildEnv();
    const id = createId('dimension');
    await env.bus.executeCommand('dimension.create', { id });
    await expect(env.bus.executeCommand('dimension.setText', {
      dimensionId: id,
      overrideText: 42 as unknown as string,
    })).rejects.toThrow();
  });
});
