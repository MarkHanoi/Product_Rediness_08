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
// DISCRIMINATED result (`ok` / `aborted` / `unavailable` / `disabled`), because "the range requests all failed"
// and "this tile genuinely contains no buildings" are the same VALUE and must not be the same
// ANSWER — that conflation IS L-467/L-469. Callers use the discriminator to decide whether falling
// back to Overpass is warranted; an honest empty must NOT trigger a fallback, and an honest failure
// must not be rendered as "no context here".
//
// GEOMETRY DEFENSIVENESS — probed, then RE-probed properly (§L-579, 2026-07-22)
// -----------------------------------------------------------------------------
// The bake emits each building TWICE — once as the closed way (LineString) and once as the
// assembled area (Polygon) — and drags in tagged `entrance` NODES as Points. So this reader keeps
// ONLY polygonal geometry carrying the layer's defining tag, and treats the tile's geometry type
// as untrusted input.
//
// ⚠ THE EVIDENCE FOR THAT WAS INITIALLY BAD, AND THE CORRECTION MATTERS MORE THAN THE CONCLUSION.
// The first "proof" was one Gòtic tile where the two counts happened to match exactly (362/362).
// A follow-up matched linestrings to polygons by CENTROID and reported 47% of them "unmatched",
// which read as *the reader is deleting half of Barcelona* — a frightening number that was pure
// artefact: in Eixample neighbouring buildings sit ~10 m apart, exactly the scale at which centroid
// proximity stops telling a twin from a neighbour.
//
// The decisive test is footprint OVERLAP, not proximity. Bounding-box IoU over four Barcelona
// tiles (Eixample, Gòtic, Born/Ciutadella, Vila Olímpica): 853 linestrings → 743 TWIN (IoU > 0.8),
// 58 DISTINCT (IoU < 0.3), 52 ambiguous. And against independent OSM ground truth for one bbox
// (our own `/api/overpass`: 217 buildings) the POLYGONS ALONE yield 225 at z16 — 104%, the surplus
// being tile-boundary clip pieces; z15 and z14 give 98%. Dropping the linestrings loses nothing.
//
// `tools/context-bake/bake.mjs` pins one geometry class per layer, but this reader stays defensive
// regardless of which bake it meets — the tiles are a separately-deployed artefact and can be
// older than the code reading them.
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
import { PMTiles, type Source, type RangeResponse } from 'pmtiles';
import { VectorTile } from '@mapbox/vector-tile';
import { PbfReader } from 'pbf';

/** A lon/lat bounding box `[west, south, east, north]` — same shape as `contextBuildings.Bbox`. */
export type TileBbox = readonly [number, number, number, number];

/** The layers baked by `tools/context-bake/` — the tile file is `<layer>.pmtiles`. */
export type ContextTileLayer = 'buildings' | 'roads' | 'water' | 'parks' | 'landuse' | 'rail' | 'trees';

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
    /**
     * §L-579 — THE CALLER CANCELLED. This is NOT a failure and MUST NOT trigger a fallback.
     *
     * The founder's console showed this three times in one session:
     *     §CTX-PMTILES-READER buildings: tiles configured but unreadable (aborted)
     *       — falling back to live Overpass. This is a DEGRADED path…
     *     §OVERPASS-CLIENT-FAILOVER — the proxy reported ALL upstream mirrors failed (429/timeout).
     * An abort means the user navigated and a newer request is already in flight; the honest
     * response is to render nothing and let that newer request paint. Instead we treated it as a
     * read failure, went to the third party this whole subsystem exists to remove, got rate-limited,
     * and burned that budget while the user was watching an empty map. Distinct from `unavailable`
     * precisely so the caller can tell "you cancelled me" from "the tiles are broken".
     */
    | { readonly status: 'aborted' }
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
    landuse: 16,
    rail: 16,
    trees: 16,
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
    landuse: ['landuse'],
    rail: ['railway'],
    trees: ['natural'], // trees.pmtiles is baked from `natural=tree` NODES only — no collision with parks.
};

