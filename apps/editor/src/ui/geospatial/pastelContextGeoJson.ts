// pastelContextGeoJson.ts — §MAP2D-PASTEL Stage M1 (L-12938).
//
// WHAT THIS IS
// ------------
// The adapter between the BAKED context collections the 3D Site already reads
// (`contextRoads` / `contextWater` / `contextParks` / `contextLanduse` / `contextRail` /
// `contextTrees`, plus `contextCanopySynth`) and the MapLibre GeoJSON sources the pastel
// 2D style declares (`siteMap2DStyle.PASTEL_SOURCES`). It exists so `SiteBoundaryMap2D.ts`
// — a 2,500-line shared file that four lanes touch — gains ONE call site rather than six
// conversion loops, and so the conversions themselves are unit-testable without MapLibre.
//
// ONE READ, TWO RENDERERS (STR-2D-SITE-MAP-CARTOGRAPHY §4 M1). Every fetcher below is the
// SAME per-bbox-memoised function `contextLayerWarm.warmAllContextLayers()` fires the
// moment a geocode resolves, at the SAME bbox (`contextBboxAround(lat, lon,
// CONTEXT_BBOX_HALF_DEG)` — the readers compute it themselves from the same constants).
// So on the normal path — geocode → warm → the 2D map mounts — every call here is an
// in-memory cache hit and the 2D map costs ZERO new network reads. If the map is opened on
// a site that was never warmed, these are the reads the 3D Site would have made anyway, and
// they populate the very cache keys it then reads. Neither path adds a round-trip.
//
// HONESTY (C57 §1.5 / §1.9, C58 §1.2)
//   • Every feature carries the `source` that produced it: `'baked'` for a read of the R2
//     tile archive, `'synthetic'` for a canopy this process invented.
//   • Mapped trees and SYNTHESISED canopies are counted SEPARATELY in the summary line and
//     distinguished by a `synthetic` property on every feature — never merged into one
//     "trees: N". They are drawn with the same symbol on purpose (a wood must read as a
//     wood), so the count is the only place the distinction can live; it is therefore not
//     optional.
//   • A reader that FAILED and a neighbourhood that is genuinely EMPTY both arrive here as
//     an empty collection — the readers already discriminate the two and log the degraded
//     case themselves (`§CTX-PMTILES-READER … rendering NO rail`). This module does not
//     re-derive that verdict and must never present an empty push as "nothing is here".
//
// PURITY. The converters are pure `collection → FeatureCollection`: no network, no clock,
// no DOM, no maplibre. Only `loadPastelContextGeoJson` does I/O, and it never throws.

import { trace } from '@opentelemetry/api';

import { fetchContextRoads, type ContextRoadCollection } from './contextRoads';
import { fetchContextWater, type ContextWaterCollection } from './contextWater';
import { fetchContextParks, type ContextParkCollection } from './contextParks';
import { fetchContextLanduse, type ContextLanduseCollection } from './contextLanduse';
import { fetchContextRail, type ContextRailCollection } from './contextRail';
import { fetchContextTrees, type ContextTreeCollection } from './contextTrees';
import {
    synthesiseCanopies,
    CANOPY_SOURCE_KINDS,
    type SynthesisedCanopy,
} from './contextCanopySynth';
import { CONTEXT_WIDE_HALF_DEG } from './contextExtents';
import { PASTEL_SOURCES } from './siteMap2DStyle';

const _tracer = trace.getTracer('pryzm.gis.map2d-pastel');

/** Nearest-first cap on synthesised canopies pushed to the 2D map. */
export const PASTEL_CANOPY_MAX = 3000;
/** Radial cull for synthesised canopies about the site centre, metres. */
export const PASTEL_CANOPY_RADIUS_M = 900;

/** An empty FeatureCollection — the resting state of every pastel source. */
export function emptyFeatureCollection(): GeoJSON.FeatureCollection {
    return { type: 'FeatureCollection', features: [] };
}

