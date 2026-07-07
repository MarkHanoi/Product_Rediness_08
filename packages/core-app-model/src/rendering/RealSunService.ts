/**
 * @file src/core/rendering/RealSunService.ts
 * @description Physically-accurate real-sun lighting service for the PRYZM
 *   authoring viewport and render pipeline.
 *
 * CONTRACT (01-BIM-ENGINE-CORE-CONTRACT §4.3, §5):
 *  - NEVER mutates any ElementStore or semantic state.
 *  - Operates exclusively on the Three.js projection layer:
 *    adds / removes a single THREE.DirectionalLight from the scene.
 *  - Does NOT import @thatopen/* packages.
 *
 * CONTRACT (05-BIM-UI-ARCHITECTURE-CONTRACT §1):
 *  - No UI is created here. UI lives in src/ui/rendering/RealSunControl.ts.
 *
 * Algorithm:
 *  Solar position from latitude, longitude, and date/time using the NOAA
 *  standard equations (low-error approximation, accurate to ±0.5° for the
 *  current century).  No external library dependency.
 *
 * Integration:
 *  - Registered and orchestrated by RenderingPipelineCoordinator.
 *  - Shadow settings are delegated to ShadowQualityUpgrader (which traverses
 *    the scene and upgrades every shadow-casting light it finds, including the
 *    sun light added here).
 *  - ViewportPathTracer reads scene lights automatically — no extra wiring needed.
 *
 * Performance:
 *  Sun direction is recomputed only when time or location changes (not per-frame).
 */

import * as THREE from '@pryzm/renderer-three/three';

// ── Public types ────────────────────────────────────────────────────────────

export interface RealSunConfig {
    /** Geographic latitude in decimal degrees (negative = south). */
    lat:  number;
    /** Geographic longitude in decimal degrees (negative = west). */
    lng:  number;
    /** Date and time for which to compute the sun position. */
    date: Date;
}

export interface SunPosition {
    /** Sun altitude above the horizon in radians (negative = below horizon). */
    altitude: number;
    /** Sun azimuth measured clockwise from North in radians. */
    azimuth: number;
    /** True when the sun is above the horizon. */
    isAboveHorizon: boolean;
    /** Light color at this solar elevation. */
    color: THREE.Color;
    /** Light intensity (0 when below horizon). */
    intensity: number;
}

/**
 * §FEAT-REAL-ENVIRONMENT-SUN (ADR-0106) — how the panel sliders relate to the sun.
 *
 *  - 'real+offset' : direction/intensity come from the REAL solar position at the
 *                    site + time; the panel Azimuth/Elevation are ADDED as offsets
 *                    (degrees) and Intensity is a MULTIPLIER.
 *  - 'manual'      : the panel Azimuth/Elevation/Intensity are ABSOLUTE (the legacy
 *                    behaviour). No ephemeris — a fixed studio key.
 */
export type SunMode = 'real+offset' | 'manual';

/**
 * The seam RealSunService uses to drive the scene's REAL shadow caster (the
 * Pascal key light) instead of adding a parallel light. Implemented by
 * PascalSceneLighting (exposes `keyLight`). Kept as an interface so the service
 * has no hard dependency on the lighting class and stays unit-testable with a
 * plain fake.
 */
export interface KeyLightHost {
    /** The scene's sole real directional shadow caster, or null before apply(). */
    readonly keyLight: THREE.DirectionalLight | null;
}

// ── Constants ───────────────────────────────────────────────────────────────

/** Default location: Madrid, Spain — used when no config is supplied. */
const DEFAULT_CONFIG: RealSunConfig = {
    lat:  40.4168,
    lng:  -3.7038,
    date: new Date(),
};

/** Name tag placed on the managed DirectionalLight for identification. */
const SUN_LIGHT_NAME = '__pryzm_real_sun_light__';

/** Shadow map resolution for the sun light (matches ShadowQualityUpgrader high level). */
const SUN_SHADOW_MAP_SIZE = 2048;

// ── Solar position algorithm ─────────────────────────────────────────────────

/**
 * Computes the sun's altitude and azimuth for a given location and time.
 * Based on NOAA solar equations (low-error approximation).
 *
 * @returns altitude in radians (negative = below horizon) and azimuth in
 *   radians measured clockwise from North.
 */
