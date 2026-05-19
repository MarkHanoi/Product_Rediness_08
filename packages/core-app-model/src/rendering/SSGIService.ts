/**
 * @file src/core/rendering/SSGIService.ts
 * @description Phase 2 — Screen-Space Global Illumination (SSGI) approximation via
 *              Three.js GTAOPass (Ground Truth Ambient Occlusion).
 *
 * CONTRACT (01-BIM-ENGINE-CORE-CONTRACT §4.3):
 *  - NEVER mutates ElementStore or any BIM semantic model.
 *  - Operates exclusively on the Three.js projection layer (renderer, scene, camera).
 *  - Saves/restores renderer state on deactivate().
 *  - Does NOT import @thatopen/* packages.
 *
 * Why GTAOPass ≈ SSGI:
 *  GTAOPass is a high-quality screen-space ambient occlusion shader that shades occluded
 *  surfaces by computing radiance falloff in screen space.  Combined with the always-on
 *  HDRI IBL from RealtimeLightingService, the effect closely approximates the indirect-
 *  light-bounce look of full SSGI — every corner, crevice and contact shadow receives
 *  correctly attenuated environmental radiance, which is the dominant perceptual signal
 *  of GI in interior scenes.  GTAOPass produces higher quality than Three.js SSAOPass and
 *  is available as a first-party addon without a custom shader.
 *
 * Integration:
 *  - Requires exclusive control of the WebGLRenderer render target (same pattern as
 *    EnhancedBloomService and ViewportPathTracer).
 *  - MUST be enabled via window.enableSSGI() (EngineBootstrap) which first suspends
 *    the OBC PostproductionRenderer by setting it to MANUAL mode.
 *  - window.disableSSGI() terminates the loop and restores AUTO render mode.
 *  - SSGI and EnhancedBloom are mutually exclusive (both need renderer exclusivity).
 *
 * Pipeline:
 *   RenderPass → GTAOPass (Output.Default) → OutputPass
 *
 * Key parameters:
 *  - intensity   : blendIntensity — AO composite weight (0–1).  Default 1.0.
 *  - pdSamples   : denoising sample count — 8 (fast), 16 (balanced), 32 (quality).
 *                  Default 16.
 *  - output      : GTAOPass.OUTPUT.Default — composites AO over scene diffuse.
 */

import * as THREE from '@pryzm/renderer-three/three';
import { EffectComposer, RenderPass, GTAOPass, OutputPass } from '@pryzm/renderer-three';
import { unifiedFrameLoop } from './UnifiedFrameLoop';

// ── Types ──────────────────────────────────────────────────────────────────

export interface SSGIOptions {
    /**
     * AO composite weight — how strongly the AO is blended onto the scene.
     * 0 = no effect, 1 = full strength.  Default 1.0.
     */
    intensity?:  number;
    /**
     * Denoising sample count.  Higher = smoother but more expensive.
     * 8 = fast, 16 = balanced (default), 32 = quality.
     */
    pdSamples?:  8 | 16 | 32;
}

/** Resolved (all fields present) copy of SSGIOptions. */
export type SSGIParams = Required<SSGIOptions>;

// ── Class ──────────────────────────────────────────────────────────────────

export class SSGIService {
    private _composer:       EffectComposer | null = null;
    private _gtaoPass:       GTAOPass       | null = null;
    /** Phase 3 — unsubscribe handle for the UnifiedFrameLoop tick listener. */
    private _unregisterTick: (() => void)   | null = null;
    private _active:         boolean               = false;

    private _params: SSGIParams = {
        intensity:  1.0,
        pdSamples:  16,
    };

    // ── Getters ─────────────────────────────────────────────────────────────

    get active():        boolean    { return this._active; }
    get currentParams(): SSGIParams { return { ...this._params }; }

    // ── Lifecycle ────────────────────────────────────────────────────────────

