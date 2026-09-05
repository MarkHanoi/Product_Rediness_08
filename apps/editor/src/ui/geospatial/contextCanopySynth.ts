// §VEG-CANOPY-FROM-WOODS (L-12934, founder 2026-09-05) — synthesised canopies INSIDE wood/forest polygons.
//
// THE DEFECT. Córdoba, Av. Gran Vía park: "more trees than it renders". Jouy-en-Josas beside
// Versailles: "missing a lot of vegetation — a lot of real trees". The console at Jouy read
//     trees: 191 tree(s) from 30 baked tile(s)  →  75 low-poly blob(s)
//     parks: 87 green area(s)
// because the baked `trees` layer is `n/natural=tree` NODES ONLY (tools/context-bake/bake.mjs,
// LAYERS.trees) — the individually-mapped street and park trees — while the canopy AREAS
// (`natural=wood`, `landuse=forest`) ride the `parks` layer as flat green polygons (bake.mjs
// LAYERS.parks → contextParks.ts → CesiumViewport §FORMA-CTX-PARKS). A forest therefore rendered as
// a green carpet with the handful of blobs somebody happened to map as nodes inside it.
//
// WHAT IS DATA-BACKED, AND WHAT IS NOT — read this before quoting the output as "trees".
//   • The POLYGON is real. Every canopy this module emits sits inside an OSM `natural=wood` or
//     `landuse=forest` ring the bake carried and the reader (`contextParks.parksFromTileFeatures`)
//     classified by the OSM tag that rode along in the tile. "There is a wood here" is OSM's claim.
//     (A reader polygon is a TILE-CLIPPED piece of the OSM way/relation — one wood can arrive as
//     several rings; `claimed` below stops the overlap between pieces from seeding twice.)
//   • The POSITIONS are SYNTHETIC. OSM does not map the trees of a wood; this module lays a jittered
//     grid inside the ring at a stand density chosen by eye (see the constants). No point here
//     corresponds to a real tree. Every output carries `synthetic: true`, a NEGATIVE `osmId` (never
//     an OSM id), and the renderer's log line counts them SEPARATELY from the mapped trees
//     (C57 §1.5 / §1.9, C58 §1.2 — a synthesis is labelled in the data and in the log, and is never
//     presented as the real thing).
//   • The REAL per-tree source is the companion lane VEG-REAL-CANOPY-BAKE (Copernicus HRL Tree Cover
//     Density, 10 m raster): when that layer is baked, its density replaces this module's flat
//     `CANOPY_GRID_SPACING_M` — the grid stays, the per-cell KEEP decision becomes measured. Until
//     then this is an honest placeholder that makes a forest read as a forest, not a lawn.
//
// PURITY. No Cesium, no THREE, no DOM, no clock, no Math.random: every jitter, radius and height
// comes from a deterministic 32-bit integer hash of the grid CELL, so two calls with the same inputs
// produce byte-identical output and a terrain re-seat (`rebuildContextTreesForBase`) re-synthesises
// the SAME canopies rather than a fresh scatter. Point-in-ring is the kernel's `pointInRingEvenOdd`
// (memory `grep-for-the-existing-solver-first`); holes are honoured when the caller carries them.
//
// ⚠ STATE THIS PLAINLY: TODAY THE CALLER CARRIES NONE. `contextTiles.ringsFor` keeps OUTER rings
// only for the `parks` layer, so `holes` arrives empty and a wood with a clearing is filled edge to
// edge — a known, bounded overstatement of canopy, not a claim that the clearing has trees. The
// hole path here is written and TESTED (`contextCanopySynth.spec.ts`) so that the day the parks
// reader forwards inner rings, the clearing is honoured with no change on this side.

import { pointInRingEvenOdd } from '@pryzm/geometry-kernel';

// ── constants (each with its one-line rationale) ─────────────────────────────

/** 9 m grid pitch ≈ 123 canopies/ha — the visible-canopy density of a mature managed European
 *  broadleaf stand (100–150 crowns/ha); denser reads as scrub, sparser as parkland. */
export const CANOPY_GRID_SPACING_M = 9;
/** ±30 % of the pitch — enough that the grid reads as a wood not an orchard, while two neighbours can
 *  never sit closer than (1 − 2·0.3) = 0.4 × pitch (3.6 m at 9 m), so crowns overlap but never coincide. */
