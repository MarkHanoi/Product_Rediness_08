/**
 * @file src/core/rendering/RealtimeLightingService.ts
 * @description Phase 1 — Real-time HDRI environment + lighting quality upgrade
 *   for the BIM authoring viewport (Enscape benchmark target).
 *
 * CONTRACT (01-BIM-ENGINE-CORE-CONTRACT §4.3, §5):
 *  - NEVER mutates any ElementStore or semantic state.
 *  - Operates exclusively on the Three.js scene's environment / background
 *    properties — the projection layer only.
 *  - Saves the original scene environment on activate() and restores it
 *    precisely on deactivate() — authoring state is fully preserved.
 *  - Does NOT import @thatopen/* packages.
 *
 * CONTRACT (05-BIM-UI-ARCHITECTURE-CONTRACT §1):
 *  - No UI is created here. UI must live in src/ui/rendering/.
 *
 * Gap addressed (Audit Section 4 — GAP D):
 *   "Lack of GI, HDRI, physical lighting" in the real-time authoring viewport.
 *   The authoring viewport previously used a static equirectangular HDRI from
 *   @thatopen CDN only in Realistic visual style. This service provides a
 *   full HDRI pipeline for the live viewport at all quality levels, matching
 *   the Enscape model (always-on HDRI-based image-based lighting).
 */

import * as THREE from '@pryzm/renderer-three/three';
import { HDRIEnvironmentManager, HDRI_PRESETS, HDRIPreset } from './HDRIEnvironmentManager';

// ── Types ──────────────────────────────────────────────────────────────────

export type RLSStatus = 'inactive' | 'loading' | 'active' | 'error';

export interface RealtimeLightingOptions {
    /** HDRI preset id from HDRIEnvironmentManager (default: 'daylight-interior') */
    presetId?: string;
    /** Override HDRI intensity (default: uses preset's own intensity) */
    intensity?: number;
    /** Whether to show the HDRI as the scene background (default: false) */
    showBackground?: boolean;
    /** Rotation of environment map in radians (default: 0) */
    envRotation?: number;
}

// ── Class ─────────────────────────────────────────────────────────────────

export class RealtimeLightingService {
    private _status: RLSStatus = 'inactive';
    private _hdriManager: HDRIEnvironmentManager | null = null;
    private _scene: THREE.Scene | null = null;

    /** Saved scene state — restored on deactivate. */
    private _savedEnv: THREE.Texture | null = null;
    private _savedBg: THREE.Color | THREE.Texture | null = null;
    private _savedEnvRotation = 0;

    private _opts: Required<RealtimeLightingOptions> = {
        presetId:       'daylight-interior',
        intensity:      1.0,
        showBackground: false,
        envRotation:    0,
    };

    /** Fired whenever status changes. */
    onStatusChange?: (status: RLSStatus) => void;
    /** Fired when HDRI finishes loading. */
    onReady?: (presetId: string) => void;

    // ── Public getters ─────────────────────────────────────────────────────

    get status(): RLSStatus { return this._status; }
    get active(): boolean   { return this._status === 'active'; }
    get presets(): HDRIPreset[] { return HDRI_PRESETS; }
    get currentPresetId(): string { return this._opts.presetId; }

    // ── Public API ─────────────────────────────────────────────────────────

    /**
     * Activates real-time HDRI lighting on the live BIM authoring scene.
     *
     * @param scene    - Main THREE.Scene (env temporarily modified)
     * @param renderer - Main WebGLRenderer (PMREM generation)
     * @param opts     - Override any default options
     */
    async activate(
        scene:    THREE.Scene,
        renderer: THREE.WebGLRenderer,
        opts:     RealtimeLightingOptions = {},
    ): Promise<void> {
        if (this._status === 'active' || this._status === 'loading') return;

        this._opts    = { ...this._opts, ...opts };
        this._scene   = scene;

        // Save current scene environment so we can restore it on deactivate
        this._savedEnv = scene.environment as THREE.Texture | null;
        this._savedBg  = scene.background  as THREE.Color | THREE.Texture | null;

        this._setStatus('loading');

        try {
            this._hdriManager = new HDRIEnvironmentManager(renderer);
            await this._applyCurrentPreset();
            this._setStatus('active');
        } catch (err: any) {
            console.error('[RealtimeLightingService] Activation error:', err?.message ?? err);
            // Restore scene on failure
            scene.environment = this._savedEnv;
            scene.background  = this._savedBg as any;
            this._hdriManager?.dispose();
            this._hdriManager = null;
            this._setStatus('error');
        }
    }

