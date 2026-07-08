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
 *   standard  — 512px maps, PCFSoft, radius 1 (§FIX-SHADOW-REALLOC-DEVICE-LOSS-PROJECT-SWITCH
 *               / L-189 — REVERTED the L-165 512→1024 bump; see the config note below)
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
        // §FIX-SHADOW-REALLOC-DEVICE-LOSS-PROJECT-SWITCH (L-189) — REVERT the L-165
        // 512→1024 px / radius 1→2 bump. Back to 512 px / radius 1.
        //
        // L-165 (§SPIKE-SHADOW-MAP-ACCURACY) raised `standard` to 1024 to smooth the
        // founder's stair-stepped ground shadow, on the belief that the realloc was fully
        // covered by the freeze/thaw + `_deferReleaseShadowMap` post-submit dispose. It is
        // NOT covered on the PROJECT-SWITCH tier transition:
        //   On project open/switch the tier escalates and `setLevel()` reallocates THIS
        //   map (standard→high, the logged `Level changed to "high"`). setLevel calls
        //   `_deferReleaseShadowMap`, which nulls `sh.map` synchronously and disposes the
        //   OLD ShadowDepthTexture on a SINGLE `setTimeout(0)` macrotask. The renderer-side
        //   freeze (`setShadowReallocFrozen` → `shadowMap.autoUpdate=false`) stops THREE's
        //   OWN in-render realloc, but does not stop the upgrader's explicit `.dispose()`.
        //   A single macrotask does NOT guarantee the pre-freeze frame's GPU submit (which
        //   still references the old texture) has drained — and the LARGER the old texture,
        //   the longer that submit takes to drain. The 1024-px old map widened that window
        //   enough to turn a borderline-safe deferral into a reproducible
        //   "Destroyed texture [ShadowDepthTexture] used in a submit" ×8 → WebGPU device
        //   loss on every project open.
        //
        // 512 px restores the known-good, device-safe timing margin (the old map disposed
        // on the switch realloc is small → its submit drains before the setTimeout(0) fires).
        // The provably-correct alternative (dispose gated on a GPU fence,
        // `device.queue.onSubmittedWorkDone()`) lives in renderer-three/initScene, outside
        // this package's ownership — DO NOT re-bump `standard` above 512 without wiring that
        // fence first. The §SPIKE-SHADOW-MAP-ACCURACY spike doc is retained for that follow-up.
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
     * §SHADOW-DEVICE-LOSS-FIX (Fix 1) — release a light's old ShadowDepthTexture
     * WITHOUT ever disposing it mid-submit.
     *
     * Nulls `sh.map` NOW so THREE regenerates a fresh depth attachment, but DEFERS
     * the GPU `.dispose()` of the OLD texture past the current frame's submit via
     * `setTimeout(0)`. Disposing synchronously while the WebGPU command buffer still
     * references the texture triggers "Destroyed texture [ShadowDepthTexture] used
     * in a submit" → the device is lost → all pipelines/shaders become invalid →
     * "Rendering has stopped".
     *
     * This mirrors the deferral apply() has always used; setLevel()/restore()
     * previously disposed `sh.map` synchronously (the mid-submit crash on the
     * survival office when the tier flips shadow level).
     */
    private static _deferReleaseShadowMap(sh: THREE.LightShadow | undefined | null): void {
        if (!sh || !sh.map) return;
        const oldMap = sh.map;
        (sh as { map: unknown }).map = null;
        setTimeout(() => { try { oldMap.dispose(); } catch { /* already reclaimed */ } }, 0);
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