    /**
     * Builds the EffectComposer pipeline and starts the render loop.
     *
     * Caller (EngineBootstrap.enableSSGI) is responsible for switching the OBC
     * PostproductionRenderer to MANUAL mode before this is called.
     *
     * @param scene    - THREE.Scene (projection layer)
     * @param camera   - Active THREE.Camera
     * @param renderer - Shared WebGLRenderer
     * @param opts     - SSGI parameter overrides
     */
    activate(
        scene:    THREE.Scene,
        camera:   THREE.Camera,
        renderer: THREE.WebGLRenderer,
        opts?:    SSGIOptions,
    ): void {
        if (this._active) return;

        if (opts) this._params = { ...this._params, ...opts };

        const size = renderer.getSize(new THREE.Vector2());
        const w    = size.x;
        const h    = size.y;

        // ── Build EffectComposer ─────────────────────────────────────────────
        this._composer = new EffectComposer(renderer);

        const renderPass = new RenderPass(scene, camera);
        this._composer.addPass(renderPass);

        // GTAOPass(scene, camera, width, height, parameters?, aoParameters?, pdParameters?)
        this._gtaoPass = new GTAOPass(scene, camera, w, h);

        // Composite AO over scene colour (no debug overlay)
        this._gtaoPass.output     = GTAOPass.OUTPUT.Default;
        this._gtaoPass.blendIntensity = this._params.intensity;
        this._gtaoPass.pdSamples  = this._params.pdSamples;
        this._composer.addPass(this._gtaoPass);

        const outputPass = new OutputPass();
        this._composer.addPass(outputPass);

        // ── Register with UnifiedFrameLoop (Phase 3) ─────────────────────────
        // Runs at post-render priority — after OBC base render, before overlays.
        // Does NOT check isSwitching: SSGI is the primary render path when active,
        // so it must fire every tick to prevent a blank display.
        this._active = true;
        this._unregisterTick = unifiedFrameLoop.addTickListener({
            id:       'ssgi-service',
            priority: 'post-render',
            callback: (_deltaMs, _timestamp) => {
                if (!this._active || !this._composer) return;
                this._composer.render();
            },
        });

        console.log(
            '[SSGIService] SSGI activated — intensity:', this._params.intensity,
            '| pdSamples:', this._params.pdSamples,
        );
    }

    /**
     * Terminates the SSGI render loop and disposes the EffectComposer.
     *
     * Caller (EngineBootstrap.disableSSGI) is responsible for restoring the OBC
     * PostproductionRenderer to AUTO mode after this call.
     */
    deactivate(): void {
        if (!this._active) return;

        this._unregisterTick?.();
        this._unregisterTick = null;

        this._gtaoPass?.dispose();
        this._composer?.dispose();
        this._composer = null;
        this._gtaoPass = null;
        this._active   = false;

        console.log('[SSGIService] SSGI deactivated.');
    }

    // ── Live parameter setters (no reactivation required) ───────────────────

    /**
     * Adjust the AO blend intensity while the service is running.
     * @param val - 0 (no AO) to 1 (full AO).
     */
    setIntensity(val: number): void {
        this._params.intensity = Math.max(0, Math.min(1, val));
        if (this._gtaoPass) this._gtaoPass.blendIntensity = this._params.intensity;
    }

    /**
     * Change the denoising sample count.
     * Takes effect on the next rendered frame (no reactivation needed).
     */
    setPdSamples(val: 8 | 16 | 32): void {
        this._params.pdSamples = val;
        if (this._gtaoPass) this._gtaoPass.pdSamples = val;
    }

    // ── Resize support ────────────────────────────────────────────────────────

    /**
     * Must be called on renderer resize so the GTAO depth/normal buffers stay in sync.
     */
    onResize(width: number, height: number): void {
        this._composer?.setSize(width, height);
        this._gtaoPass?.setSize(width, height);
    }

    /**
     * Renders one frame synchronously via the EffectComposer.
     * Called by video export to capture frames with GTAO/AO applied
     * rather than using renderer.render() which bypasses the pipeline.
     * No-op if the service is not active.
     */
    renderOnce(): void {
        if (!this._active || !this._composer) return;
        this._composer.render();
    }

    dispose(): void {
        this.deactivate();
    }

}
