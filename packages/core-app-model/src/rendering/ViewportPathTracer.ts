/**
 * @file src/core/rendering/ViewportPathTracer.ts
 * @description In-Viewport Progressive Path Tracer — Tier 2 of the Pryzm
 *   photorealistic rendering roadmap.
 *
 * CONTRACT (01-BIM-ENGINE-CORE-CONTRACT §4.3, §5):
 *  - This class NEVER mutates any ElementStore or semantic state.
 *  - It reads the Three.js scene (projection layer) in read-only fashion.
 *  - It operates on the MAIN renderer/canvas (no off-screen buffer).
 *  - BVH data added to geometries by three-mesh-bvh is additive (cached
 *    in userData) and does NOT interfere with rasterization.
 *
 * CONTRACT (01-BIM-ENGINE-CORE-CONTRACT §3 — OBC isolation):
 *  - This class does NOT import @thatopen/* packages.
 *  - OBC renderer-mode switching (MANUAL ↔ AUTO) is handled by the caller
 *    (EngineBootstrap) before calling activate() / deactivate().
 *
 * Render Pipeline (per-frame):
 *   1. PathTracingRenderer.update()  — renders one sample into the accumulation
 *      render target
 *   2. FullScreenQuad.render()       — blits the accumulated texture to the
 *      viewport canvas
 *
 * Reset triggers (caller must call reset()):
 *   - Camera moved
 *   - HDRI / DOF settings changed
 *   - Scene geometry changed
 */

import * as THREE from '@pryzm/renderer-three/three';
import { getFrameScheduler, type TickListenerDisposer } from '@pryzm/frame-scheduler';
import { HDRIEnvironmentManager } from './HDRIEnvironmentManager';
import {
    getBvhAttributesForPathTracer,
    bvhGeometryIsRenderable,
    ensureMaterialIndexAttribute,
} from './PathTracingUtils';

// ── Types ──────────────────────────────────────────────────────────────────

export type VPTStatus =
    | 'idle'          // Not active
    | 'building'      // Building BVH (async, blocks activation)
    | 'accumulating'  // Actively accumulating samples
    | 'converged'     // Reached maxSamples
    | 'paused';       // User-paused accumulation

export interface VPTOptions {
    /** Maximum number of path-tracing samples (default 1000). */
    maxSamples?: number;
    /** Max ray bounces (default 5). */
    bounces?: number;
    /** Max bounces for transmissive materials (default 2). */
    transmissiveBounces?: number;
    /** HDRI preset id from HDRIEnvironmentManager (default 'studio-neutral'). */
    hdriPresetId?: string;
    /** f-stop for depth of field; Infinity = no DOF (default Infinity). */
    fStop?: number;
    /** Focal distance in world units when DOF is enabled (default 10). */
    focalDistance?: number;
    /** Number of aperture blades for lens bokeh (default 6). */
    apertureBlades?: number;
}

// ── Main class ─────────────────────────────────────────────────────────────

export class ViewportPathTracer {
    // ── Private state ──────────────────────────────────────────────────────

    private _status: VPTStatus = 'idle';
    private _samples = 0;
    private _maxSamples = 1000;
    private _opts: Required<VPTOptions>;

    private _ptRenderer: any  = null;  // PathTracingRenderer
    private _ptMaterial: any  = null;  // PhysicalPathTracingMaterial
    private _fsQuad:     any  = null;  // FullScreenQuad
    private _bvh:        any  = null;  // MeshBVH (for dispose)

    private _hdriManager: HDRIEnvironmentManager | null = null;
    private _savedEnv:    THREE.Texture | null = null;
    private _savedBg:     THREE.Color | THREE.Texture | null = null;

