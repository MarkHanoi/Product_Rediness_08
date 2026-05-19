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
            if (!this._shadowUpgrader.applied) {
                this._shadowUpgrader.apply(this._renderer, this._scene, shadowLevel);
            } else {
                this._shadowUpgrader.setLevel(shadowLevel);
            }
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
