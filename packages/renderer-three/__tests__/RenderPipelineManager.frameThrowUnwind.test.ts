/**
 * §FRAME-THROW-STRANDS-RENDER-STATE (L-13313) — a WebGPU frame that throws from INSIDE a pass
 * must not leave the renderer bound to that pass's render target.
 *
 * FOUNDER EVIDENCE (2026-09-11, WebGPU after a live renderer swap, several envelope face drags):
 *   PIPELINE_FAILURE reason="Failed to execute 'setIndexBuffer' … not of type 'GPUBuffer'."
 *     … _renderObjects → _renderTransparents → _renderScene → render
 *   §GPU-RESOURCE-LIFETIME … Performing ONE immediate reconstruction …
 *   [captureThumbnail] Read a blank/transparent frame
 *   → the 3D viewport stays WHITE — and NO "RECURRED" line ever follows.
 *
 * WHAT THIS DRIVES. The REAL three r183.2 `PassNode` (built by this package's own
 * `createScenePass` / `createZonePass` over the real `three/tsl`) inside the REAL
 * `RenderPipelineManager.render()`. The only fakes face the GPU: a renderer object that keeps its
 * render target / MRT the way three's `Renderer` does (Renderer.js:2404, :1113) and throws the
 * founder's TypeError from `render()` — i.e. from INSIDE PassNode.js:851 — and a pipeline whose
 * `render()` does what `RenderPipeline.render()` does around its quad (RenderPipeline.js:112-130),
 * recording the quad's output target the way `Renderer._renderScene` resolves it:
 * `this._renderTarget || this._outputRenderTarget` (Renderer.js:1392).
 *
 * ✅ ESTABLISHES
 *   (P) the premise — three's PassNode really does strand the renderer when its inner render throws
 *       (if a future three wraps updateBefore in try/finally, (P) fails and says so);
 *   (1) after the throw the frame owner has put back the canvas target, the MRT, the tone mapping,
 *       the colour space and the clear flag — for the cheap and the G-buffer scene pass;
 *   (2) for a throw inside the ZONE pass, the camera's layer mask too;
 *   (3) the ONE immediate reconstruction still runs (the §GPU-RESOURCE-LIFETIME policy is untouched);
 *   (4) ⭐ the NEXT frame — the rebuilt pipeline's — composites onto the CANVAS, with the scene's
 *       layers visible;
 *   (5) a clean frame changes nothing, and the snapshot never outlives its frame.
 * ⛔ DOES NOT ESTABLISH: that a device paints — there is no GPU in node.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import * as TSL from 'three/tsl';
import { RenderPipelineManager } from '../src/pipeline/RenderPipelineManager.js';
import { createScenePass } from '../src/pipeline/ScenePass.js';
import { createZonePass, ZONE_LAYER } from '../src/pipeline/ZonePass.js';
import { RenderFrameUnwind } from '../src/pipeline/renderFrameUnwind.js';
import { drainGpuReleaseQueue } from '../src/safeDispose.js';

const SET_INDEX_BUFFER_FAILURE =
    "Failed to execute 'setIndexBuffer' on 'GPURenderPassEncoder': parameter 1 is not of type 'GPUBuffer'.";

/** The state the app hands three at the top of a WebGPU frame. */
const APP_TONE_MAPPING = THREE.ACESFilmicToneMapping;
const APP_COLOR_SPACE = THREE.SRGBColorSpace;
const APP_AUTO_CLEAR = false;
const SCENE_LAYERS_MASK = new THREE.Layers().mask; // layer 0 only — what every camera starts with

type PassLike = { renderTarget: unknown; updateBefore(frame: unknown): void };

/** WebGPU-shaped renderer that keeps its target / MRT like three's Renderer, and throws the fault. */
function fakeWebGpuRenderer() {
    return {
        isWebGPURenderer: true,
        backend: { isWebGPUBackend: true },
        domElement: { clientWidth: 1200, clientHeight: 900, width: 1200, height: 900 },
        getDrawingBufferSize: (t: any) => { if (t?.set) { t.set(1200, 900); return t; } return { x: 1200, y: 900 }; },
        getSize: (t: any) => { if (t?.set) { t.set(1200, 900); return t; } return { x: 1200, y: 900 }; },
        setSize: () => { /* noop */ },
        setClearAlpha: () => { /* noop */ },
        setClearColor: () => { /* noop */ },
        getPixelRatio: () => 1,
        getOutputRenderTarget: () => null,
        _renderTarget: null as unknown,
        _activeCubeFace: 0,
        _activeMipmapLevel: 0,
        _mrt: null as unknown,
        getRenderTarget() { return this._renderTarget; },
        setRenderTarget(t: unknown, face = 0, mip = 0) { this._renderTarget = t; this._activeCubeFace = face; this._activeMipmapLevel = mip; },
        getActiveCubeFace() { return this._activeCubeFace; },
        getActiveMipmapLevel() { return this._activeMipmapLevel; },
        getMRT() { return this._mrt; },
        setMRT(m: unknown) { this._mrt = m; return this; },
        autoClear: APP_AUTO_CLEAR,
        transparent: true,
        opaque: true,
        contextNode: null as unknown,
        toneMapping: APP_TONE_MAPPING as THREE.ToneMapping,
        outputColorSpace: APP_COLOR_SPACE as string,
        xr: { enabled: false },
        /** THE FAULT — `_renderTransparents` → WebGPUBackend.draw, thrown from inside PassNode.js:851. */
        render: vi.fn((_scene: unknown, _camera: unknown): void => { throw new TypeError(SET_INDEX_BUFFER_FAILURE); }),
    };
}
type FakeRenderer = ReturnType<typeof fakeWebGpuRenderer>;

