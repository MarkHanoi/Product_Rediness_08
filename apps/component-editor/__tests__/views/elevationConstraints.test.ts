// §CONSTRAINT-IS-VIEW-SCOPED — constraining IN A VERTICAL WORK PLANE.
//
// ═══════════════════════════════════════════════════════════════════════════
// WHAT THIS REPLACES, AND WHY THE OLD BEHAVIOUR WAS NOT A BUG
// ═══════════════════════════════════════════════════════════════════════════
// `SketchViewPanel` mounted `elevationConstraintNote()` — the literal string
// *"Constraints are plan-only for now."* — instead of the constraint toolbar on
// any vertical plane, and the reason was sound: `constraint.*` was registered
// once against ONE ambient `ConstraintStore`, and `createSketchDocStore()`
// mints entity ids from a PER-STORE counter, so every document's first point is
// `pt-0`. A `distance-pp(pt-0, pt-1)` authored on the front elevation was
// therefore fully "valid against" the plan document as well, and the plan's
// solver — sharing the store — would have enforced a storey height on the
// author's floor outline.
//
// ⭐ THE TESTS BELOW ARE WRITTEN TO FAIL IF THAT REGRESSES. Two of them assert
//    the PLAN store stays empty while an elevation constraint is authored; one
//    of them authors the constraint over ids that PROVABLY collide with the
//    plan's (asserted, not assumed), which is the precise condition the old
//    refusal existed to avoid.
//
// ⚠ WHAT THIS DOES NOT ESTABLISH — stated because a green suite is not a user
//   capability. This suite drives the REAL runtime and the REAL panel, so it
//   establishes the capability and its wiring; it does not establish that the
//   app reaches a browser. That is a BUILD fact, and it is checked elsewhere.
//
//   ⭐ CORRECTED 2026-09-06 (lane COMPONENT-EDITOR-REACHABLE). This paragraph
//   read: *"the root build emits NO bundle for it: `vite.config.ts`'s
//   `rollupOptions.input` is `{ main: 'index.html', browser: 'browser.html' }`
//   and neither resolves here, so nothing in this app reaches a browser through
//   the deployed image (ISSUE-LOG L-12976)."* That was true when written and is
//   no longer true. `vite.config.ts` now declares a THIRD input,
//   `componentEditor: 'component-editor.html'`, whose module script is
//   `/apps/component-editor/src/index.ts` — this app's own entry. The root
//   build emits `dist/component-editor.html`, `express.static(dist)`
//   (server.js:5981) serves it ahead of the SPA catch-all (server.js:5989), and
//   the page is reachable at `/component-editor.html`.
//
//   ⛔ What is STILL not established, and must not be read into the above: the
//   sketch never becomes a `FamilyDocument` (L-12976 finding (b) — nothing here
//   builds one, `publishFamily` has no caller outside its own spec, and the
//   deep link is parsed then only `console.info`'d), and the constraint solver
//   is still `MockSolver` (finding (c)). REACHABLE is not PERSISTED and it is
//   not SOLVED. Do not let a corrected build fact launder those two.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mountSketchViewPanel, type SketchViewPanelMount } from '../../src/views/SketchViewPanel.js';
import {
  createFamilyEditorRuntime,
  type FamilyEditorRuntime,
} from '../../src/app/familyEditorRuntime.js';
import {
  ADD_COINCIDENT_VERB,
  ADD_DISTANCE_VERB,
  ADD_FIXED_VERB,
} from '../../src/commands/constraint/index.js';
import type { EntityId } from '../../src/sketch/entities.js';

function panelDeps(runtime: FamilyEditorRuntime) {
  return {
    commandBus: runtime.commandBus,
    selectionStore: runtime.selectionStore,
    dimensionStore: runtime.dimensionStore,
    sketchViewStore: runtime.sketchViewStore,
    sketchViews: runtime.sketchViews,
  };
}

