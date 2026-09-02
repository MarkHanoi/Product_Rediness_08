// El Sauzal (INE 38041, Tenerife, Canarias) — the ZUSO shapefile resolver.
//
// ═════════════════════════════════════════════════════════════════════════════════════════════
// WHAT THIS IS, AND WHY IT IS OFFLINE (unlike Zaragoza/Córdoba's live WFS resolvers)
// ═════════════════════════════════════════════════════════════════════════════════════════════
// El Sauzal publishes NO live zoning WFS/WMS endpoint (unlike Zaragoza's IDEZar or Córdoba's
// GeoServer). Its zoning geometry ships as a STATIC SIPU package on opendata.sitcan.es — a
// downloadable ZIP, not a queryable service — so this resolver reads a real, downloaded,
// committed extract of that package rather than making a network call. That is a deliberate
// difference from `resolveZaragozaZone.ts` / `resolveCordobaSubzone.ts`, not an oversight.
//
// SOURCE OF THE DATA (`./data/elSauzalZuso.json`):
//   opendata.sitcan.es dataset `planeamiento-urbanistico-de-el-sauzal`, resource
//   `221125-mmpgo-esa-usos-suelo-urbano-240702-240702-sipu.zip`
//   (downloaded 2026-08-03; `IDENTIF.TXT` inside identifies it as "Modificación Menor nº1 de
//   Régimen de usos en suelo urbano" of the base PGO, Aprobación Definitiva published 16/12/2022,
//   BOC 246/22 / BOP 151/22 — i.e. the CURRENT zoning-use geometry for El Sauzal's suelo urbano,
//   not the original 2010 PGO's un-amended layer).
//
//   The ZIP's `02SIST/ZUSO.shp` + `02SIST/ZUSO.dbf` (529 records, ESRI shapefile type 5 —
//   Polygon) were parsed with a byte-level DBF/SHP reader written for this task (no `mdbtools`,
//   no `pyshp`, no network service available in the sandbox) and re-serialised, unmodified in
//   coordinate value (only rounded to 0.1 m — far finer than any parcel-scale decision needs),
//   as the committed `elSauzalZuso.json` this file loads. `ZUSO.prj` states the source CRS is
//   `WGS_1984_UTM_Zone_28N` (EPSG:32628, metres) — the standard Canarias SIPU projection, and the
//   SAME projection Telde's `EDIF.shp` ships in (`esCanariasSipu.ts`).
//
// ⚠ A PROPER DBF HEADER PARSE (not a grep) established the field list is
// `ETIQUETA, CODIGO, ETIPLAN, TXTPLAN, OBS, PDF, CAPA` — CODIGO is a per-record SEQUENTIAL ROW ID
// (1, 2, 3 … 821), NOT a zone typology code; the real zone vocabulary lives in `ETIQUETA` (70
// distinct values: `RE-ViCo-1..12`, `RE-ViUf-1..17`, `CO-*`, `IE-*`, `IN-In`, `TE-Co`, …). This
// resolver reports `ETIQUETA` verbatim as `zoneCode` — never `CODIGO`, which would silently
// misreport a per-polygon serial number as a planning zone.
//
// ═════════════════════════════════════════════════════════════════════════════════════════════
// THE GEOMETRY OPERATION — a real, offline point-in-polygon, not a network call
// ═════════════════════════════════════════════════════════════════════════════════════════════
// The query point arrives as WGS84 (lat, lon); `wgs84ToUtm28N` below is a from-scratch forward
// Transverse Mercator projection (Snyder 1987 series, 6th-order in the easting term) parameterised
// EXACTLY as `ZUSO.prj` states (`Central_Meridian -15.0`, `Scale_Factor 0.9996`,
// `False_Easting 500000.0`, WGS84 ellipsoid) so the projected point lands in the SAME metric frame
// as the committed polygon coordinates — no reprojection of 529 polygons was needed, only of the
// one query point. `pointInRingsEvenOdd` then runs the standard ray-casting test per ring and XORs
// the per-ring membership across every ring in a record, which is the correct even-odd test for a
// shell-plus-holes polygon regardless of each ring's winding direction.
//
// THREE HONESTY PROPERTIES (mirrors `resolveZaragozaZone` / `resolveCordobaSubzone`):
//   1. IT NEVER THROWS. A malformed point, an empty dataset, or a point outside every polygon all
//      return a typed refusal.
//   2. IT DOES NOT DECIDE TO RENDER. It reports the matched `ETIQUETA`, packed or not — the
//      dispatcher (not built for El Sauzal yet — see `esElSauzal.ts`) would own that decision.
//   3. IT NEVER SILENTLY DROPS A MATCHED-BUT-UNPACKED CODE. A hit on e.g. `CO-ElPt-1` (unpacked)
//      resolves `ok: true` with that code, never a `no-zone` refusal that would misread as
//      "outside the plan" when the point is squarely inside it.
//
// PURITY: the projection and point-in-polygon core (`resolveElSauzalZoneFromRecords`) are L2-pure
// — no I/O, no clock, no RNG. `loadElSauzalZusoRecords` is the ONE impure seam (a file read),
// injectable via `deps.records` so tests never touch the filesystem. OTel span
// `pryzm.zoning.resolveElSauzalZone` (P8).
//
// Strategic context — C58 §1.9, §CONTEXT-DATA-HONESTY, `esCanariasSipu.ts` (the SIPU EDIF
// machinery this resolver deliberately does NOT reuse — El Sauzal's SIPU package ships no
// `EDIF.mdb`; see `esElSauzal.ts` for why the numeric parameters come from a different document).