export const CANOPY_JITTER_FRACTION = 0.3;
/** A synthesised canopy within 2 m of a MAPPED tree would draw a double blob over a real one. */
export const MAPPED_TREE_EXCLUSION_M = 2;
/** Crown radius varies 0.75–1.25× the shared geometry so the stand reads as individuals, not a stamp. */
export const CANOPY_RADIUS_SCALE_MIN = 0.75;
export const CANOPY_RADIUS_SCALE_MAX = 1.25;
/** Crown height varies 0.8–1.3× — a wood has an uneven canopy top; a park row does not. */
export const CANOPY_HEIGHT_SCALE_MIN = 0.8;
export const CANOPY_HEIGHT_SCALE_MAX = 1.3;
/** ONLY these `ContextParkKind`s are canopy areas. `park` / `grass` are lawns (their trees are the
 *  mapped nodes, or nothing); `other` is scrub / heath / meadow we cannot honestly fill. */
export const CANOPY_SOURCE_KINDS: ReadonlySet<string> = new Set(['wood', 'forest']);

/** Metres per degree of latitude (WGS 84 mean) — the local equirectangular frame the grid lives in. */
const METRES_PER_DEG_LAT = 110_574;
/** Metres per degree of longitude AT THE EQUATOR; scaled by cos(lat) at the site. */
const METRES_PER_DEG_LON_EQUATOR = 111_320;

// ── types ────────────────────────────────────────────────────────────────────

/**
 * The ONE shape the §FORMA-CTX-TREES renderer consumes for EVERY canopy, mapped or synthesised.
 * `synthetic` is the honesty bit; the two scales ride the instance matrix (one shared geometry).
 */
export interface CanopyInstance {
    readonly lon: number;
    readonly lat: number;
    /** A mapped tree's reader id (positive) — or, for a synthesised canopy, a NEGATIVE cell id. */
    readonly osmId: number;
    readonly synthetic: boolean;
    readonly radiusScale: number;
    readonly heightScale: number;
    /** Planar distance from the site origin, metres — carried so nearest-first cuts are free. */
    readonly distM: number;
}

export interface SynthesisedCanopy extends CanopyInstance {
    readonly synthetic: true;
    /** The REAL polygon this canopy was seeded inside (`ContextParkArea.osmId`). */
    readonly sourceOsmId: number;
}

/** A candidate source polygon — the `ContextParkArea` shape plus the optional holes a future reader may carry. */
export interface CanopySourcePolygon {
    /** Closed outer ring as [lon,lat] pairs. */
    readonly ring: ReadonlyArray<readonly [number, number]>;
    /** Inner rings (holes) as [lon,lat] pairs — a point inside any hole is NOT inside the polygon. */
    readonly holes?: ReadonlyArray<ReadonlyArray<readonly [number, number]>>;
    /** `ContextParkKind` — only `CANOPY_SOURCE_KINDS` are filled. */
    readonly kind: string;
    readonly osmId: number;
}

export interface CanopySynthOptions {
    /** The site origin — the local metric frame and the nearest-first ordering are about it. */
    readonly site: { readonly lat: number; readonly lon: number };
    /** Hard nearest-first cap on the output. `≤ 0` ⇒ no synthesis at all. */
    readonly maxCount: number;
    /** Radial cull about the site, metres. Omit / non-finite ⇒ no radial cull. */
    readonly maxRadiusM?: number;
    /** Grid pitch, metres. Default `CANOPY_GRID_SPACING_M`. */
    readonly spacingM?: number;
    /** MAPPED trees to keep clear of (`MAPPED_TREE_EXCLUSION_M`). */
    readonly mappedTrees?: ReadonlyArray<{ readonly lon: number; readonly lat: number }>;
    /** Override of `MAPPED_TREE_EXCLUSION_M` (tests). */
    readonly mappedTreeExclusionM?: number;
}

export interface CanopySynthResult {
    /** Nearest-first, capped at `maxCount`. */
    readonly canopies: SynthesisedCanopy[];
    /** Wood/forest polygons that were considered (kind ∈ CANOPY_SOURCE_KINDS, ≥ 4 vertices). */
    readonly polygonCount: number;
    /** Grid points that landed inside a ring (and outside every hole) BEFORE exclusion + cap. */
    readonly candidateCount: number;
    /** Candidates dropped for sitting within the exclusion radius of a mapped tree. */
    readonly excludedNearMappedTree: number;
    /** Candidates dropped by the nearest-first cap. */
    readonly cappedAway: number;
}