/** The two point ids a `addLineByCoords` call minted, in document order. */
function pointIdsOf(runtime: FamilyEditorRuntime, view: 'plan' | 'elevation-front' | 'elevation-side'): EntityId[] {
  return Object.keys(runtime.sketchViews.docFor(view).get().pointById) as EntityId[];
}

function storeIds(runtime: FamilyEditorRuntime, view: 'plan' | 'elevation-front' | 'elevation-side'): string[] {
  return Object.keys(runtime.sketchViews.constraintStoreFor(view).get().byId);
}

describe('§CONSTRAINT-IS-VIEW-SCOPED — the toolbar reaches the elevations', () => {
  let host: HTMLElement;
  let runtime: FamilyEditorRuntime;
  let panel: SketchViewPanelMount;

  beforeEach(() => {
    host = document.createElement('div');
    document.body.appendChild(host);
    runtime = createFamilyEditorRuntime({ skipSolverUpgrade: true });
    panel = mountSketchViewPanel(host, panelDeps(runtime));
  });

  afterEach(() => {
    panel.unmount();
    runtime.dispose();
    host.remove();
  });

  it('mounts the constraint toolbar on the PLAN plane (unchanged)', () => {
    expect(host.querySelector('[data-role="constraint-toolbar"]')).not.toBeNull();
  });

  it('mounts the constraint toolbar on a VERTICAL plane too, and the plan-only note is GONE', () => {
    runtime.sketchViewStore.setActive('elevation-front');
    expect(panel.activeView()).toBe('elevation-front');
    expect(host.querySelector('[data-role="constraint-toolbar"]')).not.toBeNull();
    // The stand-in this change retires. Its absence IS the deliverable.
    expect(host.querySelector('[data-role="elevation-constraint-note"]')).toBeNull();
    expect(host.textContent).not.toContain('Constraints are plan-only');
  });

  it('offers the same six buttons on an elevation as on the plan', () => {
    const labels = (): string[] => Array.from(
      host.querySelectorAll<HTMLButtonElement>('[data-role="constraint-toolbar"] button'),
    ).map((b) => b.textContent ?? '');
    const plan = labels();
    expect(plan).toEqual(['Coincident', 'Distance', 'Fixed', 'Parallel', 'Perpend.', 'Tangent']);
    runtime.sketchViewStore.setActive('elevation-side');
    expect(labels()).toEqual(plan);
  });

  it('CLICKING Coincident on an elevation writes into THAT plane\'s store, and the plan stays empty', async () => {
    runtime.sketchViewStore.setActive('elevation-front');
    const doc = runtime.sketchViews.docFor('elevation-front');
    doc.addLineByCoords(0, 0, 0, -2400);
    const pts = pointIdsOf(runtime, 'elevation-front');
    expect(pts).toHaveLength(2);
    runtime.selectionStore.set(pts);

    const btn = Array.from(
      host.querySelectorAll<HTMLButtonElement>('[data-role="constraint-toolbar"] button'),
    ).find((b) => b.textContent === 'Coincident');
    expect(btn).toBeDefined();
    btn!.click();
    // The click handler dispatches through the bus asynchronously and only
    // paints the status line once that promise settles — two microtask ticks
    // are NOT enough (measured: the store was written, the status line was
    // still ''), so this yields a macrotask.
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(storeIds(runtime, 'elevation-front')).toHaveLength(1);
    expect(storeIds(runtime, 'plan')).toEqual([]);
    expect(storeIds(runtime, 'elevation-side')).toEqual([]);
    const status = host.querySelector('[data-role="constraint-status"]');
    expect(status?.textContent).toContain('Coincident');
  });
});

