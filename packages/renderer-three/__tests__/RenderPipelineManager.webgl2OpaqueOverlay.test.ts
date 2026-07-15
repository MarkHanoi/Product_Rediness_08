// §FIX-WEBGL2-GHOST-ON-ROTATE-INCOMPLETE (L-317) — WebGL2 doubled/offset geometry
// on navigation.
//
// PROD EVIDENCE (founder): on the WebGL2 (webgl-fallback) backend, rotating the 3D
// model shows DOUBLED walls / a roof offset from the walls, which "settles once
// motion stops". Root: the PRYZM overlay canvas cleared to TRANSPARENT
// (setClearAlpha(0)) so the silenced-but-frozen OBC base canvas underneath
// re-composited its last frame through the overlay's transparent background pixels
// — two copies of the same geometry at two camera states. The per-frame OBC base
// clear did not reliably prevent it.
//
// FIX: render the WebGL2 lightweight overlay OPAQUE — clear to the theme background
// colour with alpha 1 — so the overlay is the SOLE visible surface and the base can
// never bleed through. Native-WebGPU (TSL) path is untouched.
//
// TOOTH: the OLD path cleared transparent (alpha 0 → base bleeds through); the fix
// clears OPAQUE (alpha 1) to the theme colour on every lightweight frame, BEFORE the
// overlay paints.

import { describe, expect, it } from 'vitest';
import { RenderPipelineManager } from '../src/pipeline/RenderPipelineManager.js';
import { LIGHT_BG_HEX, DARK_BG_HEX } from '../src/pipeline/BackgroundUniform.js';

/** WebGL2 renderer that records setClearColor(color, alpha) + render() order. */
function recordingWebGl2Renderer(): any {
  const clears: Array<{ hex: number; alpha: number; atRender: number }> = [];
  let renderCount = 0;
  return {
    isWebGPURenderer: true,
    backend: { isWebGPUBackend: false }, // forced-WebGL → WebGL2 backend
    autoClear: true, autoClearColor: true, autoClearDepth: true,
    getRenderTarget: () => null,
    setRenderTarget: () => {},
    setClearAlpha: () => {},
    setClearColor: (color: any, alpha: number) => {
      clears.push({ hex: color?.getHex?.() ?? -1, alpha, atRender: renderCount });
    },
    render: () => { renderCount++; },
    __clears: clears,
  };
}

const scene = {} as any;
const camera = {} as any;

describe('RenderPipelineManager — WebGL2 opaque overlay (§FIX-WEBGL2-GHOST-ON-ROTATE-INCOMPLETE, L-317)', () => {
  it('clears the overlay OPAQUE (alpha 1) to the LIGHT theme colour before painting', async () => {
    const renderer = recordingWebGl2Renderer();
    const rpm = new RenderPipelineManager();
    await rpm.bind(scene, camera, renderer, 'light');
    rpm.setLightweightWebGlRender(true);

    rpm.render(0.016);

    // Exactly one opaque clear to white, and it happened BEFORE the paint (atRender 0).
    expect(renderer.__clears).toEqual([
      { hex: new (await import('../src/three-re-export.js')).Color(LIGHT_BG_HEX).getHex(), alpha: 1, atRender: 0 },
    ]);
  });

  it('uses the DARK theme colour when bound dark (opaque, never transparent)', async () => {
    const renderer = recordingWebGl2Renderer();
    const rpm = new RenderPipelineManager();
    await rpm.bind(scene, camera, renderer, 'dark');
    rpm.setLightweightWebGlRender(true);

    rpm.render(0.016);

    const darkHex = new (await import('../src/three-re-export.js')).Color(DARK_BG_HEX).getHex();
    expect(renderer.__clears.length).toBe(1);
    expect(renderer.__clears[0].hex).toBe(darkHex);
    expect(renderer.__clears[0].alpha).toBe(1); // the tooth: NEVER 0 (transparent) again
  });

  it('follows a theme change via setTheme()', async () => {
    const renderer = recordingWebGl2Renderer();
    const rpm = new RenderPipelineManager();
    await rpm.bind(scene, camera, renderer, 'light');
    rpm.setLightweightWebGlRender(true);
    rpm.setTheme('dark');

    rpm.render(0.016);

    const darkHex = new (await import('../src/three-re-export.js')).Color(DARK_BG_HEX).getHex();
    expect(renderer.__clears[0].hex).toBe(darkHex);
    expect(renderer.__clears[0].alpha).toBe(1);
  });

  it('follows a custom scene-background colour via setColor()', async () => {
    const renderer = recordingWebGl2Renderer();
    const rpm = new RenderPipelineManager();
    await rpm.bind(scene, camera, renderer, 'light');
    rpm.setLightweightWebGlRender(true);
    rpm.setColor('#6600ff'); // brand purple

    rpm.render(0.016);

    expect(renderer.__clears[0].hex).toBe(0x6600ff);
    expect(renderer.__clears[0].alpha).toBe(1);
  });

  it('every lightweight frame re-asserts the opaque clear (no frame can go transparent)', async () => {
    const renderer = recordingWebGl2Renderer();
    const rpm = new RenderPipelineManager();
    await rpm.bind(scene, camera, renderer, 'light');
    rpm.setLightweightWebGlRender(true);

    rpm.render(0.016);
    rpm.render(0.016);
    rpm.render(0.016);

    expect(renderer.__clears.length).toBe(3);
    expect(renderer.__clears.every((c: any) => c.alpha === 1)).toBe(true);
  });
});