// ── local metric frame ───────────────────────────────────────────────────────

/** Local equirectangular metres about a site — shared by the synthesis and the mapped-tree cull in
 *  contextTrees.ts so both distances are measured in the SAME frame (one nearest-first ordering). */
export interface SiteMetricFrame {
    readonly toX: (lon: number) => number;
    readonly toY: (lat: number) => number;
    readonly toLon: (x: number) => number;
    readonly toLat: (y: number) => number;
}

/** Exact enough at the ≤ 1 km the render radius spans (sub-metre error). */
export function siteMetricFrame(site: { readonly lat: number; readonly lon: number }): SiteMetricFrame {
    const mPerDegLon = METRES_PER_DEG_LON_EQUATOR * Math.cos((site.lat * Math.PI) / 180);
    return {
        toX: (lon) => (lon - site.lon) * mPerDegLon,
        toY: (lat) => (lat - site.lat) * METRES_PER_DEG_LAT,
        toLon: (x) => site.lon + x / mPerDegLon,
        toLat: (y) => site.lat + y / METRES_PER_DEG_LAT,
    };
}

// ── deterministic hash ───────────────────────────────────────────────────────

/**
 * 32-bit integer mix of (cell x, cell y, salt) — murmur3's fmix finaliser over a golden-ratio
 * pre-mix. Integer-only (`Math.imul`), so it is identical across engines and across calls.
 */
export function hashCell(ix: number, iy: number, salt: number): number {
    let h = Math.imul(ix | 0, 0x9E3779B1) ^ Math.imul(iy | 0, 0x85EBCA77) ^ Math.imul(salt | 0, 0xC2B2AE3D);
    h ^= h >>> 16; h = Math.imul(h, 0x85EBCA6B);
    h ^= h >>> 13; h = Math.imul(h, 0xC2B2AE35);
    h ^= h >>> 16;
    return h >>> 0;
}

/** `hashCell` mapped onto [0, 1). */
function unit(ix: number, iy: number, salt: number): number {
    return hashCell(ix, iy, salt) / 4_294_967_296;
}

const SALT_JITTER_X = 1;
const SALT_JITTER_Y = 2;
const SALT_RADIUS = 3;
const SALT_HEIGHT = 4;

/** The NEGATIVE, never-an-OSM-id identity of a synthesised canopy: −(1 + cell hash). */
function syntheticOsmId(ix: number, iy: number): number {
    return -(1 + hashCell(ix, iy, 0));
}

// ── geometry helpers (local metric frame) ────────────────────────────────────

interface LocalRing { readonly xs: Float64Array; readonly ys: Float64Array; readonly n: number }

function inLocalRing(r: LocalRing, px: number, py: number): boolean {
    return pointInRingEvenOdd(px, py, r.n, (i) => r.xs[i]!, (i) => r.ys[i]!);
}

// ── the synthesis ────────────────────────────────────────────────────────────

/**
 * Lay a jittered grid of canopies inside every wood/forest polygon, nearest-first about the site.
 * Pure + deterministic; never throws on malformed input (a bad ring is skipped, not fatal).
 */
