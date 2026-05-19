/**
 * @file src/core/rendering/ShadowQualityUpgrader.ts
 * @description Phase 1 — Shadow quality upgrade system for the real-time
 *   BIM authoring viewport (Enscape benchmark target).
 *
 * CONTRACT (01-BIM-ENGINE-CORE-CONTRACT §4.3, §5):
 *  - NEVER mutates any ElementStore or semantic state.
 *  - Operates only on THREE.WebGLRenderer shadow settings and light objects
 *    in the Three.js projection layer.
 *  - Saves original shadow settings and restores them on dispose().
 *  - Does NOT import @thatopen/* packages.
 *
 * Gap addressed (Audit Section 2.3 — Shadows):
 *   "Hard shadows ❌ / Soft shadows ⚠️ / Cascaded + contact shadows ✅"
 *   The existing setup uses PCFSoftShadowMap but with default (low) shadow
 *   map resolution. This service upgrades to physically-plausible soft
 *   shadows via higher resolution, radius tuning, and bias correction —
 *   matching Enscape's shadow quality model.
 *
 * Quality levels:
 *   standard  — default Three.js (512px, PCFSoft, no change)
 *   high      — 2048px maps, PCFSoft, tuned bias/radius
 *   ultra     — 4096px maps, PCFSoft, tighter bias, 8-sample radius
 */

import * as THREE from '@pryzm/renderer-three/three';

// ── Types ──────────────────────────────────────────────────────────────────

export type ShadowQualityLevel = 'standard' | 'high' | 'ultra';

interface ShadowLightSnapshot {
    light:           THREE.DirectionalLight | THREE.SpotLight | THREE.PointLight;
    mapSize:         THREE.Vector2;
    shadowRadius:    number;
    shadowBias:      number;
    shadowNormalBias: number;
}

interface ShadowQualityConfig {
    mapWidth:         number;
    mapHeight:        number;
    shadowType:       THREE.ShadowMapType;
    radius:           number;   // PCF kernel radius — larger = softer
    bias:             number;   // Shadow bias (negative = pull towards caster)
    normalBias:       number;   // Normal-offset bias — reduces self-shadowing
}

const QUALITY_CONFIGS: Record<ShadowQualityLevel, ShadowQualityConfig> = {
    standard: {
        mapWidth:    512,
        mapHeight:   512,
        shadowType:  THREE.PCFSoftShadowMap,
        radius:      1,
        bias:        -0.0001,
        normalBias:  0.02,
    },
    high: {
        mapWidth:    2048,
        mapHeight:   2048,
        shadowType:  THREE.PCFSoftShadowMap,
        radius:      4,
        bias:        -0.00005,
        normalBias:  0.03,
    },
    ultra: {
        mapWidth:    4096,
        mapHeight:   4096,
        shadowType:  THREE.PCFSoftShadowMap,
        radius:      8,
        bias:        -0.00002,
        normalBias:  0.04,
    },
};

// ── Class ─────────────────────────────────────────────────────────────────

export class ShadowQualityUpgrader {
    private _renderer:     THREE.WebGLRenderer | null = null;
    private _snapshots:    ShadowLightSnapshot[]      = [];
    private _prevShadowType: THREE.ShadowMapType | null = null;
    private _currentLevel: ShadowQualityLevel         = 'standard';
    private _isApplied = false;

    /** Returns the current quality level. */
    get currentLevel(): ShadowQualityLevel { return this._currentLevel; }
    /** Returns true if settings have been applied. */
    get applied(): boolean { return this._isApplied; }

