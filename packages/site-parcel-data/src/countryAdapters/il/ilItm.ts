// LANE ME-OPEN — ISRAEL · the ITM ↔ WGS84 transform the govmap parcel leg needs.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// WHY A SELF-CONTAINED TRANSFORM HERE (and not `geometry/nativeCrs.ts`)
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// govmap's `IdentifyByXY` speaks ONLY the Israeli TM Grid (ITM, EPSG:2039). A WGS84 click therefore
// has to be projected to ITM before the query, and the ITM centroid/extent it returns projected
// back to WGS84 for display — so the transform is genuinely a leg of THIS provider, exactly as the
// me-sweep brief states ("ITM↔WGS84 transform in the leg").
//
// `geometry/nativeCrs.ts` already carries a Krüger transverse-Mercator series, but it is deliberately
// a UTM-family module: fixed k0 = 0.9996, false-easting 500 000, latitude-of-origin = the equator,
// central meridian derived from a zone number. ITM is a transverse Mercator with NONE of those:
//   • k0                 = 1.0000067      (NOT 0.9996)
//   • false easting      = 219 529.584 m
//   • false northing     = 626 907.390 m
//   • central meridian   = 35°12′16.261″E = 35.2045169444° (NOT a UTM zone meridian)
//   • latitude of origin = 31°44′03.817″N = 31.7343936111° (NOT the equator — this is the key
//     difference: ITM northing is measured from a mid-latitude parallel, so the meridional-arc
//     offset M0 at that parallel must be subtracted, which the UTM code never does)
//   • ellipsoid          = GRS80 (Israel 1993 / ITM datum; GRS80 and WGS84 agree < 0.1 mm here)
// Forcing ITM through the UTM module would either corrupt `NATIVE_METRIC_CRS`'s UTM invariants or
// silently misplace every Israeli parcel by tens of kilometres. So this is the SAME Krüger n-series
// (verified sub-mm over a TM belt) parameterised for ITM, kept beside the provider that uses it.
//
// VERIFIED (ilItm.test.ts, against the govmap live response of 2026-09-02):
//   • forward(origin lat/lon) === (219529.584, 626907.390) exactly — the projection definition.
//   • inverse(179256.4375, 665120.5938)  [gush 6952 / helka 139 centroid, verbatim from the live
//     IdentifyByXY body]  →  WGS84 (32.078293, 34.777957), a real south-Tel-Aviv coordinate.
//   • forward∘inverse of that centroid round-trips to < 1 mm.
//
// PURE + deterministic (C58 §1.1/§1.9): no I/O, no THREE, no DOM, no clock, no RNG. No OTel span —
// this is L2 arithmetic; the span lives on the resolver that calls it (C58 §1.10), like nativeCrs.ts.

/** GRS80 (the ITM / Israel 1993 datum ellipsoid). WGS84 differs by < 0.1 mm through these series. */
const A_GRS80 = 6_378_137;
const F_GRS80 = 1 / 298.257222101;

/**
 * EPSG:2039 — Israeli TM Grid parameters, verbatim from the EPSG registry. These are the ONLY
 * numbers that make this module ITM rather than an arbitrary transverse Mercator; a caller that
 * needs a different Israeli grid (the old ICS / EPSG:28193) must not reuse this constant.
 */
export const ITM_PARAMS = {
    epsg: 'EPSG:2039',
    /** Latitude of natural origin (deg). */
    lat0: 31.734393611111,
    /** Longitude of natural origin / central meridian (deg). */
    lon0: 35.204516944444,
    /** Scale factor at the central meridian. */
    k0: 1.0000067,
    /** False easting (m). */
    falseEasting: 219_529.584,
    /** False northing (m). */
    falseNorthing: 626_907.39,
} as const;

const D2R = Math.PI / 180;
const R2D = 180 / Math.PI;

// ── Krüger n-series coefficients for GRS80 (memoised; a pure function of f) ───────────────────────
const _n = F_GRS80 / (2 - F_GRS80);
const _n2 = _n * _n;
const _n3 = _n2 * _n;
const _n4 = _n3 * _n;
/** Rectifying-sphere radius, scaled. */
const KA = (A_GRS80 / (1 + _n)) * (1 + _n2 / 4 + _n4 / 64);
/** First eccentricity. */
const E = Math.sqrt(F_GRS80 * (2 - F_GRS80));
const ALPHA = [
    _n / 2 - (2 * _n2) / 3 + (5 * _n3) / 16 + (41 * _n4) / 180,
    (13 * _n2) / 48 - (3 * _n3) / 5 + (557 * _n4) / 1440,
    (61 * _n3) / 240 - (103 * _n4) / 140,
    (49561 * _n4) / 161280,
] as const;
const BETA = [
    _n / 2 - (2 * _n2) / 3 + (37 * _n3) / 96 - _n4 / 360,
    _n2 / 48 + _n3 / 15 - (437 * _n4) / 1440,
    (17 * _n3) / 480 - (37 * _n4) / 840,
    (4397 * _n4) / 161280,
] as const;
const DELTA = [
    2 * _n - (2 * _n2) / 3 - 2 * _n3 + (116 * _n4) / 45,
    (7 * _n2) / 3 - (8 * _n3) / 5 - (227 * _n4) / 45,
    (56 * _n3) / 15 - (136 * _n4) / 35,
    (4279 * _n4) / 630,
] as const;

