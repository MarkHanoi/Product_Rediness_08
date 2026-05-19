/**
 * @file src/core/rendering/ProceduralSkyService.ts
 * @description Phase 1 — Procedural Sky model using THREE.Sky + PMREMGenerator.
 *
 * CONTRACT (01-BIM-ENGINE-CORE-CONTRACT §4.3, §5):
 *  - NEVER mutates any ElementStore or semantic state.
 *  - Operates exclusively on the Three.js projection layer.
 *  - Saves and restores scene.environment on deactivate().
 *  - Does NOT import @thatopen/* packages.
 *
 * CONTRACT (realtime-authoring-viewport-pipeline.md §11):
 *  - Service failures must not cascade to the engine.
 *  - All scene state restored on deactivate().
 *
 * How it works:
 *  - THREE.Sky creates a Preetham sky model mesh (scaled 450,000 units).
 *  - A temporary THREE.Scene holds the sky for PMREMGenerator.fromScene().
 *  - The resulting cubemap is set as scene.environment for IBL.
 *  - The sky mesh is added to the main scene as the visible background.
 *  - Mutually exclusive with RealtimeLightingService (both set scene.environment).
 *    The RenderingPipelineCoordinator ensures only one is active at a time.
 *
 * Sun position:
 *   phi   = deg_to_rad(90 - elevation)   [0° = horizon, 90° = zenith]
 *   theta = deg_to_rad(azimuth)          [0° = North, 90° = East, 180° = South]
 */

import * as THREE from '@pryzm/renderer-three/three';
import { Sky } from '@pryzm/renderer-three';

// ── Types ──────────────────────────────────────────────────────────────────

export interface SkyParams {
    /** Atmospheric haze: 0 = crystal clear, 20 = heavy smog. Default 10. */
    turbidity: number;
    /** Rayleigh scattering coefficient — blue sky richness: 0–4. Default 3. */
    rayleigh: number;
    /** Mie scattering (ground haze): 0–0.1. Default 0.005. */
    mieCoefficient: number;
    /** Mie directional: sun glow concentration: 0–1. Default 0.7. */
    mieDirectionalG: number;
    /** Sun elevation above horizon in degrees: 0–90. Default 30. */
    elevation: number;
    /** Sun azimuth in degrees: 0=North, 90=East, 180=South, 270=West. Default 180. */
    azimuth: number;
}

export type SkyPresetId =
    | 'sunrise'
    | 'morning'
    | 'noon'
    | 'golden-hour'
    | 'sunset'
    | 'overcast'
    | 'night';

export const SKY_PRESETS: Record<SkyPresetId, SkyParams> = {
    /**
     * Sunrise — very low sun on the horizon, warm pink/orange atmosphere.
     * Elevation 2° keeps the sun just above the horizon for dramatic shadows.
     */
    'sunrise': {
        turbidity: 12, rayleigh: 4, mieCoefficient: 0.02,
        mieDirectionalG: 0.95, elevation: 2, azimuth: 80,
    },
    /**
     * Morning — low morning sun, rich blue sky, moderate haze.
     */
    'morning': {
        turbidity: 6, rayleigh: 3, mieCoefficient: 0.005,
        mieDirectionalG: 0.8, elevation: 15, azimuth: 90,
    },
    /**
     * Noon — high sun overhead, bright white daylight.
     */
    'noon': {
        turbidity: 10, rayleigh: 2, mieCoefficient: 0.003,
        mieDirectionalG: 0.7, elevation: 75, azimuth: 180,
    },
    /**
     * Golden Hour — sun at 5° above horizon, warm amber glow, high Mie scattering.
     * The classic interior marketing shot light.
     */
    'golden-hour': {
        turbidity: 15, rayleigh: 4, mieCoefficient: 0.01,
        mieDirectionalG: 0.9, elevation: 5, azimuth: 270,
    },
    /**
     * Sunset — sun at 1° above horizon, deep orange/red sky, maximal Rayleigh.
     */
    'sunset': {
        turbidity: 18, rayleigh: 4, mieCoefficient: 0.025,
        mieDirectionalG: 0.98, elevation: 1, azimuth: 260,
    },
    /**
     * Overcast — high turbidity, diffuse grey-white skylight, no direct sun.
     */
    'overcast': {
        turbidity: 20, rayleigh: 4, mieCoefficient: 0.05,
        mieDirectionalG: 0.5, elevation: 45, azimuth: 180,
    },
    /**
     * Night — sun below horizon (elevation −10 mapped to 0 + near-zero rayleigh),
     * nearly black sky, very low luminance.  Primarily useful as an environment
     * backdrop when interior artificial lighting dominates.
     * Note: THREE.Sky cannot render a true below-horizon sun; elevation 0 with
     * turbidity 0 and rayleigh 0.1 gives the darkest achievable sky.
     */
    'night': {
        turbidity: 0.1, rayleigh: 0.1, mieCoefficient: 0.001,
        mieDirectionalG: 0.2, elevation: 0, azimuth: 0,
    },
};

// ── Class ──────────────────────────────────────────────────────────────────

export class ProceduralSkyService {
    private _sky:            Sky | null               = null;
    private _sun:            THREE.Vector3             = new THREE.Vector3();
    private _pmremGenerator: THREE.PMREMGenerator | null = null;
    private _currentEnvMap:  THREE.Texture | null      = null;
    private _savedEnv:       THREE.Texture | null      = null;
    private _scene:          THREE.Scene | null         = null;
    private _active:         boolean                    = false;

