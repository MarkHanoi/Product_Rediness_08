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

    // ── Getters (diagnostics / tests) ────────────────────────────────────────
    get enabled(): boolean { return this._enabled; }
    get sun(): RealSunService { return this._sun; }
    get ground(): GroundShadowCatcher { return this._ground; }
    get groundShadowsEnabled(): boolean { return this._groundShadowsEnabled; }

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

        this._ground.setElevation(this._readGroundElevation());
        this._ground.setEnabled(this._groundShadowsEnabled);
        if (this._groundShadowsEnabled) this._ground.attach(this._scene);

        this._enabled = true;
        console.log(
            '[RealEnvironmentService] §FEAT-REAL-ENVIRONMENT enabled — ' +
            `site=${site ? `${site.lat.toFixed(3)},${site.lon.toFixed(3)}` : 'default'} ` +
            `ground=${this._groundShadowsEnabled ? 'on' : 'off'}.`,
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
     * Toggle the invisible L0 ground shadow-catcher. Reversible with no GPU
     * dispose (ADR-0111 safe): disabling hides the plane; enabling re-attaches it
     * at the current ground elevation.
     */
    setGroundShadows(enabled: boolean): void {
        this._groundShadowsEnabled = enabled;
        if (!this._scene) return;
        if (enabled) {
            this._ground.setElevation(this._readGroundElevation());
            this._ground.attach(this._scene);
            this._ground.setEnabled(true);
        } else {
            this._ground.setEnabled(false);
        }
    }

    /** Tear down: restore the key light, remove + free the catcher. */
    dispose(): void {
        this._sun.dispose();
        this._ground.dispose();
        this._scene = null;
        this._enabled = false;
    }
}
