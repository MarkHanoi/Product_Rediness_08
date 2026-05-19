// TransformWall — one test per kind (S10-T1, spec line 1138).
//
// Five `kind`s, five tests, plus three rejection tests for the most
// common failure modes (zero-direction mirror axis, NaN / 0 scale
// factor, ref-edit baseline below MIN_WALL_LEN).

import { afterEach, describe, expect, it } from 'vitest';
import {
  CommandBus,
  PatchEmitter,
  UndoStack,
} from '@pryzm/plugin-sdk';
import { attachStores } from '@pryzm/plugin-sdk';
import { createId } from '@pryzm/plugin-sdk';
import {
  WallStore,
  type WallsState,
} from '../src/store.js';
import { buildWallHandlerSet } from '../src/handlers/index.js';

function buildEnv() {
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
  for (const h of buildWallHandlerSet()) bus.register(h);
  const detach = attachStores(emitter, stores);
  return { store, bus, detach };
}

async function makeWall(env: ReturnType<typeof buildEnv>) {
  const id = createId('wall');
  await env.bus.executeCommand('wall.create', {
    id,
    levelId: 'lvl_a',
    baseLine: [
      { x: 0, y: 0, z: 0 },
      { x: 10, y: 0, z: 0 },
    ],
  });
  return id;
}

describe('wall.transform — one test per kind', () => {
  let env: ReturnType<typeof buildEnv>;
  afterEach(() => env?.detach());

  it('move — translates baseLine by a 2D delta and preserves y', async () => {
    env = buildEnv();
    const id = await makeWall(env);
    const ev = await env.bus.executeCommand('wall.transform', {
      kind: 'move',
      id,
      delta: { x: 1.5, z: -2 },
    });
    const w = env.store.get(id)!;
    expect(w.baseLine[0]).toEqual({ x: 1.5, y: 0, z: -2 });
    expect(w.baseLine[1]).toEqual({ x: 11.5, y: 0, z: -2 });

    env.store.applyPatch([...ev.inverse].reverse());
    expect(env.store.get(id)!.baseLine[0]).toEqual({ x: 0, y: 0, z: 0 });
  });

  it('mirror — reflects baseLine across an axis through origin', async () => {
    env = buildEnv();
    const id = await makeWall(env);
    // Mirror across the X axis (+Z line through origin) — flips Z.
    await env.bus.executeCommand('wall.transform', {
      kind: 'mirror',
      id,
      axis: { origin: { x: 0, z: 0 }, direction: { x: 1, z: 0 } },
    });
    const w = env.store.get(id)!;
    // baseLine sits ON the X axis so reflection is a no-op for these
    // points — verify the OTHER mirror direction (Z axis) flips X.
    expect(w.baseLine[0]).toEqual({ x: 0, y: 0, z: 0 });
    expect(w.baseLine[1]).toEqual({ x: 10, y: 0, z: 0 });

    await env.bus.executeCommand('wall.transform', {
      kind: 'mirror',
      id,
      axis: { origin: { x: 0, z: 0 }, direction: { x: 0, z: 1 } },
    });
    const w2 = env.store.get(id)!;
    expect(w2.baseLine[0].x).toBeCloseTo(0, 9);
    expect(w2.baseLine[1].x).toBeCloseTo(-10, 9);
  });

  it('scale — scales baseLine endpoints around a pivot by a factor', async () => {
    env = buildEnv();
    const id = await makeWall(env);
    await env.bus.executeCommand('wall.transform', {
      kind: 'scale',
      id,
      pivot: { x: 0, z: 0 },
      factor: 2,
    });
    const w = env.store.get(id)!;
    expect(w.baseLine[0]).toEqual({ x: 0, y: 0, z: 0 });
    expect(w.baseLine[1]).toEqual({ x: 20, y: 0, z: 0 });
  });

  it('offset — translates baseLine perpendicular to its direction', async () => {
    env = buildEnv();
    const id = await makeWall(env);
    // Wall along +X — perpendicular LEFT side is +Z.
    await env.bus.executeCommand('wall.transform', {
      kind: 'offset',
      id,
      distance: 0.5,
      side: 'left',
    });
    const w = env.store.get(id)!;
    expect(w.baseLine[0].x).toBeCloseTo(0, 9);
    expect(w.baseLine[0].z).toBeCloseTo(0.5, 9);
    expect(w.baseLine[1].x).toBeCloseTo(10, 9);
    expect(w.baseLine[1].z).toBeCloseTo(0.5, 9);

    // RIGHT side flips the sign.
    await env.bus.executeCommand('wall.transform', {
      kind: 'offset',
      id,
      distance: 0.5,
      side: 'right',
    });
    const w2 = env.store.get(id)!;
    expect(w2.baseLine[0].z).toBeCloseTo(0, 9);
  });

  it('referenceEdit — replaces baseLine with a fresh 2-tuple', async () => {
    env = buildEnv();
    const id = await makeWall(env);
    await env.bus.executeCommand('wall.transform', {
      kind: 'referenceEdit',
      id,
      newBaseLine: [
        { x: 100, y: 0, z: 0 },
        { x: 100, y: 0, z: 8 },
      ],
    });
    const w = env.store.get(id)!;
    expect(w.baseLine[0]).toEqual({ x: 100, y: 0, z: 0 });
    expect(w.baseLine[1]).toEqual({ x: 100, y: 0, z: 8 });
  });

  // ── rejection cases ───────────────────────────────────────────

  it('rejects mirror with zero-length axis direction', async () => {
    env = buildEnv();
    const id = await makeWall(env);
    await expect(
      env.bus.executeCommand('wall.transform', {
        kind: 'mirror',
        id,
        axis: { origin: { x: 0, z: 0 }, direction: { x: 0, z: 0 } },
      }),
    ).rejects.toThrow(/non-zero/);
  });

  it('rejects scale with factor 0', async () => {
    env = buildEnv();
    const id = await makeWall(env);
    await expect(
      env.bus.executeCommand('wall.transform', {
        kind: 'scale',
        id,
        pivot: { x: 0, z: 0 },
        factor: 0,
      }),
    ).rejects.toThrow(/finite non-zero/);
  });

  it('rejects referenceEdit with planar length below MIN_WALL_LEN', async () => {
    env = buildEnv();
    const id = await makeWall(env);
    await expect(
      env.bus.executeCommand('wall.transform', {
        kind: 'referenceEdit',
        id,
        newBaseLine: [
          { x: 0, y: 0, z: 0 },
          { x: 0.04, y: 0, z: 0 },
        ],
      }),
    ).rejects.toThrow(/≥ 0.05/);
  });
});
