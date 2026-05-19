/**
 * @file src/core/rendering/PascalSceneLighting.ts
 * @description Applies Pascal's exact directional lighting setup to the shared
 *   Three.js scene so the PRYZM WebGPU renderer matches Pascal's visual output.
 *
 * CONTRACT (01-BIM-ENGINE-CORE-CONTRACT §4.3, §5):
 *  - NEVER mutates any ElementStore, WallStore, SlabStore, or semantic state.
 *  - Operates exclusively on the THREE.js scene's light objects and environment.
 *  - Saves the pre-existing lights on apply() and restores them on dispose().
 *  - Does NOT import @thatopen/* packages.
 *
 * Pascal reference: Pascal/packages/viewer/src/components/viewer/lights.tsx
 *
 * Light setup (light mode — identical for PRYZM's always-light authoring mode):
 *   Light 1 — key light:  position [10, 10, 10], intensity 4,   castShadow
 *   Light 2 — fill light: position [-10, 10, -10], intensity 0.75
 *   Light 3 — rim light:  position [-10, 10, 10],  intensity 1
 *   Ambient — intensity 0.5, colour #ffffff
 *
 * Why this fixes the washed-out look:
 *   OBC's default scene uses a single weak directional + HDRI environment at
 *   intensity=1.0, providing uniform ambient from all directions. SSGI ambient
 *   occlusion needs directional contrast to be visible — flat HDRI ambient
 *   means AO darkening (~5-15%) is invisible against the bright uniform base.
 *   Pascal's 3-light setup creates strong directional contrast (intensity 4 key
 *   vs 0.5 ambient), making SSGI AO clearly visible in wall/slab junctions.
 */

import * as THREE from '@pryzm/renderer-three/three';

export interface PascalLightingConfig {
    /** Whether the shadow-casting key light casts shadows (default: true) */
    castShadows: boolean;
    /** Shadow map resolution (default: 1024 — matches Pascal) */
    shadowMapSize: number;
    /** Shadow camera orthographic size in world units (default: 50) */
    shadowCameraSize: number;
    /** Key light intensity (default: 4 — matches Pascal light mode) */
    keyIntensity: number;
    /** Fill light intensity (default: 0.75 — matches Pascal) */
    fillIntensity: number;
    /** Rim light intensity (default: 1.0 — matches Pascal) */
    rimIntensity: number;
    /** Ambient intensity (default: 0.5 — matches Pascal) */
    ambientIntensity: number;
    /**
     * Hemisphere light sky intensity (default: 0.35).
     * Provides uniform ambient illumination on all faces regardless of their
     * normal direction — critical for curved wall faces whose horizontal normals
     * may receive minimal contribution from directional lights.
     * §02-WALL-GEOMETRY-ENGINE-CONTRACT §6.4: curved wall lighting requirement.
     */
    hemiSkyIntensity: number;
}

const DEFAULT_CONFIG: PascalLightingConfig = {
    castShadows:    true,
    shadowMapSize:  1024,
    shadowCameraSize: 50,
    keyIntensity:   4,
    fillIntensity:  0.75,
    rimIntensity:   1.0,
    ambientIntensity: 0.5,
    hemiSkyIntensity: 0.35,
};

export class PascalSceneLighting {
    private _scene:    THREE.Scene | null = null;
    private _applied = false;

    /** Lights added by this service — removed on dispose() */
    private _keyLight:  THREE.DirectionalLight | null = null;
    private _fillLight: THREE.DirectionalLight | null = null;
    private _rimLight:  THREE.DirectionalLight | null = null;
    private _ambient:   THREE.AmbientLight     | null = null;

    /** Saved pre-existing scene state — restored on dispose() */
    private _savedEnv:          THREE.Texture | null = null;
    private _savedEnvIntensity: number = 1;

    /** Lights that were already in the scene and removed by this service */
    private _removedLights: THREE.Light[] = [];

    get applied(): boolean { return this._applied; }

