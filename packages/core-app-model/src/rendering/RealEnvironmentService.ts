/**
 * @file packages/core-app-model/src/rendering/RealEnvironmentService.ts
 * @description §FEAT-REAL-ENVIRONMENT (ADR-0106) — the orchestrator that makes the
 *   View Properties "Environment & Camera" panel REAL. It wires two existing
 *   subsystem pieces to the live scene and the panel events:
 *
 *     8A  real sun   — a {@link RealSunService} driving the scene's SOLE real
 *                      shadow caster (the Pascal key light) from the true solar
 *                      position at the site lat/lon + time-of-day (same NOAA basis
 *                      as the Cesium/Forma globe and @pryzm/solar-analysis).
 *     8B  ground     — a {@link GroundShadowCatcher}: an invisible L0 plane so
 *                      every element casts a grounded shadow even with no slab.
 *
 * CONTRACT (01-BIM-ENGINE-CORE-CONTRACT §4.3, §5):
 *  - NEVER mutates any ElementStore or semantic state.
 *  - Operates exclusively on the THREE projection layer via the existing services.
 *  - Does NOT import @thatopen/* packages.
 *
 * Why NOT a parallel lighting/shadow subsystem (task mandate + §PERF-HEAVY-SHADOW-OFF):
 *  - The sun REUSES RealSunService and steers the SAME key light the perf gates
 *    suppress — one caster, one lever. No competing DirectionalLight is added.
 *  - The catcher adds ZERO casters (receive-only), so heavy/nav scenes that drop
 *    the shadow pass simply show no ground shadow. Fully reversible, no mid-submit
 *    GPU dispose — the ADR-0111 shadow-freeze paths are untouched.
 *
 * P3 (single rAF): this service performs NO animation and never calls
 * requestAnimationFrame — the sun is re-solved only on discrete input (time /
 * location / offset / level change).
 */

import * as THREE from '@pryzm/renderer-three/three';
import { GroundShadowCatcher } from '@pryzm/renderer-three';
import { RealSunService, type KeyLightHost, type SunMode } from './RealSunService.js';

/** How the RealEnvironmentService reads the current site location (C19). */
export type SiteLatLonReader = () => { lat: number; lon: number } | null;

/** How the RealEnvironmentService reads the L0 (lowest-level) ground elevation. */
export type GroundElevationReader = () => number;

/**
 * Orchestrates the real sun + ground shadow-catcher for one scene. One instance
 * per editor session, created and wired by `initScene`.
 */
export class RealEnvironmentService {
    private readonly _sun = new RealSunService();
    private readonly _ground = new GroundShadowCatcher();

    private _scene: THREE.Scene | null = null;
    private _readSiteLatLon: SiteLatLonReader = () => null;
    private _readGroundElevation: GroundElevationReader = () => 0;
    private _enabled = false;
    private _groundShadowsEnabled = true;

    /**
     * §L-205 caster-visibility gate (re-applied from L-200; the ONLY behaviour kept
     * from the reverted §FIX-GROUND-SHADOW-AT-PERF-TIER / §FIX-WEBGPU-* stack).
     *
     * Whether the scene currently holds any shadow-CASTING geometry. The catcher is a
     * `ShadowMaterial` plane: with NO caster it composites as "fully shadowed" → an
     * opaque grey fill on WebGPU (the founder's empty-project grey square). We suppress
     * that COSMETIC grey by gating only the catcher's VISIBILITY on caster presence —
     * a pure scene-graph boolean. The receiver stays ATTACHED (in the shadow pass) from
     * frame 1 (L-112), so this never drops it from the shadow-sampling set. Updated by
     * {@link updateGroundCatcherVisibility} on the app's debounced geometry cadence.
     *
     * NOTE: this gate performs NO GPU allocation, NO dispose, NO shadow-camera mutation,
     * and NO pipeline/ScenePass rebuild — it flips `mesh.visible` only.
     */
    private _hasCasters = false;

    /**
     * §DIAG-GROUND-SHADOW-FIT (L-205) — the host that owns the scene's sole real shadow
     * caster (the Pascal key light), kept ONLY so the read-only diagnostic can dump the
     * live light + shadow-camera state on the first caster. Never mutated here.
     */
    private _keyLightHost: KeyLightHost | null = null;
    /** §DIAG-GROUND-SHADOW-FIT — ensures the one-line diagnostic logs at most once per project. */
    private _diagLogged = false;