    private _params: SkyParams = {
        turbidity:       10,
        rayleigh:        3,
        mieCoefficient:  0.005,
        mieDirectionalG: 0.7,
        elevation:       30,
        azimuth:         180,
    };

    // ── Getters ─────────────────────────────────────────────────────────────

    get active(): boolean    { return this._active; }
    get params(): SkyParams  { return { ...this._params }; }

    // ── Lifecycle ────────────────────────────────────────────────────────────

    /**
     * Activates the procedural sky model.
     * Adds the sky mesh to the scene and generates a PMREM env map for IBL.
     *
     * @param scene    - Main THREE.Scene (projection layer only)
     * @param renderer - WebGLRenderer (for PMREMGenerator)
     * @param opts     - Optional sky parameter overrides
     */
    activate(
        scene:    THREE.Scene,
        renderer: THREE.WebGLRenderer,
        opts?:    Partial<SkyParams>,
    ): void {
        if (this._active) return;

        this._savedEnv = scene.environment;
        this._scene    = scene;

        if (opts) this._params = { ...this._params, ...opts };

        this._sky = new Sky();
        this._sky.scale.setScalar(450_000);
        scene.add(this._sky);

        this._pmremGenerator = new THREE.PMREMGenerator(renderer);
        this._pmremGenerator.compileEquirectangularShader();

        this._applyParams(scene);

        this._active = true;
        console.log(
            '[ProceduralSkyService] Activated — elevation:',
            this._params.elevation,
            'azimuth:', this._params.azimuth,
        );
    }

    /**
     * Deactivates the sky — removes the mesh and restores scene.environment.
     * Safe to call even if activate() was never called.
     */
    deactivate(): void {
        if (!this._active || !this._scene) return;

        if (this._sky) {
            this._scene.remove(this._sky);
            this._sky.geometry.dispose();
            (this._sky.material as THREE.Material).dispose();
            this._sky = null;
        }

        this._scene.environment = this._savedEnv;

        this._currentEnvMap?.dispose();
        this._currentEnvMap = null;

        this._pmremGenerator?.dispose();
        this._pmremGenerator = null;

        this._savedEnv = null;
        this._active   = false;

        console.log('[ProceduralSkyService] Deactivated — scene.environment restored.');
    }

    // ── Sky parameter setters ────────────────────────────────────────────────

    /** Set sun elevation (0 = horizon, 90 = zenith) and re-bake PMREM. */
    setElevation(deg: number): void {
        this._params.elevation = Math.max(0, Math.min(90, deg));
        this._rebakeIfActive();
    }

    /** Set sun azimuth (0–360°) and re-bake PMREM. */
    setAzimuth(deg: number): void {
        this._params.azimuth = ((deg % 360) + 360) % 360;
        this._rebakeIfActive();
    }

    /** Set atmospheric turbidity (0–20) and re-bake PMREM. */
    setTurbidity(val: number): void {
        this._params.turbidity = Math.max(0, Math.min(20, val));
        this._rebakeIfActive();
    }

    /** Set Rayleigh scattering coefficient (0–4) and re-bake PMREM. */
    setRayleigh(val: number): void {
        this._params.rayleigh = Math.max(0, Math.min(4, val));
        this._rebakeIfActive();
    }

    /**
     * Apply a named sky preset (morning / noon / golden-hour / overcast).
     */
    applyPreset(id: SkyPresetId): void {
        const preset = SKY_PRESETS[id];
        if (!preset) return;
        this._params = { ...preset };
        this._rebakeIfActive();
    }

    // ── Private helpers ──────────────────────────────────────────────────────

    private _rebakeIfActive(): void {
        if (this._active && this._scene) {
            this._applyParams(this._scene);
        }
    }

    /**
     * Applies the current sky parameters to the Sky shader uniforms and
     * regenerates the PMREM environment map for IBL.
     *
     * Strategy: briefly move the sky mesh into a temporary THREE.Scene so
     * PMREMGenerator.fromScene() can capture it from all six directions, then
     * move it back to the main scene for visible background rendering.
     */
    private _applyParams(scene: THREE.Scene): void {
        if (!this._sky || !this._pmremGenerator) return;

        const u = (this._sky as any).material.uniforms as Record<string, THREE.IUniform>;
        u['turbidity'].value       = this._params.turbidity;
        u['rayleigh'].value        = this._params.rayleigh;
        u['mieCoefficient'].value  = this._params.mieCoefficient;
        u['mieDirectionalG'].value = this._params.mieDirectionalG;

        const phi   = THREE.MathUtils.degToRad(90 - this._params.elevation);
        const theta = THREE.MathUtils.degToRad(this._params.azimuth);
        this._sun.setFromSphericalCoords(1, phi, theta);
        u['sunPosition'].value.copy(this._sun);

        // Temporarily move sky to a private scene for PMREM capture
        const captureScene = new THREE.Scene();
        scene.remove(this._sky);
        captureScene.add(this._sky);

        if (this._currentEnvMap) {
            this._currentEnvMap.dispose();
            this._currentEnvMap = null;
        }

        try {
            const renderTarget    = this._pmremGenerator.fromScene(captureScene as any);
            this._currentEnvMap   = renderTarget.texture;
            scene.environment     = this._currentEnvMap;
        } catch (err: any) {
            console.warn('[ProceduralSkyService] PMREMGenerator error:', err?.message ?? err);
        }

        // Move sky back to main scene for visible background rendering
        captureScene.remove(this._sky);
        scene.add(this._sky);
    }

    dispose(): void {
        this.deactivate();
    }
}