import { trace, SpanStatusCode } from '@opentelemetry/api';
// §BROWSER-SAFE-DATA-LOAD — a STATIC import, not `fs.readFileSync`. This module is reachable from
// the client bundle (`siteDispatch.ts`'s `applyElSauzalZoningThenFallback`), and Vite's browser
// build stubs `node:fs` — a runtime `readFileSync` call here is a hard build failure there, not a
// runtime one, so it stays invisible until the client is actually built. A static import lets the
// bundler (Vite client-side, tsx/Node server-side — both honour `resolveJsonModule`) embed the
// 529-record extract as ordinary bundled data in either environment.
import elSauzalZusoData from './data/elSauzalZuso.json' with { type: 'json' };

const tracer = trace.getTracer('pryzm.zoning.el-sauzal');

/** A WGS84 point — the frame the resolver is queried in. */
export interface ElSauzalLngLat {
    readonly lat: number;
    readonly lon: number;
}

/** A projected point in the ZUSO layer's own CRS (EPSG:32628, metres). */
export interface Utm28NPoint {
    readonly x: number;
    readonly y: number;
}

/** One `ZUSO.dbf` `ETIQUETA` record, as committed in `./data/elSauzalZuso.json`. */
export interface ElSauzalZusoRecord {
    /** The real zone code (`ZUSO.dbf` `ETIQUETA`), e.g. `RE-ViUf-7`, `CO-ElPt-1`. */
    readonly etiqueta: string;
    /** Polygon rings in EPSG:32628 metres, `[[ [x,y], [x,y], … ], …]` — shell(s) + holes, mixed. */
    readonly rings: ReadonlyArray<ReadonlyArray<readonly [number, number]>>;
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// PROJECTION — WGS84 lat/lon → EPSG:32628 (UTM zone 28N), forward Transverse Mercator.
// ─────────────────────────────────────────────────────────────────────────────────────────────

/** WGS84 ellipsoid, exactly as `ZUSO.prj` states (`SPHEROID["WGS_1984",6378137.0,298.257223563]`). */
const WGS84_A = 6378137.0;
const WGS84_F = 1 / 298.257223563;
const WGS84_E2 = WGS84_F * (2 - WGS84_F);
/** Second eccentricity squared, e'² = e²/(1−e²) — the Snyder-series term, not a duplicate of e². */
const WGS84_EP2 = WGS84_E2 / (1 - WGS84_E2);

/** Exactly the four PROJCS parameters `ZUSO.prj` publishes for `WGS_1984_UTM_Zone_28N`. */
const CENTRAL_MERIDIAN_DEG = -15.0;
const SCALE_FACTOR = 0.9996;
const FALSE_EASTING = 500000.0;
const FALSE_NORTHING = 0.0; // northern hemisphere zone — El Sauzal is at +28° lat.

const toRad = (deg: number): number => (deg * Math.PI) / 180;

/**
 * Forward Transverse Mercator, WGS84 lat/lon (degrees) → EPSG:32628 metres.
 *
 * Snyder (1987), *Map Projections — A Working Manual*, the standard 6th-order easting / 8th-order
 * meridian-arc series (the same formula family every mainstream TM implementation — proj4,
 * GeoTools, GDAL — reduces to for a spherical or Krüger series of this order); accurate to
 * sub-millimetre within a few degrees of the central meridian, orders of magnitude tighter than
 * any parcel-scale decision this resolver makes.
 *
 * PURE: no I/O, no state.
 */
export function wgs84ToUtm28N(lat: number, lon: number): Utm28NPoint {
    const latRad = toRad(lat);
    const lonRad = toRad(lon);
    const lon0Rad = toRad(CENTRAL_MERIDIAN_DEG);

    const sinLat = Math.sin(latRad);
    const cosLat = Math.cos(latRad);
    const tanLat = Math.tan(latRad);

    const N = WGS84_A / Math.sqrt(1 - WGS84_E2 * sinLat * sinLat);
    const T = tanLat * tanLat;
    const C = WGS84_EP2 * cosLat * cosLat;
    const A = cosLat * (lonRad - lon0Rad);

    const e2 = WGS84_E2;
    const M =
        WGS84_A *
        ((1 - e2 / 4 - (3 * e2 * e2) / 64 - (5 * e2 * e2 * e2) / 256) * latRad -
            ((3 * e2) / 8 + (3 * e2 * e2) / 32 + (45 * e2 * e2 * e2) / 1024) * Math.sin(2 * latRad) +
            ((15 * e2 * e2) / 256 + (45 * e2 * e2 * e2) / 1024) * Math.sin(4 * latRad) -
            ((35 * e2 * e2 * e2) / 3072) * Math.sin(6 * latRad));

    const x =
        SCALE_FACTOR *
            N *
            (A +
                ((1 - T + C) * A ** 3) / 6 +
                ((5 - 18 * T + T * T + 72 * C - 58 * WGS84_EP2) * A ** 5) / 120) +
        FALSE_EASTING;

    const y =
        SCALE_FACTOR *
            (M +
                N *
                    tanLat *
                    (A ** 2 / 2 +
                        ((5 - T + 9 * C + 4 * C * C) * A ** 4) / 24 +
                        ((61 - 58 * T + T * T + 600 * C - 330 * WGS84_EP2) * A ** 6) / 720)) +
        FALSE_NORTHING;

    return { x, y };
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// POINT-IN-POLYGON — standard ray casting, XORed across rings so shell+hole geometry is correct.
// ─────────────────────────────────────────────────────────────────────────────────────────────
//
// ⚠ MOVED, NOT DELETED (L-12871). The implementation now lives in
// `../geometry/pointInRingsEvenOdd.ts` so the national-jurisdiction resolver can reuse the SAME
// ray cast instead of minting a second one. It is RE-EXPORTED here unchanged, so this module's
// public API — and `resolveTeldeZone.ts`, which imports the symbol from THIS file — are untouched.
// `Utm28NPoint` is structurally `{ x, y }`, i.e. exactly the extracted `PlanarPoint`, so every
// existing call site still typechecks.

export { pointInRingsEvenOdd } from '../geometry/pointInRingsEvenOdd.js';

import { pointInRingsEvenOdd } from '../geometry/pointInRingsEvenOdd.js';

// ─────────────────────────────────────────────────────────────────────────────────────────────
// DATA LOADING — the ONE impure seam. Injectable so tests never touch the filesystem.
// ─────────────────────────────────────────────────────────────────────────────────────────────

/**
 * The committed `elSauzalZuso.json` extract (529 records), statically bundled — see the
 * §BROWSER-SAFE-DATA-LOAD import note above. Throws only if the packaged asset is malformed (a
 * packaging bug, not a runtime/user condition), which is why `resolveElSauzalZone` wraps every
 * call to this in a try/catch and turns any throw into a typed refusal.
 */
export function loadElSauzalZusoRecords(): ElSauzalZusoRecord[] {
    return elSauzalZusoData as unknown as ElSauzalZusoRecord[];
}

/** Injectable dependencies so the adapter is unit-testable without the filesystem. */
export interface ElSauzalZoneDeps {
    /** Override the ZUSO record set (tests inject a tiny fixture; production loads the real file). */
    readonly records?: ReadonlyArray<ElSauzalZusoRecord>;
}

/** Why an El Sauzal zone resolution refused. Closed vocabulary — operationally distinct. */
export type ElSauzalZoneRefusalReason =
    /** No usable WGS84 point was supplied. */
    | 'no-point'
    /** The record set could not be loaded/parsed (a packaging defect, not a user condition). */
    | 'data-unavailable'
    /** The point-in-polygon test matched no `ZUSO` record at this point. */
    | 'no-zone';

export interface ElSauzalZoneResolution {
    /** The raw `ETIQUETA` value, verbatim (e.g. `RE-ViUf-7`, `CO-ElPt-1`). */
    readonly zoneCode: string;
}

export type ElSauzalZoneResult =
    | { readonly ok: true; readonly resolution: ElSauzalZoneResolution }
    | { readonly ok: false; readonly reason: ElSauzalZoneRefusalReason };

/**
 * PURE core: resolve a WGS84 point against an ALREADY-LOADED record set. Exported separately from
 * `resolveElSauzalZone` so tests exercise the geometry against a tiny fixture, never the real
 * 529-record file.
 */
export function resolveElSauzalZoneFromRecords(
    point: ElSauzalLngLat | null | undefined,
    records: ReadonlyArray<ElSauzalZusoRecord>,
): ElSauzalZoneResult {
    if (
        !point ||
        typeof point.lat !== 'number' ||
        typeof point.lon !== 'number' ||
        !Number.isFinite(point.lat) ||
        !Number.isFinite(point.lon)
    ) {
        return { ok: false, reason: 'no-point' };
    }

    const projected = wgs84ToUtm28N(point.lat, point.lon);
    for (const rec of records) {
        if (pointInRingsEvenOdd(projected, rec.rings)) {
            const zoneCode = rec.etiqueta.trim();
            if (zoneCode === '') continue;
            return { ok: true, resolution: { zoneCode } };
        }
    }
    return { ok: false, reason: 'no-zone' };
}

/**
 * Resolve an El Sauzal parcel's `ZUSO` zoning-use code (`ETIQUETA`) at a WGS84 point, against the
 * committed offline shapefile extract. NEVER throws — every failure is a typed refusal (see the
 * three honesty properties in the header).
 *
 * P8 — emits `pryzm.zoning.resolveElSauzalZone`.
 */
export function resolveElSauzalZone(
    point: ElSauzalLngLat | null | undefined,
    deps: ElSauzalZoneDeps = {},
): ElSauzalZoneResult {
    const span = tracer.startSpan('pryzm.zoning.resolveElSauzalZone');
    span.setAttribute('provider', 'el-sauzal-zuso-shapefile');
    try {
        let records: ReadonlyArray<ElSauzalZusoRecord>;
        try {
            records = deps.records ?? loadElSauzalZusoRecords();
        } catch (err) {
            console.warn('[el-sauzal-zone] data load failed (non-fatal):', (err as Error)?.message ?? err);
            span.setAttribute('resultFields', 'data-unavailable');
            span.setStatus({ code: SpanStatusCode.OK });
            return { ok: false, reason: 'data-unavailable' };
        }

        const result = resolveElSauzalZoneFromRecords(point, records);
        span.setAttribute('resultFields', result.ok ? 'ok' : result.reason);
        if (result.ok) span.setAttribute('zoneCode', result.resolution.zoneCode);
        span.setStatus({ code: SpanStatusCode.OK });
        return result;
    } catch (err) {
        span.setStatus({ code: SpanStatusCode.ERROR, message: (err as Error).message });
        console.warn('[el-sauzal-zone] unexpected error (non-fatal):', (err as Error)?.message ?? err);
        return { ok: false, reason: 'data-unavailable' };
    } finally {
        span.end();
    }
}
