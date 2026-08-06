// §NEARBY-HEIGHT-SUGGESTION (2026-08-05) — admin-only convenience: suggest a Córdoba zone family
// from the REAL nearby OSM building heights, for `ManualAdminZonePanel.ts` to pre-select in its
// dropdown. See that panel's own header for the scope (3 allowlisted admin emails only).
//
// DATA SOURCE DECISION — reuses `fetchContextBuildings` (`../geospatial/contextBuildings.ts`)
// UNCHANGED. That module already:
//   • fetches real OSM building footprints (keyless Overpass, via the same-origin `/api/overpass`
//     proxy, §OVERPASS-PROXY) or the baked-PMTiles reader when tiles are enabled for the area
//     (§CTX-PMTILES-READER) — the exact same source the 3D Site context already renders from.
//   • resolves each footprint's height WITH a provenance tag (`heightProvenance`): `measured-lidar` /
//     `tagged` / `derived-levels` are REAL data; `assumed` is a fabricated 9 m default with NOTHING
//     tagged. §CTX-HEIGHT-PROVENANCE (L-459) is the load-bearing honesty rule this module leans on.
// `CesiumViewport.ts` consumes this same module for its own extrusion — there is no second data
// source invented here, and no reimplementation of Overpass/OSM parsing.
//
// WHY NOT EXTRACT FROM CesiumViewport.ts DIRECTLY: the height DATA already lives one layer below
// the render file, in `contextBuildings.ts` (a focused, already-independent, already-unit-testable
// module with zero Cesium/THREE/DOM coupling). `fetchContextBuildings` is a plain async function
// with no viewer-instance state — importing it here requires no extraction and no coupling into
// `CesiumViewport.ts`'s (huge) rendering internals at all.
//
// HONESTY (§CONTEXT-DATA-HONESTY family):
//   • `heightProvenance === 'assumed'` samples are EXCLUDED from the aggregate — an admin asking
//     "what does OSM really say nearby buildings are" must never have fabricated 9 m defaults
//     silently pull the median toward a made-up number.
//   • Zero real (non-assumed) samples within the radius ⇒ return `null`. The caller (the panel)
//     MUST leave its dropdown exactly as it is today (blank placeholder) rather than show a guess.
//   • Any fetch/network failure ⇒ `null`, never a fabricated fallback. NEVER THROWS.
//   • The returned aggregate + sample count are the REAL numbers found — nothing here manufactures
//     a confidence score; the panel cites the median + count plainly.

import { trace, SpanStatusCode } from '@opentelemetry/api';
import { fetchContextBuildings, type ContextBuildingCollection } from '../geospatial/contextBuildings';

const tracer = trace.getTracer('pryzm.ui.nearby-building-height-suggestion');

/** The subset of a known zone-code option this module needs to pick the closest match. */
export interface HeightSuggestionZoneOption {
    readonly code: string;
    /** The rule pack's real `maxHeight_m` for this zone code. Options with a null/unknown
     *  `maxHeight_m` (e.g. Manzana Cerrada's per-street-width table) must be filtered out by the
     *  caller before calling this function — there is nothing to compare a median height against. */
    readonly maxHeight_m: number;
}

export interface NearbyHeightSuggestion {
    /** The zone code whose real `maxHeight_m` is closest to the real nearby median. */
    readonly suggestedCode: string;
    /** The REAL median height (m) computed from non-fabricated nearby footprints. */
    readonly medianHeightM: number;
    /** The REAL count of non-fabricated (measured/tagged/derived-levels) footprints used. */
    readonly sampleCount: number;
}

/** Injectable deps — tests supply a fake fetch-buildings function. */
export interface NearbyHeightSuggestionDeps {
    readonly fetchBuildings?: typeof fetchContextBuildings;
    /** Search radius, metres. Defaults to 80 m — inside "reasonable radius" (50-100 m) the brief asks for. */
    readonly radiusM?: number;
}

const DEFAULT_RADIUS_M = 80;
const EARTH_RADIUS_M = 6371000;

function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const toRad = (d: number): number => (d * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
    return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(a)));
}

/** Centroid (lon,lat) of a GeoJSON ring's distinct vertices (drops the closing duplicate). */
function ringCentroidLonLat(ring: readonly (readonly number[])[]): { lon: number; lat: number } | null {
    if (!Array.isArray(ring) || ring.length < 3) return null;
    const first = ring[0]!;
    const last = ring[ring.length - 1]!;
    const closed = first[0] === last[0] && first[1] === last[1];
    const pts = closed ? ring.slice(0, -1) : ring;
    if (pts.length === 0) return null;
    let sx = 0, sy = 0;
    for (const p of pts) { sx += p[0]!; sy += p[1]!; }
    return { lon: sx / pts.length, lat: sy / pts.length };
}

