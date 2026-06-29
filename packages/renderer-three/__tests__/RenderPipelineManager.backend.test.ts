// §PERF-WEBGL2-NO-TSL — backend-detection regression tests for RenderPipelineManager.
//
// Regression context (prod, 2026-06-26):
//   When the user forces the "WebGL" backend, the renderer is a THREE.WebGPURenderer
//   created with `forceWebGL: true`. That instance has `isWebGPURenderer === true`
//   BUT a WebGL2 backend (`renderer.backend.isWebGPUBackend === false`).
//   The old `bind()` keyed off the renderer CLASS (`isWebGPURenderer`), so it WRONGLY
//   activated the full TSL pipeline (SSGI / outlines / multi-phase post-FX) on the
//   forced-WebGL path → multi-minute load + permanently frozen viewport on heavy scenes.
//
// These tests pin the corrected detection: the TSL pipeline activates ONLY for a real
// WebGPU backend (`backend.isWebGPUBackend === true`) or an authoritative override.

import { describe, expect, it } from 'vitest';
import { RenderPipelineManager } from '../src/pipeline/RenderPipelineManager.js';

// ── Fake renderers (no live GPU; only the fields detection reads) ────────────

/** A real WebGPU renderer: class flag true AND backend.isWebGPUBackend true. */
function fakeWebGPURenderer(): any {
  return { isWebGPURenderer: true, backend: { isWebGPUBackend: true } };
}

/**
 * A forced-WebGL renderer: WebGPURenderer with forceWebGL:true.
 * Class flag is STILL true (this is the regression trap) but the backend is WebGL2.
 */
function fakeForcedWebGLRenderer(): any {
  return { isWebGPURenderer: true, backend: { isWebGPUBackend: false } };
}

/** A plain THREE.WebGLRenderer: no isWebGPURenderer, no backend. */
function fakePlainWebGLRenderer(): any {
  return { isWebGPURenderer: undefined };
}

// ── isRealWebGPUBackend ──────────────────────────────────────────────────────

describe('RenderPipelineManager.isRealWebGPUBackend', () => {
  it('is TRUE for a real WebGPU backend (backend.isWebGPUBackend === true)', () => {
    expect(RenderPipelineManager.isRealWebGPUBackend(fakeWebGPURenderer())).toBe(true);
  });

  it('is FALSE for a forced-WebGL WebGPURenderer (isWebGPURenderer true but WebGL2 backend)', () => {
    // This is the exact regression case — class flag true, backend NOT WebGPU.
    expect(RenderPipelineManager.isRealWebGPUBackend(fakeForcedWebGLRenderer())).toBe(false);
  });

  it('is FALSE for a plain WebGLRenderer (no backend field)', () => {
    expect(RenderPipelineManager.isRealWebGPUBackend(fakePlainWebGLRenderer())).toBe(false);
  });

  it('is FALSE for null / undefined renderer', () => {
    expect(RenderPipelineManager.isRealWebGPUBackend(null)).toBe(false);
    expect(RenderPipelineManager.isRealWebGPUBackend(undefined)).toBe(false);
  });

  it('honours an authoritative override=true even with a WebGL2 backend renderer', () => {
    // Override is the factory's resolved-backend truth; it wins over probing.
    expect(RenderPipelineManager.isRealWebGPUBackend(fakeForcedWebGLRenderer(), true)).toBe(true);
  });

  it('honours an authoritative override=false even when the renderer LOOKS like WebGPU', () => {
    // Defends against a future class-flag-only renderer being mis-bound.
    expect(RenderPipelineManager.isRealWebGPUBackend(fakeWebGPURenderer(), false)).toBe(false);
  });
});

// ── bind() activation behaviour ──────────────────────────────────────────────

describe('RenderPipelineManager.bind() — TSL activation gating (§PERF-WEBGL2-NO-TSL)', () => {
  const scene = {} as any;
  const camera = {} as any;

  it('does NOT activate the TSL pipeline on a forced-WebGL (WebGL2) backend', async () => {
    const rpm = new RenderPipelineManager();
    await rpm.bind(scene, camera, fakeForcedWebGLRenderer(), 'dark');
    // Lightweight path: WebGPU NOT active; render() short-circuits; no SSGI/outlines.
    expect(rpm.status.webGpuActive).toBe(false);
    expect(rpm.status.ssgiActive).toBe(false);
    expect(rpm.status.outlinesActive).toBe(false);
    expect(rpm.status.phase).toBe('phase2');
  });

  it('does NOT activate the TSL pipeline on a plain WebGLRenderer', async () => {
    const rpm = new RenderPipelineManager();
    await rpm.bind(scene, camera, fakePlainWebGLRenderer(), 'dark');
    expect(rpm.status.webGpuActive).toBe(false);
    expect(rpm.status.phase).toBe('phase2');
  });

  it('does NOT activate the TSL pipeline when an authoritative override=false is threaded', async () => {
    const rpm = new RenderPipelineManager();
    // Renderer LOOKS like WebGPU but the factory resolved a non-WebGPU backend.
    await rpm.bind(scene, camera, fakeWebGPURenderer(), 'dark', false);
    expect(rpm.status.webGpuActive).toBe(false);
    expect(rpm.status.phase).toBe('phase2');
  });

  it('keeps post-FX OFF so render() is a no-op on the forced-WebGL path (no freeze/retry loop)', async () => {
    const rpm = new RenderPipelineManager();
    await rpm.bind(scene, camera, fakeForcedWebGLRenderer(), 'dark');
    // render() must early-return on !_webGpuActive — never touches a pipeline,
    // so the WebGL2 path cannot enter the rebuild/retry loop that froze the viewport.
    expect(() => rpm.render(0.016)).not.toThrow();
    expect(rpm.status.phase).toBe('phase2');
  });

  it('ACTIVATES the TSL pipeline path for a REAL WebGPU backend (real path untouched)', async () => {
    const rpm = new RenderPipelineManager();
    // On a real WebGPU backend, bind() proceeds PAST the WebGL no-op guard and runs
    // _loadTSL() + _buildPipeline() (the real TSL pipeline). The decisive proof the
    // real-WebGPU branch executed — vs the WebGL early-return — is webGpuActive===true.
    // (The WebGL no-op sets phase2 with webGpuActive FALSE; here it is TRUE.)
    await rpm.bind(scene, camera, fakeWebGPURenderer(), 'dark');
    expect(rpm.status.webGpuActive).toBe(true);
  });
});

