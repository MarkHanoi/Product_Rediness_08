// §L-328 SS-FIX-ELEVATION-VIEW-ZERO-SIZE-RENDER-TARGET — device loss from a zero-size
// render target on elevation-view creation.
//
// PROD EVIDENCE (founder): "just creating a simple elevation view" on a trivial 53-mesh
// scene loses the GPU device. Root: the new split pane allocates its render target BEFORE
// its container is laid out (0×0). The engine keeps SUBMITTING against that incomplete
// framebuffer → "Framebuffer is incomplete: Attachment has zero size" → a shader-VALIDATE
// burst → WebGPU device loss. The existing _reconcileRenderSize() 0×0 early-return only
// skips the RESIZE, NOT the SUBMIT — so the loop still draws against the incomplete target.
//
// FIX (P1): RenderPipelineManager.render() gates the submit — it skips ENTIRELY while the
// renderer's backing-store size is zero, and resumes the moment a non-zero size lands.
//
// TOOTH: at 0×0 NO submit occurs (rp.render on WebGPU / renderer.render on the lightweight
// WebGL2 path is never called); the instant the size is non-zero, the submit resumes.

import { describe, expect, it } from 'vitest';
import { RenderPipelineManager } from '../src/pipeline/RenderPipelineManager.js';

/** WebGPU-active RPM whose pipeline records each submit, wired to a fake renderer. */
function rpmWebGpuReady(renderer: any) {
  let submits = 0;
  const rpm = new RenderPipelineManager() as any;
  rpm._webGpuActive      = true;
  rpm._renderer          = renderer;
  rpm._backgroundUniform = { tick: () => {} };
  rpm._renderPipeline    = { render: () => { submits++; } };
  return { rpm, submits: () => submits };
}

/** Fake WebGPU renderer whose drawing-buffer size is settable (the attachment size). */
function fakeRendererWithBufferSize(w: number, h: number): any {
  const size = { x: w, y: h };
  return {
    isWebGPURenderer: true,
    backend: { isWebGPUBackend: true },
    setClearAlpha: () => {},
    getDrawingBufferSize: (t: { set: (x: number, y: number) => any } | any) => {
      if (t && typeof t.set === 'function') { t.set(size.x, size.y); return t; }
      return { x: size.x, y: size.y };
    },
    __setSize: (nw: number, nh: number) => { size.x = nw; size.y = nh; },
  };
}

describe('RenderPipelineManager — zero-size render submit gate (§L-328)', () => {
  it('does NOT submit a WebGPU pass while the render target is 0×0 (the fix)', () => {
    const renderer = fakeRendererWithBufferSize(0, 0);
    const { rpm, submits } = rpmWebGpuReady(renderer);

    rpm.render(0.016);
    rpm.render(0.016);

    // No submit against the incomplete framebuffer — the driver never kills the device.
    expect(submits()).toBe(0);
  });

  it('does NOT submit when only the height is zero (partial layout)', () => {
    const renderer = fakeRendererWithBufferSize(807, 0);
    const { rpm, submits } = rpmWebGpuReady(renderer);

    rpm.render(0.016);

    expect(submits()).toBe(0);
  });

  it('RESUMES the submit the instant a non-zero size lands (self-healing)', () => {
    const renderer = fakeRendererWithBufferSize(0, 0);
    const { rpm, submits } = rpmWebGpuReady(renderer);

    rpm.render(0.016);            // 0×0 → skipped
    expect(submits()).toBe(0);

    renderer.__setSize(807, 976); // the split pane finally lays out
    rpm.render(0.016);            // now submits
    expect(submits()).toBe(1);
  });

  it('submits normally on a healthy non-zero-size target (no regression)', () => {
    const renderer = fakeRendererWithBufferSize(1280, 720);
    const { rpm, submits } = rpmWebGpuReady(renderer);

    rpm.render(0.016);

    expect(submits()).toBe(1);
  });

  it('gates the lightweight WebGL2 path too — no renderer.render() at 0×0', async () => {
    let renderCount = 0;
    const size = { x: 0, y: 0 };
    const renderer: any = {
      isWebGPURenderer: true,
      backend: { isWebGPUBackend: false }, // forced-WebGL → WebGL2 backend
      autoClear: true, autoClearColor: true, autoClearDepth: true,
      getRenderTarget: () => null,
      setRenderTarget: () => {},
      setClearAlpha: () => {},
      setClearColor: () => {},
      getDrawingBufferSize: (t: any) => { if (t?.set) { t.set(size.x, size.y); return t; } return { ...size }; },
      render: () => { renderCount++; },
    };
    const rpm = new RenderPipelineManager();
    await rpm.bind({} as any, {} as any, renderer, 'light');
    rpm.setLightweightWebGlRender(true);

    rpm.render(0.016);
    expect(renderCount).toBe(0); // no submit against the zero-size target

    size.x = 900; size.y = 600;
    rpm.render(0.016);
    expect(renderCount).toBe(1); // resumes once laid out
  });

  it('renders when the renderer exposes no size accessor (defensive: never a false skip)', () => {
    // A minimal fake with no getDrawingBufferSize/getSize/domElement must NOT be treated
    // as zero-size — the gate returns false so existing harnesses keep rendering.
    const renderer: any = { isWebGPURenderer: true, backend: { isWebGPUBackend: true }, setClearAlpha: () => {} };
    const { rpm, submits } = rpmWebGpuReady(renderer);

    rpm.render(0.016);

    expect(submits()).toBe(1);
  });
});
