// §SURFACE-WITH-NO-AREA-REFUSES-THE-PASS (L-1470) — a pass must not RUN on a surface
// with no area, and the refusal must be ONE message, not 245.
//
// PROD EVIDENCE (founder, 2026-08-20, WebGPU live in the status bar):
//   [.WebGL-0x794c070c5800] GL_INVALID_FRAMEBUFFER_OPERATION: glClear:
//       Framebuffer is incomplete: Attachment has zero size.
//   245x  … glDrawElements: Framebuffer is incomplete: Attachment has zero size.
//   9x    … glDrawArrays:   Framebuffer is incomplete: Attachment has zero size.
//   WebGL: too many errors, no more errors will be reported to the console for this context.
//
// ⭐ THE SHAPE THAT MATTERS, AND THE ONE THESE TESTS PIN: the erroring context is
// `[.WebGL-…]` while the session's MAIN renderer is native WebGPU and perfectly
// healthy. TWO SURFACES, ONE BROKEN. RenderPipelineManager's existing §L-328 gate
// reads `this._renderer` — the WebGPU one — so it PASSES, the frame proceeds, and the
// per-frame OBC base clear (armed on every backend by L-1350) runs into a zero-area
// framebuffer. Every test below therefore keeps the main renderer HEALTHY; a suite
// that zeroed both surfaces would be satisfied by the old gate and prove nothing.
//
// MECHANISM (measured from real source both sides, 2026-08-20):
//   • `mainRendererVisibility._apply()` sets `display:none` on `#container`, the OBC
//     canvas's PARENT.
//   • OBC's `SimpleRenderer.resize` (@thatopen/components/dist/index.mjs:14535) is
//     `this.three.setSize(container.clientWidth, container.clientHeight)` — no
//     `Math.max`, no `> 0`, no `||` — wired to a ResizeObserver on that parent (:14680).
//   ⇒ hiding the container drives `setSize(0, 0)` and the backing store STAYS 0x0.
//
// ⭐ NOT A TRANSIENT. `RESUMES` below is the only arm where the surface recovers, and
// it recovers because the test explicitly gives it area — exactly as the real fix
// requires the container to be shown again. Nothing in the frame loop clears it.
//
// ⛔ THE FIX IS NOT A CLAMP. `refuses … rather than clamping` pins that: a 1x1 target
// still discards the image, so a clamp would convert a diagnosable driver error into a
// silent wrong picture. The pass must not run at all.

import { describe, expect, it, beforeEach, vi, afterEach } from 'vitest';
import { RenderPipelineManager } from '../src/pipeline/RenderPipelineManager.js';
import {
  admitSurface,
  hasDrawableArea,
  measureSurface,
  zeroAreaSurfaceGate,
  getZeroAreaSurfaceReport,
} from '../src/surfaceArea.js';

/**
 * A renderer shaped like OBC's `postproductionRenderer.three` AFTER
 * `SimpleRenderer.resize` drove `setSize(0, 0)`: the backing store is zero and the
 * canvas element reports zero, but every GL entry point still exists and still
 * "works" — which is precisely why nothing upstream noticed. It records the calls the
 * driver would have rejected.
 */
function obcBaseRenderer(w: number, h: number) {
  const calls = { clear: 0, render: 0, setRenderTarget: 0 };
  const size = { w, h };
  return {
    calls,
    /** Mirrors THREE.WebGLRenderer.setSize's effect on the backing store. */
    setSize(nw: number, nh: number) {
      size.w = nw; size.h = nh;
      this.domElement.width = nw; this.domElement.height = nh;
    },
    domElement: { width: w, height: h },
    getDrawingBufferSize(t: any) { if (t?.set) { t.set(size.w, size.h); return t; } return { x: size.w, y: size.h }; },
    getSize(t: any) { if (t?.set) { t.set(size.w, size.h); return t; } return { x: size.w, y: size.h }; },
    setRenderTarget() { calls.setRenderTarget++; },
    setClearColor() { /* no-op */ },
    clear() { calls.clear++; },
    render() { calls.render++; },
  };
}

/** A HEALTHY native-WebGPU renderer — the founder's main surface. Never zero. */
function healthyWebGpuRenderer() {
  return {
    isWebGPURenderer: true,
    backend: { isWebGPUBackend: true },
    setClearAlpha: () => {},
    getDrawingBufferSize: (t: any) => { if (t?.set) { t.set(1710, 976); return t; } return { x: 1710, y: 976 }; },
    getSize: (t: any) => { if (t?.set) { t.set(1710, 976); return t; } return { x: 1710, y: 976 }; },
  };
}

