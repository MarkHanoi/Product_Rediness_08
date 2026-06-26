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