function median(values: number[]): number {
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0 ? (sorted[mid - 1]! + sorted[mid]!) / 2 : sorted[mid]!;
}

/** Real (non-fabricated) height provenance rungs — §CTX-HEIGHT-PROVENANCE (L-459). Absent (older
 *  cached data) or `'assumed'` are excluded: those are NOT real samples about this neighbourhood. */
const REAL_HEIGHT_PROVENANCE = new Set(['measured-lidar', 'tagged', 'derived-levels']);

/**
 * Suggest the closest-matching Córdoba zone code from REAL nearby building heights.
 *
 * NEVER THROWS. Returns `null` (no suggestion) when: the point is invalid, `knownOptions` is
 * empty, the fetch fails, or zero REAL (non-fabricated) height samples are found within the
 * radius — never a fabricated guess (§CONTEXT-DATA-HONESTY).
 *
 * PURE-ish: the only I/O is the injected/default `fetchContextBuildings` call; everything else
 * (distance filter, median, closest-match) is deterministic given its input.
 */
export async function suggestZoneFromNearbyHeights(
    lat: number,
    lon: number,
    knownOptions: ReadonlyArray<HeightSuggestionZoneOption>,
    deps: NearbyHeightSuggestionDeps = {},
): Promise<NearbyHeightSuggestion | null> {
    const span = tracer.startSpan('pryzm.ui.nearby_building_height_suggestion.suggest');
    try {
        if (!Number.isFinite(lat) || !Number.isFinite(lon) || knownOptions.length === 0) {
            span.setAttribute('result', 'invalid-input');
            span.setStatus({ code: SpanStatusCode.OK });
            return null;
        }
        const radiusM = deps.radiusM ?? DEFAULT_RADIUS_M;
        const fetchBuildings = deps.fetchBuildings ?? fetchContextBuildings;

        let collection: ContextBuildingCollection;
        try {
            collection = await fetchBuildings(lat, lon);
        } catch (err) {
            console.warn('[nearby-height-suggestion] fetch failed (non-fatal):', (err as Error)?.message ?? err);
            span.setAttribute('result', 'fetch-failed');
            span.setStatus({ code: SpanStatusCode.OK });
            return null;
        }
        if (!collection || !Array.isArray(collection.features)) {
            span.setAttribute('result', 'no-collection');
            span.setStatus({ code: SpanStatusCode.OK });
            return null;
        }

        const realHeights: number[] = [];
        for (const f of collection.features) {
            const prov = f.properties.heightProvenance;
            if (!prov || !REAL_HEIGHT_PROVENANCE.has(prov)) continue; // exclude fabricated/unknown
            const centroid = ringCentroidLonLat(f.geometry?.coordinates?.[0] ?? []);
            if (!centroid) continue;
            const distM = haversineMeters(lat, lon, centroid.lat, centroid.lon);
            if (distM > radiusM) continue;
            if (typeof f.properties.heightM === 'number' && Number.isFinite(f.properties.heightM)) {
                realHeights.push(f.properties.heightM);
            }
        }

        if (realHeights.length === 0) {
            span.setAttribute('result', 'no-real-samples');
            span.setStatus({ code: SpanStatusCode.OK });
            return null; // genuine data gap — never guess
        }

        const medianHeightM = median(realHeights);
        let best = knownOptions[0]!;
        let bestDiff = Math.abs(best.maxHeight_m - medianHeightM);
        for (const opt of knownOptions.slice(1)) {
            const diff = Math.abs(opt.maxHeight_m - medianHeightM);
            if (diff < bestDiff) { best = opt; bestDiff = diff; }
        }

        span.setAttribute('result', 'ok');
        span.setAttribute('suggestedCode', best.code);
        span.setAttribute('medianHeightM', medianHeightM);
        span.setAttribute('sampleCount', realHeights.length);
        span.setStatus({ code: SpanStatusCode.OK });
        return { suggestedCode: best.code, medianHeightM, sampleCount: realHeights.length };
    } catch (err) {
        span.setStatus({ code: SpanStatusCode.ERROR, message: (err as Error)?.message ?? String(err) });
        console.warn('[nearby-height-suggestion] unexpected error (non-fatal):', (err as Error)?.message ?? err);
        return null;
    } finally {
        span.end();
    }
}
