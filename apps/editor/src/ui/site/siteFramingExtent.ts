// §SITE-FRAMING-EXTENT (founder 2026-08-07) — ONE site-scale extent that EVERY surface frames.
//
// THE DEFECT
// ----------
// At the moment the split reveals, the two panes showed the same site at scales roughly three
// orders of magnitude apart:
//   • LEFT (2D MapLibre)  — the whole Barcelona metropolitan area: Sant Cugat, Badalona, El Prat,
//                           the coastline. Tens of kilometres across.
//   • RIGHT (3D Cesium)   — a handful of façades at ~20 m range
//                           (`§GLOBE-FIT-BUILDING flyToBoundingSphere: radius 6.9 m, range 20 m`).
//
// ⚠ NEITHER PANE WAS FRAMING "THE SITE", AND THAT IS THE WHOLE BUG. They were each framing a
// different OBJECT, and both objects were the wrong one:
//   • the 2D pane fits the GEOCODE BBOX. For a city-level Nominatim result ("Barcelona") that bbox
//     is the ADMINISTRATIVE BOUNDARY OF THE MUNICIPALITY. `fitBounds` caps `maxZoom: 18` — a
//     ceiling, so a tiny bbox cannot over-zoom — but there was NO FLOOR, so a municipality bbox
//     zoomed all the way out and did exactly what it was told.
//   • the 3D pane fits the PLACED BUILDING's bounding sphere — a 7-metre object, or a default
//     10 × 8 m plot before the user has authored anything.
//
// So this is not "two zoom levels that need tuning". Tuning them independently is the shortcut,
// and it is a shortcut precisely because it leaves two authorities that will drift apart again the
// first time either object changes. The fix is a SHARED TARGET: one extent, derived once, that
// both cameras are computed from. After this, the panes cannot disagree without the extent itself
// being wrong — one thing to reason about instead of two.
//
// WHY A PURE MODULE
// -----------------
// The framing decision is arithmetic over a lat/lon and an optional ring. It needs no DOM, no
// MapLibre and no Cesium, and it is consumed by one surface that has each. Keeping it DOM-free
// means the coherence property ("both panes get the same extent") is directly assertable, in the
// same idiom as `siteRevealSequence.ts` and `siteEntryModel.ts`.
//
// P4: no globals. C12: WGS84 degrees in, WGS84 degrees out; no ENU frame is assumed.

import { trace } from '@opentelemetry/api';

const _tracer = trace.getTracer('pryzm.site.site-framing-extent');

/** Metres per degree of latitude. Spherical is ample at the few-hundred-metre scale this works at. */
const M_PER_DEG_LAT = 111_320;

/**
 * DEFAULT half-span, metres — the extent used when nothing better is known.
 *
 * ⚠ CHOSEN AS "THE SITE AND ITS IMMEDIATE STREET CONTEXT", not as a round number. 250 m each way
 * is a ~500 m square: an urban block and its neighbours, which is the scale at which a user can see
 * their plot AND judge how it sits. It also sits comfortably inside the near context ring
 * (`CONTEXT_BBOX_HALF_DEG` 0.008° ≈ 890 m), so everything the framing shows is backed by context
 * geometry that has actually been fetched — a wider default would frame ground we draw nothing on.
 */
export const SITE_FRAMING_HALF_M = 250;

/**
 * The widest half-span that may be called a SITE.
 *
 * ⚠ THIS IS THE CONSTANT THAT REJECTS THE MUNICIPALITY BBOX, and it is the load-bearing line in
 * this file. A geocode bbox is trusted ONLY when it is already site-scale — a house, an addressed
 * building, a small parcel. Anything wider is an administrative artefact that answers a different
 * question ("where is Barcelona") than the one the split is asking ("where is this site"), and it
 * is discarded rather than fitted. 600 m each way (~1.2 km across) is generous enough for a large
 * campus or an industrial parcel while still excluding any town.
 */
export const SITE_FRAMING_MAX_HALF_M = 600;

/**
 * The narrowest half-span. Framing a 10 × 8 m default plot at its own size is the 3D pane's
 * current failure — a wall of façades with no way to tell where you are. A site is always shown
 * with enough surroundings to be legible.
 */
export const SITE_FRAMING_MIN_HALF_M = 120;

/** How much room to leave around a committed boundary, as a multiple of its own half-span. */
const BOUNDARY_MARGIN = 1.6;

export interface LatLon {
    readonly lat: number;
    readonly lon: number;
}

/** Where the extent came from — carried so a log or a test can say WHY the framing is what it is. */
export type SiteFramingSource = 'boundary' | 'geocode-bbox' | 'default';

export interface SiteFramingExtent {
    readonly centreLat: number;
    readonly centreLon: number;
    /** `[west, south, east, north]` — the same shape MapLibre `fitBounds` and the context readers use. */
    readonly bbox: readonly [number, number, number, number];
    /** Half the north–south span, metres. The scale both cameras are derived from. */
    readonly halfSpanM: number;
    readonly source: SiteFramingSource;
}

export interface SiteFramingInput {
    /** The site anchor — the geocode result, or the resolved site origin. */
    readonly anchor: LatLon;
    /** The user's committed parcel ring, when there is one. The best possible answer. */
    readonly boundary?: readonly LatLon[] | null;
    /** The raw geocoder bbox `[w,s,e,n]`. Used ONLY when it is already site-scale — see above. */
    readonly geocodeBbox?: readonly [number, number, number, number] | null;
}

