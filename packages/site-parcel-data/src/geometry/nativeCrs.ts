// §NATIVE-CRS-MEASUREMENT — MEASURE IN THE SOURCE'S OWN METRIC CRS, REPROJECT ONLY TO DISPLAY.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// THE BUG CLASS THIS EXISTS TO KILL
// ══════════════════════════════════════════════════════════════════════════════════════════════
// A municipal GeoServer holds planning geometry in a PROJECTED METRIC CRS (Spain: ETRS89 / UTM,
// EPSG:258xx). Asking it for `srsName=EPSG:4326` makes it reproject to DEGREES on the way out — and
// GeoServer serialises GeoJSON with a fixed `numDecimals`, four by default. Four decimals is:
//
//     • in metres  → 0.1 mm.  Harmless. This is the precision the server was tuned for.
//     • in DEGREES → ~8.8 m of longitude and ~11.1 m of latitude at Murcia's latitude. CATASTROPHIC.
//
// So the SAME feature arrives with millimetre fidelity in EPSG:25830 and with ~10 m fidelity in
// EPSG:4326. MEASURED LIVE against `Murcia:pgou_alineaciones` (2026-08-02, 707 features / 19 986
// segments matched by WFS feature id across 12 neighbourhoods):
//
//     segment |Δlength|   median 2.96 m · p90 7.34 m · p99 10.33 m · max 13.71 m
//     ring |Δperimeter|   median 10.91 m · p90 37.18 m · max 502.93 m
//     DEGENERATE (zero-length) segments   4326: 7 499 of 19 986 (37.5 %)   ·   native 25830: 1
//
// That last line is the one that settles it: in 4326 more than a third of every ring's edges have
// COLLAPSED ONTO EACH OTHER. This is not rounding, it is a different — and wrong — polygon.
//
// ⚠ `format_options=numDecimals:N` is NOT honoured by this server, so raising the precision in 4326
// is not an available fix. The only fix is to stop asking for 4326.
//
// ⚠ AND THE ERROR IS THE SIZE OF THE LEGAL BANDS. Murcia PGOU Arts. 5.3.3 / 5.5.3 / 5.7.3 / 5.9.3
// switch storeys at 4 m, 8 m and 12 m of street width. A median 3 m measurement error on an 8 m
// threshold is not a tolerance — it is a coin flip on a storey.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// THE RULE THIS MODULE ENFORCES
// ══════════════════════════════════════════════════════════════════════════════════════════════
//   **Request the source's NATIVE metric CRS → MEASURE in it → reproject ONLY at the display seam.**
//
// Measurement and display are different responsibilities and must not share a coordinate pipeline.
// A display pipeline may lose a metre without anyone noticing; a measurement pipeline may not lose a
// centimetre, because the number it produces selects a legal band.
//
// This module is DELIBERATELY REGION-AGNOSTIC — it is the analogue of `geometry/streetWidth.ts`,
// which "takes rings and returns metres" for every city. It takes an EPSG code and returns a
// MEASUREMENT FRAME. Murcia is its first consumer; every other metre-CRS source (Catalunya 25831,
// Galicia 25829, Denmark 25832, Zürich 2056 …) plugs in by naming its CRS in `NATIVE_METRIC_CRS`,
// with no new projection code.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// WHY THE PROJECTION IS IMPLEMENTED HERE AND NOT TAKEN FROM proj4
// ══════════════════════════════════════════════════════════════════════════════════════════════
// `@pryzm/site-parcel-data` is L2-PURE (C58 §1.9): no I/O, no THREE, no DOM, no clock, no RNG, and
// a deliberately tiny dependency set. Krüger's transverse-Mercator series is closed-form,
// sub-millimetre over a UTM zone, and about sixty lines — cheaper than a dependency, and it keeps
// the purity guarantee that lets every result be byte-identical. It is VERIFIED AGAINST GEOSERVER'S
// OWN REPROJECTION of a real feature in `nativeCrs.test.ts`, which is an INDEPENDENT check: if this
// code were wrong, it would disagree with the authority that published both representations.
//
// ⚠ ETRS89 vs WGS84 — STATED, NOT SWEPT UNDER THE RUG. EPSG:25830 is ETRS89-based; a browser
// coordinate is WGS84. The two frames have drifted ~0.5 m by 2026 (Eurasian plate motion). We apply
// the SAME null transform GeoServer applied when it produced the 4326 copy, so this path is exactly
// as consistent with the publisher as the old one was — no new error is introduced. And the residual
// offset is a RIGID TRANSLATION of the whole neighbourhood, so it cannot change a WIDTH at all
// (a distance is translation-invariant); it can only nudge which polygon a click falls in, where
// 0.5 m is two orders of magnitude below the ~10 m the quantisation was costing. Never invent a
// datum: what is unknown here is bounded, stated, and shown not to reach the measured number.
//
// PURE + deterministic (C58 §1.1/§1.9). No I/O, no THREE, no DOM, no clock, no RNG. No OTel span —
// this is an L2 arithmetic module, and spans live on the resolvers that call it (C58 §1.10), exactly
// as `geometry/streetWidth.ts` does.
//
// Contracts: C58 §1.1/§1.4/§1.9 · C63 · ADR-0271 (constructed values say so) · ADR-0275
// (region-agnostic measurement) · §CONTEXT-DATA-HONESTY (L-422/457/467/469).

