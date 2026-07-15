// §FIX-PROJECT-SWITCH-GPU-STATE-NOT-RESET (L-316) — a project-switch is a render
// RECONSTRUCTION BOUNDARY, not just a data reset.
//
// PROD EVIDENCE (founder): opening ANOTHER project in the same session leaves the
// render "never clean" even though the DATA isolates fine
// ([ProjectIsolationAudit] ✓ project loaded clean). The render-side leftovers:
//   • "Destroyed texture [Texture "ShadowDepthTexture"] used in a submit" (WebGPU)
//     — the OUTGOING project's shadow depth texture disposed mid-submit.
//   • "Framebuffer is incomplete: Attachment has zero size" — render targets not
//     reallocated to the incoming viewport.
// onProjectSwitch reset the outline refs + retry counter but NOT the shadow pass
// or the framebuffers.
//
// FIX (reuse existing machinery): onProjectSwitch now (1) reconciles the render
// size (heals the zero-size framebuffer, same single-source sizing as L-312A) and
// (2) routes the shadow-pass reconstruction through the guarded scheduleShadowRebuild
// cycle (pauses WebGPU submits + freezes the shadow map, so the old shadow texture
// is never disposed while a submit references it).
//
// TOOTH: the OLD onProjectSwitch scheduled NO shadow rebuild and issued NO size
// reconcile; the fixed one does both — and the WebGL path still heals its
// framebuffer size without engaging the WebGPU-only shadow cycle.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RenderPipelineManager } from '../src/pipeline/RenderPipelineManager.js';

function driftedRenderer(): any {
  const setSizeCalls: Array<{ w: number; h: number }> = [];
  return {
    isWebGPURenderer: true,
    backend: { isWebGPUBackend: true },
    // renderer THINKS it is 1145×915; live canvas is 632×915 (a split pane) → drift.
    domElement: { clientWidth: 632, clientHeight: 915 },
    getSize: (t: any) => { if (t?.set) { t.set(1145, 915); return t; } return { x: 1145, y: 915 }; },
    setSize: (w: number, h: number) => { setSizeCalls.push({ w, h }); },
    __setSizeCalls: setSizeCalls,
  };
}

describe('RenderPipelineManager.onProjectSwitch — GPU-state reset (§FIX-PROJECT-SWITCH-GPU-STATE-NOT-RESET, L-316)', () => {
  beforeEach(() => { vi.useFakeTimers(); }); // hold the 100ms shadow-rebuild debounce so its async body never runs
  afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); });

  it('reconciles the render size on switch (heals the zero-size framebuffer)', () => {
    const renderer = driftedRenderer();
    const rpm = new RenderPipelineManager() as any;
    rpm._webGpuActive = true;
    rpm._renderer     = renderer;

    rpm.onProjectSwitch();

    // The render targets are reallocated to the CURRENT viewport — no zero-size / stale FBO.
    expect(renderer.__setSizeCalls).toEqual([{ w: 632, h: 915 }]);
  });

  it('schedules a GUARDED shadow-pass reconstruction on a WebGPU switch (drops stale ShadowDepthTexture safely)', () => {
    const renderer = driftedRenderer();
    const rpm = new RenderPipelineManager() as any;
    rpm._webGpuActive = true;
    rpm._renderer     = renderer;

    expect(rpm._shadowRebuildTimer).toBeNull(); // nothing scheduled before the switch

    rpm.onProjectSwitch();

    // scheduleShadowRebuild armed the guarded cycle — the pipeline will reconstruct
    // with fresh shadow handles while submits are paused (no mid-submit dispose).
    expect(rpm._shadowRebuildTimer).not.toBeNull();
  });

  it('does NOT engage the WebGPU shadow cycle on the WebGL path, but STILL heals the framebuffer size', () => {
    const renderer = driftedRenderer();
    const rpm = new RenderPipelineManager() as any;
    rpm._webGpuActive = false; // WebGL backend — TSL/shadow cycle is WebGPU-only
    rpm._renderer     = renderer;

    rpm.onProjectSwitch();

    // Size reconcile still runs (fixes the WebGL "Attachment has zero size")...
    expect(renderer.__setSizeCalls).toEqual([{ w: 632, h: 915 }]);
    // ...but scheduleShadowRebuild early-returns on !webGpuActive → no timer armed.
    expect(rpm._shadowRebuildTimer).toBeNull();
  });

  it('still resets outline refs + retry counter (existing behaviour preserved)', () => {
    const renderer = driftedRenderer();
    const rpm = new RenderPipelineManager() as any;
    rpm._webGpuActive = true;
    rpm._renderer     = renderer;
    rpm._retryCount   = 3;
    rpm._selectedObjects.push({} as any);
    rpm._hoveredObjects.push({} as any);

    rpm.onProjectSwitch();

    expect(rpm.status.retryCount).toBe(0);
    expect(rpm.selectedObjects.length).toBe(0);
    expect(rpm.hoveredObjects.length).toBe(0);
  });
});