    /**
     * Deactivates HDRI lighting and restores the scene to its pre-activation state.
     */
    deactivate(): void {
        if (this._status === 'inactive') return;

        if (this._scene) {
            this._scene.environment = this._savedEnv;
            this._scene.background  = this._savedBg as any;
            // Restore env rotation
            this._scene.environmentRotation.y = this._savedEnvRotation;
            this._scene = null;
        }

        this._hdriManager?.dispose();
        this._hdriManager = null;
        this._savedEnv    = null;
        this._savedBg     = null;

        this._setStatus('inactive');
    }

    /**
     * Switches the active HDRI preset without full deactivation.
     * A no-op if the service is not active.
     */
    async setPreset(presetId: string, intensity?: number): Promise<void> {
        if (this._status !== 'active') return;

        const preset = HDRI_PRESETS.find(p => p.id === presetId);
        if (!preset) {
            console.warn(`[RealtimeLightingService] Unknown preset: ${presetId}`);
            return;
        }

        this._opts.presetId = presetId;
        if (intensity !== undefined) this._opts.intensity = intensity;

        this._setStatus('loading');
        try {
            await this._applyCurrentPreset();
            this._setStatus('active');
        } catch (err: any) {
            console.warn('[RealtimeLightingService] Preset switch error:', err?.message ?? err);
            this._setStatus('active'); // Keep running even if preset fails
        }
    }

    /**
     * Toggles HDRI visibility as the scene background.
     */
    setShowBackground(show: boolean): void {
        if (!this._scene || this._status !== 'active') return;
        this._opts.showBackground = show;

        if (!show) {
            this._scene.background = this._savedBg as any;
        } else if (this._scene.environment) {
            this._scene.background = this._scene.environment;
        }
    }

    /**
     * Sets the environment map rotation (Y axis, radians).
     * Useful for dialing in the sun angle in the real-time viewport.
     */
    setEnvRotation(radians: number): void {
        if (!this._scene) return;
        this._opts.envRotation = radians;
        this._scene.environmentRotation.y = radians;
    }

    /**
     * Updates intensity of the HDRI environment.
     */
    setIntensity(intensity: number): void {
        if (!this._scene || this._status !== 'active') return;
        this._opts.intensity = intensity;
        this._scene.environmentIntensity = intensity;
    }

    dispose(): void {
        this.deactivate();
    }

    // ── Private ────────────────────────────────────────────────────────────

    private async _applyCurrentPreset(): Promise<void> {
        if (!this._hdriManager || !this._scene) return;

        const preset = HDRI_PRESETS.find(p => p.id === this._opts.presetId)
            ?? HDRI_PRESETS[0];

        if (this._opts.showBackground) {
            await this._hdriManager.applyPreset(this._scene, preset.id);
        } else {
            await this._hdriManager.applyPresetAsLightOnly(this._scene, preset.id);
            // Keep the user's original background intact
            this._scene.background = this._savedBg as any;
        }

        // Apply custom intensity (overrides preset default)
        const intensity = this._opts.intensity ?? preset.intensity;
        this._scene.environmentIntensity = intensity;

        // Apply env rotation if set
        this._scene.environmentRotation.y = this._opts.envRotation;

        this.onReady?.(preset.id);
        console.log(`[RealtimeLightingService] HDRI active: ${preset.label} (intensity: ${intensity})`);
    }

    private _setStatus(s: RLSStatus): void {
        this._status = s;
        this.onStatusChange?.(s);
    }
}
