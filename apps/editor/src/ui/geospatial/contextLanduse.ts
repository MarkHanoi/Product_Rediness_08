// §FORMA-CTX-LANDUSE (founder 2026-07-29) — keyless OSM LAND-USE for terrain colouring.
//
// Sibling of contextParks.ts / contextWater.ts: fetches the land-use polygons for the site bbox and
// classifies each as URBAN (→ grey) or RURAL (→ brown), so the Forma 3D-Site terrain reads the way the
// founder asked — "grey in urban areas, brown in rural". Green (parks) + blue (water) already have their
// own layers; this fills the ground between them. Reuses the SAME baked-tiles-first → Overpass-fallback
// path, mirror list, timeout, cache and the never-throw contract. Visual-only — never touches the BIM
// model or the layout engine.

import {
    OVERPASS_ENDPOINTS, OVERPASS_TIMEOUT_MS,
    contextBboxAround, CONTEXT_BBOX_HALF_DEG,
    fetchOverpassViaProxy,
    type Bbox,
} from './contextBuildings';
import { readContextTileFeatures, type ContextTileFeature } from './contextTiles';

/** How a land-use polygon is coloured on the terrain. */
export type LanduseKind = 'urban' | 'rural';

export interface ContextLanduseArea {
    /** Closed ring as [lon,lat] pairs. */
    readonly ring: ReadonlyArray<readonly [number, number]>;
    readonly osmId: number;
    readonly kind: LanduseKind;
}
export interface ContextLanduseCollection {
    readonly type: 'ContextLanduseCollection';
    readonly areas: ContextLanduseArea[];
}

// The `landuse` tag → colour class. Anything not listed is dropped (parks/water have their own layers;
// an unclassified land-use should not paint a colour we cannot justify — §CONTEXT-DATA-HONESTY).
// §L-12909 (Marseille Vieux-Port / Joliette, 2026-09-05) — `port` and `harbour` are NOT land. In OSM a
// harbour `landuse` polygon routinely covers the BASIN WATER as well as the quays, and painting it as
// urban ground drew the sea tan under the founder's 3D Site. A basin PRYZM cannot separate from its
// quays is dropped, not guessed (§CONTEXT-DATA-HONESTY); the water it contains is the water layer's
// to draw (§SEA-LEFT-HAND-WALK closes a complete harbour coastline as water). The bake still emits
// them; the client simply refuses to colour them.
const URBAN = new Set([
    'residential', 'commercial', 'industrial', 'retail', 'garages', 'construction', 'brownfield',
    'railway', 'quarry',
]);
/** §L-12909 — landuse values that describe WATER-BEARING areas and must never paint as ground. */
export const LANDUSE_NOT_GROUND: ReadonlySet<string> = new Set(['port', 'harbour']);
const RURAL = new Set([
    'farmland', 'meadow', 'orchard', 'vineyard', 'farmyard', 'allotments',
    'greenhouse_horticulture', 'plant_nursery', 'animal_keeping',
]);
export function classifyLanduse(v: string | undefined): LanduseKind | null {
    if (!v) return null;
    if (URBAN.has(v)) return 'urban';
    if (RURAL.has(v)) return 'rural';
    return null;
}

const cache = new Map<string, ContextLanduseCollection>();
let warnedOnce = false;

function bboxKey(b: Bbox): string { return 'landuse:' + b.map((n) => n.toFixed(4)).join(','); }

function overpassLanduseQuery(bbox: Bbox): string {
    const [w, s, e, n] = bbox;
    const b = `${s},${w},${n},${e}`;
    const urban = [...URBAN].join('|');
    const rural = [...RURAL].join('|');
    return `[out:json][timeout:25];(` +
        `way["landuse"~"${urban}|${rural}"](${b});` +
        `relation["landuse"~"${urban}|${rural}"](${b});` +
        `);out geom;`;
}

interface OverpassEl {
    type: string; id: number;
    tags?: Record<string, string>;
    geometry?: Array<{ lat: number; lon: number }>;
    members?: Array<{ type: string; role: string; geometry?: Array<{ lat: number; lon: number }> }>;
}

export function emptyLanduseCollection(): ContextLanduseCollection {
    return { type: 'ContextLanduseCollection', areas: [] };
}

/** Parse Overpass `out geom` elements (ways + multipolygon relations) → classified land-use areas. */
function landuseFromElements(elements: OverpassEl[]): ContextLanduseCollection {
    const areas: ContextLanduseArea[] = [];
    for (const el of elements) {
        const kind = classifyLanduse(el.tags?.['landuse']);
        if (!kind) continue;
        if (el.type === 'way') {
            pushRing(areas, el.geometry, el.id, kind);
        } else if (el.type === 'relation' && el.members) {
            for (const m of el.members) {
                if (m.role === 'outer') pushRing(areas, m.geometry, el.id, kind);
            }
        }
    }
    return { type: 'ContextLanduseCollection', areas };
}