function computeSolarPosition(
    lat:  number,
    lng:  number,
    date: Date,
): { altitude: number; azimuth: number } {
    const DEG = Math.PI / 180;

    // Julian date
    const JD = date.getTime() / 86_400_000 + 2_440_587.5;
    // Days since J2000.0
    const n = JD - 2_451_545.0;

    // Mean longitude and mean anomaly (degrees, then normalised)
    const L = ((280.46 + 0.9856474 * n) % 360 + 360) % 360;
    const g = ((357.528 + 0.9856003 * n) % 360 + 360) % 360;
    const gRad = g * DEG;

    // Ecliptic longitude (degrees)
    const lambda = L + 1.915 * Math.sin(gRad) + 0.020 * Math.sin(2 * gRad);
    const lambdaRad = lambda * DEG;

    // Obliquity of the ecliptic (degrees)
    const epsilon = 23.439 - 0.0000004 * n;
    const epsilonRad = epsilon * DEG;

    // Declination (radians)
    const sinDec = Math.sin(epsilonRad) * Math.sin(lambdaRad);
    const dec = Math.asin(Math.max(-1, Math.min(1, sinDec)));

    // Right ascension (hours)
    const cosL = Math.cos(lambdaRad);
    let RA = Math.atan2(Math.cos(epsilonRad) * Math.sin(lambdaRad), cosL) / DEG / 15;
    RA = (RA + 24) % 24;

    // Greenwich Mean Sidereal Time (hours)
    const UT = date.getUTCHours()
             + date.getUTCMinutes()   / 60
             + date.getUTCSeconds()   / 3_600
             + date.getUTCMilliseconds() / 3_600_000;
    const GMST = (6.697375 + 0.0657098242 * n + UT + 24) % 24;

    // Local Mean Sidereal Time (hours)
    const LMST = (GMST + lng / 15 + 240) % 24;

    // Hour angle (radians, positive west)
    const H = (LMST - RA) * 15 * DEG;

    // Altitude (radians)
    const latRad = lat * DEG;
    const sinAlt = Math.sin(latRad) * Math.sin(dec)
                 + Math.cos(latRad) * Math.cos(dec) * Math.cos(H);
    const altitude = Math.asin(Math.max(-1, Math.min(1, sinAlt)));

    // Azimuth (radians, clockwise from North)
    const cosAlt = Math.cos(altitude);
    const cosAz  = cosAlt > 1e-9
        ? (Math.sin(dec) - Math.sin(altitude) * Math.sin(latRad))
          / (cosAlt * Math.cos(latRad))
        : 0;
    let azimuth = Math.acos(Math.max(-1, Math.min(1, cosAz)));
    if (Math.sin(H) > 0) azimuth = 2 * Math.PI - azimuth;

    return { altitude, azimuth };
}

// ── Light color from elevation ───────────────────────────────────────────────

/**
 * Maps sun elevation in radians to a correlated colour temperature in Kelvin.
 *
 * Elevation →  Kelvin range
 *  < 0°     →  2000 K  (below horizon / twilight glow)
 *  0°–10°   →  2000 – 3500 K  (sunrise / sunset orange)
 *  10°–30°  →  3500 – 5500 K  (morning / afternoon)
 *  30°+     →  5500 – 6500 K  (midday white)
 */
function elevationToKelvin(altitudeRad: number): number {
    const deg = altitudeRad * (180 / Math.PI);
    if (deg < 0)   return 2_000;
    if (deg < 10)  return 2_000 + (deg / 10) * 1_500;
    if (deg < 30)  return 3_500 + ((deg - 10) / 20) * 2_000;
    return Math.min(6_500, 5_500 + ((deg - 30) / 60) * 1_000);
}

/**
 * Converts a colour temperature in Kelvin to a THREE.Color.
 * Uses Tanner Helland's fast approximation (±2% error across 1000–40000 K).
 */
