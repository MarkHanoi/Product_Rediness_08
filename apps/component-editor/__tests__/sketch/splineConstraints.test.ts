// §CURVE-TANGENT-LEG — a spline the constraint system can actually TOUCH.
//
// ═══════════════════════════════════════════════════════════════════════════
// THE DEFECT THIS FILE EXISTS TO KEEP CLOSED
// ═══════════════════════════════════════════════════════════════════════════
// `buildConstraintSet` registered two tangent LEGS per spline and the solver
// executed them correctly — but `splineTangentLegId` had **zero callers outside
// its own module**, and `ConstraintToolbar.pickLines` filters the selection
// through `doc.lineById`, which a synthetic leg id is deliberately not in. The
// leg was reachable by the solver and by NOTHING ELSE: a spline no constraint
// could touch. `[[authored-but-unwired-is-the-bottleneck]]`, exactly.
//
// ⭐ So these tests assert REACHABILITY, not existence. The tangency tests
//    drive the real `ConstraintToolbar` button through the real `CommandBus`
//    into the real `MockSolver` and read the moved COORDINATES back. A test
//    that called `splineTangentLegId` directly would have passed on the broken
//    HEAD, which is the whole point.
//
// ⛔ HONEST SCOPE (C57 §1.9): `MockSolver` is a projection solver, not PlaneGCS.
//    These prove the leg is WIRED and that the existing `parallel` executor
//    moves the right handle. They do not prove convergence of a coupled system,
//    and no claim of that kind is made here — C74 §4.2 (c) is unanswered and
//    §4.1's MUST NOT is unlifted.

import { describe, expect, it } from 'vitest';
import { MockSolver } from '@pryzm/constraint-solver';
import { createSketchDocStore } from '../../src/stores/sketchDocStore.js';
import { createSelectionStore } from '../../src/stores/selectionStore.js';
import { createConstraintStore } from '../../src/stores/constraintStore.js';
import { createCommandBus } from '../../src/app/commandBus.js';
import { registerConstraintCommands } from '../../src/commands/constraint/index.js';
import { mountConstraintToolbar } from '../../src/sketch/ConstraintToolbar.js';
import {
  buildConstraintSet,
  splineTangentLegId,
  parseSplineTangentLegId,
} from '../../src/sketch/buildConstraintSet.js';
import type { EntityId } from '../../src/sketch/entities.js';

/** A doc with one 2-span spline (7 controls) and one separate line. */
function scene() {
  const doc = createSketchDocStore();
  const spline = doc.addSplineThroughPoints([
    { x: 0, z: 0 },
    { x: 100, z: 80 },
    { x: 200, z: 0 },
  ]);
  // A separate, horizontal reference line well away from the curve.
  const a = doc.addPoint(0, -500);
  const b = doc.addPoint(100, -500);
  const line = doc.addLineByPoints(a, b);
  return { doc, spline, line, a, b };
}

function harness() {
  const s = scene();
  const selectionStore = createSelectionStore();
  const constraintStore = createConstraintStore();
  const commandBus = createCommandBus();
  registerConstraintCommands(commandBus, {
    constraintStoreFor: () => constraintStore,
    activeView: () => 'plan',
  });
  const host = document.createElement('div');
  document.body.append(host);
  const bar = mountConstraintToolbar({
    commandBus,
    selectionStore,
    docStore: s.doc,
    view: 'plan',
    promptValueMm: () => 100,
  });
  host.append(bar.element);
  const button = (label: string): HTMLButtonElement => {
    const btns = Array.from(bar.element.querySelectorAll('button'));
    const found = btns.find((b) => b.textContent === label);
    if (!found) throw new Error(`no "${label}" button; have: ${btns.map((b) => b.textContent).join()}`);
    return found;
  };
  const status = (): string =>
    bar.element.querySelector('[data-role="constraint-status"]')!.textContent ?? '';
  return { ...s, selectionStore, constraintStore, commandBus, bar, button, status, host };
}

/** Buttons dispatch async; the click handler swallows into the status line. */
const settle = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

describe('§CURVE-TANGENT-LEG — the leg is registered for the solver', () => {
  it('registers a start AND an end leg for every spline, oriented on-curve-point FIRST', () => {
    const { doc, spline } = scene();
    const set = buildConstraintSet(doc.get(), { byId: {}, ids: [] } as never);
    const cps = doc.get().splineById[spline]!.controlPoints;

    const start = set.lineEndpoints![splineTangentLegId(spline, 'start')];
    const end = set.lineEndpoints![splineTangentLegId(spline, 'end')];
    expect(start).toBeDefined();
    expect(end).toBeDefined();
    // ⭐ Orientation is load-bearing: `engine.ts` rotates `l2` about its START
    //    point. On-curve endpoint first ⇒ the free handle swings, the point the
    //    curve passes through holds still.
    expect(start).toEqual([cps[0], cps[1]]);
    expect(end).toEqual([cps[cps.length - 1], cps[cps.length - 2]]);
  });

  it('every control point is already a solver VARIABLE — a Fixed pin is real, not a decoy', () => {
    const { doc, spline } = scene();
    const set = buildConstraintSet(doc.get(), { byId: {}, ids: [] } as never);
    for (const cp of doc.get().splineById[spline]!.controlPoints) {
      expect(set.variables).toHaveProperty(`${cp}-x`);
      expect(set.variables).toHaveProperty(`${cp}-y`);
    }
  });

  it('leg ids round-trip and cannot collide with a real entity id', () => {
    const { spline } = scene();
    const id = splineTangentLegId(spline, 'end');
    expect(parseSplineTangentLegId(id)).toEqual({ splineId: spline, which: 'end' });
    // `~` never appears in a makeEntityId output, so a real id parses to null.
    expect(parseSplineTangentLegId(spline)).toBeNull();
  });
});

