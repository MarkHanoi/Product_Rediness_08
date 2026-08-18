/**
 * @file src/core/rendering/RenderingPipelineCoordinator.ts
 * @description Dual rendering pipeline coordinator — Section 5 of the
 *   High-End Rendering Audit & Implementation Plan.
 *
 * CONTRACT (01-BIM-ENGINE-CORE-CONTRACT §4.3, §5):
 *  - NEVER mutates any ElementStore or semantic state.
 *  - Orchestrates services that operate exclusively on the Three.js
 *    projection layer (RealtimeLightingService, ShadowQualityUpgrader,
 *    PBRSceneUpgrader, ReflectionProbeService, ProceduralSkyService,
 *    ClearcoatMaterialUpgrader).
 *  - Does NOT import @thatopen/* packages.
 *  - Does NOT touch CommandManager, ElementStores, or SemanticGraph.
 *
 * CONTRACT (05-BIM-UI-ARCHITECTURE-CONTRACT §1):
 *  - No UI is created here. All UI lives in src/ui/rendering/.
 *
 * Architecture (Section 5 of audit):
 *
 *   PIPELINE 1 — REAL-TIME (Enscape-like)
 *     Three.js WebGLRenderer + PostproductionRenderer (SSAO, outlines)
 *     + HDRI Image-Based Lighting   (RealtimeLightingService)
 *     + PBR material enforcement    (PBRSceneUpgrader)
 *     + Shadow quality upgrade      (ShadowQualityUpgrader)
 *     + Reflection probes           (ReflectionProbeService)
 *     + Clearcoat / SSS upgrade     (ClearcoatMaterialUpgrader) — Phase 1
 *     + Procedural sky model        (ProceduralSkyService)       — Phase 1
 *
 *   PIPELINE 2 — OFFLINE (V-Ray-like)
 *     three-gpu-pathtracer path tracing (PhotorealisticRenderer / ViewportPathTracer)
 *     + HDRI environment (HDRIEnvironmentManager, shared with Pipeline 1 cache)
 *     + Full BVH + energy-conserving materials
 *     + Up to 4K/8K output, configurable sample counts
 *
 *   POST-PROCESSING (Phase 2)
 *     Enhanced bloom — UnrealBloomPass (EnhancedBloomService, owned by EngineBootstrap)
 *
 * Usage:
 *   The coordinator is instantiated once by EngineBootstrap and exposed
 *   via window.renderingPipelineCoordinator for other modules to query.
 *
 * Notes on ProceduralSky ↔ HDRI mutual exclusivity:
 *   Both RealtimeLightingService and ProceduralSkyService write to
 *   scene.environment.  The coordinator ensures only one is active at a time:
 *   activateProceduralSky() deactivates the lighting service first, and vice versa.
 */

import * as THREE from '@pryzm/renderer-three/three';
import { RealtimeLightingService } from './RealtimeLightingService';
import { ShadowQualityUpgrader, ShadowQualityLevel } from './ShadowQualityUpgrader';
import { PBRSceneUpgrader } from './PBRSceneUpgrader';
import { ReflectionProbeService } from './ReflectionProbeService';
import { ProceduralSkyService, SkyParams, SkyPresetId } from './ProceduralSkyService';
import { ClearcoatMaterialUpgrader } from './ClearcoatMaterialUpgrader';
import { RealSunService, RealSunConfig } from './RealSunService';
import {
    sceneQualityTierManager,
    settingsForTier,
    type SceneQualityTier,
    type SceneQualitySettings,
} from './SceneQualityTierManager';

// ── Types ──────────────────────────────────────────────────────────────────

export type EnhancementLevel =
    | 'off'           // No enhancements — raw Three.js
    | 'standard'      // PBR + improved shadows, no HDRI, no probes
    | 'high'          // PBR + HDRI + high-quality shadows
    | 'ultra';        // PBR + HDRI + ultra shadows + reflection probes

export interface PipelineState {
    enhancementLevel:       EnhancementLevel;
    hdriActive:             boolean;
    hdriPresetId:           string;
    shadowLevel:            ShadowQualityLevel;
    pbrApplied:             boolean;
    reflectionProbeActive:  boolean;
    skyActive:              boolean;
    clearcoatApplied:       boolean;
    pipeline2Active:        boolean; // Path-tracer (ViewportPathTracer or PhotorealisticRenderer)
}

export interface EnhancementOptions {
    hdriPresetId?:       string;
    hdriIntensity?:      number;
    showHdriBackground?: boolean;
    probePosition?:      THREE.Vector3;
    probeResolution?:    number;
}

// ── Class ─────────────────────────────────────────────────────────────────

export class RenderingPipelineCoordinator {
    // ── Services ───────────────────────────────────────────────────────────
    private readonly _lightingService   = new RealtimeLightingService();
    private readonly _shadowUpgrader    = new ShadowQualityUpgrader();
    private readonly _pbrUpgrader       = new PBRSceneUpgrader();
    private readonly _reflectionProbe   = new ReflectionProbeService();
    private readonly _proceduralSky     = new ProceduralSkyService();
    private readonly _clearcoatUpgrader = new ClearcoatMaterialUpgrader();
    // Real Sun — physically-accurate directional sun light (Phase 3)
    private readonly _realSunService    = new RealSunService();

