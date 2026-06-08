// MAP-DATA-OVERTURE — keyless context-building footprint loader (OSM / Overpass).
//
// WHY THIS EXISTS
// ---------------
// The founder ratified "Overture + Cesium (free)": the 2D plan + the Cesium Forma
// view must show RICH surrounding buildings so a massing study has proper context
// and shadows (Archistar / Autodesk-Forma style). The base map's own `building`
// source-layer (OpenFreeMap, OpenMapTiles schema) is GENERALIZED and SPARSE — many
// real footprints are missing, and it carries no per-building height we can trust.
//
// DATA-PATH DECISION (honest, keyless-first)
// ------------------------------------------
// Overture Maps ships its Buildings theme as GeoParquet on S3/Azure — NOT
// browser-friendly. There is no official, stable, keyless, CDN-hosted Overture
// vector/PMTiles endpoint a browser can point MapLibre/Cesium at directly today.
// (Community PMTiles builds exist but are unstable planet-scale files, and keyed
// providers were excluded by the "free/keyless" mandate.)
//
// Overture's Buildings theme is LARGELY OSM-DERIVED. So the pragmatic, robust,
// KEYLESS path that still vastly beats OpenFreeMap's sparse coverage is to fetch
// the raw OSM building footprints for the current viewport bbox from the public
// **Overpass API** — keyless, free, global, and it returns the `height` /
// `building:levels` tags we need for extrusion. We convert the Overpass JSON to a
// GeoJSON FeatureCollection that BOTH viewers consume (2D MapLibre `geojson`
// source; 3D Cesium extruded `PolygonGraphics`).
//
// KEYED-OVERTURE UPGRADE (one-line swap)
// --------------------------------------
// When a keyed Overture provider (or a self-hosted Overture PMTiles build) is
// adopted, the ONLY change is to replace `fetchContextBuildings`'s body with a
// fetch of that provider's bbox GeoJSON (or to point a `pmtiles://` source at it
// in the style). The consumers (2D layers + 3D extruder) already speak GeoJSON
// with `{ heightM }` properties, so nothing downstream changes. See OVERTURE_SWAP
// note below.
//
// GUARDS
// ------
// Offline / endpoint down / no features → resolves to an EMPTY FeatureCollection
// (callers then render nothing — today's behaviour) and logs once with a `[gis]`
// prefix. Never throws. A small per-bbox in-memory cache avoids refetching as the
// user pans within the same tile.

/** A building footprint ready for 2D fill + 3D extrusion. */
export interface ContextBuildingFeature {
    readonly type: 'Feature';
    readonly geometry: {
        readonly type: 'Polygon';
        /** GeoJSON ring(s): [ [ [lon,lat], … ] ] — outer ring first. */
        readonly coordinates: number[][][];
    };
    readonly properties: {
        /** Extrusion height in metres (resolved from height / building:levels). */
        readonly heightM: number;
        /** OSM id (debug / dedupe). */
        readonly osmId: number;
    };
}

export interface ContextBuildingCollection {
    readonly type: 'FeatureCollection';
    readonly features: ContextBuildingFeature[];
}

/** A lon/lat bounding box `[west, south, east, north]`. */
export type Bbox = readonly [number, number, number, number];

/**
 * Public Overpass endpoint (keyless). Mirror list — we try them in order so a
 * single mirror being down doesn't kill context buildings. All keyless + CORS-
 * enabled. Overture-keyed swap: replace the whole `fetchContextBuildings` body.
 */
const OVERPASS_ENDPOINTS = [
    'https://overpass-api.de/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter',
    // §A.21.D-GLOBE2 (2026-06-05) — extra keyless CORS mirrors so heavy testing that
    // rate-limits (429) the primary still gets context buildings from a fallback.
    'https://overpass.private.coffee/api/interpreter',
    'https://overpass.osm.jp/api/interpreter',
] as const;

/** The origin(s) that must appear in the server CSP `connect-src` for fetch. */
export const OVERPASS_ORIGINS = [
    'https://overpass-api.de',
    'https://overpass.kumi.systems',
    'https://overpass.private.coffee',
    'https://overpass.osm.jp',
] as const;

/** Assumed storey height (m) when only `building:levels` is known. */
const METRES_PER_LEVEL = 3.1;
/** Fallback height (m) for a footprint with no height/levels tag at all. */
const DEFAULT_BUILDING_HEIGHT_M = 9;
/** Clamp so a stray bad tag can't produce a skyscraper or a zero-height sliver. */
const MIN_HEIGHT_M = 2.5;
const MAX_HEIGHT_M = 400;

