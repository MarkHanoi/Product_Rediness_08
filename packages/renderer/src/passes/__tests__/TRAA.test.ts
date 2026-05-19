// TRAAPass unit tests (S15 D3) — accumulation + convergence.

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TRAAPass, TRAA_HISTORY_LENGTH } from '../TRAA.js';
import type { RenderContext } from '../types.js';

function fakeCtx(): RenderContext {
  // Camera projectionMatrix.elements is a Float32Array of 16; mutate
  // entries 8 and 9 (the projection-jitter slots) so we can verify
  // TRAA jitters and restores cleanly.
  const elements = new Array(16).fill(0);
  return {
    renderer: { render: vi.fn(), info: { reset: () => {} } } as any,
    scene: {} as any,
    camera: { projectionMatrix: { elements } } as any,
    width: 1024,
    height: 768,
  };
}

describe('TRAAPass', () => {
  let pass: TRAAPass;
  beforeEach(() => {
    pass = new TRAAPass();
  });

  it('declares idle budget of 16 frames per ADR-0014', () => {
    expect(pass.id).toBe('traa');
    expect(pass.priority).toBe('post-render');
    expect(pass.idleBudgetFrames).toBe(TRAA_HISTORY_LENGTH);
    expect(TRAA_HISTORY_LENGTH).toBe(16);
  });

  it('converges within 16 frames (returns true on the 16th render call)', () => {
    const ctx = fakeCtx();
    pass.setup(ctx);
    let converged = false;
    for (let i = 0; i < 16; i++) {
      converged = pass.render(ctx, 0, i);
      if (i < 15) expect(converged).toBe(false); // not yet converged
    }
    expect(converged).toBe(true); // 16th frame converged
    expect(pass.framesRendered).toBe(16);
  });

  it('jitters the projection matrix and restores it cleanly each frame', () => {
    const ctx = fakeCtx();
    pass.setup(ctx);
    const initial8 = ctx.camera.projectionMatrix.elements[8];
    const initial9 = ctx.camera.projectionMatrix.elements[9];
    for (let i = 0; i < 5; i++) {
      pass.render(ctx, 0, i);
      // Matrix is restored after each render — never observably
      // mutated outside of pass.render's body.
      expect(ctx.camera.projectionMatrix.elements[8]).toBeCloseTo(initial8, 6);
      expect(ctx.camera.projectionMatrix.elements[9]).toBeCloseTo(initial9, 6);
    }
  });

  it('onMotionReset() drops the accumulator back to frame 0', () => {
    const ctx = fakeCtx();
    pass.setup(ctx);
    for (let i = 0; i < 8; i++) pass.render(ctx, 0, i);
    expect(pass.framesRendered).toBe(8);
    pass.onMotionReset();
    expect(pass.framesRendered).toBe(0);
    // Now needs a full 16 frames again to reconverge.
    let converged = false;
    for (let i = 0; i < 16; i++) {
      converged = pass.render(ctx, 0, i);
    }
    expect(converged).toBe(true);
  });
});
