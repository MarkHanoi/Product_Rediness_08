// viewSketchSet — ONE SKETCH DOCUMENT PER WORK PLANE.
//
// The design decision this file guards is that a view switch changes WHICH
// document is on screen, and never reinterprets ONE document through a
// different basis. Reinterpretation is the cheap implementation and it is a
// lie: it would take the floor outline an author drew in plan and stand it up
// as a facade. These tests assert the documents are genuinely independent.
//
// @vitest-environment node

import { describe, expect, it } from 'vitest';
import { MockSolver } from '@pryzm/constraint-solver';
import { createViewSketchSet } from '../../src/views/viewSketchSet.js';
import { createConstraintStore } from '../../src/stores/constraintStore.js';
import { createSketchDocStore } from '../../src/stores/sketchDocStore.js';
import { createSolverRunner } from '../../src/sketch/solverRunner.js';
import type { SketchViewKind } from '../../src/views/viewProjection.js';

function makeSet() {
  const planDoc = createSketchDocStore();
  const constraintStore = createConstraintStore();
  const solver = new MockSolver();
  const planSolver = createSolverRunner({
    docStore: planDoc,
    constraintStore,
    solver,
    applyValues: (u) => planDoc.movePoints(u),
  });
  const set = createViewSketchSet({ planDoc, planSolver, constraintStore, solver });
  return { set, planDoc, planSolver, constraintStore };
}

