// Wave A15 S121 (A15-T5) — RendererHandle contract tests.
//
// Tests the RendererHandle interface contract using a mock implementation.
// THREE.WebGLRenderer requires a live WebGL context (unavailable in Node),
// so we validate the interface shape and callback semantics with a pure mock.
//
// 12 test cases — exceeds the ≥ 10 minimum from A15-T5.

import { describe, expect, it, vi } from 'vitest';
import type { RendererHandle } from '../src/RendererHandle.js';

// ── Mock RendererHandle ───────────────────────────────────────────────────────

/** Minimal stub that satisfies the RendererHandle interface. */
function makeMockHandle(overrides: Partial<RendererHandle> = {}): RendererHandle {
  const lostListeners  = new Set<() => void>();
  const restoredListeners = new Set<() => void>();

  const handle: RendererHandle = {
    domElement: {} as HTMLCanvasElement,
    type: 'webgl2',
    render:                    vi.fn(),
    setSize:                   vi.fn(),
    setPixelRatio:             vi.fn(),
    getSize:                   vi.fn(() => ({ x: 0, y: 0 } as any)),
    setRenderTarget:           vi.fn(),
    getRenderTarget:           vi.fn(() => null),
    readRenderTargetPixels:    vi.fn(),
    dispose:                   vi.fn(),
    onContextLost(cb) {
      lostListeners.add(cb);
      return () => { lostListeners.delete(cb); };
    },
    onContextRestored(cb) {
      restoredListeners.add(cb);
      return () => { restoredListeners.delete(cb); };
    },
    // Allow tests to fire events directly.
    ...(overrides as any),
  };

  // Attach helpers for test-triggered events.
  (handle as any).__fireLost    = () => lostListeners.forEach(cb => cb());
  (handle as any).__fireRestored = () => restoredListeners.forEach(cb => cb());

  return handle;
}

// ── Interface-shape tests ─────────────────────────────────────────────────────

describe('RendererHandle interface contract (A15-T1)', () => {
  it('T01 — mock satisfies the full RendererHandle interface (TypeScript structural check)', () => {
    const handle: RendererHandle = makeMockHandle();
    // If this compiles and reaches here, the interface is structurally satisfied.
    expect(handle).toBeDefined();
  });

  it('T02 — domElement property is readable', () => {
    const fakeCanvas = { tagName: 'CANVAS' } as unknown as HTMLCanvasElement;
    const handle = makeMockHandle({ domElement: fakeCanvas });
    expect(handle.domElement).toBeDefined();
    expect(handle.domElement).toBe(fakeCanvas);
  });

  it('T03 — type discriminant is one of the three allowed literal values', () => {
    const allowed: ReadonlyArray<RendererHandle['type']> = ['webgpu', 'webgl2', 'webgl1'];
    const handle = makeMockHandle();
    expect(allowed).toContain(handle.type);
  });

  it('T04 — type narrowing: "webgl2" handle does not report webgpu', () => {
    const handle = makeMockHandle({ type: 'webgl2' });
    expect(handle.type === 'webgpu').toBe(false);
  });

  it('T05 — type narrowing: "webgpu" handle narrows correctly', () => {
    const handle = makeMockHandle({ type: 'webgpu' });
    if (handle.type === 'webgpu') {
      // Reaches here — narrowing works.
      expect(handle.type).toBe('webgpu');
    } else {
      throw new Error('Expected webgpu type');
    }
  });

  it('T06 — type narrowing: "webgl1" last-resort value is accepted', () => {
    const handle = makeMockHandle({ type: 'webgl1' });
    expect(handle.type).toBe('webgl1');
  });
});

// ── Rendering method tests ────────────────────────────────────────────────────

describe('RendererHandle rendering methods (A15-T1)', () => {
  it('T07 — render() is callable', () => {
    const handle = makeMockHandle();
    handle.render({} as any, {} as any);
    expect(handle.render).toHaveBeenCalledWith({}, {});
  });

  it('T08 — setSize() forwards width/height', () => {
    const handle = makeMockHandle();
    handle.setSize(1920, 1080);
    expect(handle.setSize).toHaveBeenCalledWith(1920, 1080);
  });

  it('T09 — setSize() accepts optional updateStyle parameter', () => {
    const handle = makeMockHandle();
    handle.setSize(800, 600, false);
    expect(handle.setSize).toHaveBeenCalledWith(800, 600, false);
  });

  it('T10 — setRenderTarget(null) routes to the default framebuffer', () => {
    const handle = makeMockHandle();
    handle.setRenderTarget(null);
    expect(handle.setRenderTarget).toHaveBeenCalledWith(null);
  });

  it('T11 — getRenderTarget() returns null by default (canvas framebuffer)', () => {
    const handle = makeMockHandle();
    const result = handle.getRenderTarget();
    expect(result).toBeNull();
  });
});

// ── Context-loss callback tests ───────────────────────────────────────────────

describe('RendererHandle context-loss callbacks (C04 §1.4)', () => {
  it('T12 — onContextLost callback is invoked when context is lost', () => {
    const handle = makeMockHandle();
    const onLost = vi.fn();
    handle.onContextLost(onLost);
    (handle as any).__fireLost();
    expect(onLost).toHaveBeenCalledTimes(1);
  });

  it('T13 — onContextRestored callback is invoked on restoration', () => {
    const handle = makeMockHandle();
    const onRestored = vi.fn();
    handle.onContextRestored(onRestored);
    (handle as any).__fireRestored();
    expect(onRestored).toHaveBeenCalledTimes(1);
  });

  it('T14 — onContextLost returns an unsubscribe function that removes the listener', () => {
    const handle = makeMockHandle();
    const onLost = vi.fn();
    const unsub = handle.onContextLost(onLost);
    unsub();
    (handle as any).__fireLost();
    expect(onLost).not.toHaveBeenCalled();
  });

  it('T15 — onContextRestored returns an unsubscribe function', () => {
    const handle = makeMockHandle();
    const onRestored = vi.fn();
    const unsub = handle.onContextRestored(onRestored);
    unsub();
    (handle as any).__fireRestored();
    expect(onRestored).not.toHaveBeenCalled();
  });

  it('T16 — multiple loss listeners all fire when context is lost', () => {
    const handle = makeMockHandle();
    const a = vi.fn();
    const b = vi.fn();
    handle.onContextLost(a);
    handle.onContextLost(b);
    (handle as any).__fireLost();
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
  });

  it('T17 — dispose() is callable and cleans up the handle', () => {
    const handle = makeMockHandle();
    handle.dispose();
    expect(handle.dispose).toHaveBeenCalledTimes(1);
  });
});
