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

  it('refuses a well-formed payload, names slab.movePolygon, and mutates nothing', async () => {
    env = buildEnv();
    const id = createId('slab');
    await env.bus.executeCommand('slab.create', { id, boundary: SQUARE });
    const before = snap(env.slab);
    // §FIX-DEAD-MOVE-VERB-REFUSE (W3-4) — this used to assert the PLUGIN DTO store
    // mutated, and passed while the user's model never changed: in production the bus
    // binds the DETACHED plugin store here, no renderer/exporter/persistence path reads
    // it, and NO surface dispatches `slab.move`. Moving a slab commits through `slab.movePolygon` — the DISTINCT
    // verb minted by §FIX-MOVE-SLAB-AND-HANDRAIL (G7) precisely because slab.move and
    // slab.update were already claimed by this detached store.
    // What is pinned is now the REFUSAL, its reason, and the ABSENCE of any mutation —
    // an assertion about the wrong store is worse than none, because it reads as proof.
    // `execute()` is deliberately left intact for a host that binds the authoritative
    // store under this key; `canExecute` is the gate the bus honours.
    await expect(
      env.bus.executeCommand('slab.move', { slabId: id, delta: { x: 1, y: 0, z: 2 } }),
    ).rejects.toThrow(/slab\.movePolygon/);
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

describe('slab.setMaterial', () => {
  // §FEAT-UNIFORM-MATERIAL-COMMAND — L-08 uniform material-set command.
  let env: ReturnType<typeof buildEnv>;
  afterEach(() => env?.detach());

  // §FIX-DEAD-VERB-REFUSE (W3-3) — this used to assert the PLUGIN DTO store mutated, and
  // passed for years while the user's model never changed: in production the bus binds the
  // DETACHED plugin SlabStore here, which no renderer, exporter or persistence path reads.
  // The verb now refuses, naming the live route (`slab.updateDimensions` — UpdateSlabCommand
  // deliberately THROWS on material fields). Pinned: the refusal, its reason, no mutation.
  it('refuses a well-formed material payload and names slab.updateDimensions', async () => {
    env = buildEnv();
    const id = createId('slab');
    await env.bus.executeCommand('slab.create', { id, boundary: SQUARE, thickness: 0.2 });
    const before = snap(env.slab);
    await expect(
      env.bus.executeCommand('slab.setMaterial', {
        slabId: id,
        materialId: 'concrete-fair-face',
        materialColor: '#a0a0a0',
      }),
    ).rejects.toThrow(/slab\.updateDimensions/);
    expect(snap(env.slab)).toEqual(before);
  });

  it('refuses a materialId clear too — the refusal is not payload-shaped', async () => {
    env = buildEnv();
    const id = createId('slab');
    await env.bus.executeCommand('slab.create', { id, boundary: SQUARE });
    const before = snap(env.slab);
    await expect(
      env.bus.executeCommand('slab.setMaterial', { slabId: id, materialId: null }),
    ).rejects.toThrow(/plugin DTO store/);
    expect(snap(env.slab)).toEqual(before);
  });

  it('rejects when neither materialId nor materialColor provided', async () => {
    env = buildEnv();
    const id = createId('slab');
    await env.bus.executeCommand('slab.create', { id, boundary: SQUARE });
    await expect(
      env.bus.executeCommand('slab.setMaterial', { slabId: id }),
    ).rejects.toThrow();
  });

  it('rejects unknown slab id', async () => {
    env = buildEnv();
    await expect(
      env.bus.executeCommand('slab.setMaterial', { slabId: createId('slab'), materialId: 'x' }),
    ).rejects.toThrow();
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

// ─────────────────────────────────────────────────────────────────────────────
// §FIX-CREATE-DTO-ONLY-SUCCESS — the authoritative-store census, watched in all
// THREE of its states.
//
// The CA-21 executed read-back measured `slab.create` reporting success on the
// composed bus while the authoritative `slabStore` (the instance ProjectSerializer
// reads, made reachable by ADR-0318 wave 1) did not change. `CreateSlabHandler`
// now refuses in exactly one condition — an authoritative store is registered in
// this process AND it cannot receive the write. A guard nobody has watched fail is
// a guard nobody should trust, so all three arms are pinned, not just the refusal.
//
// Note the FIRST arm is what keeps every test above green: a plugin unit process
// registers no authoritative slab store, so the DTO patch pair is the whole
// contract there and the handler proceeds. That is a property of the design, and
// it is asserted here rather than left as an accident of test ordering.
// ─────────────────────────────────────────────────────────────────────────────
import { storeRegistry } from '@pryzm/plugin-sdk';

describe('slab.create — §FIX-CREATE-DTO-ONLY-SUCCESS authoritative-store census', () => {
  let env: ReturnType<typeof buildEnv>;
  afterEach(() => {
    env?.detach();
    storeRegistry.unregister('slab');
  });

  it('ARM 1 — no authoritative slab store registered: proceeds (the DTO pair is the contract)', async () => {
    env = buildEnv();
    expect(storeRegistry.isRegistered('slab')).toBe(false);
    const id = createId('slab');
    await env.bus.executeCommand('slab.create', { id, boundary: SQUARE });
    expect(env.slab.size()).toBe(1);
  });

  it('ARM 2 — authoritative store registered AND engine-attached: proceeds (the browser)', async () => {
    env = buildEnv();
    storeRegistry.register('slab', { getAll: () => [], isEngineAttached: () => true } as never);
    const id = createId('slab');
    await env.bus.executeCommand('slab.create', { id, boundary: SQUARE });
    expect(env.slab.size()).toBe(1);
  });

  it('ARM 3 — registered AND NOT attached: refuses, and names why it cannot land', async () => {
    env = buildEnv();
    storeRegistry.register('slab', { getAll: () => [], isEngineAttached: () => false } as never);
    await expect(
      env.bus.executeCommand('slab.create', { id: createId('slab'), boundary: SQUARE }),
    ).rejects.toThrow(/engine half is NOT attached/);
    // The refusal must name the path that DOES work, not merely decline.
    await expect(
      env.bus.executeCommand('slab.create', { id: createId('slab'), boundary: SQUARE }),
    ).rejects.toThrow(/attachEngine/);
    // …and nothing was written anywhere.
    expect(env.slab.size()).toBe(0);
  });

  it('ARM 3b — a payload error still wins over the census, so the message stays legible', async () => {
    env = buildEnv();
    storeRegistry.register('slab', { getAll: () => [], isEngineAttached: () => false } as never);
    await expect(
      env.bus.executeCommand('slab.create', { id: createId('slab'), boundary: SQUARE, thickness: -1 }),
    ).rejects.toThrow(/thickness must be > 0/);
  });

  it('a registered store of an UNJUDGEABLE shape is not scored as a failure', async () => {
    env = buildEnv();
    // No `isEngineAttached` — this is not the ADR-0318 singleton, so the census
    // cannot judge it. Unjudgeable ≠ failure (§CONTEXT-DATA-HONESTY).
    storeRegistry.register('slab', { getAll: () => [] } as never);
    const id = createId('slab');
    await env.bus.executeCommand('slab.create', { id, boundary: SQUARE });
    expect(env.slab.size()).toBe(1);
  });
});
