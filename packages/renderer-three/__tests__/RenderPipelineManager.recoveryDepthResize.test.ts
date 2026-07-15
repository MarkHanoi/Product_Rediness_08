// §FIX-RENDER-RECOVERY-DEPTH (L-312 Problem A) — post-device-loss / split-view
// depth-attachment size-mismatch flood.
//
// PROD EVIDENCE (founder, WebGPU on Windows): after a device-loss recovery on a
// split-view layout the console floods with:
//
//   The depth stencil attachment [TextureView of Texture "depthBuffer"] size
//   (width: 1145, height: 915) does not match the size of the other attachments'
//   base plane (width: 632, height: 915)  → [Invalid CommandBuffer] … Submit()
//
// The fresh renderer was sized ONCE at recovery time; a split-view resize that
// landed during / after the device-loss window left the color targets (632) and
// the shared "depthBuffer" (1145) derived from two different size reads, so every
// pass was invalid and every submit rejected — PERMANENTLY.
//
// FIX: before encoding a WebGPU pass, RenderPipelineManager reconciles the
// renderer backing-store size to the LIVE canvas size (single source of truth) so
// the color targets and the shared depthBuffer reallocate together. These tests
// pin that reconcile: the TOOTH is that a stale renderer (getSize() ≠ canvas
// clientWidth) triggers exactly one corrective setSize(liveW, liveH) BEFORE the
// pipeline renders — and an already-consistent renderer triggers none.

import { describe, expect, it } from 'vitest';
import { RenderPipelineManager } from '../src/pipeline/RenderPipelineManager.js';

// ── Fake renderer with THREE-shaped getSize/setSize + a live-CSS canvas ───────
//
// getSize() returns the renderer's CURRENT backing-store logical size (what the
// renderer THINKS it is). domElement.clientWidth/Height is the LIVE split-view
// pane size (what the pass will actually encode color into). When these differ,
// the shared depthBuffer (tracked from getDrawingBufferSize) and the color base
// plane disagree — the bug.
function fakeWebGpuRendererWithSize(opts: {
  currentW: number; currentH: number;   // renderer.getSize() → stale/backing size
  liveW: number; liveH: number;         // canvas CSS size → the truth
}): any {
  const size = { x: opts.currentW, y: opts.currentH };
  const setSizeCalls: Array<{ w: number; h: number; updateStyle: boolean }> = [];
  return {
    isWebGPURenderer: true,
    backend: { isWebGPUBackend: true },
    setClearAlpha: () => {},
    domElement: { clientWidth: opts.liveW, clientHeight: opts.liveH },
    getSize: (t: { set: (x: number, y: number) => any } | any) => {
      // Accept a THREE.Vector2-like target (the reusable _sizeProbe).
      if (t && typeof t.set === 'function') { t.set(size.x, size.y); return t; }
      return { x: size.x, y: size.y };
    },
    setSize: (w: number, h: number, updateStyle = true) => {
      setSizeCalls.push({ w, h, updateStyle });
      size.x = w; size.y = h; // mirror THREE: setSize updates the tracked size
    },
    __setSizeCalls: setSizeCalls,
  };
}

/**
 * Put an RPM into a fake "WebGPU active, pipeline bound" state (no live GPU), and
 * record the order of size-reconcile vs pipeline render so we can prove the
 * reconcile happens BEFORE the pass is encoded.
 */
function rpmRenderReady(renderer: any) {
  const order: string[] = [];
  const origSetSize = renderer.setSize;
  renderer.setSize = (w: number, h: number, u?: boolean) => { order.push('setSize'); origSetSize(w, h, u); };
  const rpm = new RenderPipelineManager() as any;
  rpm._webGpuActive      = true;
  rpm._renderer          = renderer;
  rpm._backgroundUniform = { tick: () => {} };
  rpm._renderPipeline    = { render: () => { order.push('render'); } };
  return { rpm, order };
}

describe('RenderPipelineManager — render-size reconcile (§FIX-RENDER-RECOVERY-DEPTH, L-312 A)', () => {
  it('re-applies setSize to the LIVE canvas size when the renderer size drifted (the fix)', () => {
    // Renderer thinks it is 1145×915 (pre-resize) but the split-view pane is 632×915.
    const renderer = fakeWebGpuRendererWithSize({ currentW: 1145, currentH: 915, liveW: 632, liveH: 915 });
    const { rpm } = rpmRenderReady(renderer);

    rpm.render(0.016);

    // Exactly one corrective setSize to the live pane size — color + shared depth
    // now reallocate from ONE read, so no pass can begin with a mismatched depth.
    expect(renderer.__setSizeCalls).toEqual([{ w: 632, h: 915, updateStyle: false }]);
  });

  it('reconciles BEFORE the pipeline pass is encoded (depth == color at pass-begin)', () => {
    const renderer = fakeWebGpuRendererWithSize({ currentW: 1152, currentH: 919, liveW: 417, liveH: 915 });
    const { rpm, order } = rpmRenderReady(renderer);

    rpm.render(0.016);

    // The corrective setSize MUST precede the pass render — otherwise the pass would
    // still encode with the stale depth attachment (the flood).
    expect(order).toEqual(['setSize', 'render']);
  });

  it('is a NO-OP when the renderer size already matches the live canvas (no churn)', () => {
    const renderer = fakeWebGpuRendererWithSize({ currentW: 900, currentH: 720, liveW: 900, liveH: 720 });
    const { rpm, order } = rpmRenderReady(renderer);

    rpm.render(0.016);

    expect(renderer.__setSizeCalls).toEqual([]);   // no corrective resize
    expect(order).toEqual(['render']);             // straight to the pass
  });

  it('does NOT resize to a zero-sized (detached / un-laid-out) canvas', () => {
    // A 0×0 canvas would trigger "Attachment has zero size" if we naively resized.
    const renderer = fakeWebGpuRendererWithSize({ currentW: 800, currentH: 600, liveW: 0, liveH: 0 });
    const { rpm } = rpmRenderReady(renderer);

    rpm.render(0.016);

    expect(renderer.__setSizeCalls).toEqual([]); // left at the last good size
  });

  it('_reconcileRenderSize returns true on drift and false when consistent', () => {
    const drift = fakeWebGpuRendererWithSize({ currentW: 1145, currentH: 915, liveW: 632, liveH: 915 });
    const rpmA = new RenderPipelineManager() as any;
    rpmA._renderer = drift;
    expect(rpmA._reconcileRenderSize()).toBe(true);
    // After the corrective resize the renderer is consistent → a second call no-ops.
    expect(rpmA._reconcileRenderSize()).toBe(false);

    const consistent = fakeWebGpuRendererWithSize({ currentW: 632, currentH: 915, liveW: 632, liveH: 915 });
    const rpmB = new RenderPipelineManager() as any;
    rpmB._renderer = consistent;
    expect(rpmB._reconcileRenderSize()).toBe(false);
    expect(consistent.__setSizeCalls).toEqual([]);
  });
});
