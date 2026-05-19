/**
 * @file src/core/rendering/EnhancedBloomService.ts
 * @description Phase 2 — Enhanced bloom via Three.js EffectComposer + UnrealBloomPass.
 *
 * CONTRACT (01-BIM-ENGINE-CORE-CONTRACT §4.3):
 *  - NEVER mutates ElementStore or any BIM semantic model.
 *  - Operates exclusively on the Three.js projection layer (renderer, scene, camera).
 *  - Saves/restores renderer state on deactivate().
 *  - Does NOT import @thatopen/* packages.
 *
 * Integration:
 *  - Bloom rendering requires exclusive control of the WebGLRenderer render target.
 *  - MUST be enabled via window.enableEnhancedBloom() (EngineBootstrap) which first
 *    suspends the OBC PostproductionRenderer by setting it to MANUAL mode — the same
 *    pattern used by ViewportPathTracer.
 *  - When active, runs its own requestAnimationFrame loop via EffectComposer.render().
 *  - window.disableEnhancedBloom() terminates the loop and restores AUTO render mode.
 *
 * Pipeline:
 *   RenderPass → UnrealBloomPass → OutputPass
 *
 * Bloom parameters:
 *  - threshold : luminance threshold for pixels that bloom (0 = everything glows)
 *  - strength  : bloom intensity multiplier (clamped 0–3)
 *  - radius    : bloom diffusion spread (0–1)
 */

import * as THREE from '@pryzm/renderer-three/three';
import { EffectComposer, RenderPass, UnrealBloomPass, OutputPass } from '@pryzm/renderer-three';
import { unifiedFrameLoop } from './UnifiedFrameLoop';

// ── Types ──────────────────────────────────────────────────────────────────

export interface BloomOptions {
    /** Luminance threshold: pixels dimmer than this do not bloom. 0–1. Default 0.5. */
    threshold?: number;
    /** Bloom intensity multiplier. 0–3. Default 1.0. */
    strength?:  number;
    /** Bloom diffusion radius. 0–1. Default 0.4. */
    radius?:    number;
}

// ── Class ──────────────────────────────────────────────────────────────────

export class EnhancedBloomService {
    private _composer:       EffectComposer  | null = null;
    private _bloomPass:      UnrealBloomPass | null = null;
    /** Phase 3 — unsubscribe handle for the UnifiedFrameLoop tick listener. */
    private _unregisterTick: (() => void)    | null = null;
    private _active:         boolean                = false;

    private _params: Required<BloomOptions> = {
        threshold: 0.5,
        strength:  1.0,
        radius:    0.4,
    };

    // ── Getters ─────────────────────────────────────────────────────────────

    get active():          boolean              { return this._active; }
    get currentParams():   Required<BloomOptions> { return { ...this._params }; }

    // ── Lifecycle ────────────────────────────────────────────────────────────

    /**
     * Builds the EffectComposer pipeline and starts the render loop.
     *
     * Caller (EngineBootstrap.enableEnhancedBloom) is responsible for switching
     * the OBC PostproductionRenderer to MANUAL mode before this is called.
     *
     * @param scene    - THREE.Scene (projection layer)
     * @param camera   - Active THREE.Camera
     * @param renderer - Shared WebGLRenderer
     * @param opts     - Bloom parameter overrides
     */
    activate(
        scene:    THREE.Scene,
        camera:   THREE.Camera,
        renderer: THREE.WebGLRenderer,
        opts?:    BloomOptions,
    ): void {
        if (this._active) return;

        if (opts) this._params = { ...this._params, ...opts };

        const size       = renderer.getSize(new THREE.Vector2());
        const pixelRatio = renderer.getPixelRatio();
        const w          = size.x * pixelRatio;
        const h          = size.y * pixelRatio;

        // ── Build EffectComposer ─────────────────────────────────────────────
        this._composer = new EffectComposer(renderer);

        const renderPass = new RenderPass(scene, camera);
        this._composer.addPass(renderPass);

        this._bloomPass = new UnrealBloomPass(
            new THREE.Vector2(w, h),
            this._params.strength,
            this._params.radius,
            this._params.threshold,
        );
        this._composer.addPass(this._bloomPass);

        const outputPass = new OutputPass();
        this._composer.addPass(outputPass);

        // ── Register with UnifiedFrameLoop (Phase 3) ─────────────────────────
        // Runs at post-render priority — after OBC base render, before overlays.
        // Does NOT check isSwitching: bloom is the primary render path when active,
        // so it must fire every tick to prevent a blank display.
        this._active = true;
        this._unregisterTick = unifiedFrameLoop.addTickListener({
            id:       'enhanced-bloom-service',
            priority: 'post-render',
            callback: (_deltaMs, _timestamp) => {
                if (!this._active || !this._composer) return;
                this._composer.render();
            },
        });

        console.log(
            '[EnhancedBloomService] Bloom activated — threshold:', this._params.threshold,
            '| strength:', this._params.strength,
            '| radius:', this._params.radius,
        );
    }

    /**
     * Terminates the bloom render loop and disposes the EffectComposer.
     *
     * Caller (EngineBootstrap.disableEnhancedBloom) is responsible for restoring
     * the OBC PostproductionRenderer to AUTO mode after this call.
     */
    deactivate(): void {
        if (!this._active) return;

        this._unregisterTick?.();
        this._unregisterTick = null;

        this._composer?.dispose();
        this._composer  = null;
        this._bloomPass = null;
        this._active    = false;

        console.log('[EnhancedBloomService] Bloom deactivated.');
    }

    // ── Parameter setters (live, no reactivation required) ───────────────────

    setStrength(val: number): void {
        this._params.strength = Math.max(0, Math.min(3, val));
        if (this._bloomPass) this._bloomPass.strength = this._params.strength;
    }

    setThreshold(val: number): void {
        this._params.threshold = Math.max(0, Math.min(1, val));
        if (this._bloomPass) this._bloomPass.threshold = this._params.threshold;
    }

    setRadius(val: number): void {
        this._params.radius = Math.max(0, Math.min(1, val));
        if (this._bloomPass) this._bloomPass.radius = this._params.radius;
    }

    // ── Resize support ────────────────────────────────────────────────────────

    /**
     * Must be called on renderer resize so the bloom buffers stay in sync.
     * EngineBootstrap wires this to the window 'resize' event.
     */
    onResize(width: number, height: number, pixelRatio: number): void {
        const w = width  * pixelRatio;
        const h = height * pixelRatio;
        this._composer?.setSize(w, h);
        this._bloomPass?.setSize(w, h);
    }

    dispose(): void {
        this.deactivate();
    }

}
