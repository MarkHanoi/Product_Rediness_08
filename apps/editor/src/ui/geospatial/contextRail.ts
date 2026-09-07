// §FORMA-CTX-RAIL (L-642 Phase C — docs/03-execution/specs/SPEC-3D-SITE-PRODUCTION-CONTEXT.md §2)
//
// Sibling of contextRoads.ts: reads the BAKED `rail` tile layer (`w/railway` linestrings — heavy
// rail / light rail / subway / tram) for the site bbox and returns open lon/lat polylines for the
// Forma 3D-Site to draw as thin DARK ground ribbons, a distinct tone from the pale road grid. The
// T1 near ring's transport skeleton. Visual-only — never touches the BIM model or the layout engine.
//
// §CONTEXT-DATA-HONESTY (the whole point). Unlike contextRoads/contextParks — which pre-date the bake
// and therefore fall back to LIVE Overpass on a read failure — rail is a NEW, BAKED-ONLY layer:
//   • un-baked (tiles `disabled`, or `rail.pmtiles` absent) → a quiet no-op (empty), never fabricated;
//   • an honest empty `ok` ("nothing mapped here") is an ANSWER, returned as empty;
//   • `aborted` (caller navigated away) → empty, let the newer request paint (§L-579);
//   • `unavailable` (a REAL read failure) → empty + a loud DEGRADED warning, but NO live-Overpass
//     fallback: adding a live railway hot-path would reintroduce exactly the unreliable third party
//     L-513 exists to remove. We never fabricate rail we could not read; we say so and draw nothing.
// Never throws.

import { contextBboxAround, CONTEXT_BBOX_HALF_DEG, type Bbox } from './contextBuildings';
import { scopeReadFanOutCap } from './contextExtentBudget';
import { readContextTileFeatures, type ContextTileFeature } from './contextTiles';

export interface ContextRailWay {
    /** Track polyline as [lon,lat] pairs (an open way — NOT a closed ring). */
    readonly coords: ReadonlyArray<readonly [number, number]>;
    /** The raw OSM `railway` class (e.g. 'rail', 'light_rail', 'subway', 'tram'). */
    readonly railway: string;
    readonly osmId: number;
}
export interface ContextRailCollection {
    readonly type: 'ContextRailCollection';
    readonly ways: ContextRailWay[];
}

// The ACTIVE rail classes we draw. `w/railway` also carries platforms, sidings under construction,
// abandoned/disused/razed alignments and level-crossing furniture — none of which should paint a
// track line (an unclassified/inactive value we cannot justify drawing is dropped, §CONTEXT-DATA-
// HONESTY, exactly as contextRoads buckets its `highway` classes and contextLanduse its `landuse`).
const RAIL_CLASSES = new Set([
    'rail', 'light_rail', 'subway', 'tram', 'narrow_gauge', 'monorail', 'funicular', 'miniature',
    'preserved',
]);

const cache = new Map<string, ContextRailCollection>();

/**
 * §CTX-ONE-READ-PER-BBOX (L-585) EXTENDED TO RAIL (L-13110, lane STARTUP-FIX 2026-09-07).
 *
 * The same gap contextParks/contextLanduse closed one file over, and the reason it is worth closing
 * here too: a resolved-value cache is populated on COMPLETION, so it cannot help a caller issued
 * while the first read is still IN FLIGHT — and on the onboarding flow they always are
 * (`warmAllContextLayers` at the `city` stage, then `CesiumViewport.loadContextRail` at pane mount).
 * Each duplicate call paid a full `readContextTileFeatures`: a tile-list computation, a `Promise.all`
 * over the covering tiles, a per-read bbox CROP of every feature in them, and a full collection build.
 *
 * ⚠ NOT the tile bytes — `contextTiles.tileInFlight` already shares those, which is why the founder's
 * three parks lines ended at the SAME INSTANT. This guard removes the work ABOVE the tiles, and only
 * that; claiming it saves downloads would be the misreading §CTX-READ-PROVENANCE exists to end.
 *
 * ⚠ THE SHARED READ TAKES NO ABORT SIGNAL, deliberately (L-585): one caller's abort must not hand
 * the others an empty result for a read that was nearly done. Each caller honours its OWN signal
 * after the await, so an abort still cancels the RENDER (§L-579).
 */
