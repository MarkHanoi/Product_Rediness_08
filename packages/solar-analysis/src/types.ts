// ADR-0074 (P1 L2 core) — public types for @pryzm/solar-analysis.
//
// PURE + THREE-FREE. This package is the algorithmic core of the GPU solar
// sun-hours feature (ADR-0074). It owns NO geometry rendering: it generates a
// deterministic sun-sample set from the NOAA solar-position math and accumulates
// per-surface sun-hours given an INJECTED occlusion oracle. The renderer-three
// GPU shadow-map pass (the deferred next slice) supplies the real `isOccluded`
// oracle and paints the resulting `SunHoursResult` as a heatmap.
//
// ── FRAME + UNITS (kept in lock-step with RealSunService) ───────────────────
// World frame is ENU-style, Y-up, matching how RealSunService builds its sun
// DirectionalLight direction (RealSunService.ts:376–386):
//   +X = East,  +Y = Up,  +Z = South   (North is −Z).
// Azimuth is measured CLOCKWISE from North (N=0°, E=90°, S=180°, W=270°), the
// compass convention RealSunService.computeSolarPosition returns. The sun
// DIRECTION vector points TOWARD the sun (a fragment is "sun-facing" when its
// outward normal has a positive dot with this vector), exactly as the
// DirectionalLight is POSITIONED toward the sun in RealSunService:
//   dir.x =  cos(alt) · sin(az)        (East)
//   dir.y =  sin(alt)                  (Up)
//   dir.z = −cos(alt) · cos(az)        (South-positive; az=180° ⇒ +Z)
// Lengths are metres; angles in this public API are DEGREES unless noted.

/** A 3-D vector in the world ENU frame { x = East, y = Up, z = South }, metres
 *  (or a unit direction when used as a normal / sun direction). */
export interface Vec3 {
    readonly x: number;
    readonly y: number;
    readonly z: number;
}

/**
 * One sampled sun position over the analysis window. `dir` is a UNIT vector
 * pointing TOWARD the sun in the world ENU frame (see header). Only above-horizon
 * samples are emitted by `generateSunSamples` (altitudeDeg > 0).
 */
export interface SunSample {
    /** Unit direction TOWARD the sun in world ENU { x=East, y=Up, z=South }. */
    readonly dir: Vec3;
    /** Sun altitude above the horizon, degrees (> 0 for every emitted sample). */
    readonly altitudeDeg: number;
    /** Sun azimuth, degrees CLOCKWISE from North (N=0, E=90, S=180, W=270). */
    readonly azimuthDeg: number;
    /** Minutes past UTC midnight of this sample's instant (0..1439). */
    readonly timeMinutes: number;
    /** Day-of-year of this sample (1..366, UTC). */
    readonly dayOfYear: number;
}

/**
 * A surface to accumulate sun-hours onto. `normal` is the OUTWARD unit normal in
 * the world ENU frame; `samplePoints` are the texel / surface-sample world
 * positions tested for occlusion (the GPU pass's per-fragment points). A sample
 * point need not be coplanar-exact — the oracle decides occlusion per point.
 */
export interface SolarSurface {
    readonly id: string;
    /** Outward unit normal in world ENU { x=East, y=Up, z=South }. */
    readonly normal: Vec3;
    /** World-space sample points on the surface (metres). ≥ 1. */
    readonly samplePoints: ReadonlyArray<Vec3>;
}

/**
 * Injected occlusion oracle. Returns `true` when the ray from `point` toward the
 * sun (`sunDir`, unit, toward the sun) is BLOCKED by other geometry. In this pure
 * package every test injects a deterministic mock; the renderer-three GPU pass
 * provides the real shadow-map-backed implementation in the deferred slice.
 */
export type IsOccluded = (point: Vec3, sunDir: Vec3) => boolean;

/** Per-surface sun-hours accumulation result. */
export interface SurfaceSunHours {
    readonly surfaceId: string;
    /** Mean direct-beam sun-hours across this surface's sample points. */
    readonly sunHours: number;
    /** Min / max sun-hours across this surface's individual sample points. */
    readonly minPointSunHours: number;
    readonly maxPointSunHours: number;
    /** Number of sample points on this surface. */
    readonly samplePointCount: number;
}

/** Building-level sun-hours summary from `accumulateSunHours`. */
export interface SunHoursResult {
    /** Per-surface results, input order preserved. */
    readonly surfaces: ReadonlyArray<SurfaceSunHours>;
    /** Hours represented by ONE sun sample (stepMinutes / 60) — the Δt slice. */
    readonly stepHours: number;
    /** Count of above-horizon sun samples integrated over. */
    readonly sampleCount: number;
    /** AVG / MAX / MIN of per-surface `sunHours` across all surfaces (the
     *  ThatOpen-style readout). Zero / surfaceId undefined when no surfaces. */
    readonly avgSunHours: number;
    readonly maxSunHours: number;
    readonly minSunHours: number;
    readonly maxSurfaceId?: string;
    readonly minSurfaceId?: string;
}

/** Options for `generateSunSamples`. Provide EITHER `dayOfYear` (single day) or
 *  `dateRange` (inclusive day span). Every field has a deterministic default. */
export interface SunSampleOptions {
    /** Site latitude, decimal degrees (negative = south). */
    readonly latDeg: number;
    /** Site longitude, decimal degrees (negative = west). */
    readonly lngDeg: number;
    /** Single analysis day-of-year (1..366, UTC). Mutually exclusive w/ dateRange. */
    readonly dayOfYear?: number;
    /** Inclusive day-of-year span (UTC) sampled at `dayStep` cadence. */
    readonly dateRange?: { readonly fromDayOfYear: number; readonly toDayOfYear: number; readonly dayStep?: number };
    /** Reference UTC year for the solar-position math (leap-year handling).
     *  Default 2025. The sun path is nearly year-independent; this only fixes the
     *  calendar so results are reproducible. */
    readonly year?: number;
    /** Minutes between time samples within a day. Default 15. */
    readonly stepMinutes?: number;
    /** When true (default), below-horizon samples (altitudeDeg ≤ 0) are dropped. */
    readonly daylightOnly?: boolean;
}
