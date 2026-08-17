// §L-944-PREFLIGHT-UNDETERMINED — the slab-loop weld pre-flight, and the two
// ways it was lying.
//
// ## WHAT WAS MEASURED, AND ON WHAT
//
// Founder console, production `55a2eda3`, ONE wall-move gesture:
//
//     [SlabWallConnectivityService] §L-921-SLAB-PREFLIGHT preview failed
//        (non-fatal): TypeError: t.getAll is not a function
//          at h6.canExecute (...)
//
// Reproduced here on 2026-08-17 with the minified names resolved, by calling
// `previewSlabConnectivityWeld` directly on a 6×4 region slab:
//
//     TypeError: wallStore.getAll is not a function
//         at CascadeWallBaselineCommand.canExecute (CascadeWallBaselineCommand.ts:254:40)
//         at previewSlabConnectivityWeld (SlabWallConnectivityService.ts:669:12)
//     PROBE RESULT {"allowed":true,"evaluated":false,"entries":0,"refusal":null}
//
// ## DEFECT ONE — THE SHIM WAS AN INCOMPLETE STAND-IN
//
// The pre-flight's whole design is that it asks the REAL command's REAL
// `canExecute`, so the pre-move refusal and the post-move one cannot drift.
// To do that it builds a shim wall store presenting the moved wall at its
// PROPOSED baseline. The shim implemented the service's own `WallStoreRef`
// — `subscribe` / `getById` / `update` — but `canExecute` reads MORE of a wall
// store than this service's planners do: §C83-S1-MOVE added
// `wallStore.getAll()` to build the host list for `evaluateWallPlacement`.
// The context was handed over as `as never`, which erased the only check that
// would have caught it, so ARM 2 threw on every call.
//
// ## DEFECT TWO — AND THE THROW WAS REPORTED AS PERMISSION
//
// The catch logged `(non-fatal)` and returned the SAME value as a pre-flight
// that had nothing to check: `allowed: true, evaluated: false`. The one caller
// (`gateWallMove`) gates on `allowed`. So the check that exists to stop an
// unbounded slab-loop weld was switched off by its own crash and said so in a
// tone that reads as reassurance.
//
// "(non-fatal)" described the exception's effect on the CALL STACK. Its effect
// on the MODEL was that a user drag reached the weld with no gate at all.
//
// ⚠ THE ORDER OF THE TWO FIXES MATTERS AND IS NOT INTERCHANGEABLE. Fixing the
// honesty alone would have blocked EVERY slab-loop move, because the throw was
// happening on every one. The shim fix removes the systematic cause; the
// honesty fix catches the residue. Both, or neither.
//
// ## WHAT THIS FILE ASSERTS
//
// Not that a predicate returns a value in isolation — the terminal states of
// the pre-flight, on a real store, a real region-traced slab sketch and the
// real `CascadeWallBaselineCommand`. The caller half (the wall's STORED
// position after a gesture whose pre-flight threw) is
// `apps/editor/__tests__/wallMoveSlabWeldUndetermined.test.ts`, because the
// caller lives there.

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { WallStore } from '@pryzm/geometry-wall';
import type { WallData } from '@pryzm/geometry-wall';
import {
  SlabStore,
  previewSlabConnectivityWeld,
  traceRegionSketchAtPoint,
  type PreflightWallStoreRef,
  type RegionWallLike,
  type SlabData,
  type SlabSketch,
} from '../src/index';
import { ProjectContext } from '@pryzm/core-app-model';

const LEVEL = 'L0';

/**
 * The founder's 6×4 perimeter loop, the same fixture
 * `apps/editor/__tests__/wallMoveSlabWeldPreMove.test.ts` uses:
 *
 *     w-south (0,0)→(6,0)   w-east (6,0)→(6,4)
 *     w-north (6,4)→(0,4)   w-west (0,4)→(0,0)
 */
const DRAG_X_CLEAN = 5;

let seq = 0;

function wallRecord(id: string, s: [number, number], e: [number, number]): WallData {
  return {
    id, type: 'wall', levelId: LEVEL, properties: {}, childrenIds: [],
    baseLine: [{ x: s[0], y: 0, z: s[1] }, { x: e[0], y: 0, z: e[1] }],
    height: 3, thickness: 0.2, baseOffset: 0, openings: [],
    metadata: { createdAt: ++seq, modifiedAt: seq, createdBy: 'test', version: 1 },
  } as unknown as WallData;
}