describe('§CONSTRAINT-IS-VIEW-SCOPED — the command layer routes by work plane', () => {
  let runtime: FamilyEditorRuntime;

  beforeEach(() => {
    runtime = createFamilyEditorRuntime({ skipSolverUpgrade: true });
  });
  afterEach(() => runtime.dispose());

  it('PINS THE HAZARD: elevation and plan mint the SAME entity ids', () => {
    runtime.sketchViews.docFor('plan').addLineByCoords(0, 0, 4000, 0);
    runtime.sketchViews.docFor('elevation-front').addLineByCoords(0, 0, 0, -2400);
    // If this ever stops being true the isolation still holds — it is
    // STRUCTURAL, not id-based — but the test below stops exercising the
    // condition the old refusal existed for, so it is asserted here.
    expect(pointIdsOf(runtime, 'plan')).toEqual(pointIdsOf(runtime, 'elevation-front'));
  });

  it('an explicit `view` sends the constraint to that plane, over COLLIDING ids', async () => {
    runtime.sketchViews.docFor('plan').addLineByCoords(0, 0, 4000, 0);
    runtime.sketchViews.docFor('elevation-front').addLineByCoords(0, 0, 0, -2400);
    const [p1, p2] = pointIdsOf(runtime, 'elevation-front');

    await runtime.commandBus.execute(ADD_DISTANCE_VERB, {
      view: 'elevation-front', p1, p2, value: 2400,
    });

    expect(storeIds(runtime, 'elevation-front')).toHaveLength(1);
    // ⛔ THE ASSERTION THE OLD REFUSAL EXISTED TO PROTECT. Before this change
    //    the same dispatch wrote here, and the plan's solver would have pulled
    //    the author's floor outline to 2400 mm.
    expect(storeIds(runtime, 'plan')).toEqual([]);
  });

  it('an OMITTED `view` resolves through the ACTIVE plane, never a hidden \'plan\' literal', async () => {
    runtime.sketchViews.docFor('elevation-side').addLineByCoords(0, 0, 1200, 0);
    runtime.sketchViewStore.setActive('elevation-side');
    const [p1, p2] = pointIdsOf(runtime, 'elevation-side');

    await runtime.commandBus.execute(ADD_COINCIDENT_VERB, { p1, p2 });

    expect(storeIds(runtime, 'elevation-side')).toHaveLength(1);
    expect(storeIds(runtime, 'plan')).toEqual([]);
    expect(storeIds(runtime, 'elevation-front')).toEqual([]);
  });

  it('UNDO removes the constraint from the plane it was written to', async () => {
    runtime.sketchViews.docFor('elevation-front').addLineByCoords(0, 0, 0, -2400);
    const [p1] = pointIdsOf(runtime, 'elevation-front');

    await runtime.commandBus.execute(ADD_FIXED_VERB, {
      view: 'elevation-front', p: p1, x: 0, y: 0,
    });
    expect(storeIds(runtime, 'elevation-front')).toHaveLength(1);

    await runtime.commandBus.undo();
    expect(storeIds(runtime, 'elevation-front')).toEqual([]);
  });

  it('REFUSES an unknown work plane by name rather than defaulting to the plan', async () => {
    await expect(
      runtime.commandBus.execute(ADD_COINCIDENT_VERB, {
        view: 'elevation-rear', p1: 'pt-0', p2: 'pt-1',
      }),
    ).rejects.toThrow(/unknown work plane "elevation-rear"/);
    expect(storeIds(runtime, 'plan')).toEqual([]);
  });

  it('each plane\'s constraints are solved by ITS OWN runner, which already existed', () => {
    // `viewSketchSet` has minted a runner and a store per plane since the
    // shared-store bug was caught; this change only stopped the COMMANDS from
    // bypassing them. Asserted so nobody "simplifies" them back into one.
    expect(runtime.sketchViews.solverFor('elevation-front'))
      .not.toBe(runtime.sketchViews.solverFor('plan'));
    expect(runtime.sketchViews.constraintStoreFor('elevation-front'))
      .not.toBe(runtime.sketchViews.constraintStoreFor('plan'));
    expect(runtime.sketchViews.constraintStoreFor('plan')).toBe(runtime.constraintStore);
  });
});