function lineFeature(
    coords: ReadonlyArray<readonly [number, number]>,
    properties: Record<string, unknown>,
): GeoJSON.Feature | null {
    if (coords.length < 2) return null;
    return {
        type: 'Feature',
        geometry: { type: 'LineString', coordinates: coords.map((p) => [p[0], p[1]]) },
        properties,
    };
}

function polygonFeature(
    ring: ReadonlyArray<readonly [number, number]>,
    properties: Record<string, unknown>,
    holes?: ReadonlyArray<ReadonlyArray<readonly [number, number]>>,
): GeoJSON.Feature | null {
    if (ring.length < 4) return null;
    const rings: number[][][] = [ring.map((p) => [p[0], p[1]])];
    for (const h of holes ?? []) {
        if (h.length >= 4) rings.push(h.map((p) => [p[0], p[1]]));
    }
    return { type: 'Feature', geometry: { type: 'Polygon', coordinates: rings }, properties };
}

/**
 * Roads → LineStrings carrying the raw OSM `highway` tag (what
 * `siteMap2DStyle.PASTEL_ROAD_CLASSES.ctx*` filters on) and the reader's coarse
 * `road`/`pedestrian` bucket.
 */
export function roadsToGeoJson(c: ContextRoadCollection): GeoJSON.FeatureCollection {
    const features: GeoJSON.Feature[] = [];
    for (const w of c.ways) {
        const f = lineFeature(w.coords, {
            highway: w.highway, kind: w.kind, osmId: w.osmId, source: 'baked',
        });
        if (f) features.push(f);
    }
    return { type: 'FeatureCollection', features };
}

/**
 * Water AREAS → Polygons. Lakes/basins (`areas`) and open sea (`sea`) are both surfaces
 * and are drawn in the same powder blue; `kind` carries which is which so a future stage
 * can differentiate without a second read. Island holes ride through when the reader
 * carries them (baked sea polygons do; lakes do not).
 */
export function waterAreasToGeoJson(c: ContextWaterCollection): GeoJSON.FeatureCollection {
    const features: GeoJSON.Feature[] = [];
    for (const a of c.areas) {
        const f = polygonFeature(a.ring, { kind: 'water', osmId: a.osmId, source: 'baked' }, a.holes);
        if (f) features.push(f);
    }
    for (const a of c.sea) {
        const f = polygonFeature(
            a.ring,
            { kind: 'sea', osmId: a.osmId, source: 'baked', seaProvenance: c.seaProvenance ?? 'none' },
            a.holes,
        );
        if (f) features.push(f);
    }
    return { type: 'FeatureCollection', features };
}

/**
 * Waterway CENTRE-LINES → LineStrings carrying `kind` (`river` / `canal` / `stream` / …).
 * ⚠ `kind` picks a NOMINAL cartographic width only; it is never a surveyed channel width
 * (`contextWater.ContextWaterway` states the same constraint for the 3D ribbon).
 */
export function waterwaysToGeoJson(c: ContextWaterCollection): GeoJSON.FeatureCollection {
    const features: GeoJSON.Feature[] = [];
    for (const w of c.ways) {
        const f = lineFeature(w.coords, { kind: w.kind, osmId: w.osmId, source: 'baked' });
        if (f) features.push(f);
    }
    return { type: 'FeatureCollection', features };
}

/**
 * Parks → Polygons carrying `contextParks.ContextParkKind`, read off the OSM tag that
 * defines the polygon (`classifyParkKind`). The style paints `wood`/`forest` in the deeper
 * woodland sage and everything else in the lawn sage — a classification, not a guess.
 */
export function parksToGeoJson(c: ContextParkCollection): GeoJSON.FeatureCollection {
    const features: GeoJSON.Feature[] = [];
    for (const a of c.areas) {
        const f = polygonFeature(a.ring, { kind: a.kind, osmId: a.osmId, source: 'baked' });
        if (f) features.push(f);
    }
    return { type: 'FeatureCollection', features };
}

