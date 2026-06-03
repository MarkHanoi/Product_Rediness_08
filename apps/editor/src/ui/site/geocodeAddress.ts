// A.8.a (Phase A · GIS authoring) — address geocoding service (HEADLESS core).
//
// WHY THIS EXISTS
// ---------------
// The RAC → site → design pipeline needs the founder's typed postal address to
// become a REAL lat/lon so the Cesium camera can fly there AND so the C19 Site's
// location is geographically anchored (`site.updateLocation`). Today the only
// path is the stub `createSiteFromRect()` console helper (A.7.c.x) which hardcodes
// lat/lon 0,0. This module is the first real GIS-authoring slice: a pure
// fetch+parse forward-geocoder.
//
// SELF-CONTAINED + L5-APPROPRIATE
// -------------------------------
// No THREE / Cesium / DOM import — just `fetch` + parse. That keeps the geocode
// CORE testable + reusable (a future `@pryzm/geocode` package can lift this
// verbatim). The Cesium camera-fly + `site.updateLocation` dispatch live in the
// SEARCH-BOX UI module (`siteGeocodeSearchBox.ts`), which imports this.
//
// PROVIDER — OpenStreetMap Nominatim
// ----------------------------------
// Nominatim's public JSON endpoint (`/search?format=json`). Per its usage policy:
//   - a descriptive User-Agent / Referer is REQUIRED, but those are forbidden
//     headers for browser `fetch` (the browser sets them) — so we rely on the
//     browser-supplied Referer (our origin) which satisfies the policy for a
//     low-volume interactive search box. We do NOT spoof headers.
//   - heavy / bulk use must self-host or use a commercial provider — the endpoint
//     is `GEOCODE_ENDPOINT`, a single const a future env var can override
//     (e.g. a self-hosted Nominatim or Mapbox shim) when volume grows.
//   - `limit=5` keeps the result list short + within fair-use.
//
// CSP NOTE (flagged in the build report, NOT silently changed):
//   `https://nominatim.openstreetmap.org` must be added to the server CSP
//   `connect-src` (server/securityHeaders.js → buildConnectSrc) or the browser
//   blocks the fetch in production. In dev the CSP is report-only so it works but
//   logs a violation. See GEOCODE_ORIGIN below.

/** The geocode provider base URL. Override target for a future env var
 *  (`VITE_GEOCODE_ENDPOINT`) once volume warrants a self-hosted / commercial
 *  provider. */
export const GEOCODE_ENDPOINT =
    (import.meta.env.VITE_GEOCODE_ENDPOINT as string | undefined) ??
    'https://nominatim.openstreetmap.org/search';

/** The origin that must be present in the server CSP `connect-src` allowlist
 *  for the geocode fetch to succeed under an enforced CSP. Surfaced as a const
 *  so the wiring is discoverable + the build report can cite it. */
export const GEOCODE_ORIGIN = (() => {
    try {
        return new URL(GEOCODE_ENDPOINT).origin;
    } catch {
        return 'https://nominatim.openstreetmap.org';
    }
})();

/** One forward-geocode hit. `bbox` is `[west, south, east, north]` (lon/lat
 *  degrees) when the provider supplies a bounding box — used to frame the Cesium
 *  camera to the whole feature rather than a bare point. */
export interface GeocodeResult {
    readonly displayName: string;
    readonly lat: number;
    readonly lon: number;
    readonly bbox?: [number, number, number, number];
}

/** The raw Nominatim JSON row shape (only the fields we read). */
interface NominatimRow {
    readonly display_name?: unknown;
    readonly lat?: unknown;
    readonly lon?: unknown;
    /** Nominatim returns `[south, north, west, east]` as STRINGS. */
    readonly boundingbox?: unknown;
}

function toNum(v: unknown): number | null {
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    if (typeof v === 'string') {
        const n = Number.parseFloat(v);
        return Number.isFinite(n) ? n : null;
    }
    return null;
}

/**
 * Map a Nominatim `boundingbox` (`[south, north, west, east]` as strings) to our
 * `[west, south, east, north]` (lon/lat) convention. Returns undefined if any
 * component is missing / unparseable.
 */
function parseBbox(raw: unknown): [number, number, number, number] | undefined {
    if (!Array.isArray(raw) || raw.length < 4) return undefined;
    const south = toNum(raw[0]);
    const north = toNum(raw[1]);
    const west = toNum(raw[2]);
    const east = toNum(raw[3]);
    if (south === null || north === null || west === null || east === null) {
        return undefined;
    }
    return [west, south, east, north];
}

/**
 * Forward-geocode a free-form address / place query to up to 5 candidate
 * locations. PURE fetch + parse — no UI, no map, no DOM.
 *
 * Resolves to an empty array on: empty query, network error, non-OK response,
 * non-array / malformed JSON. Never throws — the UI decides how to surface
 * "no results". Logs a `[gis]` line on every call for observability.
 *
 * @param query  free-form postal address or place name (PII per C22 once stored)
 * @returns      ordered candidate list (best match first per the provider)
 */
export async function geocodeAddress(query: string): Promise<GeocodeResult[]> {
    const q = (query ?? '').trim();
    if (!q) {
        console.log('[gis] geocodeAddress: empty query — skipping');
        return [];
    }

    const url =
        `${GEOCODE_ENDPOINT}?format=json&limit=5&addressdetails=0&` +
        `q=${encodeURIComponent(q)}`;
    console.log('[gis] geocodeAddress: querying', GEOCODE_ORIGIN, 'for', JSON.stringify(q));

    let res: Response;
    try {
        res = await fetch(url, {
            method: 'GET',
            headers: { Accept: 'application/json' },
        });
    } catch (err) {
        console.warn('[gis] geocodeAddress: network error', err);
        return [];
    }

    if (!res.ok) {
        console.warn('[gis] geocodeAddress: provider returned', res.status, res.statusText);
        return [];
    }

    let json: unknown;
    try {
        json = await res.json();
    } catch (err) {
        console.warn('[gis] geocodeAddress: response was not JSON', err);
        return [];
    }

    if (!Array.isArray(json)) {
        console.warn('[gis] geocodeAddress: unexpected response shape (not an array)');
        return [];
    }

    const results: GeocodeResult[] = [];
    for (const row of json as NominatimRow[]) {
        const lat = toNum(row.lat);
        const lon = toNum(row.lon);
        if (lat === null || lon === null) continue;
        const displayName =
            typeof row.display_name === 'string' && row.display_name.length > 0
                ? row.display_name
                : `${lat.toFixed(5)}, ${lon.toFixed(5)}`;
        results.push({
            displayName,
            lat,
            lon,
            bbox: parseBbox(row.boundingbox),
        });
    }

    console.log(`[gis] geocodeAddress: ${results.length} result(s) for ${JSON.stringify(q)}`);
    return results;
}
