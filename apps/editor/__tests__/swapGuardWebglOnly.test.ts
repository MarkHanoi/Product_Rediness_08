// §L-372 Batch 2 / L-382 — the live-swap Phase-5 guard must NOT reject a
// 'webgl-only' result when the classic renderer was the INTENDED heavy-gen target.
//
// initScene's swap rolls back on a 'webgl-only' result because, for an
// 'auto'/'webgpu'/'webgl' swap, webgl-only means WebGPURenderer construction failed.
// But a 'webgl-classic' heavy-gen swap DELIBERATELY builds the classic webgl-only
// renderer — that is success, not a failure. The decision is the pure predicate
// isUnintendedWebglOnlySwap(), used inline by the swap guard.

import { describe, it, expect } from 'vitest';
import { isUnintendedWebglOnlySwap } from '../src/rendering/createRenderer';

describe('isUnintendedWebglOnlySwap (§L-372B Phase-5 swap guard)', () => {
  it('does NOT reject webgl-only when it was the intended classic target (heavy-gen success)', () => {
    expect(isUnintendedWebglOnlySwap('webgl-only', /* intendedClassicWebGL */ true)).toBe(false);
  });

  it('rejects webgl-only when it was NOT intended (WebGPURenderer construction failed → roll back)', () => {
    expect(isUnintendedWebglOnlySwap('webgl-only', false)).toBe(true);
  });

  it('never rejects a real WebGPU backend', () => {
    expect(isUnintendedWebglOnlySwap('webgpu', false)).toBe(false);
    expect(isUnintendedWebglOnlySwap('webgpu', true)).toBe(false);
  });

  it('never rejects the WebGL2 fallback backend (guarded-fallback result is accepted)', () => {
    // If classic construction failed, the factory yields 'webgl-fallback'; the swap
    // must accept it (lightweight branch), never roll back.
    expect(isUnintendedWebglOnlySwap('webgl-fallback', true)).toBe(false);
    expect(isUnintendedWebglOnlySwap('webgl-fallback', false)).toBe(false);
  });
});
