// §GATE-G10 / §UNDO-AUDIT-2026 §01-§2.3 — "undo must not corrupt NEIGHBOUR elements".
//
// THE HAZARD (why CreateWallCommand carries `_neighbourSnapshot`)
// ----------------------------------------------------------------------------
// Adding a wall is NOT a local mutation. `wallStore.add()` fires a store event that
// makes the WallJoinResolver re-trim every wall in the new wall's junction cluster
// to a fresh consensus point (ADR-0055). So one create SILENTLY REWRITES the
// baselines of its neighbours. If undo only removed the new wall, those trims would
// survive it — the neighbours stay stuck at the post-join geometry, and the model no
// longer matches what the user had before the gesture. That is state corruption, and
// it compounds over an undo/redo cycle.
//
// `CreateWallCommand.execute()` therefore snapshots every wall's `baseLine` +
// `_sourceBaseLine` on the level BEFORE the store mutation, and `undo()` writes them
// back. These tests pin exactly that: they drive a resolver double that mangles the
// neighbours (as the real one does) and assert undo restores them EXACTLY, including
// the `_sourceBaseLine` idempotency anchor the WallStore.update() hook would
// otherwise clear.

import { describe, it, expect, beforeEach } from 'vitest';
import { CreateWallCommand } from '../src/walls/CreateWallCommand';
import type { CommandContext } from '../src/types';

type Pt = { x: number; y: number; z: number };
interface W {
  id: string;
  levelId: string;
  baseLine: [Pt, Pt];
  _sourceBaseLine?: [Pt, Pt];
  openings: unknown[];
  childrenIds: string[];
}

function p(x: number, z: number): Pt { return { x, y: 0, z }; }

/** Canonical (key-order-independent) serialisation — the equality oracle. A restore
 *  that re-adds a deleted key legitimately changes insertion order, which is not a
 *  state difference; VALUES are what undo must reproduce exactly. */
function canon(v: unknown): string {
  const sort = (x: unknown): unknown => {
    if (Array.isArray(x)) return x.map(sort);
    if (x && typeof x === 'object') {
      const o = x as Record<string, unknown>;
      return Object.fromEntries(Object.keys(o).sort().map(k => [k, sort(o[k])]));
    }
    return x;
  };
  return JSON.stringify(sort(v));
}

/** Minimal WallStore double with the mutator surface CreateWallCommand uses. */
function makeWallStore(seed: W[]) {
  const map = new Map<string, W>(seed.map(w => [w.id, w]));
  return {
    map,
    add(w: W) { map.set(w.id, w); },
    remove(id: string) { map.delete(id); },
    getById(id: string) { return map.get(id); },
    getAll() { return [...map.values()]; },
    getByLevel(levelId: string) { return [...map.values()].filter(w => w.levelId === levelId); },
    update(id: string, patch: Partial<W>) {
      const w = map.get(id);
      if (!w) return;
      // Mirrors the real WallStore.update() hook: setting `baseLine` WITHOUT
      // `_sourceBaseLine` in the same call CLEARS the anchor.
      const next: W = { ...w, ...patch } as W;
      if (patch.baseLine !== undefined && patch._sourceBaseLine === undefined) delete next._sourceBaseLine;
      map.set(id, next);
    },
  };
}

function makeCtx(store: ReturnType<typeof makeWallStore>): CommandContext {
  const level = { id: 'L0', elevation: 0, childrenIds: [] as string[] };
  return {
    stores: { wallStore: store },
    bimManager: {
      getLevels: () => [level],
      getLevelById: (id: string) => (id === 'L0' ? level : undefined),
      registerElement: () => {},
      unregisterElement: () => {},
    },
  } as unknown as CommandContext;
}

/** The WallJoinResolver's observable effect: re-trim the neighbours' baselines to a
 *  new consensus point after the newcomer joins their cluster. */
function simulateJoinRetrim(store: ReturnType<typeof makeWallStore>, ids: string[], dx: number): void {
  for (const id of ids) {
    const w = store.getById(id);
    if (!w) continue;
    store.update(id, {
      baseLine: [p(w.baseLine[0].x, w.baseLine[0].z), p(w.baseLine[1].x + dx, w.baseLine[1].z)],
    });
  }
}