    /**
     * Applies shadow quality upgrade to the renderer and all shadow-casting
     * lights found in the given scene.
     *
     * @param renderer - Main WebGLRenderer
     * @param scene    - Three.js scene (read to find shadow-casting lights)
     * @param level    - Target quality level
     */
    apply(
        renderer: THREE.WebGLRenderer,
        scene:    THREE.Scene,
        level:    ShadowQualityLevel = 'high',
    ): void {
        this._renderer     = renderer;
        this._currentLevel = level;
        this._snapshots    = [];

        const cfg = QUALITY_CONFIGS[level];

        // Save renderer shadow map type, upgrade it
        this._prevShadowType        = renderer.shadowMap.type;
        renderer.shadowMap.type     = cfg.shadowType;
        renderer.shadowMap.enabled  = true;

        // Traverse scene, upgrade every shadow-capable light
        scene.traverse((obj) => {
            if (
                (obj instanceof THREE.DirectionalLight ||
                 obj instanceof THREE.SpotLight        ||
                 obj instanceof THREE.PointLight) &&
                obj.castShadow
            ) {
                // Save original settings for restore
                this._snapshots.push({
                    light:            obj,
                    mapSize:          obj.shadow.mapSize.clone(),
                    shadowRadius:     (obj.shadow as any).radius ?? 1,
                    shadowBias:       obj.shadow.bias,
                    shadowNormalBias: obj.shadow.normalBias,
                });

                // Apply upgrade
                obj.shadow.mapSize.set(cfg.mapWidth, cfg.mapHeight);
                obj.shadow.bias       = cfg.bias;
                obj.shadow.normalBias = cfg.normalBias;
                if ('radius' in obj.shadow) {
                    (obj.shadow as any).radius = cfg.radius;
                }

                // Invalidate shadow map so it is regenerated at new resolution
                if (obj.shadow.map) {
                    obj.shadow.map.dispose();
                    (obj.shadow as any).map = null;
                }
            }
        });

        this._isApplied = true;
        console.log(
            `[ShadowQualityUpgrader] Applied "${level}" — map: ${cfg.mapWidth}px` +
            ` radius: ${cfg.radius} bias: ${cfg.bias}` +
            ` (${this._snapshots.length} light(s) upgraded)`
        );
    }

    /**
     * Restores all shadow settings to their pre-upgrade values.
     * Safe to call even if apply() was never called.
     */
    restore(): void {
        if (!this._isApplied || !this._renderer) return;

        if (this._prevShadowType !== null) {
            this._renderer.shadowMap.type = this._prevShadowType;
        }

        for (const snap of this._snapshots) {
            const sh = snap.light.shadow;
            if (!sh) continue;
            sh.mapSize.copy(snap.mapSize);
            sh.bias       = snap.shadowBias;
            sh.normalBias = snap.shadowNormalBias;
            if ('radius' in sh) {
                (sh as any).radius = snap.shadowRadius;
            }
            if (sh.map) {
                sh.map.dispose();
                (sh as any).map = null;
            }
        }

        this._snapshots    = [];
        this._renderer     = null;
        this._prevShadowType = null;
        this._isApplied    = false;

        console.log('[ShadowQualityUpgrader] Shadow settings restored.');
    }

    /**
     * Changes quality level on-the-fly without a full restore cycle.
     * Requires apply() to have been called first.
     */
    setLevel(level: ShadowQualityLevel): void {
        if (!this._isApplied || !this._renderer) return;
        if (level === this._currentLevel) return;

        const cfg = QUALITY_CONFIGS[level];
        this._currentLevel = level;

        if (this._prevShadowType !== null) {
            this._renderer.shadowMap.type = cfg.shadowType;
        }

        for (const snap of this._snapshots) {
            const sh = snap.light.shadow;
            if (!sh) continue;
            sh.mapSize.set(cfg.mapWidth, cfg.mapHeight);
            sh.bias       = cfg.bias;
            sh.normalBias = cfg.normalBias;
            if ('radius' in sh) {
                (sh as any).radius = cfg.radius;
            }
            if (sh.map) {
                sh.map.dispose();
                (sh as any).map = null;
            }
        }

        console.log(`[ShadowQualityUpgrader] Level changed to "${level}"`);
    }

    dispose(): void {
        this.restore();
    }
}