describe('§CURVE-TANGENT-LEG — the leg is REACHABLE from the UI (the decoy test)', () => {
  it('the Tangent button exists on the real toolbar', () => {
    const h = harness();
    expect(() => h.button('Tangent')).not.toThrow();
    h.bar.destroy();
  });

  it('selecting a spline + a line dispatches a REAL parallel constraint naming the LEG', async () => {
    const h = harness();
    h.selectionStore.set([h.spline, h.line]);
    h.button('Tangent').click();
    await settle();

    const all = Object.values(h.constraintStore.get().byId);
    expect(all).toHaveLength(1);
    const c = all[0]! as { kind: string; l1: string; l2: string };
    expect(c.kind).toBe('parallel');
    // ⛔ The LEG must be `l2` — the solver rotates `l2`. If these are swapped
    //    the user's reference LINE silently moves instead of the curve.
    expect(c.l1).toBe(h.line);
    expect(parseSplineTangentLegId(c.l2)).toEqual({
      splineId: h.spline,
      which: expect.any(String) as unknown as 'start' | 'end',
    });
    h.bar.destroy();
  });

  it('the dispatched constraint VALIDATES against the doc — it is not skipped as dangling', async () => {
    const h = harness();
    h.selectionStore.set([h.spline, h.line]);
    h.button('Tangent').click();
    await settle();

    const set = buildConstraintSet(h.doc.get(), h.constraintStore.get());
    // `buildConstraintSet` only emits constraints whose entities resolve; a leg
    // that failed `isLineLike` would be silently dropped here — which is how
    // this would regress to a decoy without any error.
    expect(set.constraints).toHaveLength(1);
    expect(set.lineEndpoints![set.constraints[0]!.l2 as string]).toBeDefined();
    h.bar.destroy();
  });

  it('END TO END: the solver actually ROTATES the handle and holds the on-curve point', async () => {
    const h = harness();
    h.selectionStore.set([h.spline, h.line]);
    h.button('Tangent').click();
    await settle();

    const before = h.doc.get();
    const set = buildConstraintSet(before, h.constraintStore.get());
    const leg = parseSplineTangentLegId(set.constraints[0]!.l2 as string)!;
    const cps = before.splineById[h.spline]!.controlPoints;
    const onCurve = leg.which === 'start' ? cps[0]! : cps[cps.length - 1]!;
    const handle = leg.which === 'start' ? cps[1]! : cps[cps.length - 2]!;

    const result = await new MockSolver().solve(set);
    expect(result.status).not.toBe('failed');

    const px = (id: EntityId, ax: 'x' | 'y'): number => result.values[`${id}-${ax}`]!;
    // The on-curve endpoint is the rotation pivot and must NOT move.
    expect(px(onCurve, 'x')).toBeCloseTo(before.pointById[onCurve]!.x, 6);
    expect(px(onCurve, 'y')).toBeCloseTo(before.pointById[onCurve]!.z, 6);
    // The leg is now parallel to the horizontal reference line: its z-extent
    // collapses. Before the solve the handle was demonstrably NOT level with
    // its on-curve point, so this is a real change, not a no-op.
    expect(before.pointById[handle]!.z).not.toBeCloseTo(before.pointById[onCurve]!.z, 3);
    expect(px(handle, 'y')).toBeCloseTo(px(onCurve, 'y'), 6);
    h.bar.destroy();
  });
});

describe('§CURVE-NO-POINT-ON-CURVE — the refusal C111 §9.3-a requires', () => {
  it('REFUSES point-on-curve BY NAME, naming both the kind and what it lacks', async () => {
    const h = harness();
    // The gesture that asks for point-on-curve: a point + a spline, Coincident.
    const anyPoint = h.doc.get().splineById[h.spline]!.controlPoints[0]!;
    h.selectionStore.set([anyPoint, h.spline]);
    h.button('Coincident').click();
    await settle();

    const msg = h.status();
    // §9.3-b: the refusal names the kind requested…
    expect(msg).toMatch(/point-on-curve/);
    // …and the classification it lacks, on BOTH sides of the vocabulary gap.
    expect(msg).toMatch(/ConstraintKind/);
    expect(msg).toMatch(/ProfileConstraintSchema/);
    expect(msg).toMatch(/SOLVING/);
    // …and it names the live alternative rather than dead-ending the user.
    expect(msg).toMatch(/Fixed/);
    expect(msg).toMatch(/Tangent/);
    // ⛔ And it PERSISTS NOTHING (C111 §9.3-a).
    expect(Object.values(h.constraintStore.get().byId)).toHaveLength(0);
    h.bar.destroy();
  });

  it('does NOT hijack an ordinary two-point Coincident', async () => {
    const h = harness();
    h.selectionStore.set([h.a, h.b]);
    h.button('Coincident').click();
    await settle();
    expect(h.status()).not.toMatch(/point-on-curve/);
    expect(Object.values(h.constraintStore.get().byId)).toHaveLength(1);
    h.bar.destroy();
  });

  it('Tangent refuses a selection that is not exactly one spline + one line', async () => {
    const h = harness();
    h.selectionStore.set([h.spline]); // no line
    h.button('Tangent').click();
    await settle();
    expect(h.status()).toMatch(/Select 1 spline and 1 line/);
    expect(Object.values(h.constraintStore.get().byId)).toHaveLength(0);
    h.bar.destroy();
  });
});