    /**
     * Frame-scheduler subscription disposer (S85.D-finish.3 — 2026-04-30).
     * Replaces the legacy `_rafId: number | null` (which held the
     * `requestAnimationFrame` handle for the path-trace accumulation loop).
     * Non-null while the loop is actively accumulating samples; nulled by
     * `_stopLoop()` (explicit stop) or by the tick callback itself when
     * `paused` / `converged` is reached (self-stop, mirroring the old
     * "set _rafId=null + early return" idiom).  Subscribed at `'render'`
     * priority since path-tracing IS the render work for this surface.
     */
    private _ptTickDispose: TickListenerDisposer | null = null;
    private _isActive = false;

    // ── Public callbacks ───────────────────────────────────────────────────

    /** Fires whenever the sample count or status changes. */
    onSamplesUpdate?: (samples: number, max: number, status: VPTStatus) => void;
    /** Fires whenever the VPT status changes. */
    onStatusChange?: (status: VPTStatus) => void;
    /** Fires if activation fails. */
    onError?: (err: Error) => void;

    // ── Constructor ────────────────────────────────────────────────────────

    constructor(private readonly _renderer: THREE.WebGLRenderer) {
        this._opts = {
            maxSamples:           1000,
            bounces:              5,
            transmissiveBounces:  2,
            hdriPresetId:         'studio-neutral',
            fStop:                Infinity,
            focalDistance:        10,
            apertureBlades:       6,
        };
    }

    // ── Public getters ─────────────────────────────────────────────────────

    get status():     VPTStatus { return this._status;     }
    get samples():    number    { return this._samples;    }
    get maxSamples(): number    { return this._maxSamples; }
    get active():     boolean   { return this._isActive;   }
    get paused():     boolean   { return this._status === 'paused'; }

    // ── Public API ─────────────────────────────────────────────────────────

    /**
     * Activates in-viewport path tracing.
     *
     * CALLER must already have:
     *   1. Disabled PostproductionRenderer effects
     *   2. Set OBC renderer to MANUAL mode
     *
     * @param scene  - Main THREE.Scene (read for BVH; env temporarily modified)
     * @param camera - Active perspective camera (read-only)
     * @param opts   - Override any default VPT options
     */
    async activate(
        scene:  THREE.Scene,
        camera: THREE.Camera,
        opts:   VPTOptions = {},
    ): Promise<void> {
        if (this._isActive) return;

        this._opts = { ...this._opts, ...opts };
        this._maxSamples = this._opts.maxSamples;
        this._samples    = 0;
        this._isActive   = true;

        this._setStatus('building');

        // Save scene environment so we can restore it on deactivate
        this._savedEnv = scene.environment as THREE.Texture | null;
        this._savedBg  = scene.background  as THREE.Color | THREE.Texture | null;

        try {
            await this._buildPathTracer(scene, camera);
            this._setStatus('accumulating');
            this._startLoop(scene, camera);
        } catch (err: any) {
            this._isActive = false;
            this._setStatus('idle');
            // Fix 4: Dispatch render-status-notice so RenderPanel and any other UI
            // subscriber can surface the fallback reason to the user instead of
            // silently swallowing the error.
            window.dispatchEvent(new CustomEvent('render-status-notice', { // TODO(TASK-15)
                detail: {
                    level: 'warn',
                    message: `Path tracer unavailable — falling back to HQ rasterizer. ${
                        (err instanceof Error ? err.message : String(err))
                    }`,
                },
            }));
            this.onError?.(err instanceof Error ? err : new Error(String(err)));
            throw err;
        }
    }

    /**
     * Deactivates path tracing and restores the scene to its pre-activation state.
     *
     * CALLER must re-enable PostproductionRenderer effects and restore OBC
     * renderer mode after calling this method.
     *
     * @param scene - Main THREE.Scene (environment + background restored)
     */
    deactivate(scene: THREE.Scene): void {
        if (!this._isActive) return;

        this._isActive = false;
        this._stopLoop();
        this._disposePathTracer();

        // Restore scene environment
        scene.environment = this._savedEnv;
        scene.background  = this._savedBg as any;
        this._savedEnv = null;
        this._savedBg  = null;

        this._hdriManager?.dispose();
        this._hdriManager = null;

        this._samples = 0;
        this._setStatus('idle');
    }

