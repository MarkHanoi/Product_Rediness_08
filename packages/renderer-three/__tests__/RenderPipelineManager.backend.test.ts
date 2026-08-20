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

import { describe, expect, it, vi } from 'vitest';
import { RenderPipelineManager } from '../src/pipeline/RenderPipelineManager.js';
import { isShaderCompileError } from '../src/safeDispose.js';

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

// ── §FIX-WEBGL2-GHOST-ON-ROTATE (W2.2 / ADR-0108) — per-frame OBC base clear ───
//
// Regression context (prod): on the WebGL2 'webgl-fallback' backend the PRYZM
// overlay canvas (alpha:true, cleared transparent per frame) composites over the
// silenced OBC base canvas (preserveDrawingBuffer:false). §FIX-OBC-BASE-STALE-
// COMPOSITE clears the base ONCE at activate/live-swap; during continuous
// render-on-move repaints the stale base buffer resurfaces UNDER the transparent
// overlay → old geometry ghosts through while the overlay draws the new positions
// = the trailing/duplicate-on-rotate that settles once motion stops. The fix
// re-clears the OBC base via an injected hook at the START of every lightweight
// move-frame. WebGL2 path ONLY — the hook is invoked exclusively inside the
// lightweight branch, so native WebGPU is untouched.
describe('RenderPipelineManager — per-frame OBC base clear hook (§FIX-WEBGL2-GHOST-ON-ROTATE)', () => {
  const scene  = {} as any;
  const camera = {} as any;

  /** WebGL2 renderer that records render() order via a shared event log. */
  function recordingWebGl2Renderer(log: string[]): any {
    return {
      isWebGPURenderer: true,
      backend: { isWebGPUBackend: false }, // forced-WebGL → WebGL2 backend
      setClearAlpha: () => {},
      render: () => { log.push('render'); },
    };
  }

  it('invokes the hook once per lightweight frame, BEFORE the overlay render', async () => {
    const log: string[] = [];
    const renderer = recordingWebGl2Renderer(log);
    const rpm = new RenderPipelineManager();
    await rpm.bind(scene, camera, renderer, 'dark');
    rpm.setLightweightWebGlRender(true);
    rpm.setPreLightweightFrameHook(() => log.push('clear'));

    rpm.render(0.016);
    rpm.render(0.016);

    // Two frames → clear-then-render each time (base cleared before the overlay paints).
    expect(log).toEqual(['clear', 'render', 'clear', 'render']);
  });

  it('does NOT invoke the hook when the lightweight path is OFF (e.g. native WebGPU)', async () => {
    const log: string[] = [];
    const renderer = recordingWebGl2Renderer(log);
    const rpm = new RenderPipelineManager();
    await rpm.bind(scene, camera, renderer, 'dark'); // lightweight defaults OFF
    rpm.setPreLightweightFrameHook(() => log.push('clear'));

    rpm.render(0.016);
    // render() early-returns (no lightweight, no TSL) → hook never runs, no paint.
    expect(log).toEqual([]);
  });

  it('is null-clearable — passing null disarms the hook (e.g. live-swap to WebGPU)', async () => {
    const log: string[] = [];
    const renderer = recordingWebGl2Renderer(log);
    const rpm = new RenderPipelineManager();
    await rpm.bind(scene, camera, renderer, 'dark');
    rpm.setLightweightWebGlRender(true);
    rpm.setPreLightweightFrameHook(() => log.push('clear'));
    rpm.render(0.016);
    expect(log).toEqual(['clear', 'render']);

    rpm.setPreLightweightFrameHook(null);
    rpm.render(0.016);
    // No further 'clear' — only the overlay render runs.
    expect(log).toEqual(['clear', 'render', 'render']);
  });

  it('a throwing hook is best-effort — the overlay render still runs (no ghost-fix regression breaks paint)', async () => {
    const log: string[] = [];
    const renderer = recordingWebGl2Renderer(log);
    const rpm = new RenderPipelineManager();
    await rpm.bind(scene, camera, renderer, 'dark');
    rpm.setLightweightWebGlRender(true);
    rpm.setPreLightweightFrameHook(() => { throw new Error('OBC clear failed'); });

    expect(() => rpm.render(0.016)).not.toThrow();
    // Hook threw but was swallowed — the overlay still painted this frame.
    expect(log).toEqual(['render']);
  });

  // ⚠⚠ RETIRED 2026-08-20 (lane BG1, §FRAME-STARTS-CLEAN-ON-EVERY-BACKEND / L-1350).
  //
  // A test named "is not consulted on the real-WebGPU TSL path (WebGPU output
  // untouched)" stood here, and it PASSED. It pinned the defect: the base clear was
  // armed on the one backend whose overlay clears OPAQUE (L-317 — nothing beneath can
  // composite through) and disarmed on the one backend whose overlay presents
  // `presenceAlpha = step(0.0001, contentAlpha)`, i.e. fully transparent in every
  // empty-space pixel, where the OBC base canvas beneath is visible on EVERY frame.
  // That inversion is the founder's WebGPU ghost, and a green test was holding it in
  // place. Its replacement asserts the opposite, and asserts it on BOTH backends so
  // neither arm can be fixed by regressing the other.
  //
  // ⚠ WHAT THIS DOES NOT ESTABLISH. It proves the hook is CALLED at the start of a
  // frame on both backends. It does not read a pixel, and a clear that is called can
  // still clear the wrong framebuffer — which is a real failure mode here and has its
  // own guard (§FIX-WEBGL2-GHOST-STALE-TARGET, below). "The frame starts clean" is
  // provable only in a browser.
  it('IS consulted on the real-WebGPU TSL path — the arm that was inverted (L-1350)', async () => {
    const log: string[] = [];
    const rpm = new RenderPipelineManager();
    await rpm.bind(scene, camera, fakeWebGPURenderer(), 'dark').catch(() => { /* TSL may not load in node */ });
    expect(rpm.isLightweightWebGlActive).toBe(false); // native WebGPU: lightweight stays OFF

    rpm.setPreFrameBaseClearHook(() => log.push('clear'));

    // The TSL pipeline cannot be built without a GPU, so drive the branch directly:
    // the hook must run before the pipeline submit, not inside the lightweight arm.
    (rpm as unknown as { _runPreFrameBaseClear(): void })._runPreFrameBaseClear();
    expect(log).toEqual(['clear']);
  });

  it('the two backends share ONE hook — arming is not per-backend (L-1350)', async () => {
    // Same manager, same setter, both arms: the property that makes a future backend
    // inherit the clear instead of having to be enumerated into it.
    const lwLog: string[] = [];
    const lw = new RenderPipelineManager();
    await lw.bind(scene, camera, recordingWebGl2Renderer(lwLog), 'dark');
    lw.setLightweightWebGlRender(true);
    lw.setPreFrameBaseClearHook(() => lwLog.push('clear'));
    lw.render(0.016);
    expect(lwLog).toEqual(['clear', 'render']);

    const gpuLog: string[] = [];
    const gpu = new RenderPipelineManager();
    await gpu.bind(scene, camera, fakeWebGPURenderer(), 'dark').catch(() => { /* no GPU in node */ });
    gpu.setPreFrameBaseClearHook(() => gpuLog.push('clear'));
    (gpu as unknown as { _runPreFrameBaseClear(): void })._runPreFrameBaseClear();
    expect(gpuLog).toEqual(['clear']);
  });

  it('the deprecated setter still feeds the same hook (older callers keep working)', async () => {
    const log: string[] = [];
    const renderer = recordingWebGl2Renderer(log);
    const rpm = new RenderPipelineManager();
    await rpm.bind(scene, camera, renderer, 'dark');
    rpm.setLightweightWebGlRender(true);
    rpm.setPreLightweightFrameHook(() => log.push('clear'));
    rpm.render(0.016);
    expect(log).toEqual(['clear', 'render']);
  });
});

