// §CTX-PMTILES-READER (L-513b) — read the BAKED static context tiles instead of querying the
// live public Overpass API at runtime.
//
// WHY THIS EXISTS
// ---------------
// L-513 root-caused the 3D-Site context slowness as **unfixable in the client**: the footprints
// came from the public Overpass API on the hot path, which returns 406s, 45-second hangs, 429s and
// 504s — and, worst of all, reports errors IN BAND as `HTTP 200 + a "remark" field`, i.e. a failure
// byte-identical to "there is nothing here" (the §CONTEXT-DATA-HONESTY family, L-422/457/467/469).
// Everything shipped before this (L-524a parcel-centroid prefetch, L-531 non-blocking far ring,
// L-534 dead-CORS-mirror removal, the 600 ms roads deadline) MITIGATES an unreliable third party.
// None of it can make Overpass dependable, because the problem is not in our code. This module
// removes the dependency from the hot path entirely: the context is baked ONCE
// (`tools/context-bake/`, from Geofabrik's static Cataluña extract) into PMTiles on object storage
// and read here over HTTP range requests — static bytes, CDN-cached, no rate limit, no query
// planner, no third-party availability in the loop.
//
// HONESTY CONTRACT — the whole point of the exercise
// --------------------------------------------------
// ⚠ This reader NEVER collapses a failure into an empty result. `readContextTileFeatures` returns a
// DISCRIMINATED result (`ok` / `unavailable` / `disabled`), because "the range requests all failed"
// and "this tile genuinely contains no buildings" are the same VALUE and must not be the same
// ANSWER — that conflation IS L-467/L-469. Callers use the discriminator to decide whether falling
// back to Overpass is warranted; an honest empty must NOT trigger a fallback, and an honest failure
// must not be rendered as "no context here".
//
// GEOMETRY DEFENSIVENESS — probed, not assumed (2026-07-21)
// ---------------------------------------------------------
// A live probe of the baked `buildings.pmtiles` found, in a single Gòtic tile:
//     LineString: 362 features (all carry building=*)   Polygon: 362 features (identical tags)
//     Point:      678 features (0 carry building=*; every one is an `entrance=*` node)
// i.e. `osmium export` emitted EVERY building TWICE — once as the closed way (LineString) and once
// as the assembled area (Polygon) — and dragged in the tagged `entrance` nodes as points. Rendering
// the layer naively would double-count every footprint and extrude a cloud of doorways. So this
// reader keeps ONLY polygonal geometry carrying the layer's defining tag, and treats the tile's
// geometry type as untrusted input. `tools/context-bake/bake.mjs` has been corrected to emit one
// geometry class per layer, but the reader must stay defensive regardless of which bake it meets —
// the tiles are a separately-deployed artefact and can be older than the code reading them.
//
// TILE IDENTITY — ⚠ `osmId` is SYNTHETIC on this path
// ----------------------------------------------------
// The bake does not carry OSM ids into the tiles (`osmium export` only emits them with
// `--add-unique-id`), so this module mints a STABLE SYNTHETIC id from (z, x, y, feature index).
// It is unique per emitted piece and stable across reloads, which is what every downstream `Set`
// keyed on `osmId` actually needs. It is NOT an OSM id and must never be presented as one.
// A building straddling a tile boundary is emitted as one CLIPPED piece per tile; the pieces are
// deliberately NOT deduplicated, because their union is the correct footprint and dropping either
// half would punch a visible hole in the massing.
import { PMTiles } from 'pmtiles';
import { VectorTile } from '@mapbox/vector-tile';
import { PbfReader } from 'pbf';

/** A lon/lat bounding box `[west, south, east, north]` — same shape as `contextBuildings.Bbox`. */
export type TileBbox = readonly [number, number, number, number];

/** The layers baked by `tools/context-bake/` — the tile file is `<layer>.pmtiles`. */
export type ContextTileLayer = 'buildings' | 'roads' | 'water' | 'parks';

/** One decoded tile feature: GeoJSON-ish rings in lon/lat plus the OSM tags that rode along. */
export interface ContextTileFeature {
    /** Outer rings in lon/lat. Polygons contribute their outer ring; multipolygons contribute one
     *  entry per part. Holes are dropped — cosmetic at context-massing scale. */
    readonly rings: number[][][];
    /** OSM tags, stringified (MVT values may be number/boolean). */
    readonly tags: Record<string, string>;
    /** ⚠ SYNTHETIC — stable per (tile, feature index). NOT an OSM id. See the header note. */
    readonly syntheticId: number;
}

