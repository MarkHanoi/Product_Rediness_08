// §VEG-REAL-CANOPY-BAKE (L-12935, founder 2026-09-05) — the CLIENT half: read the baked `canopy`
// layer and turn it into canopy instances the §FORMA-CTX-TREES primitive already draws.
//
// Sibling of contextTrees.ts, and deliberately shaped like it. The bake is
// tools/context-bake/canopy.mjs — one POINT per ~12 m cell where a MEASURED tree-cover-density
// raster reads ≥ 30 % crown cover (Copernicus HRL TCD 2018 at 10 m in Europe, NLCD Tree Canopy
// Cover 2021 at 30 m in the USA, Hansen/UMD Global Forest Change treecover2000 at 30 m everywhere
// else, so Australia, New Zealand and the Middle East are covered). That file's header carries the
// exact HTTP answer each source gave when it was probed.
//
// ── THREE VEGETATION SOURCES, THREE DIFFERENT CLAIMS. Never collapse them. ──────────────────────
//   • a MAPPED tree     — `trees.pmtiles`, OSM `natural=tree` node. Somebody surveyed that tree.
//     Neither `sampled` nor `synthetic`.
//   • a SAMPLED canopy  — THIS module. `sampled: true`. The COVER is measured and rides in `cover`;
//     the POSITION is a grid-cell centre plus a deterministic jitter. "The raster measures 74 %
//     canopy in this ~12 m cell", NEVER "there is a tree at these coordinates".
//   • a SYNTHETIC canopy — contextCanopySynth.ts (§VEG-CANOPY-FROM-WOODS, L-12934). The wood polygon
//     is real OSM; every position is invented. `synthetic: true`.
// C57 §1.5/§1.9 and C58 §1.2: each is labelled in the data AND counted separately in the log line.
//
// ⚠ SUPERSESSION, and why it is not merely a preference. Where this layer answers, the SYNTHESISED
// woods-fill must be SUPPRESSED — not added to. Both lay a grid over the same forest, so keeping
// both would double the crown density AND stack an invention on top of a measurement, which is the
// worst of the three outcomes: it would look like more evidence. contextCanopySynth's own header
// anticipated this ("when that layer is baked, its density replaces this module's flat
// CANOPY_GRID_SPACING_M"). The suppression is decided by `supersedesSynthesis` below, and the
// renderer's log says which source it drew.
//
// §CONTEXT-DATA-HONESTY. Baked-only, no live fallback: there is no Overpass query that returns a
// tree-cover raster, and pretending otherwise would be the L-469 shape. Un-baked → a quiet no-op;
// an honest empty `ok` → empty; `aborted` → empty; `unavailable` → empty plus a DEGRADED warning.
// Never throws, never fabricates a canopy.
//
// PURITY: everything except `fetchContextBakedCanopy` is pure — no Cesium, no THREE, no DOM, no
// clock, no Math.random — so apps/editor/src/ui/geospatial/__tests__/contextCanopyBaked.spec.ts
// pins it without a viewer.

import { contextBboxAround, CONTEXT_BBOX_HALF_DEG, type Bbox } from './contextBuildings';
import { readContextTileFeatures, type ContextTileFeature } from './contextTiles';
import { siteMetricFrame, type CanopyInstance } from './contextCanopySynth';

/** One baked cell: a MEASURED cover percentage at a SAMPLED position. */
export interface BakedCanopyPoint {
    readonly lon: number;
    readonly lat: number;
    /** Measured crown cover, percent, from `src`. Always 0–100 (the bake drops nodata at source). */
    readonly cover: number;
    /** The raster this cell was measured from — `eea-hrl-tcd-2018`, `nlcd-tcc-2021-conus`, … */
    readonly src: string;
    /** Observation year of `src`. Hansen's is 2000 and its loss is NOT subtracted — see `lossAdjusted`. */
    readonly vintage: number | null;
    /** `false` ⇒ canopy felled since `vintage` may still be present. Hansen treecover2000 is the case. */
    readonly lossAdjusted: boolean | null;
    /** Native resolution of the source raster, metres. */
    readonly resM: number | null;
}

/** A canopy instance whose POSITION is a raster sample. Same shape the tree primitive already draws. */
export interface SampledCanopy extends CanopyInstance {
    readonly sampled: true;
    readonly synthetic: false;
    readonly cover: number;
    readonly src: string;
}

