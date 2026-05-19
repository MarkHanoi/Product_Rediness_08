// S10 handler test suite — covers all 9 new handlers (TransformWall is
// in its own file `s10-transform-wall.test.ts`).
//
// Style mirrors `handlers.test.ts`: build a CommandBus + WallStore,
// register handlers, exercise `executeCommand`, then assert
//   (a) forward patch updates the store as expected,
//   (b) `record.inverse` round-trips byte-for-byte,
//   (c) edge-case rejections surface typed errors.

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
import { buildWallHandlerSet } from '../src/handlers/index.js';
import { WallSystemTypeStore } from '../src/system-type-store.js';
import { WallOpeningOverlapError } from '../src/handlers/CreateWallOpening.js';
import { CutWallHandler, WallCutOpeningStraddleError } from '../src/handlers/CutWall.js';
import { CreateWallOpeningHandler } from '../src/handlers/CreateWallOpening.js';

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
  return JSON.parse(JSON.stringify(Object.fromEntries(store.getState())));
}

function undoLast(store: WallStore, record: EventRecord<unknown>): void {
  const reversed = [...record.inverse].reverse();
  store.applyPatch(reversed);
}

function makeType(id: string, layers: { name: string; function: 'structure' | 'finish-interior' | 'finish-exterior' | 'insulation' | 'air-barrier' | 'substrate'; thickness: number }[]) {
  const total = layers.reduce((s, l) => s + l.thickness, 0);
  return {
    id,
    name: `type-${id}`,
    layers,
    totalThickness: Math.round(total * 1_000_000) / 1_000_000,
    createdAt: 0,
    modifiedAt: 0,
  };
}

function buildSystemTypeStore(): WallSystemTypeStore {
  const sts = new WallSystemTypeStore();
  sts.add(makeType('st_3layer', [
    { name: 'finish-int', function: 'finish-interior', thickness: 0.012 },
    { name: 'studs',      function: 'structure',       thickness: 0.090 },
    { name: 'finish-ext', function: 'finish-exterior', thickness: 0.012 },
  ]));
  sts.add(makeType('st_simple', [{ name: 'mono', function: 'structure', thickness: 0.20 }]));
  return sts;
}

// ── SetWallSystemType ─────────────────────────────────────────────

describe('wall.setSystemType', () => {
  let env: ReturnType<typeof buildEnv>;
  afterEach(() => env?.detach());

  it('attaches a catalogue type and materialises layers + thickness', async () => {
    const sts = buildSystemTypeStore();
    env = buildEnv({ systemTypeStore: sts });
    const id = createId('wall');
    await env.bus.executeCommand('wall.create', { id, levelId: 'lvl_a' });

    const ev = await env.bus.executeCommand('wall.setSystemType', {
      id,
      systemTypeId: 'st_3layer',
    });
    const w = env.store.get(id)!;
    expect(w.systemTypeId).toBe('st_3layer');
    expect(w.layers).toHaveLength(3);
    expect(w.thickness).toBeCloseTo(0.114, 6);
    // Round-trip undo restores prior state byte-for-byte.
    const before = JSON.parse(JSON.stringify(w));
    undoLast(env.store, ev);
    const after = env.store.get(id)!;
    expect(after.systemTypeId).toBeUndefined();
    expect(after.layers).toBeUndefined();
    expect(after).not.toEqual(before);
  });

  it('detaches when systemTypeId is null', async () => {
    const sts = buildSystemTypeStore();
    env = buildEnv({ systemTypeStore: sts });
    const id = createId('wall');
    await env.bus.executeCommand('wall.create', { id, levelId: 'lvl_a' });
    await env.bus.executeCommand('wall.setSystemType', { id, systemTypeId: 'st_simple' });
    expect(env.store.get(id)!.layers).toHaveLength(1);

    await env.bus.executeCommand('wall.setSystemType', { id, systemTypeId: null });
    const w = env.store.get(id)!;
    expect(w.systemTypeId).toBeUndefined();
    expect(w.layers).toBeUndefined();
  });

  it('rejects unknown systemTypeId', async () => {
    const sts = buildSystemTypeStore();
    env = buildEnv({ systemTypeStore: sts });
    const id = createId('wall');
    await env.bus.executeCommand('wall.create', { id, levelId: 'lvl_a' });
    await expect(
      env.bus.executeCommand('wall.setSystemType', { id, systemTypeId: 'st_NOPE' }),
    ).rejects.toThrow(/unknown systemTypeId/);
  });

  it('rejects when wall does not exist', async () => {
    const sts = buildSystemTypeStore();
    env = buildEnv({ systemTypeStore: sts });
    await expect(
      env.bus.executeCommand('wall.setSystemType', { id: 'wall_NOPE', systemTypeId: 'st_simple' }),
    ).rejects.toThrow(/wall not found/);
  });
});