import type { Pt } from '@pryzm/schemas';

// ──────────────────────────────────────────────────────────────────────────────────────────────
// THE REGISTRY — which projected metric CRS a measurement path is allowed to work in
// ──────────────────────────────────────────────────────────────────────────────────────────────

/** A projected, metre-unit CRS a measurement may be performed in. */
export interface NativeMetricCrsDef {
    /** Canonical `EPSG:nnnnn` code, uppercase. */
    readonly epsg: string;
    /** Only transverse-Mercator/UTM families are modelled; anything else must be added explicitly. */
    readonly kind: 'utm';
    /** UTM zone number (1–60). */
    readonly zone: number;
    /** Northern hemisphere? (false ⇒ 10 000 000 m false northing.) */
    readonly north: boolean;
    /** Reference ellipsoid. GRS80 and WGS84 differ by < 0.1 mm through these formulae. */
    readonly ellipsoid: 'GRS80' | 'WGS84';
    /** Human label, for a refusal message a user can act on. */
    readonly label: string;
}

function utm(epsg: string, zone: number, ellipsoid: 'GRS80' | 'WGS84', label: string): NativeMetricCrsDef {
    return { epsg, kind: 'utm', zone, north: true, ellipsoid, label };
}

/**
 * The projected metric CRS a PRYZM measurement path may run in.
 *
 * ⚠ THIS IS AN ALLOW-LIST, AND THAT IS THE POINT. A CRS absent from here is not silently trusted:
 * `makeMeasurementFrame` returns `null`, the caller refuses, and nobody measures in a frame whose
 * units we have not established are metres. Adding a region means adding ONE line here — never a
 * second projection implementation, and never a per-city branch in a resolver (P1).
 */
export const NATIVE_METRIC_CRS: ReadonlyMap<string, NativeMetricCrsDef> = new Map([
    // ── Spain — ETRS89 / UTM. The peninsula spans zones 29–31; Murcia is 30.
    ['EPSG:25829', utm('EPSG:25829', 29, 'GRS80', 'ETRS89 / UTM zone 29N (Galicia, W Spain)')],
    ['EPSG:25830', utm('EPSG:25830', 30, 'GRS80', 'ETRS89 / UTM zone 30N (most of Spain, incl. Murcia)')],
    ['EPSG:25831', utm('EPSG:25831', 31, 'GRS80', 'ETRS89 / UTM zone 31N (Catalunya, Balears)')],
    // ── Rest of Europe — same ETRS89 / UTM family, other zones.
    ['EPSG:25832', utm('EPSG:25832', 32, 'GRS80', 'ETRS89 / UTM zone 32N (DK, DE, NO)')],
    ['EPSG:25833', utm('EPSG:25833', 33, 'GRS80', 'ETRS89 / UTM zone 33N (SE, NO, PL)')],
    // ── WGS84 / UTM, where a publisher uses it directly.
    ['EPSG:32629', utm('EPSG:32629', 29, 'WGS84', 'WGS 84 / UTM zone 29N')],
    ['EPSG:32630', utm('EPSG:32630', 30, 'WGS84', 'WGS 84 / UTM zone 30N')],
    ['EPSG:32631', utm('EPSG:32631', 31, 'WGS84', 'WGS 84 / UTM zone 31N')],
]);

