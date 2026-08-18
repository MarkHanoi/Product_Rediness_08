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
// §SHADOW-MAP-REALLOC-AT-BOUNDARY (founder P0, 2026-08-10) — a light-owned shadow
// map is NEVER nulled or disposed from here. Its resolution change is enqueued and
// performed by the frame owner (RenderPipelineManager.render) at the frame
// boundary via the target's OWN setSize(). See _scheduleShadowMapRealloc below.
import { scheduleShadowMapRealloc } from '@pryzm/renderer-three';

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

// §FIX-SHADOW-SAMPLER-TYPE-PARITY (founder P0 session, 2026-08-07) — the shadow
// type must be one the INSTALLED three actually compiles, or intended and actual
// diverge and shaders bind the wrong sampler class.
//
// THE 216× FLOOD THIS CLOSES:
//   GL_INVALID_OPERATION: glDrawElements: Mismatch between texture format and
//   sampler type (signed/unsigned/float/shadow)   ×216, then
//   "WebGL: too many errors, no more errors will be reported"
//
// CAUSAL CHAIN, traced through the installed three@0.183.2 (every step cited):
//   1. These configs wrote `renderer.shadowMap.type = THREE.PCFSoftShadowMap`.
//   2. SHADER SIDE — a material compiled while that value is live snapshots it
//      (WebGLPrograms.js:345) and looks it up in `shadowMapTypeDefines`
//      (WebGLProgram.js:345-347), which in r183 has entries ONLY for PCFShadowMap
//      and VSMShadowMap. PCFSoft falls through to 'SHADOWMAP_TYPE_BASIC' — the
//      shader declares plain `sampler2D` shadow samplers (non-comparison).
//   3. TEXTURE SIDE — at the next shadow render, THREE's deprecation shim runs
//      FIRST ("PCFSoftShadowMap has been deprecated. Using PCFShadowMap instead.",
//      WebGLShadowMap.js:98-103, the exact warning in the founder's log), then
//      allocates the depth texture under PCF rules: `compareFunction =
//      LessEqualCompare` (WebGLShadowMap.js:260-265) → the driver sets
//      TEXTURE_COMPARE_MODE = COMPARE_REF_TO_TEXTURE (WebGLTextures.js:645-648).
//   4. THE HEALING RECOMPILE NEVER FIRES — `_previousType` initialises to PCF
//      (WebGLShadowMap.js:88-89) and the shim resets `this.type` to PCF BEFORE the
//      `typeChanged` check (line 130), so `typeChanged === false` and the
//      "materials need recompilation because sampler types change" traverse
//      (THREE's own comment, line 132) is skipped.
//
//   Net: a COMPARE_REF_TO_TEXTURE depth texture sampled through a plain
//   `sampler2D` — the driver rejects every such draw, shadows die, and the error
//   channel drowns ("too many errors"). Only materials compiled DURING the
//   PCFSoft window are poisoned, which is why the founder saw 216 occurrences and
//   not every draw: the scene is a mix of poisoned and healthy programs.
//
// FIX: name PCFShadowMap — the type three r183 actually runs (the shim substitutes
// it anyway; PCFSoft has not been a distinct shader path since the deprecation).
// Intended == actual from the first write, so no compile window exists in which
// `shadowMapType` names a define that does not exist. Visual delta: none — every
// prior session was ALREADY rendering PCF after the shim; the "soft" look comes
// from `shadow.radius`, which we keep setting per tier.
const QUALITY_CONFIGS: Record<ShadowQualityLevel, ShadowQualityConfig> = {
    standard: {
        mapWidth:    512,
        mapHeight:   512,
        shadowType:  THREE.PCFShadowMap, // §FIX-SHADOW-SAMPLER-TYPE-PARITY
        radius:      1,
        bias:        -0.0001,
        normalBias:  0.02,
    },
    high: {
        mapWidth:    2048,
        mapHeight:   2048,
        shadowType:  THREE.PCFShadowMap, // §FIX-SHADOW-SAMPLER-TYPE-PARITY
        radius:      4,
        bias:        -0.00005,
        normalBias:  0.03,
    },
    ultra: {
        mapWidth:    4096,
        mapHeight:   4096,
        shadowType:  THREE.PCFShadowMap, // §FIX-SHADOW-SAMPLER-TYPE-PARITY
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
    /**
     * §SHADOW-ENABLE-IS-NOT-OURS (L-1000) — RETAINED FOR DIAGNOSTICS ONLY.
     *
     * This used to be a save/restore slot for `renderer.shadowMap.enabled`. It is
     * no longer written back to the renderer by ANY method on this class; see the
     * §SHADOW-ENABLE-IS-NOT-OURS block on {@link apply}. It is kept because the
     * value observed at bind time is genuine evidence (a `true` here on the OBC
     * renderer means somebody else has already breached the L-205 invariant) and
     * because deleting it would silently drop that signal.
     */
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
     * §SHADOW-MAP-REALLOC-AT-BOUNDARY (founder P0, 2026-08-10) — apply a mapSize
     * change to a live light WITHOUT ever destroying a texture the renderer still
     * uses. Supersedes §SHADOW-DEVICE-LOSS-FIX Fix 1 / the ADR-0297 L2 deferred
     * release, both of which were built on a WebGL-era assumption that is FALSE
     * on the WebGPU node path.
     *
     * ── WHY THIS CHANGED (founder P0 crash: new project → a few walls → dead viewport) ──
     * The previous revision nulled `sh.map` and queued the old render target on the
     * frame-boundary GPU release queue. On the WebGL renderer that is correct:
     * `WebGLShadowMap` re-reads `shadow.map` and allocates a fresh target when it is
     * null. On the WebGPU node path it is a use-after-free BY CONSTRUCTION:
     * three r183's `ShadowNode` keeps ITS OWN reference to the same render target
     * (`this.shadowMap`, ShadowNode.js:563-564 assigns both) and never re-reads
     * `shadow.map`. So the boundary drain destroyed the ShadowDepthTexture while the
     * node kept rendering into and sampling it every subsequent frame:
     *
     *   Destroyed texture [Texture "ShadowDepthTexture"] used in a submit.
     *     — While calling [Queue].Submit([[CommandBuffer from CommandEncoder
     *       "renderContext_1"]])
     *
     * …on EVERY frame, unrecoverably: the destroyed target's size still matched
     * `mapSize`, so `ShadowNode.renderShadow()`'s own `setSize` (ShadowNode.js:662)
     * never re-created it, and a pipeline rebuild cannot reach a light-owned map
     * (§RECOVERY-MUST-REFUSE) — the founder's infinite refuse/recover loop.
     *
     * The correct realloc: hand the REQUESTED resolution to the queue and let
     * THREE's own target perform its resize — ORDERED, at the frame boundary,
     * not wherever the depth pass happens to run mid-encode.
     * `scheduleShadowMapRealloc` captures the request; `RenderPipelineManager.render()`
     * drains the queue at the top of a frame (after the previous submit, before any
     * encoder exists, never while the map is frozen), writes `shadow.mapSize` and
     * calls `shadow.map.setSize(…)` — the one instant at which THREE's internal
     * dispose-and-recreate cannot land inside a submit. `sh.map` is NEVER nulled and
     * the old target is NEVER disposed from here (ADR-0111 / C04 §SHADOW).
     *
     * §SHADOW-MAPSIZE-WRITE-AT-BOUNDARY (L-819) — `shadow.mapSize` is NOT written
     * here anymore either. The first revision wrote mapSize on the mutation tick and
     * deferred only the resize, leaving a frames-long window in which mapSize (2048)
     * disagreed with the allocated map (512). Any `needsUpdate = true` from ANY
     * writer (needsUpdate OVERRIDES every freeze — the L-197 lesson; the live
     * offender was RenderPerformanceService.setQualityLevel's per-light poke) made
     * three's ShadowNode run its OWN `shadowMap.setSize(mapSize)` MID-PASS, inside
     * the open command encoder — destroying the ShadowDepthTexture that encoder's
     * earlier draws referenced → "Destroyed texture … used in a submit
     * (renderContext_1)" on saved-project open. Deferring the WRITE removes the
     * divergence window entirely.
     */
    private static _scheduleShadowMapRealloc(
        sh: THREE.LightShadow | undefined | null,
        width: number,
        height: number,
    ): void {
        if (!sh) return;
        scheduleShadowMapRealloc(
            sh as unknown as Parameters<typeof scheduleShadowMapRealloc>[0],
            width,
            height,
        );
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

        // ── §SHADOW-ENABLE-IS-NOT-OURS (L-1000, founder P0 2026-08-18 / L-981) ──
        //
        // `renderer.shadowMap.enabled` is NOT WRITTEN HERE. This line used to read
        // `renderer.shadowMap.enabled = true`, and that single write is the whole of
        // the founder's project-open crash.
        //
        // WHICH RENDERER THIS IS. `RenderingPipelineCoordinator` constructs the only
        // ShadowQualityUpgrader in the app and binds it to whatever renderer
        // `initScene.ts:2310` hands `coordinator.bind(scene, renderer)` — which is
        // `postproductionRenderer.three`: **OBC's WebGL renderer**, not the live PRYZM
        // WebGPU renderer. The coordinator's own header says so
        // (`RenderingPipelineCoordinator.ts:472`, §PERF-HEAVY-SHADOW-OFF).
        //
        // WHY THE WRITE IS FATAL. Both renderers draw the SAME scene, so both see the
        // same Pascal key light, and a THREE light has exactly ONE `LightShadow.map`
        // slot. In three r183 `WebGLShadowMap.render()`:
        //     :93   if ( scope.enabled === false ) return;      ← the gate we re-armed
        //     :203  if ( shadow.map === null || typeChanged ) {
        //     :209      shadow.map.depthTexture.dispose();
        //     :214      shadow.map.dispose();   ← frees the LIVE WebGPU target
        //     :227      shadow.map = new WebGLRenderTarget( … );
        // The WebGPU `ShadowNode` holds its OWN reference to that target
        // (ShadowNode.js:563-564) and keeps sampling it every frame, so the free lands
        // as "Destroyed texture [Texture \"ShadowDepthTexture\"] used in a submit" —
        // and it happens on an OBC frame: outside `RenderPipelineManager.render()`,
        // outside every freeze latch, outside BOTH boundary queues, and unreachable
        // from `_rebuildPipeline()`. That last property is exactly why
        // §RECOVERY-MUST-REFUSE correctly refuses and why L-981's bounded ladder
        // spends 2/2 and the viewport still dies.
        //
        // FOUR OTHER MODULES ALREADY DECLARE THIS INVARIANT, and this class was the
        // one violator: `BimWorld.ts:117` (§FIX-SHADOWMAP-DUAL-RENDERER-CLAIM, L-205 —
        // "MUST stay false"), `initScene.ts:1948/1979/2057` (asserted three times over
        // the Phase-5 hand-over), `ViewController.ts:2486` ("BUG-FIX (bug 1):
        // shadowMap.enabled MUST remain false"), and
        // `RenderPipelineManager._applyShadowEnabledState()` — the L1 THREE owner
        // (P2), which names itself "THE ONLY writer of `renderer.shadowMap.enabled`"
        // and composes user preferences with ref-counted transient suppressions.
        // THAT is the single declared authority for "may a shadow pass run"; an L4
        // quality service is not. Callers that genuinely need shadows on or off
        // dispatch into `setShadowsEnabledPreference()` / the suppression API there
        // (as `initUI.ts:2798`'s Cast-shadows toggle already does).
        //
        // The RESOLUTION half of this class is unaffected and still lands, ordered,
        // through §SHADOW-MAP-REALLOC-AT-BOUNDARY below.
        this._prevShadowType         = renderer.shadowMap.type;
        this._prevShadowMapEnabled   = renderer.shadowMap.enabled;
        if (this._prevShadowMapEnabled) {
            console.warn(
                '[ShadowQualityUpgrader] §SHADOW-ENABLE-IS-NOT-OURS the bound renderer already has ' +
                'shadowMap.enabled=true. This class no longer writes that flag, so it was armed by ' +
                'someone else — if this renderer is OBC\'s WebGL one, that is the L-205 dual-renderer ' +
                'claim and it will free the live WebGPU ShadowDepthTexture. See BimWorld.ts:117.',
            );
        }
        // §FIX-SHADOW-SAMPLER-TYPE-PARITY — the TYPE write is retained. It is safe in a
        // way the `enabled` write never was: every QUALITY_CONFIGS tier names
        // PCFShadowMap, which is also THREE's default, so this assignment is a no-op
        // against the value the renderer already carries and can never flip
        // `typeChanged` (WebGLShadowMap.js:203) on a foreign pass.
        renderer.shadowMap.type     = cfg.shadowType;

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

                // Apply upgrade. Timing/quality scalars are safe to write on this
                // tick; the RESOLUTION is not — see §SHADOW-MAPSIZE-WRITE-AT-BOUNDARY.
                obj.shadow.bias       = cfg.bias;
                obj.shadow.normalBias = cfg.normalBias;
                if ('radius' in obj.shadow) {
                    (obj.shadow as any).radius = cfg.radius;
                }

                // §SHADOW-MAP-REALLOC-AT-BOUNDARY / §SHADOW-MAPSIZE-WRITE-AT-BOUNDARY
                // (L-819) — request a frame-ordered realloc to the new resolution.
                // BOTH the `mapSize` write and the target resize land at the frame
                // boundary, so the allocated map and `mapSize` can never disagree
                // across a frame (the divergence three's ShadowNode turns into a
                // mid-encode destroy). The map is NOT nulled and the old target is
                // NOT disposed here: the WebGPU ShadowNode owns it and would keep
                // submitting the destroyed texture forever (the founder's P0).
                ShadowQualityUpgrader._scheduleShadowMapRealloc(obj.shadow, cfg.mapWidth, cfg.mapHeight);
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
        // §SHADOW-ENABLE-IS-NOT-OURS (L-1000) — `shadowMap.enabled` is NOT restored
        // here either. There is nothing to restore: apply() no longer changes it, so
        // writing it back could only ever CLOBBER a value the real owner
        // (RenderPipelineManager._applyShadowEnabledState) has since computed from the
        // live preference + suppression latches. A restore of a value we never took is
        // not symmetry, it is a second writer with a stale snapshot.
        // Re-arm any lights whose castShadow we cleared — that lever IS ours.
        for (const light of this._lightsShadowDisabled) light.castShadow = true;
        this._lightsShadowDisabled = [];

        for (const snap of this._snapshots) {
            const sh = snap.light.shadow;
            if (!sh) continue;
            sh.bias       = snap.shadowBias;
            sh.normalBias = snap.shadowNormalBias;
            if ('radius' in sh) {
                (sh as any).radius = snap.shadowRadius;
            }
            // §SHADOW-MAP-REALLOC-AT-BOUNDARY / §SHADOW-MAPSIZE-WRITE-AT-BOUNDARY —
            // frame-ordered realloc back to the restored resolution (mapSize write
            // included); never disposes the light-owned target from here.
            ShadowQualityUpgrader._scheduleShadowMapRealloc(sh, snap.mapSize.width, snap.mapSize.height);
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
            sh.bias       = cfg.bias;
            sh.normalBias = cfg.normalBias;
            if ('radius' in sh) {
                (sh as any).radius = cfg.radius;
            }
            // §SHADOW-MAP-REALLOC-AT-BOUNDARY / §SHADOW-MAPSIZE-WRITE-AT-BOUNDARY —
            // frame-ordered realloc at the new resolution (mapSize write deferred to
            // the boundary too); never nulls/disposes the light-owned target here.
            ShadowQualityUpgrader._scheduleShadowMapRealloc(sh, cfg.mapWidth, cfg.mapHeight);
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
     * `enabled=false` clears `castShadow` on every upgraded light so THREE does not
     * even attempt to allocate a shadow map for them; each light's old
     * ShadowDepthTexture is released by THREE on its own schedule, ordered by
     * `RenderPipelineManager.runShadowCasterMutation()` (the coordinator wraps this
     * call in it — §FIX-SHADOW-TIER-CASTER-DESTROY, L-908). `enabled=true` reverses it.
     *
     * §SHADOW-ENABLE-IS-NOT-OURS (L-1000) — this method NO LONGER writes
     * `renderer.shadowMap.enabled`. It used to write it on the OBC WebGL renderer the
     * coordinator binds, which re-armed the gate at WebGLShadowMap.js:93 and let a
     * second renderer free the live WebGPU ShadowDepthTexture (see apply()). `castShadow`
     * was always the lever that actually does the work on the WebGPU path — the flag
     * write added nothing but the crash. The renderer-level flag belongs to
     * `RenderPipelineManager._applyShadowEnabledState()`, the L1 THREE owner (P2), which
     * is the single declared authority for it.
     *
     * Requires apply() to have run. Idempotent. Reversed by restore()/dispose().
     */
    setShadowsEnabled(enabled: boolean): void {
        if (!this._isApplied || !this._renderer) return;
        if (enabled === this._shadowsEnabled) return;
        this._shadowsEnabled = enabled;

        if (!enabled) {
            // Turn shadows OFF: clear castShadow on the upgraded lights. The light-owned
            // shadow map is deliberately LEFT ALONE (§SHADOW-MAP-REALLOC-AT-BOUNDARY /
            // ADR-0111): on the WebGPU node path, clearing castShadow makes THREE's own
            // AnalyticLightNode drop its ShadowNode (and the map) on its own schedule;
            // destroying it from here is the mid-submit use-after-free this fix removes.
            this._lightsShadowDisabled = [];
            for (const snap of this._snapshots) {
                const light = snap.light;
                if (light.castShadow) {
                    light.castShadow = false;
                    this._lightsShadowDisabled.push(light);
                }
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