const inFlight = new Map<string, Promise<ContextRailCollection>>();

function bboxKey(b: Bbox): string { return 'rail:' + b.map((n) => n.toFixed(4)).join(','); }

export function emptyRailCollection(): ContextRailCollection {
    return { type: 'ContextRailCollection', ways: [] };
}

/**
 * §CTX-PMTILES-READER — convert baked `rail` tile features into `ContextRailWay[]`. Rail is LINEAR
 * (LAYER_IS_AREAL.rail = false), so each feature's `rings` are its linestring strand(s); one
 * `ContextRailWay` per strand. Only the active `RAIL_CLASSES` are kept. `osmId` derives from the
 * tile's stable synthetic id (spaced by 16 so multi-strand features never collide) — mirrors
 * contextRoads.roadsFromTileFeatures exactly.
 */
function railFromTileFeatures(features: ContextTileFeature[]): ContextRailCollection {
    const ways: ContextRailWay[] = [];
    for (const f of features) {
        const railway = f.tags['railway'] ?? '';
        if (!RAIL_CLASSES.has(railway)) continue;
        for (let ri = 0; ri < f.rings.length; ri++) {
            const ring = f.rings[ri]!;
            if (ring.length < 2) continue;
            ways.push({
                coords: ring.map((p) => [p[0]!, p[1]!] as const),
                railway,
                osmId: f.syntheticId * 16 + ri,
            });
        }
    }
    return { type: 'ContextRailCollection', ways };
}

export async function fetchContextRail(
    lat: number, lon: number, signal?: AbortSignal,
    /** §SITE-SCOPE F-2 (C12 §13.1) — the scope-derived half-extent; defaults to the near read. */
    halfDeg: number = CONTEXT_BBOX_HALF_DEG,
): Promise<ContextRailCollection> {
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || (lat === 0 && lon === 0)) {
        return emptyRailCollection();
    }
    const bbox = contextBboxAround(lat, lon, halfDeg);
    const key = bboxKey(bbox);
    const hit = cache.get(key);
    if (hit) return hit;

    // §CTX-ONE-READ-PER-BBOX (L-585 / L-13110) — de-duplicate ABOVE the tile read, see `inFlight`.
    let shared = inFlight.get(key);
    if (!shared) {
        shared = readRailForBbox(bbox, key, halfDeg).finally(() => { inFlight.delete(key); });
        inFlight.set(key, shared);
    }
    const collection = await shared;
    // ⚠ EACH CALLER HONOURS ITS OWN SIGNAL, AFTER THE SHARED READ (§L-579).
    if (signal?.aborted) return emptyRailCollection();
    return collection;
}

/** The ONE read for a bbox. Called only through `fetchContextRail`, which owns the cache and the
 *  one-read-per-bbox guarantee. Never throws. ⚠ Takes NO `AbortSignal` by design — see `inFlight`. */
async function readRailForBbox(bbox: Bbox, key: string, halfDeg: number): Promise<ContextRailCollection> {
    const tiled = await readContextTileFeatures('rail', bbox, undefined, { fanOutCap: scopeReadFanOutCap(halfDeg) }); // §SITE-SCOPE F-2
    if (tiled.status === 'ok') {
        const collection = railFromTileFeatures(tiled.features);
        cache.set(key, collection);
        console.log(
            `[gis] §CTX-PMTILES-READER rail: ${collection.ways.length} track(s) from ` +
                `${tiled.tilesRead} baked tile(s) in ${tiled.ms} ms.`,
        );
        return collection;
    }
    // §CONTEXT-DATA-HONESTY — anything but `ok` degrades to a quiet no-op (never a fabricated line).
    // `unavailable` is a REAL read failure worth flagging as a degraded path; `disabled` (no tiles
    // configured — the un-baked case) and `aborted` are silent, expected no-ops.
    if (tiled.status === 'unavailable') {
        console.warn(
            `[gis] §CTX-PMTILES-READER rail: tiles configured but unreadable (${tiled.reason}) ` +
                '— rendering NO rail (no live-Overpass fallback for this baked-only layer).',
        );
    }
    return emptyRailCollection();
}