/**
 * Normalise a CRS label to the `EPSG:nnnnn` form, accepting the several shapes a WFS answers with
 * (`EPSG:25830`, `urn:ogc:def:crs:EPSG::25830`, `http://www.opengis.net/def/crs/EPSG/0/25830`).
 * Returns `null` when no EPSG code can be read — which is NOT "it is 4326", it is UNKNOWN.
 */
export function normaliseCrs(raw: unknown): string | null {
    if (typeof raw !== 'string') return null;
    const m = /EPSG[:/]{1,2}(?:0[:/])?(\d{4,6})/i.exec(raw.trim());
    return m ? `EPSG:${m[1]}` : null;
}

/** Is this CRS one we are allowed to MEASURE in? Only an explicit allow-list entry qualifies. */
export function isNativeMetricCrs(raw: unknown): boolean {
    const c = normaliseCrs(raw);
    return c !== null && NATIVE_METRIC_CRS.has(c);
}

/** The definition for a CRS, or `null` when it is not an allow-listed metric CRS. */
export function nativeMetricCrsDef(raw: unknown): NativeMetricCrsDef | null {
    const c = normaliseCrs(raw);
    return c === null ? null : (NATIVE_METRIC_CRS.get(c) ?? null);
}

// ──────────────────────────────────────────────────────────────────────────────────────────────
// TRANSVERSE MERCATOR (Krüger n-series) — the only projection maths in this package
// ──────────────────────────────────────────────────────────────────────────────────────────────

interface Ellipsoid { readonly a: number; readonly f: number; }
const ELLIPSOIDS: Record<'GRS80' | 'WGS84', Ellipsoid> = {
    GRS80: { a: 6_378_137, f: 1 / 298.257222101 },
    WGS84: { a: 6_378_137, f: 1 / 298.257223563 },
};

const UTM_K0 = 0.9996;
const UTM_FALSE_EASTING = 500_000;
const UTM_FALSE_NORTHING_SOUTH = 10_000_000;

const D2R = Math.PI / 180;
const R2D = 180 / Math.PI;

/** Central meridian of a UTM zone, degrees. */
function centralMeridianDeg(zone: number): number { return (zone - 1) * 6 - 180 + 3; }

interface KrugerSeries {
    readonly A: number;
    readonly alpha: readonly [number, number, number, number];
    readonly beta: readonly [number, number, number, number];
    readonly delta: readonly [number, number, number, number];
    readonly e: number;
}

/** Memoised per ellipsoid — pure function of `f`, so caching cannot make output non-deterministic. */
const _series = new Map<string, KrugerSeries>();
function krugerSeries(name: 'GRS80' | 'WGS84'): KrugerSeries {
    const cached = _series.get(name);
    if (cached) return cached;
    const { a, f } = ELLIPSOIDS[name];
    const n = f / (2 - f);
    const n2 = n * n, n3 = n2 * n, n4 = n3 * n;
    const s: KrugerSeries = {
        A: (a / (1 + n)) * (1 + n2 / 4 + n4 / 64),
        alpha: [
            n / 2 - (2 * n2) / 3 + (5 * n3) / 16 + (41 * n4) / 180,
            (13 * n2) / 48 - (3 * n3) / 5 + (557 * n4) / 1440,
            (61 * n3) / 240 - (103 * n4) / 140,
            (49561 * n4) / 161280,
        ],
        beta: [
            n / 2 - (2 * n2) / 3 + (37 * n3) / 96 - n4 / 360,
            n2 / 48 + n3 / 15 - (437 * n4) / 1440,
            (17 * n3) / 480 - (37 * n4) / 840,
            (4397 * n4) / 161280,
        ],
        delta: [
            2 * n - (2 * n2) / 3 - 2 * n3 + (116 * n4) / 45,
            (7 * n2) / 3 - (8 * n3) / 5 - (227 * n4) / 45,
            (56 * n3) / 15 - (136 * n4) / 35,
            (4279 * n4) / 630,
        ],
        e: Math.sqrt(f * (2 - f)),
    };
    _series.set(name, s);
    return s;
}

/** A point in a projected metric CRS: easting + northing, metres. */
export interface NativeEN { readonly e: number; readonly n: number; }