// ── §FIX-WEBGL2-GHOST-STALE-TARGET (L-05 / G6) — the frame must hit the CANVAS ─
//
// ROOT CAUSE of the residual ghost/smear-on-rotate that survived §FIX-WEBGL2-GHOST-
// ON-ROTATE: the WebGL2 renderer is SHARED. The GPU picker
// (SelectionManager._buildGpuPickRenderer → renderToTarget), initTools' pick-strategy
// probe, ViewRenderCache.renderToCache, PhotorealisticRenderer, PanoramaCapture and
// ViewportPathTracer all borrow it and REDIRECT it to an offscreen render target
// (setRenderTarget(target) → render() → setRenderTarget(prev)). Two of those restore
// with NO try/finally — so when the inner render() throws (the founder's console shows
// `GL_INVALID_OPERATION: glDrawElements: Mismatch between texture format and sampler
// type` and `Cannot read properties of undefined (reading 'usedTimes')` on exactly this
// backend) the renderer stays PERMANENTLY BOUND to that offscreen target.
//
// From that frame on, every `renderer.render(scene, camera)` paints into the offscreen
// buffer, the canvas is never touched again, and it keeps compositing its LAST frame
// while the camera keeps orbiting → stale geometry trailing the live camera. It also
// defeats every explicit per-frame clear, because `clear()` clears the BOUND framebuffer.
//
// The frame owner enforces its own invariants (C04 §2): canvas-bound + clear-enabled,
// re-asserted at the top of each lightweight WebGL2 frame.
describe('RenderPipelineManager — lightweight frame target/clear invariants (§FIX-WEBGL2-GHOST-STALE-TARGET)', () => {
  const scene  = {} as any;
  const camera = {} as any;

  /** WebGL2 renderer with a mutable render-target + autoClear latches, like THREE's. */
  function sharedWebGl2Renderer(initialTarget: unknown = null): any {
    let target: unknown = initialTarget;
    return {
      isWebGPURenderer: true,
      backend: { isWebGPUBackend: false }, // forced-WebGL → WebGL2 backend
      autoClear: true,
      autoClearColor: true,
      autoClearDepth: true,
      setClearAlpha: () => {},
      getRenderTarget: () => target,
      setRenderTarget: (t: unknown) => { target = t; },
      // Record the target that was live at the moment of the paint — that is the
      // surface the frame actually landed on.
      render: function (this: any) { this.__paintedInto.push(target); },
      __paintedInto: [] as unknown[],
    };
  }

  it('paints into the CANVAS even when a borrower leaked its offscreen pick target', async () => {
    // A GPU-pick / thumbnail pass threw mid-render and never restored → still bound.
    const leakedPickTarget = { __id: 'gpu-pick-id-buffer' };
    const renderer = sharedWebGl2Renderer(leakedPickTarget);
    const rpm = new RenderPipelineManager();
    await rpm.bind(scene, camera, renderer, 'dark');
    rpm.setLightweightWebGlRender(true);

    rpm.render(0.016);
    rpm.render(0.016);

    // Both frames landed on the canvas (null), NOT in the leaked offscreen buffer.
    // Before the fix these two frames went into `leakedPickTarget` and the canvas
    // kept showing its last composite while the camera moved = the ghost.
    expect(renderer.__paintedInto).toEqual([null, null]);
    expect(renderer.getRenderTarget()).toBeNull();
  });

  it('re-asserts autoClear latches so a frame can never accumulate over the previous one', async () => {
    const renderer = sharedWebGl2Renderer();
    // A borrower (or a legacy path, exactly like BimWorld does to the OBC renderer)
    // suppressed the clear — the overlay would become an accumulation buffer.
    renderer.autoClear      = false;
    renderer.autoClearColor = false;
    renderer.autoClearDepth = false;

    const rpm = new RenderPipelineManager();
    await rpm.bind(scene, camera, renderer, 'dark');
    rpm.setLightweightWebGlRender(true);
    rpm.render(0.016);

    expect(renderer.autoClear).toBe(true);
    expect(renderer.autoClearColor).toBe(true);
    expect(renderer.autoClearDepth).toBe(true);
  });

  it('leaves an already-clean renderer untouched (no redundant setRenderTarget churn)', async () => {
    const renderer = sharedWebGl2Renderer(null);
    const setSpy = vi.spyOn(renderer, 'setRenderTarget');
    const rpm = new RenderPipelineManager();
    await rpm.bind(scene, camera, renderer, 'dark');
    rpm.setLightweightWebGlRender(true);

    rpm.render(0.016);

    // Target was already the canvas → no re-bind is issued on the hot path.
    expect(setSpy).not.toHaveBeenCalled();
    expect(renderer.__paintedInto).toEqual([null]);
  });

  it('the invariant re-assertion runs AFTER the OBC base-clear hook, before the paint', async () => {
    const log: string[] = [];
    const renderer = sharedWebGl2Renderer({ __id: 'leaked' });
    renderer.setRenderTarget = (t: unknown) => { log.push('setRenderTarget'); (renderer as any).__t = t; };
    renderer.getRenderTarget = () => ((renderer as any).__t ?? { __id: 'leaked' });
    renderer.render = () => { log.push('render'); };

    const rpm = new RenderPipelineManager();
    await rpm.bind(scene, camera, renderer, 'dark');
    rpm.setLightweightWebGlRender(true);
    rpm.setPreLightweightFrameHook(() => log.push('obc-clear'));

    rpm.render(0.016);

    expect(log).toEqual(['obc-clear', 'setRenderTarget', 'render']);
  });

  it('tolerates a renderer without the target API (older/plain adapters) — never breaks the frame', async () => {
    const renderer: any = {
      isWebGPURenderer: true,
      backend: { isWebGPUBackend: false },
      setClearAlpha: () => {},
      render: () => { renderer.__painted = (renderer.__painted ?? 0) + 1; },
    };
    const rpm = new RenderPipelineManager();
    await rpm.bind(scene, camera, renderer, 'dark');
    rpm.setLightweightWebGlRender(true);

    expect(() => rpm.render(0.016)).not.toThrow();
    expect(renderer.__painted).toBe(1);
  });

  it('does NOT touch the render target on the real-WebGPU TSL path (L-253 pipeline untouched)', async () => {
    const rpm = new RenderPipelineManager();
    const renderer = fakeWebGPURenderer() as any;
    renderer.setRenderTarget = vi.fn();
    await rpm.bind(scene, camera, renderer, 'dark');
    expect(rpm.status.webGpuActive).toBe(true);
    expect(rpm.isLightweightWebGlActive).toBe(false);
    // Structural: _assertLightweightFrameTarget is called ONLY inside the lightweight
    // branch, which this path never enters — PostProcessing owns its own target chain.
    expect(renderer.setRenderTarget).not.toHaveBeenCalled();
  });
});

