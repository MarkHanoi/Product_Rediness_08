// A.10.c (Phase A · Sprint 2) — Solar-position calculator (NOAA algorithm).
//
// Pure deterministic computation per [C21 §1.3]: `solarSample(lat, lon,
// utcIso)` → SolarSample. No I/O. The algorithm follows the NOAA solar
// calculator equations (https://gml.noaa.gov/grad/solcalc/), accurate
// to better than 0.01° from years 1800–2200.
//
// Why we implement fresh rather than extract from RealSunService.ts
// (`packages/core-app-model/src/rendering/RealSunService.ts`):
//   - keeps the new package independent + L2-pure (no rendering deps)
//   - lets us cite + verify against the NOAA reference in isolation
//   - a later slice can replace RealSunService internals with calls
//     into this pure helper (single source of truth per C21 §1.3)

import type { SolarSample } from '@pryzm/schemas';

const DEG_PER_RAD = 180 / Math.PI;
const RAD_PER_DEG = Math.PI / 180;
const SOLAR_CONSTANT_WM2 = 1361;        // NASA TSI ≈ 1361 W/m² at TOA

/**
 * Compute the solar sample at a given site + UTC instant.
 *
 * NOAA convention:
 *   - Solar altitude (elevation) = angle above the horizon, RADIANS.
 *     Negative when the sun is below the horizon (night).
 *   - Solar azimuth = clockwise from N, in RADIANS [0, 2π).
 *
 * Returns a schema-validated SolarSample. The `approxDirectWm2` value
 * is a closed-form estimate from altitude alone (no cloud / aerosol
 * model) — useful as a baseline for shading studies when no measured
 * DNI is available.
 */
