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
import {
    BakedReadError,
    classifyBakedReadError,
    errorMessage,
    RETRYABLE_BAKED_READ_KINDS,
    withBakedReadRetry,
    DEFAULT_BAKED_READ_ATTEMPTS,
    DEFAULT_BAKED_READ_DELAYS_MS,
    type BakedReadFailureKind,
} from './bakedReadRetry';
// §CTX-EXTENT-BUDGET (L-13058) — the ONE tunable table for every 3D-Site context radius and cap.
// Leaf module (imports nothing), so this cannot close an import cycle.
import { CTX_BUILDINGS_MAX_TILES_PER_FETCH, CTX_MAX_CACHED_TILES } from './contextExtentBudget';

/** A lon/lat bounding box `[west, south, east, north]` — same shape as `contextBuildings.Bbox`. */
export type TileBbox = readonly [number, number, number, number];

/** The layers baked by `tools/context-bake/` — the tile file is `<layer>.pmtiles`.
 *  §SEA-BAKE-POLYGONS (lane SEA-BAKE, 2026-09-05) — `sea`: closed sea POLYGONS from the osmdata
 *  water-polygons product (bake.mjs LAYERS `sea`, OPTIONAL — a landlocked region has no tiles). Read
 *  by contextWater.ts INSTEAD of walking the water layer's tile-fragmented `natural=coastline` lines. */
export type ContextTileLayer = 'buildings' | 'roads' | 'water' | 'parks' | 'landuse' | 'rail' | 'trees' | 'sea' | 'furniture' | 'canopy';

/** One decoded tile feature: GeoJSON-ish rings in lon/lat plus the OSM tags that rode along. */
export interface ContextTileFeature {
    /** Outer rings in lon/lat. Polygons contribute their outer ring; multipolygons contribute one
     *  entry per part. Holes are dropped — cosmetic at context-massing scale — EXCEPT for a layer in
     *  `LAYER_KEEPS_HOLES` (sea: a hole is an ISLAND, and painting it blue is not cosmetic). */
    readonly rings: number[][][];
    /** §SEA-BAKE-POLYGONS — per-ring holes, index-aligned with `rings` (`holes[i]` are the interior
     *  rings of `rings[i]`, each closed, lon/lat). Present ONLY for `LAYER_KEEPS_HOLES` layers. */
    readonly holes?: ReadonlyArray<number[][][]>;
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
    /**
     * Tiles are configured and were read. `features` may legitimately be empty.
     * §CTX-TILE-READ-HONESTY (L-778) — `tilesFailed` reports how many covering tiles could NOT be
     * read; a caller that caches this result for the session must only do so when it is 0, or a
     * transient network blip becomes a permanent "partial city" for the whole session.
     */
    | {
        readonly status: 'ok'; readonly features: ContextTileFeature[]; readonly tilesRead: number; readonly tilesFailed: number;
        /** Wall time the CALLER waited — §CTX-READ-RETRY back-off included when `attempts > 1`. */
        readonly ms: number;
        /** §CTX-READ-RETRY (L-12937) — how many baked-read attempts this answer cost. Absent/1 = first try. */
        readonly attempts?: number;
    }
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
    | {
        readonly status: 'unavailable'; readonly reason: string;
        /**
         * §CTX-READ-RETRY (L-12937) — `true` when the failure was a network / 5xx / 429 / decode
         * error that a retry could plausibly clear; `false` (or absent) for 403/404 = not
         * published, zoom/cap refusals, and unsupported archives. Decides whether
         * `readContextTileFeatures` retries before the caller's Overpass fallback runs.
         */
        readonly transient?: boolean;
        /** The dominant classified failure kind, when known. */
        readonly kind?: BakedReadFailureKind;
        /** How many attempts were made before this answer (absent = a single, non-retried read). */
        readonly attempts?: number;
    };

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
    furniture: 16,  // §STREET-LIFE (L-12936) — baked z15–16; read at the finest.
    sea: 14, // §SEA-BAKE-POLYGONS — baked z8–z14 (the sea is read over 0.10°, ≤ 64 tiles; z16 would only multiply empty ocean tiles).
    // §VEG-REAL-CANOPY-BAKE (L-12935) — baked z13–16; z16 is where the ~12 m sampled cells are unsimplified.
    canopy: 16,
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
    furniture: ['highway', 'amenity'],  // §STREET-LIFE (L-12936) — street_lamp/bus_stop ride `highway`, bench/bicycle_parking ride `amenity`.
    sea: ['sea'], // §SEA-BAKE-POLYGONS — every baked sea polygon carries `sea=1` (+ `source=osmdata-water-polygons`).
    canopy: ['canopy'],  // §VEG-REAL-CANOPY-BAKE — every sampled cell carries `canopy=1` (+ `cover`, `src`, `sampled`).
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
    furniture: false,
    sea: true,
    canopy: false,  // §VEG-REAL-CANOPY-BAKE — POINTS, not areas (see LAYER_IS_POINT).
};

/**
 * §SEA-BAKE-POLYGONS — whether the reader KEEPS polygon holes for the layer (as `holes`, index-aligned
 * with `rings`). Every other areal layer drops holes as cosmetic; for the sea a hole is an island —
 * Cockatoo Island, Södermalm, the Île d'If — and a sea polygon drawn without it paints land blue.
 */
const LAYER_KEEPS_HOLES: Record<ContextTileLayer, boolean> = {
    buildings: false,
    roads: false,
    water: false,
    parks: false,
    landuse: false,
    rail: false,
    trees: false,
    furniture: false,
    sea: true,
    canopy: false,  // §VEG-REAL-CANOPY-BAKE — a point has no holes.
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
    furniture: true,  // §STREET-LIFE (L-12936) — the SECOND point layer: `highway=street_lamp` etc. NODES.
    sea: false,
    canopy: true,   // §VEG-REAL-CANOPY-BAKE — the THIRD point layer: one sampled cell per ~12 m of measured canopy.
};

/**
 * Hard cap on tiles fetched for ONE bbox. At z16 a tile is ~450 m across at Barcelona's latitude.
 * The cap exists so a nonsense bbox cannot fan out into hundreds of range requests; when it bites
 * `zoomForExtent` steps DOWN a level until it fits, and if even the tileset floor does not fit we
 * say so rather than silently returning a truncated ring.
 *
 * ⚠ THIS IS THE DEFAULT, NOT A UNIVERSAL LIMIT — see `tileFanOutCap` below. It stays at 64 because
 * for the WIDE layers the cap is doing real work: `zoomForExtent` picks the FINEST zoom that fits,
 * so raising this number makes `landuse` (0.072°) and `sea` (0.10°) read FINER for no visual gain
 * (measured: landuse z13/30 tiles at cap 64 → z14/100 tiles at cap 144). Widen a cap per layer, or
 * pay 3× the range requests on layers nobody looks at closely.
 */
export const MAX_TILES_PER_FETCH = 64;

/**
 * §CTX-EXTENT-BUDGET (L-13058) — per-layer overrides of the fan-out cap above.
 *
 * `buildings` is the only entry, and the only layer that needs one: it is the layer whose extent
 * L-13058 widened (0.011° → 0.016°, ~36 → ~81 tiles at z16 in the founder's test cities) AND the
 * layer where full z16 detail is load-bearing. The bake runs `tippecanoe -Z12 -z16
 * --drop-densest-as-needed`, so letting the buildings read fall to z15 in a dense core does not
 * merely coarsen outlines — IT DROPS WHOLE FOOTPRINTS, which is the L-579 "many buildings are not
 * rendering" defect arriving silently through a zoom step. Every other layer keeps the default.
 *
 * The value and its per-city measurement live in `contextExtentBudget.ts`.
 */
const LAYER_TILE_FAN_OUT_CAP: Partial<Record<ContextTileLayer, number>> = {
    buildings: CTX_BUILDINGS_MAX_TILES_PER_FETCH,
};