    // ── State ──────────────────────────────────────────────────────────────
    private _level:     EnhancementLevel       = 'off';
    private _scene:     THREE.Scene | null      = null;
    private _renderer:  THREE.WebGLRenderer | null = null;
    private _opts:      EnhancementOptions      = {};

    // ── Callbacks ──────────────────────────────────────────────────────────
    onStateChange?: (state: PipelineState) => void;

    // ── Public getters ─────────────────────────────────────────────────────

    get currentLevel(): EnhancementLevel { return this._level; }

    get state(): PipelineState {
        return {
            enhancementLevel:      this._level,
            hdriActive:            this._lightingService.active,
            hdriPresetId:          this._lightingService.currentPresetId,
            shadowLevel:           this._shadowUpgrader.currentLevel,
            pbrApplied:            this._pbrUpgrader.applied,
            reflectionProbeActive: this._reflectionProbe.active,
            skyActive:             this._proceduralSky.active,
            clearcoatApplied:      this._clearcoatUpgrader.applied,
            pipeline2Active:       false, // Set by EngineBootstrap via ViewportPathTracer
        };
    }

    get lightingService():   RealtimeLightingService  { return this._lightingService;   }
    get shadowUpgrader():    ShadowQualityUpgrader    { return this._shadowUpgrader;    }
    get pbrUpgrader():       PBRSceneUpgrader          { return this._pbrUpgrader;       }
    get reflectionProbe():   ReflectionProbeService    { return this._reflectionProbe;   }
    get proceduralSky():     ProceduralSkyService      { return this._proceduralSky;     }
    get clearcoatUpgrader(): ClearcoatMaterialUpgrader { return this._clearcoatUpgrader; }
    /** Real Sun service — physically-accurate solar position + directional light. */
    get realSunService():    RealSunService            { return this._realSunService;    }

    // ── Lifecycle ──────────────────────────────────────────────────────────

    /**
     * Binds the coordinator to the live Three.js scene and renderer.
     * Must be called once after engine initialisation, before any activate* calls.
     */
    bind(scene: THREE.Scene, renderer: THREE.WebGLRenderer): void {
        this._scene    = scene;
        this._renderer = renderer;
        // Bind RealSunService to the scene so it can add/remove its light.
        this._realSunService.bind(scene);
        console.log('[RenderingPipelineCoordinator] Bound to scene + renderer.');
    }

    /**
     * Activates real-time enhancements at the given level.
     *
     * Idempotent — calling with the same level twice is a no-op.
     * Calling with a different level transitions gracefully.
     *
     * @param level - Target enhancement level
     * @param opts  - Override defaults for HDRI preset, probe position, etc.
     */
    async activateRealtimeEnhancements(
        level: EnhancementLevel = 'high',
        opts:  EnhancementOptions = {},
    ): Promise<void> {
        if (!this._scene || !this._renderer) {
            console.warn('[RenderingPipelineCoordinator] Not bound — call bind() first.');
            return;
        }

        // Transition away from previous level
        if (this._level !== 'off' && this._level !== level) {
            await this._deactivateAll();
        }

        if (level === 'off') {
            await this._deactivateAll();
            this._level = 'off';
            this._emitState();
            return;
        }

        this._opts  = { ...this._opts, ...opts };
        this._level = level;

        console.log(`[RenderingPipelineCoordinator] Activating level: "${level}"`);

        // ── STEP 1: PBR enforcement (applies to all levels except 'off') ──
        try {
            if (!this._pbrUpgrader.applied) {
                this._pbrUpgrader.apply(
                    this._scene,
                    this._lightingService.active
                        ? (this._scene.environment as THREE.Texture)
                        : undefined,
                );
            }
        } catch (err: any) {
            console.warn('[RenderingPipelineCoordinator] PBR upgrade error:', err?.message ?? err);
        }

        // ── STEP 2: Shadow quality ────────────────────────────────────────
        const shadowLevel: ShadowQualityLevel =
            level === 'ultra' ? 'ultra' :
            level === 'high'  ? 'high'  : 'standard';

        try {
            // §FIX-SHADOW-LOAD-TIER-DESTROY — the apply()/setLevel() below reallocate
            // the shadow map (mapSize change); wrap them in the realloc guard so the
            // live WebGPU renderer's shadow map is frozen while the resolution changes
            // and thawed deferred (past the in-flight submit) — never destroyed mid-submit.
            this._reallocShadow(() => {
                if (!this._shadowUpgrader.applied) {
                    this._shadowUpgrader.apply(this._renderer!, this._scene!, shadowLevel);
                } else {
                    this._shadowUpgrader.setLevel(shadowLevel);
                }
            });
        } catch (err: any) {
            console.warn('[RenderingPipelineCoordinator] Shadow upgrade error:', err?.message ?? err);
        }

        // ── STEP 3: HDRI (high + ultra only; skip if procedural sky active) ──
        if ((level === 'high' || level === 'ultra') && !this._proceduralSky.active) {
            try {
                if (!this._lightingService.active) {
                    await this._lightingService.activate(this._scene, this._renderer, {
                        presetId:       this._opts.hdriPresetId ?? 'daylight-interior',
                        intensity:      this._opts.hdriIntensity ?? 1.0,
                        showBackground: this._opts.showHdriBackground ?? false,
                    });
                    // Re-apply PBR with the new env map so materials pick up IBL
                    if (this._lightingService.active && this._scene.environment) {
                        this._pbrUpgrader.apply(
                            this._scene,
                            this._scene.environment as THREE.Texture,
                        );
                    }
                }
            } catch (err: any) {
                console.warn('[RenderingPipelineCoordinator] HDRI error:', err?.message ?? err);
            }
        }

        // ── STEP 4: Reflection probe (ultra only) ─────────────────────────
        if (level === 'ultra') {
            try {
                if (!this._reflectionProbe.active) {
                    await this._reflectionProbe.activate(this._scene, this._renderer, {
                        resolution:  this._opts.probeResolution ?? 256,
                        position:    this._opts.probePosition ?? new THREE.Vector3(0, 1.5, 0),
                        targetTypes: ['metal', 'glass', 'polished'],
                    });
                }
            } catch (err: any) {
                console.warn('[RenderingPipelineCoordinator] Reflection probe error:', err?.message ?? err);
            }
        }

        this._emitState();
        console.log(`[RenderingPipelineCoordinator] Level "${level}" active.`);
    }

