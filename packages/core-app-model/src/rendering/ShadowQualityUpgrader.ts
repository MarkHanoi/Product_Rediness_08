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
// §GPU-RESOURCE-LIFETIME (ADR-0297, INVARIANT L2) — a light's old ShadowDepthTexture
// is released at the FRAME BOUNDARY (drained by RenderPipelineManager.render), never
// on a `setTimeout(0)` guess at one. See _deferReleaseShadowMap below for the founder
// P0 this closes.
import { scheduleGpuRelease } from '@pryzm/renderer-three';

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

    /**
     * §SHADOW-DEVICE-LOSS-FIX — shadow-map ON/OFF gate (Fix 2, survival tier).
     *
     * When the scene is enormous (survival tier / >~4000 shadow-casters — the
     * 40-storey office logged 14283 shadow-flagged meshes) allocating a shadow
     * pass over every one of them is what churns the ShadowDepthTexture and loses
     * the WebGPU device. `setShadowsEnabled(false)` turns the shadow map OFF at the
     * renderer AND clears `castShadow` on the upgraded lights so THREE never
     * allocates/renders a shadow pass at all. Reversible via setShadowsEnabled(true)
     * and restore(). Null until apply() runs.
     */
    private _shadowsEnabled = true;
    private _prevShadowMapEnabled: boolean | null = null;
    /** Lights whose castShadow we cleared while shadows are OFF (to restore later). */
    private _lightsShadowDisabled: (THREE.DirectionalLight | THREE.SpotLight | THREE.PointLight)[] = [];

    /** Returns the current quality level. */
    get currentLevel(): ShadowQualityLevel { return this._currentLevel; }
    /** Returns true if settings have been applied. */
    get applied(): boolean { return this._isApplied; }
    /** Whether the shadow map is currently enabled (false ⇒ survival shadows-off). */
    get shadowsEnabled(): boolean { return this._shadowsEnabled; }

    /**
     * §SHADOW-DEVICE-LOSS-FIX (Fix 1) + §GPU-RESOURCE-LIFETIME (ADR-0297 L2) —
     * release a light's old ShadowDepthTexture WITHOUT ever disposing it mid-submit.
     *
     * Nulls `sh.map` NOW so THREE regenerates a fresh depth attachment, and releases
     * the OLD render target AT THE NEXT FRAME BOUNDARY.
     *
     * ── WHY THIS CHANGED (founder P0, 167 elements / 145 walls / 445 meshes) ─────
     * This used to defer the dispose by `setTimeout(…, 0)`. That is a GUESS at a
     * frame boundary, not the frame boundary, and on a real model it loses:
     *
     *   [RenderPipelineManager] §GPU-RESOURCE-LIFETIME destroyed/dangling GPU
     *     resource reached the GPU (GPUDevice.uncapturederror: "Destroyed texture
     *     [Texture "ShadowDepthTexture"] used in a submit. - While calling
     *     [Queue].Submit([[CommandBuffer from CommandEncoder "renderContext_1"]])")
     *
     * Two independent reasons the macrotask deferral is not sufficient:
     *
     *   1. A WebGPU `Queue.submit()` is ASYNCHRONOUS — it returns immediately and
     *      the command buffer keeps referencing the texture until the GPU retires
     *      it. A macrotask can fire while that submit is still in flight. On a
     *      loaded main thread (this project's shadow rebuild measured 1,862 ms)
     *      macrotask ordering relative to rAF is not merely unspecified, it is
     *      routinely wrong.
     *   2. It consulted NOTHING. RenderPipelineManager holds an explicit shadow
     *      guard (`_shadowRebuildPaused` + `setShadowReallocFrozen(true)`) across
     *      the whole async rebuild, precisely so no shadow texture is touched
     *      during it. `apply()` fired straight through that guard — the founder's
     *      log shows `[ShadowQualityUpgrader] Level changed to "high"` INSIDE the
     *      rebuild window. Two drivers reallocating one resource, neither aware of
     *      the other.
     *
     * `scheduleGpuRelease` fixes both: the release is drained by
     * `RenderPipelineManager.render()` at the TOP of a frame — the one instant at
     * which the previous frame is fully encoded and submitted and the next has not
     * begun encoding — so it is ordered against submission by construction, and it
     * is ordered against the shadow guard because the frame owner drains it.
     */
    private static _deferReleaseShadowMap(sh: THREE.LightShadow | undefined | null): void {
        if (!sh || !sh.map) return;
        const oldMap = sh.map;
        // Detach FIRST (invariant L2(a)) — THREE reallocates a fresh depth
        // attachment on the next shadow pass, and nothing reaches the old one.
        (sh as { map: unknown }).map = null;
        scheduleGpuRelease(oldMap as unknown as Parameters<typeof scheduleGpuRelease>[0]);
    }

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
        // §SHADOW-DEVICE-LOSS-FIX — apply() always brings shadows back ON (the
        // survival shadows-off gate is a separate, explicit setShadowsEnabled(false)).
        this._shadowsEnabled       = true;
        this._lightsShadowDisabled = [];

        const cfg = QUALITY_CONFIGS[level];

        // Save renderer shadow map type + enabled flag, upgrade it
        this._prevShadowType         = renderer.shadowMap.type;
        this._prevShadowMapEnabled   = renderer.shadowMap.enabled;
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

                // Invalidate shadow map so it is regenerated at new resolution.
                // §SHADOW-DISPOSE-DEFER (founder 2026-06-19) / §SHADOW-DEVICE-LOSS-FIX —
                // null the map NOW so THREE regenerates it, but DEFER the GPU dispose past
                // the current frame's submit. Disposing synchronously while a command
                // buffer still references the texture triggers "Destroyed texture
                // [ShadowDepthTexture] used in a submit" → device-loss cascade.
                ShadowQualityUpgrader._deferReleaseShadowMap(obj.shadow);
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
        // §SHADOW-DEVICE-LOSS-FIX — restore the renderer's shadowMap.enabled flag
        // (the survival shadows-off gate may have turned it off) and re-arm any
        // lights whose castShadow we cleared.
        if (this._prevShadowMapEnabled !== null) {
            this._renderer.shadowMap.enabled = this._prevShadowMapEnabled;
        }
        for (const light of this._lightsShadowDisabled) light.castShadow = true;
        this._lightsShadowDisabled = [];

        for (const snap of this._snapshots) {
            const sh = snap.light.shadow;
            if (!sh) continue;
            sh.mapSize.copy(snap.mapSize);
            sh.bias       = snap.shadowBias;
            sh.normalBias = snap.shadowNormalBias;
            if ('radius' in sh) {
                (sh as any).radius = snap.shadowRadius;
            }
            // §SHADOW-DEVICE-LOSS-FIX — defer the ShadowDepthTexture dispose past the
            // current submit (was a synchronous sh.map.dispose() — the mid-submit crash).
            ShadowQualityUpgrader._deferReleaseShadowMap(sh);
        }

        this._snapshots    = [];
        this._renderer     = null;
        this._prevShadowType = null;
        this._prevShadowMapEnabled = null;
        this._shadowsEnabled = true;
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
            // §SHADOW-DEVICE-LOSS-FIX — defer the ShadowDepthTexture dispose past the
            // current submit (was a synchronous sh.map.dispose() while the WebGPU queue
            // still referenced it → "Destroyed texture used in a submit" → device lost).
            ShadowQualityUpgrader._deferReleaseShadowMap(sh);
        }

        console.log(`[ShadowQualityUpgrader] Level changed to "${level}"`);
    }

    /**
     * §SHADOW-DEVICE-LOSS-FIX (Fix 2) — turn the whole shadow map ON or OFF.
     *
     * On the survival tier / an enormous scene (the 40-storey office: 14283
     * shadow-flagged meshes) rendering a shadow pass over every caster is what
     * repeatedly churns the ShadowDepthTexture and loses the WebGPU device. Turning
     * shadows OFF removes the shadow pass entirely — a big perf win AND it stops the
     * ShadowDepthTexture allocate/dispose cycle at the source.
     *
     * `enabled=false`:
     *   - sets `renderer.shadowMap.enabled = false` (no shadow pass runs), and
     *   - clears `castShadow` on every upgraded light so THREE does not even attempt
     *     to allocate a shadow map for them; each light's old ShadowDepthTexture is
     *     released via the deferred (post-submit) path — never mid-submit.
     * `enabled=true` reverses both.
     *
     * Requires apply() to have run. Idempotent. Reversed by restore()/dispose().
     */
    setShadowsEnabled(enabled: boolean): void {
        if (!this._isApplied || !this._renderer) return;
        if (enabled === this._shadowsEnabled) return;
        this._shadowsEnabled = enabled;

        this._renderer.shadowMap.enabled = enabled;

        if (!enabled) {
            // Turn shadows OFF: clear castShadow on the upgraded lights and defer the
            // release of their ShadowDepthTexture past the current submit.
            this._lightsShadowDisabled = [];
            for (const snap of this._snapshots) {
                const light = snap.light;
                if (light.castShadow) {
                    light.castShadow = false;
                    this._lightsShadowDisabled.push(light);
                }
                ShadowQualityUpgrader._deferReleaseShadowMap(light.shadow);
            }
            console.log(
                `[ShadowQualityUpgrader] §SHADOW-DEVICE-LOSS-FIX shadows OFF ` +
                `(${this._lightsShadowDisabled.length} light(s) de-shadowed; no shadow pass — survival tier).`,
            );
        } else {
            // Turn shadows back ON: re-arm castShadow on the lights we disabled.
            for (const light of this._lightsShadowDisabled) light.castShadow = true;
            this._lightsShadowDisabled = [];
            console.log('[ShadowQualityUpgrader] §SHADOW-DEVICE-LOSS-FIX shadows ON (shadow pass restored).');
        }
    }

    dispose(): void {
        this.restore();
    }
}