/**
 * Land-use → Polygons carrying the reader's `urban` / `rural` class.
 * ⚠ The raw OSM `landuse` tag is DROPPED by `contextLanduse` (it classifies, then keeps only
 * the class), so the 2D map can only tint at that coarseness from this source. The finer
 * residential/industrial/commercial split in `FORMA_PALETTE_V2` is served by the
 * OpenMapTiles base layer, which does carry `class`. Do not read the ctx tint as finer than
 * "urban".
 */
export function landuseToGeoJson(c: ContextLanduseCollection): GeoJSON.FeatureCollection {
    const features: GeoJSON.Feature[] = [];
    for (const a of c.areas) {
        const f = polygonFeature(a.ring, { kind: a.kind, osmId: a.osmId, source: 'baked' });
        if (f) features.push(f);
    }
    return { type: 'FeatureCollection', features };
}

/** Rail → LineStrings carrying the OSM `railway` class the reader already filtered to actives. */
export function railToGeoJson(c: ContextRailCollection): GeoJSON.FeatureCollection {
    const features: GeoJSON.Feature[] = [];
    for (const w of c.ways) {
        const f = lineFeature(w.coords, { railway: w.railway, osmId: w.osmId, source: 'baked' });
        if (f) features.push(f);
    }
    return { type: 'FeatureCollection', features };
}

/**
 * Trees → Points. MAPPED trees (`synthetic: false`, positive `osmId`, `source: 'baked'`) and
 * SYNTHESISED canopies (`synthetic: true`, NEGATIVE `osmId`, `source: 'synthetic'`, plus the
 * real OSM polygon they were seeded inside) in one collection because they share one symbol.
 * The honesty lives in the properties and in the caller's separated counts — never in the
 * symbol, which is deliberately identical so a wood reads as a wood.
 */
export function treesToGeoJson(
    mapped: ContextTreeCollection,
    canopies: ReadonlyArray<SynthesisedCanopy>,
): GeoJSON.FeatureCollection {
    const features: GeoJSON.Feature[] = [];
    for (const t of mapped.trees) {
        features.push({
            type: 'Feature',
            geometry: { type: 'Point', coordinates: [t.lon, t.lat] },
            properties: { synthetic: false, osmId: t.osmId, source: 'baked' },
        });
    }
    for (const c of canopies) {
        features.push({
            type: 'Feature',
            geometry: { type: 'Point', coordinates: [c.lon, c.lat] },
            properties: {
                synthetic: true,
                osmId: c.osmId,
                source: 'synthetic',
                sourceOsmId: c.sourceOsmId,
            },
        });
    }
    return { type: 'FeatureCollection', features };
}

/** What `loadPastelContextGeoJson` returns: the data to push, plus the honest counts. */
export interface PastelContextPush {
    /** source id → FeatureCollection, keyed by `siteMap2DStyle.PASTEL_SOURCES`. */
    readonly bySource: Readonly<Record<string, GeoJSON.FeatureCollection>>;
    /** One console line, counts separated by source (C57 §1.5). */
    readonly summary: string;
    /** Individually-MAPPED trees read from the baked archive. */
    readonly mappedTrees: number;
    /** Canopies this process SYNTHESISED inside real wood/forest polygons — scenery, not survey. */
    readonly syntheticCanopies: number;
}

/**
 * Read every non-building baked context layer for `lat/lon` (all cache hits after
 * `warmAllContextLayers`) and convert it to the GeoJSON the pastel style's sources expect.
 * Never throws: a rejected reader degrades that ONE layer to empty and the rest still land.
 */