    /**
     * Deactivates all real-time enhancements and restores scene to base state.
     */
    async deactivateRealtimeEnhancements(): Promise<void> {
        await this._deactivateAll();
        this._level = 'off';
        this._emitState();
    }

    /**
     * Changes the HDRI preset on the fly (no deactivation cycle).
     * Deactivates procedural sky if it was active (mutual exclusivity).
     */
    async setHdriPreset(presetId: string, intensity?: number): Promise<void> {
        this._opts.hdriPresetId  = presetId;
        this._opts.hdriIntensity = intensity;

        // Ensure sky is off when switching back to HDRI
        if (this._proceduralSky.active && this._scene) {
            this._proceduralSky.deactivate();
        }

        await this._lightingService.setPreset(presetId, intensity);

        // Re-apply PBR with updated env map
        if (this._scene && this._lightingService.active && this._scene.environment) {
            this._pbrUpgrader.apply(this._scene, this._scene.environment as THREE.Texture);
        }
        this._emitState();
    }

    /**
     * Moves the reflection probe to a new position and re-bakes.
     */
    async setProbePosition(position: THREE.Vector3): Promise<void> {
        await this._reflectionProbe.setPosition(position);
    }

    // ── Phase 1: Procedural Sky ────────────────────────────────────────────

    /**
     * Activates the procedural sky model (THREE.Sky + PMREMGenerator).
     * Deactivates HDRI lighting first to avoid scene.environment conflict.
     *
     * @param opts  - Optional sky parameter overrides
     */
    activateProceduralSky(opts?: Partial<SkyParams>): void {
        if (!this._scene || !this._renderer) {
            console.warn('[RenderingPipelineCoordinator] Not bound — call bind() first.');
            return;
        }
        if (this._proceduralSky.active) return;

        // Deactivate HDRI (mutual exclusivity)
        if (this._lightingService.active) {
            this._lightingService.deactivate();
        }

        try {
            this._proceduralSky.activate(this._scene, this._renderer, opts);
        } catch (err: any) {
            console.warn('[RenderingPipelineCoordinator] Procedural sky error:', err?.message ?? err);
        }
        this._emitState();
    }

    /** Deactivates the procedural sky and optionally restores HDRI. */
    deactivateProceduralSky(restoreHdri = true): void {
        if (!this._proceduralSky.active) return;
        this._proceduralSky.deactivate();

        // Restore HDRI if we were at high/ultra level
        if (restoreHdri && this._scene && this._renderer &&
            (this._level === 'high' || this._level === 'ultra') &&
            !this._lightingService.active) {
            this._lightingService.activate(this._scene, this._renderer, {
                presetId:       this._opts.hdriPresetId ?? 'daylight-interior',
                intensity:      this._opts.hdriIntensity ?? 1.0,
                showBackground: this._opts.showHdriBackground ?? false,
            }).catch((err: any) => {
                console.warn('[RenderingPipelineCoordinator] HDRI restore error:', err?.message ?? err);
            });
        }
        this._emitState();
    }

    /** Apply a named sky preset (morning / noon / golden-hour / overcast). */
    setSkyPreset(id: SkyPresetId): void {
        if (this._proceduralSky.active) {
            this._proceduralSky.applyPreset(id);
        }
    }

    /** Update sky sun elevation without full deactivation. */
    setSkyElevation(deg: number): void { this._proceduralSky.setElevation(deg); }
    /** Update sky sun azimuth without full deactivation. */
    setSkyAzimuth(deg: number): void   { this._proceduralSky.setAzimuth(deg); }
    /** Update sky turbidity without full deactivation. */
    setSkyTurbidity(val: number): void { this._proceduralSky.setTurbidity(val); }

    // ── Phase 1: Clearcoat Material Upgrade ───────────────────────────────

    /**
     * Applies MeshPhysicalMaterial clearcoat/transmission upgrade to
     * eligible materials (metal / glass / polished).
     *
     * Idempotent — subsequent calls are no-ops until restore() is called.
     */
    applyClearcoatUpgrade(): void {
        if (!this._scene) {
            console.warn('[RenderingPipelineCoordinator] Not bound — call bind() first.');
            return;
        }
        try {
            this._clearcoatUpgrader.apply(this._scene);
        } catch (err: any) {
            console.warn('[RenderingPipelineCoordinator] Clearcoat upgrade error:', err?.message ?? err);
        }
        this._emitState();
    }