function kelvinToColor(kelvin: number): THREE.Color {
    kelvin = Math.max(1_000, Math.min(40_000, kelvin)) / 100;

    let r: number, g: number, b: number;

    if (kelvin <= 66) {
        r = 255;
        g = kelvin <= 19
            ? 0
            : Math.min(255, 99.4708025861 * Math.log(kelvin - 10) - 161.1195681661);
        b = kelvin >= 66
            ? 255
            : kelvin <= 19
                ? 0
                : Math.min(255, 138.5177312231 * Math.log(kelvin - 10) - 305.0447927307);
    } else {
        r = Math.min(255, Math.max(0, 329.698727446 * Math.pow(kelvin - 60, -0.1332047592)));
        g = Math.min(255, Math.max(0, 288.1221695283 * Math.pow(kelvin - 60, -0.0755148492)));
        b = 255;
    }

    return new THREE.Color(r / 255, g / 255, b / 255);
}

// ── Main class ───────────────────────────────────────────────────────────────

export class RealSunService {
    private _scene:    THREE.Scene | null          = null;
    private _sunLight: THREE.DirectionalLight | null = null;
    private _enabled   = false;
    private _config:   RealSunConfig               = { ...DEFAULT_CONFIG };

    /** Last computed sun position (exposed for UI readback). */
    private _lastPosition: SunPosition | null = null;

    /**
     * §FEAT-REAL-ENVIRONMENT-SUN (ADR-0106) — the host that owns the scene's real
     * shadow caster (Pascal key light). When set, the solve steers THAT light
     * rather than the service's own parallel DirectionalLight, so the scene keeps
     * exactly one shadow caster.
     */
    private _keyLightHost: KeyLightHost | null = null;

    /**
     * Snapshot of the Pascal key light's ORIGINAL position/colour/intensity, taken
     * the first time we drive it, so disableRealSun() can restore the studio key
     * exactly. Only used on the key-light-host path.
     */
    private _keyLightOriginal: { pos: THREE.Vector3; color: THREE.Color; intensity: number } | null = null;

    /** Sun mode + panel offsets/multipliers. */
    private _mode:            SunMode = 'real+offset';
    private _azimuthOffDeg    = 0;   // real+offset: added to real az; manual: absolute az
    private _elevationOffDeg  = 0;   // real+offset: added to real el; manual: absolute el
    private _intensityMul     = 1;   // real+offset: ×real; manual: absolute (0–2)

    /**
     * §FIX-GROUND-SHADOW-AT-PERF-TIER (L-168 / L-140) — the world-space building
     * bounds the key light's shadow frustum must ENCLOSE so the primary sun→ground
     * shadow (building → GroundShadowCatcher, the L-11 §FEAT-REAL-ENVIRONMENT feature)
     * survives however big/tall the building is and whatever the render tier.
     *
     * The Pascal key light ships with a FIXED shadow camera (ortho ±50, near 1,
     * far 100) and orbits at its initial distance (~17 m). That is fine for a small
     * hand-drawn scene, but once a generated building renders full-detail (L-164:
     * all floors → ~4000 meshes → `performance` tier) the building's footprint/height
     * exceed the ±50/far-100 frustum AND the light at ~17 m sits INSIDE the building —
     * so nothing projects a clean shadow onto the L0 catcher and the building "floats".
     *
     * When set (via {@link setShadowCoverage}) and we are driving the key light, the
     * solve re-homes the light OUTSIDE the building along the sun direction and sizes
     * the ortho frustum + near/far to bracket the whole model. Null ⇒ legacy fixed
     * frustum (unchanged small-scene behaviour). Only the shadow CAMERA (bounds +
     * position) changes — never `shadow.mapSize` — so no ShadowDepthTexture realloc
     * occurs (respects §SHADOW-DEVICE-LOSS-FIX / ADR-0111: no mid-submit GPU dispose).
     */
    private _shadowCenter: THREE.Vector3 | null = null;
    private _shadowRadius  = 0;
    /**
     * The key light's ORIGINAL (fixed) shadow-camera frustum, snapshotted the first
     * time coverage widens it, so clearing coverage restores the legacy ±50 frustum
     * exactly (no hardcoded assumptions about PascalSceneLighting's defaults).
     */
    private _shadowCamSaved:
        | { left: number; right: number; top: number; bottom: number; near: number; far: number }
        | null = null;

    /** Fired whenever sun position is updated (e.g. for UI refresh). */
    onPositionChange?: (pos: SunPosition) => void;

    // ── Public getters ─────────────────────────────────────────────────────

