// §PERF-DPR-BINDS-THE-LIVE-RENDERER (L-1149) — the DPR lever must scale the renderer
// the user is actually looking at.
//
// MEASURED DEFECT. `initScene` bound this service to `postproductionRenderer.three`
// — the OBC `PostproductionRenderer`. In Phase 5 that renderer is MANUAL,
// postproduction-disabled, `shadowMap.enabled = false`, and `setObcRenderCallback` has
// ZERO callers, so it never issues a draw. Scaling ITS pixel ratio changed the
// resolution of a canvas nobody sees. The live consumer is real —
// `VisualizationEnginePanel.ts:809` → `window.setRenderQualityLevel` → `setQualityLevel`
// — so a user pressing "standard" for performance got nothing.
//
// WHY IT MATTERS MOST TO THIS LANE. Under the founder's role split WebGL2 owns the
// large-model path, and DPR is the cheapest, largest fill-rate lever available:
// 'standard' is 0.75x native DPR, i.e. ~56% of the fragment work of 'high', with no
// geometry, batching or material change required.
//
// TOOTH: these tests fail if the service is re-pointed at a renderer other than the one
// passed to bind(), if `setQualityLevel` stops writing the pixel ratio, or if `rebind`
// forgets to RE-APPLY the level in force (which would silently reset a heavy scene to
// the new adapter's construction-time DPR cap at the exact moment of a backend swap).

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RenderPerformanceService } from './RenderPerformanceService';

/** A renderer fake that records every setPixelRatio write, in order. */
function fakeRenderer(initialDpr = 1.5): any {
  let dpr = initialDpr;
  const writes: number[] = [];
  return {
    getPixelRatio: () => dpr,
    setPixelRatio: (v: number) => { dpr = v; writes.push(v); },
    info: { render: { calls: 0, triangles: 0 }, memory: { geometries: 0, textures: 0 }, programs: [] },
    __writes: writes,
  };
}

const scene = {} as any;

beforeEach(() => {
  // Pin native DPR so the arithmetic below is about the SCALE, not the test machine.
  vi.stubGlobal('window', { devicePixelRatio: 2 });
});

describe('RenderPerformanceService — §PERF-DPR-BINDS-THE-LIVE-RENDERER (L-1149)', () => {
  it('scales the renderer it was bound to — and NOTHING else', () => {
    const live = fakeRenderer();
    const obc  = fakeRenderer(); // the silenced Phase-5 renderer the lever used to hit
    const svc  = new RenderPerformanceService();

    svc.bind(live as any, scene);
    svc.setQualityLevel('standard');

    expect(live.__writes.length).toBe(1);
    expect(obc.__writes.length).toBe(0); // the defect was: this was the one that moved
  });

  it('"standard" is 0.75x native DPR — the ~44% fragment-work saving, actually applied', () => {
    const live = fakeRenderer();
    const svc = new RenderPerformanceService();
    svc.bind(live as any, scene);

    svc.setQualityLevel('standard');

    expect(live.getPixelRatio()).toBeCloseTo(2 * 0.75, 5); // 1.5
  });

  it('the three levels are distinct and clamped at DPR_MAX = 2.5', () => {
    const live = fakeRenderer();
    const svc = new RenderPerformanceService();
    svc.bind(live as any, scene);

    svc.setQualityLevel('standard'); const std = live.getPixelRatio();
    svc.setQualityLevel('high');     const high = live.getPixelRatio();
    svc.setQualityLevel('ultra');    const ultra = live.getPixelRatio();

    expect(std).toBeLessThan(high);
    expect(high).toBeLessThan(ultra);
    expect(ultra).toBeLessThanOrEqual(2.5); // 2 * 1.25 = 2.5, exactly at the cap
  });

  it('rebind() carries the level in force onto a freshly-swapped renderer', () => {
    const before = fakeRenderer();
    const after  = fakeRenderer(1.5); // a new adapter, constructed at its own DPR cap
    const svc = new RenderPerformanceService();

    svc.bind(before as any, scene);
    svc.setQualityLevel('standard');
    expect(svc.currentLevel).toBe('standard');

    svc.rebind(after as any, scene);

    // THE TOOTH: a plain bind() would leave `after` at 1.5 (its construction cap) and
    // the user's performance choice would evaporate on exactly the swap a heavy scene
    // triggers. It must be re-applied.
    expect(after.__writes.length).toBe(1);
    expect(after.getPixelRatio()).toBeCloseTo(2 * 0.75, 5);
    expect(svc.currentLevel).toBe('standard');
  });

  it('rebind() before any level was chosen writes nothing — it must not invent a choice', () => {
    const after = fakeRenderer(1.5);
    const svc = new RenderPerformanceService();

    svc.rebind(after as any, scene);

    expect(svc.currentLevel).toBeNull();
    expect(after.__writes.length).toBe(0);
    expect(after.getPixelRatio()).toBe(1.5); // untouched
  });

  it('setQualityLevel before bind() is a no-op, not a throw (a quality lever must never break boot)', () => {
    const svc = new RenderPerformanceService();
    expect(() => svc.setQualityLevel('standard')).not.toThrow();
    expect(svc.currentLevel).toBeNull();
  });
});