    /** Restores all materials upgraded by applyClearcoatUpgrade(). */
    restoreClearcoatUpgrade(): void {
        this._clearcoatUpgrader.restore();
        this._emitState();
    }

    /**
     * Toggle clearcoat upgrade on or off.
     */
    setClearcoatUpgrade(enabled: boolean): void {
        if (enabled) {
            this.applyClearcoatUpgrade();
        } else {
            this.restoreClearcoatUpgrade();
        }
    }

    // ── Scene change notification ──────────────────────────────────────────

    /**
     * Notifies the coordinator that new geometry has been added to the scene
     * (e.g., after a wall is placed). Upgrades new materials incrementally.
     *
     * @param meshes - Newly-added Three.js meshes
     */
    onSceneGeometryAdded(meshes: THREE.Mesh[]): void {
        if (!this._pbrUpgrader.applied) return;

        const envMap = this._scene?.environment as THREE.Texture | undefined;
        this._pbrUpgrader.upgradeNewMeshes(meshes, envMap);

        // Mark probe as stale when geometry changes (ultra mode only)
        if (this._level === 'ultra') {
            this._reflectionProbe.markStale();
        }
    }

    // ── Real Sun (Phase 3) ─────────────────────────────────────────────────

    /**
     * Enables the physically-accurate real sun light.
     *
     * The sun light coexists with the HDRI pipeline — HDRI provides ambient
     * image-based lighting while the sun light provides sharp directional
     * shadows. Both run in the same scene simultaneously.
     *
     * Call this AFTER bind() has been called.
     *
     * @param config - Location (lat/lng) and date/time for solar computation.
     *   Defaults to Madrid at the current time when omitted.
     */
    enableRealSun(config?: Partial<RealSunConfig>): void {
        if (!this._scene) {
            console.warn('[RenderingPipelineCoordinator] Not bound — call bind() first.');
            return;
        }
        this._realSunService.enableRealSun(config);
        this._emitState();
    }

    /**
     * Disables the real sun light and removes it from the scene.
     * All other lighting (HDRI, procedural sky) is left untouched.
     */
    disableRealSun(): void {
        this._realSunService.disableRealSun();
        this._emitState();
    }

    // ── ADR-0076 Axis 1 — scene-size render quality tiers (§PERF-WEBGPU-FRAGMENT) ──

    /**
     * Optional app-injected hooks the coordinator calls when the render tier
     * changes. Kept as injected callbacks (not direct imports) so the coordinator
     * (core-app-model) does not take a dependency on the app layer or on
     * geometry-furniture (which would be a circular dependency).
     *
     *   onSsgi          — enable/disable SSGI (RenderPipelineManager, app-wired).
     *   onFurnitureBudget — set the furniture shadow budget (geometry-furniture).
     */
    private _onTierSsgi?: (enabled: boolean) => void;
    private _onTierTraa?: (enabled: boolean) => void;
    private _onTierFurnitureBudget?: (decorativeShadows: boolean) => void;
    /**
     * §PERF-HEAVY-SHADOW-OFF — injected setter that suppresses/restores the SCENE
     * shadow pass at the real caster (the Pascal key light) on the LIVE renderer.
     *
     * The coordinator's own ShadowQualityUpgrader is bound to the OBC WebGL renderer
     * (silenced in Phase 5) and only de-shadows the lights it snapshotted, so its
     * setShadowsEnabled() never reaches the Pascal key light nor the PRYZM WebGPU
     * renderer that actually draws the shadow pass — the documented ≥8000-caster
     * ceiling therefore never fired on the 40-storey office. This hook is wired by
     * initScene to `pascalSceneLighting.setShadowsSuppressed(...)`, closing that gap.
     * Kept as an injected callback (not a direct import) so the coordinator does not
     * take a dependency on the app-layer wiring. No-op-safe when never injected.
     */
    private _onTierSceneShadow?: (suppressed: boolean) => void;

    /**
     * §FIX-SHADOW-LOAD-TIER-DESTROY (founder L-39) — injected guard that wraps a
     * shadow-map REALLOCATION (the mapSize change in ShadowQualityUpgrader.apply /
     * setLevel) so the LIVE WebGPU renderer's shadow map is frozen while it changes
     * and thawed deferred, never destroyed mid-submit on project load.
     *
     * The coordinator's own ShadowQualityUpgrader is bound to the (silenced) OBC WebGL
     * renderer, but the mapSize it mutates lives on the Pascal key light — which the
     * live PRYZM WebGPU renderer actually renders a shadow pass for. On project open
     * the tier escalates to `cinematic` and the map reallocates 512→2048; with the
     * live renderer's `shadowMap.autoUpdate=true` THREE performs that realloc INSIDE a
     * submit → "Destroyed texture [ShadowDepthTexture] used in a submit" → device loss
     * → the whole app freezes. initScene wires this to
     * `window.renderPipelineManager.setShadowReallocFrozen(...)` + a deferred thaw.
     * Kept as an injected callback (not a direct import) so the coordinator takes no
     * dependency on renderer-three/app wiring. No-op-safe: when never injected the
     * mutation runs unwrapped (the WebGL fallback path, which needs no freeze).
     */
    private _onShadowRealloc?: (mutate: () => void) => void;

