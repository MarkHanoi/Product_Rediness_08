// §FORMA-CTX-TREES (L-642 Phase C — docs/03-execution/specs/SPEC-3D-SITE-PRODUCTION-CONTEXT.md §2)
//
// Sibling of contextParks.ts: reads the BAKED `trees` tile layer (`natural=tree` POINTS) for the site
// bbox and returns the tree positions for the Forma 3D-Site to draw as cheap, CAPPED, INSTANCED
// low-poly canopy blobs. Canopy AREAS (natural=wood / landuse=forest) already ride the `parks` layer;
// this layer is strictly the individually-mapped point trees. Visual-only — never touches the BIM
// model or the layout engine.
//
// ⚠ BINDING CONSTRAINT (ADR-0094 / memory `webgpu-heavy-scene-crash-and-instancing`): trees are the
// MOST NUMEROUS context element, so the RENDER must instance them into ONE primitive with a
// nearest-first count cap — never one entity per tree. That cap + instancing live in the renderer
// (CesiumViewport.loadContextTrees); this loader only supplies the honest point set.
//
// §CONTEXT-DATA-HONESTY. Like contextRail, this is a NEW, BAKED-ONLY layer (no live-Overpass
// fallback — a `natural=tree` Overpass query returns thousands of nodes and would reintroduce the
// exact unreliable hot path L-513 removes). Un-baked → a quiet no-op; an honest empty `ok` → empty;
// `aborted` → empty (§L-579); `unavailable` → empty + a DEGRADED warning, never fabricated trees.
// Never throws.

import { contextBboxAround, CONTEXT_BBOX_HALF_DEG, type Bbox } from './contextBuildings';
import { readContextTileFeatures, type ContextTileFeature } from './contextTiles';

export interface ContextTree {
    /** Tree position in lon/lat. */
    readonly lon: number;
    readonly lat: number;
    readonly osmId: number;
}
export interface ContextTreeCollection {
    readonly type: 'ContextTreeCollection';
    readonly trees: ContextTree[];
}

const cache = new Map<string, ContextTreeCollection>();

function bboxKey(b: Bbox): string { return 'trees:' + b.map((n) => n.toFixed(4)).join(','); }

export function emptyTreeCollection(): ContextTreeCollection {
    return { type: 'ContextTreeCollection', trees: [] };
}

/**
 * §CTX-PMTILES-READER — convert baked `trees` tile features into `ContextTree[]`. Trees are the ONLY
 * POINT layer (LAYER_IS_POINT.trees = true), so the reader carries each tree as a one-vertex "ring"
 * `[[lon,lat]]`; we take that first vertex as the position. `osmId` derives from the tile's stable
 * synthetic id (spaced by 16 so a multi-point feature never collides).
 */
function treesFromTileFeatures(features: ContextTileFeature[]): ContextTreeCollection {
    const trees: ContextTree[] = [];
    for (const f of features) {
        for (let ri = 0; ri < f.rings.length; ri++) {
            const pt = f.rings[ri]![0];
            if (!pt || !Number.isFinite(pt[0]) || !Number.isFinite(pt[1])) continue;
            trees.push({ lon: pt[0]!, lat: pt[1]!, osmId: f.syntheticId * 16 + ri });
        }
    }
    return { type: 'ContextTreeCollection', trees };
}

export async function fetchContextTrees(
    lat: number, lon: number, signal?: AbortSignal,
): Promise<ContextTreeCollection> {
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || (lat === 0 && lon === 0)) {
        return emptyTreeCollection();
    }
    const bbox = contextBboxAround(lat, lon, CONTEXT_BBOX_HALF_DEG);
    const key = bboxKey(bbox);
    const hit = cache.get(key);
    if (hit) return hit;

    const tiled = await readContextTileFeatures('trees', bbox, signal);
    if (tiled.status === 'ok') {
        const collection = treesFromTileFeatures(tiled.features);
        cache.set(key, collection);
        console.log(
            `[gis] §CTX-PMTILES-READER trees: ${collection.trees.length} tree(s) from ` +
                `${tiled.tilesRead} baked tile(s) in ${tiled.ms} ms.`,
        );
        return collection;
    }
    // §CONTEXT-DATA-HONESTY — anything but `ok` degrades to a quiet no-op (never fabricated trees).
    if (tiled.status === 'unavailable') {
        console.warn(
            `[gis] §CTX-PMTILES-READER trees: tiles configured but unreadable (${tiled.reason}) ` +
                '— rendering NO trees (no live-Overpass fallback for this baked-only layer).',
        );
    }
    return emptyTreeCollection();
}

// ── §VEG-CANOPY-FROM-WOODS (L-12934) ─────────────────────────────────────────
//
// Founder 2026-09-05, Córdoba Av. Gran Vía and Jouy-en-Josas beside Versailles: "missing a lot of
// vegetation — a lot of real trees". The console read `191 tree(s) from 30 baked tile(s)` →
// `75 low-poly blob(s)` beside `87 green area(s)`, because THIS layer is `natural=tree` NODES only
// while the canopy AREAS ride `parks` as flat polygons — so a forest rendered as a green carpet.
//
// The fix joins the two READERS (no bake change): the real `wood`/`forest` polygons from
// contextParks seed SYNTHESISED canopy positions (contextCanopySynth), which are merged with the
// mapped trees into ONE instanced set. Both reads are bbox-cached and the site's parks are already
// fetched for §FORMA-CTX-PARKS, so on a warm site this costs no network at all.
//
// ⚠ HONESTY (C57 §1.5/§1.9, C58 §1.2). The polygons are REAL OSM; the synthesised POSITIONS are not.
// Every synthesised instance carries `synthetic: true` and a negative id, and the renderer's log line
// counts the two apart. The real per-tree source is the companion lane VEG-REAL-CANOPY-BAKE
// (Copernicus HRL Tree Cover Density). Never throws: a failed parks read degrades to mapped trees only.

