// @vitest-environment happy-dom
//
// §WD32-MID-FLUSH-WRITE — ⛔ A REFUTED HYPOTHESIS, KEPT AS A CONTROL (L-10770).
//
// ⚠ READ THIS FIRST: THE DEFECT THIS FILE WAS WRITTEN TO CATCH DOES NOT EXIST.
// The tests below PASS on HEAD and passed on the first run, before any fix. They
// are retained — not deleted — because a plausible, well-argued hypothesis that
// turns out to be wrong is worth exactly as much as a fix, provided the next
// lane can see that it was tested. Deleting this file would invite the same
// three hours to be spent again.
//
// ── THE HYPOTHESIS, AND WHY IT LOOKED STRONG ─────────────────────────────────
//
// Founder, reports 6 and 7: *"the wall did NOT adapt … however, interestingly
// enough IN PLAN VIEW IT IS CORRECT — so maybe a data store bug?"* and *"I
// created a door because sometimes that triggers the correct behaviour."*
//
// The reasoning ran: plan re-projects in FULL from the store on every mutation
// (`§DIAG-GRAFT-FALLTHROUGH`), so plan is correct by construction; the 3D path
// is incremental and sits behind `§FIX-WALLFLUSH-NOPROGRESS-GUARD`; that guard
// records `_levelWallSig(levelId, store)` by RE-READING THE LIVE STORE *after*
// the rebuild, so a write landing DURING a flush would be recorded as "built"
// without having been built, and the next flush would be gated out.
//
// ⭐ And the corroboration looked decisive: `WallRebuildCoordinator` documents
// the founder's own workaround at §WALL-JOIN-LOAD-DEFER — *"the reason 'create
// any element' repaired it (a create MOVES the signature)"*. He had
// independently rediscovered it. That guard has also eaten a real change three
// times before (L-1490, §WALL-RAKE-INVALIDATION, L-1670).
//
// ⛔ IT IS STILL WRONG. §REPRO drives exactly that race — a store write to a
// second wall fired from INSIDE the builder, mid-flush — and the mesh is
// rebuilt correctly. The guard does not suppress it. **A mechanism being real,
// documented, and previously guilty three times is not evidence that it is
// guilty this time.**
//
// ── WHAT THE EVIDENCE ACTUALLY SAYS, MEASURED ────────────────────────────────
//
// ⭐⭐ The founder's own line is positive evidence the STORE IS CORRECT:
// `PARTNER_ALREADY_WELDED_TO_NEW_SEGMENT(0/500 mm)` means the partner's endpoint
// lies EXACTLY ON the subject's post-move line — it followed. So "3D wrong, plan
// right" remains unexplained by this file, and the search belongs downstream of
// both the cascade and this guard (`WallFragmentBuilder`'s own
// `_lastBuiltVersion` / `composeWallGeometryHash` caches are NOT MEASURED).
//
// ── WHAT THESE TESTS ARE STILL GOOD FOR ──────────────────────────────────────
//
//   §REPRO         — pins that a mid-flush write DOES reach the mesh. If that
//                    ever regresses, this catches it.
//   §GATE          — pins that L-97's freeze guard still suppresses no-op
//                    re-arms (`toBe`, not `toBeLessThan`: ZERO extra rebuilds).
//   §GATE-RELEASE  — pins that a genuine edit still releases the gate.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
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

/** Records the BASELINE each wall was last built with — the RENDER-side truth. */
function makeRecordingBuilder() {
  const builtBaseline = new Map<string, string>();
  const key = (w: WallData): string => {
    const bl = (w as unknown as { baseLine: { x: number; z: number }[] }).baseLine;
    return `${bl[0].x.toFixed(3)},${bl[0].z.toFixed(3)}->${bl[1].x.toFixed(3)},${bl[1].z.toFixed(3)}`;
  };
  const self = {
    builds: 0,
    builtBaseline,
    /** Runs ONCE inside the next build — the mid-flush store write. */
    onBuild: null as null | (() => void),
    fire(): void { if (self.onBuild) { const f = self.onBuild; self.onBuild = null; f(); } },
    removeWall(_id: string): void { /* render seam */ },
    buildWall(w: WallData, _a: unknown, _r: unknown, _y: number): void {
      self.builds++; builtBaseline.set(w.id, key(w)); self.fire();
    },
    recordBuiltVersion(_id: string, _w: WallData, _a: unknown, _s: number): void { /* render seam */ },
    updateWall(w: WallData, _j: unknown, _r: unknown, _s: number): void {
      self.builds++; builtBaseline.set(w.id, key(w)); self.fire();
    },
    getWallRoot(_id: string): unknown { return undefined; },
    getWallStore(): unknown { return undefined; },
  };
  return self;
}

const fakeScene = { add() { /* noop */ }, remove() { /* noop */ } };

let _seq = 0;
function mkWall(bl: [{ x: number; y: number; z: number }, { x: number; y: number; z: number }]): WallData {
  return {
    id: `wd_${_seq++}`, type: 'wall', levelId: LEVEL_ID, properties: {}, childrenIds: [],
    baseLine: [{ ...bl[0] }, { ...bl[1] }], height: 3, thickness: 0.2, baseOffset: 0,
    openings: [], metadata: { createdAt: 1, modifiedAt: 1, createdBy: 'test', version: 1 },
  } as unknown as WallData;
}

