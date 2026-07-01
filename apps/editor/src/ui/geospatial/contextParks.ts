// §FORMA-CTX-PARKS (founder 2026-07-01, ADR-0095) — keyless OSM parks / green space.
//
// Sibling of contextWater.ts / contextRoads.ts / contextBuildings.ts: fetches the
// green-space polygons for the site bbox — `leisure=park`, `landuse=grass`/
// `recreation_ground`/`forest`, `natural=wood`/`grassland` — so the Forma 3D-Site
// study can draw the SAME green areas the 2D basemap shows (e.g. Central Park + its
// lawns), making the 3D view read as the same recognisable neighbourhood. Reuses the
// SAME Overpass mirror list, timeout, cache + the never-throw contract. Visual-only —
// never touches the BIM model or the layout engine.

import {
    OVERPASS_ENDPOINTS, OVERPASS_TIMEOUT_MS,
    contextBboxAround, CONTEXT_BBOX_HALF_DEG,
    type Bbox,
} from './contextBuildings';

export interface ContextParkArea {
    /** Closed ring as [lon,lat] pairs (a park / grass / wood polygon). */
    readonly ring: ReadonlyArray<readonly [number, number]>;
    readonly osmId: number;
}
export interface ContextParkCollection {
    readonly type: 'ContextParkCollection';
    readonly areas: ContextParkArea[];
}

const cache = new Map<string, ContextParkCollection>();
let warnedOnce = false;

function bboxKey(b: Bbox): string { return 'parks:' + b.map((n) => n.toFixed(4)).join(','); }

function overpassParkQuery(bbox: Bbox): string {
    const [w, s, e, n] = bbox;
    const b = `${s},${w},${n},${e}`;
    // Parks + generic green space as polygons (ways + multipolygon relations).
    return `[out:json][timeout:25];(` +
        `way["leisure"~"park|garden|recreation_ground|pitch|dog_park"](${b});` +
        `way["landuse"~"grass|forest|meadow|recreation_ground|village_green|cemetery"](${b});` +
        `way["natural"~"wood|grassland|scrub|heath"](${b});` +
        `relation["leisure"="park"](${b});` +
        `);out geom;`;
}

interface OverpassEl {
    type: string; id: number;
    tags?: Record<string, string>;
    geometry?: Array<{ lat: number; lon: number }>;
    members?: Array<{ type: string; role: string; geometry?: Array<{ lat: number; lon: number }> }>;
}

export function emptyParkCollection(): ContextParkCollection {
    return { type: 'ContextParkCollection', areas: [] };
}

/** A ring is usable as a filled area when it has ≥4 points. Overpass `out geom`
 *  returns way geometry inline; multipolygon relations expose their outer rings via
 *  members (role 'outer'). We take outer rings only (inner holes are ignored — a
 *  visual-only park fill doesn't need cut-outs). */
function pushRing(
    areas: ContextParkArea[],
    geom: Array<{ lat: number; lon: number }> | undefined,
    osmId: number,
): void {
    if (!geom || geom.length < 4) return;
    areas.push({ ring: geom.map((p) => [p.lon, p.lat] as const), osmId });
}

export async function fetchContextParks(
    lat: number, lon: number, signal?: AbortSignal,
): Promise<ContextParkCollection> {
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || (lat === 0 && lon === 0)) {
        return emptyParkCollection();
    }
    const bbox = contextBboxAround(lat, lon, CONTEXT_BBOX_HALF_DEG);
    const key = bboxKey(bbox);
    const hit = cache.get(key);
    if (hit) return hit;

    const body = 'data=' + encodeURIComponent(overpassParkQuery(bbox));
    for (const endpoint of OVERPASS_ENDPOINTS) {
        // §GIS-ABORT-REASON — explicit reasons; non-fatal graceful-degrade (parks
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
                console.warn(`[gis] context parks: ${endpoint} HTTP ${res.status} — next mirror.`);
                continue;
            }
            const json = (await res.json()) as { elements?: OverpassEl[] };
            const areas: ContextParkArea[] = [];
            for (const el of json.elements ?? []) {
                if (el.type === 'way') {
                    pushRing(areas, el.geometry, el.id);
                } else if (el.type === 'relation' && el.members) {
                    // Multipolygon park (e.g. Central Park) → draw each outer ring.
                    for (const m of el.members) {
                        if (m.role === 'outer') pushRing(areas, m.geometry, el.id);
                    }
                }
            }
            const collection = { type: 'ContextParkCollection' as const, areas };
            cache.set(key, collection);
            console.log(`[gis] context parks: ${areas.length} green area(s) for bbox ${key} via ${new URL(endpoint).host}.`);
            return collection;
        } catch (e) {
            if (signal?.aborted) return emptyParkCollection();
            console.warn(`[gis] context parks: ${endpoint} fetch failed — next mirror:`, e);
        } finally {
            clearTimeout(timer);
            signal?.removeEventListener('abort', onAbort);
        }
    }
    if (!warnedOnce) {
        warnedOnce = true;
        console.warn('[gis] context parks unavailable (all Overpass mirrors failed/offline) — non-fatal.');
    }
    return emptyParkCollection();
}
