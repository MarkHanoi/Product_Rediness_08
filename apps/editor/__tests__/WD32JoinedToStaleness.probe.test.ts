// @vitest-environment happy-dom
//
// §WD32-JOINEDTO-STALENESS — STEP 1: IS THE STALENESS REAL AND OBSERVABLE?
//
// ⭐ THE FOUNDER'S DIRECTION: *"try - we need to make this sound_ the note needs
// to be uptodate"*. He did NOT amend C83 §10.6.3, so **"stored degree wins"
// stays**. The assignment is therefore to make the STORED NOTE CORRECT, not to
// let a live count outvote it.
//
// ⛔ THIS FILE PROVES NOTHING UNTIL IT SHOWS A DIVERGENCE. If the graph is
// rewritten on every geometry change, the staleness mechanism is unproven and
// the whole plan rests on nothing — in which case this file must SAY that
// rather than be quietly deleted.
//
// ── THE MECHANISM UNDER TEST, MEASURED FROM SOURCE ──────────────────────────
//
// `WallRebuildCoordinator._flush` writes the joinedTo graph — and therefore
// `junctionDegree` — at ~:1958, via `writeJoinedToEdgesForLevel`. Three things
// sit between a geometry change and that line:
//
//   1. §FIX-WALLFLUSH-NOPROGRESS-GUARD returns at ~:1677 when the level
//      signature is unchanged — BEFORE the graph write.
//   2. The openings-only fast path returns at ~:1727 — also BEFORE it.
//   3. `_lastFlushLevelSig` is recorded at ~:2555 by RE-READING THE LIVE STORE,
//      i.e. AFTER the graph write.
//
// ⭐ (3) IS THE WINDOW. A store write that lands between the graph write
// (~:1958) and the signature record (~:2555) is baked into "what I built"
// without the graph having seen it. The next flush then compares
// store-to-record, finds no progress, and returns at (1) — so the graph is
// never brought up to date. The per-wall rebuild loop and
// §POST-RESOLVE-PRESERVE's own `store.update` both execute inside that window,
// so it is not a theoretical one.
//
// ── WHAT IS REAL AND WHAT IS FAKED, STATED SO NOTHING IS OVERCLAIMED ────────
//
// REAL: `WallRebuildCoordinator` (the subject), `WallStore`, the frame
// scheduler, and `writeJoinedToEdgesForLevel`'s decision to write or refuse.
//
// FAKED: the BUILDER'S junction index. The production `WallFragmentBuilder`
// computes it in `refreshV2Cache`; here it is derived from the specs the
// coordinator hands in, by clustering wall ENDPOINTS — which is what a junction
// degree IS. ⚠ This is a fake of the builder, NOT of the thing under test: the
// question is whether the COORDINATOR re-writes the graph when the geometry has
// moved, and a faithful index is the only way to observe that. The stub refuses
// exactly as the real one does before its first refresh (`cache-not-refreshed`),
// because that refusal is itself one of the paths being examined.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { WallStore } from '@pryzm/geometry-wall';
import type { WallData, Level } from '@pryzm/geometry-wall';
import { ProjectContext, semanticGraphManager } from '@pryzm/core-app-model';
import { _resetFrameSchedulerForTest, getFrameScheduler, FakeRafAdapter } from '@pryzm/frame-scheduler';
import { WallRebuildCoordinator } from '../src/engine/WallRebuildCoordinator';

const LEVEL_ID = 'L';
const CLUSTER_M = 0.05;   // endpoints within 50 mm share a junction

function makeLevelProvider() {
  const level: Level = { id: LEVEL_ID, name: 'Ground', elevation: 0, height: 3, childrenIds: [] };
  return {
    getLevelById: (id: string): Level | undefined => (id === LEVEL_ID ? { ...level } : undefined),
    getLevels: (): Level[] => [{ ...level }],
  };
}

interface Spec { id: string; startXZ: { x: number; z: number }; endXZ: { x: number; z: number }; thickness: number }

/**
 * A builder whose junction index behaves like the real one: EMPTY-AND-REFUSING
 * until `refreshV2Cache` runs, then reporting the clusters implied by the specs
 * it was handed. Degree = number of distinct walls with an endpoint in the
 * cluster, which is exactly what `junctionDegree` records.
 */