/**
 * Geographic (WGS84/ETRS89 degrees) → projected metric CRS. Returns `null` for a non-metric or
 * unregistered CRS, or a non-finite input — NEVER a fabricated coordinate.
 *
 * ⚠ THIS IS THE ONE PLACE A DEGREE IS ALLOWED TO ENTER A MEASUREMENT PIPELINE, and it enters at
 * FULL double precision from the caller's own click — not from a 4-decimal wire format. The loss
 * this module exists to prevent is in the SERIALISATION of the published geometry, not in the query
 * point, which we hold exactly.
 */
export function projectToNative(crs: unknown, lat: number, lon: number): NativeEN | null {
    const def = nativeMetricCrsDef(crs);
    if (!def || !Number.isFinite(lat) || !Number.isFinite(lon)) return null;
    if (lat < -89.9 || lat > 89.9) return null;
    const { A, alpha, e } = krugerSeries(def.ellipsoid);
    const phi = lat * D2R;
    const lam = (lon - centralMeridianDeg(def.zone)) * D2R;

    const sinPhi = Math.sin(phi);
    const t = Math.sinh(Math.atanh(sinPhi) - e * Math.atanh(e * sinPhi));
    const cosLam = Math.cos(lam);
    const xiP = Math.atan2(t, cosLam);
    const etaP = Math.atanh(Math.sin(lam) / Math.sqrt(1 + t * t));

    let xi = xiP, eta = etaP;
    for (let j = 0; j < 4; j++) {
        const k = 2 * (j + 1);
        xi += alpha[j]! * Math.sin(k * xiP) * Math.cosh(k * etaP);
        eta += alpha[j]! * Math.cos(k * xiP) * Math.sinh(k * etaP);
    }
    const easting = UTM_FALSE_EASTING + UTM_K0 * A * eta;
    const northing = (def.north ? 0 : UTM_FALSE_NORTHING_SOUTH) + UTM_K0 * A * xi;
    if (!Number.isFinite(easting) || !Number.isFinite(northing)) return null;
    return { e: easting, n: northing };
}

/**
 * Projected metric CRS → geographic degrees. **THE DISPLAY BOUNDARY, AND NOTHING ELSE.**
 *
 * ⚠ NEVER MEASURE ON THE OUTPUT OF THIS FUNCTION. It exists so a measured result can be drawn on a
 * WGS84 map or handed to a mapping consumer. A distance taken between two of its outputs re-enters
 * the exact failure this module documents. Returns `null` on an unregistered CRS or bad input.
 */
export function nativeToWgs84(crs: unknown, e: number, n: number): { lat: number; lon: number } | null {
    const def = nativeMetricCrsDef(crs);
    if (!def || !Number.isFinite(e) || !Number.isFinite(n)) return null;
    const { A, beta, delta } = krugerSeries(def.ellipsoid);
    const xi = (n - (def.north ? 0 : UTM_FALSE_NORTHING_SOUTH)) / (UTM_K0 * A);
    const eta = (e - UTM_FALSE_EASTING) / (UTM_K0 * A);

    let xiP = xi, etaP = eta;
    for (let j = 0; j < 4; j++) {
        const k = 2 * (j + 1);
        xiP -= beta[j]! * Math.sin(k * xi) * Math.cosh(k * eta);
        etaP -= beta[j]! * Math.cos(k * xi) * Math.sinh(k * eta);
    }
    const chi = Math.asin(Math.sin(xiP) / Math.cosh(etaP));
    let phi = chi;
    for (let j = 0; j < 4; j++) phi += delta[j]! * Math.sin(2 * (j + 1) * chi);
    const lam = Math.atan2(Math.sinh(etaP), Math.cos(xiP));
    const lat = phi * R2D;
    const lon = centralMeridianDeg(def.zone) + lam * R2D;
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
    return { lat, lon };
}

// ──────────────────────────────────────────────────────────────────────────────────────────────
// THE MEASUREMENT FRAME — what a provider actually consumes
// ──────────────────────────────────────────────────────────────────────────────────────────────

/**
 * How a coordinate reached a measurement. Carried as DATA so a consumer cannot mistake one for the
 * other, in the same spirit as `provenance` on a resolved width (ADR-0271 / C2 of SIG-MU2).
 */
