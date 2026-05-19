// S06-T9 — Dual-mode visual parity (renderer-mode contract test).
//
// Per `phases/PHASE-1A-Q1-M1-M3-SKELETON-RAILS.md` line 587:
//   "Dual-mode visual-diff parity (B): same scene, both modes
//    (WebGPU + WebGL2), diff < 2 px.  CI gate hard-fails > 2 px."
//
// The pixel-level diff requires a real GPU (see
// `apps/editor/__tests__/visual-fixtures/README.md`).  This test
// verifies the *renderer-mode contract* that makes the diff
// meaningful — that BOTH modes resolve through the same `Renderer`
// surface, BOTH expose the same scene/camera primitives, and BOTH
// can be force-fallen-back through ADR-007's gpuProvider override.
//
// The actual pixel comparison runs in `apps/bench/scripts/visual-diff.mjs`
// against fixtures captured on a GPU host.

import { describe, expect, it, vi, beforeEach } from 'vitest';

// THREE needs a real GL context; mock it to a stub like the renderer's
// own unit tests do (packages/renderer/__tests__/Renderer.test.ts).
vi.mock('three', async () => {
  const actual = await vi.importActual<typeof import('three')>('three');
  class FakeWebGLRenderer {
    info = { reset: () => {}, render: { calls: 0, triangles: 0, frame: 0, lines: 0, points: 0 } };
    autoClear = true;
    constructor(public params: unknown) {}
    setPixelRatio(): void {}
    setSize(): void {}
    setClearColor(): void {}
    render(): void {}
    dispose(): void {}
  }
  return { ...actual, WebGLRenderer: FakeWebGLRenderer };
});

import * as THREE from '@pryzm/renderer-three/three';
import { Renderer } from '@pryzm/renderer';

function fakeCanvas(): HTMLCanvasElement {
  return {
    width: 256,
    height: 256,
    getContext: () => ({}) as unknown,
  } as unknown as HTMLCanvasElement;
}

describe('S06-T9 — dual-mode renderer parity contract', () => {
  beforeEach(() => {
    delete (globalThis as { navigator?: unknown }).navigator;
  });

  it("'auto' falls back to webgl2 when WebGPU is unavailable", async () => {
    const r = await Renderer.init(fakeCanvas(), {
      mode: 'auto',
      gpuProvider: () => undefined,
    });
    expect(r.mode).toBe('webgl2');
    r.dispose();
  });

  it("'auto' resolves to webgpu when a GPU provider is supplied", async () => {
    const fakeGpu = { requestAdapter: vi.fn(async () => ({})) } as unknown as GPU;
    const r = await Renderer.init(fakeCanvas(), {
      mode: 'auto',
      gpuProvider: () => fakeGpu,
    });
    expect(r.mode).toBe('webgpu');
    r.dispose();
  });

  it('explicit webgl2 + explicit webgpu both expose the same surface', async () => {
    const fakeGpu = { requestAdapter: vi.fn(async () => ({})) } as unknown as GPU;
    const a = await Renderer.init(fakeCanvas(), { mode: 'webgl2' });
    const b = await Renderer.init(fakeCanvas(), {
      mode: 'webgpu',
      gpuProvider: () => fakeGpu,
    });
    expect(a.scene).toBeInstanceOf(THREE.Scene);
    expect(b.scene).toBeInstanceOf(THREE.Scene);
    expect(a.camera).toBeInstanceOf(THREE.PerspectiveCamera);
    expect(b.camera).toBeInstanceOf(THREE.PerspectiveCamera);
    expect(typeof a.render).toBe('function');
    expect(typeof b.render).toBe('function');
    a.dispose();
    b.dispose();
  });
});
