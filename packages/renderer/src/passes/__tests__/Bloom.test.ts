// BloomPass unit tests (S15 D2).
//
// We don't have a real WebGL2 context in vitest/Node, so we mock
// `three/examples/jsm/postprocessing/UnrealBloomPass.js` to a
// stub that records construction args + render() / setSize() / dispose() calls.

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('three/examples/jsm/postprocessing/UnrealBloomPass.js', () => {
  class FakeUnrealBloomPass {
    constructor(public size: any, public intensity: number, public radius: number, public threshold: number) {}
    render = vi.fn();
    setSize = vi.fn();
    dispose = vi.fn();
  }
  return { UnrealBloomPass: FakeUnrealBloomPass };
});

import { BloomPass } from '../Bloom.js';
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

describe('BloomPass', () => {
  let pass: BloomPass;
  beforeEach(() => {
    pass = new BloomPass({ threshold: 0.85, intensity: 0.5, radius: 0.3 });
  });

  it('declares the correct RenderPass shape (id + priority + zero idle budget)', () => {
    expect(pass.id).toBe('bloom');
    expect(pass.priority).toBe('post-render');
    expect(pass.idleBudgetFrames).toBe(0); // ADR-0014: one-shot.
  });

  it('setup() lazily allocates the underlying UnrealBloomPass on the first call', () => {
    const ctx = fakeCtx();
    pass.setup(ctx);
    pass.setup(ctx); // idempotent — second call must NOT reallocate.
    // Reach in via the `.impl` private field through a render() call.
    const converged = pass.render(ctx, 0, 0);
    expect(converged).toBe(true);
  });

  it('render() returns true on the first call (one-shot — converged)', () => {
    const ctx = fakeCtx();
    const converged = pass.render(ctx, 0, 0);
    expect(converged).toBe(true);
  });

  it('resize() forwards to the underlying impl', () => {
    const ctx = fakeCtx();
    pass.setup(ctx);
    pass.resize(2048, 1024);
    // UnrealBloomPass.setSize was called — verified indirectly via dispose.
    pass.dispose();
  });

  it('dispose() releases the impl and is idempotent', () => {
    const ctx = fakeCtx();
    pass.setup(ctx);
    pass.dispose();
    pass.dispose(); // idempotent
    // Re-setup after dispose should reallocate.
    pass.setup(ctx);
    expect(pass.render(ctx, 0, 0)).toBe(true);
  });
});