/** Whether the layer's payload is areal (polygons) or linear (ways). */
const LAYER_IS_AREAL: Record<ContextTileLayer, boolean> = {
    buildings: true,
    roads: false,
    water: false, // mixed: areas AND waterways — accept both, the consumer splits them.
    parks: true,
    landuse: true,
    rail: false, // linestring track ways — like roads.
    trees: false,
};

/**
 * §FORMA-CTX-TREES (L-642 Phase C) — whether the layer's payload is POINTS (single-vertex features).
 * ⚠ `trees` is the ONLY point layer: its bake (`n/natural=tree`, `--geometry-types point`) emits one
 * Point per tree. Every OTHER layer keeps the default reader behaviour — points are the `entrance=*`
 * node NOISE `osmium tags-filter` drags in, and are discarded. A point layer carries each feature as a
 * degenerate one-vertex "ring" (`[[lon,lat]]`), so the ≥3-vertex ring floor below is relaxed to ≥1 for
 * it and only for it. Keeping this a SEPARATE map (not folded into IS_AREAL) means the existing
 * roads/water linear path is byte-for-byte unchanged.
 */
const LAYER_IS_POINT: Record<ContextTileLayer, boolean> = {
    buildings: false,
    roads: false,
    water: false,
    parks: false,
    landuse: false,
    rail: false,
    trees: true,
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

/**
 * §CTX-TILES-PROXY (L-578) — the SAME-ORIGIN fallback base.
 *
 * ⚠ WHY THERE IS A FALLBACK AT ALL. Reading R2 directly is the intended path and is what
 * `VITE_CONTEXT_TILES_URL` selects. It could not work in a browser because THE BUCKET SENDS NO
 * CORS HEADERS — and nothing outside a browser can see that: curl, `aws s3 ls`, the upload probe
 * and every Node probe returned a clean 200/206, because none of them enforce CORS. Fixing it
 * needs bucket-ADMIN credentials the repo's object-scoped R2 token does not have
 * (`PutBucketCors` → `AccessDenied`), i.e. it is gated on a human with dashboard access.
 *
 * So when no direct URL is configured we read the SAME tiles through our own origin, where CORS
 * does not apply. The moment the bucket policy lands and the variable is set, this stops being
 * used with no code change — the direct route is strictly faster and keeps our server off the
 * context hot path, which is the whole point of L-513b.
 */
export const CONTEXT_TILES_SAME_ORIGIN_BASE = '/api/context-tiles/';

/**
 * The tiles base URL, normalised to a trailing `/`.
 *
 * ⚠ NEVER EMPTY NOW. Before L-578 an unset variable meant "stay on live Overpass"; it now means
 * "use the same-origin proxy", because a working-but-proxied context beats a third party that
 * L-513 proved cannot be made reliable. Overpass survives only as the failure fallback inside
 * `fetchForBbox`, for a genuine `unavailable` read.
 */
export function contextTilesBaseUrl(): string {
    const raw = (baseUrlOverride ?? readEnvBaseUrl()).trim();
    // An explicit empty override is how a test — or local dev — asks for the Overpass path back.
    if (baseUrlOverride === '') return '';
    if (!raw) return CONTEXT_TILES_SAME_ORIGIN_BASE;
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

/**
 * §CONTEXT-CACHE-BUST (L-658) — a version stamp on the context tileset URL, the exact analogue of
 * `TERRAIN_TILESET_VERSION` (terrainCoverage.ts §TERRAIN-CACHE-BUST, L-639).
 *
 * ⚠ WHY THIS IS NOT OPTIONAL. `<layer>.pmtiles` is PATH-STABLE across re-bakes — a re-bake overwrites
 * the SAME key in R2 — and the bake publishes it with `Cache-Control: public, max-age=31536000,
 * immutable` (context-bake.yml §Publish to R2). A YEAR of immutable caching on a URL that never
 * changes means a browser that has read the old tileset once will NEVER see a re-bake. Terrain hit
 * precisely this and an entire 590-region rollout rendered as byte-identical stale tiles because the
 * new bytes were never fetched.
 *
 * The stamp goes on the archive URL, so it busts the browser HTTP cache for every RANGE read of that
 * archive at once (PMTiles derives every tile request from this one URL).
 *
 * ⚠ BUMP THIS ON EVERY CONTEXT RE-BAKE. It is deliberately ONE constant read by BOTH consumers —
 * this client and `tools/context-height-probe/probe.mjs` — so the probe and the browser can never
 * disagree about which tileset they are looking at. Never paper over a stale read with an ad-hoc
 * `?t=Date.now()` at a call site: that defeats caching entirely and only fixes the one caller.
 */
// L659a (2026-08-01) — the re-bake that finally lands Barcelona's REAL measured heights. The L658a
// tileset in R2 is the one whose height joins had already failed: probed live at 41.3888,2.1590 it
// returns 5,146 footprints, 0 measured, 62.5 % fabricated 9 m default. Without this bump every
// browser that has already read `buildings.pmtiles?v=L658a` keeps that tileset for a YEAR.
//
// ⛔ L660a (2026-08-02) — **L659a WAS BUMPED FOR A BAKE THAT THEN FAILED TO PUBLISH, AND THAT IS THE
// BUG THIS FIXES.** The stamp shipped to `main` in `c4a1c7d3` on 2026-08-01 for run **30715958488**,
// which tiled 2.3 GB successfully and then **published nothing** — it died on the verification step's
// npm pin, so R2 kept serving the OLD (0-measured) archive. Any browser that loaded the app in the
// window between that deploy and 2026-08-02 therefore fetched `buildings.pmtiles?v=L659a` and got the
// **stale bytes**, which it now holds **for a year** under a stamp we would otherwise consider current.
//
// Run **30736279532** (2026-08-02) is the one that actually published: all 14 steps green, the
// measured-height gate passed for the FIRST TIME in its existence, R2 publish verified publicly
// readable AND range-servable. Spain's measured share is in that run's `── measured-height gate ──`
// block — not transcribed here (C64 §2.13); re-derive with `tools/context-height-probe/probe.mjs`.
//
// ⚠ **THE GENERALISABLE RULE, and it is why this cost a day: BUMP THE STAMP WHEN THE BAKE PUBLISHES,
// NEVER WHEN IT IS DISPATCHED.** A version stamp is a claim about what is IN R2. Bumping it in the
// same commit that fixes the bake asserts the fix succeeded before it has run — and a failed publish
// then poisons the new stamp with the old bytes, which is strictly worse than not bumping at all.
export const CONTEXT_TILESET_VERSION = 'L660a';

/**
 * The full URL of one layer's PMTiles archive, cache-bust stamp included.
 * Exported so the probe and tests read the SAME URL the browser does.
 */
export function contextTilesetUrl(layer: ContextTileLayer): string | null {
    const base = contextTilesBaseUrl();
    if (!base) return null;
    return `${base}${layer}.pmtiles?v=${CONTEXT_TILESET_VERSION}`;
}

/** Test seam — override the base URL (pass `null` to fall back to the build-time env). */
export function __setContextTilesBaseUrl(url: string | null): void {
    baseUrlOverride = url;
    archives.clear();
    // §CTX-TILE-DECODE-CACHE — the decoded tiles belong to the OLD base URL. Keeping them would
    // serve one tileset's features under another's configuration.
    tileCache.clear();
    tileInFlight.clear();
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

/**
 * §CTX-RANGE-URL-SOURCE (L-661) — a PMTiles `Source` that gives every byte range its OWN URL and
 * lets the browser cache it. THIS IS THE FIX FOR THE 80-SECOND CONTEXT READ, and the library's own
 * default `FetchSource` is what made it 80 seconds.
 *
 * MEASURED, not inferred (2026-08-06, Barcelona Eixample far extent, 36–42 tiles at z16):
 *   • decode (VectorTile → toGeoJSON → ring filter, 13,339 features) ............   67 ms
 *   • all range requests, DIRECT R2, issued concurrently .......................  798 ms
 *   • all range requests, through our same-origin proxy, concurrently ..........  955 ms
 *   • ONE range request, sequentially ..........................  273 ms (proxy) / 385 ms (R2)
 *   • the same requests if SERIALIZED (sum of individual latencies) ...... 26,525–30,815 ms
 * So neither the network volume (0.84 MB) nor the parse is capable of costing 80 s. The founder's
 * 79,725 ms is ~1.9 s × 42 tiles — the signature of range requests running ONE AT A TIME. And the
 * proxy is NOT the culprit: it measured FASTER than direct R2 here.
 *
 * ⚠ WHY THE LIBRARY SERIALIZES THEM. `pmtiles`' `FetchSource` sniffs the user agent and, on
 * **Windows + any Chromium browser**, sets `cache: "no-store"` on every single range request:
 *
 *     const isWindows = userAgent.indexOf("Windows") > -1;
 *     const isChromiumBased = /Chrome|Chromium|Edg|OPR|Brave/.test(userAgent);
 *     if (isWindows && isChromiumBased) this.chromeWindowsNoCache = true;
 *     …
 *     } else if (this.chromeWindowsNoCache) { cache = "no-store"; }
 *
 * Every tile of every read therefore goes to the network, forever — which is exactly what the
 * founder's log shows and is the single most diagnostic fact in it: the SECOND read of the same
 * bbox cost 79,431 ms against the first's 79,725 ms. A read that had a warm HTTP cache could not
 * possibly come back within 0.4% of the cold one. **There was no cache to hit.** On top of that,
 * all 42 ranges address ONE URL, so they contend for a single browser cache entry instead of
 * proceeding in parallel.
 *
 * THE FIX, and why it is a `Source` rather than a patch: `Source` is the library's own supported
 * extension point (`getBytes` + `getKey`), so we replace the transport WITHOUT forking pmtiles or
 * monkey-patching a vendor class. Each range gets a distinct, individually-cacheable URL
 * (`…?v=<stamp>&r=<offset>-<length>`) and no `cache` override, which:
 *   1. removes the single-cache-entry contention, so the ranges actually run concurrently;
 *   2. restores normal HTTP caching, so a second read of the same tiles is served from disk;
 *   3. keeps the §CONTEXT-CACHE-BUST version stamp in the URL, so a re-bake still invalidates
 *      everything at once — the per-range suffix is ADDITIVE to the stamp, never a replacement.
 *
 * ⚠ The extra query parameter was VERIFIED against both backends before shipping, because a store
 * that treated it as part of the object key would 404 every tile: R2 returned `206` with
 * `content-range: bytes 100000000-100019999/2399042929`, and so did the same-origin proxy (which
 * routes on `req.params.layer` and never reads the query string).
 */
class RangeUrlFetchSource implements Source {
    constructor(private readonly url: string) {}

    /** The archive identity for the library's internal directory cache — the range-less URL. */
    getKey(): string {
        return this.url;
    }

    async getBytes(offset: number, length: number, signal?: AbortSignal): Promise<RangeResponse> {
        // Distinct URL per range — see the class note. The stamp is already on `this.url`.
        const sep = this.url.includes('?') ? '&' : '?';
        const rangeUrl = `${this.url}${sep}r=${offset}-${length}`;
        const resp = await fetch(rangeUrl, {
            signal,
            headers: { range: `bytes=${offset}-${offset + length - 1}` },
        });
        if (resp.status >= 300) throw new Error(`Bad response code: ${resp.status}`);
        // ⚠ Keep `FetchSource`'s byte-serving check. A backend that ignores `Range` answers 200 with
        // the WHOLE 2.3 GB archive, which "works" and is catastrophic; it must be an error, not a
        // slow success (§CTX-TILES-PROXY makes the same point about forwarding the header).
        const contentLength = resp.headers.get('Content-Length');
        if (resp.status === 200 && (!contentLength || Number(contentLength) > length)) {
            throw new Error('Server returned no content-length or a body exceeding the requested range — no HTTP byte serving.');
        }
        const etag = resp.headers.get('ETag');
        return {
            data: await resp.arrayBuffer(),
            // A weak ETag cannot prove byte identity, so it is worse than none — same rule as the library.
            etag: etag && !etag.startsWith('W/') ? etag : undefined,
            cacheControl: resp.headers.get('Cache-Control') ?? undefined,
            expires: resp.headers.get('Expires') ?? undefined,
        };
    }
}

/** One `PMTiles` archive per layer. The library caches header + directory reads internally, so
 *  reusing the instance is what keeps the second and later tile reads to a single range request. */
const archives = new Map<string, PMTiles>();

function archiveFor(layer: ContextTileLayer): PMTiles | null {
    // §CONTEXT-CACHE-BUST — always go through contextTilesetUrl() so the version stamp can never be
    // dropped by a new call site. A path-stable, year-immutable URL is invisible to a re-bake.
    const url = contextTilesetUrl(layer);
    if (!url) return null;
    let a = archives.get(url);
    if (!a) {
        // §CTX-RANGE-URL-SOURCE — explicit Source, NOT the string overload (which builds the
        // `FetchSource` whose Windows-Chromium `no-store` is the 80-second bug).
        a = new PMTiles(new RangeUrlFetchSource(url));
        archives.set(url, a);
    }
    return a;
}

/**
 * §CTX-TILE-DECODE-CACHE (L-661) — decoded features per INDIVIDUAL TILE, plus in-flight de-duplication.
 *
 * WHY A SECOND CACHE, WHEN `contextBuildings.fetchForBbox` ALREADY DE-DUPLICATES PER BBOX.
 * Because it de-duplicates per bbox KEY, and the key is not stable. `bboxKey` rounds to
 * `toFixed(4)` (~11 m) around a centre that MOVES during onboarding — the geocode anchor first,
 * the parcel/boundary centroid after the user commits. The founder's two reads returned **10,194
 * and 10,219** footprints: not a de-dup miss, but two genuinely different bboxes a few metres
 * apart, each a full cache MISS, each paying the whole 42-tile read.
 *
 * Caching at the TILE is immune to that. At z16 a tile is ~450 m across, so a centre that shifts
 * by metres covers the SAME tiles; the second bbox re-uses every one of them and costs only the
 * bbox filter (sub-millisecond). It also makes panning, the near/far extent pair, and the
 * §CTX-PREFETCH-ON-LOCATION warm-up genuinely free instead of nominally free — the prefetch's
 * whole stated purpose, which the bbox-keyed cache could not deliver.
 *
 * ⚠ The cached value is the tile's features UNFILTERED by bbox. The bbox filter is applied per
 * READ, because two bboxes sharing a tile want different subsets of it; caching a filtered set
 * would hand the second caller the first caller's crop.
 *
 * ⚠ ONLY SUCCESSFUL DECODES ARE CACHED. A failed range read is never memoised — that would make a
 * transient network failure permanent for the session, which is the §CONTEXT-DATA-HONESTY family's
 * exact failure mode (a failure that renders as "nothing is here"). An EMPTY tile IS cached,
 * because an empty tile is a real answer.
 */
const tileCache = new Map<string, ContextTileFeature[]>();
/** Concurrent readers of the SAME tile share ONE range request instead of racing duplicates. */
const tileInFlight = new Map<string, Promise<ContextTileFeature[] | null>>();

/**
 * Bound on the decoded-tile cache. A cache is only a cache if it is BOUNDED (§L-273 learned this
 * the expensive way, when an unbounded per-bbox localStorage cache filled the origin and took
 * autosave's project index down with it). 512 tiles ≈ 14 far-extent reads' worth of distinct
 * tiles; eviction is oldest-first by insertion, which for a user panning around one site is the
 * tiles they have moved away from.
 */
const MAX_CACHED_TILES = 512;

function tileCacheKey(layer: ContextTileLayer, z: number, x: number, y: number): string {
    // The tileset version belongs in the key: a re-bake must not be served stale decoded features
    // from a previous archive (§CONTEXT-CACHE-BUST, and the L659a/L660a stale-stamp incident).
    return `${CONTEXT_TILESET_VERSION}/${layer}/${z}/${x}/${y}`;
}

function rememberTile(key: string, features: ContextTileFeature[]): void {
    if (tileCache.size >= MAX_CACHED_TILES) {
        const oldest = tileCache.keys().next();
        if (!oldest.done) tileCache.delete(oldest.value);
    }
    tileCache.set(key, features);
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
            // taken — keeping it would DOUBLE-COUNT every footprint.
            //
            // §L-579 — THIS WAS RE-PROVED PROPERLY, because the first proof was not one. It rested
            // on one tile where the polygon and linestring counts happened to match exactly
            // (362/362). A follow-up matched linestrings to polygons by CENTROID and reported 47%
            // "unmatched", which read as "the reader is deleting half the city" — and that was an
            // ARTEFACT: in Eixample neighbouring buildings sit ~10 m apart, the scale at which
            // centroid matching stops distinguishing a twin from a neighbour.
            //
            // The decisive test is footprint OVERLAP, not proximity. Bounding-box IoU across four
            // Barcelona tiles (Eixample, Gòtic, Born/Ciutadella, Vila Olímpica): 853 linestrings →
            // 743 TWIN (IoU > 0.8) · 58 DISTINCT (IoU < 0.3) · 52 ambiguous. And against OSM ground
            // truth over one bbox (our own /api/overpass: 217 buildings), the POLYGONS ALONE give
            // 225 at z16 — 104%, the surplus being tile-boundary clip pieces. Dropping the
            // linestrings is correct and loses nothing.
            return areal ? [] : [geometry.coordinates as number[][]];
        case 'MultiLineString':
            return areal ? [] : (geometry.coordinates as number[][][]);
        case 'Point':
            // §FORMA-CTX-TREES (L-642 Phase C) — a point becomes a degenerate one-vertex "ring"
            // `[[lon,lat]]`, but ONLY for a POINT layer (trees). For every other layer a Point is the
            // `entrance=*` node noise the reader has always dropped.
            return LAYER_IS_POINT[layer] ? [[geometry.coordinates as unknown as number[]]] : [];
        case 'MultiPoint':
            return LAYER_IS_POINT[layer]
                ? (geometry.coordinates as unknown as number[][]).map((p) => [p])
                : [];
        default:
            return []; // Unknown geometry.
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
        // An abort during the header read is the caller cancelling, not a broken tileset.
        if ((e as Error)?.name === 'AbortError' || signal?.aborted) return { status: 'aborted' };
        return { status: 'unavailable', reason: `header read failed: ${(e as Error)?.message ?? e}` };
    }
    if (signal?.aborted) return { status: 'aborted' };

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

    const perTile = await Promise.all(tiles.map(({ x, y }) => loadTile(archive, layer, z, x, y, signal)));
    if (signal?.aborted) return { status: 'aborted' };

    const features: ContextTileFeature[] = [];
    let read = 0;
    let failed = 0;
    // §FORMA-CTX-TREES — a POINT layer carries one-vertex features; every other layer needs a real
    // ring/strand (≥3 vertices). `ringIntersectsBbox` handles a single point (degenerate box).
    const minVerts = LAYER_IS_POINT[layer] ? 1 : 3;

    for (const tileFeatures of perTile) {
        if (tileFeatures === null) { failed++; continue; }
        read++;
        // §CTX-TILE-DECODE-CACHE — the bbox crop happens HERE, per read, never in the cache. Two
        // bboxes sharing a tile legitimately want different subsets of it.
        for (const f of tileFeatures) {
            const rings = f.rings.filter((ring) => ring.length >= minVerts && ringIntersectsBbox(ring, bbox));
            if (rings.length === 0) continue;
            features.push(rings.length === f.rings.length ? f : { ...f, rings });
        }
    }

    // Every single tile request failed ⇒ this is a FAILURE, not an empty neighbourhood.
    if (read === 0 && failed > 0) {
        return { status: 'unavailable', reason: `all ${failed} tile read(s) failed` };
    }
    return { status: 'ok', features, tilesRead: read, ms: Date.now() - t0 };
}

/**
 * §CTX-TILE-DECODE-CACHE — one tile's features, from cache if we already have them.
 *
 * Returns `null` for a tile that could NOT be read or decoded, and `[]` for one that genuinely
 * holds nothing — the same distinction the module-level result type draws, at tile granularity.
 * A `null` is never cached (see the cache note); a `[]` is.
 */
async function loadTile(
    archive: PMTiles,
    layer: ContextTileLayer,
    z: number,
    x: number,
    y: number,
    signal?: AbortSignal,
): Promise<ContextTileFeature[] | null> {
    const key = tileCacheKey(layer, z, x, y);
    const cached = tileCache.get(key);
    if (cached) return cached;
    const pending = tileInFlight.get(key);
    // ⚠ The shared read deliberately takes NO abort signal — same reasoning as
    // §CTX-ONE-READ-PER-BBOX in contextBuildings.ts: one caller's cancellation must not empty a
    // download that other callers are awaiting. Callers still honour their own signal after the await.
    if (pending) return pending;

    const shared = (async (): Promise<ContextTileFeature[] | null> => {
        let data: ArrayBuffer | null;
        try {
            const r = await archive.getZxy(z, x, y, signal);
            data = r?.data ?? null;
        } catch {
            return null;
        }
        if (!data) return []; // a genuinely empty tile — sea, park, outside the built area.
        let vtLayer;
        try {
            vtLayer = new VectorTile(new PbfReader(new Uint8Array(data))).layers[layer];
        } catch {
            return null; // corrupt bytes are a FAILURE, not an empty tile.
        }
        if (!vtLayer) return [];
        const out: ContextTileFeature[] = [];
        for (let i = 0; i < vtLayer.length; i++) {
            const f = vtLayer.feature(i);
            const tags = toTags(f.properties);
            if (!belongsToLayer(tags, layer)) continue;
            const geometry = f.toGeoJSON(x, y, z).geometry as { type: string; coordinates: unknown };
            const rings = ringsFor(geometry, layer);
            if (rings.length === 0) continue;
            out.push({
                rings,
                tags,
                // Stable + unique per emitted piece. `i` is the tile-local feature index, so the
                // triple (x, y, i) identifies it; the mix keeps ids apart across tiles.
                syntheticId: ((x & 0xffff) * 0x1_0000_0000 + (y & 0xffff) * 0x1_0000 + (i & 0xffff)),
            });
        }
        return out;
    })().then((res) => {
        if (res !== null) rememberTile(key, res);
        return res;
    }).finally(() => { tileInFlight.delete(key); });

    tileInFlight.set(key, shared);
    return shared;
}

/** Test/diagnostic helper — drop the cached archives (header + directory caches with them) AND the
 *  §CTX-TILE-DECODE-CACHE, so a test cannot be handed a previous test's decoded tiles. */
export function clearContextTileArchives(): void {
    archives.clear();
    tileCache.clear();
    tileInFlight.clear();
}

/** §CTX-TILE-DECODE-CACHE — observable cache state, for tests and diagnostics. */
export function contextTileCacheSize(): number {
    return tileCache.size;
}
