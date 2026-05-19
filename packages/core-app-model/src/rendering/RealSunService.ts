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

    /** Fired whenever sun position is updated (e.g. for UI refresh). */
    onPositionChange?: (pos: SunPosition) => void;

    // ── Public getters ─────────────────────────────────────────────────────

    get enabled(): boolean { return this._enabled; }
    get lastPosition(): SunPosition | null { return this._lastPosition; }
    get config(): Readonly<RealSunConfig> { return this._config; }

    // ── Public API ─────────────────────────────────────────────────────────

    /**
     * Binds the service to the live Three.js scene.
     * Must be called once before enable().
     */
    bind(scene: THREE.Scene): void {
        this._scene = scene;
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

        if (!this._sunLight) {
            this._sunLight = this._createSunLight();
            this._scene.add(this._sunLight);
            // DirectionalLight.target must also be added to the scene for the
            // target position to take effect (Three.js requirement).
            this._scene.add(this._sunLight.target);
        }

        this._enabled = true;
        this._updateSunPosition();

        console.log('[RealSunService] Enabled — lat:', this._config.lat,
            'lng:', this._config.lng, 'date:', this._config.date.toISOString());
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
            this._updateSunPosition();
        }
    }

    /**
     * Sets the geographic location and recomputes the sun position.
     */
    setLocation(lat: number, lng: number): void {
        this._config.lat = lat;
        this._config.lng = lng;

        if (this._enabled) {
            this._updateSunPosition();
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
            this._updateSunPosition();
        }
    }

    /**
     * Forces a recomputation of the sun position at the current config.
     * Call when the scene camera has changed and you want shadow frustum refresh.
     */
    update(): void {
        if (this._enabled) {
            this._updateSunPosition();
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

    private _updateSunPosition(): void {
        if (!this._sunLight || !this._scene) return;

        const { lat, lng, date } = this._config;
        const { altitude, azimuth } = computeSolarPosition(lat, lng, date);

        const isAboveHorizon = altitude > 0;

        // Convert azimuth + altitude to Three.js world-space position.
        // Three.js convention: +X = East, +Y = Up, +Z = South (camera default).
        // Azimuth is clockwise from North → sin(az) = East, cos(az) = North = -Z.
        const cosAlt = Math.cos(altitude);
        const dirX   =  cosAlt * Math.sin(azimuth);  // East component
        const dirY   =  Math.sin(altitude);           // Up component
        const dirZ   = -cosAlt * Math.cos(azimuth);  // South (+Z) when az=180°

        // Place the light far enough that the shadow frustum covers the scene.
        this._sunLight.position.set(dirX * 120, dirY * 120, dirZ * 120);
        this._sunLight.target.position.set(0, 0, 0);

        // Update shadow camera when position changes.
        this._sunLight.shadow.camera.updateProjectionMatrix();

        // Color and intensity based on solar elevation.
        const kelvin = elevationToKelvin(altitude);
        const color  = kelvinToColor(kelvin);
        this._sunLight.color.copy(color);

        // Intensity curve: zero below horizon, ramps up with elevation.
        const intensity = isAboveHorizon
            ? Math.min(4.0, 0.5 + 3.5 * Math.sin(altitude))
            : 0;
        this._sunLight.intensity = intensity;

        // Shadow casting only makes sense when the sun is above the horizon.
        this._sunLight.castShadow = isAboveHorizon;

        // Invalidate cached shadow map so it regenerates at new angle.
        if (this._sunLight.shadow.map) {
            this._sunLight.shadow.map.dispose();
            (this._sunLight.shadow as any).map = null;
        }

        this._lastPosition = { altitude, azimuth, isAboveHorizon, color, intensity };
        this.onPositionChange?.(this._lastPosition);

        // Notify RealSunControl (and any other DOM listener) of the update.
        window.dispatchEvent(new CustomEvent('rsc-sun-updated', { // TODO(TASK-12)
            detail: { altitude, azimuth, isAboveHorizon, intensity },
        }));

        const altDeg = (altitude * 180 / Math.PI).toFixed(1);
        const azDeg  = (azimuth  * 180 / Math.PI).toFixed(1);
        console.log(
            `[RealSunService] Position updated — alt: ${altDeg}°  az: ${azDeg}°` +
            `  ${kelvin.toFixed(0)}K  intensity: ${intensity.toFixed(2)}` +
            `  above: ${isAboveHorizon}`,
        );
    }
}
