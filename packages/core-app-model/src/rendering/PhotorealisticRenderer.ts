/**
 * @file src/core/rendering/PhotorealisticRenderer.ts
 * @description Client-side photorealistic render pipeline for Pryzm Render Mode.
 *
 * CONTRACT (01-BIM-ENGINE-CORE-CONTRACT §4.3, §5):
 *  - This class NEVER mutates any ElementStore or semantic state.
 *  - It reads the Three.js scene (projection layer) in read-only fashion for rendering.
 *  - It operates on a SEPARATE off-screen canvas / renderer, isolated from the
 *    PostproductionRenderer that drives the BIM authoring viewport.
 *  - BVH data added to geometries by three-mesh-bvh is additive (cached in userData)
 *    and does NOT interfere with Three.js rasterization.
 *
 * Render Pipeline:
 *   1. Create an off-screen WebGLRenderer + canvas
 *   2. Load HDRI environment via HDRIEnvironmentManager
 *   3. Attempt path tracing via three-gpu-pathtracer (WebGL2 GPU path tracer)
 *   4. Fall back to HQ rasterizer (HDRI + MSAA + ACESFilmic tone mapping) if needed
 *   5. Capture canvas as PNG Blob URL
 *   6. Dispose all off-screen resources
 */

import * as THREE from '@pryzm/renderer-three/three';
import { HDRIEnvironmentManager } from './HDRIEnvironmentManager';
import {
    getBvhAttributesForPathTracer,
    bvhGeometryIsRenderable,
    ensureMaterialIndexAttribute,
    capRenderDimensions,
    MAX_SAFE_RENDER_PIXELS,
} from './PathTracingUtils';

export interface RenderJobOptions {
    width: number;
    height: number;
    samples: number;
    hdriPresetId: string;
    backgroundMode: 'hdri' | 'white' | 'black' | 'transparent';
    onProgress?: (progress: number, samplesCompleted: number, status: string) => void;
    signal?: AbortSignal;
}

export interface RenderResult {
    blobUrl: string;
    width: number;
    height: number;
    samples: number;
    durationMs: number;
    method: 'pathtracing' | 'hq-rasterizer';
}

export class PhotorealisticRenderer {
    private static _instance: PhotorealisticRenderer | null = null;
    private _isRendering = false;

    static getInstance(): PhotorealisticRenderer {
        if (!PhotorealisticRenderer._instance) {
            PhotorealisticRenderer._instance = new PhotorealisticRenderer();
        }
        return PhotorealisticRenderer._instance;
    }

    get busy(): boolean { return this._isRendering; }

