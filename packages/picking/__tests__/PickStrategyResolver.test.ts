// PickStrategyResolver tests (S16-T1 sub-case, 3 cases per spec line 739).

import { describe, expect, it, vi } from 'vitest';
import * as THREE from '@pryzm/renderer-three/three';
import { resolvePickStrategy } from '../src/PickStrategyResolver.js';
import type { ElementRegistry, GpuPickRenderer, PickContext } from '../src/types.js';

function buildCtx(opts: { renderer?: GpuPickRenderer; scene?: THREE.Scene } = {}): PickContext {
  const registry: ElementRegistry = {
    kindOf: () => null,
    ids: () => [],
    objectFor: () => null,
  };
  return {
    camera: new THREE.PerspectiveCamera(60, 1, 0.1, 100),
    elementRegistry: registry,
    viewportWidth: 100,
    viewportHeight: 100,
    scene: opts.scene,
    renderer: opts.renderer,
  };
}

function fakeRenderer(behaviour: 'ok' | 'throws-on-readback'): GpuPickRenderer {
  return {
    width: 100,
    height: 100,
    renderToTarget() {},
    readPixels(_t, _x, _y, _w, _h, _buf) {
      if (behaviour === 'throws-on-readback') {
        throw new Error('GL_INVALID_OPERATION (R1C-02 driver quirk)');
      }
    },
    createRenderTarget(w, h) {
      return { width: w, height: h } as unknown as THREE.WebGLRenderTarget;
    },
  };
}

describe('PickStrategyResolver (S16-T1)', () => {
  it('resolves gpu-pick when probe succeeds', () => {
    const ctx = buildCtx({ renderer: fakeRenderer('ok'), scene: new THREE.Scene() });
    const strategy = resolvePickStrategy(ctx);
    expect(strategy.id).toBe('gpu-pick');
  });

  it('falls back to bvh-pick when gpu-pick probe throws', () => {
    const ctx = buildCtx({
      renderer: fakeRenderer('throws-on-readback'),
      scene: new THREE.Scene(),
    });
    const strategy = resolvePickStrategy(ctx);
    expect(strategy.id).toBe('bvh-pick');
  });

  it('falls back when scene/renderer is missing from context', () => {
    const ctx = buildCtx(); // no renderer → probe returns ok=false
    const strategy = resolvePickStrategy(ctx);
    expect(strategy.id).toBe('bvh-pick');
  });

  it('honours forceFallback regardless of renderer availability', () => {
    const ctx = buildCtx({ renderer: fakeRenderer('ok'), scene: new THREE.Scene() });
    const strategy = resolvePickStrategy(ctx, { forceFallback: true });
    expect(strategy.id).toBe('bvh-pick');
  });
});
