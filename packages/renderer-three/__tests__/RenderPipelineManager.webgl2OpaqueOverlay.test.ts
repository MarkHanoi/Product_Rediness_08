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
//
// ── AMENDED 2026-08-19 · §VIEWPORT-BG-ONE-AUTHORITY-RUNTIME (L-1148) ──────────────
// These assertions used to read `__clears[0]` and `__clears.length === 3`, i.e. they
// pinned the ARRAY INDEX of the frame clear. `bind()` now emits ONE additional,
// deliberate clear when it resolves a WebGL backend — priming the overlay opaque the
// moment the backend is known instead of leaving initScene's WebGPU-shaped transparent
// prime in place until the first lightweight frame reaches `render()`. That is the
// L-1148 fix, not a regression, so the assertions are re-pointed at the INVARIANTS
// rather than the offsets: (1) EVERY recorded clear is opaque — the alpha-0 bleed
// channel is closed everywhere, bind included; (2) the clear that immediately precedes
// each paint carries the expected theme colour; (3) each frame still clears exactly
// once. Index-free, so a future prime cannot break them again while the tooth sharpens:
// (1) now covers strictly more clears than the version it replaces.

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

/**
 * The clear that painted the most recent frame. `bind()`'s own prime and each frame's
 * clear are all appended in order, so the LAST entry is always the one the viewer sees
 * — index-free, and immune to a future prime being added ahead of it
 * (§VIEWPORT-BG-ONE-AUTHORITY-RUNTIME, L-1148).
 */
function lastClear(renderer: any): { hex: number; alpha: number; atRender: number } {
  return renderer.__clears[renderer.__clears.length - 1];
}

/** `bind()` emits exactly ONE opaque prime on a WebGL backend before any frame runs. */
const BIND_PRIME_CLEARS = 1;

/** Every clear ever issued must be opaque — the alpha-0 bleed channel is closed. */
function everyClearOpaque(renderer: any): boolean {
  return renderer.__clears.length > 0
      && renderer.__clears.every((c: any) => c.alpha === 1);
}

describe('RenderPipelineManager — WebGL2 opaque overlay (§FIX-WEBGL2-GHOST-ON-ROTATE-INCOMPLETE, L-317)', () => {
  it('clears the overlay OPAQUE (alpha 1) to the LIGHT theme colour before painting', async () => {
    const renderer = recordingWebGl2Renderer();
    const rpm = new RenderPipelineManager();
    await rpm.bind(scene, camera, renderer, 'light');
    rpm.setLightweightWebGlRender(true);

    rpm.render(0.016);

    // One opaque clear to white per frame, issued BEFORE the paint (atRender 0), plus
    // bind()'s own prime — and NOTHING transparent anywhere.
    const whiteHex = new (await import('../src/three-re-export.js')).Color(LIGHT_BG_HEX).getHex();
    expect(renderer.__clears.length).toBe(BIND_PRIME_CLEARS + 1);
    expect(everyClearOpaque(renderer)).toBe(true);
    expect(lastClear(renderer)).toEqual({ hex: whiteHex, alpha: 1, atRender: 0 });
  });

  it('uses the DARK theme colour when bound dark (opaque, never transparent)', async () => {
    const renderer = recordingWebGl2Renderer();
    const rpm = new RenderPipelineManager();
    await rpm.bind(scene, camera, renderer, 'dark');
    rpm.setLightweightWebGlRender(true);

    rpm.render(0.016);

    const darkHex = new (await import('../src/three-re-export.js')).Color(DARK_BG_HEX).getHex();
    expect(renderer.__clears.length).toBe(BIND_PRIME_CLEARS + 1);
    expect(lastClear(renderer).hex).toBe(darkHex);
    expect(everyClearOpaque(renderer)).toBe(true); // the tooth: NEVER 0 (transparent) again
  });

  it('follows a theme change via setTheme()', async () => {
    const renderer = recordingWebGl2Renderer();
    const rpm = new RenderPipelineManager();
    await rpm.bind(scene, camera, renderer, 'light');
    rpm.setLightweightWebGlRender(true);
    rpm.setTheme('dark');

    rpm.render(0.016);

    const darkHex = new (await import('../src/three-re-export.js')).Color(DARK_BG_HEX).getHex();
    expect(lastClear(renderer).hex).toBe(darkHex);
    expect(everyClearOpaque(renderer)).toBe(true);
  });

  it('follows a custom scene-background colour via setColor()', async () => {
    const renderer = recordingWebGl2Renderer();
    const rpm = new RenderPipelineManager();
    await rpm.bind(scene, camera, renderer, 'light');
    rpm.setLightweightWebGlRender(true);
    rpm.setColor('#6600ff'); // brand purple

    rpm.render(0.016);

    expect(lastClear(renderer).hex).toBe(0x6600ff);
    expect(everyClearOpaque(renderer)).toBe(true);
  });

  it('every lightweight frame re-asserts the opaque clear (no frame can go transparent)', async () => {
    const renderer = recordingWebGl2Renderer();
    const rpm = new RenderPipelineManager();
    await rpm.bind(scene, camera, renderer, 'light');
    rpm.setLightweightWebGlRender(true);

    rpm.render(0.016);
    rpm.render(0.016);
    rpm.render(0.016);

    // Three frames → three frame clears, each one opaque, plus bind()'s prime.
    expect(renderer.__clears.length).toBe(BIND_PRIME_CLEARS + 3);
    expect(everyClearOpaque(renderer)).toBe(true);
  });
});
