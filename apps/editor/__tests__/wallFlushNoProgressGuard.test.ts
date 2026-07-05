// @vitest-environment happy-dom
//
// §FIX-WALLFLUSH-NOPROGRESS-GUARD (L-97, founder 2026-07-04) — the wall-rebuild-flush freeze.
//
// THE founder blocker (a DIFFERENT root than the L-63 room-redetect loop): create a wall with
// a hosted door, then MOVE the wall → the app FREEZES. `WallRebuildCoordinator._flush` writes
// each resolved wall's baseline back to the store; that store mutation fires a buffered
// `wall:update` that re-arms `_scheduleFlush` after `_joinsResolving` clears. When the moved
// door-bearing wall lands in a `§SELF-CLUSTER-GUARD` cluster the resolver keeps re-writing it,
// so the flush re-arms EVERY rAF frame and never converges → the main thread pegs.
//
// FIX (mirrors L-63): `_flush` is a pure function of the level's wall rebuild inputs; if the
// store geometry is byte-identical to what the LAST completed flush already built, the flush is
// skipped (no resolve, no store.update, no commit) → the loop terminates. A genuine edit changes
// the signature and releases the gate; a per-frame runaway trips the circuit-breaker.
//
// This suite drives the REAL WallRebuildCoordinator and asserts: (1) a wall-move + hosted door
// CONVERGES in a bounded number of flushes (no per-frame runaway); (2) repeated no-op re-arms on
// unchanged geometry do NOT rebuild (the gate); (3) a genuine geometry edit DOES rebuild (release).

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { WallStore } from '@pryzm/geometry-wall';
import type { WallData, Level } from '@pryzm/geometry-wall';
import { ProjectContext } from '@pryzm/core-app-model';
import { _resetFrameSchedulerForTest, getFrameScheduler, FakeRafAdapter } from '@pryzm/frame-scheduler';
import { WallRebuildCoordinator } from '../src/engine/WallRebuildCoordinator';

const LEVEL_ID = 'L';

function makeLevelProvider() {
  const level: Level = { id: LEVEL_ID, name: 'Ground', elevation: 0, height: 3, childrenIds: [] };
  return {
    getLevelById: (id: string): Level | undefined => (id === LEVEL_ID ? { ...level } : undefined),
    getLevels: (): Level[] => [{ ...level }],
  };
}

function makeBuilderStub() {
  return {
    builds: 0,
    removeWall(_id: string): void { /* render seam */ },
    buildWall(_w: WallData, _a: unknown, _r: unknown, _y: number): void { this.builds++; },
    recordBuiltVersion(_id: string, _w: WallData, _a: unknown, _s: number): void { /* render seam */ },
    updateWall(_w: WallData, _j: unknown, _r: unknown, _s: number): void { this.builds++; },
    getWallRoot(_id: string): unknown { return undefined; },
    getWallStore() { return undefined; },
  };
}

const fakeScene = { add() { /* noop */ }, remove() { /* noop */ } };

let _seq = 0;
function mkWall(bl: [{ x: number; y: number; z: number }, { x: number; y: number; z: number }], openings: any[] = []): WallData {
  return {
    id: `wf_${_seq++}`, type: 'wall', levelId: LEVEL_ID, properties: {},
    childrenIds: openings.map((o: any) => o.elementId),
    baseLine: [{ ...bl[0] }, { ...bl[1] }], height: 3, thickness: 0.2, baseOffset: 0,
    openings, metadata: { createdAt: 1, modifiedAt: 1, createdBy: 'test', version: 1 },
  } as unknown as WallData;
}

function setup() {
  const committed = vi.fn();
  (window as unknown as { runtime?: unknown }).runtime = {
    events: { on: () => { /* unused */ }, emit: (e: string, p: unknown) => { if (e === 'bim-wall-mutation-committed') committed(p); } },
  };
  const store = new WallStore(new ProjectContext(), makeLevelProvider() as unknown as ConstructorParameters<typeof WallStore>[1]);
  const builder = makeBuilderStub();
  const coord = new WallRebuildCoordinator();
  coord.init({
    wallTool: { getWallStore: () => store, getFragmentBuilder: () => builder },
    slabStore: { getAll: () => [] },
    bimManager: { getLevelById: (_id: string) => ({ id: LEVEL_ID, elevation: 0 }) },
    doorBuilder: { rebuildForWall: (_id: string) => { /* noop */ } },
    windowBuilder: { rebuildForWall: (_id: string) => { /* noop */ } },
    world: { camera: { three: null }, renderer: { three: { domElement: undefined } }, scene: { three: fakeScene } },
  });
  return { store, builder, committed, coord };
}

