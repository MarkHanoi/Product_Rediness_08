// dimension.* — the ONLY mutation path into `dimensionStore` (P6).
//
// Driven through the REAL runtime, so these tests also prove the verbs are
// REACHABLE. `referencePlane.*` and `solid.*` were once authored, unit-tested
// and registered by nothing; existence is not reachability, and a unit test
// that constructs the command family by hand cannot tell the difference.
//
// @vitest-environment node

import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import {
  PLACE_DIMENSION_VERB,
  REMOVE_DIMENSION_VERB,
  SET_DIMENSION_VALUE_VERB,
  readDimensionValue,
} from '../../src/commands/dimension/index.js';
import {
  createFamilyEditorRuntime,
  type FamilyEditorRuntime,
} from '../../src/app/familyEditorRuntime.js';
import type { DimensionId } from '../../src/measure/dimension.js';
import type { SketchViewKind } from '../../src/views/viewProjection.js';

describe('dimension.* — placed, read, and driven from', () => {
  let rt: FamilyEditorRuntime;

  beforeEach(() => {
    rt = createFamilyEditorRuntime({ skipSolverUpgrade: true });
  });
  afterEach(() => {
    rt.dispose();
  });

  function twoPoints(view: SketchViewKind, z2 = 0) {
    const doc = rt.sketchViews.docFor(view);
    return { p1: doc.addPoint(0, 0), p2: doc.addPoint(1000, z2) };
  }

  // ── Reachability ─────────────────────────────────────────────────────────
  it('registers all three verbs on the runtime bus', () => {
    expect(rt.commandBus.has(PLACE_DIMENSION_VERB)).toBe(true);
    expect(rt.commandBus.has(SET_DIMENSION_VALUE_VERB)).toBe(true);
    expect(rt.commandBus.has(REMOVE_DIMENSION_VERB)).toBe(true);
  });

  it('exposes the dimension store on the runtime', () => {
    expect(rt.dimensionStore).toBeDefined();
    expect(rt.dimensionStore.get().dimensions).toEqual([]);
  });

  // ── Place ────────────────────────────────────────────────────────────────
  it('places a reporting-only dimension that reads the true distance', async () => {
    const { p1, p2 } = twoPoints('plan');
    const id = await rt.commandBus.execute<unknown, DimensionId>(
      PLACE_DIMENSION_VERB, { view: 'plan', p1, p2 },
    );
    const dim = rt.dimensionStore.get().byId[id]!;
    expect(dim.view).toBe('plan');
    expect(dim.drivingConstraintId).toBeNull();

    const read = readDimensionValue(
      {
        dimensionStore: rt.dimensionStore,
        constraintStoreFor: (v) => rt.sketchViews.constraintStoreFor(v),
        docSnapshotFor: (v) => rt.sketchViews.docFor(v).get(),
      },
      dim,
    );
    expect(read).not.toBeNull();
    expect(read!.mm).toBeCloseTo(1000, 9);
    expect(read!.driven).toBe(false);
  });

  it('indexes a dimension under the work plane it annotates', async () => {
    const plan = twoPoints('plan');
    const front = twoPoints('elevation-front', -2400);
    await rt.commandBus.execute(PLACE_DIMENSION_VERB, { view: 'plan', ...plan });
    await rt.commandBus.execute(PLACE_DIMENSION_VERB, { view: 'elevation-front', ...front });

    const snap = rt.dimensionStore.get();
    expect(snap.byView.plan).toHaveLength(1);
    expect(snap.byView['elevation-front']).toHaveLength(1);
    expect(snap.byView['elevation-side']).toHaveLength(0);
  });

  // A dimension may only span its OWN work plane. Because entity ids collide
  // across documents, this check must be made against the named view's
  // document — never against "whatever document is on screen".
  it('refuses to dimension points that are not in that view’s document', async () => {
    const { p1, p2 } = twoPoints('plan');
    await expect(
      rt.commandBus.execute(PLACE_DIMENSION_VERB, { view: 'elevation-side', p1, p2 }),
    ).rejects.toThrow(/not in the "elevation-side" document/);
  });

  it('refuses an unknown view, and refuses a zero-length dimension', async () => {
    const { p1 } = twoPoints('plan');
    await expect(
      rt.commandBus.execute(PLACE_DIMENSION_VERB, { view: 'nope', p1, p2: p1 }),
    ).rejects.toThrow(/unknown view/i);
    await expect(
      rt.commandBus.execute(PLACE_DIMENSION_VERB, { view: 'plan', p1, p2: p1 }),
    ).rejects.toThrow(/must differ/);
  });

  it('applies the §12.2 standard offset for a string rank', async () => {
    const { p1, p2 } = twoPoints('plan');
    const id = await rt.commandBus.execute<unknown, DimensionId>(
      PLACE_DIMENSION_VERB, { view: 'plan', p1, p2, stringRank: 2 },
    );
    expect(rt.dimensionStore.get().byId[id]!.offsetMm).toBe(800);
  });

  // ── Drive ────────────────────────────────────────────────────────────────
  it('places a DRIVING dimension as a distance constraint in that view’s store', async () => {
    const { p1, p2 } = twoPoints('plan');
    const id = await rt.commandBus.execute<unknown, DimensionId>(
      PLACE_DIMENSION_VERB, { view: 'plan', p1, p2, drive: 1500 },
    );
    const cid = rt.dimensionStore.get().byId[id]!.drivingConstraintId;
    expect(cid).not.toBeNull();
    // ONE distance constraint kind in this app, not two: it lands in the same
    // constraintStore the constraint toolbar writes to.
    const c = rt.sketchViews.constraintStoreFor('plan').get().byId[cid!]!;
    expect(c.kind).toBe('distance-pp');
    expect((c as { value: unknown }).value).toBe(1500);
  });

  // THE CONTAINMENT ASSERTION. A driving dimension on an elevation must not
  // put a constraint anywhere the PLAN's solver can see it — the ids are the
  // same in both documents, so a shared store would deform the floor plan.
  it('keeps an elevation’s driving constraint OUT of the plan’s store', async () => {
    const front = twoPoints('elevation-front', -2400);
    await rt.commandBus.execute(PLACE_DIMENSION_VERB, {
      view: 'elevation-front', ...front, drive: 2400,
    });
    expect(rt.sketchViews.constraintStoreFor('elevation-front').get().constraints)
      .toHaveLength(1);
    expect(rt.sketchViews.constraintStoreFor('plan').get().constraints).toHaveLength(0);
    // …and the runtime's own store IS the plan's, so it is untouched too.
    expect(rt.constraintStore.get().constraints).toHaveLength(0);
  });

  // A reporting dimension BECOMES a driving one the first time the author
  // types a value into it. That is the whole "drive from" gesture.
  it('turns a reporting dimension into a driving one on setValue', async () => {
    const { p1, p2 } = twoPoints('plan');
    const id = await rt.commandBus.execute<unknown, DimensionId>(
      PLACE_DIMENSION_VERB, { view: 'plan', p1, p2 },
    );
    expect(rt.dimensionStore.get().byId[id]!.drivingConstraintId).toBeNull();

    await rt.commandBus.execute(SET_DIMENSION_VALUE_VERB, { id, value: 2500 });
    const cid = rt.dimensionStore.get().byId[id]!.drivingConstraintId;
    expect(cid).not.toBeNull();
    expect(rt.sketchViews.constraintStoreFor('plan').get().byId[cid!]).toBeDefined();
  });

  // Lane CE-PARAMS-AND-PLANES binds parameters; this path must already accept
  // a parameter NAME so that lane needs no change here.
  it('accepts a parameter name as a driving value, not just a number', async () => {
    const { p1, p2 } = twoPoints('plan');
    const id = await rt.commandBus.execute<unknown, DimensionId>(
      PLACE_DIMENSION_VERB, { view: 'plan', p1, p2, drive: 'width' },
    );
    const cid = rt.dimensionStore.get().byId[id]!.drivingConstraintId!;
    expect((rt.sketchViews.constraintStoreFor('plan').get().byId[cid] as { value: unknown }).value)
      .toBe('width');
  });

  it('rejects a negative or empty driving value rather than storing nonsense', async () => {
    const { p1, p2 } = twoPoints('plan');
    await expect(
      rt.commandBus.execute(PLACE_DIMENSION_VERB, { view: 'plan', p1, p2, drive: -5 }),
    ).rejects.toThrow(/non-negative/);
    await expect(
      rt.commandBus.execute(PLACE_DIMENSION_VERB, { view: 'plan', p1, p2, drive: '' }),
    ).rejects.toThrow(/number or a non-empty parameter name/);
  });

  // ── Undo ─────────────────────────────────────────────────────────────────
  it('undoes a placement, removing the dimension AND its constraint', async () => {
    const { p1, p2 } = twoPoints('plan');
    await rt.commandBus.execute(PLACE_DIMENSION_VERB, { view: 'plan', p1, p2, drive: 1500 });
    expect(rt.dimensionStore.get().dimensions).toHaveLength(1);
    expect(rt.sketchViews.constraintStoreFor('plan').get().constraints).toHaveLength(1);

    await rt.commandBus.undo();
    // Anything less leaves an invisible distance constraint freezing the
    // sketch with nothing on screen to explain why.
    expect(rt.dimensionStore.get().dimensions).toHaveLength(0);
    expect(rt.sketchViews.constraintStoreFor('plan').get().constraints).toHaveLength(0);
  });

  it('undoes setValue back to the exact value the author saw', async () => {
    const { p1, p2 } = twoPoints('plan');
    const id = await rt.commandBus.execute<unknown, DimensionId>(
      PLACE_DIMENSION_VERB, { view: 'plan', p1, p2, drive: 1000 },
    );
    await rt.commandBus.execute(SET_DIMENSION_VALUE_VERB, { id, value: 3000 });
    const cid = rt.dimensionStore.get().byId[id]!.drivingConstraintId!;
    const store = rt.sketchViews.constraintStoreFor('plan');
    expect((store.get().byId[cid] as { value: unknown }).value).toBe(3000);

    await rt.commandBus.undo();
    const after = rt.dimensionStore.get().byId[id]!;
    const restored = store.get().byId[after.drivingConstraintId!] as { value: unknown };
    // A dimension reading one number while the solver enforces another is the
    // failure this inverse exists to prevent.
    expect(restored.value).toBe(1000);
  });

  // ⭐ The undo must write back into the DIMENSION's plane, not whichever view
  //    the author has since switched to.
  it('undoes into the dimension’s OWN work plane after a view switch', async () => {
    const front = twoPoints('elevation-front', -2400);
    await rt.commandBus.execute(PLACE_DIMENSION_VERB, {
      view: 'elevation-front', ...front, drive: 2400,
    });
    rt.sketchViewStore.setActive('plan');
    await rt.commandBus.undo();
    expect(rt.sketchViews.constraintStoreFor('elevation-front').get().constraints)
      .toHaveLength(0);
    expect(rt.sketchViews.constraintStoreFor('plan').get().constraints).toHaveLength(0);
  });

  // ── Remove ───────────────────────────────────────────────────────────────
  it('removes a dimension and the constraint it was driving, and restores both', async () => {
    const { p1, p2 } = twoPoints('plan');
    const id = await rt.commandBus.execute<unknown, DimensionId>(
      PLACE_DIMENSION_VERB, { view: 'plan', p1, p2, drive: 1200 },
    );
    await rt.commandBus.execute(REMOVE_DIMENSION_VERB, { id });
    expect(rt.dimensionStore.get().dimensions).toHaveLength(0);
    expect(rt.sketchViews.constraintStoreFor('plan').get().constraints).toHaveLength(0);

    await rt.commandBus.undo();
    expect(rt.dimensionStore.get().dimensions).toHaveLength(1);
    expect(rt.sketchViews.constraintStoreFor('plan').get().constraints).toHaveLength(1);
  });

  it('refuses to act on an unknown dimension id', async () => {
    await expect(
      rt.commandBus.execute(REMOVE_DIMENSION_VERB, { id: 'nope' }),
    ).rejects.toThrow(/unknown dimension/);
    await expect(
      rt.commandBus.execute(SET_DIMENSION_VALUE_VERB, { id: 'nope', value: 1 }),
    ).rejects.toThrow(/unknown dimension/);
  });
});
