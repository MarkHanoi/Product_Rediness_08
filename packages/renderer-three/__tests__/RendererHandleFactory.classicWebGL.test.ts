// §L-372 Batch 2 / L-382 — RendererHandleFactory classic-WebGL routing tests.
//
// The heavy building-generation swap must route to a GENUINE classic
// THREE.WebGLRenderer (WebGLRendererAdapter → backend 'webgl-only'), NOT the
// WebGPURenderer(forceWebGL2) 'webgl-fallback' path — the latter still node-compiles
// every material's shader lazily via TSL ("Compiling GPU shaders", the L-382 symptom).
//
// These tests pin the factory's `preferClassicWebGL` routing + its MANDATORY guarded
// fallback (classic construction failure → the pre-L372B WebGL2 path, never a dead
// viewport). The real THREE.WebGLRenderer needs a live GL context (unavailable in Node),
// so both adapters are mocked; we assert WHICH adapter the factory selects.

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mock the two adapters the factory chooses between ────────────────────────
// vi.hoisted so these mocks exist BEFORE the (hoisted) vi.mock factories reference them.

const H = vi.hoisted(() => ({
  /** Control flag: make the mocked classic adapter constructor throw. */
  classicShouldThrow: false,
  classicCtor: vi.fn(),
  /** WebGPURendererAdapter.create — the forceWebGL2 'webgl-fallback' path. */
  webgpuCreate: vi.fn(),
}));
const { classicCtor, webgpuCreate } = H;

vi.mock('../src/adapters/WebGLRendererAdapter.js', () => {
  class WebGLRendererAdapter {
    readonly type = 'webgl2' as const;
    readonly __isClassicMock = true;
    constructor(canvas: unknown, opts: unknown) {
      H.classicCtor(canvas, opts);
      if (H.classicShouldThrow) throw new Error('classic THREE.WebGLRenderer ctor failed (test)');
    }
  }
  return { WebGLRendererAdapter };
});

vi.mock('../src/adapters/WebGPURendererAdapter.js', () => {
  class WebGPURendererAdapter {
    static create = H.webgpuCreate;
  }
  return { WebGPURendererAdapter };
});

import { RendererHandleFactory } from '../src/RendererHandleFactory.js';

const fakeCanvas = {} as HTMLCanvasElement;

describe('RendererHandleFactory §L-372B classic-WebGL routing', () => {
  beforeEach(() => {
    H.classicShouldThrow = false;
    classicCtor.mockClear();
    webgpuCreate.mockReset();
    // Default: the forceWebGL2 path yields a WebGL2-backed WebGPURenderer handle.
    webgpuCreate.mockResolvedValue({ type: 'webgl2', __isWebgpuMock: true });
  });

  it('preferClassicWebGL builds the classic adapter DIRECTLY (no WebGPURenderer / no TSL)', async () => {
    const handle = await RendererHandleFactory.create(fakeCanvas, /* forceWebGL */ true, /* preferClassicWebGL */ true);

    // Classic adapter constructed exactly once…
    expect(classicCtor).toHaveBeenCalledTimes(1);
    expect((handle as unknown as { __isClassicMock?: boolean }).__isClassicMock).toBe(true);
    // …and the WebGPURenderer(forceWebGL2) path was NEVER touched — so no TSL node-compile.
    expect(webgpuCreate).not.toHaveBeenCalled();
  });

  it('GUARDED FALLBACK: classic construction failure falls back to the WebGL2 (webgl-fallback) path', async () => {
    H.classicShouldThrow = true;

    const handle = await RendererHandleFactory.create(fakeCanvas, true, true);

    // Classic was ATTEMPTED first…
    expect(classicCtor).toHaveBeenCalledTimes(1);
    // …then the guarded fallback fired: WebGPURenderer(forceWebGL2) built the handle.
    expect(webgpuCreate).toHaveBeenCalledTimes(1);
    expect(webgpuCreate).toHaveBeenCalledWith(fakeCanvas, { forceWebGL2: true });
    expect((handle as unknown as { __isWebgpuMock?: boolean }).__isWebgpuMock).toBe(true);
  });

  it('plain forceWebGL (preferClassicWebGL=false) is UNCHANGED — uses the WebGL2 path, never the classic ctor', async () => {
    const handle = await RendererHandleFactory.create(fakeCanvas, true, false);

    expect(webgpuCreate).toHaveBeenCalledTimes(1);
    expect(webgpuCreate).toHaveBeenCalledWith(fakeCanvas, { forceWebGL2: true });
    // The classic adapter is NOT constructed on the plain forced-WebGL path (its WebGL2
    // path succeeded), so this stays exactly the pre-L372B 'webgl-fallback' behaviour.
    expect(classicCtor).not.toHaveBeenCalled();
    expect((handle as unknown as { __isWebgpuMock?: boolean }).__isWebgpuMock).toBe(true);
  });
});