    get enabled(): boolean { return this._enabled; }
    get lastPosition(): SunPosition | null { return this._lastPosition; }
    get config(): Readonly<RealSunConfig> { return this._config; }
    get mode(): SunMode { return this._mode; }

    // ── Public API ─────────────────────────────────────────────────────────

    /**
     * Binds the service to the live Three.js scene.
     * Must be called once before enable().
     */
    bind(scene: THREE.Scene): void {
        this._scene = scene;
    }

    /**
     * §FEAT-REAL-ENVIRONMENT-SUN (ADR-0106) — bind the host that owns the scene's
     * REAL shadow caster (the Pascal key light). Once bound, the real-sun solve
     * drives THAT light's direction / colour / intensity instead of adding a
     * parallel DirectionalLight — one shadow caster, one §PERF-HEAVY-SHADOW-OFF
     * lever. Safe to (re)call; re-drives immediately if enabled.
     */
    bindKeyLightHost(host: KeyLightHost | null): void {
        this._keyLightHost = host;
        if (this._enabled) this._drive();
    }

    /**
     * Set the sun MODE (real+offset vs manual) and re-drive the light.
     * 'real+offset' (default) = ephemeris sun + panel offsets; 'manual' = the
     * panel Azimuth/Elevation/Intensity are absolute (legacy studio key).
     */
    setMode(mode: SunMode): void {
        if (mode === this._mode) return;
        this._mode = mode;
        if (this._enabled) this._drive();
    }

    /**
     * Panel sliders → offsets/multipliers. In real+offset these are added to /
     * multiplied onto the real value; in manual they are the absolute values.
     * Any argument may be omitted to leave that channel unchanged.
     */
    setOffsets(next: { azimuthDeg?: number; elevationDeg?: number; intensity?: number }): void {
        if (next.azimuthDeg   !== undefined) this._azimuthOffDeg   = next.azimuthDeg;
        if (next.elevationDeg !== undefined) this._elevationOffDeg = next.elevationDeg;
        if (next.intensity    !== undefined) this._intensityMul    = next.intensity;
        if (this._enabled) this._drive();
    }

    /**
     * §FIX-GROUND-SHADOW-AT-PERF-TIER (L-168 / L-140) — tell the sun the world-space
     * building bounds its shadow frustum must ENCLOSE, so the primary sun→ground
     * shadow survives at any building size/tier.
     *
     * `center` / `radius` come from the live scene AABB (see
     * RealEnvironmentService.refitShadowToScene). Pass `center=null` to clear coverage
     * and fall back to the legacy fixed ±50 frustum. Re-drives immediately when
     * enabled so the frustum tracks the building as it grows. Cheap + fully reversible;
     * touches only the shadow CAMERA (bounds + light position), never `shadow.mapSize`,
     * so it can NOT churn the ShadowDepthTexture / lose the WebGPU device.
     */
    setShadowCoverage(center: THREE.Vector3 | null, radius: number): void {
        if (center && Number.isFinite(radius) && radius > 0) {
            (this._shadowCenter ??= new THREE.Vector3()).copy(center);
            this._shadowRadius = radius;
        } else {
            this._shadowCenter = null;
            this._shadowRadius = 0;
        }
        if (this._enabled) this._drive();
    }

    /**
     * Enables the real sun light in the scene.
     *
     * Adds a dedicated DirectionalLight (name: '__pryzm_real_sun_light__')
     * positioned at the computed solar direction.
     * Shadow map is set up immediately; ShadowQualityUpgrader will upgrade
     * the map resolution further when its next apply() cycle runs.
     *
     * @param config - Location and time for solar computation.
     *   Defaults to Madrid at the current time when omitted.
     */
    enableRealSun(config?: Partial<RealSunConfig>): void {
        if (!this._scene) {
            console.warn('[RealSunService] Not bound to scene — call bind() first.');
            return;
        }

        if (config) {
            this._config = { ...this._config, ...config };
        }
        this._config.date = config?.date ?? new Date();

        // §FEAT-REAL-ENVIRONMENT-SUN (ADR-0106) — when a key-light host is bound we
        // DRIVE the scene's existing shadow caster (the Pascal key light) and add NO
        // parallel light (avoids double-lighting + preserves the single §PERF-HEAVY-
        // SHADOW-OFF lever). Only create the standalone sun light on the legacy path
        // where no host is present.
        if (!this._keyLightHost?.keyLight && !this._sunLight) {
            this._sunLight = this._createSunLight();
            this._scene.add(this._sunLight);
            // DirectionalLight.target must also be added to the scene for the
            // target position to take effect (Three.js requirement).
            this._scene.add(this._sunLight.target);
        }

        this._enabled = true;
        this._drive();

        console.log('[RealSunService] Enabled — lat:', this._config.lat,
            'lng:', this._config.lng, 'date:', this._config.date.toISOString(),
            'mode:', this._mode,
            this._keyLightHost?.keyLight ? '(driving Pascal key light)' : '(own sun light)');
    }

