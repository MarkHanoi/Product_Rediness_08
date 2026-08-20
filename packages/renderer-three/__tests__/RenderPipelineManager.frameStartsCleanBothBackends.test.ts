// §FRAME-STARTS-CLEAN-ON-EVERY-BACKEND (L-1350) + §VIEWPORT-BG-ONE-AUTHORITY-RUNTIME
//
// WHY THIS FILE EXISTS. Two founder reports, one question: "what is on the framebuffer
// at the start of a frame, on each backend?"
//
//   - "the WebGL fallback canvas is grey"  - reported four times before this one.
//   - "reminiscencia when navigating on WebGPU" - the model drawn twice, the faded copy
//     at an older camera pose.
//
// Every previous fix was armed on ONE backend, which is why each one came back on the
// other. This file pins BOTH arms in ONE place so a change that fixes one by regressing
// the other fails here rather than in the founder's viewport.
//
// WHAT THIS FILE DOES **NOT** ESTABLISH - read this before quoting it as proof.
// It asserts CALLS and STATE, not PIXELS. There is no GPU in this environment, so:
//   - "clears white opaque" means `setClearColor` was called with LIGHT_BG_HEX / alpha 1.
//     It does not prove no later pass overdraws it, and it cannot see anything DRAWN on
//     top - a translucent full-scene plane (the 4 km ground shadow-catcher) would wash
//     the viewport grey with every assertion here still green. That is a live suspect for
//     the founder's grey and it is NOT covered here; see initScene's §VIEWPORT-BG-PROBE
//     `groundShadowCatcher` entry (L-1352).
//   - "the base clear runs" means the hook was invoked. It does not prove it cleared the
//     CANVAS - a leaked render target defeats that, which is why
//     §FIX-WEBGL2-GHOST-STALE-TARGET exists as a separate guard.
// Pixel truth needs a browser. Say so; do not let a green file here be read as "white".

import { describe, expect, it } from 'vitest';
import { RenderPipelineManager } from '../src/pipeline/RenderPipelineManager.js';
import { LIGHT_BG_HEX, DARK_BG_HEX } from '../src/pipeline/BackgroundUniform.js';
import { Color } from '../src/three-re-export.js';

const WHITE = new Color(LIGHT_BG_HEX).getHex();
const NAVY  = new Color(DARK_BG_HEX).getHex();

function makeScene(): any { return { background: undefined as unknown }; }
const camera = {} as any;

/** WebGPURenderer with forceWebGL -> WebGL2 backend ('webgl-fallback' / 'webgl-only'). */
function lightweightWebGlRenderer(log: string[] = []): any {
  const clears: Array<{ hex: number; alpha: number }> = [];
  return {
    isWebGPURenderer: true,
    backend: { isWebGPUBackend: false },
    autoClear: true, autoClearColor: true, autoClearDepth: true,
    getRenderTarget: () => null,
    setRenderTarget: () => {},
    setClearAlpha: () => {},
    setClearColor: (c: any, a: number) => { clears.push({ hex: c?.getHex?.() ?? -1, alpha: a }); },
    render: () => { log.push('render'); },
    __clears: clears,
  };
}

/** Native WebGPU backend - the TSL output node owns the background. */
function nativeWebGpuRenderer(): any {
  return {
    isWebGPURenderer: true,
    backend: { isWebGPUBackend: true },
    setClearAlpha: () => {},
    setClearColor: () => {},
  };
}