    // ── Getters (diagnostics / tests) ────────────────────────────────────────
    get enabled(): boolean { return this._enabled; }
    get sun(): RealSunService { return this._sun; }
    get ground(): GroundShadowCatcher { return this._ground; }
    get groundShadowsEnabled(): boolean { return this._groundShadowsEnabled; }
    /** §L-205 — true while the scene has a shadow caster (so the catcher is shown). */
    get sceneHasCasters(): boolean { return this._hasCasters; }

    /**
     * Bind the service to the live scene + the host that owns the real shadow
     * caster (the Pascal key light), plus the two site/level readers. Must be
     * called once before {@link enable}.
     */
    bind(
        scene: THREE.Scene,
        keyLightHost: KeyLightHost,
        readSiteLatLon: SiteLatLonReader,
        readGroundElevation: GroundElevationReader,
    ): void {
        this._scene = scene;
        this._readSiteLatLon = readSiteLatLon;
        this._readGroundElevation = readGroundElevation;
        this._keyLightHost = keyLightHost; // §DIAG-GROUND-SHADOW-FIT — read-only handle for the diagnostic.
        this._sun.bind(scene);
        // Steer the scene's existing key light instead of adding a parallel light.
        this._sun.bindKeyLightHost(keyLightHost);
    }

    /**
     * Enable the real environment: solve the sun for the current site + time and
     * drive the key light, and mount the ground shadow-catcher at L0. Idempotent.
     */
    enable(): void {
        if (!this._scene) {
            console.warn('[RealEnvironmentService] Not bound — call bind() first.');
            return;
        }
        const site = this._readSiteLatLon();
        // Default to local MIDDAY (matches the panel's 12h default) so the authoring
        // scene is always well-lit — never dark just because it is night in wall-clock
        // time at the site. The user's time-of-day slider overrides this immediately.
        const noon = new Date();
        noon.setUTCHours(12, 0, 0, 0);
        this._sun.enableRealSun(
            site ? { lat: site.lat, lng: site.lon, date: noon } : { date: noon },
        );

        // §FIX-SHADOW-CATCHER-RESTORE (L-112) — attach the ground shadow-catcher NOW,
        // at enable() time, exactly as the original L-11 §FEAT-REAL-ENVIRONMENT did.
        //
        // WHY (regression post-mortem): L-107 deferred the attach until the first
        // shadow caster arrived (via a debounced scene-caster sweep) to hide the
        // empty-project grey rectangle. On the live WebGPU/TSL renderer that
        // late-attach dropped the receiver out of the shadow-sampling set — the plane
        // rendered its base ShadowMaterial (still a grey rectangle) but NO LONGER
        // received the real building shadow. Attaching the receiver up front — before
        // the pipeline compiles its shadow pass — is what made yesterday's real
        // building shadow render beautifully. So the catcher is ALWAYS present (and in
        // the shadow pass) whenever ground shadows are on; it is only shown/hidden via
        // the user toggle (setGroundShadows), never conditionally detached on caster
        // count. (The cosmetic empty-project grey — ShadowMaterial not fully
        // transparent where unlit on WebGPU — is a SEPARATE follow-up that must NOT
        // touch this receive path.)
        // §L-205 caster-visibility gate — ATTACH the receiver up front (keep L-112: in
        // the shadow pass from frame 1 so it receives the real shadow), but leave its
        // VISIBILITY to the caster gate. On a brand-new empty project there are 0 casters
        // → the plane is attached-but-invisible, so there is no cosmetic opaque grey
        // square; the moment the first caster lands (updateGroundCatcherVisibility fires
        // on the geometry event) it becomes visible and composites the real ground shadow.
        this._ground.setElevation(this._readGroundElevation());
        if (this._groundShadowsEnabled) this._ground.attach(this._scene);

        this._enabled = true;
        // Recompute the caster gate for whatever geometry is already present (project
        // switch / reload). A no-op-safe hide on a fresh empty scene.
        this.updateGroundCatcherVisibility();
        console.log(
            '[RealEnvironmentService] §FEAT-REAL-ENVIRONMENT enabled — ' +
            `site=${site ? `${site.lat.toFixed(3)},${site.lon.toFixed(3)}` : 'default'} ` +
            `ground=${this._groundShadowsEnabled ? `on (catcher attached; ${this._hasCasters ? 'visible — receiving real shadow' : 'hidden until first caster'})` : 'off'}.`,
        );
    }

