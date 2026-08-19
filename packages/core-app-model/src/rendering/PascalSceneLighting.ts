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
// §PRYZM-PERF (INSTR1) — full-scene traversal attribution.
import { bumpPerf, PERF_KEYS } from '@pryzm/frame-scheduler';
import {
    getNeutralStudioEnvironment,
    isNeutralStudioEnvironment,
} from './NeutralStudioEnvironment';

/**
 * §FEAT-PASCAL-METAL-ENV (L-967) — the environment intensity this path applies, and the
 * single number the founder's decision turns on. **MEASURED, NOT GUESSED.**
 *
 * ### What was wrong before
 * `apply()` set `scene.environment = null`, so a `metalness: 0.9` PBR surface — which
 * has no diffuse component worth the name and shows only what it REFLECTS — had nothing
 * to reflect. Every high-metalness material in the product rendered black: walls,
 * columns, beams, handrails, furniture. Curtain wall was merely where the founder
 * pointed a metal at a large flat face and looked at it.
 *
 * ### The measurement (`PascalSceneLighting.metalEnvironment.test.ts`)
 * Display bytes, ACESFilmic @ exposure 0.9 (both renderer adapters set exactly that),
 * on an environment normalised to unit mean radiance, panel facing the camera:
 *
 * ```
 *  envI   aluminium-brushed-dark   copper-new       special-mirror-silver   shadow-side wall   AO Δ
 *   0     5,7,8   <- BLACK         3,0,0  <- BLACK  0,0,0  <- BLACK         131                21.0
 *   0.3   26,30,33                 93,45,12         135,138,141             190                18.1
 *   0.5   37,42,47                 129,69,22        172,174,177             208                15.0
 *   0.75  50,56,61                 161,93,34        197,199,201             220                11.8
 *   1.0   62,69,75                 183,113,45       211,213,215             228                10.0
 *   2.0   100,109,116              224,165,83       234,235,236             241                 5.0
 *  target 71,77,82                 184,115,51       223,227,232
 * ```
 *
 * A row "reads as its metal" when every channel is within 25 % of the catalogue byte OR
 * within 15 display bytes of it. The second clause is not slack: `steel-blackened` is
 * `#1d1f20`, a deliberately near-black metal, and a scale-free ratio would reject a
 * ten-byte error nobody can see. The sweep's FAILING column, measured:
 *
 * ```
 *   0     alu, copper, steel, mirror-silver     0.75  alu, copper
 *   0.3   alu, copper, steel, mirror-silver     1.0   none          <- shipped
 *   0.5   alu, copper, steel                    1.5   copper (OVERSHOOTS)
 *                                               2.0   alu, copper (OVERSHOOT)
 * ```
 *
 * **1.0 is not merely a floor — the window is [1.0, ~1.2] and closes again above it**,
 * because past ~1.5 the metals blow through the top of the 25 % band and copper turns
 * pale. At 0.75 the copper mullion's blue channel is still 33 % low and the aluminium
 * panel 30 % low: it reads as a dulled metal, not as the metal. Below 0.5 nothing reads
 * as metal at all. There is exactly one value in the swept set that clears all five.
 *
 * ### What it costs, stated rather than hidden
 * AO contrast on a shadow-side surface falls from **21.0 to 10.0 display bytes** — it
 * retains 48 %, it does not vanish, and the shadow side lifts from 131 to 228. That is a
 * real loss and the founder accepted it: *"I just need to see metal colours."* Metals win
 * where the two conflict.
 *
 * ### Why the AO RATIO survives at all — the thing the old comment could not know
 * `RenderPipelineManager._buildPhase3Pipeline` composites SSGI as
 * `final = scene.rgb x AO + (zone + diffuse x GI)`. AO multiplies the **whole** beauty
 * buffer, so the linear AO ratio (1 - AO) is preserved EXACTLY at every intensity. What
 * shrinks above is only the *display-byte* delta, because ACES + the sRGB OETF compress
 * contrast as luminance climbs into the shoulder. AO is dimmed by tone-mapping, not
 * deleted by the environment.
 *
 * ### Why `1.0` is a LOW intensity here and was not for the HDRI
 * The comment in `apply()` recorded that even `environmentIntensity = 0.3` washed AO out.
 * That was measured against an **HDRI**, whose mean radiance is routinely 5-50x a white
 * card. `NeutralStudioEnvironment` is normalised so its mean radiance is exactly **1.0**,
 * so `1.0` here is roughly an HDRI at 0.02-0.2. Both observations are true; they are
 * about different stimuli. Do not "reconcile" them by lowering this to 0.3.
 */
export const PASCAL_ENV_INTENSITY = 1.0;