export type MeasurementFidelity =
    /** Straight from the publisher's own metric CRS. The only value a legal band may be read from. */
    | 'native-metric'
    /** Arrived through a reprojection to degrees. UNSAFE TO MEASURE — see this file's header. */
    | 'reprojected-degrees';

/**
 * A local metric XZ frame anchored on a query point, fed by the publisher's NATIVE metric CRS.
 *
 * `fromNative` is a RIGID TRANSFORM — a translation plus the scene convention's northing negation.
 * It cannot stretch, rotate or quantise anything, so a distance measured in this frame IS the
 * distance in the publisher's CRS, to the last bit the publisher serialised.
 *
 * `z` is NEGATED northing, matching the scene-XZ convention every geometry module here works in.
 */
export interface MeasurementFrame {
    /** The CRS the frame measures in, e.g. `EPSG:25830`. */
    readonly crs: string;
    readonly def: NativeMetricCrsDef;
    /** Always `'native-metric'` — a frame cannot be constructed for a degree source. */
    readonly fidelity: 'native-metric';
    /** Frame origin in the native CRS (the projected query point). */
    readonly originE: number;
    readonly originN: number;
    /** Native easting/northing → local metric XZ. RIGID: translation only. Lossless. */
    fromNative(e: number, n: number): Pt;
    /**
     * Geographic degrees → local metric XZ, via the native CRS. Use ONLY for coordinates PRYZM
     * holds at full precision (a click, a committed parcel ring) — never for wire geometry that
     * arrived as reprojected degrees.
     */
    fromLonLat(lon: number, lat: number): Pt;
    /** Local metric XZ → native easting/northing. */
    toNative(p: Pt): NativeEN;
    /** Local metric XZ → WGS84 degrees. **THE DISPLAY BOUNDARY.** Never measure downstream of it. */
    toLonLat(p: Pt): { lat: number; lon: number } | null;
}

/**
 * Build the measurement frame for a query point in a publisher's native metric CRS.
 *
 * @returns `null` when `crs` is not an allow-listed metric CRS, or the point cannot be projected.
 *   **A `null` MUST become a refusal, never a fallback to degrees** — falling back is the bug.
 */
export function makeMeasurementFrame(
    crs: unknown, originLat: number, originLon: number,
): MeasurementFrame | null {
    const def = nativeMetricCrsDef(crs);
    if (!def) return null;
    const origin = projectToNative(def.epsg, originLat, originLon);
    if (!origin) return null;
    const { e: originE, n: originN } = origin;
    return {
        crs: def.epsg,
        def,
        fidelity: 'native-metric',
        originE,
        originN,
        fromNative(e: number, n: number): Pt { return { x: e - originE, z: -(n - originN) }; },
        fromLonLat(lon: number, lat: number): Pt {
            const p = projectToNative(def.epsg, lat, lon);
            // A point outside the projectable domain cannot be silently placed at the origin — that
            // would put a foreign ring exactly on top of our block. NaN propagates and the ring is
            // dropped by the caller's finite filter, which is the honest outcome.
            if (!p) return { x: Number.NaN, z: Number.NaN };
            return { x: p.e - originE, z: -(p.n - originN) };
        },
        toNative(p: Pt): NativeEN { return { e: p.x + originE, n: originN - p.z }; },
        toLonLat(p: Pt) { return nativeToWgs84(def.epsg, p.x + originE, originN - p.z); },
    };
}

/**
 * The degrees-per-metre quantisation a 4-decimal EPSG:4326 wire format imposes at a latitude —
 * the number that makes this whole module necessary, computed rather than quoted.
 *
 * Exported so a guard or a probe can state the harm for ANY city rather than repeating Murcia's
 * figures: at latitude φ, one unit in the 4th decimal of longitude is `0.0001 · 111320 · cos φ`
 * metres and of latitude `0.0001 · 111320` metres.
 *
 * @param decimals the serialiser's `numDecimals` (GeoServer's default is 4).
 */
export function degreeQuantisation_m(
    latitudeDeg: number, decimals = 4,
): { lon_m: number; lat_m: number } | null {
    if (!Number.isFinite(latitudeDeg) || !Number.isFinite(decimals) || decimals < 0) return null;
    const step = Math.pow(10, -decimals);
    const latM = step * 111_320;
    return { lon_m: latM * Math.cos(latitudeDeg * D2R), lat_m: latM };
}
