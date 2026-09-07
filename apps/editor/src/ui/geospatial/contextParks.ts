// §FORMA-CTX-PARKS (founder 2026-07-01, ADR-0095) — keyless OSM parks / green space.
//
// Sibling of contextWater.ts / contextRoads.ts / contextBuildings.ts: fetches the
// green-space polygons for the site bbox — `leisure=park`, `landuse=grass`/
// `recreation_ground`/`forest`, `natural=wood`/`grassland` — so the Forma 3D-Site
// study can draw the SAME green areas the 2D basemap shows (e.g. Central Park + its
// lawns), making the 3D view read as the same recognisable neighbourhood. Reuses the
// SAME Overpass mirror list, timeout, cache + the never-throw contract. Visual-only —
// never touches the BIM model or the layout engine.
//
// §VEG-CANOPY-FROM-WOODS (L-12934, founder 2026-09-05) — each area now carries its `kind`. The OSM
// tags DO reach the client: `osmium export` keeps them, tippecanoe stores them as feature attributes
// (no `-x`/`-y` in bake.mjs), and `contextTiles.toTags` stringifies them onto `ContextTileFeature.tags`
// — this reader simply never looked. `classifyParkKind` reads `natural` / `landuse` / `leisure` so the
// tree renderer can seed synthesised canopies inside `wood` / `forest` rings ONLY (contextCanopySynth.ts)
// and never inside a lawn. ⚠ What the reader still does NOT carry: HOLES — `contextTiles.ringsFor`
// keeps outer rings only, so a wood with a clearing is filled edge to edge until the reader keeps inner rings.

import {
    OVERPASS_ENDPOINTS, OVERPASS_TIMEOUT_MS,
    contextBboxAround, CONTEXT_BBOX_HALF_DEG,
    fetchOverpassViaProxy,
    type Bbox,
} from './contextBuildings';
import { readContextTileFeatures, type ContextTileFeature } from './contextTiles';
import { scopeReadFanOutCap } from './contextExtentBudget';

/**
 * §VEG-CANOPY-FROM-WOODS (L-12934) — the green-area class, read off the OSM tag that defines it.
 * `wood` / `forest` are CANOPY areas (contextCanopySynth fills them); `park` / `grass` are lawns;
 * `other` is everything else the bake's parks filter admits (recreation_ground, grassland, scrub…).
 */
export type ContextParkKind = 'wood' | 'forest' | 'park' | 'grass' | 'other';

/**
 * Classify a green area from its OSM tags. Precedence: `natural=wood` → `landuse=forest` →
 * `leisure=park` → `landuse=grass` → `other`. A wood that is ALSO tagged as a park (common for
 * urban woods) is a wood — the canopy fill is the more honest render of it.
 */
export function classifyParkKind(tags: Readonly<Record<string, string>> | undefined): ContextParkKind {
    if (!tags) return 'other';
    if (tags['natural'] === 'wood') return 'wood';
    if (tags['landuse'] === 'forest') return 'forest';
    if (tags['leisure'] === 'park') return 'park';
    if (tags['landuse'] === 'grass') return 'grass';
    return 'other';
}

export interface ContextParkArea {
    /** Closed ring as [lon,lat] pairs (a park / grass / wood polygon). */
    readonly ring: ReadonlyArray<readonly [number, number]>;
    readonly osmId: number;
    /** §VEG-CANOPY-FROM-WOODS (L-12934) — see `ContextParkKind`. */
    readonly kind: ContextParkKind;
}
export interface ContextParkCollection {
    readonly type: 'ContextParkCollection';
    readonly areas: ContextParkArea[];
}

const cache = new Map<string, ContextParkCollection>();