/** A WebGPU-active RPM wired to a healthy main renderer, counting real submits. */
function rpmOnHealthyWebGpu() {
  let submits = 0;
  const rpm = new RenderPipelineManager() as any;
  rpm._webGpuActive      = true;
  rpm._renderer          = healthyWebGpuRenderer();
  rpm._backgroundUniform = { tick: () => {} };
  rpm._renderPipeline    = { render: () => { submits++; } };
  return { rpm: rpm as RenderPipelineManager, submits: () => submits };
}

let warns: string[];
let infos: string[];

beforeEach(() => {
  zeroAreaSurfaceGate.reset();
  warns = []; infos = [];
  vi.spyOn(console, 'warn').mockImplementation((...a: unknown[]) => { warns.push(a.join(' ')); });
  vi.spyOn(console, 'info').mockImplementation((...a: unknown[]) => { infos.push(a.join(' ')); });
});
afterEach(() => { vi.restoreAllMocks(); });

describe('§SURFACE-WITH-NO-AREA-REFUSES-THE-PASS — the measurement (L-1470)', () => {
  it('reads the BACKING STORE, so OBC\'s setSize(0,0) is visible without a reflow', () => {
    const obc = obcBaseRenderer(1710, 976);
    expect(hasDrawableArea(obc)).toBe(true);

    // Exactly what @thatopen/components index.mjs:14535 does off a display:none parent.
    obc.setSize(0, 0);

    expect(measureSurface(obc)).toMatchObject({ width: 0, height: 0, via: 'getDrawingBufferSize' });
    expect(hasDrawableArea(obc)).toBe(false);
  });

  it('a HALF-collapsed surface is refused too (one zero is enough to make it incomplete)', () => {
    expect(hasDrawableArea(obcBaseRenderer(807, 0))).toBe(false);
    expect(hasDrawableArea(obcBaseRenderer(0, 976))).toBe(false);
  });

  it('UNREADABLE is not ZERO — an unmeasurable surface is admitted, never frozen', () => {
    // Refusing on absence of evidence would freeze every harness and every renderer
    // shape this module has not met. Same distinction §RETIRE-ZERO-IS-NOT-ONE-FACT
    // (L-1410) had to draw for a detach count of 0.
    expect(hasDrawableArea({})).toBe(true);
    expect(hasDrawableArea(null)).toBe(true);
    expect(measureSurface({}).via).toBe('unreadable');
  });
});

describe('§SURFACE-WITH-NO-AREA-REFUSES-THE-PASS — the pass refuses (L-1470)', () => {
  it('⭐ THE DEFECT: a healthy WebGPU frame still runs the per-frame OBC clear — and the zero-area base surface must refuse it', () => {
    const { rpm, submits } = rpmOnHealthyWebGpu();
    const obc = obcBaseRenderer(1710, 976);

    // The production hook, reproduced: self-gate, then clear. This is the closure
    // initScene installs via setPreFrameBaseClearHook (armed on EVERY Phase-5 backend
    // since L-1350), and RenderPipelineManager.render() calls it every presented frame.
    rpm.setPreFrameBaseClearHook(() => {
      if (!admitSurface(obc, 'obc-base-clear')) return;
      obc.setRenderTarget();
      obc.clear();
    });

    // The plan/split pane hides #container → OBC's own ResizeObserver zeroes the canvas.
    obc.setSize(0, 0);

    for (let i = 0; i < 300; i++) rpm.render(0.016);

    // ⭐ The MAIN renderer never stopped: §L-328 has nothing to say here, which is
    // exactly why this defect survived it. 300 real frames were presented.
    expect(submits()).toBe(300);

    // ⭐ And not one of them touched the zero-area framebuffer.
    expect(obc.calls.clear).toBe(0);
    expect(obc.calls.setRenderTarget).toBe(0);
  });

  it('⭐ CONTROL — without the gate the SAME 300 frames issue 300 discarded clears (the flood)', () => {
    const { rpm } = rpmOnHealthyWebGpu();
    const obc = obcBaseRenderer(0, 0);

    // The pre-fix hook: the old self-gate only asked about `pryzmCanvas.style.display`,
    // which is untouched when it is the CONTAINER that is hidden — so it passed.
    rpm.setPreFrameBaseClearHook(() => { obc.clear(); });

    for (let i = 0; i < 300; i++) rpm.render(0.016);

    // This is the founder's console. Chrome caps reporting at ~255 per context, which
    // is why his log reads 1 + 245 + 9 and then goes permanently silent.
    expect(obc.calls.clear).toBe(300);
  });

  it('RESUMES the moment the surface has area again, and does not need a new hook', () => {
    const { rpm } = rpmOnHealthyWebGpu();
    const obc = obcBaseRenderer(0, 0);
    rpm.setPreFrameBaseClearHook(() => {
      if (!admitSurface(obc, 'obc-base-clear')) return;
      obc.clear();
    });

    rpm.render(0.016);
    expect(obc.calls.clear).toBe(0);

    obc.setSize(1710, 976);        // the container is shown again
    rpm.render(0.016);
    expect(obc.calls.clear).toBe(1);
  });

  it('⛔ REFUSES rather than CLAMPING — a 1x1 surface would still discard the image', () => {
    // Pins the anti-fix. If someone later "solves" this with Math.max(1, …) upstream,
    // the surface reports 1x1, this admits it, and the picture is silently wrong with
    // no driver error to find it by. The gate must see the real zero.
    const obc = obcBaseRenderer(0, 0);
    expect(admitSurface(obc, 'clamp-check')).toBe(false);
    obc.setSize(1, 1);
    expect(admitSurface(obc, 'clamp-check')).toBe(true); // a clamp WOULD sail through
  });
});