export function solarSample(
    lat: number,
    lon: number,
    utcIso: string,
): SolarSample {
    if (!Number.isFinite(lat) || lat < -90 || lat > 90) {
        throw new RangeError(`solarSample: lat must be in [-90, 90]; got ${lat}`);
    }
    if (!Number.isFinite(lon) || lon < -180 || lon > 180) {
        throw new RangeError(`solarSample: lon must be in [-180, 180]; got ${lon}`);
    }

    const date = new Date(utcIso);
    if (!Number.isFinite(date.getTime())) {
        throw new RangeError(`solarSample: utcIso is not a valid date: ${utcIso}`);
    }

    const { altitudeRad, azimuthRad } = computeAltitudeAzimuth(lat, lon, date);
    const isAboveHorizon = altitudeRad > 0;
    const approxDirectWm2 = approximateDirectIrradiance(altitudeRad);

    return {
        utcIso: date.toISOString(),
        altitudeRad,
        azimuthRad,
        isAboveHorizon,
        approxDirectWm2,
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal — NOAA solar-position algorithm.
//
// Implementation follows the equations published at
// https://gml.noaa.gov/grad/solcalc/calcdetails.html (also known as the
// "NOAA Spreadsheet" — Astronomical Algorithms by Jean Meeus, Ch. 25).
// All intermediate angles are computed in DEGREES (matching the NOAA
// spreadsheet variable names) and converted to RADIANS at the boundary.
// ─────────────────────────────────────────────────────────────────────────────

function computeAltitudeAzimuth(
    latDeg: number,
    lonDeg: number,
    utcDate: Date,
): { altitudeRad: number; azimuthRad: number } {
    // 1. Julian Day from UTC.
    const julianDay = toJulianDay(utcDate);

    // 2. Julian Century.
    const T = (julianDay - 2451545.0) / 36525.0;

    // 3. Geometric mean longitude of Sun (degrees, 0..360).
    const L0 = mod360(280.46646 + T * (36000.76983 + T * 0.0003032));

    // 4. Geometric mean anomaly of Sun (degrees).
    const M = 357.52911 + T * (35999.05029 - 0.0001537 * T);

    // 5. Eccentricity of Earth's orbit.
    const e = 0.016708634 - T * (0.000042037 + 0.0000001267 * T);

    // 6. Sun's equation of center (degrees).
    const Mrad = M * RAD_PER_DEG;
    const C =
        Math.sin(Mrad) * (1.914602 - T * (0.004817 + 0.000014 * T)) +
        Math.sin(2 * Mrad) * (0.019993 - 0.000101 * T) +
        Math.sin(3 * Mrad) * 0.000289;

    // 7. Sun's true longitude.
    const trueLong = L0 + C;

    // 8. Sun's apparent longitude (corrected for nutation + aberration).
    const omega = 125.04 - 1934.136 * T;
    const lambda = trueLong - 0.00569 - 0.00478 * Math.sin(omega * RAD_PER_DEG);

    // 9. Mean obliquity of the ecliptic.
    const seconds = 21.448 - T * (46.815 + T * (0.00059 - T * 0.001813));
    const epsilon0 = 23.0 + (26.0 + seconds / 60.0) / 60.0;

    // 10. Obliquity corrected.
    const epsilon = epsilon0 + 0.00256 * Math.cos(omega * RAD_PER_DEG);

    // 11. Sun's declination (degrees).
    const sinDecl =
        Math.sin(epsilon * RAD_PER_DEG) * Math.sin(lambda * RAD_PER_DEG);
    const declDeg = Math.asin(sinDecl) * DEG_PER_RAD;

    // 12. Equation of Time (minutes).
    const epsHalfTan = Math.tan(epsilon * 0.5 * RAD_PER_DEG);
    const y = epsHalfTan * epsHalfTan;
    const L0rad = L0 * RAD_PER_DEG;
    const eqTimeMin =
        4.0 *
        DEG_PER_RAD *
        (y * Math.sin(2 * L0rad) -
            2 * e * Math.sin(Mrad) +
            4 * e * y * Math.sin(Mrad) * Math.cos(2 * L0rad) -
            0.5 * y * y * Math.sin(4 * L0rad) -
            1.25 * e * e * Math.sin(2 * Mrad));

    // 13. True solar time (minutes since solar midnight) at the location.
    const utcMinutes =
        utcDate.getUTCHours() * 60 +
        utcDate.getUTCMinutes() +
        utcDate.getUTCSeconds() / 60.0;
    const trueSolarTime = mod1440(utcMinutes + eqTimeMin + 4.0 * lonDeg);

    // 14. Hour angle (degrees). Negative before solar noon, positive after.
    let hourAngleDeg = trueSolarTime / 4.0 - 180.0;
    if (hourAngleDeg < -180.0) hourAngleDeg += 360.0;

    // 15. Solar zenith angle (degrees).
    const latRad = latDeg * RAD_PER_DEG;
    const declRad = declDeg * RAD_PER_DEG;
    const haRad = hourAngleDeg * RAD_PER_DEG;
    const cosZenith =
        Math.sin(latRad) * Math.sin(declRad) +
        Math.cos(latRad) * Math.cos(declRad) * Math.cos(haRad);
    const cosZenithClamped = Math.max(-1, Math.min(1, cosZenith));
    const zenithRad = Math.acos(cosZenithClamped);

    // 16. Altitude (elevation) = π/2 − zenith.
    const altitudeRad = Math.PI / 2 - zenithRad;

    // 17. Azimuth (NOAA convention — clockwise from N, in radians).
    // Use the standard formula:
    //   cos(az) = (sin(decl) − sin(alt)*sin(lat)) / (cos(alt)*cos(lat))
    // Then disambiguate the [0, π] vs [π, 2π] half via the sign of the
    // hour angle (positive HA → sun in west, az > π).
    const cosAlt = Math.cos(altitudeRad);
    let azimuthRad: number;
    if (Math.abs(cosAlt) < 1e-9 || Math.abs(Math.cos(latRad)) < 1e-9) {
        // Sun at zenith OR observer at pole — azimuth is undefined.
        // Convention: report 0 (north).
        azimuthRad = 0;
    } else {
        const cosAz =
            (Math.sin(declRad) - Math.sin(altitudeRad) * Math.sin(latRad)) /
            (cosAlt * Math.cos(latRad));
        const cosAzClamped = Math.max(-1, Math.min(1, cosAz));
        const azNorthRef = Math.acos(cosAzClamped); // [0, π], 0 = N
        // Map to clockwise-from-N.
        azimuthRad = hourAngleDeg > 0 ? 2 * Math.PI - azNorthRef : azNorthRef;
    }

    return { altitudeRad, azimuthRad };
}

/**
 * UTC Date → Julian Day Number (fractional). The Julian epoch is
 * 4713 BC Jan 1 12:00 UTC; we use the Meeus algorithm (Ch. 7).
 *
 * Pure: only reads UTC accessors on the input.
 */
export function toJulianDay(utcDate: Date): number {
    let y = utcDate.getUTCFullYear();
    let m = utcDate.getUTCMonth() + 1;           // JS month is 0-based
    const d =
        utcDate.getUTCDate() +
        (utcDate.getUTCHours() +
            utcDate.getUTCMinutes() / 60.0 +
            utcDate.getUTCSeconds() / 3600.0) /
            24.0;
    if (m <= 2) {
        y -= 1;
        m += 12;
    }
    const A = Math.floor(y / 100);
    const B = 2 - A + Math.floor(A / 4);
    return (
        Math.floor(365.25 * (y + 4716)) +
        Math.floor(30.6001 * (m + 1)) +
        d +
        B -
        1524.5
    );
}

/**
 * Closed-form direct-normal irradiance estimate from solar altitude
 * alone (Bird-Hulstrom simplified clear-sky form). Returns 0 at or
 * below the horizon; peaks at the solar constant at zenith.
 *
 * NOT a substitute for measured DNI — used as a baseline when the EPW
 * record's DNI field is missing or when computing sun samples for
 * sites without ingested EPW.
 */
function approximateDirectIrradiance(altitudeRad: number): number {
    if (altitudeRad <= 0) return 0;
    // Air mass via Kasten-Young (1989) formula.
    const altDeg = altitudeRad * DEG_PER_RAD;
    const airMass =
        1.0 /
        (Math.sin(altitudeRad) +
            0.50572 * Math.pow(altDeg + 6.07995, -1.6364));
    // Clear-sky atmospheric transmittance ≈ 0.7 ^ AM^0.678 (Laue 1970).
    const transmittance = Math.pow(0.7, Math.pow(airMass, 0.678));
    return SOLAR_CONSTANT_WM2 * transmittance;
}

function mod360(x: number): number {
    const r = x % 360.0;
    return r < 0 ? r + 360.0 : r;
}

function mod1440(x: number): number {
    const r = x % 1440.0;
    return r < 0 ? r + 1440.0 : r;
}