    /**
     * §FIX-SHADOW-TIER-CASTER-DESTROY (founder L-908) — the shadow-CASTER-SET guard.
     *
     * A SIBLING of {@link _onShadowRealloc}, deliberately NOT the same hook, because the
     * two mutations need different orderings and conflating them would under-protect one
     * of them:
     *
     *  - a REALLOC (`mapSize`) needs the map FROZEN so THREE cannot resize it mid-encode.
     *    `§SHADOW-MAP-REALLOC-AT-BOUNDARY` + `§SHADOW-MAPSIZE-WRITE-AT-BOUNDARY` (L-819)
     *    already make that ordered by construction, and that half is CLEAN.
     *  - a CASTER-SET change (`light.castShadow` flipping) needs SUBMITS PAUSED. Freezing
     *    is not enough and never was: `autoUpdate=false` suppresses the depth PASS, but
     *    when a light stops casting THREE drops its `ShadowNode` and releases the
     *    `ShadowDepthTexture` on its own schedule, inside the next `render()` — which is
     *    the L-25 mechanism verbatim. The only ordering that helps is "submit nothing
     *    until the previous frames have drained, THEN let the destroy happen".
     *
     * initScene wires this to `RenderPipelineManager.runShadowCasterMutation()`. Kept as
     * an injected callback (not a direct import) so the coordinator takes no dependency on
     * renderer-three/app wiring. No-op-safe: when never injected the mutation runs
     * unwrapped (the WebGL2 fallback, which owns its own shadowMap and needs no pause).
     */
    private _onShadowCasterMutation?: (mutate: () => void) => void;

    /**
     * §FIX-SHADOW-TIER-CASTER-DESTROY (founder L-908) — last resolved `shadowsOff`, so
     * the caster guard opens ONLY on a real transition.
     *
     * This matters more than it looks. `applyTierForMeshCount` runs on EVERY geometry
     * event — its own throttle comment above records **188× during one generation** — and
     * the guard PAUSES WebGPU submits for a macrotask. Opening it unconditionally would
     * turn a device-loss fix into a 188-stutter perf defect. The levers themselves are
     * already internally idempotent (`ShadowQualityUpgrader.setShadowsEnabled` and
     * `PascalSceneLighting.setShadowsSuppressed` both early-return when the state already
     * holds), so a non-transition call has nothing to order and needs no window.
     *
     * Seeded `false` = "shadows ON", the cold-start state, so a small scene never pauses.
     */
    private _lastShadowsOff = false;

    /**
     * §PERF-WEBGPU-FRAGMENT — tier-log throttle state. The tier is re-evaluated on
     * every geometry-add (it can fire 100+ times during one generation), so we MUST
     * NOT log every call. We log: (1) ALWAYS on a real tier CHANGE, and (2) at most
     * once per STEADY-STATE settle window for the "[unchanged]" confirmation.
     */
    private _lastLoggedTier: SceneQualityTier | undefined = undefined;
    private _lastUnchangedLogAtMs = 0;
    /** Steady-state confirmation cadence: at most one [unchanged] line per this window. */
    private static readonly _UNCHANGED_LOG_INTERVAL_MS = 4000;

    /**
     * §SHADOW-DEVICE-LOSS-FIX (Fix 2) — mesh-count ceiling above which the shadow map
     * is turned OFF regardless of tier (defense in depth alongside `survival.shadows`).
     *
     * The 40-storey office logged 15009 meshes (survival) with shadow flags on 14283 of
     * them — a shadow pass over that many casters churns the ShadowDepthTexture and loses
     * the WebGPU device. Set to 8000: comfortably ABOVE a typical generated building
     * (~4062 meshes — the founder's real `performance`-tier case, which KEEPS shadows,
     * unchanged) yet well below the office, so only the very-heavy path drops shadows.
     * The primary gate is still `survival.shadows === false` (fires at 15001 meshes);
     * this ceiling is defense in depth for anything heavy that lands in `performance`.
     */
    private static readonly _LARGE_SCENE_SHADOWS_OFF_MESH_COUNT = 8000;

    /**
     * Inject the SSGI toggle the coordinator should call on a tier change.
     * No-op-safe: if never injected, the tier applier simply skips the SSGI step.
     */
    setTierSsgiHook(hook: (enabled: boolean) => void): void {
        this._onTierSsgi = hook;
    }

    /**
     * Inject the TRAA toggle the coordinator should call on a tier change.
     * No-op-safe: if never injected, the tier applier simply skips the TRAA step.
     * (TRAA lives in RenderPipelineManager — renderer-three, app-wired.)
     */
    setTierTraaHook(hook: (enabled: boolean) => void): void {
        this._onTierTraa = hook;
    }

    /**
     * Inject the furniture-shadow-budget setter the coordinator calls on a tier
     * change. `decorativeShadows=false` ⇒ decorative furniture stops casting.
     */
    setTierFurnitureBudgetHook(hook: (decorativeShadows: boolean) => void): void {
        this._onTierFurnitureBudget = hook;
    }

    /**
     * §PERF-HEAVY-SHADOW-OFF — inject the scene-shadow-suppression setter the
     * coordinator calls whenever the heavy-scene shadow gate flips. `suppressed=true`
     * ⇒ the scene renders NO shadow pass (the real caster — the Pascal key light —
     * stops casting). No-op-safe: if never injected, the gate simply skips this step.
     */
    setTierSceneShadowHook(hook: (suppressed: boolean) => void): void {
        this._onTierSceneShadow = hook;
    }

