// §L-372 Batch 2 / L-382 — the heavy-generation proactive swap must target the
// CLASSIC renderer ('webgl-classic' → backend 'webgl-only'), NOT the plain 'webgl'
// (WebGPURenderer forceWebGL2, which still node-compiles shaders via TSL and
// re-triggers "Compiling GPU shaders" per sub-batch + during navigation, the L-382
// symptom). This pins that the proactive/reactive entry points fire
// window.pryzmSwapRendererBackend('webgl-classic').
//
// createRenderer is mocked so this test needs no THREE / GL context — only the
// getRendererBackendPreference gate value matters here.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Gate 1 reads the persisted preference — return a non-'webgl' value ('auto') so the
// swap is allowed to proceed (an explicit 'webgl' pick short-circuits by design).
vi.mock('../src/rendering/createRenderer', () => ({
  getRendererBackendPreference: () => 'auto',
}));

interface TestGlobals {
  __pryzmAutoSwappedToWebGL?: boolean;
  bimManager?: unknown;
  renderPipelineManager?: unknown;
  pryzmSwapRendererBackend?: (pref: string) => Promise<boolean>;
}
function G(): TestGlobals {
  return globalThis as unknown as TestGlobals;
}

describe('autoWebGLHeavyScene §L-372B heavy-gen swap target', () => {
  let swapMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.resetModules();
    swapMock = vi.fn().mockResolvedValue(true);
    // Fresh once-per-session guard.
    delete G().__pryzmAutoSwappedToWebGL;
    // Gate 2 — real WebGPU backend active (there is a device to protect).
    G().renderPipelineManager = { status: { webGpuActive: true } };
    G().bimManager = { getLevels: () => [{}, {}] };
    // The live-swap entry point.
    G().pryzmSwapRendererBackend = swapMock as unknown as (p: string) => Promise<boolean>;
  });

  afterEach(() => {
    delete G().__pryzmAutoSwappedToWebGL;
    delete G().renderPipelineManager;
    delete G().bimManager;
    delete G().pryzmSwapRendererBackend;
  });

  it('proactive building-generation swap fires swap("webgl-classic") — the classic webgl-only target', async () => {
    const mod = await import('../src/rendering/autoWebGLHeavyScene');
    mod.proactivelySwitchToWebGLForBuildingGeneration('office-generation-start');

    expect(swapMock).toHaveBeenCalledTimes(1);
    expect(swapMock).toHaveBeenCalledWith('webgl-classic');
    // NOT the plain 'webgl' (WebGPURenderer forceWebGL2 / TSL) target.
    expect(swapMock).not.toHaveBeenCalledWith('webgl');
  });

  it('reactive heavy-scene swap also targets "webgl-classic"', async () => {
    const mod = await import('../src/rendering/autoWebGLHeavyScene');
    // A device-loss-risk scene: ≥ 400 top-level BIM element roots trips Gate 3.
    const children = Array.from({ length: 420 }, (_, i) => ({ userData: { id: `e${i}` } }));
    mod.maybeAutoSwitchToWebGLForHeavyScene({ children }, 'tier:add:bim-wall-added');

    expect(swapMock).toHaveBeenCalledTimes(1);
    expect(swapMock).toHaveBeenCalledWith('webgl-classic');
  });

  it('once-per-session guard: a second call does not double-fire', async () => {
    const mod = await import('../src/rendering/autoWebGLHeavyScene');
    mod.proactivelySwitchToWebGLForBuildingGeneration('first');
    mod.proactivelySwitchToWebGLForBuildingGeneration('second');
    expect(swapMock).toHaveBeenCalledTimes(1);
  });
});