/** The fan-out cap that applies to `layer` — its own override, else `MAX_TILES_PER_FETCH`. PURE. */
export function tileFanOutCap(layer: ContextTileLayer): number {
    return LAYER_TILE_FAN_OUT_CAP[layer] ?? MAX_TILES_PER_FETCH;
}

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
 *
 * ── 2026-08-08 UPDATE (L-776): PRODUCTION IS DEPLOYED ON THE PROXY, EXPLICITLY ──
 *
 * ⚠ The paragraph above described the bucket as sending NO CORS headers. That was true when
 * written and is no longer the whole truth: the bucket policy DID land, but as an ORIGIN
 * ALLOWLIST naming `https://pryzm.fly.dev`. When the app moved to `https://app.pryzm.so`
 * (2026-08-07 DNS cutover, C51 §4) the new origin was not on that list, so every baked layer —
 * buildings, roads, rail, water, trees, landuse, parks and the terrain `layer.json` — went back
 * to being refused by the browser, along with the whole GLB catalogue.
 *
 * So `VITE_CONTEXT_TILES_URL` is now deployed as **`/api/context-tiles/`** — this same proxy,
 * selected EXPLICITLY rather than reached as an unset-variable fallback. Both routes end at the
 * same bytes; naming it explicitly means the deployed configuration says what it means, instead
 * of depending on a variable being absent.
 *
 * ⚠ A NEW ORIGIN IS NOT A DNS TASK, IT IS A CROSS-ORIGIN-TRUST TASK. R2 CORS, Supabase allowed
 * origins, OAuth redirect URIs and `ALLOWED_ORIGIN` are all origin-keyed, and R2's failure mode
 * is near-silent: the app degrades to live Overpass, logs it honestly as "a DEGRADED path", and
 * the only user-visible symptom is that context buildings lose their true heights (16% become an
 * ASSUMED 9 m default). Nothing alerts.
 *
 * EXIT CRITERION UNCHANGED, only its trigger: when `app.pryzm.so` (and any future origin) is
 * added to the bucket's AllowedOrigins — with `range` in AllowedHeaders and
 * `content-range`/`accept-ranges` in ExposeHeaders, or the ranged read fails while the policy
 * LOOKS green — set the variable back to the R2 base and this proxy stops being used, still with
 * no code change.
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
//
// ⭐ L661a (2026-09-03) — **THE WHOLE-COUNTRY BUILDINGS PUBLISH, and the first bump in this file's
// history made AFTER independently verifying the bytes rather than on a run's own verdict.**
// Run **33795775939** merged the 49 staged regions' `buildings` layer with tile-join and published
// **23,794,734,067 bytes** (23.79 GB, up from 2.40 GB) plus the first-ever `tileset-manifest.json`
// (12,410 B, `layers: ['buildings']`, `regions: 49`) at 21:01:03Z.
//
// ⚠ **THAT RUN IS RECORDED AS A FAILURE, AND THE FAILURE IS THE VERIFIER'S, NOT THE PUBLISH'S.**
// Step 11 "Publish to R2" succeeded; step 12 "Verify a tileset is publicly readable AND
// range-servable" exited 3 having probed **`/api/context-tiles/buildings.pmtiles?v=L660a`** — a
// RELATIVE PATH. `vars.VITE_CONTEXT_TILES_URL` is the CLIENT's base and is legitimately the
// same-origin proxy, so the workflow's `|| <r2.dev>` fallback never fired and curl had no host to
// resolve. Fixed the same day (§VERIFY-PROBED-A-PATH-NOT-A-URL, in BOTH workflows).
//
// The bytes were independently confirmed public and range-servable BEFORE this bump — the only
// evidence the L659a scar below accepts: `HTTP 206`, 128 bytes returned, leading magic
// `504d 5469 6c65 73` ("PMTiles"), and a manifest enumerating all 49 regions. **The rule is
// intact: the stamp moved only because the publish PROVABLY landed. It simply was not the run
// that got to say so — which is exactly why the rule is "verify", not "trust the exit code".**
//
// ⚠ SCOPE OF THIS STAMP — it now claims a tileset whose `buildings` is 2026-09-03 while
// `roads`/`parks`/`water` remain 2026-07-24 and `trees` is absent (404). Per-layer publishing is
// the disk-budget escape (§MERGE-DISK-BUDGET-IS-NAMED — 82.1 GB staged across 7 layers, against a
// plan that projected 24–57 GB), so cross-layer skew is the accepted, stated cost of shipping
// buildings now. Re-bump when the remaining layers land.
// ⭐ L662a (2026-09-04) — **THE COMPLETE SEVEN-LAYER TILESET. The cross-layer skew that L661a
// declared as an accepted cost is GONE**: every layer below was merged from the SAME 49 staged
// regions with tile-join, and every one was independently verified from the public host BEFORE
// this line moved.
//
//   | layer     | bytes          | size     | Last-Modified (UTC) | merge run   |
//   |-----------|----------------|----------|---------------------|-------------|
//   | buildings | 23,794,734,067 | 23.79 GB | 2026-09-03 21:01:03 | 33795775939 |
//   | roads     | 25,221,310,111 | 25.22 GB | 2026-09-04 09:09:33 | 33845044576 |
//   | parks     | 12,804,836,502 | 12.80 GB | 2026-09-04 10:48:54 | 33857249739 |
//   | water     | 11,684,305,420 | 11.68 GB | 2026-09-04 12:24:36 | 33865278407 |
//   | landuse   | 12,133,841,837 | 12.13 GB | 2026-09-04 15:33:12 | 33882625166 |
//   | rail      |  1,270,296,996 |  1.27 GB | 2026-09-04 15:46:05 | 33890361140 |
//   | trees     |    417,777,328 |  0.42 GB | 2026-09-04 16:07:13 | 33892581306 |
//
// 87.32 GB live. `tileset-manifest.json` after the last merge: `layers: [buildings, landuse,
// parks, rail, roads, trees, water]` (**7**), `regions: 49`, `mergedLayers: ['trees']`,
// `mergeRunId: 33892581306`, `mergeGitSha: d4cf09a4`.
//
// ⭐ **§MANIFEST-LAYER-CARRY-FORWARD HELD ACROSS ALL SEVEN PUBLISHES.** Every per-layer merge
// REWRITES the manifest, and before `84e6a350` it rewrote it with only the layer it had just
// merged — publishing roads would have erased buildings from the record the next merge reads. The
// regression check was re-run after each publish in this sequence and the layer set only ever
// grew: [buildings] → +roads → +parks → +water → +landuse → +rail → +trees. That is the evidence
// that per-layer publishing (the §MERGE-DISK-BUDGET-IS-NAMED escape) does not silently amputate
// the tileset — not an argument that it cannot.
//
// ⚠ **TWO OF THESE HAD NEVER BEEN PUBLISHED AT ALL, AND ONE WAS SIX WEEKS STALE BEHIND A 200.**
// `rail` and `trees` answered 404 under every prior stamp — not because they were unbaked (staged
// 49/49 since 2026-09-03) but because no publish had ever INCLUDED them; absence in `tiles/` is
// not absence in `tiles-staging/`. `landuse` was worse: it served **936,257,447 bytes dated
// 2026-07-29** — a healthy 200 OK carrying six-week-old bytes, which is the harder failure to see
// precisely because nothing about it looks broken. It is now 12.13 GB. **A layer that answers 200
// is not thereby current; only Last-Modified says that.**
//
// Verified per `docs/04-reference/runbooks/RUNBOOK-CONTEXT-R2-PUBLISH.md` §3 from the public
// r2.dev host for EACH of the seven — never from a run's own exit code, which is the trap the
// L661a scar above records: `HTTP 200` with today's `Last-Modified`, a `Range: bytes=0-127` read
// returning **206** with 128 bytes (PMTiles is entirely range reads — a 200-not-206 makes the
// archive useless even though the bytes are there), and leading magic `504d 5469 6c65 73`. Then
// re-read through the BROWSER'S OWN decoder at Barcelona 41.3874,2.1686 with
// `tools/context-height-probe/probe.mjs --json`: verdict **measured**, 6,332 footprints, 6,065
// measured-LiDAR (assumed fraction 0.005), **25 of 25 covering tiles read, 0 failed, 0 absent**.
export const CONTEXT_TILESET_VERSION = 'L663a';

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
    missingArchives.clear(); // §CTX-KNOWN-MISSING — a new base may well HAVE the layer.
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