describe('§SURFACE-WITH-NO-AREA-REFUSES-THE-PASS — the log aggregates and SURVIVES (C04 §INST.4)', () => {
  it('⭐ 300 refused frames produce ONE warning, not 300 — the flood is what hides findings', () => {
    const obc = obcBaseRenderer(0, 0);
    for (let i = 0; i < 300; i++) admitSurface(obc, 'obc-base-clear');

    const mine = warns.filter(w => w.includes('§SURFACE-WITH-NO-AREA-REFUSES-THE-PASS'));
    expect(mine).toHaveLength(1);
    // It must name the surface's measured size and say the condition is not self-clearing.
    expect(mine[0]).toContain('0x0');
    expect(mine[0]).toContain('does NOT clear on its own');
  });

  it('⭐ the COUNT survives the flood — retrievable after the message has scrolled away', () => {
    const obc = obcBaseRenderer(0, 0);
    for (let i = 0; i < 300; i++) admitSurface(obc, 'obc-base-clear');

    const row = getZeroAreaSurfaceReport().find(r => r.site === 'obc-base-clear');
    expect(row).toMatchObject({ suppressed: 300, suppressedTotal: 300, episodes: 1, suppressing: true });
  });

  it('closes the episode with a NUMBER on resume, then re-arms for the next one', () => {
    const obc = obcBaseRenderer(0, 0);
    for (let i = 0; i < 42; i++) admitSurface(obc, 'obc-base-clear');

    obc.setSize(1710, 976);
    admitSurface(obc, 'obc-base-clear');

    const resumed = infos.filter(i => i.includes('RESUMED'));
    expect(resumed).toHaveLength(1);
    expect(resumed[0]).toContain('42 frame(s) were refused');

    // A second episode warns again — aggregation must not latch permanently silent,
    // or a recurrence becomes invisible.
    obc.setSize(0, 0);
    for (let i = 0; i < 10; i++) admitSurface(obc, 'obc-base-clear');
    expect(warns.filter(w => w.includes('§SURFACE-WITH-NO-AREA-REFUSES-THE-PASS'))).toHaveLength(2);

    const row = getZeroAreaSurfaceReport().find(r => r.site === 'obc-base-clear');
    expect(row).toMatchObject({ suppressed: 10, suppressedTotal: 52, episodes: 2 });
  });

  it('aggregates PER SITE — one hidden surface cannot mask a second, different refusal', () => {
    const obc = obcBaseRenderer(0, 0);
    for (let i = 0; i < 5; i++) admitSurface(obc, 'obc-base-clear');
    for (let i = 0; i < 7; i++) admitSurface(obc, 'ViewController._forceRendererUpdate');

    expect(warns.filter(w => w.includes('§SURFACE-WITH-NO-AREA'))).toHaveLength(2);
    const sites = getZeroAreaSurfaceReport().map(r => r.site).sort();
    expect(sites).toEqual(['ViewController._forceRendererUpdate', 'obc-base-clear']);
  });
});