    /** Re-solve the sun after the site location changes (onboarding / relocate). */
    refreshSiteLocation(): void {
        const site = this._readSiteLatLon();
        if (site) this._sun.setLocation(site.lat, site.lon);
    }

    /** Re-place the ground catcher after the active level / levels change. */
    refreshGroundElevation(): void {
        this._ground.setElevation(this._readGroundElevation());
    }

    /**
     * §L-205 caster-visibility gate — apply the catcher's attach + visibility from the
     * current ground-shadow toggle and caster gate.
     *
     * Keeps the receiver ATTACHED whenever ground shadows are on (L-112 — never dropped
     * from the shadow-sampling set), and shows it (`setEnabled(true)` → `mesh.visible`)
     * ONLY when there is a caster (no cosmetic grey on an empty scene). No GPU dispose,
     * no shadow-camera mutation, no graph churn — ADR-0111 safe.
     */
    private _applyCatcher(): void {
        if (!this._scene) return;
        if (this._groundShadowsEnabled) {
            this._ground.setElevation(this._readGroundElevation());
            this._ground.attach(this._scene);
            this._ground.setEnabled(this._hasCasters);
        } else {
            this._ground.setEnabled(false);
        }
    }

    /**
     * §L-205 caster-visibility gate — recompute whether the scene holds any shadow-CASTING
     * geometry and drive the catcher's visibility from it: hidden on an empty scene (no
     * cosmetic grey square), shown + receiving once a caster exists. The receiver stays
     * ATTACHED throughout (L-112 receive preserved); only `mesh.visible` flips.
     *
     * This is a PURE scene-graph sweep + boolean. It performs NO frustum fit, NO light
     * re-home, NO shadow-map / mapSize write, NO pipeline rebuild — the deliberate scope
     * after the §REVERT-SHADOW-TO-KNOWN-GOOD reset. The wider shadow improvements
     * (frustum fit, first-caster rebuild, forced shadow refresh) are re-earned later, one
     * at a time, each verified on prod.
     *
     * Cheap enough to call on a debounced geometry-change; a no-op on an empty scene.
     */
    updateGroundCatcherVisibility(): void {
        if (!this._enabled || !this._scene) return;
        const catcher = this._ground.mesh;
        let hasCaster = false;
        this._scene.traverse((obj) => {
            if (hasCaster) return;
            if (obj === catcher) return;
            const mesh = obj as THREE.Mesh;
            if (!mesh.isMesh) return;
            if (mesh.visible === false) return; // skip hidden far-level (massing) geometry
            const role = (obj.userData?.role as string | undefined) ?? '';
            if (role === 'edges' || role === 'edge-overlay' || role === 'ground-shadow-catcher') return;
            const name = (obj.name ?? '').toLowerCase();
            if (name.includes('edge') || name.includes('grid') ||
                name.includes('collision') || name.includes('helper')) return;
            // A real, shadow-CASTING mesh is what the catcher needs to show a shadow.
            // Pascal flags every element castShadow, so "has caster" == "has real
            // geometry" in practice, but check castShadow explicitly for intent.
            if (mesh.castShadow) hasCaster = true;
        });
        const hadCasters = this._hasCasters;
        this._hasCasters = hasCaster;
        this._applyCatcher();
        // §DIAG-GROUND-SHADOW-FIT (L-205) — one read-only line on the first caster (0→≥1),
        // dumping the live light + shadow-camera + catcher state so the next shadow bug is
        // diagnosed from real numbers, not another hypothesis. Mutates NOTHING.
        if (!hadCasters && hasCaster && !this._diagLogged) {
            this._diagLogged = true;
            this._logGroundShadowDiagnostic();
        }
        // Re-arm the one-shot diagnostic when the scene empties (project switch / clear),
        // so the next project logs its own first-caster numbers.
        if (hadCasters && !hasCaster) this._diagLogged = false;
    }

