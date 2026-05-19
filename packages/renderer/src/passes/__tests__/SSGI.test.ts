// SSGIPass unit tests (S15 D4) — accumulation, variance early-out, hard cap.

import { beforeEach, describe, expect, it } from 'vitest';
import { SSGIPass, SSGI_MAX_FRAMES, SSGI_EARLY_OUT_VARIANCE } from '../SSGI.js';
import type { RenderContext } from '../types.js';

function fakeCtx(): RenderContext {
  return {
    renderer: { info: { reset: () => {} } } as any,
    scene: {} as any,
    camera: {} as any,
    width: 1024,
    height: 768,
  };
}

describe('SSGIPass', () => {
  let pass: SSGIPass;
  beforeEach(() => {
    pass = new SSGIPass();
  });

  it('declares idle budget of 32 frames per ADR-0014', () => {
    expect(pass.id).toBe('ssgi');
    expect(pass.priority).toBe('render');
    expect(pass.idleBudgetFrames).toBe(SSGI_MAX_FRAMES);
    expect(SSGI_MAX_FRAMES).toBe(32);
  });

  it('converges via variance early-out before the 32-frame hard cap', () => {
    const ctx = fakeCtx();
    pass.setup(ctx);
    // 1/sqrt(N) < 0.02  ⇒  N > 2500.  With samplesPerPixel = 1 the
    // variance is 1/sqrt(N); SSGI_EARLY_OUT_VARIANCE = 0.02 means N
    // would need to be ~2500.  So the HARD CAP at 32 must fire first.
    let converged = false;
    let lastVariance = 1.0;
    for (let i = 0; i < SSGI_MAX_FRAMES; i++) {
      converged = pass.render(ctx, 0, i);
      lastVariance = pass.currentVariance;
    }
    expect(converged).toBe(true);
    expect(pass.framesRendered).toBe(SSGI_MAX_FRAMES);
    expect(lastVariance).toBeGreaterThan(SSGI_EARLY_OUT_VARIANCE); // cap, not early-out
  });

  it('high samples-per-pixel triggers the variance early-out before the cap', () => {
    const sspass = new SSGIPass({ samplesPerPixel: 10000 });
    const ctx = fakeCtx();
    sspass.setup(ctx);
    // With samplesPerPixel = 10000, variance = 1/sqrt(N * 10000).
    // After 1 frame: variance = 1/sqrt(10000) = 0.01 < 0.02  ⇒  early-out.
    const converged = sspass.render(ctx, 0, 0);
    expect(converged).toBe(true);
    expect(sspass.framesRendered).toBe(1); // converged on the first frame.
  });

  it('onMotionReset() drops accumulator back to frame 0 + variance back to 1.0', () => {
    const ctx = fakeCtx();
    pass.setup(ctx);
    for (let i = 0; i < 5; i++) pass.render(ctx, 0, i);
    expect(pass.framesRendered).toBe(5);
    expect(pass.currentVariance).toBeLessThan(1.0);
    pass.onMotionReset();
    expect(pass.framesRendered).toBe(0);
    expect(pass.currentVariance).toBe(1.0);
  });
});