function makeLevelProvider() {
  const level = { id: LEVEL, name: 'Ground', elevation: 0, height: 3, childrenIds: [] as string[] };
  return {
    getLevelById: (id: string) => (id === LEVEL ? { ...level } : undefined),
    getLevels: () => [{ ...level }],
  };
}

interface World {
  wallStore: WallStore;
  slabStore: SlabStore;
}

/** The loop + a region-traced slab whose outer loop hostReferences all four walls. */
function makeWorld(withSlab = true): World {
  const wallStore = new WallStore(
    new ProjectContext(),
    makeLevelProvider() as unknown as ConstructorParameters<typeof WallStore>[1],
  );
  const slabStore = new SlabStore();
  // `WallFaceResolver` reads `window.wallStore` when no resolveStore is passed;
  // the pre-flight passes its shim, but the global is set so a partial code path
  // cannot silently read an empty world and make this suite pass for the wrong
  // reason.
  Object.assign(globalThis as object, { wallStore });

  wallStore.add(wallRecord('w-south', [0, 0], [6, 0]));
  wallStore.add(wallRecord('w-east',  [6, 0], [6, 4]));
  wallStore.add(wallRecord('w-north', [6, 4], [0, 4]));
  wallStore.add(wallRecord('w-west',  [0, 4], [0, 0]));

  if (withSlab) {
    const rw: RegionWallLike[] = wallStore.getAll()
      .map(w => ({ id: w.id, baseLine: w.baseLine.map(p => ({ x: p.x, z: p.z })) }));
    const traced = traceRegionSketchAtPoint(rw, 3, 2);
    expect(traced, 'the fixture must produce a closed region sketch').not.toBeNull();
    slabStore.add({
      id: 'slab-loop', type: 'slab', levelId: LEVEL, thickness: 0.2,
      position: { x: 0, y: 0, z: 0 }, polygon: traced!.ring,
      sketch: traced!.sketch as SlabSketch,
      ifcData: { guid: 'g', ifcClass: 'IfcSlab' },
    } as unknown as SlabData);
  }

  return { wallStore, slabStore };
}

/** Move `w-west` to x = `toX`, keeping both endpoints' z. */
function proposal(world: World, id: string, toX: number) {
  const w = world.wallStore.getById(id)!;
  return [
    { x: toX, y: w.baseLine[0].y, z: w.baseLine[0].z },
    { x: toX, y: w.baseLine[1].y, z: w.baseLine[1].z },
  ] as [{ x: number; y: number; z: number }, { x: number; y: number; z: number }];
}

let errorSpy: ReturnType<typeof vi.spyOn> | undefined;

beforeEach(() => { seq = 0; });
afterEach(() => { errorSpy?.mockRestore(); errorSpy = undefined; });