    /**
     * §FIX-SHADOW-LOAD-TIER-DESTROY — inject the shadow-map realloc guard. The guard
     * receives a `mutate` thunk (the mapSize change) and must run it with the live
     * WebGPU renderer's shadow map FROZEN, thawing deferred past the in-flight submit.
     * No-op-safe: if never injected, {@link _reallocShadow} runs the mutation directly.
     */
    setShadowReallocGuardHook(hook: (mutate: () => void) => void): void {
        this._onShadowRealloc = hook;
    }

    /**
     * §FIX-SHADOW-LOAD-TIER-DESTROY — run a shadow-map mutation through the injected
     * realloc guard (freeze → mutate → deferred thaw) when wired, else run it directly.
     * Exceptions from `mutate` propagate to the caller's try/catch unchanged.
     */
    private _reallocShadow(mutate: () => void): void {
        if (this._onShadowRealloc) {
            this._onShadowRealloc(mutate);
        } else {
            mutate();
        }
    }

    /**
     * §FIX-SHADOW-TIER-CASTER-DESTROY (founder L-908) — inject the shadow-CASTER-SET
     * guard. The guard receives a `mutate` thunk (the `castShadow` flips) and must run it
     * with WebGPU submits PAUSED, resuming DEFERRED past the in-flight submit.
     * No-op-safe: if never injected, {@link _casterGuard} runs the mutation directly.
     */
    setShadowCasterGuardHook(hook: (mutate: () => void) => void): void {
        this._onShadowCasterMutation = hook;
    }

    /**
     * §FIX-SHADOW-TIER-CASTER-DESTROY (founder L-908) — run a shadow-caster-set mutation
     * through the injected guard (pause → mutate → deferred resume) when wired, else run
     * it directly. Exceptions from `mutate` propagate unchanged; the guard owns
     * try/finally so a throwing lever can never strand the viewport paused.
     */
    private _casterGuard(mutate: () => void): void {
        if (this._onShadowCasterMutation) {
            this._onShadowCasterMutation(mutate);
        } else {
            mutate();
        }
    }

