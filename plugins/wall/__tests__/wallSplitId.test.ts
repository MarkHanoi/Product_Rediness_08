// §FEAT-WALL-SPLIT-ID (GE-10, C70 §3) — the `wall.split` verb id.
//
// The register's finding, restated: the opening-aware CAPABILITY already exists
// (`CutWallHandler`, `wall.cut` — it rejects cuts whose openings straddle the cut
// point NAMING the offending ids, re-checks race-defensively, and partitions the
// surviving openings left/right). What did not exist was a `wall.split` command
// id. The gap is an ID, not a capability — so this lands an id OVER the existing
// handler and rebuilds nothing.
//
// These tests therefore assert two things and only two things:
//   1) `wall.split` is a registered, dispatchable bus verb;
//   2) it is the SAME capability — byte-identical store outcome to `wall.cut`
//      for the same payload, and the SAME opening-straddle refusal. If those
//      ever diverge, a second cut path has been minted, which is precisely what
//      the register forbids ("do not rebuild the cut path").

import { afterEach, describe, expect, it } from 'vitest';
import {
  CommandBus,
  PatchEmitter,
  UndoStack,
  type EventRecord,
} from '@pryzm/plugin-sdk';
import { attachStores } from '@pryzm/plugin-sdk';
import { createId } from '@pryzm/plugin-sdk';
import { WallStore, type WallData, type WallsState } from '../src/store.js';
import { buildWallHandlerSet, WALL_HANDLER_TYPES } from '../src/handlers/index.js';

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

function snapState(store: WallStore): Record<string, WallData> {
  return JSON.parse(JSON.stringify(Object.fromEntries(store.getState())));
}

function undoLast(store: WallStore, record: EventRecord<unknown>): void {
  store.applyPatch([...record.inverse].reverse());
}

describe('wall.split — the minted id (GE-10)', () => {
  let env: ReturnType<typeof buildEnv>;
  afterEach(() => env?.detach());

  it('is a registered wall handler type', () => {
    expect(WALL_HANDLER_TYPES).toContain('wall.split');
  });

  it('splits a wall into two halves and round-trips on undo', async () => {
    env = buildEnv();
    const id = createId('wall');
    await env.bus.executeCommand('wall.create', {
      id, levelId: 'lvl_a',
      baseLine: [{ x: 0, y: 0, z: 0 }, { x: 6, y: 0, z: 0 }],
    });
    const before = snapState(env.store);
    const ev = await env.bus.executeCommand('wall.split', {
      id, at: { x: 2, y: 0, z: 0 }, leftId: 'wall_left', rightId: 'wall_right',
    });
    expect(env.store.get(id)).toBeUndefined();
    expect(env.store.get('wall_left')!.baseLine[1]).toEqual({ x: 2, y: 0, z: 0 });
    expect(env.store.get('wall_right')!.baseLine[0]).toEqual({ x: 2, y: 0, z: 0 });

    undoLast(env.store, ev);
    expect(snapState(env.store)).toEqual(before);
  });

  it('is the SAME capability as wall.cut — identical store outcome', async () => {
    // ONE id, reused by both runs — the comparison is of outcome, not of ids.
    const id = createId('wall');
    const run = async (verb: string) => {
      const e = buildEnv();
      await e.bus.executeCommand('wall.create', {
        id, levelId: 'lvl_a',
        baseLine: [{ x: 0, y: 0, z: 0 }, { x: 10, y: 0, z: 0 }],
      });
      await e.bus.executeCommand('wall.createOpening', {
        wallId: id,
        opening: {
          id: 'op_l', type: 'door', offset: 1, width: 0.9, height: 2,
          sillHeight: 0, elementId: 'door_a',
        },
      });
      await e.bus.executeCommand('wall.createOpening', {
        wallId: id,
        opening: {
          id: 'op_r', type: 'window', offset: 6, width: 1.0, height: 1,
          sillHeight: 1, elementId: 'win_a',
        },
      });
      await e.bus.executeCommand(verb, {
        id, at: { x: 4, y: 0, z: 0 }, leftId: 'wall_left', rightId: 'wall_right',
      });
      const snap = snapState(e.store);
      e.detach();
      return snap;
    };
    expect(await run('wall.split')).toEqual(await run('wall.cut'));
  });

  it('inherits the opening-aware straddle refusal, naming the opening', async () => {
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
    await expect(
      env.bus.executeCommand('wall.split', { id, at: { x: 4, y: 0, z: 0 } }),
    ).rejects.toThrow(/op_x/);
  });
});