describe('§FIX-WALLFLUSH-NOPROGRESS-GUARD (L-97) — wall-move-with-door flush converges (no infinite rAF)', () => {
  beforeEach(() => { _resetFrameSchedulerForTest(); _seq = 0; });
  afterEach(() => {
    _resetFrameSchedulerForTest();
    delete (window as unknown as { __wallRebuildControl?: unknown }).__wallRebuildControl;
    delete (window as unknown as { __engineTeardown?: unknown }).__engineTeardown;
    delete (window as unknown as { runtime?: unknown }).runtime;
    (window as unknown as { __wallDragInProgress?: boolean }).__wallDragInProgress = false;
  });

  it('moving a door-bearing wall CONVERGES in bounded frames — no per-frame flush runaway', () => {
    const adapter = new FakeRafAdapter();
    getFrameScheduler().start(adapter);
    const { store, committed } = setup();

    // A wall hosting a door (opening near its end), a perpendicular neighbour, and a SHORT stub
    // whose BOTH ends fall in one cluster near the corner (the §SELF-CLUSTER-GUARD trigger).
    const host = mkWall([{ x: 0, y: 0, z: 0 }, { x: 5, y: 0, z: 0 }], [{ id: 'op_d1', type: 'door', elementId: 'door_d1', offset: 4.2, width: 0.7, sillHeight: 0, height: 2.1 }]);
    const perp = mkWall([{ x: 5, y: 0, z: 0 }, { x: 5, y: 0, z: 5 }]);
    const stub = mkWall([{ x: 5.02, y: 0, z: 0.02 }, { x: 5.06, y: 0, z: 0.05 }]); // ~50 mm — both ends in the corner cluster
    store.add({ ...host }); store.add({ ...perp }); store.add({ ...stub });
    adapter.pumpFrames(6);
    committed.mockClear();

    // Move the door-bearing wall (the repro's UPDATE_WALL_BASELINE).
    (window as unknown as { __wallDragInProgress?: boolean }).__wallDragInProgress = false;
    store.update(host.id, { baseLine: [{ x: 0.3, y: 0, z: 0 }, { x: 5.3, y: 0, z: 0 }], _renderVersion: 1 } as Partial<WallData>);

    // Pump MANY frames. Without the guard the flush re-arms every frame → committed fires ~per
    // frame. With the guard it converges: the commit barrier fires only a bounded number of times.
    adapter.pumpFrames(80);
    expect(committed.mock.calls.length).toBeGreaterThan(0);
    expect(committed.mock.calls.length).toBeLessThanOrEqual(6); // bounded — NOT ~80
  });

  it('the no-progress gate: repeated no-op re-arms on UNCHANGED geometry do NOT rebuild', () => {
    const adapter = new FakeRafAdapter();
    getFrameScheduler().start(adapter);
    const { store, builder } = setup();

    // Plain walls (no openings) so every update takes the WHOLE-LEVEL resolveLevel path the
    // guard covers (a door-bearing wall's value edit takes the separate openings-only fast path).
    const host = mkWall([{ x: 0, y: 0, z: 0 }, { x: 5, y: 0, z: 0 }]);
    const perp = mkWall([{ x: 5, y: 0, z: 0 }, { x: 5, y: 0, z: 5 }]);
    store.add({ ...host }); store.add({ ...perp });
    adapter.pumpFrames(6);
    const afterInitial = builder.builds;
    expect(afterInitial).toBeGreaterThan(0);

    // Fire N no-op re-arms — a store mutation whose GEOMETRY is unchanged (only _renderVersion
    // bumps, exactly the buffered whole-level re-arm signature). Each schedules a flush; the gate
    // must skip it because the level's rebuild signature is identical to the last completed flush.
    for (let i = 0; i < 15; i++) {
      store.update(host.id, { _renderVersion: 100 + i } as Partial<WallData>);
      adapter.pumpFrames(2);
    }
    expect(builder.builds).toBe(afterInitial); // ZERO extra rebuilds — the gate held

    // A GENUINE geometry edit releases the gate → the flush rebuilds again.
    store.update(host.id, { baseLine: [{ x: 0, y: 0, z: 0 }, { x: 5.5, y: 0, z: 0 }], _renderVersion: 999 } as Partial<WallData>);
    adapter.pumpFrames(4);
    expect(builder.builds).toBeGreaterThan(afterInitial);
  });
});
