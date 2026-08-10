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
 *  2. Shadow map memory management — REMOVED (§L-819). Shadow-map resolution is a
 *     function of the quality tier (`shadow.mapSize`), not of DPR; the old
 *     per-light `needsUpdate = true` traverse defeated the renderer's shadow
 *     freeze latches (L-197 defect class) and helped destroy a submit-referenced
 *     ShadowDepthTexture on project load. Shadow refresh is owned by
 *     §SHADOW-MAP-REALLOC-AT-BOUNDARY + RenderPipelineManager.requestShadowRefresh().
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
    /**
     * Retained for API compatibility with bind(renderer, scene) callers; no longer
     * read since §L-819 removed the freeze-defeating per-light shadow poke.
     */
    protected _scene:        THREE.Scene         | null = null;
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

        // §L-819 — the per-light `shadow.needsUpdate = true` traverse that used to
        // live here is REMOVED, for two reasons:
        //
        //   1. It was FALSE in premise: a shadow map's resolution is a function of
        //      `light.shadow.mapSize` (quality tier), not of the renderer's DPR. A
        //      DPR change never invalidates a shadow depth buffer, so the poke bought
        //      no correctness — the comment "rebuild at the new DPR" described a
        //      dependency that does not exist.
        //   2. It was the SECOND freeze-defeating writer of the L-197 defect class:
        //      `needsUpdate` OVERRIDES `autoUpdate=false` in three's ShadowNode
        //      (`needsUpdate || autoUpdate`), so this direct poke forced the shadow
        //      depth pass to run inside every freeze window (project-load tier
        //      escalation, the L-231 shadow-rebuild guard). Combined with a pending
        //      mapSize change it made three's ShadowNode perform its own mid-encode
        //      `shadowMap.setSize()` → "Destroyed texture [ShadowDepthTexture] used
        //      in a submit (renderContext_1)" — the saved-project-open P0.
        //
        // Shadow refreshes are owned by the frame-boundary realloc queue
        // (§SHADOW-MAP-REALLOC-AT-BOUNDARY, @pryzm/renderer-three) and the
        // freeze-aware RenderPipelineManager.requestShadowRefresh() (L-197).

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
