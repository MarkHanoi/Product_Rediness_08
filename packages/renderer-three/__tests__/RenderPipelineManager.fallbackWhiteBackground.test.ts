// §L-326 SS-FIX-WEBGL-FALLBACK-WHITE-BACKGROUND — grey viewport on the WebGL2 fallback.
//
// PROD EVIDENCE (founder): after the office/residential batch tripped the device-loss
// cascade (L-312 / L-324 family) into the WebGL2 fallback backend (GPU bar: webgl-fallback),
// the viewport background reads GREY. The white background is painted only by the WebGPU-TSL
// bgUniform; on the fallback the TSL pipeline does not run. The opaque white fill lives on the
// lightweight per-frame render path (render():636 setClearColor(_lightweightBgColor, 1)), but
// recoverPipeline() — the device-loss recovery entry — returned on the non-WebGPU branch WITHOUT
// enabling that path, so the fallback renderer kept the transparent clear and the grey container
// showed through.
//
// FIX: recoverPipeline(), when it lands on a non-WebGPU (WebGL2 fallback) backend, enables the
// lightweight WebGL render so the opaque theme-bg clear paints — mirroring the boot-time wiring.
//
// TOOTH: recovering into a WebGL2-backend renderer leaves isLightweightWebGlActive === true
// (so render() will paint the opaque theme background); recovering into a real WebGPU backend
// does NOT (the TSL pipeline owns the paint).

import { describe, expect, it } from 'vitest';
import { RenderPipelineManager } from '../src/pipeline/RenderPipelineManager.js';
import { LIGHT_BG_HEX } from '../src/pipeline/BackgroundUniform.js';

const scene = {} as any;
const camera = {} as any;

/** Fake WebGL2-backend renderer (forced-WebGL / device-loss safe-mode landing). */
function webgl2FallbackRenderer(): any {
  const clears: Array<{ hex: number; alpha: number }> = [];
  return {
    isWebGPURenderer: true,
    backend: { isWebGPUBackend: false }, // WebGL2 backend — TSL does NOT run
    autoClear: true, autoClearColor: true, autoClearDepth: true,
    getRenderTarget: () => null,
    setRenderTarget: () => {},
    setClearAlpha: () => {},
    setClearColor: (color: any, alpha: number) => { clears.push({ hex: color?.getHex?.() ?? -1, alpha }); },
    getDrawingBufferSize: (t: any) => { if (t?.set) { t.set(1280, 720); return t; } return { x: 1280, y: 720 }; },
    getSize: (t: any) => { if (t?.set) { t.set(1280, 720); return t; } return { x: 1280, y: 720 }; },
    render: () => {},
    __clears: clears,
  };
}

describe('RenderPipelineManager — WebGL2 fallback white background (§L-326)', () => {
  it('recoverPipeline into a WebGL2 fallback enables the lightweight opaque render path (the fix)', async () => {
    const renderer = webgl2FallbackRenderer();
    const rpm = new RenderPipelineManager();

    await rpm.recoverPipeline(scene, camera, renderer, /* backendIsWebGPU */ false);

    // The fallback now drives the opaque per-frame paint — no more grey transparent clear.
    expect(rpm.isLightweightWebGlActive).toBe(true);
  });

  it('after recovery, the very first frame clears OPAQUE (alpha 1) to the white theme colour', async () => {
    const renderer = webgl2FallbackRenderer();
    const rpm = new RenderPipelineManager();

    await rpm.recoverPipeline(scene, camera, renderer, false);
    rpm.render(0.016);

    const whiteHex = new (await import('../src/three-re-export.js')).Color(LIGHT_BG_HEX).getHex();
    expect(renderer.__clears.length).toBeGreaterThanOrEqual(1);
    const bgClear = renderer.__clears[renderer.__clears.length - 1];
    expect(bgClear.hex).toBe(whiteHex);
    expect(bgClear.alpha).toBe(1); // opaque — the grey container can never show through
  });

  it('recoverPipeline into a real WebGPU backend does NOT enable the lightweight path', async () => {
    const renderer: any = {
      isWebGPURenderer: true,
      backend: { isWebGPUBackend: true },
      setClearAlpha: () => {},
      getDrawingBufferSize: (t: any) => { if (t?.set) { t.set(1280, 720); return t; } return { x: 1280, y: 720 }; },
      getSize: (t: any) => { if (t?.set) { t.set(1280, 720); return t; } return { x: 1280, y: 720 }; },
    };
    const rpm = new RenderPipelineManager();

    // Real WebGPU: bind() attempts the TSL pipeline. It may fail to load TSL in the test
    // env, but the lightweight WebGL path must NOT be switched on regardless.
    await rpm.recoverPipeline(scene, camera, renderer, true).catch(() => { /* TSL load may fail in node */ });

    expect(rpm.isLightweightWebGlActive).toBe(false);
  });
});
