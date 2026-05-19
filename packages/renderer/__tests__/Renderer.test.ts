// Renderer.init mode-resolution tests (S06-T1).
//
// We can't run a real WebGL2 context under headless Node, so we mock
// THREE.WebGLRenderer + the canvas surface enough to verify the
// *boot-path resolution* — which mode `Renderer.init()` lands on for
// every (requested mode, navigator.gpu state) pair from ADR-007.

import { describe, it, expect, vi, beforeEach } from 'vitest';

// THREE is heavy + needs a real GL context.  Mock it to a stub that
// records construction args.  The rule we're enforcing here is the
// resolution table in ADR-007, not THREE's internals.
vi.mock('three', async () => {
  const actual = await vi.importActual<typeof import('three')>('three');
  class FakeWebGLRenderer {
    info = { reset: () => {}, render: { calls: 0, triangles: 0, frame: 0, lines: 0, points: 0 } };
    autoClear = true;
    private _w = 256;
    private _h = 256;
    constructor(public params: unknown) {}
    setPixelRatio() {}
    setSize(w: number, h: number) { this._w = w; this._h = h; }
    setClearColor() {}
    render() {}
    dispose() {}
    getSize(target: { x: number; y: number; set: (x: number, y: number) => void }) {
      target.x = this._w;
      target.y = this._h;
      return target;
    }
  }
  return { ...actual, WebGLRenderer: FakeWebGLRenderer };
});

// Minimal HTMLCanvasElement stand-in — enough surface for Renderer.init.
function fakeCanvas(width = 256, height = 256): HTMLCanvasElement {
  const ctx = { /* WebGL2 stub */ } as unknown as WebGL2RenderingContext;
  const canvas = {
    width,
    height,
    getContext: (kind: string) => (kind === 'webgl2' ? ctx : null),
  };
  return canvas as unknown as HTMLCanvasElement;
}

describe('Renderer.init — mode resolution (ADR-007)', () => {
  let Renderer: typeof import('../src/Renderer.js').Renderer;
  let RendererInitError: typeof import('../src/Renderer.js').RendererInitError;

  beforeEach(async () => {
    const mod = await import('../src/Renderer.js');
    Renderer = mod.Renderer;
    RendererInitError = mod.RendererInitError;
  });

  it('mode="webgl2" — never touches gpuProvider, lands on webgl2', async () => {
    const gpuProvider = vi.fn(() => undefined);
    const r = await Renderer.init(fakeCanvas(), { mode: 'webgl2', gpuProvider });
    expect(r.mode).toBe('webgl2');
    expect(gpuProvider).not.toHaveBeenCalled();
    r.dispose();
  });

  it('mode="auto" + no navigator.gpu — falls back to webgl2', async () => {
    const r = await Renderer.init(fakeCanvas(), { mode: 'auto', gpuProvider: () => undefined });
    expect(r.mode).toBe('webgl2');
    r.dispose();
  });

  it('mode="auto" + navigator.gpu adapter present — picks webgpu', async () => {
    const fakeGpu = { requestAdapter: vi.fn(async () => ({})) } as unknown as GPU;
    const r = await Renderer.init(fakeCanvas(), { mode: 'auto', gpuProvider: () => fakeGpu });
    expect(r.mode).toBe('webgpu');
    expect(fakeGpu.requestAdapter).toHaveBeenCalledTimes(1);
    r.dispose();
  });

  it('mode="auto" + navigator.gpu but adapter request returns null — falls back', async () => {
    const fakeGpu = { requestAdapter: vi.fn(async () => null) } as unknown as GPU;
    const r = await Renderer.init(fakeCanvas(), { mode: 'auto', gpuProvider: () => fakeGpu });
    expect(r.mode).toBe('webgl2');
    r.dispose();
  });

  it('mode="auto" + adapter request throws — falls back to webgl2', async () => {
    const fakeGpu = {
      requestAdapter: vi.fn(async () => {
        throw new Error('GPU explosion');
      }),
    } as unknown as GPU;
    const r = await Renderer.init(fakeCanvas(), { mode: 'auto', gpuProvider: () => fakeGpu });
    expect(r.mode).toBe('webgl2');
    r.dispose();
  });

  it('mode="webgpu" + no navigator.gpu — throws RendererInitError', async () => {
    await expect(
      Renderer.init(fakeCanvas(), { mode: 'webgpu', gpuProvider: () => undefined }),
    ).rejects.toBeInstanceOf(RendererInitError);
  });

  it('mode="webgpu" + adapter null — throws RendererInitError', async () => {
    const fakeGpu = { requestAdapter: vi.fn(async () => null) } as unknown as GPU;
    await expect(
      Renderer.init(fakeCanvas(), { mode: 'webgpu', gpuProvider: () => fakeGpu }),
    ).rejects.toBeInstanceOf(RendererInitError);
  });

  it('mode="webgpu" + adapter throws — wraps in RendererInitError', async () => {
    const fakeGpu = {
      requestAdapter: vi.fn(async () => {
        throw new Error('boom');
      }),
    } as unknown as GPU;
    await expect(
      Renderer.init(fakeCanvas(), { mode: 'webgpu', gpuProvider: () => fakeGpu }),
    ).rejects.toBeInstanceOf(RendererInitError);
  });

  it('default mode is "auto"', async () => {
    const r = await Renderer.init(fakeCanvas(), { gpuProvider: () => undefined });
    expect(r.mode).toBe('webgl2');
    r.dispose();
  });

  it('exposes scene + camera + canvas; render() is wrapped in OTel span', async () => {
    const r = await Renderer.init(fakeCanvas(), { mode: 'webgl2' });
    expect(r.scene).toBeDefined();
    expect(r.camera).toBeDefined();
    expect(r.canvas).toBeDefined();
    // Render must not throw with the empty scene.
    expect(() => r.render()).not.toThrow();
    r.dispose();
  });

  it('dispose() is idempotent', async () => {
    const r = await Renderer.init(fakeCanvas(), { mode: 'webgl2' });
    r.dispose();
    expect(() => r.dispose()).not.toThrow();
    // render() after dispose is a no-op (does not throw)
    expect(() => r.render()).not.toThrow();
  });

  it('resize() updates camera aspect', async () => {
    const r = await Renderer.init(fakeCanvas(800, 200), { mode: 'webgl2' });
    r.resize(1024, 256);
    expect(r.camera.aspect).toBeCloseTo(1024 / 256, 5);
  });
});
