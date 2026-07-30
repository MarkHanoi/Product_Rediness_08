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