import { fetchContextParks } from './contextParks';
import {
    buildCanopySet, MAX_MAPPED_TREES, MAX_SYNTHESISED_CANOPIES,
    type CanopySet, type CanopySourcePolygon,
} from './contextCanopySynth';
// §VEG-REAL-CANOPY-BAKE (L-12935) — the MEASURED source: one cell per ~12 m where a national/global
// tree-cover-density raster reads ≥ 30 % crown cover. Its own header carries the probes + the rules.
import {
    buildSampledCanopyInstances, emptyBakedCanopy, fetchContextBakedCanopy,
    MAX_SAMPLED_CANOPIES, supersedesSynthesis,
} from './contextCanopyBaked';

export interface ContextCanopySet extends CanopySet {
    /** Mapped trees the baked `trees` layer returned for the bbox, BEFORE the radial cull + cap. */
    readonly bakedTreeCount: number;
    /** Green areas the `parks` reader returned, of every kind — the synthesis uses the wood/forest subset. */
    readonly greenAreaCount: number;
    /** §VEG-REAL-CANOPY-BAKE (L-12935) — how many of `instances` are SAMPLED from a measured
     *  tree-cover raster (`sampled: true`). Counted apart from `mappedCount` and `syntheticCount`
     *  because the three make DIFFERENT claims (C57 §1.5/§1.9): surveyed / measured-cover-sampled-
     *  position / invented-position. Never summed into one "trees" number. */
    readonly sampledCount: number;
    /** Distinct raster ids behind `sampledCount` — e.g. `eea-hrl-tcd-2018`. Empty when none. */
    readonly sampledSources: string[];
    /** True when the measured canopy SUPERSEDED the woods-fill synthesis for this site (see
     *  contextCanopyBaked.supersedesSynthesis). When true, `syntheticCount` is 0 BY DESIGN — the two
     *  grids cover the same forest, so keeping both would double the density and stack an invention
     *  on a measurement. */
    readonly sampledSupersededSynthesis: boolean;
}

/**
 * The ONE instance set the §FORMA-CTX-TREES primitive draws: mapped `natural=tree` nodes PLUS
 * canopies synthesised inside the real `natural=wood` / `landuse=forest` rings.
 *
 * Reads BOTH baked layers (each cached per bbox, each honest-empty on absence) and folds them with
 * the pure `buildCanopySet`. Pure logic lives in contextCanopySynth.ts; this is only the join.
 * Never throws — a parks failure degrades to mapped trees only, never to fabricated polygons.
 */
export async function fetchContextCanopySet(
    lat: number,
    lon: number,
    opts: {
        readonly maxRadiusM: number; readonly maxMapped?: number; readonly maxSynthetic?: number;
        /** §VEG-REAL-CANOPY-BAKE — cap on MEASURED cells. Default `MAX_SAMPLED_CANOPIES`. */
        readonly maxSampled?: number;
    },
    signal?: AbortSignal,
): Promise<ContextCanopySet> {
    const empty: ContextCanopySet = {
        instances: [], mappedCount: 0, syntheticCount: 0, mappedAvailable: 0, polygonCount: 0,
        excludedNearMappedTree: 0, syntheticCappedAway: 0, bakedTreeCount: 0, greenAreaCount: 0,
        sampledCount: 0, sampledSources: [], sampledSupersededSynthesis: false,
    };
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || (lat === 0 && lon === 0)) return empty;

    const [trees, parks, baked] = await Promise.all([
        fetchContextTrees(lat, lon, signal).catch(() => emptyTreeCollection()),
        fetchContextParks(lat, lon, signal).catch(() => ({ type: 'ContextParkCollection' as const, areas: [] })),
        // §VEG-REAL-CANOPY-BAKE (L-12935) — the MEASURED third source, read in the same parallel batch
        // (each layer is bbox-cached, so on a warm site this costs no network at all).
        fetchContextBakedCanopy(lat, lon, signal).catch(() => emptyBakedCanopy()),
    ]);
    if (signal?.aborted) return empty;

    // §VEG-REAL-CANOPY-BAKE — the measured cells, radially culled + capped nearest-first, kept clear
    // of the mapped trees so a surveyed tree is never double-drawn under a sampled crown.
    const sampled = buildSampledCanopyInstances(baked.points, {
        site: { lat, lon },
        maxRadiusM: opts.maxRadiusM,
        maxCount: opts.maxSampled ?? MAX_SAMPLED_CANOPIES,
        mappedTrees: trees.trees,
    });
    // ⚠ SUPERSESSION, not addition. Both grids cover the same forest; drawing both would DOUBLE the
    // crown density and stack an invented position on top of a measured one — which would read as
    // more evidence, not less. Where the measurement has real coverage here, the synthesis stands down.
    const superseded = supersedesSynthesis(sampled.canopies.length);

    const set = buildCanopySet(
        trees.trees,
        parks.areas as ReadonlyArray<CanopySourcePolygon>,
        {
            site: { lat, lon },
            maxRadiusM: opts.maxRadiusM,
            maxMapped: opts.maxMapped ?? MAX_MAPPED_TREES,
            maxSynthetic: superseded ? 0 : (opts.maxSynthetic ?? MAX_SYNTHESISED_CANOPIES),
        },
    );
    return {
        ...set,
        instances: [...set.instances, ...sampled.canopies],
        bakedTreeCount: trees.trees.length,
        greenAreaCount: parks.areas.length,
        sampledCount: sampled.canopies.length,
        sampledSources: baked.sources,
        sampledSupersededSynthesis: superseded,
    };
}