// ── §RPM-RECOVERY-DOWNGRADE (ADR-0087) — device-loss recovery is NON-FATAL ─────
//
// DEMO-KILLER (prod, 2026-06-29): on the office-building circular plate a WebGPU
// device-loss + recovery rebuilt the heavy phase-4 TSL pipeline (SSGI/outlines)
// against the fresh device; a generated fragment shader failed to compile, which
// flipped THREE's fatal "Rendering has stopped" latch and killed the render loop
// behind a hard error overlay. The fix classifies that shader-compile RuntimeError
// and DOWNGRADES to the lightweight phase-2 pipeline (no post-FX) instead of
// escalating to phase='error' (which shows the crash overlay).
describe('isShaderCompileError (§RPM-RECOVERY-DOWNGRADE)', () => {
  it('matches the exact THREE WebGPU "Fragment shader failed to compile" RuntimeError', () => {
    const err = new Error('Fragment shader failed to compile. Compile log: …');
    expect(isShaderCompileError(err)).toBe(true);
  });

  it('matches vertex-shader compile failures and WGSL compile logs', () => {
    expect(isShaderCompileError(new Error('Vertex shader failed to compile'))).toBe(true);
    expect(isShaderCompileError(new Error('WGSL compilation error at line 12'))).toBe(true);
    expect(isShaderCompileError('Shader failed to COMPILE')).toBe(true); // string form, case-insensitive
  });

  it('does NOT match the §I2 usedTimes dispose error (that has its own non-fatal path)', () => {
    expect(isShaderCompileError(new Error("Cannot read properties of undefined (reading 'usedTimes')"))).toBe(false);
  });

  it('does NOT match unrelated runtime errors (genuine crashes must still surface)', () => {
    expect(isShaderCompileError(new Error('Cannot read properties of null'))).toBe(false);
    expect(isShaderCompileError(new Error('Out of memory'))).toBe(false);
    expect(isShaderCompileError(null)).toBe(false);
    expect(isShaderCompileError(undefined)).toBe(false);
  });
});