// ── SetWallLayers ─────────────────────────────────────────────────

describe('wall.setLayers', () => {
  let env: ReturnType<typeof buildEnv>;
  afterEach(() => env?.detach());

  it('overwrites layers and recomputes thickness (rounded to 6dp)', async () => {
    env = buildEnv();
    const id = createId('wall');
    await env.bus.executeCommand('wall.create', { id, levelId: 'lvl_a' });
    const ev = await env.bus.executeCommand('wall.setLayers', {
      id,
      layers: [
        { name: 'a', function: 'structure', thickness: 0.100 },
        { name: 'b', function: 'finish-interior', thickness: 0.010 },
      ],
    });
    const w = env.store.get(id)!;
    expect(w.layers).toHaveLength(2);
    expect(w.thickness).toBeCloseTo(0.11, 6);

    undoLast(env.store, ev);
    expect(env.store.get(id)!.layers).toBeUndefined();
  });

  it('rejects empty layers array', async () => {
    env = buildEnv();
    const id = createId('wall');
    await env.bus.executeCommand('wall.create', { id, levelId: 'lvl_a' });
    await expect(
      env.bus.executeCommand('wall.setLayers', { id, layers: [] }),
    ).rejects.toThrow(/non-empty array/);
  });

  it('rejects layers whose total < 0.05 m', async () => {
    env = buildEnv();
    const id = createId('wall');
    await env.bus.executeCommand('wall.create', { id, levelId: 'lvl_a' });
    await expect(
      env.bus.executeCommand('wall.setLayers', {
        id,
        layers: [{ name: 'micro', function: 'structure', thickness: 0.001 }],
      }),
    ).rejects.toThrow(/≥ 0.05/);
  });
});

// ── BulkSetWallVisuals ────────────────────────────────────────────