    /**
     * Generates a photorealistic render from the active BIM scene.
     *
     * @param sourceScene  - The main THREE.Scene (read-only — never mutated)
     * @param sourceCamera - The active perspective camera
     * @param options      - Render configuration
     */
    async renderToImage(
        sourceScene: THREE.Scene,
        sourceCamera: THREE.Camera,
        options: RenderJobOptions,
    ): Promise<RenderResult> {
        if (this._isRendering) {
            throw new Error('[PhotorealisticRenderer] A render is already in progress.');
        }
        this._isRendering = true;
        const t0 = performance.now();

        const canvas = document.createElement('canvas');
        canvas.width = options.width;
        canvas.height = options.height;
        canvas.style.display = 'none';
        document.body.appendChild(canvas);

        const renderer = new THREE.WebGLRenderer({
            canvas,
            antialias: true,
            alpha: options.backgroundMode === 'transparent',
            preserveDrawingBuffer: true,
            powerPreference: 'high-performance',
        });
        renderer.setSize(options.width, options.height);
        renderer.setPixelRatio(1);
        renderer.outputColorSpace = THREE.SRGBColorSpace;
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        renderer.toneMappingExposure = 1.0;
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = THREE.PCFSoftShadowMap;

        const hdriManager = new HDRIEnvironmentManager(renderer);

        // Save scene state to restore after render
        const prevEnv = sourceScene.environment;
        const prevBg = sourceScene.background;

        // Clone the camera to avoid modifying the live viewport camera
        const cam = sourceCamera.clone() as THREE.PerspectiveCamera;
        if (cam instanceof THREE.PerspectiveCamera) {
            cam.aspect = options.width / options.height;
            cam.updateProjectionMatrix();
        }

        let result: RenderResult;

        try {
            options.onProgress?.(0.02, 0, 'Loading environment…');

            // Detect whether PascalSceneLighting is active.
            // When it is, scene.environment is already null (Pascal cleared HDRI IBL
            // deliberately to prevent it from washing out SSGI AO). Re-injecting HDRI
            // as IBL would undo that optimisation and produce a flat, overlit render.
            const pascalLightingActive = !!window.pascalSceneLighting?.applied;

            // Apply HDRI environment
            if (options.backgroundMode === 'hdri') {
                // HDRI as background AND IBL: always apply regardless of Pascal state.
                await hdriManager.applyPreset(sourceScene, options.hdriPresetId);
            } else if (!pascalLightingActive) {
                // Non-HDRI background, Pascal NOT active: apply HDRI as IBL-only light.
                await hdriManager.applyPresetAsLightOnly(sourceScene, options.hdriPresetId);
                switch (options.backgroundMode) {
                    case 'white': sourceScene.background = new THREE.Color(0xffffff); break;
                    case 'black': sourceScene.background = new THREE.Color(0x000000); break;
                    default:      sourceScene.background = null;
                }
            } else {
                // Pascal IS active: scene already has proper 3-directional lights,
                // scene.environment = null. Only set the background colour; do NOT
                // inject HDRI IBL (would undo Pascal's lighting setup).
                switch (options.backgroundMode) {
                    case 'white': sourceScene.background = new THREE.Color(0xffffff); break;
                    case 'black': sourceScene.background = new THREE.Color(0x000000); break;
                    default:      sourceScene.background = null;
                }
            }

            sourceScene.updateMatrixWorld(true);

            if (options.signal?.aborted) throw new DOMException('Cancelled', 'AbortError');

            // Try path tracing first, fall back to HQ rasterizer
            let blobUrl: string;
            let method: RenderResult['method'];

            try {
                options.onProgress?.(0.05, 0, 'Building acceleration structure…');
                blobUrl = await this._runPathTracing(renderer, sourceScene, cam, options);
                method = 'pathtracing';
            } catch (ptErr: any) {
                if (ptErr?.name === 'AbortError') throw ptErr;
                console.warn('[PhotorealisticRenderer] Path-tracing failed, using HQ rasterizer:', ptErr?.message ?? ptErr);
                blobUrl = await this._runHQRasterizer(renderer, sourceScene, cam, options);
                method = 'hq-rasterizer';
            }

            result = {
                blobUrl,
                width: options.width,
                height: options.height,
                samples: options.samples,
                durationMs: performance.now() - t0,
                method,
            };
        } finally {
            // Restore scene (critical — keeps the BIM authoring view unaffected)
            sourceScene.environment = prevEnv;
            sourceScene.background = prevBg;
            hdriManager.dispose();
            renderer.dispose();
            canvas.remove();
            this._isRendering = false;
        }

        return result;
    }

    // ── Path-tracing render path ──────────────────────────────────────────────

    private async _runPathTracing(
        renderer: THREE.WebGLRenderer,
        scene: THREE.Scene,
        camera: THREE.Camera,
        opts: RenderJobOptions,
    ): Promise<string> {
        // @ts-ignore — three-gpu-pathtracer ships without .d.ts; runtime exports confirmed
        const ptLib = await import('three-gpu-pathtracer');
        const { PathTracingSceneGenerator, PathTracingRenderer, PhysicalPathTracingMaterial }
            = ptLib as any;

        const { FullScreenQuad } = await import(
            'three/examples/jsm/postprocessing/Pass.js'
        );

        // Build BVH from scene meshes
        const generator = new PathTracingSceneGenerator();
        const ptData = generator.generate(scene);
        const { bvh, textures, materials, lights } = ptData;

        // Guard: empty BVH (IFC InstancedMesh scenes produce zero-vertex geometry).
        // Fall back to HQ rasterizer instead of crashing inside the path-tracer library.
        if (!bvhGeometryIsRenderable(bvh.geometry)) {
            throw new Error('[PhotorealisticRenderer] BVH geometry has no renderable triangles — falling back to HQ rasterizer.');
        }

        const ptMaterial = new PhysicalPathTracingMaterial();
        ptMaterial.bounces = 6;
        ptMaterial.transmissiveBounces = 3;

        ptMaterial.bvh.updateFrom(bvh);
        // Use helper to supply zeroed placeholder attributes for any that are
        // missing on BIM geometry (tangent and color are absent on walls/slabs).
        const [ptNormal, ptTangent, ptUv, ptColor] = getBvhAttributesForPathTracer(bvh.geometry);
        ptMaterial.attributesArray.updateFrom(ptNormal, ptTangent, ptUv, ptColor);
        // Use ensureMaterialIndexAttribute so missing attributes get a safe placeholder
        // rather than causing an updateFrom crash on undefined.
        ptMaterial.materialIndexAttribute.updateFrom(
            ensureMaterialIndexAttribute(bvh.geometry),
        );
        ptMaterial.textures.setTextures(renderer, 2048, 2048, textures);
        ptMaterial.materials.updateFrom(materials, textures);
        ptMaterial.lights.updateFrom(lights);

        if (scene.environment) {
            ptMaterial.envMapInfo.updateFrom(scene.environment);
        }

        // Cap render dimensions: very large allocations (8K+) exhaust GPU memory and
        // can cause CONTEXT_LOST_WEBGL which kills the main authoring viewport too.
        const [safeW, safeH, wasCapped] = capRenderDimensions(opts.width, opts.height);
        if (wasCapped) {
            console.warn(
                `[PhotorealisticRenderer] Capping path-trace render from ${opts.width}×${opts.height}` +
                ` to ${safeW}×${safeH} (budget: ${MAX_SAFE_RENDER_PIXELS / 1e6 | 0}MP) to prevent GPU OOM.`,
            );
        }

        const ptRenderer = new PathTracingRenderer(renderer);
        ptRenderer.setSize(safeW, safeH);
        ptRenderer.camera = camera;
        ptRenderer.material = ptMaterial;
        ptRenderer.tiles.set(3, 3);

        const fsQuad = new FullScreenQuad(
            new THREE.MeshBasicMaterial({ map: ptRenderer.target.texture }),
        );

        const total = opts.samples;

        try {
            for (let i = 0; i < total; i++) {
                if (opts.signal?.aborted) throw new DOMException('Cancelled', 'AbortError');

                ptRenderer.update();

                // Blit accumulated render to canvas every 10 samples
                if (i % 10 === 0 || i === total - 1) {
                    renderer.setRenderTarget(null);
                    fsQuad.render(renderer);
                }

                if (opts.onProgress) {
                    const pct = 0.05 + 0.90 * ((i + 1) / total);
                    opts.onProgress(pct, i + 1, `Path tracing… ${i + 1}/${total} samples`);
                }

                // Yield every 8 samples to keep browser responsive
                if (i % 8 === 0) {
                    await new Promise<void>(r => setTimeout(r, 0));
                }
            }

            // Final blit
            renderer.setRenderTarget(null);
            fsQuad.render(renderer);
            opts.onProgress?.(0.96, total, 'Capturing…');

            const blobUrl = await this._captureCanvas(renderer.domElement);

            opts.onProgress?.(1.0, total, 'Done');
            return blobUrl;
        } finally {
            fsQuad.dispose();
            try { (ptRenderer as any).dispose?.(); } catch {}
            try { bvh.dispose(); } catch {}
        }
    }

