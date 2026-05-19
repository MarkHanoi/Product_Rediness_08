/**
 * @file src/core/rendering/HDRIEnvironmentManager.ts
 * @description Manages HDRI environment map loading for photorealistic Render Mode.
 *
 * CONTRACT (01-BIM-ENGINE-CORE-CONTRACT §3.5, §4.3):
 *  - This service is completely isolated from the BIM element lifecycle.
 *  - It does NOT mutate any ElementStore.
 *  - It only modifies THREE.Scene.environment (a Three.js concern, not a semantic one).
 *  - HDRIs are loaded lazily and cached per-session to avoid redundant network requests.
 *
 * HDRI Sources (CC0 / free commercial use):
 *  - Polyhaven: https://polyhaven.com/hdris (dl.polyhaven.org CDN for 1K/2K HRDs)
 */

import * as THREE from '@pryzm/renderer-three/three';
import { RGBELoader } from '@pryzm/renderer-three';

export interface HDRIPreset {
    id: string;
    label: string;
    description: string;
    url: string;
    intensity: number;
}

/**
 * Curated HDRI presets for architectural interior/exterior visualization.
 * All sourced from Polyhaven (CC0) at 1K resolution for fast loading.
 */
export const HDRI_PRESETS: HDRIPreset[] = [
    {
        id: 'studio-neutral',
        label: 'Studio · Neutral',
        description: 'Clean product photography studio',
        url: 'https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/1k/studio_small_04_1k.hdr',
        intensity: 1.0,
    },
    {
        id: 'studio-warm',
        label: 'Studio · Warm',
        description: 'Warm photo studio lighting',
        url: 'https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/1k/photo_studio_01_1k.hdr',
        intensity: 1.0,
    },
    {
        id: 'daylight-interior',
        label: 'Daylight · Interior',
        description: 'Warm natural daylight through windows',
        url: 'https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/1k/lebombo_1k.hdr',
        intensity: 1.2,
    },
    {
        id: 'daylight-overcast',
        label: 'Daylight · Overcast',
        description: 'Soft overcast sky for even lighting',
        url: 'https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/1k/kloofendal_overcast_puresky_1k.hdr',
        intensity: 1.1,
    },
    {
        id: 'evening',
        label: 'Evening · Golden Hour',
        description: 'Dramatic warm evening light',
        url: 'https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/1k/evening_road_01_1k.hdr',
        intensity: 0.9,
    },
    {
        id: 'outdoor-bright',
        label: 'Outdoor · Bright Sun',
        description: 'Full midday sun for exterior renders',
        url: 'https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/1k/rural_asphalt_road_1k.hdr',
        intensity: 1.5,
    },
];

export class HDRIEnvironmentManager {
    private loader = new RGBELoader();
    private cache = new Map<string, THREE.DataTexture>();
    private pmremGenerator: THREE.PMREMGenerator | null = null;
    private currentPresetId: string | null = null;

    constructor(renderer: THREE.WebGLRenderer) {
        this.pmremGenerator = new THREE.PMREMGenerator(renderer);
        this.pmremGenerator.compileEquirectangularShader();
    }

    /**
     * Loads an HDRI preset and applies it as the scene environment.
     * Caches the processed texture so subsequent calls are instant.
     */
    async applyPreset(
        scene: THREE.Scene,
        presetId: string,
    ): Promise<THREE.Texture | null> {
        const preset = HDRI_PRESETS.find(p => p.id === presetId);
        if (!preset) {
            console.warn(`[HDRIEnvironmentManager] Unknown preset: ${presetId}`);
            return null;
        }

        if (this.currentPresetId === presetId && scene.environment) {
            return scene.environment as THREE.Texture;
        }

        try {
            let envTexture: THREE.DataTexture;

            if (this.cache.has(presetId)) {
                envTexture = this.cache.get(presetId)!;
            } else {
                console.log(`[HDRIEnvironmentManager] Loading HDRI: ${preset.label}`);
                envTexture = await this.loadHDR(preset.url);
                this.cache.set(presetId, envTexture);
            }

            // Guard against race condition: deactivate() may dispose the generator
            // while an async HDRI network load is still in-flight.
            if (!this.pmremGenerator) {
                throw new Error('[HDRIEnvironmentManager] Already disposed (pmremGenerator is null).');
            }

            const envMap = this.pmremGenerator.fromEquirectangular(envTexture).texture;
            scene.environment = envMap;
            scene.background = envMap;

            this.currentPresetId = presetId;
            console.log(`[HDRIEnvironmentManager] Applied: ${preset.label}`);
            return envMap;
        } catch (err) {
            console.warn(`[HDRIEnvironmentManager] Failed to load HDRI ${presetId}:`, err);
            return null;
        }
    }

    /**
     * Applies HDRI to scene environment only (not background).
     * Use for interior renders where you want scene lighting but not a visible sky.
     */
    async applyPresetAsLightOnly(
        scene: THREE.Scene,
        presetId: string,
    ): Promise<THREE.Texture | null> {
        const preset = HDRI_PRESETS.find(p => p.id === presetId);
        if (!preset) return null;

        try {
            let envTexture: THREE.DataTexture;
            if (this.cache.has(presetId)) {
                envTexture = this.cache.get(presetId)!;
            } else {
                envTexture = await this.loadHDR(preset.url);
                this.cache.set(presetId, envTexture);
            }

            // Guard against race condition: deactivate() may dispose the generator
            // while an async HDRI network load is still in-flight.
            if (!this.pmremGenerator) {
                throw new Error('[HDRIEnvironmentManager] Already disposed (pmremGenerator is null).');
            }

            const envMap = this.pmremGenerator.fromEquirectangular(envTexture).texture;
            scene.environment = envMap;

            this.currentPresetId = presetId;
            return envMap;
        } catch (err) {
            console.warn(`[HDRIEnvironmentManager] Failed to load HDRI:`, err);
            return null;
        }
    }

    /**
     * Removes the HDRI environment from the scene.
     */
    removeEnvironment(scene: THREE.Scene): void {
        scene.environment = null;
        scene.background = null;
        this.currentPresetId = null;
    }

    dispose(): void {
        this.cache.forEach(tex => tex.dispose());
        this.cache.clear();
        this.pmremGenerator?.dispose();
        this.pmremGenerator = null;
    }

    private loadHDR(url: string): Promise<THREE.DataTexture> {
        return new Promise((resolve, reject) => {
            this.loader.load(url, resolve, undefined, reject);
        });
    }
}