function clampHalfSpan(halfM: number): number {
    if (!Number.isFinite(halfM) || halfM <= 0) return SITE_FRAMING_HALF_M;
    return Math.max(SITE_FRAMING_MIN_HALF_M, Math.min(SITE_FRAMING_MAX_HALF_M, halfM));
}

/** A square-ish bbox of `halfSpanM` about a point. E/W is widened by latitude so the extent is
 *  metrically square rather than square in degrees. */
function bboxAbout(lat: number, lon: number, halfSpanM: number): readonly [number, number, number, number] {
    const dLat = halfSpanM / M_PER_DEG_LAT;
    const dLon = dLat / Math.max(0.2, Math.cos((lat * Math.PI) / 180));
    return [lon - dLon, lat - dLat, lon + dLon, lat + dLat];
}

/**
 * Resolve THE site framing extent. Deterministic, and total: every input yields a usable extent,
 * because a surface that cannot frame is a surface that renders nothing.
 *
 * Preference order, best evidence first:
 *   1. `boundary` — the user's own committed ring. It IS the site, so nothing beats it.
 *   2. `geocodeBbox` — but ONLY when already site-scale (`SITE_FRAMING_MAX_HALF_M`). A
 *      municipality bbox is rejected here; that rejection is the bug fix.
 *   3. `SITE_FRAMING_HALF_M` about the anchor.
 *
 * P8: carries an OTel span (the module's only exported function).
 */
export function resolveSiteFramingExtent(input: SiteFramingInput): SiteFramingExtent {
    const span = _tracer.startSpan('pryzm.site.site-framing-extent.resolve');
    try {
        const { anchor, boundary, geocodeBbox } = input;
        const anchorOk = Number.isFinite(anchor?.lat) && Number.isFinite(anchor?.lon);
        const lat0 = anchorOk ? anchor.lat : 0;
        const lon0 = anchorOk ? anchor.lon : 0;

        // 1) A committed boundary is the site itself.
        const ring = (boundary ?? []).filter((p) => Number.isFinite(p?.lat) && Number.isFinite(p?.lon));
        if (ring.length >= 3) {
            let minLat = Infinity, maxLat = -Infinity, minLon = Infinity, maxLon = -Infinity;
            for (const p of ring) {
                if (p.lat < minLat) minLat = p.lat;
                if (p.lat > maxLat) maxLat = p.lat;
                if (p.lon < minLon) minLon = p.lon;
                if (p.lon > maxLon) maxLon = p.lon;
            }
            const cLat = (minLat + maxLat) / 2;
            const cLon = (minLon + maxLon) / 2;
            const halfLatM = ((maxLat - minLat) / 2) * M_PER_DEG_LAT;
            const halfLonM = ((maxLon - minLon) / 2) * M_PER_DEG_LAT * Math.cos((cLat * Math.PI) / 180);
            // The LARGER axis governs, so a long thin plot is fully visible rather than cropped.
            const halfSpanM = clampHalfSpan(Math.max(halfLatM, halfLonM) * BOUNDARY_MARGIN);
            return { centreLat: cLat, centreLon: cLon, bbox: bboxAbout(cLat, cLon, halfSpanM), halfSpanM, source: 'boundary' };
        }

        // 2) A geocode bbox, but only if it is describing a SITE and not a municipality.
        if (geocodeBbox && geocodeBbox.every((n) => Number.isFinite(n))) {
            const [w, s, e, n] = geocodeBbox;
            const cLat = (s + n) / 2;
            const cLon = (w + e) / 2;
            const halfLatM = (Math.abs(n - s) / 2) * M_PER_DEG_LAT;
            const halfLonM = (Math.abs(e - w) / 2) * M_PER_DEG_LAT * Math.cos((cLat * Math.PI) / 180);
            const rawHalfM = Math.max(halfLatM, halfLonM);
            if (rawHalfM > 0 && rawHalfM <= SITE_FRAMING_MAX_HALF_M) {
                const halfSpanM = clampHalfSpan(rawHalfM);
                return { centreLat: cLat, centreLon: cLon, bbox: bboxAbout(cLat, cLon, halfSpanM), halfSpanM, source: 'geocode-bbox' };
            }
            // Too wide to be a site. ⚠ Fall through to the default AROUND THE ANCHOR — deliberately
            // NOT around the bbox centre, which for a municipality is its centroid and can be a
            // kilometre from the address the user actually typed.
        }

        // 3) Nothing better — a site-scale square about the anchor.
        return {
            centreLat: lat0,
            centreLon: lon0,
            bbox: bboxAbout(lat0, lon0, SITE_FRAMING_HALF_M),
            halfSpanM: SITE_FRAMING_HALF_M,
            source: 'default',
        };
    } finally {
        span.end();
    }
}

/**
 * The camera altitude, metres, that frames `halfSpanM` of ground for a camera looking straight
 * down with vertical field of view `fovDeg`.
 *
 * Exported so the 3D pane derives its altitude from the SAME extent the 2D pane fits, rather than
 * from a separately-chosen zoom — which is the coupling that let the two drift three orders of
 * magnitude apart. Cesium's default vertical FOV is 60°.
 */
export function altitudeForHalfSpan(halfSpanM: number, fovDeg = 60): number {
    const half = Math.max(1, halfSpanM);
    const t = Math.tan((Math.max(1, Math.min(179, fovDeg)) * Math.PI) / 360);
    return half / Math.max(1e-6, t);
}