    /**
     * Disables the real sun and removes the managed DirectionalLight from the scene.
     * All other scene lighting is left completely untouched.
     */
    disableRealSun(): void {
        if (!this._enabled) return;

        if (this._sunLight && this._scene) {
            this._scene.remove(this._sunLight.target);
            this._scene.remove(this._sunLight);
            this._sunLight.dispose();
            this._sunLight = null;
        }

        // Restore the Pascal key light to its studio default if we were driving it.
        const key = this._keyLightHost?.keyLight;
        if (key && this._keyLightOriginal) {
            key.position.copy(this._keyLightOriginal.pos);
            key.color.copy(this._keyLightOriginal.color);
            key.intensity = this._keyLightOriginal.intensity;
            if (key.target) key.target.position.set(0, 0, 0);
            if (key.shadow) key.shadow.camera.updateProjectionMatrix();
        }
        this._keyLightOriginal = null;

        this._enabled = false;
        this._lastPosition = null;
        console.log('[RealSunService] Disabled.');
    }

    /**
     * Sets the time of day and recomputes the sun position.
     * The date (year/month/day) is preserved; only the time component is changed.
     *
     * @param hours - Decimal hours (0–24), e.g. 13.5 = 13:30.
     */
    setTime(hours: number): void {
        const d = new Date(this._config.date);
        const h = Math.floor(hours);
        const m = Math.round((hours - h) * 60);
        d.setUTCHours(h, m, 0, 0);
        this._config.date = d;

        if (this._enabled) {
            this._drive();
        }
    }

    /**
     * Sets the geographic location and recomputes the sun position.
     */
    setLocation(lat: number, lng: number): void {
        this._config.lat = lat;
        this._config.lng = lng;

        if (this._enabled) {
            this._drive();
        }
    }

    /**
     * Sets the date (preserving the current time-of-day setting).
     */
    setDate(date: Date): void {
        const prev = this._config.date;
        const next = new Date(date);
        next.setUTCHours(prev.getUTCHours(), prev.getUTCMinutes(), 0, 0);
        this._config.date = next;

        if (this._enabled) {
            this._drive();
        }
    }

    /**
     * Forces a recomputation of the sun position at the current config.
     * Call when the scene camera has changed and you want shadow frustum refresh.
     */
    update(): void {
        if (this._enabled) {
            this._drive();
        }
    }

    dispose(): void {
        this.disableRealSun();
        this._scene = null;
    }

    // ── Private ────────────────────────────────────────────────────────────

    private _createSunLight(): THREE.DirectionalLight {
        const light = new THREE.DirectionalLight(0xffffff, 3.0);
        light.name = SUN_LIGHT_NAME;
        light.castShadow = true;

        // Shadow camera frustum — large enough for a full building floor plate.
        light.shadow.camera.near    =   1;
        light.shadow.camera.far     = 500;
        light.shadow.camera.left    = -80;
        light.shadow.camera.right   =  80;
        light.shadow.camera.top     =  80;
        light.shadow.camera.bottom  = -80;

        // Shadow quality — ShadowQualityUpgrader will override these when
        // it runs its next upgrade cycle; these are safe initial values.
        light.shadow.mapSize.set(SUN_SHADOW_MAP_SIZE, SUN_SHADOW_MAP_SIZE);
        light.shadow.bias       = -0.00005;
        light.shadow.normalBias = 0.03;
        if ('radius' in light.shadow) {
            (light.shadow as any).radius = 4;
        }

        // Target stays at origin (scene centre) by default.
        light.target.position.set(0, 0, 0);

        return light;
    }