export interface BakedCanopyCollection {
    readonly type: 'BakedCanopyCollection';
    readonly points: BakedCanopyPoint[];
    /** Distinct `src` ids present — a bbox on a national border can legitimately carry two. */
    readonly sources: string[];
    /** True when the layer answered `ok` (even with zero points). False for absent/unreadable. */
    readonly available: boolean;
}

/** Hard nearest-first cap. A closed-canopy tile is ~60 cells/ha by construction, so a 300 m radius
 *  can offer ~170 k candidates; the primitive draws one shared geometry but still pays per instance. */
export const MAX_SAMPLED_CANOPIES = 6000;
/** Crown radius varies 0.75–1.25× the shared geometry so a stand reads as individuals, not a stamp.
 *  Matches contextCanopySynth's range exactly: the two sources must be visually indistinguishable,
 *  because the difference between them is a PROVENANCE claim, not a look. */
const RADIUS_SCALE_MIN = 0.75;
const RADIUS_SCALE_MAX = 1.25;
const HEIGHT_SCALE_MIN = 0.8;
const HEIGHT_SCALE_MAX = 1.3;
/** Cover modulates the crown on top of the hash jitter: a measured 30 % cell gets a thinner crown
 *  than a measured 95 % one. This is the ONE place the measurement changes what is drawn, and it is
 *  bounded so a low-cover cell is never invisible and a high-cover one never a balloon. */
const COVER_SCALE_AT_THRESHOLD = 0.85;
const COVER_SCALE_AT_FULL = 1.15;

/** Deterministic 32-bit hash — same construction as contextCanopySynth.hashCell and canopy.mjs's, so
 *  all three vegetation sources jitter alike and a re-read reproduces the identical scatter. */
function hashPoint(a: number, b: number, salt: number): number {
    let h = (a | 0) * 0x27d4eb2d;
    h = (h ^ ((b | 0) * 0x165667b1)) >>> 0;
    h = (h ^ ((salt | 0) * 0x9e3779b1)) >>> 0;
    h = Math.imul(h ^ (h >>> 15), 0x85ebca6b) >>> 0;
    h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
    return (h ^ (h >>> 16)) >>> 0;
}

function unit(a: number, b: number, salt: number): number {
    return hashPoint(a, b, salt) / 0x1_0000_0000;
}

function numTag(tags: Record<string, string>, key: string): number | null {
    const raw = tags[key];
    if (raw === undefined) return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
}

/**
 * §CTX-PMTILES-READER — convert baked `canopy` tile features into `BakedCanopyPoint[]`.
 *
 * `canopy` is a POINT layer (`LAYER_IS_POINT.canopy = true`), so the reader carries each cell as a
 * degenerate one-vertex "ring" `[[lon,lat]]` — exactly as `trees` does, and this takes the first
 * vertex the same way. A feature without a finite `cover` is DROPPED rather than defaulted: the
 * whole point of this layer is that the number is measured, and a fabricated substitute would make
 * an unmeasured cell indistinguishable from a measured one.
 */
export function canopyFromTileFeatures(features: ContextTileFeature[]): BakedCanopyCollection {
    const points: BakedCanopyPoint[] = [];
    const sources = new Set<string>();
    for (const f of features) {
        const cover = numTag(f.tags, 'cover');
        if (cover === null || cover < 0 || cover > 100) continue;
        const src = f.tags['src'] ?? 'unknown';
        const vintage = numTag(f.tags, 'vintage');
        const lossRaw = f.tags['loss_adjusted'];
        const lossAdjusted = lossRaw === undefined ? null : (lossRaw === 'true' || lossRaw === '1');
        const resM = numTag(f.tags, 'res_m');
        for (const ring of f.rings) {
            const pt = ring[0];
            if (!pt || !Number.isFinite(pt[0]) || !Number.isFinite(pt[1])) continue;
            points.push({ lon: pt[0]!, lat: pt[1]!, cover, src, vintage, lossAdjusted, resM });
            sources.add(src);
        }
    }
    return { type: 'BakedCanopyCollection', points, sources: [...sources].sort(), available: true };
}

export function emptyBakedCanopy(available = false): BakedCanopyCollection {
    return { type: 'BakedCanopyCollection', points: [], sources: [], available };
}

/**
 * Radially cull about the site, sort NEAREST-FIRST, cap, and give each cell its deterministic crown
 * scales. Pure: same inputs ⇒ byte-identical output, so a terrain re-seat re-renders the same stand
 * rather than a fresh scatter.
 */
