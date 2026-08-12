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

  // §FIX-DEAD-MOVE-VERB-REFUSE (W3-4) — this used to assert the PLUGIN store's baseLine
  // moved, and passed for years while the user's wall never moved: in production the bus
  // binds the DETACHED plugin DTO store here, and no renderer, exporter or persistence
  // path reads it. Nothing dispatches `wall.move` either — MOVE_COMMAND_BY_TYPE and the
  // 3-D gizmo both send `wall.updateBaseline`. The verb now refuses naming that route,
  // so what is pinned is the REFUSAL, its reason, and the ABSENCE of mutation. An
  // assertion about the wrong store is worse than no assertion: it reads as proof.
  it('refuses a well-formed payload, names wall.updateBaseline, and mutates nothing', async () => {
    env = buildEnv();
    const id = createId('wall');
    await env.bus.executeCommand('wall.create', { id, levelId: 'lvl_test' });
    const before = snapState(env.store);
    const undoBefore = env.undoStack.size;
    await expect(
      env.bus.executeCommand('wall.move', {
        id,
        baseLine: [
          { x: 1, y: 0, z: 1 },
          { x: 5, y: 0, z: 1 },
        ],
      }),
    ).rejects.toThrow(/wall\.updateBaseline/);
    // A refusal must not mutate anything, on either store.
    expect(snapState(env.store)).toEqual(before);
    // And the undo stack must be untouched — the refusal lives in canExecute, so the
    // bus throws BEFORE arming either stack (this is the geometry-keyed corruption
    // hazard that §FIX-DEAD-VERB-REFUSE closed for the property verbs).
    expect(env.undoStack.size).toBe(undoBefore);
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

  // §FIX-DEAD-VERB-REFUSE (W3-3) — this used to assert the PLUGIN store mutated, and
  // passed for years while the user's model never changed: in production the bus binds
  // the DETACHED plugin DTO store here, and no renderer, exporter or persistence path
  // reads it. The verb now refuses with a reason naming the live route, so what is
  // pinned is the REFUSAL and its reason — an assertion about the wrong store is worse
  // than no assertion, because it reads as proof.
  it('refuses a well-formed payload and names wall.updateDimensions', async () => {
    env = buildEnv();
    const id = createId('wall');
    await env.bus.executeCommand('wall.create', { id, levelId: 'lvl_test' });
    const before = snapState(env.store);
    await expect(
      env.bus.executeCommand('wall.setDimensions', { id, height: 3.2, thickness: 0.2, baseOffset: 0.05 }),
    ).rejects.toThrow(/wall\.updateDimensions/);
    // A refusal must not mutate anything, on either store.
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

  // §FIX-DEAD-VERB-REFUSE (W3-3) — this used to assert the PLUGIN store mutated, and
  // passed for years while the user's model never changed: in production the bus binds
  // the DETACHED plugin DTO store here, and no renderer, exporter or persistence path
  // reads it. The verb now refuses with a reason naming the live route, so what is
  // pinned is the REFUSAL and its reason — an assertion about the wrong store is worse
  // than no assertion, because it reads as proof.
  it('refuses a well-formed colour payload and names wall.updateColor', async () => {
    env = buildEnv();
    const id = createId('wall');
    await env.bus.executeCommand('wall.create', { id, levelId: 'lvl_test', materialColor: '#aabbcc' });
    const before = snapState(env.store);
    await expect(
      env.bus.executeCommand('wall.setColor', { id, materialColor: '#112233' }),
    ).rejects.toThrow(/wall\.updateColor/);
    expect(snapState(env.store)).toEqual(before);
  });

  it('refuses a materialId clear too — the refusal is not payload-shaped', async () => {
    env = buildEnv();
    const id = createId('wall');
    await env.bus.executeCommand('wall.create', { id, levelId: 'lvl_test', materialId: 'mat-1' });
    const before = snapState(env.store);
    await expect(
      env.bus.executeCommand('wall.setColor', { id, materialId: null }),
    ).rejects.toThrow(/detached plugin wall store/);
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

  // §WALL-TYPE-WIRE (founder 2026-06-20) — proves the bug + the fix mechanism.
  it('resolves the stored thickness from the wired catalogue type, overriding the placeholder', async () => {
    const sysTypes = new WallSystemTypeStore(); // self-seeds built-ins; wt-monolithic = 0.1 m
    env = buildEnv({ systemTypeStore: sysTypes });
    const id = createId('wall');
    await env.bus.executeCommand('wall.create', {
      id,
      levelId: 'lvl_test',
      thickness: 0.5,               // placeholder default that MUST be overridden by the type
      systemTypeId: 'wt-monolithic',
    });
    // The fix: with a store wired, thickness is resolved to the type's totalThickness (0.1),
    // not left at the caller's 0.5 placeholder → plan view now matches the chosen type.
    expect(env.store.get(id)?.thickness).toBe(0.1);
  });

  it('leaves placeholder thickness UNRESOLVED when no catalogue is wired (the pre-fix bug)', async () => {
    env = buildEnv(); // mirrors engineLauncher BEFORE §WALL-TYPE-WIRE
    const id = createId('wall');
    await env.bus.executeCommand('wall.create', {
      id,
      levelId: 'lvl_test',
      thickness: 0.5,
      systemTypeId: 'wt-monolithic',
    });
    // Reproduces "selected Interior Partition but got a standard wall": systemTypeId is
    // stored but thickness stays at the placeholder because no store was wired to resolve it.
    expect(env.store.get(id)?.thickness).toBe(0.5);
    expect(env.store.get(id)?.systemTypeId).toBe('wt-monolithic');
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

// ─────────────────────────────────────────────────────────────────────────────
// §FIX-CREATE-DTO-ONLY-SUCCESS — the authoritative-store census, watched in all
// THREE of its states.
//
// The CA-21 executed read-back measured `wall.create` reporting success on the
// composed bus while the authoritative `wallStore` (the instance ProjectSerializer
// reads, made reachable by ADR-0318 wave 1) did not change. `CreateWallHandler`
// now refuses in exactly one condition — an authoritative store is registered in
// this process AND it cannot receive the write, because `WallStore.add()` refuses
// to admit a wall onto a level it cannot check (ADR-0318 I-3). A guard nobody has
// watched fail is a guard nobody should trust, so all three arms are pinned.
//
// The FIRST arm is what keeps every test above green: a plugin unit process
// registers no authoritative wall store, so the DTO patch pair is the whole
// contract there. That is a property of the design, asserted here rather than
// left as an accident of test ordering.
// ─────────────────────────────────────────────────────────────────────────────
import { storeRegistry } from '@pryzm/plugin-sdk';

describe('wall.create — §FIX-CREATE-DTO-ONLY-SUCCESS authoritative-store census', () => {
  let env: ReturnType<typeof buildEnv>;
  afterEach(() => {
    env?.detach();
    storeRegistry.unregister('wall');
  });

  it('ARM 1 — no authoritative wall store registered: proceeds (the DTO pair is the contract)', async () => {
    env = buildEnv();
    expect(storeRegistry.isRegistered('wall')).toBe(false);
    const id = createId('wall');
    await env.bus.executeCommand('wall.create', { id, levelId: 'lvl_test' });
    expect(env.store.getState().size).toBe(1);
  });

  it('ARM 2 — authoritative store registered AND engine-attached: proceeds (the browser)', async () => {
    env = buildEnv();
    storeRegistry.register('wall', { getAll: () => [], isEngineAttached: () => true } as never);
    const id = createId('wall');
    await env.bus.executeCommand('wall.create', { id, levelId: 'lvl_test' });
    expect(env.store.getState().size).toBe(1);
  });

  it('ARM 3 — registered AND NOT attached: refuses, and names why it cannot land', async () => {
    env = buildEnv();
    storeRegistry.register('wall', { getAll: () => [], isEngineAttached: () => false } as never);
    await expect(
      env.bus.executeCommand('wall.create', { id: createId('wall'), levelId: 'lvl_test' }),
    ).rejects.toThrow(/engine half is NOT attached/);
    // The refusal must name the path that DOES work, not merely decline.
    await expect(
      env.bus.executeCommand('wall.create', { id: createId('wall'), levelId: 'lvl_test' }),
    ).rejects.toThrow(/attachEngine/);
    expect(env.store.getState().size).toBe(0);
  });

  it('ARM 3b — a payload error still wins over the census, so the message stays legible', async () => {
    env = buildEnv();
    storeRegistry.register('wall', { getAll: () => [], isEngineAttached: () => false } as never);
    await expect(
      env.bus.executeCommand('wall.create', { id: 'not-branded', levelId: 'lvl_test' }),
    ).rejects.toThrow(/branded wall_/);
  });

  it('a registered store of an UNJUDGEABLE shape is not scored as a failure', async () => {
    env = buildEnv();
    // No `isEngineAttached` — not the ADR-0318 singleton, so the census cannot
    // judge it. Unjudgeable ≠ failure (§CONTEXT-DATA-HONESTY).
    storeRegistry.register('wall', { getAll: () => [] } as never);
    const id = createId('wall');
    await env.bus.executeCommand('wall.create', { id, levelId: 'lvl_test' });
    expect(env.store.getState().size).toBe(1);
  });
});
