/**
 * §FIX-POSTFX-WEBGPU (L-111) — backend-aware post-processing routing specs.
 *
 * Asserts the Ambient Occlusion toggle reaches the WebGPU (TSL SSGI-AO) path when
 * the RenderPipelineManager reports a live WebGPU backend, and falls back to the
 * OBC/WebGL aoPass otherwise — plus that exposure is written to every live
 * renderer (so the WebGPU surface that is actually painting picks it up).
 */

import { describe, it, expect, vi } from 'vitest';
import {
  applyAmbientOcclusion,
  applyExposure,
  type SsgiPipelineLike,
} from '../postFxRouting';

describe('§FIX-POSTFX-WEBGPU applyAmbientOcclusion', () => {
  it('routes AO ENABLE to the WebGPU SSGI-AO pass when webGpuActive', () => {
    const activateSSGI = vi.fn(() => Promise.resolve());
    const deactivateSSGI = vi.fn(() => Promise.resolve());
    const rpm: SsgiPipelineLike = {
      status: { webGpuActive: true },
      activateSSGI,
      deactivateSSGI,
    };
    const obcApply = vi.fn();

    const result = applyAmbientOcclusion(rpm, obcApply, true);

    expect(result).toEqual({ route: 'webgpu', enabled: true });
    expect(activateSSGI).toHaveBeenCalledTimes(1);
    expect(deactivateSSGI).not.toHaveBeenCalled();
    // WebGPU path must NOT touch the OBC aoPass fallback.
    expect(obcApply).not.toHaveBeenCalled();
  });

  it('routes AO DISABLE to deactivateSSGI on the WebGPU backend', () => {
    const activateSSGI = vi.fn(() => Promise.resolve());
    const deactivateSSGI = vi.fn(() => Promise.resolve());
    const rpm: SsgiPipelineLike = {
      status: { webGpuActive: true },
      activateSSGI,
      deactivateSSGI,
    };
    const obcApply = vi.fn();

    const result = applyAmbientOcclusion(rpm, obcApply, false);

    expect(result.route).toBe('webgpu');
    expect(deactivateSSGI).toHaveBeenCalledTimes(1);
    expect(activateSSGI).not.toHaveBeenCalled();
    expect(obcApply).not.toHaveBeenCalled();
  });

  it('falls back to the OBC aoPass when the backend is WebGL (no webGpuActive)', () => {
    const activateSSGI = vi.fn(() => Promise.resolve());
    const rpm: SsgiPipelineLike = {
      status: { webGpuActive: false },
      activateSSGI,
    };
    const obcApply = vi.fn();

    const result = applyAmbientOcclusion(rpm, obcApply, true);

    expect(result).toEqual({ route: 'webgl', enabled: true });
    expect(obcApply).toHaveBeenCalledWith(true);
    expect(activateSSGI).not.toHaveBeenCalled();
  });

  it('falls back to the OBC aoPass when the RPM is absent (pipeline not bound)', () => {
    const obcApply = vi.fn();
    const result = applyAmbientOcclusion(undefined, obcApply, false);
    expect(result.route).toBe('webgl');
    expect(obcApply).toHaveBeenCalledWith(false);
  });

  it('does not throw when the WebGPU SSGI promise rejects', () => {
    const rpm: SsgiPipelineLike = {
      status: { webGpuActive: true },
      // Rejected promise must be swallowed by the router.
      activateSSGI: () => Promise.reject(new Error('boom')),
    };
    expect(() => applyAmbientOcclusion(rpm, vi.fn(), true)).not.toThrow();
  });
});

describe('§FIX-POSTFX-WEBGPU applyExposure', () => {
  it('writes exposure + tone mapping to every live renderer (OBC + WebGPU)', () => {
    const TONE = 4; // stand-in for THREE.ACESFilmicToneMapping enum value
    const obc = { toneMapping: 0, toneMappingExposure: 0.9 };
    const webgpu = { toneMapping: 0, toneMappingExposure: 0.9 };

    const result = applyExposure([obc, webgpu], 1.8, TONE);

    expect(result.applied).toBe(2);
    expect(obc.toneMappingExposure).toBe(1.8);
    expect(webgpu.toneMappingExposure).toBe(1.8);
    expect(obc.toneMapping).toBe(TONE);
    expect(webgpu.toneMapping).toBe(TONE);
  });

  it('skips null/undefined renderers and counts only those applied', () => {
    const webgpu = { toneMapping: 0, toneMappingExposure: 0.9 };
    const result = applyExposure([null, undefined, webgpu], 2.5, 4);
    expect(result.applied).toBe(1);
    expect(webgpu.toneMappingExposure).toBe(2.5);
  });
});