    // ── HQ Rasterizer fallback ────────────────────────────────────────────────

    private async _runHQRasterizer(
        renderer: THREE.WebGLRenderer,
        scene: THREE.Scene,
        camera: THREE.Camera,
        opts: RenderJobOptions,
    ): Promise<string> {
        opts.onProgress?.(0.1, 0, 'Rendering (HQ mode)…');
        await new Promise<void>(r => setTimeout(r, 0));

        // Render at 2× resolution then downsample for SSAA.
        // Cap the SSAA render target so that 8K+ requests don't exhaust GPU memory
        // and cause CONTEXT_LOST_WEBGL (which kills the main authoring viewport too).
        const ssaaScale = 2;
        const [rtW, rtH, ssaaCapped] = capRenderDimensions(
            opts.width  * ssaaScale,
            opts.height * ssaaScale,
        );
        if (ssaaCapped) {
            console.warn(
                `[PhotorealisticRenderer] HQ rasterizer SSAA target capped to ${rtW}×${rtH}` +
                ` (requested ${opts.width * ssaaScale}×${opts.height * ssaaScale}).`,
            );
        }

        const rt = new THREE.WebGLRenderTarget(rtW, rtH, {
            minFilter: THREE.LinearFilter,
            magFilter: THREE.LinearFilter,
            format: THREE.RGBAFormat,
            type: THREE.HalfFloatType,
            samples: 4,
        });

        renderer.setRenderTarget(rt);
        renderer.render(scene, camera);

        opts.onProgress?.(0.6, 1, 'Post-processing…');
        await new Promise<void>(r => setTimeout(r, 0));

        // Downsample to final canvas size
        const downsampleMat = new THREE.MeshBasicMaterial({ map: rt.texture });
        const { FullScreenQuad } = await import('three/examples/jsm/postprocessing/Pass.js');
        const fsq = new FullScreenQuad(downsampleMat);
        renderer.setRenderTarget(null);
        renderer.setSize(opts.width, opts.height);
        fsq.render(renderer);
        fsq.dispose();

        opts.onProgress?.(0.9, 1, 'Capturing…');

        const blobUrl = await this._captureCanvas(renderer.domElement);
        rt.dispose();

        opts.onProgress?.(1.0, 1, 'Done');
        return blobUrl;
    }

    // ── Utilities ─────────────────────────────────────────────────────────────

    private _captureCanvas(canvas: HTMLCanvasElement): Promise<string> {
        return new Promise((resolve, reject) => {
            canvas.toBlob(blob => {
                if (!blob) { reject(new Error('Canvas toBlob failed')); return; }
                resolve(URL.createObjectURL(blob));
            }, 'image/png');
        });
    }
}

export const photorealisticRenderer = PhotorealisticRenderer.getInstance();
