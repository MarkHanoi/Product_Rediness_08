// §VIEWPORT-BG-ONE-AUTHORITY-RUNTIME (L-1148) — ONE background authority, two backends.
//
// PROD EVIDENCE (founder, 2026-08-19, two screenshots of the SAME scene): the WebGPU
// viewport renders WHITE (correct); the WebGL2 viewport renders GREY. This is the THIRD
// report of that symptom (L-326, reopened once already).
//
// ROOT — not the colour, the MECHANISM. `LIGHT_BG_HEX` has been a single constant since
// §VIEWPORT-BG-ONE-AUTHORITY (2026-08-08), and both backends read it. But they reached
// the pixel two different ways, and only ONE of them was structural:
//
//   • WebGPU — the background is a property of the TSL pipeline OUTPUT NODE
//     (`mix(bgUniform, sceneColor, hasGeometry)`). If a frame is presented, it is in it.
//   • WebGL  — the background was ONE `setClearColor(_lightweightBgColor, 1)` statement
//     inside the `if (this._lightweightWebGlActive)` branch of `render()`, behind a
//     boolean that three separate call sites must arm and behind four early-returns.
//     Every frame that misses that branch inherits the TRANSPARENT clear initScene
//     primes at boot for the WebGPU-TSL contract (`setClearColor(0x000000, 0)`), and the
//     silenced OBC base canvas frozen underneath shows through — GREY.
//
// That is why arming the flag on one more path "fixed" L-326 twice and it came back
// twice. THE FIX: on every non-WebGPU backend the background is a property of the SCENE,
// asserted by the single owner that knows the resolved backend — so ANY renderer drawing
// this scene paints it. On WebGPU the same owner keeps `scene.background` NULL, because a
// Color background gives every pixel alpha=1 and defeats the `hasGeometry` mask.
//
// TOOTH: each test below fails if the authority is removed, or if it is applied to the
// WRONG backend — the two directions are asserted separately, and the live-swap test
// asserts the FLIP, which is the founder's actual reproduction path.

import { describe, expect, it } from 'vitest';
import { RenderPipelineManager } from '../src/pipeline/RenderPipelineManager.js';
import { DARK_BG_HEX, LIGHT_BG_HEX } from '../src/pipeline/BackgroundUniform.js';
import * as THREE from '../src/three-re-export.js';

const WHITE = new THREE.Color(LIGHT_BG_HEX).getHex();
const NAVY  = new THREE.Color(DARK_BG_HEX).getHex();

/** A scene fake carrying only what bind() touches. */
function fakeScene(): any {
  return { background: null, traverse: () => { /* no lights */ } };
}

const camera = {} as any;

/** WebGPURenderer on its WebGL2 backend — RendererBackend 'webgl-fallback'. */
function webgl2Renderer(): any {
  const clears: Array<{ hex: number; alpha: number }> = [];
  return {
    isWebGPURenderer: true,
    backend: { isWebGPUBackend: false },
    shadowMap: { enabled: true, needsUpdate: false },
    autoClear: true, autoClearColor: true, autoClearDepth: true,
    getRenderTarget: () => null,
    setRenderTarget: () => {},
    setClearAlpha: () => {},
    setClearColor: (color: any, alpha: number) => {
      clears.push({ hex: color?.getHex?.() ?? -1, alpha });
    },
    getDrawingBufferSize: (t: any) => (t?.set ? (t.set(1280, 720), t) : { x: 1280, y: 720 }),
    getSize: (t: any) => (t?.set ? (t.set(1280, 720), t) : { x: 1280, y: 720 }),
    render: () => {},
    __clears: clears,
  };
}

/** A native-WebGPU renderer — RendererBackend 'webgpu'. */
function webgpuRenderer(): any {
  return {
    isWebGPURenderer: true,
    backend: { isWebGPUBackend: true },
    shadowMap: { enabled: true, needsUpdate: false },
    setClearAlpha: () => {},
    setClearColor: () => {},
    getDrawingBufferSize: (t: any) => (t?.set ? (t.set(1280, 720), t) : { x: 1280, y: 720 }),
    getSize: (t: any) => (t?.set ? (t.set(1280, 720), t) : { x: 1280, y: 720 }),
    render: () => {},
  };
}