    /**
     * §FEAT-REAL-ENVIRONMENT-SUN (ADR-0106) — solve the EFFECTIVE sun (mode-aware)
     * and drive the target light. Prefers the Pascal key light (the scene's real
     * shadow caster) when a host is bound; otherwise falls back to the service's
     * own DirectionalLight so the legacy standalone path still works.
     *
     * Effective angles:
     *   real+offset : real (az,el) from NOAA solve + panel offsets (deg).
     *   manual      : the panel az/el are absolute (no ephemeris).
     * Effective intensity:
     *   real+offset : real elevation-curve intensity × panel multiplier.
     *   manual      : panel multiplier scaled to the 0–8 light range.
     */
    private _drive(): void {
        const target = this._keyLightHost?.keyLight ?? this._sunLight;
        if (!target) return;

        // Snapshot the key light's studio defaults on first drive so disable() can
        // restore them (own light is disposed entirely, so it needs no snapshot).
        const drivingKeyLight = target !== this._sunLight;
        if (drivingKeyLight && !this._keyLightOriginal) {
            this._keyLightOriginal = {
                pos:       target.position.clone(),
                color:     target.color.clone(),
                intensity: target.intensity,
            };
        }

        const { lat, lng, date } = this._config;

        // 1. Real solar position (same NOAA basis as Forma/Cesium/solar-analysis).
        const real = computeSolarPosition(lat, lng, date);

        // 2. Resolve the EFFECTIVE altitude / azimuth per mode.
        let altitude: number;
        let azimuth:  number;
        if (this._mode === 'manual') {
            azimuth  = this._azimuthOffDeg   * (Math.PI / 180);
            altitude = this._elevationOffDeg * (Math.PI / 180);
        } else {
            azimuth  = real.azimuth  + this._azimuthOffDeg   * (Math.PI / 180);
            altitude = real.altitude + this._elevationOffDeg * (Math.PI / 180);
        }
        const isAboveHorizon = altitude > 0;

        // 3. Direction → Three.js world position (+X East, +Y Up, +Z South).
        //    Azimuth clockwise from North → sin(az)=East, -cos(az)=+Z(South).
        const cosAlt = Math.cos(altitude);
        const dirX   =  cosAlt * Math.sin(azimuth);
        // Keep the light just above ground so a low / below-horizon sun still lights
        // the model from a grazing angle instead of flipping under the floor.
        const dirY   =  Math.max(0.02, Math.sin(altitude));
        const dirZ   = -cosAlt * Math.cos(azimuth);

        // §FIX-GROUND-SHADOW-AT-PERF-TIER (L-168 / L-140) — when a scene-bounds coverage
        // is set AND we are driving the key light, re-home the light OUTSIDE the building
        // along the sun direction and FIT its ortho shadow frustum to the whole model so
        // the primary sun→ground shadow reaches the L0 catcher however tall/wide the
        // building is. Otherwise keep the legacy fixed behaviour (small-scene, unchanged):
        // preserve the light's existing distance (Pascal key light |pos|≈17; own light 120).
        if (drivingKeyLight && this._shadowCenter) {
            const c = this._shadowCenter;
            const r = Math.max(this._shadowRadius, 2);
            // Normalise the solar direction so the coverage distance is exact.
            const dLen = Math.hypot(dirX, dirY, dirZ) || 1;
            const nx = dirX / dLen, ny = dirY / dLen, nz = dirZ / dLen;
            // Sit the light ~3× the model radius out along the sun ray — comfortably
            // clear of the building so the whole model is in front of the shadow camera.
            const dist = r * 3;
            target.position.set(c.x + nx * dist, c.y + ny * dist, c.z + nz * dist);
            if (target.target) {
                target.target.position.copy(c);
                // The key light's target is NOT parented to the scene, so scene-graph
                // traversal never refreshes its world matrix — update it explicitly or
                // THREE's shadow camera would keep aiming at the stale (origin) target.
                target.target.updateMatrixWorld();
            }
            const cam = target.shadow?.camera as THREE.OrthographicCamera | undefined;
            if (cam) {
                // Snapshot the fixed frustum once so clearing coverage can restore it.
                this._shadowCamSaved ??= {
                    left: cam.left, right: cam.right, top: cam.top,
                    bottom: cam.bottom, near: cam.near, far: cam.far,
                };
                // Ortho half-extent with headroom for shadows cast a little past the
                // footprint; near/far bracket the model along the light's view axis.
                const half = r * 1.35;
                cam.left   = -half;
                cam.right  =  half;
                cam.top    =  half;
                cam.bottom = -half;
                cam.near   = Math.max(0.5, dist - r * 2);
                cam.far    = dist + r * 2;
                cam.updateProjectionMatrix();
            }
        } else {
            const dist = target.position.length() || 120;
            target.position.set(dirX * dist, dirY * dist, dirZ * dist);
            if (target.target) target.target.position.set(0, 0, 0);
            // Coverage was cleared — restore the light's original fixed shadow frustum
            // (only mutates the shadow camera; no mapSize realloc — ADR-0111 safe).
            const cam = drivingKeyLight ? (target.shadow?.camera as THREE.OrthographicCamera | undefined) : undefined;
            if (cam && this._shadowCamSaved) {
                const s = this._shadowCamSaved;
                cam.left = s.left; cam.right = s.right; cam.top = s.top;
                cam.bottom = s.bottom; cam.near = s.near; cam.far = s.far;
                cam.updateProjectionMatrix();
                this._shadowCamSaved = null;
            }
        }

        // 4. Colour — warm when low, white at noon (Forma-like). Uses the REAL
        //    elevation in real+offset so the warmth tracks true time-of-day.
        const kelvin = elevationToKelvin(this._mode === 'manual' ? altitude : real.altitude);
        const color  = kelvinToColor(kelvin);
        target.color.copy(color);

        // 5. Intensity.
        let intensity: number;
        if (this._mode === 'manual') {
            // Panel value is the absolute 0–2 UI scale → 0–8 light range (×4 like initUI).
            intensity = Math.max(0, this._intensityMul) * 4;
        } else {
            const base = isAboveHorizon ? Math.min(4.0, 0.5 + 3.5 * Math.sin(altitude)) : 0;
            intensity = base * Math.max(0, this._intensityMul);
        }
        target.intensity = intensity;

        // 6. Shadow map handling.
        //    Own light: we OWN its shadow config → toggle castShadow with the sun
        //    and defer-dispose the stale map (§SHADOW-DISPOSE-DEFER).
        //    Pascal key light: PascalSceneLighting + §PERF-HEAVY-SHADOW-OFF own its
        //    castShadow gate — we NEVER touch it here (moving the light is enough;
        //    THREE regenerates the shadow map on its own schedule, respecting
        //    ADR-0111 / §SHADOW-DEVICE-LOSS-FIX: no synchronous GPU dispose).
        if (!drivingKeyLight && this._sunLight) {
            this._sunLight.castShadow = isAboveHorizon;
            if (this._sunLight.shadow) {
                this._sunLight.shadow.camera.updateProjectionMatrix();
                if (this._sunLight.shadow.map) {
                    const _oldMap = this._sunLight.shadow.map;
                    (this._sunLight.shadow as any).map = null;
                    setTimeout(() => { try { _oldMap.dispose(); } catch { /* already gone */ } }, 0);
                }
            }
        }

        this._lastPosition = { altitude, azimuth, isAboveHorizon, color, intensity };
        this.onPositionChange?.(this._lastPosition);

        // Notify RealSunControl / VisualizationEnginePanel (DOM readout listeners).
        // Guarded — the service is also exercised under node (tests) with no window.
        if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('rsc-sun-updated', { // TODO(TASK-12)
                detail: { altitude, azimuth, isAboveHorizon, intensity, mode: this._mode },
            }));
        }

        const altDeg = (altitude * 180 / Math.PI).toFixed(1);
        const azDeg  = (azimuth  * 180 / Math.PI).toFixed(1);
        console.log(
            `[RealSunService] ${this._mode} — alt: ${altDeg}°  az: ${azDeg}°` +
            `  ${kelvin.toFixed(0)}K  intensity: ${intensity.toFixed(2)}` +
            `  above: ${isAboveHorizon}  ${drivingKeyLight ? '(key light)' : '(own light)'}`,
        );
    }
}
