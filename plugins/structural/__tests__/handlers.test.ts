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

  it('move refuses because there is NO structural runtime family at all', async () => {
    env = buildEnv();
    const id = createId('structural');
    await env.bus.executeCommand('structural.create', { id, kind: 'connection', origin: { x: 0, y: 0, z: 0 } });
    const before = snap(env.structural);
    // §FIX-DEAD-MOVE-VERB-REFUSE (W3-4) — `structural.move` is dead for a DEEPER reason
    // than a detached store, and the refusal says THAT instead of implying a wiring gap:
    // schemas/elements/Structural.ts defines the element, but no structuralStore, no
    // fragment builder and no command exist anywhere in the app. It is schema-only — the
    // same finding that made structural.setMaterial refuse at §FIX-DEAD-VERB-REFUSE.
    // Nothing can render, export or persist a structural member, so nothing could ever
    // observe it moving. The real structural element is `column`, which is fully live.
    await expect(
      env.bus.executeCommand('structural.move', { structuralId: id, delta: { x: 5, y: 0, z: 3 } }),
    ).rejects.toThrow(/NO STRUCTURAL RUNTIME FAMILY/i);
    expect(snap(env.structural)).toEqual(before);
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

  // §FIX-DEAD-VERB-REFUSE (W3-3) — this used to assert the PLUGIN DTO store mutated. There
  // is no structural runtime family at all: schemas/elements/Structural.ts defines the
  // element, but no structuralStore, no builder and no legacy command exists anywhere, so
  // NOTHING could ever observe this write. The verb now refuses and names the real
  // structural element (`column`, which has a live material path). Pinned: the refusal,
  // its reason, and no mutation.
  it('refuses setMaterial and says there is no structural runtime family', async () => {
    env = buildEnv();
    const id = createId('structural');
    await env.bus.executeCommand('structural.create', { id, kind: 'footing' });
    const before = env.structural.get(id)!.materialId;
    await expect(
      env.bus.executeCommand('structural.setMaterial', { structuralId: id, materialId: 'concrete-A' }),
    ).rejects.toThrow(/no structural runtime family/);
    await expect(
      env.bus.executeCommand('structural.setMaterial', { structuralId: id, materialId: 'concrete-A' }),
    ).rejects.toThrow(/column/);
    expect(env.structural.get(id)!.materialId).toBe(before);
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