/** bind() on the WebGPU branch attempts the TSL load, which cannot resolve in node. */
async function bindQuietly(
  rpm: RenderPipelineManager, scene: any, renderer: any, isWebGPU: boolean,
): Promise<void> {
  await rpm.bind(scene, camera, renderer, 'light', isWebGPU).catch(() => { /* TSL absent in node */ });
}

describe('RenderPipelineManager — §VIEWPORT-BG-ONE-AUTHORITY-RUNTIME (L-1148)', () => {
  it('WebGL2: bind() makes the theme background a property of the SCENE (was: only a clear inside one render() branch)', async () => {
    const scene = fakeScene();
    const rpm = new RenderPipelineManager();

    await bindQuietly(rpm, scene, webgl2Renderer(), false);

    expect(scene.background).not.toBeNull();
    expect(scene.background.isColor).toBe(true);
    expect(scene.background.getHex()).toBe(WHITE);
  });

  it('WebGL2: bind() also primes the renderer clear OPAQUE to white — without waiting for a first frame', async () => {
    const renderer = webgl2Renderer();
    const rpm = new RenderPipelineManager();

    await bindQuietly(rpm, fakeScene(), renderer, false);

    // initScene primes this renderer TRANSPARENT at boot for the WebGPU-TSL contract;
    // on a WebGL backend that prime is simply wrong and must be overwritten at bind.
    expect(renderer.__clears.length).toBeGreaterThanOrEqual(1);
    const last = renderer.__clears[renderer.__clears.length - 1];
    expect(last.hex).toBe(WHITE);
    expect(last.alpha).toBe(1);
  });

  it('WebGPU: bind() keeps scene.background NULL — a Color would give every pixel alpha=1 and defeat the TSL geometry mask', async () => {
    const scene = fakeScene();
    scene.background = new THREE.Color(LIGHT_BG_HEX); // a stale Color left by a prior WebGL bind
    const rpm = new RenderPipelineManager();

    await bindQuietly(rpm, scene, webgpuRenderer(), true);

    expect(scene.background).toBeNull();
  });

  it("THE FOUNDER'S PATH — a live swap WebGPU -> WebGL2 FLIPS the background from null to white", async () => {
    const scene = fakeScene();

    const first = new RenderPipelineManager();
    await bindQuietly(first, scene, webgpuRenderer(), true);
    expect(scene.background).toBeNull(); // WebGPU: TSL owns it

    // The swap disposes the old manager's pipeline and re-binds onto the new backend.
    const second = new RenderPipelineManager();
    await bindQuietly(second, scene, webgl2Renderer(), false);

    expect(scene.background?.getHex()).toBe(WHITE); // WebGL2: the SCENE owns it
  });

  it('and swapping BACK to WebGPU nulls it again — the flip is symmetric, not one-way', async () => {
    const scene = fakeScene();

    const a = new RenderPipelineManager();
    await bindQuietly(a, scene, webgl2Renderer(), false);
    expect(scene.background?.getHex()).toBe(WHITE);

    const b = new RenderPipelineManager();
    await bindQuietly(b, scene, webgpuRenderer(), true);
    expect(scene.background).toBeNull();
  });

  it('WebGL2: setTheme("dark") repaints the SCENE background, not only the per-frame clear', async () => {
    const scene = fakeScene();
    const rpm = new RenderPipelineManager();
    await bindQuietly(rpm, scene, webgl2Renderer(), false);

    rpm.setTheme('dark');

    expect(scene.background?.getHex()).toBe(NAVY);
  });

  it('WebGL2: a custom picked colour reaches the scene background through the same authority', async () => {
    const scene = fakeScene();
    const rpm = new RenderPipelineManager();
    await bindQuietly(rpm, scene, webgl2Renderer(), false);

    rpm.setColor('#123456');

    expect(scene.background?.getHex()).toBe(0x123456);
  });

  it('an HDRI / panorama TEXTURE background is NEVER stomped — on EITHER backend (its provider owns and restores it)', async () => {
    const texture: any = { isTexture: true, uuid: 'hdri' };

    const webglScene = fakeScene();
    webglScene.background = texture;
    await bindQuietly(new RenderPipelineManager(), webglScene, webgl2Renderer(), false);
    expect(webglScene.background).toBe(texture);

    const webgpuScene = fakeScene();
    webgpuScene.background = texture;
    await bindQuietly(new RenderPipelineManager(), webgpuScene, webgpuRenderer(), true);
    expect(webgpuScene.background).toBe(texture);
  });
});
