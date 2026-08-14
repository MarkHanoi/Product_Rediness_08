// Stair handler smoke suite (S14-T3).

import { afterEach, describe, expect, it } from 'vitest';
import {
  CommandBus, PatchEmitter, UndoStack, type EventRecord,
} from '@pryzm/plugin-sdk';
import { attachStores } from '@pryzm/plugin-sdk';
import { createId, Stair } from '@pryzm/plugin-sdk';
import { StairStore, type StairsState, type StairData } from '../src/store.js';
import {
  buildStairHandlerSet,
  registerStairHandlers,
  STAIR_HANDLER_TYPES,
} from '../src/handlers/index.js';

/**
 * §FIX-STAIR-CREATE-SHADOW (MT-03) — seed the plugin DTO store DIRECTLY.
 * These suites used to seed through `stair.create`, but that verb's plugin
 * handler is deleted (the CA-21 read-back ruled it a dead route to a detached
 * store — see __tests__/createStairShadow.test.ts). The setter/move handlers
 * under test here still operate on the plugin store, so the seed goes in at
 * the store seam, parsed through the SAME canonical Zod schema the deleted
 * handler used, not through a verb the product no longer answers with a write.
 */
function seedStair(store: StairStore, id: string, overrides: Partial<StairData> = {}): StairData {
  const stair = Stair.parse({ id, ...overrides }) as StairData;
  store.applyPatch([{ op: 'add', path: [id], value: stair }]);
  return stair;
}

function buildEnv() {
  const stair = new StairStore();
  const stores = { stair: stair as unknown as import('@pryzm/stores').Store<object> };
  const emitter = new PatchEmitter();
  const undoStack = new UndoStack({ maxSize: 50 });
  const bus = new CommandBus({
    audit: { actorId: 'test', projectId: 'p1', clientId: 't1' },
    emitter,
    undoStack,
    storesProvider: () => ({
      stair: Object.fromEntries(stair.getState()) as StairsState,
    }),
  });
  for (const h of buildStairHandlerSet()) bus.register(h);
  const detach = attachStores(emitter, stores);
  return { stair, bus, emitter, undoStack, detach };
}

function snap(store: StairStore): Record<string, StairData> {
  return JSON.parse(JSON.stringify(Object.fromEntries(store.getState())));
}

function undoLast(store: StairStore, ev: EventRecord<unknown>): void {
  store.applyPatch([...ev.inverse].reverse());
}

describe('stair handler registration', () => {
  it('registers every type in STAIR_HANDLER_TYPES, and only those', () => {
    const env = buildEnv();
    const bus = new CommandBus({
      audit: { actorId: 't', projectId: 'p', clientId: 'c' },
      storesProvider: () => ({ stair: {} }),
    });
    const types = registerStairHandlers(bus);
    expect([...types].sort()).toEqual([...STAIR_HANDLER_TYPES].sort());
    for (const t of STAIR_HANDLER_TYPES) expect(bus.has(t)).toBe(true);
    env.detach();
  });
});

describe('stair.delete', () => {
  // §FIX-STAIR-CREATE-SHADOW (MT-03) — the `stair.create` cases that lived here
  // pinned the DELETED plugin arm (detached DTO store; the live verb is the
  // §E.5.4 bridge → CreateStairCommand → geometry StairStore). A dead verb's
  // tests must not pin the lie (CA-21 / sheet.addViewport precedent), so they
  // are gone with the handler; __tests__/createStairShadow.test.ts pins the
  // absence, and apps/editor/__tests__/StairCreateReachesGeometryStore.test.ts
  // pins the live route.
  let env: ReturnType<typeof buildEnv>;
  afterEach(() => env?.detach());

  it('deletes a seeded stair and inverts cleanly', async () => {
    env = buildEnv();
    const id = createId('stair');
    seedStair(env.stair, id);
    const before = snap(env.stair);
    const ev = await env.bus.executeCommand('stair.delete', { stairId: id });
    expect(env.stair.get(id)).toBeUndefined();
    undoLast(env.stair, ev);
    expect(snap(env.stair)).toEqual(before);
  });

  it('delete rejects unknown id', async () => {
    env = buildEnv();
    await expect(
      env.bus.executeCommand('stair.delete', { stairId: 'stair:missing' }),
    ).rejects.toThrow();
  });
});

