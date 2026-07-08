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
     * §FIX-WEBGPU-SHADOW-TIER-DESTROY-AND-GREY-CATCHER (L-200) — whether the scene
     * currently holds any shadow-CASTING geometry. The catcher is a `ShadowMaterial`
     * plane that, with NO caster/shadow, reads as "fully shadowed" → an opaque GREY
     * fill on WebGPU (the founder's empty-project grey square). It is updated by
     * {@link refitShadowToScene} on the app's debounced geometry cadence.
     *
     * RECONCILING L-107 + L-112: L-107 removed the grey by DETACHING the receiver
     * when empty, but that late re-attach dropped it out of the WebGPU shadow-sampling
     * set → the real ground shadow disappeared (L-112 reverted it, re-accepting the
     * grey). The correct fix keeps the receiver ATTACHED up front (L-112's receive is
     * preserved — it is in the shadow pass from frame 1) and gates only its VISIBILITY
     * on caster presence (L-107's grey fix): invisible with 0 casters, visible + fully
     * receiving once ≥1 caster exists. Graph membership never changes, so no late
     * pipeline rebind can drop the receiver.
     */
    private _hasCasters = false;

    // ── Getters (diagnostics / tests) ────────────────────────────────────────
    get enabled(): boolean { return this._enabled; }
    get sun(): RealSunService { return this._sun; }
    get ground(): GroundShadowCatcher { return this._ground; }
    get groundShadowsEnabled(): boolean { return this._groundShadowsEnabled; }
    /** §L-200 — true while the scene has a shadow caster (so the catcher is shown). */
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
        // §FIX-WEBGPU-SHADOW-TIER-DESTROY-AND-GREY-CATCHER (L-200) — ATTACH the receiver
        // up front (keep L-112: in the shadow pass from frame 1 so it receives the real
        // shadow), but leave VISIBILITY to the caster gate below. On a brand-new empty
        // project there are 0 casters → the plane is attached-but-invisible, so there is
        // no opaque grey square; the moment the first caster lands (refit fires on the
        // geometry event) it becomes visible and composites the real ground shadow.
        this._ground.setElevation(this._readGroundElevation());
        if (this._groundShadowsEnabled) this._ground.attach(this._scene);

        this._enabled = true;
        // §FIX-GROUND-SHADOW-AT-PERF-TIER — fit the shadow frustum to whatever geometry
        // is already present (project switch / reload) AND recompute the caster gate that
        // drives the catcher's visibility. A no-op-safe hide on a fresh empty scene.
        this.refitShadowToScene();
        console.log(
            '[RealEnvironmentService] §FEAT-REAL-ENVIRONMENT enabled — ' +
            `site=${site ? `${site.lat.toFixed(3)},${site.lon.toFixed(3)}` : 'default'} ` +
            `ground=${this._groundShadowsEnabled ? `on (catcher attached; ${this._hasCasters ? 'visible — receiving real shadow' : 'hidden until first caster'})` : 'off'}.`,
        );
    }

    /**
     * §FIX-WEBGPU-SHADOW-TIER-DESTROY-AND-GREY-CATCHER (L-200) — apply the catcher's
     * attach + visibility from the current ground-shadow toggle and caster gate.
     *
     * Keeps the receiver ATTACHED whenever ground shadows are on (L-112 — never dropped
     * from the shadow-sampling set), and shows it (`setEnabled(true)` → `mesh.visible`)
     * ONLY when there is a caster (L-107 — no grey on an empty scene). No GPU dispose,
     * no graph churn — ADR-0111 safe.
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
     * §FIX-GROUND-SHADOW-AT-PERF-TIER (L-168 / L-140) — re-fit the key light's shadow
     * frustum to the LIVE building bounds so the primary sun→ground shadow reaches the
     * L0 catcher however large/tall the model is and whatever the render tier.
     *
     * WHY (root cause): the Pascal key light — the scene's SOLE real shadow caster,
     * driven as the sun — has a fixed ±50/far-100 shadow camera and orbits at ~17 m.
     * When L-164 made all floors of a generated building render full-detail (~4000
     * meshes → `performance` tier) the building outgrew that frustum AND the light sat
     * inside it, so nothing projected onto the catcher — the "building floats" bug. The
     * key light is NOT suppressed at that scale (it stays a caster below the 8000 ceiling);
     * the shadow was simply out of frame. This computes the model AABB (excluding the
     * catcher + helper/edge/grid meshes and hidden far-level geometry) and hands the sun
     * a centre + radius to enclose. Only the shadow CAMERA changes — never the map size —
     * so it is device-loss safe (no mid-submit ShadowDepthTexture realloc; ADR-0111).
     *
     * Cheap enough to call on a debounced geometry-change; a no-op on an empty scene.
     */
    refitShadowToScene(): void {
        if (!this._enabled || !this._scene) return;
        const catcher = this._ground.mesh;
        const box = new THREE.Box3();
        let any = false;
        let hasCaster = false;
        this._scene.traverse((obj) => {
            if (obj === catcher) return;
            // Meshes + InstancedMeshes (generated buildings render instanced) — the
            // InstancedMesh's own boundingBox covers every instance, so expandByObject
            // grounds the frustum on the whole aggregate.
            if (!(obj as THREE.Mesh).isMesh) return;
            if (obj.visible === false) return; // skip hidden far-level (massing) geometry
            const role = (obj.userData?.role as string | undefined) ?? '';
            if (role === 'edges' || role === 'edge-overlay' || role === 'ground-shadow-catcher') return;
            const name = (obj.name ?? '').toLowerCase();
            if (name.includes('edge') || name.includes('grid') ||
                name.includes('collision') || name.includes('helper')) return;
            box.expandByObject(obj as THREE.Object3D);
            any = true;
            // §L-200 — a real, shadow-CASTING mesh is what the catcher needs to show a
            // shadow. Pascal flags every element castShadow, so "has caster" == "has
            // real geometry" in practice, but check castShadow explicitly for intent.
            if ((obj as THREE.Mesh).castShadow) hasCaster = true;
        });
        // §FIX-WEBGPU-SHADOW-TIER-DESTROY-AND-GREY-CATCHER (L-200) — drive the catcher's
        // visibility from the caster gate: hidden on an empty scene (no grey square),
        // shown + receiving once a caster exists. The receiver stays ATTACHED throughout
        // (L-112 receive preserved); only mesh.visible flips.
        this._hasCasters = hasCaster;
        this._applyCatcher(); // idempotent — sets the initial hidden state on empty too
        if (!any || box.isEmpty()) {
            // No real geometry yet — clear coverage so an emptied scene reverts to the
            // legacy fixed frustum instead of holding a stale (possibly huge) one.
            this._sun.setShadowCoverage(null, 0);
            return;
        }
        const center = box.getCenter(new THREE.Vector3());
        const size   = box.getSize(new THREE.Vector3());
        const radius = 0.5 * Math.hypot(size.x, size.y, size.z);
        if (!Number.isFinite(radius) || radius <= 0) return;
        this._sun.setShadowCoverage(center, radius);
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
     * NO GPU dispose (ADR-0111 safe): enabling attaches the receiver at the current
     * ground elevation; disabling hides it. Presence is NOT gated on caster count —
     * the receiver must be attached up front so it stays in the shadow pass and
     * receives the real building shadow (§FIX-SHADOW-CATCHER-RESTORE, L-112).
     */
    setGroundShadows(enabled: boolean): void {
        this._groundShadowsEnabled = enabled;
        if (!this._scene) return;
        // §FIX-WEBGPU-SHADOW-TIER-DESTROY-AND-GREY-CATCHER (L-200) — enabling attaches the
        // receiver up front (L-112 receive) but shows it ONLY when a caster exists (L-107 —
        // toggling ON with an empty scene must NOT paint a grey plane); disabling hides it.
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