export function buildSampledCanopyInstances(
    points: ReadonlyArray<BakedCanopyPoint>,
    opts: {
        readonly site: { readonly lat: number; readonly lon: number };
        readonly maxRadiusM: number;
        readonly maxCount?: number;
        /** Mapped trees to keep clear of, so a real surveyed tree is never double-drawn. */
        readonly mappedTrees?: ReadonlyArray<{ readonly lon: number; readonly lat: number }>;
        readonly mappedTreeExclusionM?: number;
    },
): { readonly canopies: SampledCanopy[]; readonly available: number; readonly cappedAway: number; readonly excludedNearMappedTree: number } {
    const maxCount = opts.maxCount ?? MAX_SAMPLED_CANOPIES;
    if (maxCount <= 0 || points.length === 0) {
        return { canopies: [], available: points.length, cappedAway: 0, excludedNearMappedTree: 0 };
    }
    const frame = siteMetricFrame(opts.site);
    const exclusionM = opts.mappedTreeExclusionM ?? 2;
    const exclusionSq = exclusionM * exclusionM;

    // Mapped trees in the local metric frame, once — the exclusion test is per candidate.
    const mapped: Array<[number, number]> = [];
    for (const t of opts.mappedTrees ?? []) {
        mapped.push([frame.toX(t.lon), frame.toY(t.lat)]);
    }

    const kept: Array<{ p: BakedCanopyPoint; distM: number }> = [];
    let excludedNearMappedTree = 0;
    const radial = Number.isFinite(opts.maxRadiusM) ? opts.maxRadiusM : Infinity;
    for (const p of points) {
        const x = frame.toX(p.lon);
        const y = frame.toY(p.lat);
        const distM = Math.hypot(x, y);
        if (distM > radial) continue;
        let near = false;
        for (const [mx, my] of mapped) {
            const dx = x - mx; const dy = y - my;
            if (dx * dx + dy * dy <= exclusionSq) { near = true; break; }
        }
        if (near) { excludedNearMappedTree++; continue; }
        kept.push({ p, distM });
    }
    // Nearest-first, with a total order: ties break on lon then lat so the cap is deterministic even
    // when two cells sit at the same distance (they routinely do on a regular grid).
    kept.sort((a, b) => (a.distM - b.distM) || (a.p.lon - b.p.lon) || (a.p.lat - b.p.lat));
    const cappedAway = Math.max(0, kept.length - maxCount);
    const canopies: SampledCanopy[] = [];
    for (const { p, distM } of kept.slice(0, maxCount)) {
        // Quantise to ~1 cm so the hash is stable against any float noise in the tile decode.
        const qa = Math.round(p.lon * 1e7) | 0;
        const qb = Math.round(p.lat * 1e7) | 0;
        const coverT = Math.min(1, Math.max(0, (p.cover - 30) / 70));
        const coverScale = COVER_SCALE_AT_THRESHOLD + (COVER_SCALE_AT_FULL - COVER_SCALE_AT_THRESHOLD) * coverT;
        canopies.push({
            lon: p.lon,
            lat: p.lat,
            // NEGATIVE, like the synthesised ids, because it is NOT an OSM id — but a DIFFERENT
            // decade from contextCanopySynth's so the two can never collide in a caller's map.
            osmId: -2_000_000_000 - (hashPoint(qa, qb, 7) % 1_000_000_000),
            synthetic: false,
            sampled: true,
            cover: p.cover,
            src: p.src,
            radiusScale: (RADIUS_SCALE_MIN + (RADIUS_SCALE_MAX - RADIUS_SCALE_MIN) * unit(qa, qb, 3)) * coverScale,
            heightScale: HEIGHT_SCALE_MIN + (HEIGHT_SCALE_MAX - HEIGHT_SCALE_MIN) * unit(qa, qb, 5),
            distM,
        });
    }
    return { canopies, available: kept.length + excludedNearMappedTree, cappedAway, excludedNearMappedTree };
}

/**
 * Whether a measured canopy set SUPERSEDES the synthesised woods-fill for this site.
 *
 * A measurement beats a guess — but only where the measurement actually exists. A handful of cells
 * at the far edge of the bbox is not coverage of the site, and suppressing the synthesis on that
 * basis would REMOVE vegetation rather than improve it. So the test is a floor on the count, not
 * mere presence of the layer.
 */