export function synthesiseCanopies(
    polys: ReadonlyArray<CanopySourcePolygon>,
    opts: CanopySynthOptions,
): CanopySynthResult {
    const empty: CanopySynthResult = {
        canopies: [], polygonCount: 0, candidateCount: 0, excludedNearMappedTree: 0, cappedAway: 0,
    };
    const site = opts.site;
    if (!site || !Number.isFinite(site.lat) || !Number.isFinite(site.lon)) return empty;
    const maxCount = Number.isFinite(opts.maxCount) ? Math.floor(opts.maxCount) : 0;
    if (maxCount <= 0) return empty;
    const spacing = Number.isFinite(opts.spacingM) && (opts.spacingM as number) > 0
        ? (opts.spacingM as number) : CANOPY_GRID_SPACING_M;
    const maxRadius = typeof opts.maxRadiusM === 'number' && Number.isFinite(opts.maxRadiusM) && opts.maxRadiusM > 0
        ? opts.maxRadiusM : Infinity;
    const exclusion = typeof opts.mappedTreeExclusionM === 'number' && Number.isFinite(opts.mappedTreeExclusionM)
        ? Math.max(0, opts.mappedTreeExclusionM) : MAPPED_TREE_EXCLUSION_M;

    const { toX, toY, toLon, toLat } = siteMetricFrame(site);

    // Mapped trees bucketed on an `exclusion`-sized grid so the 3×3 neighbourhood holds every tree
    // within `exclusion` metres — O(1) per candidate instead of O(mapped).
    const bucketSize = exclusion > 0 ? exclusion : 1;
    const buckets = new Map<string, number[]>(); // "bx,by" → flat [x0,y0,x1,y1,…]
    if (exclusion > 0 && opts.mappedTrees) {
        for (const t of opts.mappedTrees) {
            if (!Number.isFinite(t.lon) || !Number.isFinite(t.lat)) continue;
            const x = toX(t.lon), y = toY(t.lat);
            const key = `${Math.floor(x / bucketSize)},${Math.floor(y / bucketSize)}`;
            const arr = buckets.get(key);
            if (arr) arr.push(x, y); else buckets.set(key, [x, y]);
        }
    }
    const nearMappedTree = (x: number, y: number): boolean => {
        if (buckets.size === 0) return false;
        const bx = Math.floor(x / bucketSize), by = Math.floor(y / bucketSize);
        const r2 = exclusion * exclusion;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
            const arr = buckets.get(`${bx + dx},${by + dy}`);
            if (!arr) continue;
            for (let i = 0; i < arr.length; i += 2) {
                const ddx = arr[i]! - x, ddy = arr[i + 1]! - y;
                if (ddx * ddx + ddy * ddy <= r2) return true;
            }
        }
        return false;
    };

    const jitterHalf = CANOPY_JITTER_FRACTION * spacing;
    const claimed = new Set<string>(); // cells already holding a canopy — overlapping polygons never double up.
    const out: SynthesisedCanopy[] = [];
    let polygonCount = 0, candidateCount = 0, excluded = 0;

    for (const poly of polys) {
        if (!poly || !CANOPY_SOURCE_KINDS.has(poly.kind)) continue;
        const ring = poly.ring;
        if (!ring || ring.length < 4) continue;
        // Project the outer ring; track its bbox.
        const n = ring.length;
        const xs = new Float64Array(n), ys = new Float64Array(n);
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity, bad = false;
        for (let i = 0; i < n; i++) {
            const p = ring[i]!;
            const x = toX(p[0]), y = toY(p[1]);
            if (!Number.isFinite(x) || !Number.isFinite(y)) { bad = true; break; }
            xs[i] = x; ys[i] = y;
            if (x < minX) minX = x; if (x > maxX) maxX = x;
            if (y < minY) minY = y; if (y > maxY) maxY = y;
        }
        if (bad) continue;
        polygonCount++;
        const outer: LocalRing = { xs, ys, n };
        const holes: LocalRing[] = [];
        for (const h of poly.holes ?? []) {
            if (!h || h.length < 4) continue;
            const hn = h.length;
            const hx = new Float64Array(hn), hy = new Float64Array(hn);
            for (let i = 0; i < hn; i++) { hx[i] = toX(h[i]![0]); hy[i] = toY(h[i]![1]); }
            holes.push({ xs: hx, ys: hy, n: hn });
        }
        // Cell range = polygon bbox ∩ the radial disc's bbox (the disc itself is tested per point).
        if (Number.isFinite(maxRadius)) {
            minX = Math.max(minX, -maxRadius); maxX = Math.min(maxX, maxRadius);
            minY = Math.max(minY, -maxRadius); maxY = Math.min(maxY, maxRadius);
            if (minX > maxX || minY > maxY) continue;
        }
        // Widen by one cell each side so a jittered point of a boundary cell is not pre-culled.
        const ix0 = Math.floor(minX / spacing) - 1, ix1 = Math.floor(maxX / spacing) + 1;
        const iy0 = Math.floor(minY / spacing) - 1, iy1 = Math.floor(maxY / spacing) + 1;
        for (let iy = iy0; iy <= iy1; iy++) {
            for (let ix = ix0; ix <= ix1; ix++) {
                const key = `${ix},${iy}`;
                if (claimed.has(key)) continue;
                const px = (ix + 0.5) * spacing + (unit(ix, iy, SALT_JITTER_X) * 2 - 1) * jitterHalf;
                const py = (iy + 0.5) * spacing + (unit(ix, iy, SALT_JITTER_Y) * 2 - 1) * jitterHalf;
                const distM = Math.hypot(px, py);
                if (distM > maxRadius) continue;
                if (px < minX || px > maxX || py < minY || py > maxY) continue; // cheap bbox reject.
                if (!inLocalRing(outer, px, py)) continue;
                let inHole = false;
                for (const h of holes) { if (inLocalRing(h, px, py)) { inHole = true; break; } }
                if (inHole) continue;
                claimed.add(key);
                candidateCount++;
                if (nearMappedTree(px, py)) { excluded++; continue; }
                out.push({
                    lon: toLon(px),
                    lat: toLat(py),
                    osmId: syntheticOsmId(ix, iy),
                    synthetic: true,
                    radiusScale: CANOPY_RADIUS_SCALE_MIN + (CANOPY_RADIUS_SCALE_MAX - CANOPY_RADIUS_SCALE_MIN) * unit(ix, iy, SALT_RADIUS),
                    heightScale: CANOPY_HEIGHT_SCALE_MIN + (CANOPY_HEIGHT_SCALE_MAX - CANOPY_HEIGHT_SCALE_MIN) * unit(ix, iy, SALT_HEIGHT),
                    distM,
                    sourceOsmId: poly.osmId,
                });
            }
        }
    }

    // Nearest-first about the site; the cap drops the FARTHEST, never an arbitrary slice.
    out.sort((a, b) => a.distM - b.distM || a.osmId - b.osmId);
    const cappedAway = Math.max(0, out.length - maxCount);
    return {
        canopies: cappedAway > 0 ? out.slice(0, maxCount) : out,
        polygonCount,
        candidateCount,
        excludedNearMappedTree: excluded,
        cappedAway,
    };
}