/**
 * What `RenderPipeline.render()` does (RenderPipeline.js:112-130): tone mapping → none, colour
 * space → working, XR off, then `_quadMesh.render(renderer)`. The quad's output target is fixed
 * at the top of `_renderScene` (Renderer.js:1392) and its pass node's `updateBefore` runs inside.
 */
function pipelineOver(pass: PassLike, renderer: FakeRenderer, quadTargets: unknown[]) {
    return {
        render: () => {
            const toneMapping = renderer.toneMapping;
            const outputColorSpace = renderer.outputColorSpace;
            renderer.toneMapping = THREE.NoToneMapping;
            renderer.outputColorSpace = THREE.ColorManagement.workingColorSpace;
            const xr = renderer.xr.enabled;
            renderer.xr.enabled = false;
            quadTargets.push(renderer.getRenderTarget()); // ← where the composite lands
            pass.updateBefore({ renderer });              // ← the REAL three PassNode
            renderer.xr.enabled = xr;
            renderer.toneMapping = toneMapping;
            renderer.outputColorSpace = outputColorSpace;
        },
        dispose: () => { /* noop */ },
    };
}

type PassKind = 'scene' | 'scene+gbuffer' | 'zone';

function makePass(kind: PassKind, scene: THREE.Scene, camera: THREE.Camera): PassLike {
    if (kind === 'zone') return createZonePass(scene, camera) as unknown as PassLike;
    return createScenePass(scene, camera, kind === 'scene+gbuffer') as unknown as PassLike;
}

/** A WebGPU RPM whose frame reaches the real pass and throws the founder's fault inside it. */
function arm(kind: PassKind) {
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera();
    const renderer = fakeWebGpuRenderer();
    const pass = makePass(kind, scene, camera);
    const quadTargets: unknown[] = [];

    const rpm = new RenderPipelineManager() as any;
    rpm._webGpuActive = true;
    rpm._renderer = renderer;
    rpm._scene = scene;
    rpm._camera = camera;
    rpm._renderPipeline = pipelineOver(pass, renderer, quadTargets);
    // Observe the ONE reconstruction without GPU work (same seam the ADR-0281 suite stubs).
    rpm._rebuildPipeline = vi.fn(async () => { /* the test installs the rebuilt pipeline */ });
    rpm.onProjectSwitch = vi.fn();
    rpm._recreateLightOwnedShadowMaps = vi.fn();
    rpm._resetCompiledNodeStates = vi.fn();
    rpm._safeDisposeRenderPipeline = vi.fn();
    return { rpm, renderer, scene, camera, pass, quadTargets };
}