export function supersedesSynthesis(sampledCount: number, minCells = 50): boolean {
    return sampledCount >= minCells;
}

/** Per-bbox cache — one read per site per session, exactly like contextTrees. */
const cache = new Map<string, BakedCanopyCollection>();

/**
 * §CTX-ONE-READ-PER-BBOX (L-585) EXTENDED TO CANOPY (L-13110, lane STARTUP-FIX 2026-09-07).
 *
 * ⚠ NOTHING IS CACHED HERE ON A NON-`ok` READ — which is exactly why this layer needed the guard
 * MORE than the ones that do. `canopy` is `optIn: true` in the bake and is absent from the live
 * tileset today, so every read is a non-`ok` read, and the cache above never fills. Before this
 * guard, `warmAllContextLayers` and `fetchContextCanopySet` (the canopy join, which reads trees +
 * parks + canopy in one `Promise.all`) each ran their own full `readContextTileFeatures`.
 * §CTX-KNOWN-MISSING bounds the SECOND one to a memo lookup — but only once the first has returned,
 * and the two overlap by construction.
 *
 * ⚠ THE SHARED READ TAKES NO ABORT SIGNAL (L-585); each caller honours its own after the await, so
 * an abort cancels the RENDER and not a read the other callers are awaiting (§L-579).
 */
const inFlight = new Map<string, Promise<BakedCanopyCollection>>();

function bboxKey(b: Bbox): string { return 'canopy:' + b.map((n) => n.toFixed(4)).join(','); }

/**
 * Read the baked `canopy` layer for the site bbox. Never throws; every non-`ok` status degrades to an
 * honest empty, and only `unavailable` warns (that is the one case where tiles ARE configured and
 * could not be read, which the operator needs to see).
 */
export async function fetchContextBakedCanopy(
    lat: number, lon: number, signal?: AbortSignal,
): Promise<BakedCanopyCollection> {
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || (lat === 0 && lon === 0)) {
        return emptyBakedCanopy();
    }
    const bbox = contextBboxAround(lat, lon, CONTEXT_BBOX_HALF_DEG);
    const key = bboxKey(bbox);
    const hit = cache.get(key);
    if (hit) return hit;

    // §CTX-ONE-READ-PER-BBOX (L-585 / L-13110) — de-duplicate ABOVE the tile read, see `inFlight`.
    let shared = inFlight.get(key);
    if (!shared) {
        shared = readCanopyForBbox(bbox, key).finally(() => { inFlight.delete(key); });
        inFlight.set(key, shared);
    }
    const collection = await shared;
    // ⚠ EACH CALLER HONOURS ITS OWN SIGNAL, AFTER THE SHARED READ (§L-579).
    if (signal?.aborted) return emptyBakedCanopy();
    return collection;
}

/** The ONE read for a bbox. Called only through `fetchContextBakedCanopy`, which owns the cache and
 *  the one-read-per-bbox guarantee. Never throws. ⚠ Takes NO `AbortSignal` by design — see `inFlight`. */
async function readCanopyForBbox(bbox: Bbox, key: string): Promise<BakedCanopyCollection> {
    const tiled = await readContextTileFeatures('canopy', bbox, undefined);
    if (tiled.status === 'ok') {
        const collection = canopyFromTileFeatures(tiled.features);
        cache.set(key, collection);
        console.log(
            `[gis] §VEG-REAL-CANOPY-BAKE canopy: ${collection.points.length} MEASURED cell(s) from ` +
                `${tiled.tilesRead} baked tile(s) in ${tiled.ms} ms ` +
                `[src ${collection.sources.join('+') || 'none'}] — cover measured, POSITION sampled (not mapped trees).`,
        );
        return collection;
    }
    if (tiled.status === 'unavailable') {
        console.warn(
            `[gis] §VEG-REAL-CANOPY-BAKE canopy: tiles configured but unreadable (${tiled.reason}) — ` +
                'rendering NO sampled canopy (baked-only layer; the woods-fill synthesis still runs).',
        );
    }
    return emptyBakedCanopy();
}

/** Test seam: clear the per-bbox cache AND the §CTX-ONE-READ-PER-BBOX in-flight map — a test that
 *  cleared only the first would still be handed the previous test's shared read. */
export function __clearBakedCanopyCache(): void { cache.clear(); inFlight.clear(); }
