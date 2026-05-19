// Structural handler smoke suite (S26 / ADR-0026).

import { afterEach, describe, expect, it } from 'vitest';
import { CommandBus, PatchEmitter, UndoStack, type EventRecord } from '@pryzm/plugin-sdk';
import { attachStores } from '@pryzm/plugin-sdk';
import { createId } from '@pryzm/plugin-sdk';
import { StructuralStore, type StructuralData, type StructuralsState } from '../src/store.js';
import {
  buildStructuralHandlerSet,
  registerStructuralHandlers,
  STRUCTURAL_HANDLER_TYPES,
} from '../src/handlers/index.js';

function buildEnv() {
  const structural = new StructuralStore();
  const stores = { structural: structural as unknown as import('@pryzm/stores').Store<object> };
  const emitter = new PatchEmitter();
  const undoStack = new UndoStack({ maxSize: 50 });
  const bus = new CommandBus({
    audit: { actorId: 'test', projectId: 'p1', clientId: 't1' },
    emitter,
    undoStack,
    storesProvider: () => ({
      structural: Object.fromEntries(structural.getState()) as StructuralsState,
    }),
  });
  for (const h of buildStructuralHandlerSet()) bus.register(h);
  const detach = attachStores(emitter, stores);
  return { structural, bus, detach };
}

function snap(s: StructuralStore): Record<string, StructuralData> {
  return JSON.parse(JSON.stringify(Object.fromEntries(s.getState())));
}

function undoLast(s: StructuralStore, ev: EventRecord<unknown>): void {
  s.applyPatch([...ev.inverse].reverse());
}

describe('structural handler registration', () => {
  it('registerStructuralHandlers wires all 7 command types', () => {
    const env = buildEnv();
    const bus = new CommandBus({
      audit: { actorId: 'test', projectId: 'p1', clientId: 't1' },
      storesProvider: () => ({ structural: {} }),
    });
    const types = registerStructuralHandlers(bus);
    expect([...types].sort()).toEqual([...STRUCTURAL_HANDLER_TYPES].sort());
    env.detach();
  });
});

describe('structural.create / move / delete', () => {
  let env: ReturnType<typeof buildEnv>;
  afterEach(() => env?.detach());

  it('creates a footing with caller id and inverts', async () => {
    env = buildEnv();
    const id = createId('structural');
    const before = snap(env.structural);
    const ev = await env.bus.executeCommand('structural.create', {
      id, kind: 'footing', origin: { x: 1, y: 0, z: 2 }, width: 0.6, depth: 0.6, thickness: 0.4,
    }) as EventRecord<unknown>;
    expect(env.structural.get(id)).toBeDefined();
    undoLast(env.structural, ev);
    expect(snap(env.structural)).toEqual(before);
  });

  it('rejects negative width at validation', async () => {
    env = buildEnv();
    await expect(
      env.bus.executeCommand('structural.create', { width: -1 }),
    ).rejects.toThrow();
  });

  it('moves an existing element by delta and inverts', async () => {
    env = buildEnv();
    const id = createId('structural');
    await env.bus.executeCommand('structural.create', { id, kind: 'connection', origin: { x: 0, y: 0, z: 0 } });
    const ev = await env.bus.executeCommand('structural.move', {
      structuralId: id, delta: { x: 5, y: 0, z: 3 },
    }) as EventRecord<unknown>;
    const moved = env.structural.get(id)!;
    expect(moved.origin.x).toBeCloseTo(5);
    expect(moved.origin.z).toBeCloseTo(3);
    undoLast(env.structural, ev);
    expect(env.structural.get(id)!.origin.x).toBeCloseTo(0);
  });

  it('deletes and inverts', async () => {
    env = buildEnv();
    const id = createId('structural');
    await env.bus.executeCommand('structural.create', { id, kind: 'footing' });
    const before = snap(env.structural);
    const ev = await env.bus.executeCommand('structural.delete', { structuralId: id }) as EventRecord<unknown>;
    expect(env.structural.get(id)).toBeUndefined();
    undoLast(env.structural, ev);
    expect(snap(env.structural)).toEqual(before);
  });
});

describe('structural.setKind / setDimensions / setMaterial / setBraceEndOffset', () => {
  let env: ReturnType<typeof buildEnv>;
  afterEach(() => env?.detach());

  it('setKind switches sub-type', async () => {
    env = buildEnv();
    const id = createId('structural');
    await env.bus.executeCommand('structural.create', { id, kind: 'footing' });
    await env.bus.executeCommand('structural.setKind', { structuralId: id, kind: 'foundation-slab' });
    expect(env.structural.get(id)!.kind).toBe('foundation-slab');
  });

  it('setDimensions patches multiple fields atomically', async () => {
    env = buildEnv();
    const id = createId('structural');
    await env.bus.executeCommand('structural.create', { id, kind: 'footing' });
    await env.bus.executeCommand('structural.setDimensions', {
      structuralId: id, width: 1.2, depth: 1.2, thickness: 0.5,
    });
    const s = env.structural.get(id)!;
    expect(s.width).toBeCloseTo(1.2);
    expect(s.depth).toBeCloseTo(1.2);
    expect(s.thickness).toBeCloseTo(0.5);
  });

  it('setMaterial assigns and clears materialId', async () => {
    env = buildEnv();
    const id = createId('structural');
    await env.bus.executeCommand('structural.create', { id, kind: 'footing' });
    await env.bus.executeCommand('structural.setMaterial', { structuralId: id, materialId: 'concrete-A' });
    expect(env.structural.get(id)!.materialId).toBe('concrete-A');
    await env.bus.executeCommand('structural.setMaterial', { structuralId: id });
    expect(env.structural.get(id)!.materialId).toBeUndefined();
  });

  it('setBraceEndOffset only valid for kind=brace', async () => {
    env = buildEnv();
    const id = createId('structural');
    await env.bus.executeCommand('structural.create', {
      id, kind: 'brace', endOffset: { x: 1, y: 0, z: 0 },
    });
    await env.bus.executeCommand('structural.setBraceEndOffset', {
      structuralId: id, endOffset: { x: 2, y: 1, z: 0 },
    });
    expect(env.structural.get(id)!.endOffset).toEqual({ x: 2, y: 1, z: 0 });

    const idF = createId('structural');
    await env.bus.executeCommand('structural.create', { id: idF, kind: 'footing' });
    await expect(
      env.bus.executeCommand('structural.setBraceEndOffset', {
        structuralId: idF, endOffset: { x: 1, y: 0, z: 0 },
      }),
    ).rejects.toThrow();
  });
});