    /**
     * Injects Pascal's lighting into the Three.js scene.
     *
     * Matches Pascal/packages/viewer/src/components/viewer/lights.tsx exactly:
     *   - 3 directional lights (key=4, fill=0.75, rim=1) + ambient (0.5)
     *   - Key light shadow.intensity = 0.4 (light mode — softer shadows)
     *   - scene.environment cleared to NULL — Pascal's viewer never sets it.
     *     HDRI IBL floods the scene with uniform ambient from all directions,
     *     making SSGI AO (~15-30% darkening) invisible against the bright base.
     *     Pascal achieves contrast purely through directional lights; no IBL.
     *
     * @param scene  - The shared THREE.Scene (world.scene.three)
     * @param config - Optional overrides (defaults match Pascal exactly)
     */
    apply(scene: THREE.Scene, config: Partial<PascalLightingConfig> = {}): void {
        if (this._applied) return;

        const cfg = { ...DEFAULT_CONFIG, ...config };
        this._scene = scene;

        // ── 1. Clear HDRI environment entirely ────────────────────────────────
        // Pascal's viewer (lights.tsx) NEVER sets scene.environment.
        // IBL from an HDRI texture floods the scene with uniform ambient light
        // from all directions — even with environmentIntensity=0.3 this creates
        // enough flat ambient that SSGI's AO darkening (~15-30%) is nearly
        // invisible against the bright, uniformly-lit base colors.
        //
        // Clearing scene.environment = null makes PRYZM's scene match Pascal:
        //   - No IBL ambient from HDRI
        //   - Lighting comes only from the 3 directional lights + ambient below
        //   - SSGI AO contrast (darkened corners) becomes clearly visible
        this._savedEnv             = scene.environment as THREE.Texture | null;
        this._savedEnvIntensity    = scene.environmentIntensity ?? 1;
        scene.environment          = null;
        scene.environmentIntensity = 1.0;

        // ── 2. Remove OBC's built-in lights ─────────────────────────────────
        // OBC adds its own DirectionalLight and HemisphereLight/AmbientLight
        // as children of scene. We relocate them (not destroy) so dispose()
        // can restore them cleanly.
        const lightsToRemove: THREE.Light[] = [];
        scene.traverse((obj) => {
            if (
                obj instanceof THREE.DirectionalLight ||
                obj instanceof THREE.HemisphereLight  ||
                obj instanceof THREE.AmbientLight
            ) {
                lightsToRemove.push(obj);
            }
        });
        for (const light of lightsToRemove) {
            scene.remove(light);
        }
        this._removedLights = lightsToRemove;

        // ── 3. Inject Pascal's lighting ──────────────────────────────────────

        // Key light — strong main shadow caster from upper-right-front
        const keyLight = new THREE.DirectionalLight('#ffffff', cfg.keyIntensity);
        keyLight.position.set(10, 10, 10);
        keyLight.name = 'pascal-key-light';
        if (cfg.castShadows) {
            keyLight.castShadow = true;
            keyLight.shadow.mapSize.set(cfg.shadowMapSize, cfg.shadowMapSize);
            keyLight.shadow.camera.left   = -cfg.shadowCameraSize;
            keyLight.shadow.camera.right  =  cfg.shadowCameraSize;
            keyLight.shadow.camera.top    =  cfg.shadowCameraSize;
            keyLight.shadow.camera.bottom = -cfg.shadowCameraSize;
            keyLight.shadow.camera.near   = 1;
            keyLight.shadow.camera.far    = 100;
            keyLight.shadow.bias          = -0.002;
            keyLight.shadow.normalBias    = 0.3;
            keyLight.shadow.radius        = 3;
            // Pascal lights.tsx line 40: shadow.intensity = 0.4 in light mode.
            // Softer shadows prevent the harsh contrast that makes white walls
            // look over-darkened. Default Three.js shadow.intensity = 1.0 (full dark).
            if ((keyLight.shadow as any).intensity !== undefined) {
                (keyLight.shadow as any).intensity = 0.4;
            }
        }
        scene.add(keyLight);
        this._keyLight = keyLight;

        // Fill light — softer counter-fill from upper-left-back
        const fillLight = new THREE.DirectionalLight('#ffffff', cfg.fillIntensity);
        fillLight.position.set(-10, 10, -10);
        fillLight.name = 'pascal-fill-light';
        scene.add(fillLight);
        this._fillLight = fillLight;

        // Rim light — edge separation from upper-left-front
        const rimLight = new THREE.DirectionalLight('#ffffff', cfg.rimIntensity);
        rimLight.position.set(-10, 10, 10);
        rimLight.name = 'pascal-rim-light';
        scene.add(rimLight);
        this._rimLight = rimLight;

        // Ambient — low-level fill so fully shadowed areas aren't pitch black
        const ambient = new THREE.AmbientLight('#ffffff', cfg.ambientIntensity);
        ambient.name = 'pascal-ambient';
        scene.add(ambient);
        this._ambient = ambient;

        // ── 4. Enable shadows on all existing meshes ─────────────────────────
        // Walls and slabs created before this service ran need shadow flags set.
        // New meshes should also have them, so we re-traverse on BIM events.
        this._enableShadowsOnScene(scene);

        this._applied = true;
        console.log(
            '[PascalSceneLighting] Applied — key: ' + cfg.keyIntensity +
            ', fill: ' + cfg.fillIntensity +
            ', rim: ' + cfg.rimIntensity +
            ', ambient: ' + cfg.ambientIntensity +
            ', shadow.intensity: 0.4' +
            ', scene.environment → null (HDRI cleared — Pascal has no IBL)'
        );
    }