/**
 * §CTX-ZOOM-FITS-EXTENT (L-662) — the FINEST zoom, no finer than `preferredZ` and no coarser than
 * `minZoom`, whose tile fan-out for `bbox` fits inside `MAX_TILES_PER_FETCH`. PURE + testable.
 *
 * Returns `minZoom` when even that does not fit — the caller still refuses rather than truncating.
 * See the call site for why a fixed per-layer zoom silently pushed the two widest layers
 * (landuse ~8 km, water ~11 km) onto live Overpass.
 */
export function zoomForExtent(
    bbox: TileBbox,
    preferredZ: number,
    minZoom: number,
    cap: number = MAX_TILES_PER_FETCH,
): number {
    let z = preferredZ;
    // ⚠ COUNT, DO NOT ENUMERATE. Asking `tilesCovering` how many tiles a bbox needs means
    // ALLOCATING one object per tile just to read `.length` — and the whole point of this search is
    // that the first zoom tried may need thousands. A hemisphere-wide bbox at z16 is ~10^9 tiles,
    // which is an out-of-memory crash rather than a rejection: the guard against a nonsense extent
    // would itself be the thing that took the tab down. `tileCountCovering` is the same arithmetic
    // without the array.
    while (z > minZoom && tileCountCovering(bbox, z) > cap) z--;
    return z;
}

/**
 * How many tiles `tilesCovering(bbox, z)` WOULD return, computed arithmetically — no allocation.
 * PURE + testable, and the only safe way to ask the question for an extent that may be enormous.
 */