describe('RenderPipelineManager.render() — shader-compile downgrade (§RPM-RECOVERY-DOWNGRADE)', () => {
  /**
   * Build an RPM in a fake "WebGPU active, pipeline bound" state without a live
   * GPU. We set the private fields directly (the test owns the instance) and
   * stub the private _downgradeToLightweightPipeline so we can assert it was
   * called WITHOUT importing three/webgpu (which is unavailable under happy-dom).
   */
  function rpmWithThrowingPipeline(thrown: unknown) {
    const rpm = new RenderPipelineManager() as any;
    rpm._webGpuActive   = true;
    rpm._renderer       = { setClearAlpha: () => {} };
    rpm._renderPipeline = { render: () => { throw thrown; } };
    rpm._backgroundUniform = { tick: () => {} };
    const downgrade = vi.fn();
    rpm._downgradeToLightweightPipeline = downgrade;
    return { rpm, downgrade };
  }

  it('DOWNGRADES (not phase=error) when render throws a fragment-shader-compile RuntimeError', () => {
    const { rpm, downgrade } = rpmWithThrowingPipeline(
      new Error('Fragment shader failed to compile. Compile log: …'),
    );
    rpm.render(0.016);
    expect(downgrade).toHaveBeenCalledTimes(1);
    // Critical: it must NOT go to the fatal 'error' phase (→ crash overlay).
    expect(rpm.status.phase).not.toBe('error');
  });

  it('does NOT downgrade for a NON-shader render throw — keeps the existing retry ladder', () => {
    vi.useFakeTimers();
    const { rpm, downgrade } = rpmWithThrowingPipeline(new Error('some transient GPU hiccup'));
    rpm.render(0.016);
    // A non-shader error schedules a retry (does not downgrade).
    expect(downgrade).not.toHaveBeenCalled();
    expect(rpm.status.retryCount).toBe(1);
    vi.useRealTimers();
  });
});

describe('RenderPipelineManager — post-FX latch gates activate* (§RPM-RECOVERY-DOWNGRADE)', () => {
  it('activateSSGI / activateTRAA / activateOutlines no-op while post-FX is disabled', async () => {
    const rpm = new RenderPipelineManager() as any;
    rpm._webGpuActive   = true;
    rpm._postFxDisabled = true;
    // scenePass/scene/camera present so the only thing stopping activation is the latch.
    rpm._scenePass = {};
    rpm._scene     = {};
    rpm._camera    = {};

    await rpm.activateSSGI();
    await rpm.activateTRAA();
    await rpm.activateOutlines();

    expect(rpm.status.ssgiActive).toBe(false);
    expect(rpm.status.traaActive).toBe(false);
    expect(rpm.status.outlinesActive).toBe(false);
    expect(rpm.isPostFxDisabled).toBe(true);
  });

  it('tryUpgradePostFx is a no-op (returns true) when post-FX is NOT disabled', async () => {
    const rpm = new RenderPipelineManager() as any;
    rpm._webGpuActive   = true;
    rpm._postFxDisabled = false;
    await expect(rpm.tryUpgradePostFx()).resolves.toBe(true);
  });
});