    /** Pauses sample accumulation without destroying the path tracer. */
    pause(): void {
        if (!this._isActive || this._status === 'paused') return;
        this._stopLoop();
        this._setStatus('paused');
    }

    /** Resumes accumulation after a pause. */
    resume(): void {
        if (this._status !== 'paused') return;
        const scene  = window.world?.scene?.three  as THREE.Scene;
        const camera = window.world?.camera?.three as THREE.Camera;
        this._setStatus('accumulating');
        this._startLoop(scene, camera);
    }

    /**
     * Resets sample accumulation.
     * Called when the camera moves or scene/settings change.
     */
    reset(): void {
        if (!this._isActive || !this._ptRenderer) return;
        this._ptRenderer.reset();
        this._samples = 0;
        if (this._status === 'converged') {
            this._setStatus('accumulating');
        }
        this.onSamplesUpdate?.(0, this._maxSamples, this._status);
    }

    /**
     * Updates DOF and/or HDRI options without full deactivation.
     * Triggers a reset of the accumulation buffer.
     */
    updateOptions(opts: Partial<VPTOptions>): void {
        Object.assign(this._opts, opts);
        if (opts.maxSamples !== undefined) {
            this._maxSamples = opts.maxSamples;
        }
        if (this._ptMaterial && opts.fStop !== undefined) {
            this._applyDOFToMaterial();
        }
        if (this._isActive) {
            this.reset();
        }
    }

    /**
     * Captures the current accumulated frame as a PNG data URL.
     * Returns null if not active.
     */
    captureCurrentFrame(): string | null {
        if (!this._isActive) return null;
        return this._renderer.domElement.toDataURL('image/png');
    }

    // ── Private: path tracer setup ─────────────────────────────────────────

    private async _buildPathTracer(
        scene:  THREE.Scene,
        camera: THREE.Camera,
    ): Promise<void> {
        // @ts-ignore — three-gpu-pathtracer ships without .d.ts; runtime exports verified in Tier 1
        const ptLib = await import('three-gpu-pathtracer');
        const { PathTracingSceneGenerator, PathTracingRenderer, PhysicalPathTracingMaterial }
            = ptLib as any;

        const { FullScreenQuad } = await import(
            'three/examples/jsm/postprocessing/Pass.js'
        );

        // ── 1. Load HDRI (applies to main scene environment temporarily) ──

        this._hdriManager = new HDRIEnvironmentManager(this._renderer);
        await this._hdriManager.applyPresetAsLightOnly(scene, this._opts.hdriPresetId);

        // ── 2. Build BVH from scene meshes ────────────────────────────────

        const generator = new PathTracingSceneGenerator();
        const ptData    = generator.generate(scene);
        const { bvh, textures, materials, lights } = ptData;
        this._bvh = bvh;

        // Guard: empty BVH (IFC InstancedMesh scenes produce zero-vertex geometry).
        // Throw so the caller can surface the error cleanly via onError callback.
        if (!bvhGeometryIsRenderable(bvh.geometry)) {
            throw new Error('[ViewportPathTracer] BVH geometry has no renderable triangles — cannot activate path tracing.');
        }

        // ── 3. Configure PhysicalPathTracingMaterial ──────────────────────

        const ptMaterial = new PhysicalPathTracingMaterial();
        ptMaterial.bounces             = this._opts.bounces;
        ptMaterial.transmissiveBounces = this._opts.transmissiveBounces;
        ptMaterial.filterGlossyFactor  = 0.5;

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
        ptMaterial.textures.setTextures(this._renderer, 2048, 2048, textures);
        ptMaterial.materials.updateFrom(materials, textures);
        ptMaterial.lights.updateFrom(lights);

        if (scene.environment) {
            ptMaterial.envMapInfo.updateFrom(scene.environment);
        }

        this._ptMaterial = ptMaterial;
        this._applyDOFToMaterial();

        // ── 4. Create PathTracingRenderer on the MAIN renderer ────────────

        const size = new THREE.Vector2();
        this._renderer.getSize(size);

        const ptRenderer = new PathTracingRenderer(this._renderer);
        ptRenderer.setSize(size.x, size.y);
        ptRenderer.camera   = camera;
        ptRenderer.material = ptMaterial;
        ptRenderer.tiles.set(3, 3);

        this._ptRenderer = ptRenderer;

        // ── 5. Blit quad (accumulated texture → viewport canvas) ──────────

        this._fsQuad = new FullScreenQuad(
            new THREE.MeshBasicMaterial({ map: ptRenderer.target.texture }),
        );
    }