describe('§L-944 — the slab-loop weld pre-flight must not report a crash as permission', () => {

  it('ARM 2 ACTUALLY RUNS: the pre-flight evaluates a clean slab-loop weld instead of throwing', () => {
    // THE REGRESSION. Before the shim fix this returned `evaluated: false`
    // because `CascadeWallBaselineCommand.canExecute` threw
    // `TypeError: wallStore.getAll is not a function` at line 254 — measured
    // verbatim, see this file's header. Every non-collapsing slab-loop move in
    // production took that path, which means ARM 2 — the arm that asks the real
    // command whether the weld is legal — had never once run.
    const world = makeWorld();

    const r = previewSlabConnectivityWeld({
      slabStore: world.slabStore as never,
      wallStore: world.wallStore as unknown as PreflightWallStoreRef,
      movedWallId: 'w-west',
      newBaseLine: proposal(world, 'w-west', DRAG_X_CLEAN),
    });

    expect(r.evaluated, 'the pre-flight must reach a verdict, not fall out of a catch').toBe(true);
    expect(r.undetermined).toBe(false);
    expect(r.undeterminedReason).toBeNull();
    // x = 5 leaves w-south 1.0 m and w-north 1.0 m — far above the 0.1 m floor —
    // so the weld is legal and the answer is a real yes, not a swallowed one.
    expect(r.allowed).toBe(true);
    expect(r.refusal).toBeNull();
    // …and it planned the welds it would have to do. An "allowed" with zero
    // entries on a wall that IS in a slab loop is what the crash returned.
    expect(r.entries.length, 'a clean weld still has entries to apply').toBeGreaterThan(0);
  }, 30000);

  it('THE SHIM DELEGATES getAll TO THE REAL STORE — it does not answer with an empty world', () => {
    // The failure mode this rules out is the crash's twin: satisfying the
    // command's call with `getAll: () => []`. That type-checks, never throws,
    // and makes `evaluateWallPlacement` vacuously pass because there are no
    // hosts to cross. The check would run, look at nothing, and report "clear"
    // — a silent skip wearing a type-correct hat.
    const world = makeWorld();
    let getAllCalls = 0;
    const spied: PreflightWallStoreRef = {
      subscribe: (cb) => world.wallStore.subscribe(cb as never),
      getById: (id) => world.wallStore.getById(id),
      getAll: () => { getAllCalls++; return world.wallStore.getAll(); },
      update: (id, u) => world.wallStore.update(id, u as never),
    };

    const r = previewSlabConnectivityWeld({
      slabStore: world.slabStore as never,
      wallStore: spied,
      movedWallId: 'w-west',
      newBaseLine: proposal(world, 'w-west', DRAG_X_CLEAN),
    });

    expect(r.evaluated).toBe(true);
    expect(
      getAllCalls,
      'the shim must read the REAL wall set; a hard-coded empty list would make the ' +
      'occupancy predicate pass vacuously',
    ).toBeGreaterThan(0);
  }, 30000);

  it('UNDETERMINED: a pre-flight whose machinery throws refuses — it does not permit', () => {
    // The deliberate throw, injected at the EXACT production site: the store
    // read `CascadeWallBaselineCommand.canExecute` performs. Everything before
    // it (applicability, corner planning, dedupe, the collapse floor) runs
    // normally, so this reproduces "the question was applicable and the
    // machinery broke" rather than "there was nothing to ask".
    //
    // BEFORE the fix this returned `{ allowed: true, evaluated: false }` — the
    // literal value the crash produced in production, and the reason the weld
    // ran unguarded.
    const world = makeWorld();
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const throwing: PreflightWallStoreRef = {
      subscribe: (cb) => world.wallStore.subscribe(cb as never),
      getById: (id) => world.wallStore.getById(id),
      getAll: () => { throw new TypeError('wallStore.getAll is not a function'); },
      update: (id, u) => world.wallStore.update(id, u as never),
    };

    const r = previewSlabConnectivityWeld({
      slabStore: world.slabStore as never,
      wallStore: throwing,
      movedWallId: 'w-west',
      newBaseLine: proposal(world, 'w-west', DRAG_X_CLEAN),
    });

    // ── THE ASSERTION THIS FILE EXISTS FOR ───────────────────────────────────
    expect(r.allowed, 'an unrun check is not a passed check').toBe(false);
    expect(r.undetermined).toBe(true);
    expect(r.evaluated, 'it did not evaluate — that half of the old value was true').toBe(false);
    expect(r.undeterminedReason).toContain('getAll is not a function');

    // §REFUSAL-IDENTITY — the code lives inside the prose, so a sink that takes
    // only a string cannot lose it, and it is a DISTINCT code from every
    // geometric refusal: the user is not being told their wall is impossible.
    expect(r.refusal?.code).toBe('SLAB_WELD_UNDETERMINED');
    expect(r.refusal?.sentence).toContain('SLAB_WELD_UNDETERMINED');
    expect(r.refusal?.sentence).toContain('fault in PRYZM');
    expect(r.refusal?.sentence).toContain('Nothing was changed');

    // And it is AUDIBLE at error level, not warn-with-a-reassuring-adjective.
    // A gate that stops working must not read like a gate that found nothing.
    const said = errorSpy.mock.calls.map(c => String(c[0])).join('\n');
    expect(said).toContain('UNDETERMINED');
    expect(said).not.toContain('non-fatal');
  }, 30000);

  it('NOT APPLICABLE still allows: a wall in no slab loop is not refused by this gate', () => {
    // The control that stops the test above from being "satisfied" by refusing
    // everything. C83 §5.3 governs HERE and is unchanged: a question that does
    // not apply refuses nothing. `undetermined` is what separates this from the
    // arm above — both have `evaluated: false`, and before §L-944 that was the
    // ONLY value either could return.
    const world = makeWorld(/* withSlab */ false);

    const r = previewSlabConnectivityWeld({
      slabStore: world.slabStore as never,
      wallStore: world.wallStore as unknown as PreflightWallStoreRef,
      movedWallId: 'w-west',
      newBaseLine: proposal(world, 'w-west', DRAG_X_CLEAN),
    });

    expect(r.allowed, 'no slab loop ⇒ nothing to weld ⇒ nothing to refuse').toBe(true);
    expect(r.evaluated).toBe(false);
    expect(r.undetermined, 'not-applicable is not undetermined').toBe(false);
    expect(r.refusal).toBeNull();
  }, 30000);
});