/**
 * The reader's result. ⚠ `ok` with zero features is a REAL ANSWER ("nothing is mapped here"),
 * NOT a failure — see the honesty contract above.
 */
export type ContextTileResult =
    /** Tiles are configured and were read. `features` may legitimately be empty. */
    | { readonly status: 'ok'; readonly features: ContextTileFeature[]; readonly tilesRead: number; readonly ms: number }
    /** No tiles URL is configured (local dev / not yet rolled out) — the caller should use Overpass. */
    | { readonly status: 'disabled' }
    /** Tiles ARE configured but could not be read (network / 404 / corrupt / out of bounds). */
    | { readonly status: 'unavailable'; readonly reason: string };

/**
 * Zoom to read each layer at — the bake's `maxz`, where geometry is least simplified. Clamped at
 * runtime to the tileset header's real `maxZoom`, so a re-bake at a different zoom cannot silently
 * produce empty tiles here.
 */
const LAYER_ZOOM: Record<ContextTileLayer, number> = {
    buildings: 16,
    roads: 16,
    water: 16,
    parks: 16,
};

/**
 * The tag that DEFINES membership of each layer. Used to reject the incidental objects
 * `osmium tags-filter` drags in as referenced members (the 678 `entrance` nodes above).
 */
const LAYER_DEFINING_TAGS: Record<ContextTileLayer, readonly string[]> = {
    buildings: ['building', 'building:part'],
    roads: ['highway'],
    water: ['natural', 'water', 'waterway'],
    parks: ['leisure', 'landuse', 'natural'],
};

/** Whether the layer's payload is areal (polygons) or linear (ways). */
const LAYER_IS_AREAL: Record<ContextTileLayer, boolean> = {
    buildings: true,
    roads: false,
    water: false, // mixed: areas AND waterways — accept both, the consumer splits them.
    parks: true,
};

/**
 * Hard cap on tiles fetched for ONE bbox. At z16 a tile is ~450 m across at Barcelona's latitude,
 * so the widest context extent (`CONTEXT_BBOX_FAR_HALF_DEG` = 0.011° ≈ 2.4 km) needs ~36. The cap
 * exists so a nonsense bbox cannot fan out into hundreds of range requests; when it bites we say so
 * rather than silently returning a truncated ring.
 */
export const MAX_TILES_PER_FETCH = 64;

// ── configuration ────────────────────────────────────────────────────────────

/**
 * ⚠ BUILD-TIME, not runtime. `VITE_*` is inlined by vite at build time — setting it as a Fly
 * runtime secret does NOTHING and fails silently (memory `fly-production-deploy`). It is threaded
 * repo variable → `deploy-fly.yml --build-arg` → `Dockerfile ARG` → vite.
 *
 * ⚠⚠ SETTING THIS ADDS A NEW CLIENT ORIGIN, WHICH IS NEVER JUST A CLIENT CHANGE (§L-570-CSP).
 * `server/securityHeaders.js` derives the allowed origin from this same variable, so it SHOULD be
 * automatic — but the identical mistake has now been made twice (NASA/WorldPop, then the R2 GLB
 * re-host, where the upload was green, the bundle was correct, the deploy was green, and every
 * asset was still refused by CSP). Verify in a BROWSER after any change here.
 */
let baseUrlOverride: string | null = null;

function readEnvBaseUrl(): string {
    try {
        const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env;
        return env?.['VITE_CONTEXT_TILES_URL'] ?? '';
    } catch {
        return '';
    }
}

/** The configured tiles base URL, normalised to a trailing `/`. Empty string = not configured. */
export function contextTilesBaseUrl(): string {
    const raw = (baseUrlOverride ?? readEnvBaseUrl()).trim();
    if (!raw) return '';
    return raw.endsWith('/') ? raw : `${raw}/`;
}

/** True when the baked-tiles path is configured. When false, callers keep using Overpass. */
export function contextTilesEnabled(): boolean {
    return contextTilesBaseUrl().length > 0;
}

/**
 * The ORIGIN that must appear in the server CSP `connect-src`, or `null` when tiles are off.
 * Exported so a test — and a human — can assert the CSP and the client agree, instead of finding
 * out from a browser console after a ten-minute deploy (§L-570-CSP).
 */
export function contextTilesOrigin(): string | null {
    const base = contextTilesBaseUrl();
    if (!base) return null;
    try {
        return new URL(base).origin;
    } catch {
        return null;
    }
}

