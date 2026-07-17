// §L-372 Batch 2 (+ follow-up) / L-382 — the heavy-generation swap must target the
// CLASSIC renderer ('webgl-classic' → backend 'webgl-only'), NOT the plain 'webgl'
// (WebGPURenderer forceWebGL2, which still node-compiles shaders via TSL and re-triggers
// "Compiling GPU shaders" per sub-batch + during navigation, the L-382 symptom).
//
// The follow-up FIX: the swap must ALSO fire when the CURRENT backend is 'webgl-fallback'
// (the founder's box BOOTS there via a persisted 'webgl' pref and never had a real-WebGPU
// swap to trigger), not only from real 'webgpu'. It must be a no-op when already on
// 'webgl-only' (nothing to upgrade) or on a light scene.
//
// createRenderer is mocked so this test needs no THREE / GL context; the gating now keys
// off window.pryzmRendererBackend (the live backend), which we set per test.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Gate reads the persisted preference only for the explicit-WebGPU-pin warning wording; a
// mutable value lets us prove the founder's case (pref 'webgl' must NOT short-circuit).
const H = vi.hoisted(() => ({ pref: 'auto' as 'auto' | 'webgpu' | 'webgl' }));
vi.mock('../src/rendering/createRenderer', () => ({
  getRendererBackendPreference: () => H.pref,
}));

type Backend = 'webgpu' | 'webgl-fallback' | 'webgl-only';
interface TestGlobals {
  __pryzmAutoSwappedToWebGL?: boolean;
  bimManager?: unknown;
  pryzmRendererBackend?: Backend;
  pryzmSwapRendererBackend?: (pref: string) => Promise<boolean>;
}
function G(): TestGlobals {
  return globalThis as unknown as TestGlobals;
}

describe('autoWebGLHeavyScene §L-372B heavy-gen swap target', () => {
  let swapMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.resetModules();
    H.pref = 'auto';
    swapMock = vi.fn().mockResolvedValue(true);
    delete G().__pryzmAutoSwappedToWebGL;
    G().bimManager = { getLevels: () => [{}, {}] };
    G().pryzmSwapRendererBackend = swapMock as unknown as (p: string) => Promise<boolean>;
    // Default current backend: real WebGPU (the original device-loss-risk case).
    G().pryzmRendererBackend = 'webgpu';
  });

  afterEach(() => {
    delete G().__pryzmAutoSwappedToWebGL;
    delete G().bimManager;
    delete G().pryzmRendererBackend;
    delete G().pryzmSwapRendererBackend;
  });

  it('proactive swap on real WebGPU fires swap("webgl-classic") — the classic webgl-only target', async () => {
    const mod = await import('../src/rendering/autoWebGLHeavyScene');
    mod.proactivelySwitchToWebGLForBuildingGeneration('office-generation-start');

    expect(swapMock).toHaveBeenCalledTimes(1);
    expect(swapMock).toHaveBeenCalledWith('webgl-classic');
    expect(swapMock).not.toHaveBeenCalledWith('webgl');
  });

  it('FOLLOW-UP: heavy gen while ON webgl-fallback ALSO upgrades to classic (the founder\'s box)', async () => {
    // The founder's box: persisted pref 'webgl' → booted straight into webgl-fallback,
    // which STILL TSL-compiles. Neither the old real-WebGPU gate nor the old
    // pref==='webgl' short-circuit may block this upgrade.
    H.pref = 'webgl';
    G().pryzmRendererBackend = 'webgl-fallback';
    const mod = await import('../src/rendering/autoWebGLHeavyScene');
    mod.proactivelySwitchToWebGLForBuildingGeneration('resi-generation-start');

    expect(swapMock).toHaveBeenCalledTimes(1);
    expect(swapMock).toHaveBeenCalledWith('webgl-classic');
  });

  it('reactive heavy scene on webgl-fallback also upgrades to classic', async () => {
    H.pref = 'webgl';
    G().pryzmRendererBackend = 'webgl-fallback';
    const mod = await import('../src/rendering/autoWebGLHeavyScene');
    const children = Array.from({ length: 420 }, (_, i) => ({ userData: { id: `e${i}` } }));
    mod.maybeAutoSwitchToWebGLForHeavyScene({ children }, 'tier:add:bim-wall-added');

    expect(swapMock).toHaveBeenCalledTimes(1);
    expect(swapMock).toHaveBeenCalledWith('webgl-classic');
  });

  it('NO-OP when already on webgl-only (nothing to upgrade)', async () => {
    G().pryzmRendererBackend = 'webgl-only';
    const mod = await import('../src/rendering/autoWebGLHeavyScene');
    mod.proactivelySwitchToWebGLForBuildingGeneration('gen-start');
    expect(swapMock).not.toHaveBeenCalled();
  });

  it('NO-OP for a LIGHT scene on webgl-fallback (reactive gate 3 not tripped)', async () => {
    G().pryzmRendererBackend = 'webgl-fallback';
    const mod = await import('../src/rendering/autoWebGLHeavyScene');
    // Well under the ≥ 400-element / ≥ 1000-mesh swap threshold → a manual edit, not a build.
    const children = Array.from({ length: 20 }, (_, i) => ({ userData: { id: `e${i}` } }));
    mod.maybeAutoSwitchToWebGLForHeavyScene({ children }, 'tier:add:single-edit');
    expect(swapMock).not.toHaveBeenCalled();
  });

  it('NO-OP when the backend is not yet resolved (undefined)', async () => {
    delete G().pryzmRendererBackend;
    const mod = await import('../src/rendering/autoWebGLHeavyScene');
    mod.proactivelySwitchToWebGLForBuildingGeneration('gen-start-early');
    expect(swapMock).not.toHaveBeenCalled();
  });

  it('once-per-session guard: a second call does not double-fire', async () => {
    const mod = await import('../src/rendering/autoWebGLHeavyScene');
    mod.proactivelySwitchToWebGLForBuildingGeneration('first');
    mod.proactivelySwitchToWebGLForBuildingGeneration('second');
    expect(swapMock).toHaveBeenCalledTimes(1);
  });
});