/**
 * Half-extent (degrees) of the bbox we fetch around the site centre.
 *
 * §A.21.D43(b) — widened 0.005 → 0.0125 (~±550 m → ~±1.4 km, a ~2.8 km square,
 * i.e. ≈2.5× the old extent / ≈6× the area) so the Forma context reads as a real
 * surrounding NEIGHBOURHOOD instead of a small square of immediate neighbours
 * (founder: "context dataset too small"). 2.5× keeps the Overpass `way["building"]`
 * fetch well-sized — a ~2.8 km urban tile is a few thousand footprints, comfortably
 * inside the public-endpoint timeout — without becoming a city-scale pathological
 * query. The bbox values feed `bboxKey` (toFixed(4)) so a larger extent is simply a
 * NEW cache key; the 7-day localStorage TTL + 4-mirror fallback are unchanged (old
 * smaller-bbox entries just age out, they are never read for the new key).
 */
export const CONTEXT_BBOX_HALF_DEG = 0.0125;

/** Overpass request timeout (ms) — keep short so the UI never hangs on it. */
const OVERPASS_TIMEOUT_MS = 9000;

/** Per-bbox-key cache so panning within a tile doesn't refetch. */
const cache = new Map<string, ContextBuildingCollection>();
/** One-time "context buildings unavailable" warning guard. */
let warnedOnce = false;

/** Build a stable cache key from a bbox rounded to the fetch grid. */
function bboxKey(bbox: Bbox): string {
    return bbox.map((n) => n.toFixed(4)).join(',');
}

// §A.21.D-GLOBE2 — PERSISTENT cache (localStorage). The in-memory `cache` is lost on
// every reload / new project, so repeated testing re-fetches the SAME bbox and
// exhausts the public Overpass rate limit (founder: context buildings vanished after
// many generations). Persisting footprints for 7 days means a re-visited site loads
// instantly + offline, with zero Overpass calls. Best-effort: quota / private-mode
// failures are swallowed.
const LS_PREFIX = 'pryzm:ctxbld:';
const LS_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function lsRead(key: string): ContextBuildingCollection | null {
    try {
        const raw = globalThis.localStorage?.getItem(LS_PREFIX + key);
        if (!raw) return null;
        const o = JSON.parse(raw) as { t: number; c: ContextBuildingCollection };
        if (!o || typeof o.t !== 'number' || (Date.now() - o.t) > LS_TTL_MS) return null;
        return o.c;
    } catch { return null; }
}

function lsWrite(key: string, c: ContextBuildingCollection): void {
    try {
        globalThis.localStorage?.setItem(LS_PREFIX + key, JSON.stringify({ t: Date.now(), c }));
    } catch { /* quota / unavailable — non-fatal */ }
}

/** Compute the fetch bbox `[w,s,e,n]` centred on a site lat/lon. */
export function contextBboxAround(lat: number, lon: number): Bbox {
    const h = CONTEXT_BBOX_HALF_DEG;
    // Widen E/W a touch by latitude so the metric extent is roughly square.
    const lonScale = 1 / Math.max(0.2, Math.cos((lat * Math.PI) / 180));
    return [lon - h * lonScale, lat - h, lon + h * lonScale, lat + h];
}

/** Resolve an extrusion height (m) from OSM tags. */
function resolveHeight(tags: Record<string, string> | undefined): number {
    if (tags) {
        const h = parseFloat(tags['height'] ?? tags['building:height'] ?? '');
        if (Number.isFinite(h) && h > 0) return clampHeight(h);
        const lvl = parseFloat(tags['building:levels'] ?? tags['levels'] ?? '');
        if (Number.isFinite(lvl) && lvl > 0) return clampHeight(lvl * METRES_PER_LEVEL);
    }
    return DEFAULT_BUILDING_HEIGHT_M;
}

function clampHeight(h: number): number {
    return Math.min(MAX_HEIGHT_M, Math.max(MIN_HEIGHT_M, h));
}

/** The Overpass QL query for all building footprints in a bbox (geometry inline). */
function overpassQuery(bbox: Bbox): string {
    const [w, s, e, n] = bbox;
    const b = `${s},${w},${n},${e}`; // Overpass bbox order = south,west,north,east
    return (
        `[out:json][timeout:25];` +
        `(way["building"](${b});relation["building"]["type"="multipolygon"](${b}););` +
        `out geom;`
    );
}

/**
 * Minimal shape of the Overpass `out geom` JSON we read. `way` elements carry an
 * inline `geometry` array of {lat,lon}; multipolygon relations carry `members`
 * each with their own `geometry`. We only render the outer rings (good enough for
 * context massing — holes are cosmetic at this scale).
 */
interface OverpassElement {
    type: 'way' | 'relation' | 'node';
    id: number;
    tags?: Record<string, string>;
    geometry?: Array<{ lat: number; lon: number }>;
    members?: Array<{
        type: string;
        role?: string;
        geometry?: Array<{ lat: number; lon: number }>;
    }>;
}