/**
 * §CTX-ONE-READ-PER-BBOX (L-585) EXTENDED TO PARKS (L-13110, founder Barcelona 2026-09-07).
 *
 * ⭐ THE MEASURED DEFECT, IN THE FOUNDER'S OWN CONSOLE. His first Barcelona load prints
 * `§CTX-PMTILES-READER parks: 800 green area(s) from 81 baked tile(s)` **THREE TIMES** — at
 * 5672 ms, 3401 ms and 3400 ms. Same feature count, same tile count, three lines.
 *
 * ⚠ WHAT IS AND IS NOT DUPLICATED — say both, because the naive reading is wrong in one half and
 * right in the other (§CONTEXT-DATA-HONESTY: a true number, taken to mean the wrong thing).
 *   · THE BYTES ARE NOT DUPLICATED. `contextTiles`' `tileInFlight` registers each tile's promise
 *     BEFORE it settles, so callers 2 and 3 share caller 1's download — which is why all three end
 *     at the SAME INSTANT (5672 − 3401 ≈ 5672 − 3400 ≈ 2.27 s of stagger). That is §CTX-READ-PROVENANCE's
 *     finding and it stands.
 *   · THE READ ABOVE THE TILES IS DUPLICATED, AND THAT PART WAS NEVER CLOSED HERE. `fetchContextParks`
 *     had a RESOLVED-VALUE cache and no in-flight map, so three overlapping callers each ran a full
 *     `readContextTileFeatures` — three tile-list computations, three `Promise.all` over 81 tiles,
 *     three per-read bbox CROPS of every feature in those tiles, and three `parksFromTileFeatures`
 *     passes building 800 rings. The cache is populated on COMPLETION, so it could not help: the
 *     second and third calls are issued while the first is still in flight.
 *
 * ⛔ THIS IS THE SAME DEFECT L-585 FIXED FOR BUILDINGS AND NEVER PROPAGATED. `contextBuildings.fetchForBbox`
 * carries the identical guard with the identical reasoning ("DE-DUPLICATE **BEFORE** THE TILE READ,
 * NOT AFTER IT"); `contextRoads`/`contextWater` carry the older §L-323 FIX B form. Parks, landuse,
 * rail, trees, furniture and canopy carried neither. Three callers overlap on the onboarding flow
 * by construction — `warmAllContextLayers` at the `city` stage, `CesiumViewport.loadContextParks`
 * when the 3D-Site pane mounts, and the re-render after the terrain sample lands.
 *
 * ⚠ THE SHARED READ DELIBERATELY TAKES NO ABORT SIGNAL, for the reason L-585 states: one caller's
 * abort must not hand the others an empty result for a read that was nearly done. Each caller still
 * honours its OWN signal after the await, so a caller that navigated away still renders nothing
 * (§L-579) — the abort cancels the RENDER, which is what it was always for.
 */
const inFlight = new Map<string, Promise<ContextParkCollection>>();
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

/** Parse Overpass `out geom` elements (ways + multipolygon relations) into green
 *  areas. Shared by the §OVERPASS-PROXY path and the direct-mirror fallback. */
function parksFromElements(elements: OverpassEl[]): ContextParkCollection {
    const areas: ContextParkArea[] = [];
    for (const el of elements) {
        const kind = classifyParkKind(el.tags);
        if (el.type === 'way') {
            pushRing(areas, el.geometry, el.id, kind);
        } else if (el.type === 'relation' && el.members) {
            // Multipolygon park (e.g. Central Park) → draw each outer ring.
            for (const m of el.members) {
                if (m.role === 'outer') pushRing(areas, m.geometry, el.id, kind);
            }
        }
    }
    return { type: 'ContextParkCollection', areas };
}

/** A ring is usable as a filled area when it has ≥4 points. Overpass `out geom`
 *  returns way geometry inline; multipolygon relations expose their outer rings via
 *  members (role 'outer'). We take outer rings only (inner holes are ignored — a
 *  visual-only park fill doesn't need cut-outs). */
function pushRing(
    areas: ContextParkArea[],
    geom: Array<{ lat: number; lon: number }> | undefined,
    osmId: number,
    kind: ContextParkKind,
): void {
    if (!geom || geom.length < 4) return;
    areas.push({ ring: geom.map((p) => [p.lon, p.lat] as const), osmId, kind });
}

/**
 * §CTX-PMTILES-READER (L-513b) — convert baked-tile park features into the same
 * `ContextParkCollection` shape `parksFromElements` produces. Parks are AREAL
 * (LAYER_IS_AREAL.parks = true), so the reader already keeps ONLY polygon outer rings and drops the
 * bake's duplicate linestrings; each ring ≥4 points becomes one filled `ContextParkArea`. `osmId`
 * derives from the tile's stable synthetic id (spaced by 16 so multi-ring features never collide).
 * §VEG-CANOPY-FROM-WOODS (L-12934) — `kind` is classified from the feature's OSM tags (they ride
 * the tile; see the header). Exported as a PURE test seam; `fetchContextParks` is the production caller.
 */
export function parksFromTileFeatures(features: ContextTileFeature[]): ContextParkCollection {
    const areas: ContextParkArea[] = [];
    for (const f of features) {
        const kind = classifyParkKind(f.tags);
        for (let ri = 0; ri < f.rings.length; ri++) {
            const ring = f.rings[ri]!;
            if (ring.length < 4) continue;
            areas.push({ ring: ring.map((p) => [p[0]!, p[1]!] as const), osmId: f.syntheticId * 16 + ri, kind });
        }
    }
    return { type: 'ContextParkCollection', areas };
}