    /**
     * §DIAG-GROUND-SHADOW-FIT (L-205) — read-only dump of the exact numbers that decide
     * whether the sun→ground shadow reaches the catcher. Logs the key light's world pose,
     * its ortho shadow-camera bounds + near/far, mapSize, castShadow, whether the shadow
     * map is allocated, and the catcher's visible/material/opacity + the scene caster
     * count. Never mutates anything (pure reads); guarded so a null light is a no-op.
     */
    private _logGroundShadowDiagnostic(): void {
        try {
            const key = this._keyLightHost?.keyLight ?? null;
            const cam = key?.shadow?.camera as THREE.OrthographicCamera | undefined;
            const mat = this._ground.mesh.material as THREE.ShadowMaterial | undefined;
            const p = key?.position;
            const t = key?.target?.position;
            let casterCount = 0;
            this._scene?.traverse((o) => { if ((o as THREE.Mesh).isMesh && (o as THREE.Mesh).castShadow) casterCount++; });
            console.log(
                '[RealEnvironmentService] §DIAG-GROUND-SHADOW-FIT — ' +
                `keyLightPos=${p ? `(${p.x.toFixed(1)},${p.y.toFixed(1)},${p.z.toFixed(1)})` : 'none'} ` +
                `target=${t ? `(${t.x.toFixed(1)},${t.y.toFixed(1)},${t.z.toFixed(1)})` : 'none'} ` +
                `shadowCam=${cam ? `[L${cam.left.toFixed(1)} R${cam.right.toFixed(1)} T${cam.top.toFixed(1)} B${cam.bottom.toFixed(1)} n${cam.near.toFixed(1)} f${cam.far.toFixed(1)}]` : 'none'} ` +
                `mapSize=${key?.shadow ? `${key.shadow.mapSize.x}x${key.shadow.mapSize.y}` : 'none'} ` +
                `castShadow=${key?.castShadow ?? 'none'} shadowMapAllocated=${key?.shadow?.map != null} ` +
                `catcher{visible=${this._ground.mesh.visible},mat=${mat?.type ?? 'none'},opacity=${mat?.opacity ?? 'none'}} ` +
                `casters=${casterCount}`,
            );
        } catch { /* diagnostics are advisory — never break the caster gate */ }
    }

    /** True while the catcher mesh is attached to the scene (for diagnostics/tests). */
    isGroundCatcherAttached(scene: THREE.Scene | null = this._scene): boolean {
        return !!scene && scene.children.includes(this._ground.mesh);
    }

    // ── Panel bridge (ViewPropertiesSection → runtime.events → here) ──────────

    /** REAL (ephemeris + offset) vs MANUAL (absolute) sun. */
    setSunMode(mode: SunMode): void { this._sun.setMode(mode); }

    /** Azimuth/elevation offsets + intensity multiplier from the panel sliders. */
    setSunOffsets(o: { azimuthDeg?: number; elevationDeg?: number; intensity?: number }): void {
        this._sun.setOffsets(o);
    }

    /** Time-of-day (decimal hours) the sun is solved for. */
    setSunTime(hours: number): void { this._sun.setTime(hours); }

    /**
     * Toggle the invisible L0 ground shadow-catcher (user control). Reversible with
     * NO GPU dispose (ADR-0111 safe). The receiver is attached up front so it stays in
     * the shadow pass and receives the real building shadow (§FIX-SHADOW-CATCHER-RESTORE,
     * L-112); §L-205 gates only its VISIBILITY on caster presence — enabling with an
     * EMPTY scene must NOT paint a cosmetic grey plane, so it shows only once a caster
     * exists; disabling hides it.
     */
    setGroundShadows(enabled: boolean): void {
        this._groundShadowsEnabled = enabled;
        if (!this._scene) return;
        this._applyCatcher();
    }

    /** Tear down: restore the key light, remove + free the catcher. */
    dispose(): void {
        this._sun.dispose();
        this._ground.dispose();
        this._scene = null;
        this._enabled = false;
    }
}
