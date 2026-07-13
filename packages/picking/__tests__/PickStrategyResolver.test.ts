// PickStrategyResolver tests (S16-T1 sub-case, 3 cases per spec line 739).

import { describe, expect, it, vi } from 'vitest';
import * as THREE from '@pryzm/renderer-three/three';
import { resolvePickStrategy } from '../src/PickStrategyResolver.js';
import { encodeIndexToRGBA } from '../src/types.js';
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

/**
 * Fake GpuPickRenderer.
 *
 * NOTE (2026-07-13, G4 truth audit): `probeAvailability()` is no longer an
 * API-surface probe — since the CRITICAL-2 fix it RENDERS a slot-1 plane into a
 * 1×1 target and asserts the readback decodes back to slot 1 (that is how the
 * R1C-02 Mesa "readPixels silently returns all-zero" bug is detected). A fake
 * whose `readPixels` leaves the buffer at zero therefore models a BROKEN driver,
 * not a healthy one — which is why the 'ok' case had rotted to red while the
 * product was correct. A healthy driver must write the encoded slot back.
 *
 *   'ok'                → writes encodeIndexToRGBA(1) + a=255  → probe ok
 *   'zero-readback'     → leaves the buffer all-zero           → R1C-02 fallback
 *   'throws-on-readback'→ throws                               → error fallback
 */
function fakeRenderer(behaviour: 'ok' | 'zero-readback' | 'throws-on-readback'): GpuPickRenderer {
  return {
    width: 100,
    height: 100,
    renderToTarget() {},
    readPixels(_t, _x, _y, _w, _h, buf) {
      if (behaviour === 'throws-on-readback') {
        throw new Error('GL_INVALID_OPERATION (R1C-02 driver quirk)');
      }
      if (behaviour === 'ok') {
        // A healthy driver returns exactly what was rendered: slot 1.
        const [r, g, b] = encodeIndexToRGBA(1);
        buf[0] = r; buf[1] = g; buf[2] = b; buf[3] = 255;
      }
      // 'zero-readback' → leave the buffer untouched (all-zero): the Mesa bug.
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

  // G4 regression guard: gpu-pick is the ONLY strategy that implements
  // §SELECT-EXACT-PIXEL-FIRST. If the probe ever silently resolves to bvh-pick on
  // a healthy renderer, the exact-pixel selection fix is dead in production with no
  // other symptom — so the healthy-driver path must stay pinned.
  it('falls back to bvh-pick on the R1C-02 all-zero readback (broken driver)', () => {
    const ctx = buildCtx({ renderer: fakeRenderer('zero-readback'), scene: new THREE.Scene() });
    expect(resolvePickStrategy(ctx).id).toBe('bvh-pick');
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