function pushRing(
    areas: ContextLanduseArea[],
    geom: Array<{ lat: number; lon: number }> | undefined,
    osmId: number,
    kind: LanduseKind,
): void {
    if (!geom || geom.length < 4) return;
    areas.push({ ring: geom.map((p) => [p.lon, p.lat] as const), osmId, kind });
}

/**
 * §CTX-PMTILES-READER — convert baked-tile land-use features into `ContextLanduseCollection`. Land-use is
 * AREAL (LAYER_IS_AREAL.landuse = true), so the reader keeps polygon outer rings only. The `landuse` tag
 * rode along in the tile attributes; we classify each ring urban↔rural and drop anything unclassified.
 */
function landuseFromTileFeatures(features: ContextTileFeature[]): ContextLanduseCollection {
    const areas: ContextLanduseArea[] = [];
    for (const f of features) {
        const kind = classifyLanduse(f.tags['landuse']);
        if (!kind) continue;
        for (let ri = 0; ri < f.rings.length; ri++) {
            const ring = f.rings[ri]!;
            if (ring.length < 4) continue;
            areas.push({ ring: ring.map((p) => [p[0]!, p[1]!] as const), osmId: f.syntheticId * 16 + ri, kind });
        }
    }
    return { type: 'ContextLanduseCollection', areas };
}

export async function fetchContextLanduse(
    lat: number, lon: number, signal?: AbortSignal,
    // §FORMA-CTX-LANDUSE-EXTENT (L-642) — the caller may request a WIDER extent than the near
    // context bbox so the grey-urban / brown-rural drape covers the zoom-out view, not just the
    // ~890 m near disc (the founder: "the grey should cover all urban areas out of the circle").
    // Cheap by construction — landuse is a handful of large flat polygons, not per-building geometry.
    // Cache is keyed by the resulting bbox, so narrow + wide reads coexist without clobbering.
    halfDeg: number = CONTEXT_BBOX_HALF_DEG,
): Promise<ContextLanduseCollection> {
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || (lat === 0 && lon === 0)) {
        return emptyLanduseCollection();
    }
    const bbox = contextBboxAround(lat, lon, halfDeg);
    const key = bboxKey(bbox);
    const hit = cache.get(key);
    if (hit) return hit;

    // Baked tiles FIRST (mirrors contextParks); Overpass only on a real read failure.
    const tiled = await readContextTileFeatures('landuse', bbox, signal);
    if (tiled.status === 'ok') {
        const collection = landuseFromTileFeatures(tiled.features);
        cache.set(key, collection);
        console.log(
            `[gis] §CTX-PMTILES-READER landuse: ${collection.areas.length} area(s) from ` +
                `${tiled.tilesRead} baked tile(s) in ${tiled.ms} ms — no Overpass call.`,
        );
        return collection;
    }
    if (tiled.status === 'aborted') return emptyLanduseCollection();
    if (tiled.status === 'unavailable') {
        console.warn(
            `[gis] §CTX-PMTILES-READER landuse: tiles configured but unreadable (${tiled.reason}) ` +
                '— falling back to live Overpass. This is a DEGRADED path, not the intended one.',
        );
    }

    const query = overpassLanduseQuery(bbox);

    const viaProxy = await fetchOverpassViaProxy<OverpassEl>(query, signal);
    if (signal?.aborted) return emptyLanduseCollection();
    if (viaProxy) {
        const collection = landuseFromElements(viaProxy.elements ?? []);
        cache.set(key, collection);
        console.log(`[gis] context landuse: ${collection.areas.length} area(s) for bbox ${key} via /api/overpass proxy.`);
        return collection;
    }

    const body = 'data=' + encodeURIComponent(query);
    for (const endpoint of OVERPASS_ENDPOINTS) {
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
                console.warn(`[gis] context landuse: ${endpoint} HTTP ${res.status} — next mirror.`);
                continue;
            }
            const json = (await res.json()) as { elements?: OverpassEl[] };
            const collection = landuseFromElements(json.elements ?? []);
            cache.set(key, collection);
            console.log(`[gis] context landuse: ${collection.areas.length} area(s) for bbox ${key} via ${new URL(endpoint).host}.`);
            return collection;
        } catch (e) {
            if (signal?.aborted) return emptyLanduseCollection();
            console.warn(`[gis] context landuse: ${endpoint} fetch failed — next mirror:`, e);
        } finally {
            clearTimeout(timer);
            signal?.removeEventListener('abort', onAbort);
        }
    }
    if (!warnedOnce) {
        warnedOnce = true;
        console.warn('[gis] context landuse unavailable (all Overpass mirrors failed/offline) — non-fatal.');
    }
    return emptyLanduseCollection();
}