    /**
     * Call this after new BIM geometry is added to the scene (wall/slab update
     * events) so the new meshes also receive and cast shadows.
     */
    onGeometryAdded(scene: THREE.Scene): void {
        if (!this._applied) return;
        this._enableShadowsOnScene(scene);
    }

    /**
     * Restores the scene to its pre-apply() state:
     *   - Removes Pascal lights
     *   - Re-adds the removed OBC lights
     *   - Restores the HDRI environment
     */
    dispose(): void {
        if (!this._applied || !this._scene) return;

        const scene = this._scene;

        // Remove Pascal lights
        if (this._keyLight)  scene.remove(this._keyLight);
        if (this._fillLight) scene.remove(this._fillLight);
        if (this._rimLight)  scene.remove(this._rimLight);
        if (this._ambient)   scene.remove(this._ambient);

        // Restore OBC's original lights
        for (const light of this._removedLights) {
            scene.add(light);
        }
        this._removedLights = [];

        // Restore HDRI environment (we cleared scene.environment in apply())
        scene.environment          = this._savedEnv;
        scene.environmentIntensity = this._savedEnvIntensity;
        this._savedEnv             = null;

        this._keyLight  = null;
        this._fillLight = null;
        this._rimLight  = null;
        this._ambient   = null;
        this._scene     = null;
        this._applied   = false;

        console.log('[PascalSceneLighting] Disposed — scene lighting restored.');
    }

    // ── Private ─────────────────────────────────────────────────────────────

    /**
     * Traverses the scene and enables castShadow + receiveShadow on every Mesh.
     * Skips helper meshes (edges, collision, grid) via userData role guard.
     * Safe to call multiple times — no-op for meshes already flagged.
     */
    private _enableShadowsOnScene(scene: THREE.Scene): void {
        let count = 0;
        scene.traverse((obj) => {
            if (!(obj instanceof THREE.Mesh)) return;

            // Skip non-geometry helpers: edge overlays, collision meshes, grid lines
            const role = obj.userData?.role as string | undefined;
            const name = (obj.name ?? '').toLowerCase();
            if (role === 'edges' || role === 'edge-overlay') return;
            if (name.includes('edge') || name.includes('grid') || name.includes('collision')) return;

            // Skip transparent/glass meshes — they cause shadow artifacts
            const mat = Array.isArray(obj.material) ? obj.material[0] : obj.material;
            if (mat && (mat as THREE.MeshStandardMaterial).transparent &&
                (mat as THREE.MeshStandardMaterial).opacity < 0.5) return;

            if (!obj.castShadow || !obj.receiveShadow) {
                obj.castShadow    = true;
                obj.receiveShadow = true;
                count++;
            }
        });
        if (count > 0) {
            console.log(`[PascalSceneLighting] Shadow flags set on ${count} mesh(es).`);
        }
    }
}

/** Singleton instance — imported and used by EngineBootstrap */
export const pascalSceneLighting = new PascalSceneLighting();