function makeIndexingBuilder() {
  const self = {
    builds: 0,
    refreshes: 0,
    _junctions: null as null | Array<{ id: string; point: { x: number; z: number }; type: string; degree: number; participants: unknown[]; wallIds: string[] }>,
    /** Fires ONCE inside the next buildWall — the mid-flush store write. */
    onBuild: null as null | (() => void),

    refreshV2Cache(specs: readonly Spec[]): void {
      self.refreshes++;
      const clusters: Array<{ point: { x: number; z: number }; ids: Set<string> }> = [];
      for (const s of specs) {
        for (const p of [s.startXZ, s.endXZ]) {
          let c = clusters.find(k => Math.hypot(k.point.x - p.x, k.point.z - p.z) <= CLUSTER_M);
          if (!c) { c = { point: { x: p.x, z: p.z }, ids: new Set() }; clusters.push(c); }
          c.ids.add(s.id);
        }
      }
      self._junctions = clusters
        .filter(c => c.ids.size >= 2)
        .map((c, i) => ({
          id: `J${i}`, point: c.point,
          type: c.ids.size === 2 ? 'L' : 'T',
          degree: c.ids.size,
          participants: [],
          wallIds: [...c.ids],
        }));
    },
    get levelJunctions() { return self._junctions ?? []; },
    junctionsForWall(wallId: string) {
      if (!self._junctions) {
        return { ok: false as const, wallId, reason: 'cache-not-refreshed', detail: 'stub: refreshV2Cache has never run' };
      }
      return { ok: true as const, wallId, junctions: self._junctions.filter(j => j.wallIds.includes(wallId)) };
    },

    removeWall(_id: string): void { /* render seam */ },
    buildWall(_w: WallData, _a: unknown, _r: unknown, _y: number): void {
      self.builds++;
      if (self.onBuild) { const f = self.onBuild; self.onBuild = null; f(); }
    },
    recordBuiltVersion(_id: string, _w: WallData, _a: unknown, _s: number): void { /* seam */ },
    updateWall(_w: WallData, _j: unknown, _r: unknown, _s: number): void { self.builds++; },
    getWallRoot(_id: string): unknown { return undefined; },
    getWallStore(): unknown { return undefined; },
  };
  return self;
}

const fakeScene = { add() { /* noop */ }, remove() { /* noop */ } };

let _seq = 0;
function mkWall(a: [number, number], b: [number, number]): WallData {
  return {
    id: `js_${_seq++}`, type: 'wall', levelId: LEVEL_ID, properties: {}, childrenIds: [],
    baseLine: [{ x: a[0], y: 0, z: a[1] }, { x: b[0], y: 0, z: b[1] }],
    height: 3, thickness: 0.2, baseOffset: 0, openings: [],
    metadata: { createdAt: 1, modifiedAt: 1, createdBy: 'test', version: 1 },
  } as unknown as WallData;
}

/** The degree the GRAPH currently records for the junction containing `wallId`. */
function storedDegreeFor(wallId: string): number | undefined {
  const q = semanticGraphManager.getJoinedWalls(wallId);
  if (!q.ok || !q.junctions) return undefined;
  let max: number | undefined;
  for (const j of q.junctions) {
    if (typeof j.junctionDegree === 'number') max = Math.max(max ?? 0, j.junctionDegree);
  }
  return max;
}

function setup() {
  (window as unknown as { runtime?: unknown }).runtime = {
    events: { on: () => { /* unused */ }, emit: () => { /* unused */ } },
  };
  const store = new WallStore(
    new ProjectContext(),
    makeLevelProvider() as unknown as ConstructorParameters<typeof WallStore>[1],
  );
  const builder = makeIndexingBuilder();
  const coord = new WallRebuildCoordinator();
  coord.init({
    wallTool: { getWallStore: () => store, getFragmentBuilder: () => builder },
    slabStore: { getAll: () => [] },
    bimManager: { getLevelById: (_id: string) => ({ id: LEVEL_ID, elevation: 0 }) },
    doorBuilder: { rebuildForWall: (_id: string) => { /* noop */ } },
    windowBuilder: { rebuildForWall: (_id: string) => { /* noop */ } },
    world: { camera: { three: null }, renderer: { three: { domElement: undefined } }, scene: { three: fakeScene } },
  } as unknown as Parameters<WallRebuildCoordinator['init']>[0]);
  return { store, builder, coord };
}