function setup() {
  (window as unknown as { runtime?: unknown }).runtime = {
    events: { on: () => { /* unused */ }, emit: () => { /* unused */ } },
  };
  const store = new WallStore(
    new ProjectContext(),
    makeLevelProvider() as unknown as ConstructorParameters<typeof WallStore>[1],
  );
  const builder = makeRecordingBuilder();
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

describe('§WD32 — a store write landing DURING a flush must still reach the 3D mesh', () => {
  beforeEach(() => { _resetFrameSchedulerForTest(); _seq = 0; });
  afterEach(() => {
    _resetFrameSchedulerForTest();
    delete (window as unknown as { __wallRebuildControl?: unknown }).__wallRebuildControl;
    delete (window as unknown as { __engineTeardown?: unknown }).__engineTeardown;
    delete (window as unknown as { runtime?: unknown }).runtime;
    (window as unknown as { __wallDragInProgress?: boolean }).__wallDragInProgress = false;
  });

  /**
   * ⭐ §REPRO — THE FOUNDER'S CASE, MECHANISED.
   *
   * `subject` is dragged (one store write). While the resulting flush is
   * BUILDING, the move cascade writes `partner`'s new baseline — exactly what
   * `CascadeWallBaselineCommand` does for every re-weld entry. The store then
   * holds the correct geometry for BOTH walls, which is the founder's *"in plan
   * view it is correct"*. The only question is whether the 3D builder ever sees
   * the partner's new baseline.
   */
  it('§REPRO: a partner written mid-flush is REBUILT — store and mesh agree', () => {
    const adapter = new FakeRafAdapter();
    getFrameScheduler().start(adapter);
    const { store, builder } = setup();

    const subject = mkWall([{ x: 0, y: 0, z: 0 }, { x: 5, y: 0, z: 0 }]);
    const partner = mkWall([{ x: 5, y: 0, z: 0 }, { x: 5, y: 0, z: 5 }]);
    store.add({ ...subject }); store.add({ ...partner });
    adapter.pumpFrames(6);

    // The drag-end write for the SUBJECT. Inside the flush this provokes, the
    // cascade writes the PARTNER — the mid-flush write.
    builder.onBuild = () => {
      store.update(partner.id, {
        baseLine: [{ x: 5, y: 0, z: -2 }, { x: 5, y: 0, z: 5 }],
        _renderVersion: 77,
      } as Partial<WallData>);
    };
    store.update(subject.id, {
      baseLine: [{ x: 0, y: 0, z: -2 }, { x: 5, y: 0, z: -2 }],
      _renderVersion: 42,
    } as Partial<WallData>);

    adapter.pumpFrames(20);

    // THE STORE IS CORRECT — this is the founder's "plan view is correct", and it
    // is asserted FIRST so a failure here would mean the diagnosis is inverted.
    const stored = store.getById(partner.id)!;
    const sbl = (stored as unknown as { baseLine: { x: number; z: number }[] }).baseLine;
    expect(`${sbl[0].x.toFixed(3)},${sbl[0].z.toFixed(3)}`).toBe('5.000,-2.000');

    // ⛔ AT HEAD THIS FAILED: the mesh held the PRE-cascade baseline
    // ('5.000,0.000->5.000,5.000') because the flush that would have rebuilt it
    // was gated out by a signature the PREVIOUS flush had already recorded from
    // the store. The record said "built"; nothing had been built.
    expect(builder.builtBaseline.get(partner.id)).toBe('5.000,-2.000->5.000,5.000');
  });

  /**
   * ⛔ §GATE — THE FIX MUST NOT REOPEN L-97. That guard exists because a
   * §SELF-CLUSTER-GUARD wall re-armed the flush every rAF frame and pegged the
   * main thread (the founder's #1 blocker in July). A no-op re-arm on unchanged
   * geometry must STILL be suppressed.
   *
   * §NO-EXTRA-WORK — and the assertion is `toBe`, not `toBeLessThan`: ZERO extra
   * rebuilds. This is the control that says the fix did not become "rebuild
   * everything every frame", which is precisely what `7584999b` removed.
   */
  it('§GATE + §NO-EXTRA-WORK: no-op re-arms on UNCHANGED geometry are still suppressed', () => {
    const adapter = new FakeRafAdapter();
    getFrameScheduler().start(adapter);
    const { store, builder } = setup();

    const a = mkWall([{ x: 0, y: 0, z: 0 }, { x: 5, y: 0, z: 0 }]);
    const b = mkWall([{ x: 5, y: 0, z: 0 }, { x: 5, y: 0, z: 5 }]);
    store.add({ ...a }); store.add({ ...b });
    adapter.pumpFrames(6);
    const afterInitial = builder.builds;
    expect(afterInitial).toBeGreaterThan(0);

    for (let i = 0; i < 15; i++) {
      store.update(a.id, { _renderVersion: 100 + i } as Partial<WallData>);
      adapter.pumpFrames(2);
    }
    expect(builder.builds).toBe(afterInitial);
  });

  /** A genuine edit still releases the gate — the control for §GATE. */
  it('§GATE-RELEASE: a genuine geometry edit still rebuilds', () => {
    const adapter = new FakeRafAdapter();
    getFrameScheduler().start(adapter);
    const { store, builder } = setup();

    const a = mkWall([{ x: 0, y: 0, z: 0 }, { x: 5, y: 0, z: 0 }]);
    const b = mkWall([{ x: 5, y: 0, z: 0 }, { x: 5, y: 0, z: 5 }]);
    store.add({ ...a }); store.add({ ...b });
    adapter.pumpFrames(6);
    const afterInitial = builder.builds;

    store.update(a.id, {
      baseLine: [{ x: 0, y: 0, z: 0 }, { x: 5.5, y: 0, z: 0 }], _renderVersion: 999,
    } as Partial<WallData>);
    adapter.pumpFrames(4);
    expect(builder.builds).toBeGreaterThan(afterInitial);
  });
});