/**
 * §FIX-SHADOW-CASTER-DENYLIST (L-205) — a mesh whose world-space bounding radius exceeds this is
 * scene infrastructure (a ground/backdrop plane), never a BIM element, and must never cast a
 * shadow. For scale: a 40-storey tower is ~140 m tall on a ~44 m footprint (radius ~75 m); the
 * whole Madrid site fits inside 500 m. A ground-level plane that casts shadows shadows the entire
 * L0 shadow catcher, painting a solid grey rectangle the size of the shadow camera's footprint.
 * See C04 §SHADOW.
 */
const MAX_CASTER_RADIUS_M = 500;

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

    /**
     * §PERF-HEAVY-SHADOW-OFF — whether the shadow pass is currently suppressed.
     *
     * The key light is the ONLY default shadow caster in the scene. When the scene
     * is heavy (≥ the coordinator's LARGE_SCENE_SHADOWS_OFF ceiling) or the camera is
     * actively navigating, clearing `keyLight.castShadow` removes the whole shadow
     * pass — THREE renders no ShadowDepthTexture and skips every one of the ~12.7k
     * shadow-caster draws. Reversible via setShadowsSuppressed(false).
     */
    private _shadowsSuppressed = false;
    /** Remembers the key light's configured castShadow so restore is exact. */
    private _keyLightWantsShadow = false;

    get applied(): boolean { return this._applied; }

    /** §PERF-HEAVY-SHADOW-OFF — true while the shadow pass is suppressed. */
    get shadowsSuppressed(): boolean { return this._shadowsSuppressed; }

    /**
     * §FEAT-REAL-ENVIRONMENT-SUN (ADR-0106) — the key light IS the scene's sole
     * real shadow caster. RealSunService drives its DIRECTION / COLOUR / INTENSITY
     * from the real solar position (site lat/lon + time-of-day) instead of adding a
     * competing parallel DirectionalLight — so there is exactly ONE shadow caster
     * and the §PERF-HEAVY-SHADOW-OFF single-lever assumption (keyLight.castShadow)
     * still holds. Null before apply() / after dispose(). Implements KeyLightHost.
     */
    get keyLight(): THREE.DirectionalLight | null { return this._keyLight; }

    /** The live scene this lighting is applied to (null before apply/after dispose). */
    get scene(): THREE.Scene | null { return this._scene; }

    /**
     * Injects Pascal's lighting into the Three.js scene.
     *
     * Matches Pascal/packages/viewer/src/components/viewer/lights.tsx exactly:
     *   - 3 directional lights (key=4, fill=0.75, rim=1) + ambient (0.5)
     *   - Key light shadow.intensity = 0.4 (light mode — softer shadows)
     *   - The HDRI is dropped — Pascal's viewer never sets scene.environment.
     *     HDRI IBL floods the scene with uniform ambient from all directions,
     *     making SSGI AO (~15-30% darkening) invisible against the bright base.
     *     Pascal achieves contrast overwhelmingly through directional lights.
     *   - §FEAT-PASCAL-METAL-ENV (L-967) — but NOT to null. A dim unit-mean neutral
     *     environment goes in at PASCAL_ENV_INTENSITY so metals have something to
     *     reflect; null made every metalness-0.9 material in the product render black.
     *     The sweep and the AO cost are on PASCAL_ENV_INTENSITY.
     *
     * @param scene  - The shared THREE.Scene (world.scene.three)
     * @param config - Optional overrides (defaults match Pascal exactly)
     */
    apply(scene: THREE.Scene, config: Partial<PascalLightingConfig> = {}): void {
        if (this._applied) return;

        const cfg = { ...DEFAULT_CONFIG, ...config };
        this._scene = scene;

        // ── 1. Drop the HDRI; install the dim neutral baseline ────────────────
        //
        // THE ORIGINAL REASONING, KEPT BECAUSE IT IS STILL TRUE:
        // Pascal's viewer (lights.tsx) NEVER sets scene.environment.
        // IBL from an HDRI texture floods the scene with uniform ambient light
        // from all directions — even with environmentIntensity=0.3 this creates
        // enough flat ambient that SSGI's AO darkening (~15-30%) is nearly
        // invisible against the bright, uniformly-lit base colors.
        // Clearing the HDRI makes PRYZM's scene match Pascal:
        //   - No IBL ambient from HDRI
        //   - Lighting comes overwhelmingly from the 3 directional lights + ambient
        //   - SSGI AO contrast (darkened corners) stays readable
        //
        // §FEAT-PASCAL-METAL-ENV (L-967) — WHAT CHANGED, AND ON WHOSE AUTHORITY.
        // This block used to end `scene.environment = null`, and that is exactly why
        // every high-metalness material in the product rendered BLACK. A metal has no
        // diffuse component; it shows what it reflects; there was nothing to reflect.
        // It was not a curtain-wall defect and not a regression — it was the stated
        // trade-off, correctly implemented, resolved the wrong way for the product.
        //
        // The founder resolved it: *"I just need to see metal colours — in both WebGPU
        // and WebGL2."* Metals win where the two conflict. So instead of NULL we install
        // a dim, unit-mean, neutral studio environment at PASCAL_ENV_INTENSITY — whose
        // whole derivation, the intensity sweep, and the AO cost in display bytes are in
        // that constant's doc comment. It is NOT an HDRI: it is ~1/25th of one, and the
        // original objection above was measured against an HDRI.
        //
        // WHY IT MUST BE THIS TEXTURE AND NOT `ProceduralSkyService`/`HDRIEnvironmentManager`:
        // both build their environment with a PMREMGenerator bound to a RENDERER, and a
        // live backend swap retires that renderer (§RETIRE-RENDERER-DETACHES-LISTENERS,
        // L-948). Their output would be a dead texture on the next device loss and the
        // metals would go black INTERMITTENTLY. See NeutralStudioEnvironment.ts.
        //
        // WE STILL YIELD. If a real provider has already claimed the slot (sky, HDRI,
        // realtime lighting), we leave its environment alone — this baseline exists for
        // the case where NOBODY provides one, which on the Phase 5 / WebGPU path is
        // always, because initScene deliberately passes hdriPresetId: 'none' there.
        this._savedEnv             = scene.environment as THREE.Texture | null;
        this._savedEnvIntensity    = scene.environmentIntensity ?? 1;
        const incumbentIsRealProvider =
            !!this._savedEnv && !isNeutralStudioEnvironment(this._savedEnv);
        if (!incumbentIsRealProvider) {
            scene.environment          = getNeutralStudioEnvironment();
            scene.environmentIntensity = PASCAL_ENV_INTENSITY;
        }

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
        // §PERF-HEAVY-SHADOW-OFF — remember the configured intent so we can restore
        // it exactly after a suppression, then honour any suppression requested by
        // the tier gate BEFORE the lights existed (apply() may run after the first
        // applyTierForMeshCount on a pre-warmed renderer).
        this._keyLightWantsShadow = keyLight.castShadow;
        if (this._shadowsSuppressed) keyLight.castShadow = false;
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
            ', scene.environment → ' + (scene.environment?.name ?? 'null') +
            ' @ intensity ' + scene.environmentIntensity +
            ' (§FEAT-PASCAL-METAL-ENV L-967 — metals need something to reflect)'
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
     * §PERF-HEAVY-SHADOW-OFF — suppress (or restore) the whole scene shadow pass.
     *
     * The Pascal key light is the sole default shadow caster, so clearing its
     * `castShadow` makes THREE render NO shadow pass at all — it never allocates or
     * churns the ShadowDepthTexture and skips shadow draws for every one of the
     * ~12.7k flagged meshes. This is the correct lever for the 40-storey office,
     * whose shadow pass (12,737 casters every navigation frame) is the dominant
     * per-frame cost.
     *
     * Why this and not only RenderingPipelineCoordinator's ShadowQualityUpgrader:
     * the coordinator binds its upgrader to the OBC WebGL renderer (silenced in
     * Phase 5) and only de-shadows the lights IT snapshotted — it never touches the
     * Pascal key light nor the live PRYZM WebGPU renderer that actually draws the
     * shadow pass. So the documented ≥8000-caster ceiling never reached the real
     * caster. This method closes that gap by acting on the key light directly.
     *
     * Idempotent. Safe to call before apply() — the intent is stored and honoured
     * when the key light is created. Fully reversible: setShadowsSuppressed(false)
     * restores the light's originally-configured castShadow.
     *
     * NOTE: does NOT dispose any GPU texture (respects §SHADOW-DEVICE-LOSS-FIX —
     * clearing castShadow lets THREE reclaim the shadow map on its own schedule,
     * never mid-submit).
     *
     * @param suppressed  true ⇒ no shadow pass; false ⇒ restore configured shadows.
     */
    setShadowsSuppressed(suppressed: boolean): void {
        if (suppressed === this._shadowsSuppressed) return;
        this._shadowsSuppressed = suppressed;

        if (this._keyLight) {
            this._keyLight.castShadow = suppressed ? false : this._keyLightWantsShadow;
        }
        console.log(
            `[PascalSceneLighting] §PERF-HEAVY-SHADOW-OFF shadow pass ` +
            `${suppressed ? 'SUPPRESSED (key light no longer casts — no shadow pass)' : 'RESTORED'}.`,
        );
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

        // Restore whatever owned scene.environment before apply() (usually null, or an
        // HDRI on the OBC/WebGL path). §FEAT-PASCAL-METAL-ENV (L-967) — the neutral
        // studio baseline is a process-wide singleton shared by every scene, so it is
        // dropped from THIS scene here and never disposed.
        scene.environment          = this._savedEnv;
        scene.environmentIntensity = this._savedEnvIntensity;
        this._savedEnv             = null;

        this._keyLight  = null;
        this._fillLight = null;
        this._rimLight  = null;
        this._ambient   = null;
        this._scene     = null;
        this._applied   = false;
        // §PERF-HEAVY-SHADOW-OFF — forget suppression so the next project is a cold start.
        this._shadowsSuppressed   = false;
        this._keyLightWantsShadow = false;

        console.log('[PascalSceneLighting] Disposed — scene lighting restored.');
    }

    // ── Private ─────────────────────────────────────────────────────────────

    /**
     * Traverses the scene and enables castShadow + receiveShadow on every Mesh.
     * Skips helper meshes (edges, collision, grid) via userData role guard.
     * Safe to call multiple times — no-op for meshes already flagged.
     */
    private _enableShadowsOnScene(scene: THREE.Scene): void {
        // §PRYZM-PERF (INSTR1) — full-scene walk, attributed to this call site.
        bumpPerf(PERF_KEYS.TRAVERSE_SCENE_LIGHTING);
        let count = 0;
        /** §FIX-SHADOW-CASTER-DENYLIST (L-205) — offenders demoted this pass, for the log. */
        const demoted: string[] = [];

        scene.traverse((obj) => {
            if (!(obj instanceof THREE.Mesh)) return;

            // Skip non-geometry helpers: edge overlays, collision meshes, grid lines
            const role = obj.userData?.role as string | undefined;
            const name = (obj.name ?? '').toLowerCase();
            if (role === 'edges' || role === 'edge-overlay') return;
            if (name.includes('edge') || name.includes('grid') || name.includes('collision')) return;

            // §PERF-RHINO — imported reference meshes (Rhino .3dm proxies) are
            // excluded from the shadow passes entirely. The importer sets
            // castShadow/receiveShadow=false at import; without this guard the
            // next full-scene pass (any wall/slab/furniture edit) silently
            // re-promoted all N hundred of them to casters, and a 22 MB model
            // became N hundred extra shadow-pass draw calls per frame.
            if (obj.userData?.isRhinoProxy === true) return;

            const mat = Array.isArray(obj.material) ? obj.material[0] : obj.material;

            // §FIX-SHADOW-CASTER-DENYLIST (L-205) — a mesh that EXISTS TO RECEIVE a shadow must
            // never CAST one. Previously the only thing keeping the L0 ground catcher out of the
            // caster set was an incidental `transparent && opacity < 0.5` check, and that check
            // merely `return`s: it never CLEARS a `castShadow` some other pass already set. A
            // ground-level plane that casts shadows shadows the entire catcher, producing a solid
            // grey rectangle bounded exactly by the shadow camera's footprint — at ±50 m a ~100 m
            // square, at ±113 km the whole horizon. Demote explicitly, don't merely skip.
            const isShadowReceiverPlane =
                role === 'ground-shadow-catcher' ||
                (mat as THREE.Material | undefined)?.type === 'ShadowMaterial';

            // A real BIM element is never this large. A scene/ground plane always is. Any mesh
            // above this radius is infrastructure, not geometry, and must not cast. This also
            // catches whatever non-BIM plane the OBC ShadowedScene installs at boot (the scene
            // has 2 meshes and 0 elements at that point, yet 1 was being flagged as a caster).
            let radiusM = 0;
            try {
                if (!obj.geometry.boundingSphere) obj.geometry.computeBoundingSphere();
                radiusM = (obj.geometry.boundingSphere?.radius ?? 0) *
                    Math.max(Math.abs(obj.scale.x), Math.abs(obj.scale.y), Math.abs(obj.scale.z));
            } catch { /* degenerate geometry — treat as small */ }
            const isImplausiblyLarge = Number.isFinite(radiusM) && radiusM > MAX_CASTER_RADIUS_M;

            if (isShadowReceiverPlane || isImplausiblyLarge) {
                if (obj.castShadow) {
                    obj.castShadow = false;   // demote: clear, don't just skip
                    demoted.push(`${obj.name || '(unnamed)'}[${(mat as THREE.Material | undefined)?.type ?? '?'}` +
                        `${role ? ` role=${role}` : ''} r=${radiusM.toFixed(0)}m]`);
                }
                // Receivers still receive — that is their whole purpose.
                obj.receiveShadow = true;
                return;
            }

            // Skip transparent/glass meshes — they cause shadow artifacts
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
        if (demoted.length > 0) {
            console.log(
                `[PascalSceneLighting] §FIX-SHADOW-CASTER-DENYLIST demoted ${demoted.length} ` +
                `non-caster mesh(es) (receiver plane or radius > ${MAX_CASTER_RADIUS_M} m): ${demoted.join(', ')}`,
            );
        }
    }
}

/** Singleton instance — imported and used by EngineBootstrap */
export const pascalSceneLighting = new PascalSceneLighting();