// ── the merge: mapped trees + synthesised canopies as ONE instance set ───────

/**
 * MAPPED trees kept — the shipped §FORMA-CTX-TREES cap, deliberately UNCHANGED. A real tree always
 * outranks a synthesised one, so this cap is applied to the mapped set on its own.
 */
export const MAX_MAPPED_TREES = 1500;
/**
 * SYNTHESISED canopies kept. 4× the mapped cap because a wood needs AREA coverage, not landmarks:
 * at `CANOPY_GRID_SPACING_M` this is ~49 ha of continuous canopy — larger than any wood that fits
 * inside the ~890 m near disc — so the cap is a safety bound, not the thing that shapes the render.
 * One shared geometry + one shared material means 7500 total instances is still ONE draw call
 * (ADR-0094 / `webgpu-heavy-scene-crash-and-instancing`).
 */
export const MAX_SYNTHESISED_CANOPIES = 6000;

/** A mapped tree as the reader hands it over (`contextTrees.ContextTree`). */
export interface MappedTreeInput {
    readonly lon: number;
    readonly lat: number;
    readonly osmId: number;
}

export interface CanopySetOptions {
    readonly site: { readonly lat: number; readonly lon: number };
    /** Radial cull, metres — the renderer's near disc. Omit ⇒ no radial cull. */
    readonly maxRadiusM?: number;
    /** Default `MAX_MAPPED_TREES`. */
    readonly maxMapped?: number;
    /** Default `MAX_SYNTHESISED_CANOPIES`. `0` ⇒ mapped trees only (the pre-lane render). */
    readonly maxSynthetic?: number;
    /** Grid pitch, metres. Default `CANOPY_GRID_SPACING_M`. */
    readonly spacingM?: number;
}

export interface CanopySet {
    /** Mapped + synthesised in ONE array, NEAREST-FIRST — the single instanced primitive's input. */
    readonly instances: CanopyInstance[];
    /** How many of `instances` are real mapped OSM trees. */
    readonly mappedCount: number;
    /** How many of `instances` are SYNTHETIC (`synthetic: true`) — logged SEPARATELY (C57 §1.5). */
    readonly syntheticCount: number;
    /** Mapped trees inside the radius BEFORE the mapped cap — so a cap bite is visible in the log. */
    readonly mappedAvailable: number;
    /** Wood/forest polygons the synthesis actually seeded from. */
    readonly polygonCount: number;
    /** Synthesised candidates dropped for sitting on top of a mapped tree. */
    readonly excludedNearMappedTree: number;
    /** Synthesised candidates dropped by `maxSynthetic`. */
    readonly syntheticCappedAway: number;
}