    /**
     * Apply the render quality tier implied by the current scene mesh count
     * (ADR-0076 Axis 1). Conservative + hysteretic: on small/normal scenes the
     * tier stays cinematic/balanced (today's behaviour, zero change); only
     * already-heavy scenes (>6k / >15k meshes) step down SSGI/shadow/decorative
     * furniture shadows. Idempotent — re-applies only when the tier actually
     * changes (so it is safe to call from a debounced scene-change hook).
     *
     * Drives the parts the coordinator OWNS directly (shadow level, reflection
     * probe) and the injected hooks for SSGI + furniture budget. Returns the
     * resolved tier + settings so the caller can drive anything else (e.g. TRAA).
     *
     * Does NOT call requestAnimationFrame (P3) and mutates only the THREE
     * projection layer via already-tested service mutators.
     *
     * §PERF-WEBGL2-NO-SSGI — `isWebGPU` is the authoritative real-WebGPU backend flag
     * (`RenderPipelineManager.isRealWebGPUBackend()` / `status.webGpuActive`), threaded
     * from the app wiring (initScene). When `false`, the tier's SSGI/TRAA settings are
     * forced OFF (and shadows capped to `standard`) so the heavy legacy `SSGIService`
     * never activates on the WebGL2 fallback backend — closing the second
     * SSGI-activation path that §PERF-WEBGL2-NO-TSL did not cover. `undefined` / `true`
     * leave WebGPU behaviour exactly as today. The held mesh-count tier is
     * backend-agnostic; only the applied settings are gated.
     *
     * @param meshCount  current scene mesh count (from FrustumCullingService).
     * @param isWebGPU   authoritative real-WebGPU backend flag (undefined = unknown).
     */
    applyTierForMeshCount(meshCount: number, isWebGPU?: boolean): { tier: SceneQualityTier; changed: boolean; settings: SceneQualitySettings } {
        const result = sceneQualityTierManager.update(meshCount, isWebGPU);
        const { settings, tier, changed } = result;

        // §PERF-WEBGPU-FRAGMENT — THROTTLED tier log. This runs on every geometry-add
        // (188× during one generation in the founder's session), so we must not spam.
        // Log ALWAYS on a real tier change; for the steady-state "[unchanged]"
        // confirmation, log at most once per settle window.
        const tierLine =
            `[SceneQualityTier] ${meshCount} meshes → tier=${tier} ` +
            `(SSGI=${settings.ssgi ? 'on' : 'off'} TRAA=${settings.traa ? 'on' : 'off'} ` +
            `shadows=${settings.shadows ? settings.shadowLevel : 'OFF'} ` +
            `decorativeShadows=${settings.decorativeFurnitureShadows ? 'on' : 'off'})`;
        const tierTransitioned = tier !== this._lastLoggedTier;
        if (tierTransitioned) {
            console.log(tierLine);
            this._lastLoggedTier = tier;
            this._lastUnchangedLogAtMs = Date.now();
        } else {
            const now = Date.now();
            if (now - this._lastUnchangedLogAtMs >= RenderingPipelineCoordinator._UNCHANGED_LOG_INTERVAL_MS) {
                console.log(`${tierLine} [unchanged]`);
                this._lastUnchangedLogAtMs = now;
            }
        }

        // §SHADOW-DEVICE-LOSS-FIX (Fix 2) — the shadows ON/OFF decision depends on the
        // raw mesh COUNT (the 8000 ceiling), which can cross WITHIN a single tier
        // (`performance` spans 2500–15000) where `changed` is false. So evaluate the
        // shadow gate every call — it is idempotent (a no-op when the desired state
        // already holds) so it is cheap and never churns. The `survival.shadows=false`
        // transition at 15001 IS a tier change and also flows through here.
        const shadowsOff =
            !settings.shadows ||
            meshCount >= RenderingPipelineCoordinator._LARGE_SCENE_SHADOWS_OFF_MESH_COUNT;

        /**
         * The two levers below both flip `light.castShadow`, and BOTH used to run bare.
         * They are hoisted into one thunk so a single guarded window covers both — two
         * windows would leave a gap between them, which is how this family keeps
         * regressing (L-25 closed the nav lever, L-64 the wall-commit lever, and the tier
         * lever surfaced next).
         */
        const applyCasterGate = (): void => {
            if (this._shadowUpgrader.applied) {
                try {
                    this._shadowUpgrader.setShadowsEnabled(!shadowsOff);
                } catch (err) {
                    console.warn('[RenderingPipelineCoordinator] §SHADOW-DEVICE-LOSS-FIX shadow-enable gate error:', err);
                }
            }
            // §PERF-HEAVY-SHADOW-OFF — the ShadowQualityUpgrader above is bound to the OBC
            // WebGL renderer (silenced in Phase 5) and only touches lights it snapshotted,
            // so it never reaches the Pascal key light nor the live PRYZM WebGPU renderer
            // that actually draws the shadow pass — the ≥8000-caster ceiling never fired on
            // the 40-storey office (13,652 meshes, 12,737 shadow-flagged, tier=performance).
            // Drive the REAL scene-shadow lever unconditionally (idempotent; not gated on
            // _shadowUpgrader.applied). Evaluated every call because the 8000 ceiling can
            // cross WITHIN the `performance` tier (2500–15000) where `changed` is false.
            try {
                this._onTierSceneShadow?.(shadowsOff);
            } catch (err) {
                console.warn('[RenderingPipelineCoordinator] §PERF-HEAVY-SHADOW-OFF scene-shadow hook error:', err);
            }
        };

        // ── §FIX-SHADOW-TIER-CASTER-DESTROY (founder L-908) ──────────────────────
        // Order the caster-set change against submission on a REAL crossing only.
        //
        // This is L-908's trigger and it is three lines across two files:
        //   (1) `initScene.setPostBatchCallback(...)` calls this method at BATCH END;
        //   (2) the levers above flip `castShadow` bare, gated on the raw mesh count
        //       crossing 8000 — which a generation batch crosses exactly ONCE, at exactly
        //       the moment `batchAutoFrame` is submitting frames; and
        //   (3) `initScene.ts` — `if (batchCoordinator.isBatching) return;` — means
        //       §FIX-SHADOW-WALLCOMMIT-DESTROY, the one latch that would have covered
        //       this, NEVER ARMS DURING A BATCH AT ALL.
        //
        // The guard PAUSES WebGPU submits (never a freeze — a freeze suppresses the depth
        // pass, and a caster-set change has no depth pass left to suppress; three releases
        // the ShadowDepthTexture when the light stops casting, on its own schedule inside
        // the next render()). See RenderPipelineManager.runShadowCasterMutation.
        //
        // ⚠ ONLY on a transition. This method runs on EVERY geometry event — 188× during
        // one generation, per the throttle comment above — and the guard costs a
        // macrotask of paused submits. Guarding unconditionally would trade a device-loss
        // crash for a 188-stutter perf defect. The levers are internally idempotent, so a
        // non-transition call has nothing to order; `applyCasterGate` still runs EVERY
        // time (the §PERF-HEAVY-SHADOW-OFF contract is an idempotent re-assert, never a
        // one-shot latch — pinned by RenderingPipelineCoordinator.heavyShadowGate.test.ts).
        const casterSetTransitions = shadowsOff !== this._lastShadowsOff;
        this._lastShadowsOff = shadowsOff;
        if (casterSetTransitions) this._casterGuard(applyCasterGate);
        else applyCasterGate();

        // Only (re)apply the THREE-side mutators when the tier actually changed —
        // applying identical settings every batch is wasted work + flicker risk.
        if (!changed) return result;

        // Furniture decorative-shadow budget (Axis 2) — injected hook.
        try {
            this._onTierFurnitureBudget?.(settings.decorativeFurnitureShadows);
        } catch (err) {
            console.warn('[RenderingPipelineCoordinator] tier furniture-budget hook error:', err);
        }

        // SSGI — injected hook (RenderPipelineManager lives in renderer-three).
        try {
            this._onTierSsgi?.(settings.ssgi);
        } catch (err) {
            console.warn('[RenderingPipelineCoordinator] tier SSGI hook error:', err);
        }

        // TRAA — injected hook. At performance/survival TRAA may be turned off to
        // shed the per-frame temporal-reprojection cost on heavy scenes.
        try {
            this._onTierTraa?.(settings.traa);
        } catch (err) {
            console.warn('[RenderingPipelineCoordinator] tier TRAA hook error:', err);
        }

        // Shadow level — owned directly; reuse the tested upgrader mutators.
        if (this._renderer && this._scene) {
            const renderer = this._renderer;
            const scene    = this._scene;
            const shadowLevel = settings.shadowLevel as ShadowQualityLevel;
            try {
                // §FIX-SHADOW-LOAD-TIER-DESTROY (founder L-39) — apply()/setLevel()
                // reallocate the Pascal key light's shadow map (mapSize change). On
                // project open this is THE realloc that, with the live WebGPU
                // renderer's shadowMap.autoUpdate=true, destroys the ShadowDepthTexture
                // mid-submit → device-loss freeze (load-time sibling of L-25). Wrap the
                // whole shadow-map mutation in the realloc guard so the live renderer's
                // shadow map is FROZEN while the resolution changes, then thawed deferred
                // past the in-flight submit — the single regen lands on an idle frame.
                this._reallocShadow(() => {
                    if (!this._shadowUpgrader.applied) {
                        this._shadowUpgrader.apply(renderer, scene, shadowLevel);
                    } else {
                        this._shadowUpgrader.setLevel(shadowLevel);
                    }
                    // §SHADOW-DEVICE-LOSS-FIX (Fix 2) — turn the shadow map ON/OFF for the
                    // tier. `settings.shadows === false` on survival; also defensively kill
                    // shadows once the scene exceeds LARGE_SCENE_SHADOWS_OFF_MESH_COUNT
                    // (~4000) regardless of tier, so the ShadowDepthTexture churn that loses
                    // the WebGPU device on the 40-storey office (14283 shadow-flagged meshes)
                    // cannot occur. Normal scenes keep shadows exactly as before.
                    const shadowsOff =
                        !settings.shadows ||
                        meshCount >= RenderingPipelineCoordinator._LARGE_SCENE_SHADOWS_OFF_MESH_COUNT;
                    this._shadowUpgrader.setShadowsEnabled(!shadowsOff);
                });
            } catch (err) {
                console.warn('[RenderingPipelineCoordinator] tier shadow-level error:', err);
            }
        }

        // Reflection probe — owned directly (ultra/cinematic only).
        if (!settings.reflectionProbes && this._reflectionProbe.active) {
            this._reflectionProbe.deactivate();
        }

        console.log(
            `[RenderingPipelineCoordinator] §PERF-WEBGPU-FRAGMENT applied tier "${tier}" ` +
            `(furniture/SSGI hooks + shadow=${settings.shadowLevel}).`,
        );

        return result;
    }

