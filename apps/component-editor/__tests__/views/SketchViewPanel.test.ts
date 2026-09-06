// SketchViewPanel — PLAN / FRONT / SIDE as a working surface, and the
// property the whole lane exists to deliver: SWITCHING PRESERVES THE SKETCH.
//
// This spec drives the REAL runtime (`createFamilyEditorRuntime`) rather than a
// hand-built fixture, deliberately. The defect this app has actually shipped
// before is authored-but-unwired — a module that works perfectly in isolation
// and that no user can reach. Mounting the production panel against the
// production runtime is what makes this a reachability test and not a unit
// test of a thing nobody calls.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mountSketchViewPanel, type SketchViewPanelMount } from '../../src/views/SketchViewPanel.js';
import {
  createFamilyEditorRuntime,
  type FamilyEditorRuntime,
} from '../../src/app/familyEditorRuntime.js';

function panelDeps(runtime: FamilyEditorRuntime) {
  return {
    commandBus: runtime.commandBus,
    selectionStore: runtime.selectionStore,
    dimensionStore: runtime.dimensionStore,
    sketchViewStore: runtime.sketchViewStore,
    sketchViews: runtime.sketchViews,
  };
}

describe('SketchViewPanel — the three work planes an author draws in', () => {
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

  // ── What is DRAWN ────────────────────────────────────────────────────────

  it('draws a work-plane bar offering exactly Plan / Front / Side', () => {
    const buttons = Array.from(
      host.querySelectorAll<HTMLButtonElement>('nav[data-role="sketch-view-bar"] button[data-view]'),
    );
    expect(buttons.map((b) => b.dataset.view)).toEqual([
      'plan',
      'elevation-front',
      'elevation-side',
    ]);
    expect(buttons.map((b) => b.textContent?.replace(/\d+$/, ''))).toEqual([
      'Plan',
      'Front',
      'Side',
    ]);
  });

  it('opens on the PLAN work plane with plan selected', () => {
    expect(panel.activeView()).toBe('plan');
    const plan = host.querySelector<HTMLButtonElement>('button[data-view="plan"]');
    expect(plan?.getAttribute('aria-selected')).toBe('true');
    const front = host.querySelector<HTMLButtonElement>('button[data-view="elevation-front"]');
    expect(front?.getAttribute('aria-selected')).toBe('false');
  });

  it('draws the sketch canvas, its toolbar and its HUD inside the panel', () => {
    expect(host.querySelector('canvas[data-role="sketch-canvas"]')).not.toBeNull();
    expect(host.querySelector('[data-role="sketch-toolbar"]')).not.toBeNull();
    expect(host.querySelector('[data-role="sketch-hud"]')).not.toBeNull();
  });

  it('stacks the dimension annotation layer over the sketch canvas, not beside it', () => {
    const canvas = host.querySelector<HTMLCanvasElement>('canvas[data-role="sketch-canvas"]');
    const overlay = host.querySelector<HTMLCanvasElement>('canvas[data-role="dimension-overlay"]');
    expect(overlay).not.toBeNull();
    // SPEC-AUTODIMENSION §12.1/§12.9: annotation is a SEPARATE rank that must
    // not interfere with geometry. Sharing the canvas wrapper is the
    // structural form of that: same box, different layer.
    expect(overlay!.parentElement).toBe(canvas!.parentElement);
    expect(overlay!.style.position).toBe('absolute');
  });

  // The axis note is how an author who has never used the editor learns that
  // the elevation is where heights live.
  it('names the active work plane and its screen axes', () => {
    const note = host.querySelector<HTMLElement>('[data-role="work-plane-note"]');
    expect(note?.textContent).toContain('Plan');
    expect(note?.textContent).toContain('X');
    expect(note?.textContent).toContain('Z');
    expect(note?.textContent).toContain('horizontal plane');
  });

  it('re-letters the axis note as a VERTICAL plane on an elevation', () => {
    runtime.sketchViewStore.setActive('elevation-front');
    const note = host.querySelector<HTMLElement>('[data-role="work-plane-note"]');
    expect(note?.textContent).toContain('Front');
    expect(note?.textContent).toContain('Y');
    expect(note?.textContent).toContain('vertical plane');
  });

  // ── SWITCHING ────────────────────────────────────────────────────────────

  it('switches the canvas onto a DIFFERENT document per work plane', () => {
    const planDoc = panel.activeDoc();
    runtime.sketchViewStore.setActive('elevation-front');
    expect(panel.activeView()).toBe('elevation-front');
    expect(panel.activeDoc()).not.toBe(planDoc);
    runtime.sketchViewStore.setActive('elevation-side');
    expect(panel.activeDoc()).not.toBe(planDoc);
    // …and returning lands back on the ORIGINAL store instance, not a clone.
    runtime.sketchViewStore.setActive('plan');
    expect(panel.activeDoc()).toBe(planDoc);
  });

  // THE ASSERTION THIS LANE EXISTS FOR.
  //
  // An author draws a floor outline in plan, stands up on the front elevation
  // to draw a height, and comes back. Both drawings must still be there, and
  // neither may have leaked into the other's view.
  it('PRESERVES what was drawn in every view across switches', () => {
    // Draw a 4000 x 3000 floor outline on the PLAN.
    const plan = runtime.sketchViews.docFor('plan');
    plan.addLineByCoords(0, 0, 4000, 0);
    plan.addLineByCoords(4000, 0, 4000, 3000);
    const planEntities = plan.get().entities.length;
    expect(planEntities).toBeGreaterThan(0);

    // Stand up on the FRONT elevation and draw a 2400 mm storey height.
    runtime.sketchViewStore.setActive('elevation-front');
    const front = panel.activeDoc();
    front.addLineByCoords(0, 0, 0, -2400);
    const frontEntities = front.get().entities.length;

    // The elevation did NOT inherit the plan's outline…
    expect(frontEntities).toBeLessThan(planEntities);
    // …and the plan's outline is untouched by drawing on the elevation.
    expect(plan.get().entities.length).toBe(planEntities);

    // Go to the SIDE elevation, then back to plan, then back to front.
    runtime.sketchViewStore.setActive('elevation-side');
    expect(panel.activeDoc().get().entities.length).toBe(0);

    runtime.sketchViewStore.setActive('plan');
    expect(panel.activeDoc().get().entities.length).toBe(planEntities);

    runtime.sketchViewStore.setActive('elevation-front');
    expect(panel.activeDoc().get().entities.length).toBe(frontEntities);
  });

  // A view switch tears down and rebuilds the canvas. If the teardown leaked,
  // the panel would accumulate a canvas per switch — the classic remount bug.
  it('leaves exactly one sketch canvas mounted after repeated switching', () => {
    for (const v of ['elevation-front', 'elevation-side', 'plan', 'elevation-front'] as const) {
      runtime.sketchViewStore.setActive(v);
    }
    expect(host.querySelectorAll('canvas[data-role="sketch-canvas"]')).toHaveLength(1);
    expect(host.querySelectorAll('canvas[data-role="dimension-overlay"]')).toHaveLength(1);
    expect(host.querySelectorAll('[data-role="sketch-toolbar"]')).toHaveLength(1);
  });

  it('repaints the work-plane bar selection when the store changes', () => {
    runtime.sketchViewStore.setActive('elevation-side');
    const side = host.querySelector<HTMLButtonElement>('button[data-view="elevation-side"]');
    const plan = host.querySelector<HTMLButtonElement>('button[data-view="plan"]');
    expect(side?.getAttribute('aria-selected')).toBe('true');
    expect(plan?.getAttribute('aria-selected')).toBe('false');
  });

  it('switches the work plane when the author CLICKS the bar (not just via the store)', () => {
    const front = host.querySelector<HTMLButtonElement>('button[data-view="elevation-front"]');
    front!.click();
    expect(runtime.sketchViewStore.get().active).toBe('elevation-front');
    expect(panel.activeView()).toBe('elevation-front');
  });

  // ── The measure surface ──────────────────────────────────────────────────

  it('offers a dimension tool that starts disarmed and lets clicks fall through', () => {
    const btn = host.querySelector<HTMLButtonElement>('[data-role="dimension-toggle"]');
    expect(btn).not.toBeNull();
    expect(btn!.getAttribute('aria-pressed')).toBe('false');
    const overlay = host.querySelector<HTMLCanvasElement>('canvas[data-role="dimension-overlay"]');
    // Disarmed, the annotation layer must not swallow sketch clicks.
    expect(overlay!.style.pointerEvents).toBe('none');
  });

  it('arms the dimension tool on click and captures pointer events while armed', () => {
    const btn = host.querySelector<HTMLButtonElement>('[data-role="dimension-toggle"]');
    btn!.click();
    expect(btn!.getAttribute('aria-pressed')).toBe('true');
    expect(panel.overlay().isArmed()).toBe(true);
    const overlay = host.querySelector<HTMLCanvasElement>('canvas[data-role="dimension-overlay"]');
    expect(overlay!.style.pointerEvents).toBe('auto');
    // …and disarms again, restoring click-through.
    btn!.click();
    expect(btn!.getAttribute('aria-pressed')).toBe('false');
    expect(panel.overlay().isArmed()).toBe(false);
  });

  // Arming is a PANEL-level intent, not a per-canvas one: switching work plane
  // while the dimension tool is up must keep it up, or the author loses the
  // tool every time they change view.
  it('keeps the dimension tool armed across a work-plane switch', () => {
    host.querySelector<HTMLButtonElement>('[data-role="dimension-toggle"]')!.click();
    runtime.sketchViewStore.setActive('elevation-front');
    expect(panel.overlay().isArmed()).toBe(true);
  });

  it('badges each work plane with its live entity count, and the badge MOVES', () => {
    // C102 §2 V-ST-3 — a counter must be proven by MOTION, not by showing a
    // number. This badge is what tells an author their elevation sketch still
    // exists while they are standing on the plan.
    const badgeOf = (v: string) =>
      host.querySelector<HTMLElement>(`[data-view-count="${v}"]`)?.textContent;
    expect(badgeOf('plan')).toBe('0');
    expect(badgeOf('elevation-front')).toBe('0');

    runtime.sketchViews.docFor('plan').addLineByCoords(0, 0, 1000, 0);
    expect(badgeOf('plan')).not.toBe('0');
    expect(badgeOf('elevation-front')).toBe('0');

    runtime.sketchViews.docFor('elevation-front').addLineByCoords(0, 0, 0, -2400);
    expect(badgeOf('elevation-front')).not.toBe('0');
  });

  it('unmount() removes the whole panel from the host', () => {
    expect(host.children.length).toBeGreaterThan(0);
    panel.unmount();
    expect(host.querySelector('[data-role="sketch-view-panel"]')).toBeNull();
    // Re-mount so afterEach's unmount() stays a no-op rather than a throw.
    panel = mountSketchViewPanel(host, panelDeps(runtime));
  });
});
