// ADR-0074 (P1 L2 core) — THREE-FREE replica of the NOAA solar-position math.
//
// SOURCE OF TRUTH: packages/core-app-model/src/rendering/RealSunService.ts
// `computeSolarPosition` (RealSunService.ts:81–144) and the direction it builds
// for its sun DirectionalLight (RealSunService.ts:376–386). That file imports
// THREE via `@pryzm/renderer-three/three`, so a pure L2 package CANNOT reuse it;
// this is a byte-for-byte replica of the MATH only (no THREE, no light, no UI).
//
// KEEP IN SYNC: if RealSunService.computeSolarPosition changes, mirror it here.
// The functions below are intentionally identical in algorithm + constants so
// the two never diverge. Accuracy: ±0.5° for the current century (NOAA low-error
// approximation), same as the source.

const DEG = Math.PI / 180;

/**
 * Sun altitude + azimuth for a location and instant. Direct replica of
 * RealSunService.computeSolarPosition (RealSunService.ts:81–144).
 *
 * @returns altitude in radians (negative = below horizon) and azimuth in radians
 *   measured CLOCKWISE from North.
 */
export function computeSolarPositionRad(
    lat: number,
    lng: number,
    date: Date,
): { altitude: number; azimuth: number } {
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

/**
 * Unit direction TOWARD the sun in the world ENU frame { x=East, y=Up, z=South },
 * from altitude + azimuth (radians). Direct replica of how RealSunService
 * POSITIONS its DirectionalLight (RealSunService.ts:379–382):
 *   dirX =  cos(alt) · sin(az)   (East)
 *   dirY =  sin(alt)             (Up)
 *   dirZ = −cos(alt) · cos(az)   (South-positive; az=180° ⇒ +Z)
 * The light is placed AT the sun direction (position = dir · 120) with its target
 * at the origin, so this vector points TOWARD the sun — the convention the
 * occlusion + sun-facing tests in this package use.
 *
 * §L-430 PROJECT NORTH (`projectNorthRad` = θ, project→true, clockwise, default 0):
 * when the authoring frame is rotated to project north, the model's scene axes no longer
 * align with true north — so the SUN must be expressed in that same frame or the shadows
 * are silently wrong by θ. This is NOT a violation of "solar stays true north": the
 * invariant is that sun-vs-BUILDING geometry is preserved, and leaving the sun in the true
 * frame while the building rotates is precisely what would BREAK it.
 *
 * Applying the canonical free-vector transform (`trueVectorToProjectNorth`, ADR-0115) to
 * (east, north) = (cosAlt·sin az, cosAlt·cos az) reduces exactly to an azimuth shift:
 *     east' = cosAlt·sin(az − θ) ,  north' = cosAlt·cos(az − θ)
 * so we shift the scalar azimuth rather than importing the L5 transform — `solar-analysis`
 * is L2 and may not import from `apps/editor`. `projectNorthSolarEquivalence.test.ts` pins
 * this scalar form against the real transform so the two can never drift.
 * θ = 0 ⇒ `az − 0` ⇒ byte-identical to before (ADR-0070 byte-identity).
 */
export function sunDirectionFromAltAz(
    altitudeRad: number,
    azimuthRad: number,
    projectNorthRad = 0,
): { x: number; y: number; z: number } {
    const cosAlt = Math.cos(altitudeRad);
    const az = azimuthRad - projectNorthRad;
    return {
        x:  cosAlt * Math.sin(az),
        y:  Math.sin(altitudeRad),
        z: -cosAlt * Math.cos(az),
    };
}

export const RAD_TO_DEG = 180 / Math.PI;
export const DEG_TO_RAD = DEG;