describe('viewSketchSet — a document per work plane', () => {
  // The runtime already owns a `sketchDocStore` bound to the constraint
  // toolbar, status bar and solver runner. Minting a fourth store and calling
  // one of them "plan" would be exactly the rival subsystem the fleet rules
  // forbid, so the set ADOPTS the runtime's store instead.
  it('ADOPTS the runtime plan document rather than minting a rival', () => {
    const { set, planDoc, planSolver } = makeSet();
    expect(set.docFor('plan')).toBe(planDoc);
    expect(set.solverFor('plan')).toBe(planSolver);
    set.dispose();
    planSolver.dispose();
  });

  it('gives each elevation its OWN document and its OWN solver runner', () => {
    const { set, planDoc, planSolver } = makeSet();
    const front = set.docFor('elevation-front');
    const side = set.docFor('elevation-side');
    expect(front).not.toBe(planDoc);
    expect(side).not.toBe(planDoc);
    expect(front).not.toBe(side);
    expect(set.solverFor('elevation-front')).not.toBe(planSolver);
    expect(set.solverFor('elevation-front')).not.toBe(set.solverFor('elevation-side'));
    set.dispose();
    planSolver.dispose();
  });

  it('keeps what is drawn in one view OUT of the others', () => {
    const { set, planSolver } = makeSet();
    set.docFor('plan').addLineByCoords(0, 0, 4000, 0);
    set.docFor('elevation-front').addLineByCoords(0, 0, 0, -2400);

    expect(set.entityCounts().plan).toBeGreaterThan(0);
    expect(set.entityCounts()['elevation-front']).toBeGreaterThan(0);
    expect(set.entityCounts()['elevation-side']).toBe(0);

    set.dispose();
    planSolver.dispose();
  });

  // ⛔ PINS A REAL HAZARD. Entity ids are minted from a PER-STORE counter, so
  //    every document's first point is `pt-0` — ids are NOT unique across the
  //    three work planes. This test exists so nobody "simplifies" the per-view
  //    constraint stores below back into one shared store on the assumption
  //    that `constraintIsValidAgainst()` will keep the views apart. It will
  //    not: it keys purely on id presence, so a front-elevation
  //    `distance-pp(pt-0, pt-1)` is fully valid against the PLAN document too.
  //
  //    If this test ever fails because ids became globally unique, that is
  //    good news — delete it and say so. Do not delete it to make the shared
  //    store look safe.
  it('mints COLLIDING entity ids across documents — the reason stores are per-view', () => {
    const { set, planSolver } = makeSet();
    const planPoint = set.docFor('plan').addPoint(0, 0);
    const frontPoint = set.docFor('elevation-front').addPoint(9999, 9999);
    expect(planPoint).toBe(frontPoint);
    // Same id, genuinely different points — which is why an id alone can never
    // decide which document a constraint belongs to.
    expect(set.docFor('plan').get().pointById[planPoint]!.x).toBe(0);
    expect(set.docFor('elevation-front').get().pointById[frontPoint]!.x).toBe(9999);
    set.dispose();
    planSolver.dispose();
  });

  // THE ISOLATION ASSERTION. Structural, not argued: a constraint authored on
  // one work plane lives in that plane's own store and is invisible to the
  // others, so no solver can ever apply it to a foreign document.
  it('scopes constraints per work plane, so an elevation cannot deform the plan', () => {
    const { set, planSolver, constraintStore } = makeSet();

    // The plan ADOPTS the runtime's store — the toolbar and status bar are
    // already bound to it, and minting a rival would be the forbidden pattern.
    expect(set.constraintStoreFor('plan')).toBe(constraintStore);
    // The elevations do not share it, and do not share it with each other.
    expect(set.constraintStoreFor('elevation-front')).not.toBe(constraintStore);
    expect(set.constraintStoreFor('elevation-side')).not.toBe(constraintStore);
    expect(set.constraintStoreFor('elevation-front'))
      .not.toBe(set.constraintStoreFor('elevation-side'));

    // Author a 2400 mm storey height on the front elevation.
    const front = set.constraintStoreFor('elevation-front');
    const p1 = set.docFor('elevation-front').addPoint(0, 0);
    const p2 = set.docFor('elevation-front').addPoint(0, -2400);
    front.add({ id: front.newId('distance-pp'), kind: 'distance-pp', p1, p2, value: 2400 });

    // It is in the elevation's store, and NOWHERE ELSE — even though the plan
    // document contains points with the very same ids.
    expect(front.get().constraints).toHaveLength(1);
    expect(constraintStore.get().constraints).toHaveLength(0);
    expect(set.constraintStoreFor('elevation-side').get().constraints).toHaveLength(0);

    set.dispose();
    planSolver.dispose();
  });

  // THE SEAM THE 3D VIEW CONSUMES. This is the only place that knows a
  // front-elevation point at plane z = -2400 is 2400 mm ABOVE the origin in
  // world Y — the step that makes a family 3D rather than an extruded plan.
  it('lifts each view’s points into WORLD millimetres', () => {
    const { set, planSolver } = makeSet();

    set.docFor('plan').addPoint(1000, 2000);
    const planWorld = set.worldPointsOf('plan');
    expect(planWorld).toHaveLength(1);
    expect(planWorld[0]!.world).toEqual({ x: 1000, y: 0, z: 2000 });

    set.docFor('elevation-front').addPoint(0, -2400);
    const frontWorld = set.worldPointsOf('elevation-front');
    expect(frontWorld).toHaveLength(1);
    expect(frontWorld[0]!.world).toEqual({ x: 0, y: 2400, z: 0 });

    // The side elevation's screen-right is world -Z, so +1000 on screen is
    // -1000 in world Z. Getting this backwards mirrors the model.
    set.docFor('elevation-side').addPoint(1000, -1800);
    const sideWorld = set.worldPointsOf('elevation-side');
    expect(sideWorld[0]!.world).toEqual({ x: 0, y: 1800, z: -1000 });

    set.dispose();
    planSolver.dispose();
  });

  it('reports WHICH view changed when any document mutates', () => {
    const { set, planSolver } = makeSet();
    const seen: SketchViewKind[] = [];
    const off = set.subscribeAny((kind) => seen.push(kind));

    set.docFor('elevation-side').addPoint(0, 0);
    set.docFor('plan').addPoint(0, 0);
    expect(seen).toEqual(['elevation-side', 'plan']);

    off();
    set.docFor('plan').addPoint(1, 1);
    expect(seen).toHaveLength(2);
    set.dispose();
    planSolver.dispose();
  });

  it('refuses an unknown view kind rather than silently serving the plan', () => {
    const { set, planSolver } = makeSet();
    expect(() => set.docFor('elevation-back' as SketchViewKind)).toThrow(/invalid view/i);
    expect(() => set.worldPointsOf('' as SketchViewKind)).toThrow(/invalid view/i);
    set.dispose();
    planSolver.dispose();
  });

  // dispose() must drop what the set OWNS and leave the adopted plan runner
  // to its owner. Disposing a runner the runtime still holds would break the
  // status bar; leaking the elevation runners is the mirror-image bug.
  it('disposes only what it owns, leaving the adopted plan document alive', () => {
    const { set, planDoc, planSolver } = makeSet();
    const seen: SketchViewKind[] = [];
    set.subscribeAny((k) => seen.push(k));
    set.dispose();

    // Subscriptions are dropped…
    planDoc.addPoint(0, 0);
    expect(seen).toEqual([]);
    // …but the adopted plan document still works for its real owner.
    expect(planDoc.get().entities.length).toBe(1);
    expect(() => planSolver.stats()).not.toThrow();
    planSolver.dispose();
  });
});