// ── §PERF-WEBGL2-RENDER-ON-MOVE (ADR-061) — lightweight per-frame WebGL render ─
//
// Regression context (prod, 2026-06-29):
//   On the default 'webgl' backend preference the renderer is a forced-WebGL
//   WebGPURenderer (backend='webgl-fallback'). Phase 5 is active so OBC is locked
//   to MANUAL + silenced, and the TSL pipeline is OFF (webGpuActive=false) — so
//   render() no-op'd and NOTHING painted per frame. The viewport froze during
//   orbit/pan/zoom and only repainted once motion stopped. The fix drives a plain
//   `renderer.render(scene, camera)` each frame via setLightweightWebGlRender(true).
describe('RenderPipelineManager — lightweight WebGL render gate (§PERF-WEBGL2-RENDER-ON-MOVE)', () => {
  const scene  = {} as any;
  const camera = {} as any;

  /** A WebGL2 renderer that records every render() call (the per-frame paint). */
  function recordingWebGl2Renderer(): any {
    const calls: Array<{ scene: unknown; camera: unknown }> = [];
    return {
      isWebGPURenderer: true,
      backend: { isWebGPUBackend: false }, // forced-WebGL → WebGL2 backend
      setClearAlpha: () => {},
      render: (s: unknown, c: unknown) => { calls.push({ scene: s, camera: c }); },
      __calls: calls,
    };
  }

  it('defaults to OFF — render() does NOT paint on a forced-WebGL backend without enabling', async () => {
    const renderer = recordingWebGl2Renderer();
    const rpm = new RenderPipelineManager();
    await rpm.bind(scene, camera, renderer, 'dark'); // webGpuActive=false
    expect(rpm.isLightweightWebGlActive).toBe(false);
    rpm.render(0.016);
    // No lightweight flag + no TSL pipeline ⇒ render() early-returns, never paints.
    expect(renderer.__calls.length).toBe(0);
  });

  it('once enabled, render() issues a plain renderer.render(scene, camera) every call', async () => {
    const renderer = recordingWebGl2Renderer();
    const rpm = new RenderPipelineManager();
    await rpm.bind(scene, camera, renderer, 'dark');
    rpm.setLightweightWebGlRender(true);
    expect(rpm.isLightweightWebGlActive).toBe(true);

    rpm.render(0.016);
    rpm.render(0.016);
    rpm.render(0.016);
    // Three rAF ticks → three continuous repaints (this is the orbit smoothness fix).
    expect(renderer.__calls.length).toBe(3);
    expect(renderer.__calls[0].scene).toBe(scene);
    expect(renderer.__calls[0].camera).toBe(camera);
  });

  it('is suppressed while suspended (heavy-op guard) and resumes after', async () => {
    const renderer = recordingWebGl2Renderer();
    const rpm = new RenderPipelineManager();
    await rpm.bind(scene, camera, renderer, 'dark');
    rpm.setLightweightWebGlRender(true);

    rpm.setSuspended(true);
    rpm.render(0.016);
    expect(renderer.__calls.length).toBe(0); // suspended → no paint

    rpm.setSuspended(false);
    rpm.render(0.016);
    expect(renderer.__calls.length).toBe(1); // resumed → paints again
  });

  it('setLightweightWebGlRender(false) turns the per-frame paint back off', async () => {
    const renderer = recordingWebGl2Renderer();
    const rpm = new RenderPipelineManager();
    await rpm.bind(scene, camera, renderer, 'dark');
    rpm.setLightweightWebGlRender(true);
    rpm.render(0.016);
    expect(renderer.__calls.length).toBe(1);

    rpm.setLightweightWebGlRender(false);
    rpm.render(0.016);
    expect(renderer.__calls.length).toBe(1); // no further paints
  });

  it('does not paint before scene/camera/renderer are bound (null-safe)', () => {
    const rpm = new RenderPipelineManager();
    rpm.setLightweightWebGlRender(true); // enabled but never bound
    expect(() => rpm.render(0.016)).not.toThrow();
  });
});
