// FORMA-CTX (tracker §22.2) — keyless OSM road centre-lines (Overpass).
//
// Sibling of contextBuildings.ts: fetches `way[highway]` for the site bbox and
// returns open lon/lat polylines for the Forma scene to draw as thin grey roads.
// Reuses the SAME Overpass mirror list, timeout, cache + never-throw contract.
// Pedestrian ways (footway/path/steps/cycleway) are bucketed separately so the
// next slice can draw them green without a second fetch. Visual-only — never
// touches the BIM model or the layout engine.

import {
    OVERPASS_ENDPOINTS, OVERPASS_TIMEOUT_MS,
    contextBboxAround, CONTEXT_BBOX_HALF_DEG,
    fetchOverpassViaProxy,
    type Bbox,
} from './contextBuildings';
import { readContextTileFeatures, type ContextTileFeature } from './contextTiles';
import { scopeReadFanOutCap } from './contextExtentBudget';

export interface ContextWay {
    /** Polyline as [lon,lat] pairs (open way — NOT a closed ring). */
    readonly coords: ReadonlyArray<readonly [number, number]>;
    /** 'road' (motorway…residential/service) or 'pedestrian' (footway/path/steps/cycleway). */
    readonly kind: 'road' | 'pedestrian';
    /** §FORMA-CTX-ROAD-RIBBON — the raw OSM `highway` class (e.g. 'motorway',
     *  'primary', 'residential', 'service'), used to width-scale the ground ribbon so
     *  major roads read wider than side streets, matching a real street map. */
    readonly highway: string;
    readonly osmId: number;
}
export interface ContextRoadCollection {
    readonly type: 'ContextRoadCollection';
    readonly ways: ContextWay[];
}

const PEDESTRIAN = new Set(['footway', 'path', 'steps', 'cycleway', 'pedestrian', 'track']);

const cache = new Map<string, ContextRoadCollection>();
/**
 * §L-323 FIX B (SS-FIX-FORMA-SITE-SINGLE-EXPORT-AND-CONTEXT-CACHE) — per-bbox IN-FLIGHT promise
 * cache, mirroring the buildings loader. Two consumers requesting the SAME bbox while a fetch is
 * still running (e.g. the 3D Forma context + the 2D map context, or a rapid globe↔forma re-entry)
 * share the ONE pending Overpass request instead of racing a duplicate POST that only feeds the
 * public mirrors' 429 rate limiter.
 */
const inFlight = new Map<string, Promise<ContextRoadCollection>>();
let warnedOnce = false;

function bboxKey(b: Bbox): string { return 'roads:' + b.map((n) => n.toFixed(4)).join(','); }

function overpassRoadQuery(bbox: Bbox): string {
    const [w, s, e, n] = bbox;
    const b = `${s},${w},${n},${e}`;
    return `[out:json][timeout:25];(way["highway"](${b}););out geom;`;
}

interface OverpassWay {
    type: string; id: number;
    tags?: Record<string, string>;
    geometry?: Array<{ lat: number; lon: number }>;
}

export function emptyRoadCollection(): ContextRoadCollection {
    return { type: 'ContextRoadCollection', ways: [] };
}

/** Parse the Overpass `out geom` elements into road/pedestrian polylines. Shared
 *  by the §OVERPASS-PROXY path and the direct-mirror fallback below. */
function roadsFromElements(elements: OverpassWay[]): ContextRoadCollection {
    const ways: ContextWay[] = [];
    for (const el of elements) {
        if (el.type !== 'way' || !el.geometry || el.geometry.length < 2) continue;
        const hw = el.tags?.['highway'] ?? '';
        ways.push({
            coords: el.geometry.map((p) => [p.lon, p.lat] as const),
            kind: PEDESTRIAN.has(hw) ? 'pedestrian' : 'road',
            highway: hw,
            osmId: el.id,
        });
    }
    return { type: 'ContextRoadCollection', ways };
}

/**
 * §CTX-PMTILES-READER (L-513b) — convert the baked-tile road features into the same `ContextWay[]`
 * shape `roadsFromElements` produces. The reader keeps LINEAR geometry for roads
 * (LAYER_IS_AREAL.roads = false), so each feature's `rings` are its linestring(s); one `ContextWay`
 * per strand. `kind` is classified from the `highway` tag via the SAME `PEDESTRIAN` set the Overpass
 * path uses, so footway/path/steps/cycleway bucket as 'pedestrian' for free. `osmId` is derived from
 * the tile's stable synthetic id (spaced by 16 so multi-strand features never collide).
 */
function roadsFromTileFeatures(features: ContextTileFeature[]): ContextRoadCollection {
    const ways: ContextWay[] = [];
    for (const f of features) {
        const hw = f.tags['highway'] ?? '';
        const kind: 'road' | 'pedestrian' = PEDESTRIAN.has(hw) ? 'pedestrian' : 'road';
        for (let ri = 0; ri < f.rings.length; ri++) {
            const ring = f.rings[ri]!;
            if (ring.length < 2) continue;
            ways.push({
                coords: ring.map((p) => [p[0]!, p[1]!] as const),
                kind,
                highway: hw,
                osmId: f.syntheticId * 16 + ri,
            });
        }
    }
    return { type: 'ContextRoadCollection', ways };
}