    // ── Private: DOF helper ────────────────────────────────────────────────

    private _applyDOFToMaterial(): void {
        if (!this._ptMaterial) return;

        const dofEnabled = isFinite(this._opts.fStop);
        if (dofEnabled) {
            this._ptMaterial.physicalCamera.fStop          = this._opts.fStop;
            this._ptMaterial.physicalCamera.focusDistance  = this._opts.focalDistance;
            this._ptMaterial.physicalCamera.apertureBlades = this._opts.apertureBlades;
        } else {
            // Effectively disable DOF — huge f-stop = fully in focus
            this._ptMaterial.physicalCamera.fStop          = 100;
            this._ptMaterial.physicalCamera.focusDistance  = 10;
            this._ptMaterial.physicalCamera.apertureBlades = 0;
        }
    }

    // ── Private: RAF loop ──────────────────────────────────────────────────

    /**
     * S85.D-finish.3: subscribe to the canonical L5 `getFrameScheduler()`
     * singleton at `'render'` priority instead of owning a private
     * `requestAnimationFrame`.  The tick callback is identical to the
     * pre-migration `tick` body — when it decides the loop should stop
     * (`paused` or `converged`), it self-disposes and nulls
     * `_ptTickDispose`, which is the architectural equivalent of the old
     * `this._rafId = null; return;` idiom.
     */
    private _startLoop(_scene: THREE.Scene, _camera: THREE.Camera): void {
        if (this._ptTickDispose !== null) return;

        const scheduler = getFrameScheduler();
        const dispose = scheduler.addTickListener(
            'viewport-path-tracer',
            () => {
                if (!this._isActive || this._status === 'paused') {
                    if (this._ptTickDispose) {
                        this._ptTickDispose();
                        this._ptTickDispose = null;
                    }
                    return;
                }

                if (this._samples >= this._maxSamples) {
                    this._setStatus('converged');
                    if (this._ptTickDispose) {
                        this._ptTickDispose();
                        this._ptTickDispose = null;
                    }
                    return;
                }

                if (this._ptRenderer && this._fsQuad) {
                    // Render one path-tracing sample into the accumulation target
                    this._ptRenderer.update();
                    this._samples = Math.max(
                        this._samples,
                        Math.floor(this._ptRenderer.samples ?? this._samples + 1),
                    );

                    // Blit accumulated frame to the viewport canvas
                    this._renderer.setRenderTarget(null);
                    this._fsQuad.render(this._renderer);

                    this.onSamplesUpdate?.(this._samples, this._maxSamples, 'accumulating');
                }
            },
            'render',
        );
        this._ptTickDispose = dispose;
        if (!scheduler.isRunning) scheduler.start();
    }

    private _stopLoop(): void {
        if (this._ptTickDispose !== null) {
            this._ptTickDispose();
            this._ptTickDispose = null;
        }
    }

    // ── Private: dispose ───────────────────────────────────────────────────

    private _disposePathTracer(): void {
        this._stopLoop();

        try { this._fsQuad?.dispose();                   } catch {}
        try { (this._ptRenderer as any)?.dispose?.();   } catch {}
        try { this._bvh?.dispose();                     } catch {}

        this._fsQuad     = null;
        this._ptRenderer = null;
        this._ptMaterial = null;
        this._bvh        = null;
    }

    // ── Private: status helper ─────────────────────────────────────────────

    private _setStatus(s: VPTStatus): void {
        this._status = s;
        this.onStatusChange?.(s);
    }
}