/** Convert an Overpass response to our GeoJSON FeatureCollection (outer rings). */
function overpassToCollection(elements: OverpassElement[]): ContextBuildingCollection {
    const features: ContextBuildingFeature[] = [];
    const push = (
        geom: Array<{ lat: number; lon: number }> | undefined,
        tags: Record<string, string> | undefined,
        id: number,
    ): void => {
        if (!geom || geom.length < 4) return; // need a closed ring (≥3 pts + close)
        const ring = geom.map((p) => [p.lon, p.lat] as [number, number]);
        // Ensure the ring is closed.
        const first = ring[0]!;
        const last = ring[ring.length - 1]!;
        if (first[0] !== last[0] || first[1] !== last[1]) ring.push([first[0], first[1]]);
        features.push({
            type: 'Feature',
            geometry: { type: 'Polygon', coordinates: [ring] },
            properties: { heightM: resolveHeight(tags), osmId: id },
        });
    };

    for (const el of elements) {
        if (el.type === 'way') {
            push(el.geometry, el.tags, el.id);
        } else if (el.type === 'relation' && el.members) {
            for (const m of el.members) {
                if (m.role === 'outer') push(m.geometry, el.tags, el.id);
            }
        }
    }
    return { type: 'FeatureCollection', features };
}

/** An empty collection — the resting / fallback state. */
export function emptyContextCollection(): ContextBuildingCollection {
    return { type: 'FeatureCollection', features: [] };
}

/**
 * Fetch context building footprints for the bbox around `lat,lon` (keyless OSM via
 * Overpass). Cached per bbox. NEVER throws — on any failure (offline, endpoint
 * down, abort, no features) resolves to an EMPTY collection and logs once. The
 * `signal` lets a caller cancel an in-flight fetch on dispose / location change.
 *
 * OVERTURE_SWAP: to upgrade to a keyed Overture provider, replace the fetch loop
 * below with a single `fetch(overtureProviderUrl(bbox))` that returns GeoJSON, map
 * its height field to `properties.heightM`, and keep the rest of this module + both
 * consumers unchanged.
 */
export async function fetchContextBuildings(
    lat: number,
    lon: number,
    signal?: AbortSignal,
): Promise<ContextBuildingCollection> {
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || (lat === 0 && lon === 0)) {
        return emptyContextCollection();
    }
    const bbox = contextBboxAround(lat, lon);
    const key = bboxKey(bbox);
    const cached = cache.get(key);
    if (cached) return cached;
    // §A.21.D-GLOBE2 — persistent cache hit (survives reload / new project), so a
    // re-visited site loads its context buildings without another Overpass call.
    const persisted = lsRead(key);
    if (persisted) { cache.set(key, persisted); return persisted; }

    const body = 'data=' + encodeURIComponent(overpassQuery(bbox));

    for (const endpoint of OVERPASS_ENDPOINTS) {
        // Per-endpoint timeout, also honouring a caller abort.
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), OVERPASS_TIMEOUT_MS);
        const onAbort = (): void => ctrl.abort();
        signal?.addEventListener('abort', onAbort, { once: true });
        try {
            const res = await fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body,
                signal: ctrl.signal,
            });
            if (!res.ok) {
                console.warn(`[gis] context buildings: ${endpoint} HTTP ${res.status} — trying next mirror.`);
                continue;
            }
            const json = (await res.json()) as { elements?: OverpassElement[] };
            const collection = overpassToCollection(json.elements ?? []);
            cache.set(key, collection);
            if (collection.features.length > 0) lsWrite(key, collection); // persist non-empty results
            console.log(
                `[gis] context buildings: ${collection.features.length} OSM footprint(s) ` +
                    `for bbox ${key} via ${new URL(endpoint).host}.`,
            );
            return collection;
        } catch (e) {
            if (signal?.aborted) {
                // Caller cancelled (dispose / new location) — not a failure; bail quietly.
                return emptyContextCollection();
            }
            console.warn(`[gis] context buildings: ${endpoint} fetch failed — trying next mirror:`, e);
        } finally {
            clearTimeout(timer);
            signal?.removeEventListener('abort', onAbort);
        }
    }

    // All mirrors failed → degrade to no context buildings (today's behaviour).
    if (!warnedOnce) {
        warnedOnce = true;
        console.warn(
            '[gis] context buildings unavailable (all Overpass mirrors failed/offline) — ' +
                'rendering without surrounding context. This is non-fatal.',
        );
    }
    return emptyContextCollection();
}

/** Test/diagnostic helper — clears the per-bbox cache. */
export function clearContextBuildingCache(): void {
    cache.clear();
}