export async function fetchContextParks(
    lat: number, lon: number, signal?: AbortSignal,
    /** §SITE-SCOPE F-2 (C12 §13.1) — the scope-derived half-extent; defaults to the near read. */
    halfDeg: number = CONTEXT_BBOX_HALF_DEG,
): Promise<ContextParkCollection> {
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || (lat === 0 && lon === 0)) {
        return emptyParkCollection();
    }
    const bbox = contextBboxAround(lat, lon, halfDeg);
    const key = bboxKey(bbox);
    const hit = cache.get(key);
    if (hit) return hit;

    // §CTX-ONE-READ-PER-BBOX (L-585 / L-13110) — de-duplicate ABOVE the tile read, see `inFlight`.
    let shared = inFlight.get(key);
    if (!shared) {
        shared = readParksForBbox(bbox, key, halfDeg).finally(() => { inFlight.delete(key); });
        inFlight.set(key, shared);
    }
    const collection = await shared;
    // ⚠ EACH CALLER HONOURS ITS OWN SIGNAL, AFTER THE SHARED READ (§L-579). A caller that navigated
    // away renders nothing; the shared read still completes and populates the cache for the callers
    // that are still watching, instead of being thrown away and started again.
    if (signal?.aborted) return emptyParkCollection();
    return collection;
}

/** The ONE read for a bbox — tiles first, Overpass as the failure fallback. Called only through
 *  `fetchContextParks`, which owns the cache and the one-read-per-bbox guarantee. Never throws.
 *  ⚠ Takes NO `AbortSignal` by design — see `inFlight`. */
async function readParksForBbox(
    bbox: Bbox, key: string, halfDeg: number,
): Promise<ContextParkCollection> {
    // §CTX-PMTILES-READER (L-513b) — THE BAKED TILES COME FIRST, mirroring contextBuildings. Fall
    // back to Overpass ONLY on `unavailable` (a real read failure); an honest empty `ok` is an ANSWER
    // (§CONTEXT-DATA-HONESTY). `aborted` = caller cancelled → render nothing (§L-579); `disabled`
    // falls through to the Overpass path below unchanged.
    const tiled = await readContextTileFeatures('parks', bbox, undefined, { fanOutCap: scopeReadFanOutCap(halfDeg) }); // §SITE-SCOPE F-2
    if (tiled.status === 'ok') {
        const collection = parksFromTileFeatures(tiled.features);
        cache.set(key, collection);
        console.log(
            `[gis] §CTX-PMTILES-READER parks: ${collection.areas.length} green area(s) from ` +
                `${tiled.tilesRead} baked tile(s) in ${tiled.ms} ms — no Overpass call.`,
        );
        return collection;
    }
    if (tiled.status === 'aborted') return emptyParkCollection();
    if (tiled.status === 'unavailable') {
        console.warn(
            `[gis] §CTX-PMTILES-READER parks: tiles configured but unreadable (${tiled.reason}) ` +
                '— falling back to live Overpass. This is a DEGRADED path, not the intended one.',
        );
    }

    const query = overpassParkQuery(bbox);

    // §OVERPASS-PROXY — same-origin proxy FIRST (shared server cache dodges the
    // per-browser 429). `null` = proxy unreachable → direct-mirror fallback below.
    const viaProxy = await fetchOverpassViaProxy<OverpassEl>(query);
    if (viaProxy) {
        const collection = parksFromElements(viaProxy.elements ?? []);
        cache.set(key, collection);
        console.log(`[gis] context parks: ${collection.areas.length} green area(s) for bbox ${key} via /api/overpass proxy.`);
        return collection;
    }

    const body = 'data=' + encodeURIComponent(query);
    for (const endpoint of OVERPASS_ENDPOINTS) {
        // §GIS-ABORT-REASON — explicit reasons; non-fatal graceful-degrade (parks
        // context is skipped, the scene still renders).
        const ctrl = new AbortController();
        const timer = setTimeout(
            () => ctrl.abort(new DOMException(`Overpass timeout after ${OVERPASS_TIMEOUT_MS}ms (mirror slow/rate-limited)`, 'TimeoutError')),
            OVERPASS_TIMEOUT_MS,
        );
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
            const collection = parksFromElements(json.elements ?? []);
            cache.set(key, collection);
            console.log(`[gis] context parks: ${collection.areas.length} green area(s) for bbox ${key} via ${new URL(endpoint).host}.`);
            return collection;
        } catch (e) {
            console.warn(`[gis] context parks: ${endpoint} fetch failed — next mirror:`, e);
        } finally {
            clearTimeout(timer);
        }
    }
    if (!warnedOnce) {
        warnedOnce = true;
        console.warn('[gis] context parks unavailable (all Overpass mirrors failed/offline) — non-fatal.');
    }
    return emptyParkCollection();
}