describe('§GATE-G10 — CreateWallCommand.undo() restores neighbours re-trimmed by the join resolver', () => {
  let store: ReturnType<typeof makeWallStore>;
  let ctx: CommandContext;

  beforeEach(() => {
    store = makeWallStore([
      { id: 'N1', levelId: 'L0', baseLine: [p(0, 0), p(5, 0)], _sourceBaseLine: [p(0, 0), p(5, 0)], openings: [], childrenIds: [] },
      { id: 'N2', levelId: 'L0', baseLine: [p(5, 0), p(5, 5)], openings: [], childrenIds: [] },
    ]);
    ctx = makeCtx(store);
  });

  it('undo removes the new wall AND puts every neighbour baseline back, byte-for-byte', () => {
    const before = canon(store.getAll());

    const cmd = new CreateWallCommand('NEW', {
      start: { x: 5, z: 0 }, end: { x: 9, z: 0 }, height: 3, thickness: 0.2, levelId: 'L0',
    });
    expect(cmd.canExecute(ctx).ok).toBe(true);
    expect(cmd.execute(ctx).success).toBe(true);

    // The resolver fires off the store event and mangles the neighbours.
    simulateJoinRetrim(store, ['N1', 'N2'], 0.1);
    expect(store.getById('N1')!.baseLine[1].x).toBe(5.1);   // corrupted by the join
    expect(store.getById('N1')!._sourceBaseLine).toBeUndefined(); // …anchor cleared too

    expect(cmd.undo(ctx).success).toBe(true);

    expect(store.getById('NEW')).toBeUndefined();           // the gesture itself is reverted
    expect(store.getById('N1')!.baseLine[1].x).toBe(5);     // neighbour trim reverted
    expect(store.getById('N2')!.baseLine[1].z).toBe(5);
    expect(canon(store.getAll())).toBe(before);    // whole level byte-identical
  });

  it('undo restores `_sourceBaseLine` in the SAME update — the resolver idempotency anchor is not erased', () => {
    const cmd = new CreateWallCommand('NEW', {
      start: { x: 5, z: 0 }, end: { x: 9, z: 0 }, height: 3, thickness: 0.2, levelId: 'L0',
    });
    cmd.execute(ctx);
    simulateJoinRetrim(store, ['N1'], 0.25);
    expect(store.getById('N1')!._sourceBaseLine).toBeUndefined();

    cmd.undo(ctx);

    // N1 had a _sourceBaseLine before the create → it MUST come back with the baseline.
    expect(store.getById('N1')!._sourceBaseLine).toEqual([p(0, 0), p(5, 0)]);
    // N2 never had one → it must NOT gain a phantom anchor.
    expect(store.getById('N2')!._sourceBaseLine).toBeUndefined();
  });

  it('the snapshot is level-scoped — a wall on another level is never touched by undo', () => {
    store.add({ id: 'OTHER', levelId: 'L1', baseLine: [p(0, 9), p(4, 9)], openings: [], childrenIds: [] });
    const otherBefore = canon(store.getById('OTHER'));

    const cmd = new CreateWallCommand('NEW', {
      start: { x: 5, z: 0 }, end: { x: 9, z: 0 }, height: 3, thickness: 0.2, levelId: 'L0',
    });
    cmd.execute(ctx);
    cmd.undo(ctx);

    expect(canon(store.getById('OTHER'))).toBe(otherBefore);
  });

  it('undo → redo → undo is a fixed point: the neighbours survive repeated cycles', () => {
    const before = canon(store.getAll());
    const cmd = new CreateWallCommand('NEW', {
      start: { x: 5, z: 0 }, end: { x: 9, z: 0 }, height: 3, thickness: 0.2, levelId: 'L0',
    });

    for (let cycle = 0; cycle < 3; cycle++) {
      cmd.execute(ctx);                       // redo re-runs execute() (CommandManager.redo)
      simulateJoinRetrim(store, ['N1', 'N2'], 0.1);
      const withWall = store.getAll().length;
      expect(withWall).toBe(3);

      cmd.undo(ctx);
      expect(canon(store.getAll()), `cycle ${cycle}`).toBe(before);
    }
  });

  it('the IFC GUID is stable across undo/redo (no fresh guid per cycle)', () => {
    const cmd = new CreateWallCommand('NEW', {
      start: { x: 5, z: 0 }, end: { x: 9, z: 0 }, height: 3, thickness: 0.2, levelId: 'L0',
    });
    cmd.execute(ctx);
    const guid1 = (store.getById('NEW') as unknown as { ifcData: { guid: string } }).ifcData.guid;
    cmd.undo(ctx);
    cmd.execute(ctx);
    const guid2 = (store.getById('NEW') as unknown as { ifcData: { guid: string } }).ifcData.guid;

    expect(guid2).toBe(guid1);
  });
});