/** Test seam — override the base URL (pass `null` to fall back to the build-time env). */
export function __setContextTilesBaseUrl(url: string | null): void {
    baseUrlOverride = url;
    archives.clear();
}

// ── tile math (standard Web Mercator XYZ) ────────────────────────────────────

export function lonToTileX(lon: number, z: number): number {
    return Math.floor(((lon + 180) / 360) * 2 ** z);
}

export function latToTileY(lat: number, z: number): number {
    // Clamp to the Mercator limit so a nonsense latitude cannot produce ±Infinity.
    const clamped = Math.max(-85.05112878, Math.min(85.05112878, lat));
    const r = (clamped * Math.PI) / 180;
    return Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z);
}

/** Every tile covering `bbox` at zoom `z`, row-major. PURE + testable. */
export function tilesCovering(bbox: TileBbox, z: number): Array<{ x: number; y: number }> {
    const [w, s, e, n] = bbox;
    const x0 = lonToTileX(Math.min(w, e), z);
    const x1 = lonToTileX(Math.max(w, e), z);
    // y grows SOUTHWARD, so the north edge gives the lower index.
    const y0 = latToTileY(Math.max(s, n), z);
    const y1 = latToTileY(Math.min(s, n), z);
    const out: Array<{ x: number; y: number }> = [];
    const max = 2 ** z;
    for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
            if (x < 0 || y < 0 || x >= max || y >= max) continue;
            out.push({ x, y });
        }
    }
    return out;
}

// ── the reader ───────────────────────────────────────────────────────────────

/** One `PMTiles` archive per layer. The library caches header + directory reads internally, so
 *  reusing the instance is what keeps the second and later tile reads to a single range request. */
const archives = new Map<string, PMTiles>();

function archiveFor(layer: ContextTileLayer): PMTiles | null {
    const base = contextTilesBaseUrl();
    if (!base) return null;
    const key = `${base}${layer}`;
    let a = archives.get(key);
    if (!a) {
        a = new PMTiles(`${base}${layer}.pmtiles`);
        archives.set(key, a);
    }
    return a;
}

/** Stringify an MVT property bag (values may be number/boolean) into OSM-style tags. */
function toTags(props: Record<string, string | number | boolean>): Record<string, string> {
    const tags: Record<string, string> = {};
    for (const [k, v] of Object.entries(props)) tags[k] = String(v);
    return tags;
}

/** Do two lon/lat boxes overlap? Matches Overpass bbox semantics (INTERSECTS, not contains), so
 *  a footprint straddling the extent edge is kept exactly as the Overpass path kept it. */
function ringIntersectsBbox(ring: number[][], bbox: TileBbox): boolean {
    const [w, s, e, n] = bbox;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const p of ring) {
        const x = p[0]!, y = p[1]!;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
    }
    return maxX >= Math.min(w, e) && minX <= Math.max(w, e)
        && maxY >= Math.min(s, n) && minY <= Math.max(s, n);
}

/** Close an open ring in place-ish (returns a closed copy). Tippecanoe clips at tile edges, and a
 *  closed way exported as a LineString arrives open; both are legitimate footprint outlines. */
function closeRing(ring: number[][]): number[][] {
    if (ring.length < 3) return ring;
    const a = ring[0]!, b = ring[ring.length - 1]!;
    if (a[0] === b[0] && a[1] === b[1]) return ring;
    return [...ring, [a[0]!, a[1]!]];
}

/**
 * Extract the usable rings from one decoded tile feature, applying the layer's geometry policy.
 * Returns `[]` for anything the layer should not carry (points, and — for areal layers — the
 * duplicate LineString copy of a polygon that the current bake emits).
 */
function ringsFor(
    geometry: { type: string; coordinates: unknown },
    layer: ContextTileLayer,
): number[][][] {
    const areal = LAYER_IS_AREAL[layer];
    switch (geometry.type) {
        case 'Polygon':
            // Outer ring only — holes are cosmetic at context-massing scale.
            return [closeRing((geometry.coordinates as number[][][])[0] ?? [])];
        case 'MultiPolygon':
            return (geometry.coordinates as number[][][][])
                .map((poly) => closeRing(poly[0] ?? []))
                .filter((r) => r.length >= 4);
        case 'LineString':
            // ⚠ For an AREAL layer this is the bake's duplicate copy of a polygon we have already
            // taken — keeping it would double-count every footprint (probed: 362 vs 362).
            return areal ? [] : [geometry.coordinates as number[][]];
        case 'MultiLineString':
            return areal ? [] : (geometry.coordinates as number[][][]);
        default:
            return []; // Point / MultiPoint / Unknown — the `entrance=*` node noise.
    }
}

