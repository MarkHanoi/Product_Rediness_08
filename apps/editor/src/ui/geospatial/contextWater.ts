// FORMA-CTX-WATER (founder 2026-06-19) — keyless OSM water bodies + waterways.
//
// Sibling of contextRoads.ts / contextBuildings.ts: fetches `natural=water`
// polygons (lakes/ponds/reservoirs) and `waterway` lines (rivers/streams/canals)
// for the site bbox so the Forma flat-ground study can draw the SAME blue water
// the 2D map shows. Reuses the SAME Overpass mirror list, timeout, cache + the
// never-throw contract. Visual-only — never touches the BIM model or the layout
// engine. Founder ask: "in the site view … we need layout data — water — roads".

import {
    OVERPASS_ENDPOINTS, OVERPASS_TIMEOUT_MS,
    contextBboxAround, CONTEXT_BBOX_HALF_DEG,
    fetchOverpassViaProxy,
    type Bbox,
} from './contextBuildings';

export interface ContextWaterArea {
    /** Closed ring as [lon,lat] pairs (a lake / pond / reservoir polygon). */
    readonly ring: ReadonlyArray<readonly [number, number]>;
    readonly osmId: number;
}
export interface ContextWaterway {
    /** Open polyline as [lon,lat] pairs (a river / stream / canal centre-line). */
    readonly coords: ReadonlyArray<readonly [number, number]>;
    readonly osmId: number;
}
export interface ContextWaterCollection {
    readonly type: 'ContextWaterCollection';
    readonly areas: ContextWaterArea[];
    readonly ways: ContextWaterway[];
}

const cache = new Map<string, ContextWaterCollection>();
let warnedOnce = false;

function bboxKey(b: Bbox): string { return 'water:' + b.map((n) => n.toFixed(4)).join(','); }

function overpassWaterQuery(bbox: Bbox): string {
    const [w, s, e, n] = bbox;
    const b = `${s},${w},${n},${e}`;
    // Lakes/ponds/reservoirs as polygons + rivers/streams/canals as lines.
    return `[out:json][timeout:25];(` +
        `way["natural"="water"](${b});` +
        `way["landuse"="reservoir"](${b});` +
        `way["waterway"~"river|stream|canal|riverbank"](${b});` +
        `);out geom;`;
}

interface OverpassWay {
    type: string; id: number;
    tags?: Record<string, string>;
    geometry?: Array<{ lat: number; lon: number }>;
}

export function emptyWaterCollection(): ContextWaterCollection {
    return { type: 'ContextWaterCollection', areas: [], ways: [] };
}

/** Parse Overpass `out geom` elements into water areas + waterways. Shared by
 *  the §OVERPASS-PROXY path and the direct-mirror fallback below. */
function waterFromElements(elements: OverpassWay[]): ContextWaterCollection {
    const areas: ContextWaterArea[] = [];
    const ways: ContextWaterway[] = [];
    for (const el of elements) {
        if (el.type !== 'way' || !el.geometry || el.geometry.length < 2) continue;
        const isArea = el.tags?.['natural'] === 'water'
            || el.tags?.['landuse'] === 'reservoir'
            || el.tags?.['waterway'] === 'riverbank'
            || isClosed(el.geometry);
        if (isArea && el.geometry.length >= 4) {
            areas.push({ ring: el.geometry.map((p) => [p.lon, p.lat] as const), osmId: el.id });
        } else {
            ways.push({ coords: el.geometry.map((p) => [p.lon, p.lat] as const), osmId: el.id });
        }
    }
    return { type: 'ContextWaterCollection', areas, ways };
}

/** Is this way a closed ring (first point ≈ last point)? Lakes are closed; a
 *  river centre-line is open. `natural=water`/`reservoir` are areas regardless. */
function isClosed(geom: Array<{ lat: number; lon: number }>): boolean {
    if (geom.length < 4) return false;
    const a = geom[0]!, z = geom[geom.length - 1]!;
    return Math.abs(a.lat - z.lat) < 1e-9 && Math.abs(a.lon - z.lon) < 1e-9;
}

export async function fetchContextWater(
    lat: number, lon: number, signal?: AbortSignal,
): Promise<ContextWaterCollection> {
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || (lat === 0 && lon === 0)) {
        return emptyWaterCollection();
    }
    const bbox = contextBboxAround(lat, lon, CONTEXT_BBOX_HALF_DEG);
    const key = bboxKey(bbox);
    const hit = cache.get(key);
    if (hit) return hit;

    const query = overpassWaterQuery(bbox);

    // §OVERPASS-PROXY — same-origin proxy FIRST (shared server cache dodges the
    // per-browser 429). `null` = proxy unreachable → direct-mirror fallback below.
    const viaProxy = await fetchOverpassViaProxy<OverpassWay>(query, signal);
    if (signal?.aborted) return emptyWaterCollection();
    if (viaProxy) {
        const collection = waterFromElements(viaProxy.elements ?? []);
        cache.set(key, collection);
        console.log(`[gis] context water: ${collection.areas.length} area(s) + ${collection.ways.length} waterway(s) for bbox ${key} via /api/overpass proxy.`);
        return collection;
    }

    const body = 'data=' + encodeURIComponent(query);
    for (const endpoint of OVERPASS_ENDPOINTS) {
        // §GIS-ABORT-REASON — explicit reasons; non-fatal graceful-degrade (water
        // context is skipped, the scene still renders).
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
                console.warn(`[gis] context water: ${endpoint} HTTP ${res.status} — next mirror.`);
                continue;
            }
            const json = (await res.json()) as { elements?: OverpassWay[] };
            const collection = waterFromElements(json.elements ?? []);
            cache.set(key, collection);
            console.log(`[gis] context water: ${collection.areas.length} area(s) + ${collection.ways.length} waterway(s) for bbox ${key} via ${new URL(endpoint).host}.`);
            return collection;
        } catch (e) {
            if (signal?.aborted) return emptyWaterCollection();
            console.warn(`[gis] context water: ${endpoint} fetch failed — next mirror:`, e);
        } finally {
            clearTimeout(timer);
            signal?.removeEventListener('abort', onAbort);
        }
    }
    if (!warnedOnce) {
        warnedOnce = true;
        console.warn('[gis] context water unavailable (all Overpass mirrors failed/offline) — non-fatal.');
    }
    return emptyWaterCollection();
}