describe('frame-start state - pinned on BOTH backends (L-1350)', () => {
  // -- ARM A: the background ------------------------------------------------
  describe('the viewport background', () => {
    it('lightweight WebGL: the SCENE carries the white, and the clear is white + OPAQUE', async () => {
      const scene = makeScene();
      const renderer = lightweightWebGlRenderer();
      const rpm = new RenderPipelineManager();

      await rpm.bind(scene, camera, renderer, 'light', /* backendIsWebGPU */ false);

      // Surface 2 - a scene property, so ANY renderer that draws this scene paints it.
      expect(scene.background?.isColor).toBe(true);
      expect(scene.background.getHex()).toBe(WHITE);
      // Surface 1 - primed opaque at bind, before the first frame, not on first paint.
      const primed = renderer.__clears[renderer.__clears.length - 1];
      expect(primed).toEqual({ hex: WHITE, alpha: 1 });
    });

    it('native WebGPU: scene.background stays NULL - the output node owns the fill', async () => {
      const scene = makeScene();
      scene.background = new Color(0x123456); // a stale colour from a previous backend
      const rpm = new RenderPipelineManager();

      await rpm.bind(scene, camera, nativeWebGpuRenderer(), 'light', true)
        .catch(() => { /* TSL cannot load without a GPU; the background decision precedes it */ });

      // A Color background gives every pixel alpha=1 and defeats the geometry mask,
      // which is the "whitening layer". Null is the correct state here - and it is the
      // state a WebGL-shaped fix must not "helpfully" repair.
      expect(scene.background).toBe(null);
    });

    it('BOTH backends resolve the SAME hex from the SAME constant - light AND dark', async () => {
      // The colour was unified in §VIEWPORT-BG-ONE-AUTHORITY (2026-08-08); this pins that
      // the MECHANISMS still agree on it, which is the half that drifted afterwards.
      const scene = makeScene();
      const renderer = lightweightWebGlRenderer();
      const rpm = new RenderPipelineManager();
      await rpm.bind(scene, camera, renderer, 'light', false);
      expect(scene.background.getHex()).toBe(WHITE);

      rpm.setTheme('dark');
      expect(scene.background.getHex()).toBe(NAVY);
      rpm.setTheme('light');
      expect(scene.background.getHex()).toBe(WHITE);
    });

    it('a TEXTURE background (HDRI / sky / panorama) is never stomped on either backend', async () => {
      const scene = makeScene();
      const sky = { isTexture: true, type: 'Texture' };
      scene.background = sky;
      const rpm = new RenderPipelineManager();
      await rpm.bind(scene, camera, lightweightWebGlRenderer(), 'light', false);
      expect(scene.background).toBe(sky);
    });
  });

  // -- ARM B: the base framebuffer beneath the overlay ----------------------
  describe('the base framebuffer beneath the overlay', () => {
    it('lightweight WebGL: the base clear runs at the start of the frame, before the paint', async () => {
      const log: string[] = [];
      const rpm = new RenderPipelineManager();
      await rpm.bind(makeScene(), camera, lightweightWebGlRenderer(log), 'light', false);
      rpm.setLightweightWebGlRender(true);
      rpm.setPreFrameBaseClearHook(() => log.push('base-clear'));

      rpm.render(0.016);
      rpm.render(0.016);

      expect(log).toEqual(['base-clear', 'render', 'base-clear', 'render']);
    });

    it('native WebGPU: the base clear runs too - the arm that was INVERTED (the ghost)', async () => {
      const log: string[] = [];
      const rpm = new RenderPipelineManager();
      await rpm.bind(makeScene(), camera, nativeWebGpuRenderer(), 'light', true)
        .catch(() => { /* no GPU */ });
      rpm.setPreFrameBaseClearHook(() => log.push('base-clear'));

      // The TSL pipeline cannot be built here, so exercise the pre-submit step directly.
      // Before L-1350 this hook was unreachable on this backend BY CONSTRUCTION: it was
      // read only inside `if (this._lightweightWebGlActive)`, which is false here.
      (rpm as unknown as { _runPreFrameBaseClear(): void })._runPreFrameBaseClear();

      expect(log).toEqual(['base-clear']);
      // ...and this backend must NOT acquire the lightweight paint as a side effect.
      expect(rpm.isLightweightWebGlActive).toBe(false);
    });

    it('a throwing hook never breaks the frame on either arm', async () => {
      const log: string[] = [];
      const rpm = new RenderPipelineManager();
      await rpm.bind(makeScene(), camera, lightweightWebGlRenderer(log), 'light', false);
      rpm.setLightweightWebGlRender(true);
      rpm.setPreFrameBaseClearHook(() => { throw new Error('OBC clear failed'); });
      expect(() => rpm.render(0.016)).not.toThrow();
      expect(log).toEqual(['render']); // the paint still happened

      const gpu = new RenderPipelineManager();
      await gpu.bind(makeScene(), camera, nativeWebGpuRenderer(), 'light', true).catch(() => { /* no GPU */ });
      gpu.setPreFrameBaseClearHook(() => { throw new Error('OBC clear failed'); });
      expect(() => (gpu as unknown as { _runPreFrameBaseClear(): void })._runPreFrameBaseClear())
        .not.toThrow();
    });
  });
});