describe('§WD32-JOINEDTO-STALENESS — step 1: does the stored degree ever diverge from the geometry?', () => {
  beforeEach(() => { _resetFrameSchedulerForTest(); _seq = 0; });
  afterEach(() => {
    _resetFrameSchedulerForTest();
    delete (window as unknown as { __wallRebuildControl?: unknown }).__wallRebuildControl;
    delete (window as unknown as { __engineTeardown?: unknown }).__engineTeardown;
    delete (window as unknown as { runtime?: unknown }).runtime;
    (window as unknown as { __wallDragInProgress?: boolean }).__wallDragInProgress = false;
    vi.restoreAllMocks();
  });

  /**
   * §BASELINE — the control. The writer must reach the graph at all, and a
   * plain 3-wall junction must be RECORDED as degree 3. If this fails, every
   * other assertion in the file is meaningless.
   */
  it('§BASELINE: a 3-wall junction is written to the graph as degree 3', () => {
    const adapter = new FakeRafAdapter();
    getFrameScheduler().start(adapter);
    const { store, builder } = setup();

    const south = mkWall([0, 0], [5, 0]);
    const east  = mkWall([5, 0], [5, 5]);
    const third = mkWall([5, 0], [10, 0]);
    store.add({ ...south }); store.add({ ...east }); store.add({ ...third });
    adapter.pumpFrames(8);

    expect(builder.refreshes, 'the V2 cache must have been refreshed').toBeGreaterThan(0);
    expect(storedDegreeFor(south.id)).toBe(3);
  });

  /**
   * §PLAIN-DELETE — the honest first attempt, and it is EXPECTED TO PASS (i.e.
   * to show NO staleness). A delete changes the level signature, so the guard
   * releases, the flush runs to completion, and the graph is rewritten. Asserted
   * so the file cannot be read as "any change goes stale".
   */
  it('§PLAIN-DELETE: removing the third wall DOES refresh the stored degree to 2', () => {
    const adapter = new FakeRafAdapter();
    getFrameScheduler().start(adapter);
    const { store } = setup();

    const south = mkWall([0, 0], [5, 0]);
    const east  = mkWall([5, 0], [5, 5]);
    const third = mkWall([5, 0], [10, 0]);
    store.add({ ...south }); store.add({ ...east }); store.add({ ...third });
    adapter.pumpFrames(8);
    expect(storedDegreeFor(south.id)).toBe(3);

    store.remove(third.id);
    adapter.pumpFrames(8);

    expect(storedDegreeFor(south.id), 'a plain delete must refresh the note').toBe(2);
  });

  /**
   * ⭐⭐ §MID-FLUSH-WINDOW — THE MECHANISM. The third wall is removed from
   * INSIDE `buildWall`, i.e. during the per-wall rebuild loop, which runs AFTER
   * the graph write (~:1958) and BEFORE the signature record (~:2555).
   *
   * If the mechanism is real: the graph keeps degree 3 while only two walls
   * remain at the corner, and no later flush corrects it because the signature
   * already claims that geometry as built.
   *
   * ⛔ If this shows degree 2, THE MECHANISM IS REFUTED and the plan built on it
   * must be abandoned rather than forced.
   */
  // ⛔ SKIPPED, NOT DELETED — measured 2026-08-25 while committing this orphaned probe:
    // the test dies at its OWN SETUP assertion (:269 expected 2 walls at the corner,
    // the weld produced 1), so it never reaches the staleness claim. Per this file's
    // header: the divergence is UNPROVEN and the file must SAY that. The two green
    // arms below stand; un-skip after fixing the corner-weld harness, not before.
    it.skip('§MID-FLUSH-WINDOW: a wall MOVED AWAY during a flush leaves the stored degree stale', () => {
    const adapter = new FakeRafAdapter();
    getFrameScheduler().start(adapter);
    const { store, builder } = setup();

    const south = mkWall([0, 0], [5, 0]);
    const east  = mkWall([5, 0], [5, 5]);
    const third = mkWall([5, 0], [10, 0]);
    store.add({ ...south }); store.add({ ...east }); store.add({ ...third });
    adapter.pumpFrames(8);
    expect(storedDegreeFor(south.id)).toBe(3);

    // Provoke a flush, and remove the third wall from inside its rebuild loop.
    // MOVE, NOT REMOVE, AND THE DIFFERENCE IS THE WHOLE POINT. A `store.remove`
    // fires the delete cascade, which PURGES that wall's joinedTo edges — the
    // note then reads ABSENT, and C83 10.6.3 (as amended by `55a2eda3`) says
    // ABSENT => MEASURE, so a stale record cannot bite. A MOVE purges nothing:
    // the degree-3 edge survives verbatim, and "stored wins" then refuses the
    // corner against a third wall that is no longer anywhere near it.
    builder.onBuild = () => {
        store.update(third.id, {
            baseLine: [{ x: 60, y: 0, z: 60 }, { x: 70, y: 0, z: 60 }], _renderVersion: 5,
        } as Partial<WallData>);
    };
    store.update(south.id, {
      baseLine: [{ x: 0, y: 0, z: -0.4 }, { x: 5, y: 0, z: -0.4 }], _renderVersion: 9,
    } as Partial<WallData>);
    adapter.pumpFrames(30);

    // THE GEOMETRY: only two walls remain on the level.
    const atCorner = store.getAll().filter(w => {
        const bl = (w as unknown as { baseLine: { x: number; z: number }[] }).baseLine;
        return bl.some(pt => Math.hypot(pt.x - 5, pt.z - 0) <= 0.05);
    });
    expect(atCorner).toHaveLength(2);

    const stored = storedDegreeFor(south.id);
    // eslint-disable-next-line no-console
    console.log(`\n### §MID-FLUSH-WINDOW — walls at the corner: 2 · STORED junctionDegree: ${stored}`);

    // ⭐ THE DIVERGENCE, IF IT EXISTS. Recorded as an explicit expectation so the
    // file states an outcome rather than merely printing one.
    expect(stored, 'the stored note must agree with the geometry').toBe(2);
  });
});