describe('wall.bulkSetVisuals', () => {
  let env: ReturnType<typeof buildEnv>;
  afterEach(() => env?.detach());

  it('applies colour + thickness to all ids in one atomic patch', async () => {
    env = buildEnv();
    const a = createId('wall');
    const b = createId('wall');
    await env.bus.executeCommand('wall.create', { id: a, levelId: 'lvl_a' });
    await env.bus.executeCommand('wall.create', { id: b, levelId: 'lvl_a' });

    const ev = await env.bus.executeCommand('wall.bulkSetVisuals', {
      ids: [a, b],
      materialColor: '#cc0033',
      thickness: 0.18,
    });
    expect(env.store.get(a)!.materialColor).toBe('#cc0033');
    expect(env.store.get(b)!.materialColor).toBe('#cc0033');
    expect(env.store.get(a)!.thickness).toBe(0.18);
    expect(env.store.get(b)!.thickness).toBe(0.18);

    undoLast(env.store, ev);
    // Both walls revert in a single inverse pass.
    expect(env.store.get(a)!.materialColor).not.toBe('#cc0033');
  });

  it('rejects empty ids array', async () => {
    env = buildEnv();
    await expect(
      env.bus.executeCommand('wall.bulkSetVisuals', { ids: [], materialColor: '#000000' }),
    ).rejects.toThrow(/non-empty array/);
  });

  it('rejects when no visual property is supplied', async () => {
    env = buildEnv();
    const id = createId('wall');
    await env.bus.executeCommand('wall.create', { id, levelId: 'lvl_a' });
    await expect(
      env.bus.executeCommand('wall.bulkSetVisuals', { ids: [id] }),
    ).rejects.toThrow(/at least one of/);
  });

  it('rejects malformed hex colour', async () => {
    env = buildEnv();
    const id = createId('wall');
    await env.bus.executeCommand('wall.create', { id, levelId: 'lvl_a' });
    await expect(
      env.bus.executeCommand('wall.bulkSetVisuals', { ids: [id], materialColor: 'red' }),
    ).rejects.toThrow(/#rrggbb/);
  });

  it('rejects when any id is unknown', async () => {
    env = buildEnv();
    const a = createId('wall');
    await env.bus.executeCommand('wall.create', { id: a, levelId: 'lvl_a' });
    await expect(
      env.bus.executeCommand('wall.bulkSetVisuals', {
        ids: [a, 'wall_NOPE'],
        materialColor: '#000000',
      }),
    ).rejects.toThrow(/wall not found/);
  });

  it('clears materialId when null is supplied', async () => {
    env = buildEnv();
    const id = createId('wall');
    await env.bus.executeCommand('wall.create', {
      id,
      levelId: 'lvl_a',
      materialId: 'mat_x',
    });
    expect(env.store.get(id)!.materialId).toBe('mat_x');
    await env.bus.executeCommand('wall.bulkSetVisuals', { ids: [id], materialId: null });
    expect(env.store.get(id)!.materialId).toBeUndefined();
  });
});

// ── CreateWallOpening ─────────────────────────────────────────────

describe('wall.createOpening', () => {
  let env: ReturnType<typeof buildEnv>;
  afterEach(() => env?.detach());

  function makeWall(env2: ReturnType<typeof buildEnv>) {
    const id = createId('wall');
    return env2.bus
      .executeCommand('wall.create', {
        id,
        levelId: 'lvl_a',
        height: 3,
        thickness: 0.2,
        baseLine: [
          { x: 0, y: 0, z: 0 },
          { x: 5, y: 0, z: 0 },
        ],
      })
      .then(() => id);
  }

  it('adds an opening and extends childrenIds to satisfy refine (3)', async () => {
    env = buildEnv();
    const wallId = await makeWall(env);
    const ev = await env.bus.executeCommand('wall.createOpening', {
      wallId,
      opening: {
        id: 'op_1',
        type: 'door',
        offset: 1.0,
        width: 0.9,
        height: 2.1,
        sillHeight: 0,
        elementId: 'door_a',
      },
    });
    const w = env.store.get(wallId)!;
    expect(w.openings).toHaveLength(1);
    expect(w.childrenIds).toContain('door_a');

    undoLast(env.store, ev);
    const after = env.store.get(wallId)!;
    expect(after.openings).toHaveLength(0);
    expect(after.childrenIds).not.toContain('door_a');
  });

  it('overlap rejection: bus surface (canExecute) message + execute() typed throw', async () => {
    env = buildEnv();
    const wallId = await makeWall(env);
    await env.bus.executeCommand('wall.createOpening', {
      wallId,
      opening: {
        id: 'op_1', type: 'door', offset: 1, width: 1.5, height: 2,
        sillHeight: 0, elementId: 'door_a',
      },
    });
    // 1) Bus surface: canExecute rejects with the reason wrapped in
    //    CommandBusError.
    await expect(
      env.bus.executeCommand('wall.createOpening', {
        wallId,
        opening: {
          id: 'op_2', type: 'window', offset: 2.0, width: 1.0, height: 1,
          sillHeight: 1, elementId: 'win_a',
        },
      }),
    ).rejects.toThrow(/overlap|overlaps|conflict/i);
    // 2) Direct execute() (race-defensive path) raises the TYPED error.
    const handler = new CreateWallOpeningHandler();
    expect(() =>
      handler.execute(
        {
          stores: { wall: Object.fromEntries(env.store.getState()) as WallsState },
          audit: { actorId: 'test', projectId: 'p1', clientId: 't1', timestamp: 0 },
        },
        {
          wallId,
          opening: {
            id: 'op_3', type: 'window', offset: 2.0, width: 1.0, height: 1,
            sillHeight: 1, elementId: 'win_b',
          },
        },
      ),
    ).toThrow(WallOpeningOverlapError);
  });

  it('rejects openings extending past the wall length', async () => {
    env = buildEnv();
    const wallId = await makeWall(env);
    await expect(
      env.bus.executeCommand('wall.createOpening', {
        wallId,
        opening: {
          id: 'op_1', type: 'window', offset: 4.5, width: 1.0,
          height: 1, sillHeight: 1, elementId: 'win_x',
        },
      }),
    ).rejects.toThrow(/extends beyond wall length/);
  });

  it('rejects duplicate opening id', async () => {
    env = buildEnv();
    const wallId = await makeWall(env);
    await env.bus.executeCommand('wall.createOpening', {
      wallId,
      opening: {
        id: 'op_1', type: 'door', offset: 1, width: 0.9, height: 2,
        sillHeight: 0, elementId: 'door_a',
      },
    });
    await expect(
      env.bus.executeCommand('wall.createOpening', {
        wallId,
        opening: {
          id: 'op_1', type: 'window', offset: 3.0, width: 0.6, height: 1,
          sillHeight: 1, elementId: 'win_a',
        },
      }),
    ).rejects.toThrow(/already exists/);
  });
});

// ── CreateWallBetweenMarks ────────────────────────────────────────

describe('wall.createBetweenMarks', () => {
  let env: ReturnType<typeof buildEnv>;
  afterEach(() => env?.detach());

  it('creates a wall with the provided endpoints', async () => {
    env = buildEnv();
    const id = createId('wall');
    const ev = await env.bus.executeCommand('wall.createBetweenMarks', {
      id,
      levelId: 'lvl_a',
      start: { x: 0, y: 0, z: 0 },
      end:   { x: 4, y: 0, z: 3 },
      height: 2.7,
      thickness: 0.15,
    });
    const w = env.store.get(id)!;
    expect(w.baseLine[0]).toEqual({ x: 0, y: 0, z: 0 });
    expect(w.baseLine[1]).toEqual({ x: 4, y: 0, z: 3 });
    expect(w.height).toBe(2.7);

    undoLast(env.store, ev);
    expect(env.store.get(id)).toBeUndefined();
  });

  it('rejects mark distance < 0.05 m', async () => {
    env = buildEnv();
    await expect(
      env.bus.executeCommand('wall.createBetweenMarks', {
        levelId: 'lvl_a',
        start: { x: 0, y: 0, z: 0 },
        end:   { x: 0.04, y: 0, z: 0 },
      }),
    ).rejects.toThrow(/≥ 0.05/);
  });

  it('rejects mismatched start.y / end.y', async () => {
    env = buildEnv();
    await expect(
      env.bus.executeCommand('wall.createBetweenMarks', {
        levelId: 'lvl_a',
        start: { x: 0, y: 0, z: 0 },
        end:   { x: 5, y: 1, z: 0 },
      }),
    ).rejects.toThrow(/level elevation/);
  });

  it('validates systemTypeId against catalogue when provided', async () => {
    const sts = buildSystemTypeStore();
    env = buildEnv({ systemTypeStore: sts });
    await expect(
      env.bus.executeCommand('wall.createBetweenMarks', {
        levelId: 'lvl_a',
        start: { x: 0, y: 0, z: 0 },
        end:   { x: 5, y: 0, z: 0 },
        systemTypeId: 'st_NOPE',
      }),
    ).rejects.toThrow(/unknown systemTypeId/);
  });
});

// ── CreateWallsFromSlab ───────────────────────────────────────────

describe('wall.createFromSlab', () => {
  let env: ReturnType<typeof buildEnv>;
  afterEach(() => env?.detach());

  it('mints one wall per perimeter edge', async () => {
    env = buildEnv();
    const ev = await env.bus.executeCommand('wall.createFromSlab', {
      levelId: 'lvl_a',
      perimeter: [
        { x: 0, y: 0, z: 0 },
        { x: 4, y: 0, z: 0 },
        { x: 4, y: 0, z: 3 },
        { x: 0, y: 0, z: 3 },
      ],
      height: 3,
    });
    expect(env.store.getState().size).toBe(4);

    undoLast(env.store, ev);
    expect(env.store.getState().size).toBe(0);
  });

  it('skips edges shorter than 0.05 m but mints the rest', async () => {
    env = buildEnv();
    await env.bus.executeCommand('wall.createFromSlab', {
      levelId: 'lvl_a',
      perimeter: [
        { x: 0, y: 0, z: 0 },
        { x: 4, y: 0, z: 0 },
        { x: 4.001, y: 0, z: 0 }, // micro-edge → skipped
        { x: 0, y: 0, z: 3 },
      ],
    });
    expect(env.store.getState().size).toBe(3);
  });

  it('rejects polygons with < 3 vertices', async () => {
    env = buildEnv();
    await expect(
      env.bus.executeCommand('wall.createFromSlab', {
        levelId: 'lvl_a',
        perimeter: [{ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }],
      }),
    ).rejects.toThrow(/≥ 3 vertices/);
  });

  it('rejects polygons with mixed elevations', async () => {
    env = buildEnv();
    await expect(
      env.bus.executeCommand('wall.createFromSlab', {
        levelId: 'lvl_a',
        perimeter: [
          { x: 0, y: 0, z: 0 },
          { x: 4, y: 0, z: 0 },
          { x: 4, y: 1, z: 3 },
        ],
      }),
    ).rejects.toThrow(/level elevation must be uniform/);
  });
});

// ── ChangeWallLevel ───────────────────────────────────────────────

describe('wall.changeLevel', () => {
  let env: ReturnType<typeof buildEnv>;
  afterEach(() => env?.detach());

  it('rebases levelId and baseLine.y', async () => {
    env = buildEnv();
    const id = createId('wall');
    await env.bus.executeCommand('wall.create', {
      id,
      levelId: 'lvl_0',
      baseLine: [
        { x: 0, y: 0, z: 0 },
        { x: 5, y: 0, z: 0 },
      ],
    });
    const ev = await env.bus.executeCommand('wall.changeLevel', {
      id,
      newLevelId: 'lvl_1',
      newElevationY: 3.0,
    });
    const w = env.store.get(id)!;
    expect(w.levelId).toBe('lvl_1');
    expect(w.baseLine[0].y).toBe(3.0);
    expect(w.baseLine[1].y).toBe(3.0);

    undoLast(env.store, ev);
    const after = env.store.get(id)!;
    expect(after.levelId).toBe('lvl_0');
    expect(after.baseLine[0].y).toBe(0);
  });

  it('rejects when wall does not exist', async () => {
    env = buildEnv();
    await expect(
      env.bus.executeCommand('wall.changeLevel', {
        id: 'wall_NOPE',
        newLevelId: 'lvl_1',
        newElevationY: 3,
      }),
    ).rejects.toThrow(/wall not found/);
  });

  it('rejects non-finite newElevationY', async () => {
    env = buildEnv();
    const id = createId('wall');
    await env.bus.executeCommand('wall.create', { id, levelId: 'lvl_0' });
    await expect(
      env.bus.executeCommand('wall.changeLevel', {
        id,
        newLevelId: 'lvl_1',
        newElevationY: Number.NaN,
      }),
    ).rejects.toThrow(/finite/);
  });
});

// ── JoinWall ──────────────────────────────────────────────────────

describe('wall.join', () => {
  let env: ReturnType<typeof buildEnv>;
  afterEach(() => env?.detach());

  it('snaps endpointA of A to endpointB of B', async () => {
    env = buildEnv();
    const a = createId('wall');
    const b = createId('wall');
    await env.bus.executeCommand('wall.create', {
      id: a, levelId: 'lvl_a',
      baseLine: [{ x: 0, y: 0, z: 0 }, { x: 5, y: 0, z: 0 }],
    });
    await env.bus.executeCommand('wall.create', {
      id: b, levelId: 'lvl_a',
      baseLine: [{ x: 5.2, y: 0, z: 0.1 }, { x: 10, y: 0, z: 0 }],
    });
    const ev = await env.bus.executeCommand('wall.join', {
      idA: a, endpointA: 1, idB: b, endpointB: 0,
    });
    const wA = env.store.get(a)!;
    expect(wA.baseLine[1]).toEqual({ x: 5.2, y: 0, z: 0.1 });
    expect(wA.baseLine[0]).toEqual({ x: 0, y: 0, z: 0 }); // start preserved

    // B is unaffected.
    const wB = env.store.get(b)!;
    expect(wB.baseLine[0]).toEqual({ x: 5.2, y: 0, z: 0.1 });

    undoLast(env.store, ev);
    expect(env.store.get(a)!.baseLine[1]).toEqual({ x: 5, y: 0, z: 0 });
  });

  it('rejects self-join', async () => {
    env = buildEnv();
    const a = createId('wall');
    await env.bus.executeCommand('wall.create', { id: a, levelId: 'lvl_a' });
    await expect(
      env.bus.executeCommand('wall.join', {
        idA: a, endpointA: 0, idB: a, endpointB: 1,
      }),
    ).rejects.toThrow(/itself/);
  });

  it('rejects join across levels', async () => {
    env = buildEnv();
    const a = createId('wall');
    const b = createId('wall');
    await env.bus.executeCommand('wall.create', { id: a, levelId: 'lvl_0' });
    await env.bus.executeCommand('wall.create', {
      id: b, levelId: 'lvl_1',
      baseLine: [{ x: 5, y: 3, z: 0 }, { x: 10, y: 3, z: 0 }],
    });
    await expect(
      env.bus.executeCommand('wall.join', {
        idA: a, endpointA: 1, idB: b, endpointB: 0,
      }),
    ).rejects.toThrow(/different levels/);
  });

  it('rejects join that would shrink A below 0.05 m', async () => {
    env = buildEnv();
    const a = createId('wall');
    const b = createId('wall');
    await env.bus.executeCommand('wall.create', {
      id: a, levelId: 'lvl_a',
      baseLine: [{ x: 0, y: 0, z: 0 }, { x: 5, y: 0, z: 0 }],
    });
    await env.bus.executeCommand('wall.create', {
      id: b, levelId: 'lvl_a',
      baseLine: [{ x: 0.01, y: 0, z: 0 }, { x: 4, y: 0, z: 0 }],
    });
    await expect(
      env.bus.executeCommand('wall.join', {
        idA: a, endpointA: 1, idB: b, endpointB: 0,
      }),
    ).rejects.toThrow(/shrink/);
  });
});

// ── CutWall ───────────────────────────────────────────────────────

describe('wall.cut', () => {
  let env: ReturnType<typeof buildEnv>;
  afterEach(() => env?.detach());

  it('splits a wall into two halves at the given point', async () => {
    env = buildEnv();
    const id = createId('wall');
    await env.bus.executeCommand('wall.create', {
      id, levelId: 'lvl_a',
      baseLine: [{ x: 0, y: 0, z: 0 }, { x: 6, y: 0, z: 0 }],
    });
    const before = snapState(env.store);
    const ev = await env.bus.executeCommand('wall.cut', {
      id,
      at: { x: 2, y: 0, z: 0 },
      leftId: 'wall_left',
      rightId: 'wall_right',
    });
    expect(env.store.get(id)).toBeUndefined();
    expect(env.store.get('wall_left')!.baseLine[1]).toEqual({ x: 2, y: 0, z: 0 });
    expect(env.store.get('wall_right')!.baseLine[0]).toEqual({ x: 2, y: 0, z: 0 });

    undoLast(env.store, ev);
    expect(snapState(env.store)).toEqual(before);
  });

  it('migrates openings to the appropriate half (offset re-based for right)', async () => {
    env = buildEnv();
    const id = createId('wall');
    await env.bus.executeCommand('wall.create', {
      id, levelId: 'lvl_a',
      baseLine: [{ x: 0, y: 0, z: 0 }, { x: 10, y: 0, z: 0 }],
    });
    await env.bus.executeCommand('wall.createOpening', {
      wallId: id,
      opening: {
        id: 'op_l', type: 'door', offset: 1, width: 0.9, height: 2,
        sillHeight: 0, elementId: 'door_a',
      },
    });
    await env.bus.executeCommand('wall.createOpening', {
      wallId: id,
      opening: {
        id: 'op_r', type: 'window', offset: 6, width: 1.0, height: 1,
        sillHeight: 1, elementId: 'win_a',
      },
    });
    await env.bus.executeCommand('wall.cut', {
      id,
      at: { x: 4, y: 0, z: 0 },
      leftId: 'wall_left',
      rightId: 'wall_right',
    });
    const left = env.store.get('wall_left')!;
    const right = env.store.get('wall_right')!;
    expect(left.openings.map(o => o.id)).toEqual(['op_l']);
    expect(right.openings.map(o => o.id)).toEqual(['op_r']);
    // offset for op_r re-based: 6 - 4 = 2
    expect(right.openings[0].offset).toBe(2);
    // childrenIds partitioned to match.
    expect(left.childrenIds).toContain('door_a');
    expect(right.childrenIds).toContain('win_a');
  });

  it('straddle rejection: bus surface message + execute() typed throw', async () => {
    env = buildEnv();
    const id = createId('wall');
    await env.bus.executeCommand('wall.create', {
      id, levelId: 'lvl_a',
      baseLine: [{ x: 0, y: 0, z: 0 }, { x: 10, y: 0, z: 0 }],
    });
    await env.bus.executeCommand('wall.createOpening', {
      wallId: id,
      opening: {
        id: 'op_x', type: 'door', offset: 3.5, width: 1.0, height: 2,
        sillHeight: 0, elementId: 'door_x',
      },
    });
    // 1) Bus surface — canExecute rejects with descriptive message.
    await expect(
      env.bus.executeCommand('wall.cut', {
        id,
        at: { x: 4, y: 0, z: 0 }, // 4 ∈ (3.5, 4.5)
      }),
    ).rejects.toThrow(/straddle/);
    // 2) Direct execute() (race-defensive path) — typed error.
    const handler = new CutWallHandler();
    expect(() =>
      handler.execute(
        {
          stores: { wall: Object.fromEntries(env.store.getState()) as WallsState },
          audit: { actorId: 'test', projectId: 'p1', clientId: 't1', timestamp: 0 },
        },
        { id, at: { x: 4, y: 0, z: 0 } },
      ),
    ).toThrow(WallCutOpeningStraddleError);
  });

  it('rejects cuts that fall inside the MIN_WALL_LEN safety margin', async () => {
    env = buildEnv();
    const id = createId('wall');
    await env.bus.executeCommand('wall.create', {
      id, levelId: 'lvl_a',
      baseLine: [{ x: 0, y: 0, z: 0 }, { x: 5, y: 0, z: 0 }],
    });
    await expect(
      env.bus.executeCommand('wall.cut', { id, at: { x: 0.02, y: 0, z: 0 } }),
    ).rejects.toThrow(/cuttable interval/);
  });
});