export async function fetchContextRoads(
    lat: number, lon: number, signal?: AbortSignal,
    /** §SITE-SCOPE F-2 (C12 §13.1) — the scope-derived half-extent; defaults to the near read. */
    halfDeg: number = CONTEXT_BBOX_HALF_DEG,
): Promise<ContextRoadCollection> {
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || (lat === 0 && lon === 0)) {
        return emptyRoadCollection();
    }
    const bbox = contextBboxAround(lat, lon, halfDeg);
    const key = bboxKey(bbox);
    const hit = cache.get(key);
    if (hit) return hit;
    // §L-323 FIX B — share ONE in-flight request per bbox across concurrent consumers.
    const pending = inFlight.get(key);
    if (pending) return pending;
    const p = fetchRoadsForBbox(bbox, key, signal, scopeReadFanOutCap(halfDeg)).finally(() => { inFlight.delete(key); });
    inFlight.set(key, p);
    return p;
}

/**
 * §L-323 FIX B — the actual Overpass fetch for ONE bbox (same-origin proxy → direct-mirror
 * fallback), shared via the `inFlight` map so concurrent callers dedupe to one request. Populates
 * the in-memory `cache` on success. NEVER throws — any failure resolves to an empty collection.
 */
async function fetchRoadsForBbox(
    bbox: Bbox, key: string, signal?: AbortSignal,
    /** §SITE-SCOPE F-2 — the scope-range fan-out cap (`scopeReadFanOutCap`), or the layer default. */
    fanOutCap?: number,
): Promise<ContextRoadCollection> {
    // §CTX-PMTILES-READER (L-513b) — THE BAKED TILES COME FIRST, mirroring contextBuildings. We fall
    // back to Overpass ONLY on a real read failure (`unavailable`); an honest empty `ok` result is an
    // ANSWER and must NOT re-ask the third party (§CONTEXT-DATA-HONESTY). `aborted` = the caller
    // cancelled → render nothing and let the newer request paint (§L-579). `disabled` (no tiles URL)
    // simply falls through to the Overpass path below unchanged.
    const tiled = await readContextTileFeatures('roads', bbox, signal, { fanOutCap });
    if (tiled.status === 'ok') {
        const collection = roadsFromTileFeatures(tiled.features);
        cache.set(key, collection);
        console.log(
            `[gis] §CTX-PMTILES-READER roads: ${collection.ways.length} way(s) from ` +
                `${tiled.tilesRead} baked tile(s) in ${tiled.ms} ms — no Overpass call.`,
        );
        return collection;
    }
    if (tiled.status === 'aborted') return emptyRoadCollection();
    if (tiled.status === 'unavailable') {
        console.warn(
            `[gis] §CTX-PMTILES-READER roads: tiles configured but unreadable (${tiled.reason}) ` +
                '— falling back to live Overpass. This is a DEGRADED path, not the intended one.',
        );
    }

    const query = overpassRoadQuery(bbox);

    // §OVERPASS-PROXY — same-origin proxy FIRST (shared server cache dodges the
    // per-browser 429). `null` = proxy unreachable → direct-mirror fallback below.
    const viaProxy = await fetchOverpassViaProxy<OverpassWay>(query, signal);
    if (signal?.aborted) return emptyRoadCollection();
    if (viaProxy) {
        const collection = roadsFromElements(viaProxy.elements ?? []);
        cache.set(key, collection);
        console.log(`[gis] context roads: ${collection.ways.length} way(s) for bbox ${key} via /api/overpass proxy.`);
        return collection;
    }

    const body = 'data=' + encodeURIComponent(query);
    for (const endpoint of OVERPASS_ENDPOINTS) {
        // §GIS-ABORT-REASON (founder 2026-06-11) — explicit reasons so the console reads
        // "Overpass timeout" / "caller cancelled" instead of "aborted without reason"
        // (non-fatal graceful-degrade; roads context is skipped, the scene still renders).
        const ctrl = new AbortController();
        const timer = setTimeout(
            () => ctrl.abort(new DOMException(`Overpass timeout after ${OVERPASS_TIMEOUT_MS}ms (mirror slow/rate-limited)`, 'TimeoutError')),
            OVERPASS_TIMEOUT_MS,
        );
        const onAbort = (): void => ctrl.abort(new DOMException('caller cancelled (view/location change)', 'AbortError'));
        signal?.addEventListener('abort', onAbort, { once: true });
        try {
            const res = await fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body, signal: ctrl.signal,
            });
            if (!res.ok) {
                console.warn(`[gis] context roads: ${endpoint} HTTP ${res.status} — next mirror.`);
                continue;
            }
            const json = (await res.json()) as { elements?: OverpassWay[] };
            const collection = roadsFromElements(json.elements ?? []);
            cache.set(key, collection);
            console.log(`[gis] context roads: ${collection.ways.length} way(s) for bbox ${key} via ${new URL(endpoint).host}.`);
            return collection;
        } catch (e) {
            if (signal?.aborted) return emptyRoadCollection();
            console.warn(`[gis] context roads: ${endpoint} fetch failed — next mirror:`, e);
        } finally {
            clearTimeout(timer);
            signal?.removeEventListener('abort', onAbort);
        }
    }
    if (!warnedOnce) {
        warnedOnce = true;
        console.warn('[gis] context roads unavailable (all Overpass mirrors failed/offline) — non-fatal.');
    }
    return emptyRoadCollection();
}