export function tileCountCovering(bbox: TileBbox, z: number): number {
    const [w, s, e, n] = bbox;
    const max = 2 ** z;
    const x0 = Math.max(0, lonToTileX(Math.min(w, e), z));
    const x1 = Math.min(max - 1, lonToTileX(Math.max(w, e), z));
    // y grows SOUTHWARD, so the north edge gives the lower index.
    const y0 = Math.max(0, latToTileY(Math.max(s, n), z));
    const y1 = Math.min(max - 1, latToTileY(Math.min(s, n), z));
    if (x1 < x0 || y1 < y0) return 0;
    return (x1 - x0 + 1) * (y1 - y0 + 1);
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
/**
 * §CTX-RANGE-COALESCE (L-716) — the byte ranges a bbox needs are ADJACENT in the archive, so ask
 * for the SPAN once instead of asking for each tile.
 *
 * ⚠ THIS IS THE FIX FOR THE 27-SECOND "Opening the 3D Site — taking too long", AND THE PREVIOUS
 * THREE ATTEMPTS ALL AIMED AT THE READINESS PREDICATE INSTEAD. The founder's fourth occurrence
 * finally named the cost directly:
 *     §CTX-PMTILES-READER water:   … from 25 baked tile(s) in 26013 ms
 *     §CTX-PMTILES-READER roads:   … from 25 baked tile(s) in 27213 ms
 *     §CTX-PMTILES-READER landuse: … from 30 baked tile(s) in 27266 ms
 *     §CTX-PMTILES-READER parks:   … from 25 baked tile(s) in 27609 ms
 * — five layers, all finishing within 1.6 s of each other at ~27 s. And the same session's WARM
 * re-reads were `water 8 ms · roads 64 ms · landuse 66 ms · buildings 22 ms`, three orders of
 * magnitude faster, which proves the cost is network I/O and not parsing or geometry.
 *
 * MEASURED against the live R2 tileset (Barcelona Eixample, `scratchpad/probe-ctx-volume.mjs` and
 * `probe-ctx-coalesce.mjs`, 2026-08-07):
 *   • one cold 3D-Site open issues **124 range requests** carrying **1,002 KiB** in total;
 *   • per-request latency, measured by fetching the same 20 tiles strictly one at a time:
 *     3,948 ms / 20 = **197 ms**;
 *   • 124 × 197 ms = **24.4 s**, against the founder's observed 26–27 s.
 *
 * ⚠ SO THE BOTTLENECK IS NEITHER BANDWIDTH NOR SERIALISATION IN *OUR* CODE, and getting that
 * distinction right is the whole finding. One megabyte cannot take 27 s on any link the founder
 * has (at 5 Mbit/s it is 1.6 s), and the reader already fans out with `Promise.all` — the same
 * 20 tiles that take 3,948 ms serially take **613 ms** concurrently here, a ×6.4 speedup. What
 * costs 27 s is paying a ROUND TRIP 124 times for one megabyte. Any queueing anywhere in the path
 * — a per-host connection cap, a shared proxy, a congested uplink — multiplies straight into that
 * count, which is exactly why all five layers land together: they are interleaved in one queue.
 * The architecturally durable answer is therefore not "make the 124 requests faster" but
 * **stop making 124 requests**.
 *
 * PMTiles orders tile data by Hilbert tile id, so the tiles covering one bbox occupy a nearly
 * contiguous byte span. Measured collapse, per layer, at this gap tolerance:
 *      buildings 36 → 5 · roads 21 → 4 · water 28 → 3 · parks 20 → 2 · landuse 19 → 4
 *      TOTAL **124 → 18 requests**, payload 1,002 → 1,274 KiB.
 * 272 KiB of skipped-over gap bytes to remove 106 round trips: at the measured 197 ms that is
 * 24.4 s → 3.5 s in the queued case, and it leaves the already-fast concurrent case untouched.
 *
 * ⚠ COALESCING MUST NEVER LOSE DATA — it is an optimisation, and this subsystem's whole reason to
 * exist is that a failure must not read as an empty city (§CONTEXT-DATA-HONESTY, L-467/469). A span
 * bundles ~10 tiles into one request, so a span failure would drop ten tiles where today one tile
 * fails alone. `flush()` therefore RE-ISSUES every member of a failed span individually before
 * giving up, so the worst case degrades to exactly today's behaviour rather than to a hole.
 */
export const RANGE_COALESCE_MAX_GAP_BYTES = 64 * 1024;

/**
 * Hard ceiling on ONE coalesced request. Without it a sparse archive (a leaf directory megabytes
 * away from its tile data) could merge into a span covering most of a 2.3 GB file — a request that
 * would "work" and take the tab down, the same shape of catastrophe as the `MAX_TILES_PER_FETCH`
 * fan-out guard. A span that would exceed this is split; the pieces are still far fewer than the
 * individual ranges they replace.
 */
export const RANGE_COALESCE_MAX_SPAN_BYTES = 4 * 1024 * 1024;

/** One requested byte range, tagged with its position in the caller's array. */
export interface ByteRange { readonly offset: number; readonly length: number }

/** A merged span plus the indices of the input ranges it serves. */
export interface CoalescedSpan {
    readonly offset: number;
    readonly length: number;
    readonly members: readonly number[];
}

/**
 * §CTX-RANGE-COALESCE — merge byte ranges separated by no more than `maxGap` into single spans,
 * never exceeding `maxSpan`. PURE + testable; the transport below is the only caller.
 *
 * ⚠ The returned `members` are indices into `ranges` AS GIVEN, not into the sorted order — the
 * caller must be able to hand each waiting request its own slice back, and an ordering that only
 * the sort knows about would silently pair a tile with another tile's bytes.
 */
export function coalesceRanges(
    ranges: readonly ByteRange[],
    maxGap: number = RANGE_COALESCE_MAX_GAP_BYTES,
    maxSpan: number = RANGE_COALESCE_MAX_SPAN_BYTES,
): CoalescedSpan[] {
    const order = ranges.map((r, i) => ({ ...r, i })).sort((a, b) => a.offset - b.offset);
    const out: Array<{ offset: number; length: number; members: number[] }> = [];
    for (const r of order) {
        const last = out[out.length - 1];
        const merged = last ? Math.max(last.length, r.offset + r.length - last.offset) : 0;
        if (last && r.offset - (last.offset + last.length) <= maxGap && merged <= maxSpan) {
            last.length = merged;
            last.members.push(r.i);
        } else {
            out.push({ offset: r.offset, length: r.length, members: [r.i] });
        }
    }
    return out;
}

/** One caller waiting inside the current coalescing window. */
interface PendingRange {
    readonly offset: number;
    readonly length: number;
    readonly signal?: AbortSignal;
    readonly resolve: (r: RangeResponse) => void;
    readonly reject: (e: unknown) => void;
}

/**
 * §CTX-RANGE-URL-SOURCE (L-661) — a PMTiles `Source` that gives every byte range its OWN URL and
 * lets the browser cache it, and (L-716) COALESCES the ranges of one read into a handful of spans.
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
 *
 * ⚠ L-661 WAS NECESSARY AND NOT SUFFICIENT, which is why §CTX-RANGE-COALESCE sits on top of it.
 * Removing `no-store` restored caching and concurrency, and the read still cost 27 s cold, because
 * 124 individually-correct requests is itself the defect. See the §CTX-RANGE-COALESCE note above.
 */
class RangeUrlFetchSource implements Source {
    /** Requests accumulated in the current coalescing window. */
    private queue: PendingRange[] = [];
    /** The scheduled flush, or null when the window is closed. */
    private flushTimer: ReturnType<typeof setTimeout> | null = null;

    constructor(private readonly url: string) {}

    /** The archive identity for the library's internal directory cache — the range-less URL. */
    getKey(): string {
        return this.url;
    }

    /**
     * Enqueue a range and let the window close before anything hits the network.
     *
     * ⚠ THE WINDOW IS A MACROTASK (`setTimeout(…, 0)`), NOT A MICROTASK, AND THAT IS LOAD-BEARING.
     * `readContextTileFeatures` fans out with `Promise.all(tiles.map(loadTile))`, and each branch
     * `await`s the cached header and directory promises before it reaches `getBytes`. Those awaits
     * resolve on the MICROTASK queue of the current task, so a `queueMicrotask` flush would fire
     * after the first branch and leave the other 34 to trickle out one window at a time — it would
     * coalesce almost nothing while looking like it worked. A macrotask runs only once the whole
     * microtask queue has drained, i.e. once every branch has queued its range.
     */
    getBytes(offset: number, length: number, signal?: AbortSignal): Promise<RangeResponse> {
        return new Promise<RangeResponse>((resolve, reject) => {
            this.queue.push({ offset, length, signal, resolve, reject });
            if (this.flushTimer === null) {
                this.flushTimer = setTimeout(() => { this.flushTimer = null; void this.flush(); }, 0);
            }
        });
    }

    /** Issue one request per coalesced span and hand every waiter its own slice. */
    private async flush(): Promise<void> {
        const batch = this.queue;
        this.queue = [];
        // ⚠ Drop callers that gave up while the window was open — fetching bytes nobody is waiting
        // for is the waste this whole change exists to remove. An abort is NOT a failure
        // (§L-579): the caller's own `signal?.aborted` check turns it into `status: 'aborted'`.
        const live: PendingRange[] = [];
        for (const p of batch) {
            if (p.signal?.aborted) p.reject(new DOMException('Aborted', 'AbortError'));
            else live.push(p);
        }
        if (live.length === 0) return;

        const spans = coalesceRanges(live.map((p) => ({ offset: p.offset, length: p.length })));
        await Promise.all(spans.map(async (span) => {
            let bytes: { data: ArrayBuffer; etag?: string; cacheControl?: string; expires?: string };
            try {
                bytes = await this.fetchRange(span.offset, span.length);
            } catch (spanError) {
                // ⚠ NEVER LOSE A TILE TO THE OPTIMISATION. One failed span would otherwise take
                // every tile it bundled with it, turning a transient blip into a visible hole in
                // the massing — a failure rendered as "nothing is here", which is precisely the
                // §CONTEXT-DATA-HONESTY defect this subsystem was built to end. Fall back to the
                // pre-coalescing behaviour: one request per member, each failing on its own merits.
                console.warn(
                    `[contextTiles] §CTX-RANGE-COALESCE span ${span.offset}+${span.length} failed ` +
                    `(${String((spanError as Error)?.message ?? spanError)}) — re-issuing its ` +
                    `${span.members.length} range(s) individually so no tile is lost to the batch.`,
                );
                await Promise.all(span.members.map(async (i) => {
                    const p = live[i]!;
                    try { p.resolve(await this.fetchRange(p.offset, p.length)); }
                    catch (e) { p.reject(e); }
                }));
                return;
            }
            for (const i of span.members) {
                const p = live[i]!;
                const start = p.offset - span.offset;
                p.resolve({
                    // ⚠ `slice`, never a view: `RangeResponse.data` is an ArrayBuffer the decoder
                    // wraps directly, and handing out overlapping views of one buffer would let two
                    // tiles' decodes read each other's bytes.
                    data: bytes.data.slice(start, start + p.length),
                    etag: bytes.etag,
                    cacheControl: bytes.cacheControl,
                    expires: bytes.expires,
                });
            }
        }));
    }

    /** One real HTTP range request. Distinct URL per range — see the class note. */
    private async fetchRange(
        offset: number,
        length: number,
    ): Promise<{ data: ArrayBuffer; etag?: string; cacheControl?: string; expires?: string }> {
        const sep = this.url.includes('?') ? '&' : '?';
        const rangeUrl = `${this.url}${sep}r=${offset}-${length}`;
        // ⚠ NO `signal`. A coalesced request serves several callers, so one caller's cancellation
        // must not empty a download the others are awaiting — the same rule as §CTX-ONE-READ-PER-BBOX
        // and the `tileInFlight` shared read. Callers that aborted were already rejected in `flush`.
        const resp = await fetch(rangeUrl, {
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

/**
 * §CTX-KNOWN-MISSING (founder 2026-08-10, GIS speed) — archives whose HEADER read came back
 * 403/404 this session, keyed by the full stamped URL.
 *
 * ⚠ THE EXAMPLE BELOW IS HISTORY AS OF L662a (2026-09-04): `rail` and `trees` are PUBLISHED and
 * this memo is dormant for them. The MECHANISM is not history — any layer can be absent under a
 * future stamp, and the two round trips per failed header read are still paid on the hot path.
 *
 * WHY: `rail.pmtiles` and `trees.pmtiles` were absent from the bucket for v=L660a, so EVERY
 * context load re-asked for their headers, and each failed header read costs TWO round trips
 * (the §CTX-RANGE-COALESCE span attempt + its per-member re-issue fallback) — paid again on
 * every re-render of the session, on the same hot path the present layers are streaming on.
 * A 403/404 on the archive itself is not transient: the OBJECT is not there, and it will not
 * appear mid-session (a re-bake ships a new `CONTEXT_TILESET_VERSION`, which is a NEW url/key).
 *
 * ⚠ HONESTY UNCHANGED: the memo returns the SAME `unavailable` status with the original reason,
 * so callers still log their honest "rendering NO rail" line — this removes the repeated network
 * round-trips, never the answer. Network errors and 5xx are NOT memoised (transient by nature).
 * Cleared with the archives (test seam + base-URL change), so a config change retries cold.
 */
const missingArchives = new Map<string, string>();

/** TRUE when a reader `unavailable.reason` proves the ARCHIVE is absent (403/404 on its header), as
 *  opposed to any other failure. Exported so a layer whose absence is an honest EMPTY (§STREET-LIFE:
 *  `furniture` not yet baked) can tell "not baked" from "read failed" without re-parsing HTTP. */
export function isArchiveMissingError(message: string): boolean {
    return /Bad response code: 40[34]\b/.test(message);
}

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
 * §CTX-READ-RETRY-EVICT (L-12937) — drop the cached `PMTiles` instance for `layer`, so the NEXT
 * attempt re-reads the header and the directories over the network.
 *
 * ⚠ THIS IS NOT AN OPTIMISATION — IT IS WHAT MAKES THE RETRY REAL, AND WITHOUT IT THE RETRY WOULD
 * BE INCAPABLE OF SUCCEEDING WHILE LOOKING LIKE IT RAN. `pmtiles`' `SharedPromiseCache` stores the
 * in-flight header/directory PROMISE in its cache BEFORE the promise settles and never deletes a
 * REJECTED one (pmtiles@4.4.1 `src/index.ts:773-790` `getHeader`, `:809-820` `getDirectory` — the
 * `.catch(e => reject(e))` leaves the entry in place). A second `getHeader()` on the same instance
 * therefore `await`s the SAME rejected promise and fails identically with no HTTP request at all.
 * A fresh `PMTiles` gets a fresh `SharedPromiseCache` (`:887-891`), which is why this evicts the
 * INSTANCE rather than trying to reach into the library's cache.
 *
 * ⚠ The §CTX-TILE-DECODE-CACHE is deliberately NOT cleared. It is keyed by (version, layer, z, x,
 * y) and holds only tiles that DID decode, so keeping it is what makes the retry cheap: the second
 * attempt re-reads exactly the tiles that failed and nothing else.
 */
function dropArchive(layer: ContextTileLayer): void {
    const url = contextTilesetUrl(layer);
    if (url) archives.delete(url);
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

/**
 * §CTX-READ-RETRY (L-12937) — how ONE tile failed to read. Carried instead of a bare `null` so the
 * aggregate can (a) say WHY in its reason — the founder's console used to read "all 25 tile
 * read(s) failed" with no cause — and (b) decide whether a retry could clear it.
 */
interface TileReadFailure {
    readonly failed: true;
    readonly kind: BakedReadFailureKind;
    readonly message: string;
}
function isTileReadFailure(v: ContextTileFeature[] | TileReadFailure): v is TileReadFailure {
    return !Array.isArray(v);
}

/** Concurrent readers of the SAME tile share ONE range request instead of racing duplicates. */
const tileInFlight = new Map<string, Promise<ContextTileFeature[] | TileReadFailure>>();

/**
 * §CTX-READ-PROVENANCE (founder 2026-09-07, live build `cd5bcbb9`) — what one read actually PAID
 * FOR, as opposed to how long it waited.
 *
 * ⭐ THE MISREADING THIS EXISTS TO END, IN THE FOUNDER'S OWN NUMBERS. His Barcelona console shows
 * `parks: 800 green area(s) from 81 baked tile(s)` THREE times — at 5672 ms, 3401 ms and 3400 ms —
 * and `landuse: 2265 area(s) from 30 baked tile(s)` three times at 3754 / 1486 / 1486 ms. Read
 * naively that is ~9 s of duplicated parks work, and it was escalated as exactly that.
 *
 * ⛔ IT IS NOT. Those are THREE CALLERS SHARING ONE DOWNLOAD. The three lines carry the SAME feature
 * count and the SAME tile count, so they resolve to the SAME (version, layer, z, x, y) keys by
 * construction — and `tileCache` + `tileInFlight` (directly above) already de-duplicate at that
 * exact granularity, registering the in-flight promise BEFORE it settles. Callers 2 and 3 started
 * ~2.27 s after caller 1 and finished at the SAME INSTANT as it: 5672 − 3401 ≈ 5672 − 3400. Three
 * equal end-times is the signature of one download, not three.
 *
 * What `ms` measures is each caller's own elapsed WALL-CLOCK, which for callers 2 and 3 is almost
 * entirely WAITING on caller 1's read. Their marginal cost is the per-read bbox crop — milliseconds.
 * A duration printed without its provenance reads as a price, and this one is not one
 * (§CONTEXT-DATA-HONESTY: the number was true and the thing it was taken to mean was false).
 *
 * ⚠ THE REAL COST IS STILL REAL, AND THIS DOES NOT HIDE IT: caller 1's 5672 ms for 81 tiles —
 * ~2 coalesced range requests after §CTX-RANGE-COALESCE — is same-origin QUEUEING behind Cesium's
 * terrain stream and the other layers, not decode time. That is the number worth attacking.
 */
export interface TileReadProvenance {
    /** Tiles this read actually fetched and decoded — the only ones it PAID for. */
    downloaded: number;
    /** Tiles already decoded by an earlier read — free. */
    fromCache: number;
    /** Tiles another read had already put in the air — this read WAITED, it did not pay. */
    sharedInFlight: number;
}

/**
 * Bound on the decoded-tile cache. A cache is only a cache if it is BOUNDED (§L-273 learned this
 * the expensive way, when an unbounded per-bbox localStorage cache filled the origin and took
 * autosave's project index down with it). 512 tiles ≈ 14 far-extent reads' worth of distinct
 * tiles; eviction is oldest-first by insertion, which for a user panning around one site is the
 * tiles they have moved away from.
 */
const MAX_CACHED_TILES = CTX_MAX_CACHED_TILES;

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

/**
 * §SEA-BAKE-POLYGONS — the hole-preserving twin of `ringsFor`, for `LAYER_KEEPS_HOLES` layers only:
 * one `{ outer, holes }` per polygon part. Non-polygon geometry yields nothing (the sea layer is baked
 * as polygons; a stray LineString is not sea). Exported for the unit test; production calls it only
 * through `loadTile`.
 */
export function polygonPartsFor(
    geometry: { type: string; coordinates: unknown },
): Array<{ outer: number[][]; holes: number[][][] }> {
    const part = (poly: number[][][]): { outer: number[][]; holes: number[][][] } | null => {
        const outer = closeRing(poly[0] ?? []);
        if (outer.length < 4) return null;
        const holes = poly.slice(1).map(closeRing).filter((h) => h.length >= 4);
        return { outer, holes };
    };
    switch (geometry.type) {
        case 'Polygon': {
            const p = part(geometry.coordinates as number[][][]);
            return p ? [p] : [];
        }
        case 'MultiPolygon':
            return (geometry.coordinates as number[][][][])
                .map(part)
                .filter((p): p is { outer: number[][]; holes: number[][][] } => p !== null);
        default:
            return [];
    }
}

/** Does this feature actually belong to the layer, or is it an incidental referenced object? */
function belongsToLayer(tags: Record<string, string>, layer: ContextTileLayer): boolean {
    return LAYER_DEFINING_TAGS[layer].some((t) => t in tags);
}

/**
 * §CTX-TILE-READ-HONESTY (L-778) — decide whether a multi-tile read is a real answer or a failure
 * wearing one's clothes. PURE + testable; `readContextTileFeatures` is the only production caller.
 *
 * Extracted after the 2026-08-10 incident: central Barcelona (41.43562, 2.17929) rendered
 * "0 footprints" from a read reported as SUCCESSFUL, while the production tileset — probed the same
 * day at the same coordinate — held 6,091 footprints there. The old rule declared `unavailable` only
 * when EVERY tile read failed; one tile that happened to read (an absent sea/edge tile decodes as an
 * honest `[]`) plus thirty-five failed tiles therefore aggregated to `ok` with zero features — a
 * mostly-failed read collapsed into a truthful empty, which is the §CONTEXT-DATA-HONESTY defect
 * (failure and empty must never be the same value) at the AGGREGATION level rather than the
 * per-request level.
 */
export function tileReadVerdict(
    tilesRead: number,
    tilesFailed: number,
    featureCount: number,
): { status: 'ok' } | { status: 'unavailable'; reason: string } {
    // Every single tile request failed ⇒ this is a FAILURE, not an empty neighbourhood.
    if (tilesRead === 0 && tilesFailed > 0) {
        return { status: 'unavailable', reason: `all ${tilesFailed} tile read(s) failed` };
    }
    // ANY failure + ZERO features ⇒ the empty is not credible. The tiles that failed are exactly
    // the ones that could have held the city; declaring "nothing is mapped here" on the strength
    // of the few that happened to read is the founder's 2026-08-10 blank-Barcelona incident.
    //
    // ⚠ Deliberately NOT the reverse ("failures + features ⇒ unavailable"): a partial read that
    // DID recover footprints renders most of the city, which beats discarding real data to
    // re-ask a rate-limited third party. The caller sees `tilesFailed` and must not session-cache
    // such a result — see the ok-variant note.
    if (tilesFailed > 0 && featureCount === 0) {
        return {
            status: 'unavailable',
            reason:
                `${tilesFailed} of ${tilesRead + tilesFailed} tile read(s) failed and the ` +
                `${tilesRead} that did read held no features — a mostly-failed read must not ` +
                'pass as an empty neighbourhood (§CTX-TILE-READ-HONESTY)',
        };
    }
    return { status: 'ok' };
}

/**
 * §CTX-READ-RETRY (L-12937) — the aggregate verdict on ONE attempt's tile failures: the dominant
 * kind, an example message, and whether a retry could plausibly clear it. PURE + testable.
 *
 * ⚠ A RETRYABLE KIND WINS EVEN WHEN IT IS NOT THE MOST FREQUENT, and that asymmetry is deliberate.
 * The two alternatives are not symmetric in cost: a retry re-reads only the tiles that failed
 * (every tile that decoded is in the §CTX-TILE-DECODE-CACHE) against static CDN bytes, while the
 * other branch is live Overpass — the third party L-513 proved cannot be made dependable, and
 * whose failure mode is a 45-second hang or a 429. Trying the cheap reliable source once more
 * before consulting the expensive unreliable one is the whole change.
 */
export function summariseTileFailures(
    failures: ReadonlyArray<{ readonly kind: BakedReadFailureKind; readonly message: string }>,
): { kind: BakedReadFailureKind; transient: boolean; message: string } {
    if (failures.length === 0) return { kind: 'unknown', transient: false, message: '' };
    const counts = new Map<BakedReadFailureKind, number>();
    for (const f of failures) counts.set(f.kind, (counts.get(f.kind) ?? 0) + 1);
    let best = failures[0]!.kind;
    let bestScore = -1;
    for (const [kind, n] of counts) {
        const score = (RETRYABLE_BAKED_READ_KINDS.has(kind) ? 1_000_000 : 0) + n;
        if (score > bestScore) { bestScore = score; best = kind; }
    }
    return {
        kind: best,
        transient: RETRYABLE_BAKED_READ_KINDS.has(best),
        message: failures.find((f) => f.kind === best)?.message ?? '',
    };
}

/**
 * Read every feature of `layer` covering `bbox` from the baked PMTiles, RETRYING a transient
 * failure before the caller's Overpass fallback is allowed to run.
 *
 * NEVER throws. Individual tile failures are tolerated (a missing tile at the edge of the baked
 * region is normal); the result is only `unavailable` when the read genuinely failed
 * (§CTX-TILE-READ-HONESTY), and by then it has been attempted `DEFAULT_BAKED_READ_ATTEMPTS` times.
 *
 * §CTX-READ-RETRY (L-12937) — THE DEFECT THIS CLOSES (founder, 2026-09-05: "I NEED CONSISTENCY"):
 *   • Jouy-en-Josas — the console carried `§CTX-PMTILES-READER` lines for landuse/parks/rail/trees/
 *     water and NO `roads` line, then `§OVERPASS-CLIENT-FAILOVER — ALL upstream mirrors failed
 *     (429/timeout)`; the founder saw no roads at all.
 *   • Amsterdam, the same day — landuse/parks/rail/tree tile reads failed while a bake was
 *     PUBLISHING to R2, i.e. the reads were racing the upload (503 / rate-limit).
 * In both, ONE transient baked-read failure fell STRAIGHT THROUGH to live Overpass, so a layer was
 * missing on one load and present on the next. The baked tiles are static bytes on a CDN: reading
 * them again 400 ms later is overwhelmingly likely to work, and costs one coalesced range request
 * per FAILED tile. So the fallback now runs only once the retries are exhausted, and when it does,
 * the console says the layer FAILED — never letting a failure read as "nothing is mapped here"
 * (§CONTEXT-DATA-HONESTY, C57 §1.5/§1.9, C58 §1.2).
 *
 * ⚠ WHAT IS **NOT** RETRIED, because these are ANSWERS and not failures:
 *   • `ok` with zero features — an honest EMPTY. Re-asking for a second opinion on "nothing is
 *     mapped here" is the L-467/L-469 conflation wearing a retry's clothes.
 *   • `aborted` — the caller cancelled (§L-579); a newer request is already in flight.
 *   • `disabled` — no tiles URL configured.
 *   • a 403/404 archive, a zoom below the tileset floor, a bbox over the tile cap — structural
 *     refusals that a second identical request cannot change.
 *
 * ⚠ ONE READER, SO ONE POLICY. The §CTX-WARM-ALL-LAYERS warm path and the `CesiumViewport` render
 * path both reach the baked tiles ONLY through this function (`fetchContext{Roads,Water,Parks,
 * Landuse,Rail,Trees}` all call it), so they share the retry by construction rather than by two
 * copies of a policy that would drift. A warm read and a render read of the same tile also still
 * share ONE range request via `tileInFlight`, and each attempt re-forms that sharing.
 */
export async function readContextTileFeatures(
    layer: ContextTileLayer,
    bbox: TileBbox,
    signal?: AbortSignal,
    /** §SITE-SCOPE F-2 — a PER-READ fan-out cap. A scope-derived read of a `--drop-densest`
     *  layer passes `scopeReadFanOutCap(halfDeg)` so it stays at z16 inside the measured scope
     *  range; omitted ⇒ the layer's own default (`tileFanOutCap`). */
    opts: { readonly fanOutCap?: number } = {},
): Promise<ContextTileResult> {
    const t0 = Date.now();
    let used = 1;
    let answer: ContextTileResult;
    try {
        answer = await withBakedReadRetry(
            async (attempt) => {
                used = attempt;
                const r = await readContextTilesOnce(layer, bbox, signal, opts.fanOutCap);
                // The ONLY retryable outcome. `withBakedReadRetry` never retries a returned VALUE,
                // so an honest empty, an abort and a structural refusal all return here at once.
                if (r.status === 'unavailable' && r.transient) {
                    throw new BakedReadError(r.reason, r.kind ?? 'unknown');
                }
                return r;
            },
            {
                attempts: DEFAULT_BAKED_READ_ATTEMPTS,
                delaysMs: DEFAULT_BAKED_READ_DELAYS_MS,
                signal,
                onRetry: ({ attempt, attempts, delayMs, error }) => {
                    // §CTX-READ-RETRY-EVICT — MUST come before the next attempt, or pmtiles replays
                    // its cached rejected header/directory promise and the retry cannot succeed.
                    dropArchive(layer);
                    console.warn(
                        `[gis] §CTX-READ-RETRY (L-12937) layer=${layer} attempt ${attempt + 1}/${attempts} ` +
                        `in ${delayMs} ms after ${errorMessage(error)}`,
                    );
                },
            },
        );
    } catch (e) {
        // The retry loop rethrows the LAST error. An abort during a back-off is the caller
        // cancelling, not a broken tileset (§L-579).
        if (signal?.aborted) return { status: 'aborted' };
        const c = classifyBakedReadError(e);
        answer = {
            status: 'unavailable',
            reason: c.message,
            transient: RETRYABLE_BAKED_READ_KINDS.has(c.kind),
            kind: c.kind,
            attempts: used,
        };
    }

    if (answer.status === 'ok') {
        // §CTX-TILE-READ-HONESTY — a PARTIAL read is a real answer (it renders most of the city)
        // but it is also the shape that makes a layer look different on two consecutive loads, so
        // it is named in the console instead of hiding behind a `tilesRead` count that omits it.
        if (answer.tilesFailed > 0) {
            console.warn(
                `[gis] §CTX-READ-RETRY (L-12937) layer=${layer} PARTIAL: ${answer.tilesFailed} of ` +
                `${answer.tilesRead + answer.tilesFailed} covering tile(s) failed to read; the ` +
                `${answer.tilesRead} that read held ${answer.features.length} feature(s) and are ` +
                'rendered. This is an INCOMPLETE answer, not an empty one — do not session-cache it.',
            );
        }
        return used > 1 ? { ...answer, ms: Date.now() - t0, attempts: used } : answer;
    }
    if (answer.status === 'aborted') {
        // §CTX-READ-RETRY (L-12937) — SAY SO. This branch returned nothing and printed NOTHING, and
        // that silence is half of the Jouy-en-Josas symptom: the console carried a
        // `§CTX-PMTILES-READER` line for every layer EXCEPT roads, so the one layer the founder
        // could not see was also the one the log could not explain. An abort is not a failure
        // (§L-579) — a newer request is already in flight and will paint — but a read that yields
        // no features must never leave the console unable to tell which of the two happened.
        console.log(
            `[gis] §CTX-READ-RETRY (L-12937) layer=${layer} ABORTED after ${Date.now() - t0} ms ` +
            '— the caller cancelled (view/location change); a newer read paints this layer. ' +
            'NOT a failure, NOT an empty: no Overpass call is warranted.',
        );
        return answer;
    }
    if (answer.status !== 'unavailable') return answer;

    const final: ContextTileResult = { ...answer, attempts: used };
    if (used > 1) {
        console.error(
            `[gis] §CTX-READ-RETRY (L-12937) layer=${layer} FAILED after ${used}/${DEFAULT_BAKED_READ_ATTEMPTS} ` +
            `baked-read attempt(s) over ${Date.now() - t0} ms — ${answer.reason}. ⚠ FAILED IS NOT EMPTY: ` +
            'nothing here says this layer is unmapped. The caller\'s live-Overpass fallback runs next and ' +
            'is a DEGRADED path; whatever it returns must never be presented as the baked answer.',
        );
    }
    return final;
}

/**
 * ONE baked read attempt — the whole pre-§CTX-READ-RETRY body, unchanged except that every
 * `unavailable` now carries `kind` + `transient` so the wrapper above can tell a hiccup from a
 * structural refusal. Never throws.
 */
async function readContextTilesOnce(
    layer: ContextTileLayer,
    bbox: TileBbox,
    signal?: AbortSignal,
    /** §SITE-SCOPE F-2 — the per-read fan-out cap threaded from `readContextTileFeatures`'s
     *  `opts.fanOutCap`; `undefined` ⇒ the layer's own default (`tileFanOutCap`). */
    fanOutCapOverride?: number,
): Promise<ContextTileResult> {
    const archive = archiveFor(layer);
    if (!archive) return { status: 'disabled' };

    // §CTX-KNOWN-MISSING — an archive that 403/404'd its header this session is not going to
    // materialise; answer `unavailable` immediately instead of paying the round trips again.
    const archiveUrl = contextTilesetUrl(layer);
    if (archiveUrl) {
        const knownMissing = missingArchives.get(archiveUrl);
        if (knownMissing !== undefined) {
            // §CTX-KNOWN-MISSING is a 403/404: the OBJECT is not published under this stamp, so it
            // is NOT transient and must not be retried (a re-bake ships a new tileset version,
            // i.e. a new URL). `transient: false` is what stops the retry loop here.
            return {
                status: 'unavailable',
                reason: `${knownMissing} (known missing this session — not re-fetched)`,
                transient: false,
                kind: 'http-4xx',
            };
        }
    }

    const t0 = Date.now();
    let z = LAYER_ZOOM[layer];
    // §CTX-ZOOM-FITS-EXTENT — the tileset's own floor, so the zoom search below can never ask for
    // a level the archive does not carry.
    let minZoom = 0;
    try {
        const header = await archive.getHeader();
        // Clamp to what the tileset ACTUALLY holds — a re-bake at a different zoom would otherwise
        // read tiles that do not exist and look exactly like "no context here".
        z = Math.min(z, header.maxZoom);
        minZoom = header.minZoom;
        if (z < header.minZoom) {
            // A structural refusal — the archive does not carry this zoom. Retrying is pointless.
            return {
                status: 'unavailable',
                reason: `zoom ${z} below tileset minZoom ${header.minZoom}`,
                transient: false,
                kind: 'unknown',
            };
        }
    } catch (e) {
        // An abort during the header read is the caller cancelling, not a broken tileset.
        if ((e as Error)?.name === 'AbortError' || signal?.aborted) return { status: 'aborted' };
        const classified = classifyBakedReadError(e);
        const reason = `header read failed: ${classified.message}`;
        // §CTX-KNOWN-MISSING — a 403/404 on the archive header proves the OBJECT is absent for
        // this tileset version; memoise so the rest of the session answers without a network trip.
        if (archiveUrl && isArchiveMissingError(classified.message)) {
            missingArchives.set(archiveUrl, reason);
            console.warn(
                `[contextTiles] §CTX-KNOWN-MISSING ${layer}: archive header read 403/404 ` +
                `(${archiveUrl}) — memoised as missing for this session; later reads of this ` +
                'layer short-circuit to the same honest `unavailable` with no network round-trips.',
            );
        }
        // §CTX-READ-RETRY — a 5xx / network / decode failure on the HEADER is exactly the Amsterdam
        // shape (a read racing an R2 publish) and is worth another attempt; a 403/404 is not.
        return {
            status: 'unavailable',
            reason,
            transient: RETRYABLE_BAKED_READ_KINDS.has(classified.kind),
            kind: classified.kind,
        };
    }
    if (signal?.aborted) return { status: 'aborted' };

    // §CTX-ZOOM-FITS-EXTENT (L-662) — CHOOSE THE ZOOM FROM THE EXTENT, instead of reading every
    // layer at a fixed z16 and giving up when the fan-out is too wide.
    //
    // THE DEFECT, from the founder's 2026-08-07 console:
    //     §CTX-PMTILES-READER landuse: … bbox needs 1296 tiles at z16, over the 64 cap
    //     §CTX-PMTILES-READER water:   … bbox needs 2401 tiles at z16, over the 64 cap
    // — both then fell back to live Overpass, the third party this entire subsystem exists to
    // remove. The two widest layers were therefore NEVER served from the baked tiles at all.
    //
    // ⚠ THIS IS NOT A CONSEQUENCE OF THE ONBOARDING FRAME, AND IT IS WORTH BEING PRECISE ABOUT
    // THAT, because the obvious story ("a municipality-sized geocode bbox blew the cap") is wrong
    // and would have sent the fix to the wrong file. These extents are DELIBERATE and are declared
    // in `CesiumViewport`: `CONTEXT_WIDE_HALF_DEG = CONTEXT_BBOX_HALF_DEG * 9` (0.072°, ~8 km
    // radius — the city ground wash) and `CONTEXT_SEA_HALF_DEG = … * 12.5` (0.10°, ~11 km — the
    // sea). At z16 a tile is ~450 m, so those spans need ~1,008 and ~1,900 tiles NO MATTER WHAT the
    // user searched for. The cap was not being tripped by a bad bbox; it was being tripped by
    // asking for 450-metre precision over 16–22 km of ground.
    //
    // And that precision is not wanted. Nobody needs building-scale geometry to tint 8 km of
    // landuse or to draw a coastline. The bake carries z12–z16 (probed: `minZoom=12 maxZoom=16`),
    // so the honest read is the COARSEST tile that still covers the request: at z13 landuse needs
    // ~30 tiles and water ~48, both inside the cap, and both served from the baked tiles with no
    // Overpass call. `buildings` at its 0.011° extent still resolves to z16 — the near path is
    // byte-for-byte unchanged, which is the property that makes this safe.
    //
    // ⚠ THE CAP STILL BITES, AND MUST. If even the tileset's minimum zoom cannot cover the bbox
    // inside the cap, this still refuses rather than truncating — a partial ring that LOOKS
    // complete is the failure mode this whole subsystem exists to avoid.
    // §CTX-EXTENT-BUDGET (L-13058) — the cap is PER LAYER now. `buildings` carries a higher one so
    // the widened far extent still reads at z16; every other layer keeps the default, because for
    // them a bigger cap only buys a finer zoom they do not need. ⛔ Both the zoom search and the
    // refusal below MUST use the same number, or a layer picks a zoom it is then refused for.
    const fanOutCap = fanOutCapOverride ?? tileFanOutCap(layer);
    z = zoomForExtent(bbox, z, minZoom, fanOutCap);
    const tiles = tilesCovering(bbox, z);
    if (tiles.length === 0) return { status: 'ok', features: [], tilesRead: 0, tilesFailed: 0, ms: Date.now() - t0 };
    if (tiles.length > fanOutCap) {
        return {
            status: 'unavailable',
            reason: `bbox needs ${tiles.length} tiles even at the tileset's minimum z${z}, over the ${fanOutCap} cap`,
            // A cap refusal is arithmetic, not weather: the same bbox needs the same tiles next
            // time. Retrying it would burn the back-off and change nothing.
            transient: false,
            kind: 'unknown',
        };
    }

    // §CTX-READ-PROVENANCE — count what this read pays for, so the duration below can be read
    // correctly. See `TileReadProvenance`.
    const provenance: TileReadProvenance = { downloaded: 0, fromCache: 0, sharedInFlight: 0 };
    const perTile = await Promise.all(
        tiles.map(({ x, y }) => loadTile(archive, layer, z, x, y, signal, provenance)),
    );
    if (signal?.aborted) return { status: 'aborted' };
    if (provenance.downloaded === 0 && tiles.length > 0) {
        // ⭐ THE LINE THAT STOPS THE PHANTOM. A read that downloaded NOTHING must say so beside its
        // duration, or its `ms` is read as a price it did not pay — which is precisely how the
        // founder's three parks lines were escalated as "~9 s of duplicate decode" when they were
        // one 5.7 s download with two callers waiting on it.
        console.log(
            `[gis] §CTX-READ-PROVENANCE ${layer}: this read PAID FOR NOTHING — ${provenance.fromCache} ` +
            `tile(s) already decoded + ${provenance.sharedInFlight} already in the air, 0 downloaded ` +
            'of ' + tiles.length + ` covering tile(s). Its elapsed ms is WAITING on the read ahead of ` +
            'it, NOT duplicated work; the tile cache and the in-flight map already de-duplicated it.',
        );
    }

    const features: ContextTileFeature[] = [];
    const failures: TileReadFailure[] = [];
    let read = 0;
    // §FORMA-CTX-TREES — a POINT layer carries one-vertex features; every other layer needs a real
    // ring/strand (≥3 vertices). `ringIntersectsBbox` handles a single point (degenerate box).
    const minVerts = LAYER_IS_POINT[layer] ? 1 : 3;

    for (const tileFeatures of perTile) {
        if (isTileReadFailure(tileFeatures)) { failures.push(tileFeatures); continue; }
        read++;
        // §CTX-TILE-DECODE-CACHE — the bbox crop happens HERE, per read, never in the cache. Two
        // bboxes sharing a tile legitimately want different subsets of it.
        for (const f of tileFeatures) {
            const keep = f.rings.map((ring) => ring.length >= minVerts && ringIntersectsBbox(ring, bbox));
            if (!keep.some(Boolean)) continue;
            if (keep.every(Boolean)) { features.push(f); continue; }
            const rings = f.rings.filter((_, i) => keep[i]);
            // §SEA-BAKE-POLYGONS — the crop must keep `holes` index-aligned with the rings it keeps.
            const holes = f.holes ? f.holes.filter((_, i) => keep[i]) : undefined;
            features.push(holes ? { ...f, rings, holes } : { ...f, rings });
        }
    }

    // §CTX-TILE-READ-HONESTY (L-778) — the aggregate verdict is a pure, tested rule.
    const failed = failures.length;
    const verdict = tileReadVerdict(read, failed, features.length);
    if (verdict.status === 'unavailable') {
        // §CTX-READ-RETRY — say WHY, and hand the wrapper the retry decision. The founder's console
        // used to read `all 25 tile read(s) failed` with no cause at all.
        const summary = summariseTileFailures(failures);
        return {
            status: 'unavailable',
            reason: summary.message ? `${verdict.reason} — ${summary.kind}: ${summary.message}` : verdict.reason,
            transient: summary.transient,
            kind: summary.kind,
        };
    }
    return { status: 'ok', features, tilesRead: read, tilesFailed: failed, ms: Date.now() - t0 };
}

/**
 * §CTX-TILE-DECODE-CACHE — one tile's features, from cache if we already have them.
 *
 * Returns a `TileReadFailure` for a tile that could NOT be read or decoded, and `[]` for one that
 * genuinely holds nothing — the same distinction the module-level result type draws, at tile
 * granularity. A failure is never cached (see the cache note); a `[]` is.
 *
 * §CTX-READ-RETRY (L-12937) — the failure carries its CLASSIFIED kind rather than a bare `null`,
 * because the aggregate has to answer two different questions with it: what to tell the user
 * (the console said only "all 25 tile read(s) failed", never why) and whether a second baked read
 * could plausibly clear it — a 503 during an R2 publish can, a 404 cannot.
 */
async function loadTile(
    archive: PMTiles,
    layer: ContextTileLayer,
    z: number,
    x: number,
    y: number,
    signal?: AbortSignal,
    /** §CTX-READ-PROVENANCE — incremented in place so the caller can say what the read actually
     *  PAID FOR. Optional: callers that do not care pass nothing. */
    provenance?: TileReadProvenance,
): Promise<ContextTileFeature[] | TileReadFailure> {
    const key = tileCacheKey(layer, z, x, y);
    const cached = tileCache.get(key);
    if (cached) { if (provenance) provenance.fromCache++; return cached; }
    const pending = tileInFlight.get(key);
    // ⚠ The shared read deliberately takes NO abort signal — same reasoning as
    // §CTX-ONE-READ-PER-BBOX in contextBuildings.ts: one caller's cancellation must not empty a
    // download that other callers are awaiting. Callers still honour their own signal after the await.
    if (pending) { if (provenance) provenance.sharedInFlight++; return pending; }
    if (provenance) provenance.downloaded++;

    const shared = (async (): Promise<ContextTileFeature[] | TileReadFailure> => {
        let data: ArrayBuffer | null;
        try {
            const r = await archive.getZxy(z, x, y, signal);
            data = r?.data ?? null;
        } catch (e) {
            // §CTX-READ-RETRY — classify instead of swallowing: a transport failure and a decode
            // failure retry, a 403/404 does not, an abort never does.
            const c = classifyBakedReadError(e);
            return { failed: true, kind: c.kind, message: c.message };
        }
        if (!data) return []; // a genuinely empty tile — sea, park, outside the built area.
        let vtLayer;
        try {
            vtLayer = new VectorTile(new PbfReader(new Uint8Array(data))).layers[layer];
        } catch (e) {
            // Corrupt bytes are a FAILURE, not an empty tile — and a retryable one: a half-written
            // object (a read racing an R2 publish, Amsterdam 2026-09-05) decodes as garbage once
            // and cleanly a second later.
            return { failed: true, kind: 'decode', message: `tile decode failed: ${errorMessage(e)}` };
        }
        if (!vtLayer) return [];
        const out: ContextTileFeature[] = [];
        for (let i = 0; i < vtLayer.length; i++) {
            const f = vtLayer.feature(i);
            const tags = toTags(f.properties);
            if (!belongsToLayer(tags, layer)) continue;
            const geometry = f.toGeoJSON(x, y, z).geometry as { type: string; coordinates: unknown };
            // §SEA-BAKE-POLYGONS — a hole-keeping layer takes its parts WITH holes (index-aligned);
            // every other layer keeps the byte-for-byte unchanged `ringsFor` path.
            let rings: number[][][];
            let holes: number[][][][] | undefined;
            if (LAYER_KEEPS_HOLES[layer]) {
                const parts = polygonPartsFor(geometry);
                rings = parts.map((p) => p.outer);
                holes = parts.map((p) => p.holes);
            } else {
                rings = ringsFor(geometry, layer);
            }
            if (rings.length === 0) continue;
            out.push({
                rings,
                ...(holes ? { holes } : {}),
                tags,
                // Stable + unique per emitted piece. `i` is the tile-local feature index, so the
                // triple (x, y, i) identifies it; the mix keeps ids apart across tiles.
                syntheticId: ((x & 0xffff) * 0x1_0000_0000 + (y & 0xffff) * 0x1_0000 + (i & 0xffff)),
            });
        }
        return out;
    })().then((res) => {
        if (!isTileReadFailure(res)) rememberTile(key, res);
        return res;
    }).finally(() => { tileInFlight.delete(key); });

    tileInFlight.set(key, shared);
    return shared;
}

/**
 * Test seam — build the §CTX-RANGE-COALESCE transport in isolation, so the batching, the slicing
 * and the failed-span fallback can be pinned WITHOUT a synthetic PMTiles archive. Returning the
 * `Source` interface keeps the class itself private.
 */
export function __createRangeSourceForTest(url: string): Source {
    return new RangeUrlFetchSource(url);
}

/** Test/diagnostic helper — drop the cached archives (header + directory caches with them) AND the
 *  §CTX-TILE-DECODE-CACHE, so a test cannot be handed a previous test's decoded tiles. */
export function clearContextTileArchives(): void {
    archives.clear();
    missingArchives.clear(); // §CTX-KNOWN-MISSING — tests must never inherit a prior test's 404 memo.
    tileCache.clear();
    tileInFlight.clear();
}

/** §CTX-TILE-DECODE-CACHE — observable cache state, for tests and diagnostics. */
export function contextTileCacheSize(): number {
    return tileCache.size;
}