/** ξ (rectifying-latitude image) on the central meridian for a given latitude — used for M0. */
function xiOnCentralMeridian(latDeg: number): number {
    const phi = latDeg * D2R;
    const sinPhi = Math.sin(phi);
    const t = Math.sinh(Math.atanh(sinPhi) - E * Math.atanh(E * sinPhi));
    const xiP = Math.atan2(t, 1);
    let xi = xiP;
    for (let j = 0; j < 4; j++) xi += ALPHA[j]! * Math.sin(2 * (j + 1) * xiP);
    return xi;
}

/** The meridional-arc offset (in scaled ξ·k0·KA metres) from the equator to ITM's latitude of origin. */
const N0 = ITM_PARAMS.k0 * KA * xiOnCentralMeridian(ITM_PARAMS.lat0);

/** A point in the Israeli TM Grid (EPSG:2039): easting + northing, metres. */
export interface ItmPoint {
    readonly east: number;
    readonly north: number;
}

/**
 * WGS84 degrees → Israeli TM Grid (EPSG:2039). Returns `null` for a non-finite or out-of-domain
 * input — NEVER a fabricated coordinate (§CONTEXT-DATA-HONESTY: an unknown is not a zero).
 */
export function wgs84ToItm(lat: number, lon: number): ItmPoint | null {
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
    if (lat < -89.9 || lat > 89.9) return null;
    const phi = lat * D2R;
    const lam = (lon - ITM_PARAMS.lon0) * D2R;
    const sinPhi = Math.sin(phi);
    const t = Math.sinh(Math.atanh(sinPhi) - E * Math.atanh(E * sinPhi));
    const cosLam = Math.cos(lam);
    const xiP = Math.atan2(t, cosLam);
    const etaP = Math.atanh(Math.sin(lam) / Math.sqrt(1 + t * t));
    let xi = xiP;
    let eta = etaP;
    for (let j = 0; j < 4; j++) {
        const k = 2 * (j + 1);
        xi += ALPHA[j]! * Math.sin(k * xiP) * Math.cosh(k * etaP);
        eta += ALPHA[j]! * Math.cos(k * xiP) * Math.sinh(k * etaP);
    }
    const east = ITM_PARAMS.falseEasting + ITM_PARAMS.k0 * KA * eta;
    const north = ITM_PARAMS.falseNorthing + ITM_PARAMS.k0 * KA * xi - N0;
    if (!Number.isFinite(east) || !Number.isFinite(north)) return null;
    return { east, north };
}

/**
 * Israeli TM Grid (EPSG:2039) → WGS84 degrees. **The display boundary** — never MEASURE downstream
 * of it (the nativeCrs.ts doctrine: a distance between two of these outputs re-enters quantisation
 * error). Returns `null` on non-finite input.
 */
export function itmToWgs84(east: number, north: number): { lat: number; lon: number } | null {
    if (!Number.isFinite(east) || !Number.isFinite(north)) return null;
    const xi = (north - ITM_PARAMS.falseNorthing + N0) / (ITM_PARAMS.k0 * KA);
    const eta = (east - ITM_PARAMS.falseEasting) / (ITM_PARAMS.k0 * KA);
    let xiP = xi;
    let etaP = eta;
    for (let j = 0; j < 4; j++) {
        const k = 2 * (j + 1);
        xiP -= BETA[j]! * Math.sin(k * xi) * Math.cosh(k * eta);
        etaP -= BETA[j]! * Math.cos(k * xi) * Math.sinh(k * eta);
    }
    const chi = Math.asin(Math.sin(xiP) / Math.cosh(etaP));
    let phi = chi;
    for (let j = 0; j < 4; j++) phi += DELTA[j]! * Math.sin(2 * (j + 1) * chi);
    const lam = Math.atan2(Math.sinh(etaP), Math.cos(xiP));
    const lat = phi * R2D;
    const lon = ITM_PARAMS.lon0 + lam * R2D;
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
    return { lat, lon };
}