/** Does this feature actually belong to the layer, or is it an incidental referenced object? */
function belongsToLayer(tags: Record<string, string>, layer: ContextTileLayer): boolean {
    return LAYER_DEFINING_TAGS[layer].some((t) => t in tags);
}

/**
 * Read every feature of `layer` covering `bbox` from the baked PMTiles.
 *
 * NEVER throws. Individual tile failures are tolerated (a missing tile at the edge of the baked
 * region is normal); the result is only `unavailable` when NO tile could be read at all, which is
 * the only case that genuinely warrants falling back to Overpass.
 */
export async function readContextTileFeatures(
    layer: ContextTileLayer,
    bbox: TileBbox,
    signal?: AbortSignal,
): Promise<ContextTileResult> {
    const archive = archiveFor(layer);
    if (!archive) return { status: 'disabled' };

    const t0 = Date.now();
    let z = LAYER_ZOOM[layer];
    try {
        const header = await archive.getHeader();
        // Clamp to what the tileset ACTUALLY holds — a re-bake at a different zoom would otherwise
        // read tiles that do not exist and look exactly like "no context here".
        z = Math.min(z, header.maxZoom);
        if (z < header.minZoom) {
            return { status: 'unavailable', reason: `zoom ${z} below tileset minZoom ${header.minZoom}` };
        }
    } catch (e) {
        return { status: 'unavailable', reason: `header read failed: ${(e as Error)?.message ?? e}` };
    }
    if (signal?.aborted) return { status: 'unavailable', reason: 'aborted' };

    const tiles = tilesCovering(bbox, z);
    if (tiles.length === 0) return { status: 'ok', features: [], tilesRead: 0, ms: Date.now() - t0 };
    if (tiles.length > MAX_TILES_PER_FETCH) {
        // Say so rather than silently truncating — a partial ring that LOOKS complete is the
        // failure mode this whole subsystem exists to avoid.
        return {
            status: 'unavailable',
            reason: `bbox needs ${tiles.length} tiles at z${z}, over the ${MAX_TILES_PER_FETCH} cap`,
        };
    }

    const features: ContextTileFeature[] = [];
    let read = 0;
    let failed = 0;

    const results = await Promise.all(tiles.map(async ({ x, y }) => {
        try {
            const r = await archive.getZxy(z, x, y, signal);
            return { x, y, data: r?.data ?? null, error: null as string | null };
        } catch (e) {
            return { x, y, data: null, error: (e as Error)?.message ?? String(e) };
        }
    }));
    if (signal?.aborted) return { status: 'unavailable', reason: 'aborted' };

    for (const r of results) {
        if (r.error) { failed++; continue; }
        read++;
        if (!r.data) continue; // a genuinely empty tile — sea, park, outside the built area.
        let vtLayer;
        try {
            vtLayer = new VectorTile(new PbfReader(new Uint8Array(r.data))).layers[layer];
        } catch {
            failed++;
            continue;
        }
        if (!vtLayer) continue;
        for (let i = 0; i < vtLayer.length; i++) {
            const f = vtLayer.feature(i);
            const tags = toTags(f.properties);
            if (!belongsToLayer(tags, layer)) continue;
            const geometry = f.toGeoJSON(r.x, r.y, z).geometry as { type: string; coordinates: unknown };
            const rings = ringsFor(geometry, layer).filter((ring) => ring.length >= 3 && ringIntersectsBbox(ring, bbox));
            if (rings.length === 0) continue;
            features.push({
                rings,
                tags,
                // Stable + unique per emitted piece. `i` is the tile-local feature index, so the
                // triple (x, y, i) identifies it; the mix keeps ids apart across tiles.
                syntheticId: ((r.x & 0xffff) * 0x1_0000_0000 + (r.y & 0xffff) * 0x1_0000 + (i & 0xffff)),
            });
        }
    }

    // Every single tile request failed ⇒ this is a FAILURE, not an empty neighbourhood.
    if (read === 0 && failed > 0) {
        return { status: 'unavailable', reason: `all ${failed} tile read(s) failed` };
    }
    return { status: 'ok', features, tilesRead: read, ms: Date.now() - t0 };
}

/** Test/diagnostic helper — drop the cached archives (header + directory caches with them). */
export function clearContextTileArchives(): void {
    archives.clear();
}
