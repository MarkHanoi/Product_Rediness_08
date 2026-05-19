/**
 * @file src/core/rendering/RenderPerformanceService.ts
 * @description Phase 2 — Render performance optimisation.
 *
 * CONTRACT (01-BIM-ENGINE-CORE-CONTRACT §4.3, §5):
 *  - NEVER mutates ElementStore or any BIM semantic state.
 *  - Operates exclusively on the Three.js projection layer.
 *  - Saves renderer state on bind(); restores on restore() / dispose().
 *  - Does NOT import @thatopen/* packages.
 *
 * Techniques implemented:
 *  1. Device pixel ratio (DPR) scaling per quality level.
 *     - Standard : 75 % of native DPR  → fewer fragment shaders, biggest speed gain.
 *     - High     : 100 % of native DPR → crisp authoring default.
 *     - Ultra    : 125 % of native DPR → supersampling for final review / screenshot.
 *     DPR is clamped to 2.5 max to avoid memory pressure on HiDPI displays.
 *
 *  2. Shadow map memory management.
 *     Enumerates all shadow-casting lights and calls needsUpdate = true after any
 *     DPR change so stale depth buffers are rebuilt at the new ratio.
 *
 *  3. Renderer statistics snapshot.
 *     getStats() returns a lightweight copy of renderer.info for the UI status bar
 *     (draw calls, triangles, geometries, textures, programs).
 *
 * Not implemented (and why):
 *  - Automatic InstancedMesh conversion: IFC meshes are emitted as unique
 *    BufferGeometry objects by the @thatopen loader; merging them requires
 *    knowledge of their transform hierarchy, which is kernel-internal state.
 *    LOD: Three.js LOD objects require pre-authored low-poly alternatives which
 *    do not exist for procedurally-generated BIM geometry.
 *    Both techniques remain viable as a future opt-in export post-process step.
 *
 * Exposed on window (EngineBootstrap):
 *   window.renderPerformanceService
 *   window.setRenderQualityLevel  (alias for setQualityLevel)
 *
 * @see docs/Photorealistic/realtime-authoring-viewport-pipeline.md §Phase 2
 */

import * as THREE from '@pryzm/renderer-three/three';

// ── Types ───────────────────────────────────────────────────────────────────

export type RenderQualityLevel = 'standard' | 'high' | 'ultra';

export interface RenderStats {
    drawCalls:  number;
    triangles:  number;
    geometries: number;
    textures:   number;
    programs:   number;
    pixelRatio: number;
    dprScale:   number;
}

// ── Class ───────────────────────────────────────────────────────────────────

export class RenderPerformanceService {

    private _renderer:       THREE.WebGLRenderer | null = null;
    private _scene:          THREE.Scene         | null = null;
    private _savedPixelRatio: number                    = 1;
    private _currentLevel:   RenderQualityLevel | null = null;

    // ── DPR scale factors per level ─────────────────────────────────────────

    private static readonly DPR_SCALE: Record<RenderQualityLevel, number> = {
        standard: 0.75,
        high:     1.00,
        ultra:    1.25,
    };

    private static readonly DPR_MAX = 2.5;

    // ── Lifecycle ────────────────────────────────────────────────────────────

    /**
     * One-time bind after engine init.  Must be called before setQualityLevel().
     */
    bind(renderer: THREE.WebGLRenderer, scene?: THREE.Scene): void {
        this._renderer       = renderer;
        this._savedPixelRatio = renderer.getPixelRatio();
        if (scene) this._scene = scene;
        console.log(
            '[RenderPerformanceService] Bound — native DPR:',
            this._savedPixelRatio.toFixed(2),
        );
    }

    /**
     * Apply performance settings for the given quality level.
     * Safe to call multiple times (idempotent for the same level).
     */
    setQualityLevel(level: RenderQualityLevel): void {
        if (!this._renderer) {
            console.warn('[RenderPerformanceService] Not bound — call bind() first.');
            return;
        }

        const scale    = RenderPerformanceService.DPR_SCALE[level];
        const nativeDpr = window.devicePixelRatio || 1;
        const targetDpr = Math.min(nativeDpr * scale, RenderPerformanceService.DPR_MAX);

        this._renderer.setPixelRatio(targetDpr);
        this._currentLevel = level;

        // Invalidate shadow maps so depth buffers rebuild at the new DPR
        if (this._scene) {
            this._scene.traverse((obj) => {
                if ((obj as THREE.Light).isLight) {
                    const light = obj as THREE.Light;
                    if ((light as any).shadow) {
                        (light as any).shadow.needsUpdate = true;
                    }
                }
            });
        }

        console.log(
            `[RenderPerformanceService] Quality → ${level} | DPR: ${targetDpr.toFixed(2)}`,
            `(${(scale * 100).toFixed(0)}% of native ${nativeDpr.toFixed(2)})`,
        );
    }

    /**
     * Returns a snapshot of renderer statistics for the status bar HUD.
     * Returns null if the service is not yet bound.
     */
    getStats(): RenderStats | null {
        if (!this._renderer) return null;
        const info = this._renderer.info;
        return {
            drawCalls:  info.render.calls,
            triangles:  info.render.triangles,
            geometries: info.memory.geometries,
            textures:   info.memory.textures,
            programs:   info.programs?.length ?? 0,
            pixelRatio: this._renderer.getPixelRatio(),
            dprScale:   this._currentLevel
                ? RenderPerformanceService.DPR_SCALE[this._currentLevel]
                : 1,
        };
    }

    /**
     * Current quality level, or null if setQualityLevel() has not been called.
     */
    get currentLevel(): RenderQualityLevel | null { return this._currentLevel; }

    /**
     * Restore the renderer to its original pixel ratio.
     * Called internally by dispose(); can also be called standalone.
     */
    restore(): void {
        if (this._renderer) {
            this._renderer.setPixelRatio(this._savedPixelRatio);
            console.log(
                '[RenderPerformanceService] Restored DPR:',
                this._savedPixelRatio.toFixed(2),
            );
        }
        this._currentLevel = null;
    }

    dispose(): void {
        this.restore();
        this._renderer = null;
        this._scene    = null;
    }
}