beforeEach(() => {
    (globalThis as any).__PRYZM_TSL__ = TSL;
    drainGpuReleaseQueue();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(() => {
    delete (globalThis as any).__PRYZM_TSL__;
    vi.restoreAllMocks();
});

describe('§FRAME-THROW-STRANDS-RENDER-STATE — the three r183.2 premise', () => {
    it('(P) PassNode.updateBefore has no try/finally: a throw inside it strands the renderer on the pass', () => {
        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera();
        const renderer = fakeWebGpuRenderer();
        const zone = makePass('zone', scene, camera);

        expect(() => zone.updateBefore({ renderer })).toThrow(SET_INDEX_BUFFER_FAILURE);

        // PassNode.js:826-828 + :810 ran; :856-863 did not.
        expect(renderer.getRenderTarget()).toBe(zone.renderTarget);
        expect(renderer.autoClear).toBe(true);
        expect(camera.layers.mask).toBe(1 << ZONE_LAYER); // zones only — the scene layer is OFF
    });
});

describe('§FRAME-THROW-STRANDS-RENDER-STATE — the frame owner unwinds a thrown frame', () => {
    for (const kind of ['scene', 'scene+gbuffer'] as const) {
        it(`(1) a throw inside the ${kind} pass leaves the renderer on the CANVAS, not on the pass target`, () => {
            const { rpm, renderer, pass } = arm(kind);

            rpm.render(0.016);

            expect(renderer.render).toHaveBeenCalledTimes(1); // the fault fired, inside PassNode.js:851
            expect(renderer.getRenderTarget(), 'still bound to the thrown pass').not.toBe(pass.renderTarget);
            expect(renderer.getRenderTarget()).toBeNull();
            expect(renderer.getMRT()).toBeNull();
            expect(renderer.toneMapping).toBe(APP_TONE_MAPPING);
            expect(renderer.outputColorSpace).toBe(APP_COLOR_SPACE);
            expect(renderer.autoClear).toBe(APP_AUTO_CLEAR);
        });
    }

    it('(2) a throw inside the ZONE pass also gives the camera its scene layers back', () => {
        const { rpm, camera } = arm('zone');

        rpm.render(0.016);

        expect(camera.layers.mask).toBe(SCENE_LAYERS_MASK);
    });

    it('(3) the ONE immediate reconstruction still runs — the ADR-0281 policy is untouched', () => {
        const { rpm } = arm('scene');

        rpm.render(0.016);

        expect(rpm._rebuildPipeline).toHaveBeenCalledTimes(1);
        expect(rpm.onProjectSwitch).not.toHaveBeenCalled();
        expect(rpm.status.retryCount).toBe(0);
    });

    for (const kind of ['scene', 'zone'] as const) {
        it(`(4) ⭐ after a throw in the ${kind} pass, the REBUILT pipeline's frame composites onto the canvas`, async () => {
            const { rpm, renderer, scene, camera } = arm(kind);
            rpm.render(0.016);
            await Promise.resolve();
            await Promise.resolve();

            // What `_rebuildPipeline()` installs: a NEW pipeline over a NEW (real) scene pass — the
            // fault is gone (the envelope half of L-13313 fixed its cause).
            const seenByScenePass: number[] = [];
            renderer.render.mockImplementation((_s: unknown, cam: unknown) => {
                seenByScenePass.push((cam as THREE.Camera).layers.mask);
            });
            const quadTargets: unknown[] = [];
            rpm._renderPipeline = pipelineOver(makePass('scene', scene, camera), renderer, quadTargets);
            rpm._hasPipelineError = false;

            rpm.render(0.016);

            // Renderer.js:1392 — the composite goes to `_renderTarget || _outputRenderTarget`.
            // Stranded, that was the dead pass's target and the canvas never painted again.
            expect(quadTargets).toEqual([null]);
            // …and the scene pass drew the scene's layers, not the zone pass's.
            expect(seenByScenePass).toEqual([SCENE_LAYERS_MASK]);
            expect(renderer.getRenderTarget()).toBeNull();
        });
    }
});

describe('§FRAME-THROW-STRANDS-RENDER-STATE — RenderFrameUnwind', () => {
    it('(5) a clean frame reports no drift and writes nothing', () => {
        const renderer = fakeWebGpuRenderer();
        const camera = new THREE.PerspectiveCamera();
        const scene = new THREE.Scene();
        const setTarget = vi.spyOn(renderer, 'setRenderTarget');
        const setMrt = vi.spyOn(renderer, 'setMRT');
        const unwind = new RenderFrameUnwind();

        unwind.capture(renderer, camera, scene);
        expect(unwind.restore()).toEqual([]);
        expect(setTarget).not.toHaveBeenCalled();
        expect(setMrt).not.toHaveBeenCalled();
    });

    it('(5) release() ends the snapshot — a later restore() touches nothing', () => {
        const renderer = fakeWebGpuRenderer();
        const unwind = new RenderFrameUnwind();
        unwind.capture(renderer, null, null);
        unwind.release();
        renderer.setRenderTarget({ stale: true });
        expect(unwind.restore()).toEqual([]);
        expect(renderer.getRenderTarget()).toEqual({ stale: true });
    });

    it('never throws — not on capture of a hostile renderer, not on restore', () => {
        const hostile = {
            getRenderTarget: () => { throw new Error('getter exploded'); },
            setRenderTarget: () => { throw new Error('setter exploded'); },
        };
        const unwind = new RenderFrameUnwind();
        expect(() => unwind.capture(hostile, null, null)).not.toThrow();
        expect(() => unwind.restore()).not.toThrow();
    });

    it('names what drifted, so the console says what the failed frame left behind', () => {
        const renderer = fakeWebGpuRenderer();
        const camera = new THREE.PerspectiveCamera();
        const unwind = new RenderFrameUnwind();
        unwind.capture(renderer, camera, null);
        renderer.setRenderTarget({ pass: 'rt' });
        renderer.toneMapping = THREE.NoToneMapping;
        camera.layers.mask = 1 << ZONE_LAYER;
        expect(unwind.restore()).toEqual(['renderTarget', 'toneMapping', 'camera.layers.mask']);
    });
});
