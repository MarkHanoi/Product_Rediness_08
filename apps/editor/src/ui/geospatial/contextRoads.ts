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
    type Bbox,
} from './contextBuildings';

export interface ContextWay {
    /** Polyline as [lon,lat] pairs (open way — NOT a closed ring). */
    readonly coords: ReadonlyArray<readonly [number, number]>;
    /** 'road' (motorway…residential/service) or 'pedestrian' (footway/path/steps/cycleway). */
    readonly kind: 'road' | 'pedestrian';
    readonly osmId: number;
}
export interface ContextRoadCollection {
    readonly type: 'ContextRoadCollection';
    readonly ways: ContextWay[];
}

const PEDESTRIAN = new Set(['footway', 'path', 'steps', 'cycleway', 'pedestrian', 'track']);

const cache = new Map<string, ContextRoadCollection>();
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

export async function fetchContextRoads(
    lat: number, lon: number, signal?: AbortSignal,
): Promise<ContextRoadCollection> {
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || (lat === 0 && lon === 0)) {
        return emptyRoadCollection();
    }
    const bbox = contextBboxAround(lat, lon, CONTEXT_BBOX_HALF_DEG);
    const key = bboxKey(bbox);
    const hit = cache.get(key);
    if (hit) return hit;

    const body = 'data=' + encodeURIComponent(overpassRoadQuery(bbox));
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
            const ways: ContextWay[] = [];
            for (const el of json.elements ?? []) {
                if (el.type !== 'way' || !el.geometry || el.geometry.length < 2) continue;
                const hw = el.tags?.['highway'] ?? '';
                ways.push({
                    coords: el.geometry.map((p) => [p.lon, p.lat] as const),
                    kind: PEDESTRIAN.has(hw) ? 'pedestrian' : 'road',
                    osmId: el.id,
                });
            }
            const collection = { type: 'ContextRoadCollection' as const, ways };
            cache.set(key, collection);
            console.log(`[gis] context roads: ${ways.length} way(s) for bbox ${key} via ${new URL(endpoint).host}.`);
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