    /**
     * ADR-0076 §PERF-WEBGPU-FRAGMENT — whether the expensive whole-scene/post-batch
     * PBR upgrade should run for the CURRENT render tier.
     *
     * Measured: the post-batch PBRSceneUpgrader is 38.7 s wall-clock on a real
     * 4073-mesh building (THE project-open bottleneck). It is only worth running at
     * `cinematic` (small showcase scenes); at `balanced`+ the base
     * MeshStandardMaterial already renders correctly, so the caller should SKIP it.
     *
     * Returns true only when the held tier's `fullScenePbrTraverse` is true. Before
     * the first tier evaluation (held tier undefined) it returns true so cold-start
     * behaviour is unchanged for small scenes.
     */
    shouldRunFullPbrUpgrade(): boolean {
        const tier = sceneQualityTierManager.currentTier;
        if (tier === undefined) return true; // cold start — unchanged for small scenes
        return settingsForTier(tier).fullScenePbrTraverse;
    }

    dispose(): void {
        this._lightingService.dispose();
        this._shadowUpgrader.dispose();
        if (this._scene) this._pbrUpgrader.restore(this._scene);
        this._pbrUpgrader.dispose();
        this._reflectionProbe.dispose();
        this._proceduralSky.dispose();
        this._clearcoatUpgrader.dispose();
        this._realSunService.dispose();
        this._level    = 'off';
        this._scene    = null;
        this._renderer = null;
        // ADR-0076 Axis 1 — forget the held tier so the next project is a cold start.
        sceneQualityTierManager.reset();
        // §PERF-WEBGPU-FRAGMENT — reset the tier-log throttle so the next project
        // logs its first tier decision immediately.
        this._lastLoggedTier = undefined;
        this._lastUnchangedLogAtMs = 0;
        // §FIX-SHADOW-TIER-CASTER-DESTROY (L-908) — forget the caster-gate state too, so
        // the next project's first crossing is a real transition and takes the guard. A
        // latch that survives a project switch would silently skip the FIRST heavy scene
        // of the next project — the exact case the guard exists for.
        this._lastShadowsOff = false;
    }

    // ── Private ────────────────────────────────────────────────────────────

    private async _deactivateAll(): Promise<void> {
        this._reflectionProbe.deactivate();
        this._lightingService.deactivate();
        this._proceduralSky.deactivate();
        this._shadowUpgrader.restore();
        if (this._scene) {
            this._pbrUpgrader.restore(this._scene);
        }
        // Clearcoat is NOT deactivated on level change — it is a user-controlled toggle
    }

    private _emitState(): void {
        this.onStateChange?.(this.state);
    }
}