describe('stair.move', () => {
  let env: ReturnType<typeof buildEnv>;
  afterEach(() => env?.detach());

  it('translates origin and undoes', async () => {
    env = buildEnv();
    const id = createId('stair');
    seedStair(env.stair, id);
    const ev = await env.bus.executeCommand('stair.move', {
      stairId: id, delta: { x: 1, y: 0, z: 2 },
    });
    expect(env.stair.get(id)?.origin).toEqual({ x: 1, y: 0, z: 2 });
    undoLast(env.stair, ev);
    expect(env.stair.get(id)?.origin).toEqual({ x: 0, y: 0, z: 0 });
  });

  // §FIX-STAIR-MOVE-DETACHED-STORE — the founder-reported rejection (build 096e12b4):
  // the stair lives in the GEOMETRY store (window.stairStore, what the user sees and
  // what StairRailingBuilder re-samples railings from), never in this plugin's Immer
  // DTO store, and canExecute rejected it with "stair not found". A stair that exists
  // in the authoritative store MUST move — and it must move through MoveStairCommand,
  // which is what emits bim-stair-updated and therefore carries the railings.
  describe('geometry-store (legacy) stair', () => {
    const g = globalThis as unknown as { window?: unknown };
    const hadWindow = 'window' in g;
    const prevWindow = g.window;
    afterEach(() => {
      if (hadWindow) g.window = prevWindow;
      else delete g.window;
    });

    function stubBrowser(stairId: string | null) {
      const executed: unknown[] = [];
      g.window = {
        stairStore: { get: (id: string) => (id === stairId ? { id } : undefined) },
        commandManager: { execute: (c: unknown) => { executed.push(c); } },
      };
      return executed;
    }

    it('accepts + bridges a stair that exists only in the geometry store', async () => {
      env = buildEnv();
      const id = 'stair:geometry-only';
      const executed = stubBrowser(id);
      const ev = await env.bus.executeCommand('stair.move', {
        stairId: id, delta: { x: 1, y: 0, z: 2 },
      });
      expect(executed).toHaveLength(1);
      expect((executed[0] as { targetIds: string[] }).targetIds).toEqual([id]);
      // The bridged command owns the mutation + undo entry, so no Immer patches here.
      expect(ev.forward).toEqual([]);
      expect(ev.inverse).toEqual([]);
    });

    it('still rejects an id that exists in NEITHER store', async () => {
      env = buildEnv();
      stubBrowser(null);
      await expect(
        env.bus.executeCommand('stair.move', {
          stairId: 'stair:nowhere', delta: { x: 1, y: 0, z: 0 },
        }),
      ).rejects.toThrow(/stair not found/);
    });

    it('rejects a non-finite delta before touching either store', async () => {
      env = buildEnv();
      const executed = stubBrowser('stair:geometry-only');
      await expect(
        env.bus.executeCommand('stair.move', {
          stairId: 'stair:geometry-only', delta: { x: Number.NaN, y: 0, z: 0 },
        }),
      ).rejects.toThrow(/finite/);
      expect(executed).toHaveLength(0);
    });
  });
});

describe('stair.setShape / setTreadCount / setRiserHeight / setWidth / rotate', () => {
  let env: ReturnType<typeof buildEnv>;
  afterEach(() => env?.detach());

  it('round-trips each setter', async () => {
    env = buildEnv();
    const id = createId('stair');
    seedStair(env.stair, id);
    await env.bus.executeCommand('stair.setShape', { stairId: id, shape: 'l-shape' });
    await env.bus.executeCommand('stair.setTreadCount', { stairId: id, numRisers: 18 });
    await env.bus.executeCommand('stair.setRiserHeight', { stairId: id, riserHeight: 0.20 });
    await env.bus.executeCommand('stair.setWidth', { stairId: id, width: 1.3 });
    // §FIX-DEAD-MOVE-VERB-REFUSE (W3-4) — `stair.rotate` writes the DETACHED plugin
    // stair store and no surface dispatches it. Note the asymmetry, which is the honest
    // answer rather than a redirect: stair TRANSLATION is live (`stair.move` bridges to
    // MoveStairCommand and the geometry stairStore) but stair ROTATION has NO live route
    // on any surface. The other four verbs in this case are UNTOUCHED and are the
    // POSITIVE control — a refuse-everything implementation would go red on them here.
    await expect(
      env.bus.executeCommand('stair.rotate', { stairId: id, rotation: Math.PI / 4 }),
    ).rejects.toThrow(/NO live route|stair\.move/);
    const dto = env.stair.get(id) as StairData;
    expect(dto.shape).toBe('l-shape');
    expect(dto.numRisers).toBe(18);
    expect(dto.riserHeight).toBeCloseTo(0.20);
    expect(dto.width).toBeCloseTo(1.3);
    // The refusal changed nothing: rotation keeps the value stair.create gave it.
    expect(dto.rotation ?? 0).toBeCloseTo(0);
  });

  it('rejects setTreadCount < 2', async () => {
    env = buildEnv();
    const id = createId('stair');
    seedStair(env.stair, id);
    await expect(
      env.bus.executeCommand('stair.setTreadCount', { stairId: id, numRisers: 1 }),
    ).rejects.toThrow();
  });

  it('setType updates materialId', async () => {
    env = buildEnv();
    const id = createId('stair');
    seedStair(env.stair, id);
    await env.bus.executeCommand('stair.setType', { stairId: id, materialId: 'concrete.precast' });
    expect(env.stair.get(id)?.materialId).toBe('concrete.precast');
  });
});