export async function loadPastelContextGeoJson(
    lat: number,
    lon: number,
    signal?: AbortSignal,
): Promise<PastelContextPush> {
    const span = _tracer.startSpan('pryzm.gis.map2d-pastel.loadContextGeoJson');
    try {
        const settle = await Promise.allSettled([
            fetchContextRoads(lat, lon, signal),
            fetchContextWater(lat, lon, signal),
            fetchContextParks(lat, lon, signal),
            // ⚠ THE WIDE EXTENT, NOT THE DEFAULT. `warmAllContextLayers` warms land-use at
            // `CONTEXT_WIDE_HALF_DEG`; the readers key their cache BY BBOX, so asking for the
            // default near bbox here would miss that key and start a SECOND network read — the
            // exact cost this module exists to avoid. One extent, one key, one read.
            fetchContextLanduse(lat, lon, signal, CONTEXT_WIDE_HALF_DEG),
            fetchContextRail(lat, lon, signal),
            fetchContextTrees(lat, lon, signal),
        ]);
        const roads = settle[0].status === 'fulfilled'
            ? settle[0].value : { type: 'ContextRoadCollection', ways: [] } as ContextRoadCollection;
        const water = settle[1].status === 'fulfilled'
            ? settle[1].value
            : { type: 'ContextWaterCollection', areas: [], ways: [], sea: [] } as ContextWaterCollection;
        const parks = settle[2].status === 'fulfilled'
            ? settle[2].value : { type: 'ContextParkCollection', areas: [] } as ContextParkCollection;
        const landuse = settle[3].status === 'fulfilled'
            ? settle[3].value : { type: 'ContextLanduseCollection', areas: [] } as ContextLanduseCollection;
        const rail = settle[4].status === 'fulfilled'
            ? settle[4].value : { type: 'ContextRailCollection', ways: [] } as ContextRailCollection;
        const trees = settle[5].status === 'fulfilled'
            ? settle[5].value : { type: 'ContextTreeCollection', trees: [] } as ContextTreeCollection;

        // §VEG-CANOPY-FROM-WOODS — fill the REAL wood/forest polygons with a deterministic
        // jittered grid. The polygon is OSM's claim; the positions are ours, and say so.
        const canopySources = parks.areas
            .filter((a) => CANOPY_SOURCE_KINDS.has(a.kind))
            .map((a) => ({ ring: a.ring, kind: a.kind, osmId: a.osmId }));
        const synth = synthesiseCanopies(canopySources, {
            site: { lat, lon },
            maxCount: PASTEL_CANOPY_MAX,
            maxRadiusM: PASTEL_CANOPY_RADIUS_M,
            mappedTrees: trees.trees,
        });

        const bySource: Record<string, GeoJSON.FeatureCollection> = {
            [PASTEL_SOURCES.roads]: roadsToGeoJson(roads),
            [PASTEL_SOURCES.water]: waterAreasToGeoJson(water),
            [PASTEL_SOURCES.waterways]: waterwaysToGeoJson(water),
            [PASTEL_SOURCES.parks]: parksToGeoJson(parks),
            [PASTEL_SOURCES.landuse]: landuseToGeoJson(landuse),
            [PASTEL_SOURCES.rail]: railToGeoJson(rail),
            [PASTEL_SOURCES.trees]: treesToGeoJson(trees, synth.canopies),
        };

        const failed = settle.filter((s) => s.status === 'rejected').length;
        const summary =
            `roads ${roads.ways.length} · water ${water.areas.length} area(s) + ${water.sea.length} sea + ` +
            `${water.ways.length} waterway(s) · parks ${parks.areas.length} · landuse ${landuse.areas.length} · ` +
            `rail ${rail.ways.length} · trees ${trees.trees.length} MAPPED + ${synth.canopies.length} SYNTHESISED ` +
            `canopies (scenery, from ${synth.polygonCount} real wood/forest polygon(s))` +
            (failed > 0 ? ` · ${failed} reader(s) REJECTED — those layers are empty because the read failed, not because the area is empty` : '');

        return {
            bySource,
            summary,
            mappedTrees: trees.trees.length,
            syntheticCanopies: synth.canopies.length,
        };
    } finally {
        span.end();
    }
}