/**
 * Fold the two honest sources into the ONE set the §FORMA-CTX-TREES primitive draws.
 *
 * ORDER OF OPERATIONS, and why:
 *   1. Mapped trees are culled to the radius and sorted nearest-first, then capped. Real beats
 *      synthetic, so the mapped cap is spent before a single canopy is synthesised.
 *   2. The synthesis is told to avoid the RADIUS-CULLED mapped set — NOT the capped one. A tree the
 *      cap dropped is invisible, so covering it would be harmless; but keying the exclusion on the
 *      pre-cap set keeps the synthesised positions stable when the cap moves, which is the whole
 *      point of determinism here (a terrain re-seat must re-synthesise the SAME canopies).
 *   3. Both are merged and re-sorted nearest-first so the renderer's iteration order is meaningful
 *      even if it ever truncates.
 *
 * MAPPED TREES KEEP `radiusScale`/`heightScale` = 1. Their POSITION is OSM's claim; their crown size
 * is not, and jittering it would blur the one line this module has to keep sharp — what is measured
 * and what is invented. Only synthesised canopies vary.
 *
 * Pure + deterministic; never throws.
 */
export function buildCanopySet(
    mapped: ReadonlyArray<MappedTreeInput>,
    polys: ReadonlyArray<CanopySourcePolygon>,
    opts: CanopySetOptions,
): CanopySet {
    const site = opts.site;
    const emptySet: CanopySet = {
        instances: [], mappedCount: 0, syntheticCount: 0, mappedAvailable: 0,
        polygonCount: 0, excludedNearMappedTree: 0, syntheticCappedAway: 0,
    };
    if (!site || !Number.isFinite(site.lat) || !Number.isFinite(site.lon)) return emptySet;

    const maxRadius = typeof opts.maxRadiusM === 'number' && Number.isFinite(opts.maxRadiusM) && opts.maxRadiusM > 0
        ? opts.maxRadiusM : Infinity;
    const maxMapped = Number.isFinite(opts.maxMapped) ? Math.max(0, Math.floor(opts.maxMapped as number)) : MAX_MAPPED_TREES;
    const maxSynthetic = Number.isFinite(opts.maxSynthetic) ? Math.max(0, Math.floor(opts.maxSynthetic as number)) : MAX_SYNTHESISED_CANOPIES;
    const { toX, toY } = siteMetricFrame(site);

    // 1. Mapped trees — radial cull, nearest-first, then the mapped cap.
    const inRange: CanopyInstance[] = [];
    for (const t of mapped) {
        if (!t || !Number.isFinite(t.lon) || !Number.isFinite(t.lat)) continue;
        const distM = Math.hypot(toX(t.lon), toY(t.lat));
        if (distM > maxRadius) continue;
        inRange.push({
            lon: t.lon, lat: t.lat, osmId: t.osmId, synthetic: false,
            radiusScale: 1, heightScale: 1, distM,
        });
    }
    inRange.sort((a, b) => a.distM - b.distM || a.osmId - b.osmId);
    const mappedKept = inRange.length > maxMapped ? inRange.slice(0, maxMapped) : inRange;

    // 2. Synthesis, avoiding every mapped tree in range (see the note above).
    const synth = synthesiseCanopies(polys, {
        site,
        maxCount: maxSynthetic,
        ...(Number.isFinite(maxRadius) ? { maxRadiusM: maxRadius } : {}),
        ...(opts.spacingM !== undefined ? { spacingM: opts.spacingM } : {}),
        mappedTrees: inRange,
    });

    // 3. One nearest-first set. A tie puts the REAL tree first — a deterministic, honest tiebreak.
    const instances: CanopyInstance[] = [...mappedKept, ...synth.canopies];
    instances.sort((a, b) =>
        a.distM - b.distM
        || (a.synthetic === b.synthetic ? 0 : a.synthetic ? 1 : -1)
        || a.osmId - b.osmId);

    return {
        instances,
        mappedCount: mappedKept.length,
        syntheticCount: synth.canopies.length,
        mappedAvailable: inRange.length,
        polygonCount: synth.polygonCount,
        excludedNearMappedTree: synth.excludedNearMappedTree,
        syntheticCappedAway: synth.cappedAway,
    };
}
