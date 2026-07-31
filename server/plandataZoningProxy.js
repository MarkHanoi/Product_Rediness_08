/**
 * @file server/plandataZoningProxy.js
 * @description §PLANDATA-ZONING-PROXY (L-399a) — same-origin, KEYLESS server proxy
 *   + shared cache for Denmark's national plan register (Plandata.dk), so a plot
 *   drawn in Denmark resolves REAL structured zoning (bebyggelsesprocent / max
 *   height / storeys / permitted use) instead of the "Estimated" default pack.
 *
 * WHY THIS EXISTS (mirrors server/parcelZoningProxy.js in shape)
 * -------------------------------------------------------------
 * Denmark is the FIRST genuine-data jurisdiction of the compliance pilot (C58
 * §1.2 fidelity 1 — `structured`). Plandata.dk is the national plan register and
 * — unlike the Datafordeler cadastre (which needs an API-key) — its planning WFS
 * is genuinely OPEN / KEYLESS. The client turns a point into the applicable plan
 * (`lokalplan`, else the broader `kommuneplan-ramme`) and reads its published
 * numeric fields.
 *
 * Doing browser → gov WFS directly is blocked (CORS + CSP `connect-src 'self'`),
 * so — EXACTLY like the Catastro parcel proxy — every client hits OUR origin:
 *   - Same-origin `GET /api/plandata/zoning?lat=&lon=` (CSP already covers it).
 *   - The server forwards to Plandata GeoServer WFS ONCE, returns the winning
 *     plan feature's RAW attributes as JSON, and CACHES by rounded coordinate
 *     (zoning changes slowly → 24 h TTL, bounded LRU).
 *   - NEVER crashes: any miss / upstream failure answers HTTP 200 `{ zoning: null }`
 *     so the client's non-fatal path falls back to the estimated default pack.
 *
 * The pure Danish-field → C58 `ZoningRecord` MAPPING lives in the client L2
 * package (`@pryzm/site-parcel-data` → mapPlandataToZoningRecord) so it is
 * unit-tested deterministically; this proxy only does the keyless fetch + the
 * point → winning-feature selection.
 *
 * ENDPOINT / AXIS-ORDER (single source of truth = `buildPlandataWfsUrl`)
 * ---------------------------------------------------------------------
 * WFS 2.0 GetFeature, `outputFormat=application/json`, spatial `bbox` filter of a
 * tiny box around the point. GeoServer's EPSG:4326 bbox axis order is historically
 * ambiguous (lon/lat vs lat/lat), so we TRY BOTH orders: a wrong-order bbox lands
 * off-map → returns zero features → we retry the other order. Only the correct
 * order returns a plan. (We read only feature `properties`, which are axis-blind,
 * so output geometry axis order is irrelevant here.) LIVE-VERIFY the exact WFS
 * behaviour by drawing a Copenhagen plot — see the L-399a report.
 *
 * @see server/parcelZoningProxy.js — the template this clones (cache/forward/fallback)
 * @see packages/site-parcel-data/src/providers/DkZoningProvider.ts — the client consumer
 * @see docs/04-reference/DENMARK-GEOSPATIAL-REFERENCE-ARCHITECTURE.md §2.3
 */

/** The same-origin route the client's DkZoningProvider calls. */
export const PLANDATA_ZONING_PATH = '/api/plandata/zoning';

/** Plandata.dk national plan register — keyless GeoServer WFS. */
export const PLANDATA_WFS_ENDPOINT = 'https://geoserver.plandata.dk/geoserver/wfs';

/**
 * Plandata WFS 2.0 type names (verified live via GetCapabilities + DescribeFeatureType
 * 2026-07-22, byggefelt re-probed live 2026-07-23 — see
 * docs/04-reference/jurisdictions/dk/findings/). Ordered MOST-SPECIFIC first, because
 * a point is governed by the tightest instrument that publishes a number for it:
 *
 *   1. `byggefelt` — a lokalplan's BUILDING FIELD (byggefelt): the tightest instrument
 *      of all, a per-building-field footprint polygon that MAY also cap that field's
 *      height/storeys (`maxbygnhjd`/`maxetager`). Where a byggefelt publishes a
 *      dimension it is the most-specific real number for that spot, so it must be
 *      preferred (L-609 §4). It carries NO `bebygpct` (→ no FAR) and — crucially — its
 *      footprint→coverage is NOT computed here: coverage = area(footprint ∩ parcel) /
 *      area(parcel) needs the parcel geometry, which lives downstream (C57), plus an L0
 *      schema field for the footprint ring; that is the ADR-gated cross-layer step in
 *      dk/NEXT Blocker C. This proxy therefore treats byggefelt as a most-specific
 *      DIMENSION + IDENTITY source only, and its footprint bindingness (`bygkunifelt` /
 *      `bygvejledende`, see `isBindingFootprint`) is carried on the returned properties
 *      for that downstream step. National shape (57,031 features, 2026-07-23):
 *      23.9% are binding footprints, 31.7% publish a dimension.
 *   2. `lokalplandelomraade` — a local plan's SUB-AREA (delområde). A multi-area
 *      lokalplan states its real per-area height/FAR/storeys on the delområde, NOT
 *      on the whole-plan polygon; the plan-level fields are then null. Querying the
 *      delområde first is the single biggest resolution win (measured national
 *      dimensional fill: delområde 59.3% vs whole-plan lokalplan 38.2%). L-608 §2.
 *   3. `lokalplan` — the whole local plan (single-area plans carry their numbers here
 *      and have no delområde).
 *   4. `kommuneplanramme` — the municipal-plan FRAMEWORK. It governs where no local
 *      plan is silent-with-a-number, and it is the richest layer of all (dimensional
 *      fill 76.9%), so it must be reachable BENEATH a dimensionless local plan (see
 *      §USABLE-FALLBACK in fetchZoningAtPoint).
 */
export const PLANDATA_LAYERS = [
    { key: 'byggefelt', typeName: 'pdk:theme_pdk_byggefelt_vedtaget' },
    { key: 'lokalplandelomraade', typeName: 'pdk:theme_pdk_lokalplandelomraade_vedtaget' },
    { key: 'lokalplan', typeName: 'pdk:theme_pdk_lokalplan_vedtaget' },
    { key: 'kommuneplanramme', typeName: 'pdk:theme_pdk_kommuneplanramme_vedtaget_v' },
];

/**
 * §USABLE-FALLBACK (L-608) — does a raw WFS feature carry at least one dimensional
 * field the buildable-envelope engine can actually use (max building height, max
 * storeys, or bebyggelsesprocent)? Mirrors the mapper's own "usable" gate so the
 * proxy can PREFER a layer that has data over a more-specific layer that has none —
 * never fabricating a value, only choosing which real, cited plan supplies it.
 *
 * @param {Record<string, unknown>|null|undefined} props
 * @returns {boolean}
 */
export function hasUsableDimension(props) {
    if (!props || typeof props !== 'object') return false;
    for (const key of ['maxbygnhjd', 'maxetager', 'bebygpct']) {
        const v = props[key];
        if (v === null || v === undefined || v === '') continue;
        const n = typeof v === 'number' ? v : Number.parseFloat(String(v));
        if (Number.isFinite(n) && n > 0) return true;
    }
    return false;
}

/** Coerce a WFS boolean (real `true`/`false`, or the strings GeoServer sometimes
 *  emits) to a JS boolean; anything else → null (unknown, never assumed). */
function wfsBool(v) {
    if (v === true || v === false) return v;
    if (typeof v === 'string') {
        const s = v.trim().toLowerCase();
        if (s === 'true' || s === 't' || s === '1') return true;
        if (s === 'false' || s === 'f' || s === '0') return false;
    }
    return null;
}

/**
 * §BYGGEFELT-BINDINGNESS (L-609 §4.2) — is a byggefelt feature a BINDING footprint
 * cap (a hard maximum on where a building may sit), rather than an advisory /
 * illustrative placement guide?
 *
 * A byggefelt polygon is ONLY a coverage cap when the plan makes it one:
 *   - `bygkunifelt` (byggeri kun i felt) = building is allowed ONLY inside the field, and
 *   - NOT `bygvejledende` (vejledende) = the field is regulatory, not merely illustrative.
 * Nationally (57,031 features, 2026-07-23): 23.9% pass this gate; 65.1% are
 * `bygvejledende` guides that MUST NOT be read as caps.
 *
 * This is the gate a downstream footprint→coverage step consumes; the proxy carries the
 * raw `bygkunifelt`/`bygvejledende` on the properties so that step never re-fetches. A
 * value it cannot read stays UNKNOWN → treated as NOT binding (never assume a cap).
 *
 * @param {Record<string, unknown>|null|undefined} props
 * @returns {boolean}
 */
export function isBindingFootprint(props) {
    if (!props || typeof props !== 'object') return false;
    return wfsBool(props.bygkunifelt) === true && wfsBool(props.bygvejledende) !== true;
}

// ── Shared in-memory cache (keyed by rounded coordinate) ─────────────────────
/** Zoning changes slowly; a day-stale plan lookup is fine + eliminates repeat
 *  gov calls for the same plot across clients + demo reloads. */
export const ZONING_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
/** Bounded working set — evict the OLDEST insertion past the cap (LRU-ish). */
export const ZONING_CACHE_MAX_ENTRIES = 512;
/** Per-upstream timeout (ms). The server pays it at most a few times per plot (then cached). */
export const PLANDATA_UPSTREAM_TIMEOUT_MS = 15_000;
/** Half-width (degrees) of the point-query bbox (~15 m) — big enough the point
 *  reliably lands inside a plan polygon, small enough to hit one plan. */
export const PLANDATA_BBOX_HALF_DEG = 0.00015;

/** @typedef {{ layer: string, properties: Record<string, unknown> }} ZoningResult */
/** @typedef {{ value: ZoningResult|null, expires: number }} CacheEntry */
/** @type {Map<string, CacheEntry>} coordKey → winning plan (or null-miss). */
const _cache = new Map();
let _hits = 0;
let _misses = 0;

/** Round a lat/lon to a stable cache key (~11 m at 5 dp). */
function coordKey(lat, lon) {
    return `${lat.toFixed(5)},${lon.toFixed(5)}`;
}

/** Read a fresh (non-expired) cached result, or undefined. Prunes an expired hit. */
function cacheGet(key, now = Date.now()) {
    const entry = _cache.get(key);
    if (!entry) return undefined;
    if (entry.expires <= now) { _cache.delete(key); return undefined; }
    _cache.delete(key);
    _cache.set(key, entry); // touch → newest (LRU-ish recency)
    return entry.value;
}

/** Store a result (incl. a null-miss — negative caching avoids re-hammering). */
function cacheSet(key, value, now = Date.now()) {
    _cache.set(key, { value, expires: now + ZONING_CACHE_TTL_MS });
    while (_cache.size > ZONING_CACHE_MAX_ENTRIES) {
        const oldest = _cache.keys().next().value;
        if (oldest === undefined) break;
        _cache.delete(oldest);
    }
}

/** Test/diagnostic helper — clear the shared cache + hit/miss counters. */
export function __resetZoningCache() {
    _cache.clear();
    _hits = 0;
    _misses = 0;
}

/** Diagnostic snapshot of the cache (size + hit/miss counters). */
export function zoningCacheStats() {
    return { size: _cache.size, hits: _hits, misses: _misses };
}

// ── Endpoint construction (THE single source of truth) ───────────────────────

/**
 * Build a Plandata WFS 2.0 GetFeature URL for a tiny bbox around (lon,lat).
 * `axis` selects the bbox coordinate order to hedge GeoServer's EPSG:4326
 * ambiguity: `'lonlat'` → `minLon,minLat,maxLon,maxLat`; `'latlon'` → the swap.
 *
 * @param {string} typeName  WFS type name (e.g. `pdk:theme_pdk_lokalplan_vedtaget`)
 * @param {number} lon
 * @param {number} lat
 * @param {'lonlat'|'latlon'} axis
 * @returns {string}
 */
export function buildPlandataWfsUrl(typeName, lon, lat, axis) {
    const d = PLANDATA_BBOX_HALF_DEG;
    const minLon = lon - d, maxLon = lon + d, minLat = lat - d, maxLat = lat + d;
    const bbox = axis === 'latlon'
        ? `${minLat},${minLon},${maxLat},${maxLon},EPSG:4326`
        : `${minLon},${minLat},${maxLon},${maxLat},EPSG:4326`;
    const params = new URLSearchParams({
        service: 'WFS',
        version: '2.0.0',
        request: 'GetFeature',
        typeNames: typeName,
        outputFormat: 'application/json',
        srsName: 'EPSG:4326',
        count: '5',
        bbox,
    });
    return `${PLANDATA_WFS_ENDPOINT}?${params.toString()}`;
}

// ── GeoJSON parse (server-side; the winning feature's raw properties) ─────────

/**
 * Parse a Plandata WFS GeoJSON FeatureCollection and return the FIRST feature's
 * raw `properties` (the plan attributes), or null when there are none / malformed.
 * We only need attributes here (the parcel geometry comes from C57), so geometry
 * is ignored. Never throws.
 *
 * @param {string} text
 * @returns {Record<string, unknown>|null}
 */
export function pickFirstFeatureProps(text) {
    if (typeof text !== 'string' || text.length === 0) return null;
    let json;
    try { json = JSON.parse(text); } catch { return null; }
    const features = json && Array.isArray(json.features) ? json.features : null;
    if (!features || features.length === 0) return null;
    const first = features[0];
    const props = first && first.properties && typeof first.properties === 'object'
        ? first.properties
        : null;
    if (!props || Object.keys(props).length === 0) return null;
    return props;
}

// ── Upstream fetch (server-side, one retry, never-throw) ─────────────────────

/**
 * Fetch a URL once with a timeout + one retry; resolve to the response TEXT on a
 * 2xx non-empty body, else null. NEVER throws. `deps.fetchImpl` is injectable so
 * the route is unit-testable without the network.
 *
 * STRUCTURAL-SEAM-4 (C57 §1.5) — the optional `net` accumulator lets the caller tell an
 * UPSTREAM FAILURE (non-OK / timeout / network error — `net.failed` set true) apart from a
 * clean 2xx that simply carried no plan (a genuine empty — `net.failed` left false). Without
 * it, a failed fetch and an empty answer both return `null` and the proxy would surface an
 * outage as "no plan here" (the failure≠empty conflation). A `null` return with `net.failed`
 * still false is a clean empty (e.g. an empty body).
 *
 * @param {string} url
 * @param {{ fetchImpl?: typeof fetch, timeoutMs?: number }} [deps]
 * @param {{ failed: boolean }} [net]  mutable accumulator — set `failed=true` on upstream failure
 * @returns {Promise<string|null>}
 */
export async function fetchTextOnce(url, deps = {}, net) {
    const fetchImpl = deps.fetchImpl || fetch;
    const timeoutMs = deps.timeoutMs || PLANDATA_UPSTREAM_TIMEOUT_MS;
    for (let attempt = 0; attempt < 2; attempt++) {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), timeoutMs);
        try {
            const res = await fetchImpl(url, {
                method: 'GET',
                headers: {
                    Accept: 'application/json, */*',
                    'User-Agent': 'PRYZM-Plandata-Proxy/1.0 (+https://pryzm.fly.dev)',
                },
                signal: ctrl.signal,
            });
            if (res.status === 429 || res.status === 503 || res.status === 504) {
                console.warn(`[plandata-proxy] ${res.status} (attempt ${attempt + 1}) — ${attempt === 0 ? 'retrying' : 'giving up'}.`);
                continue;
            }
            if (!res.ok) {
                console.warn(`[plandata-proxy] HTTP ${res.status} for ${url}`);
                if (net) net.failed = true; // upstream failure, NOT an empty answer
                return null;
            }
            const text = await res.text();
            if (text && text.length > 0) return text;
            return null; // clean 2xx, empty body → a genuine empty, not a failure
        } catch (err) {
            console.warn(`[plandata-proxy] fetch failed (attempt ${attempt + 1}): ${err?.message ?? err}`);
            continue;
        } finally {
            clearTimeout(timer);
        }
    }
    if (net) net.failed = true; // exhausted retries (429/503/504/timeout/network) → upstream failure
    return null;
}

/**
 * Resolve the applicable plan at a WGS84 point, server-side + cached:
 *   for each layer (byggefelt → delområde → lokalplan → kommuneplanramme), for each
 *   bbox axis order (lonlat → latlon), fetch once.
 *
 * §USABLE-FALLBACK (L-608) — SELECTION RULE. Return the feature from the
 * MOST-SPECIFIC layer that actually carries a usable dimensional field
 * (`hasUsableDimension`). This is what stops a dimensionless local plan from
 * SHADOWING the richer kommuneplan framework beneath it (measured: a lokalplan
 * publishes a dimension on only 38.2% of plans, the ramme on 76.9%). If NO layer
 * carries a dimension, return the most-specific feature we found anyway (for its
 * identity + plan-document citation), so the mapper still yields a cited record or
 * falls to the estimated default. We NEVER fabricate a number — we only pick which
 * real, cited plan supplies the ones that exist.
 *
 * §BYGGEFELT (L-609) — the byggefelt building-field is queried most-specific. When it
 * publishes a dimension it wins (the tightest real number). But a byggefelt that is
 * neither dimensioned NOR a binding footprint (`isBindingFootprint`) is pure geometry
 * with no number this proxy+mapper path can yet express (footprint→coverage is the
 * ADR-gated downstream step, dk/NEXT Blocker C) — so it must NOT become the identity
 * `firstCandidate` that shadows a richer delområde/lokalplan below. A BINDING byggefelt
 * is kept as the fallback identity (it is the footprint the downstream step consumes).
 *
 * Returns `{ layer, properties }`, or null (no plan at the point / all upstreams
 * failed or empty). NEVER throws. `deps` is injectable for tests.
 *
 * STRUCTURAL-SEAM-4 (C57 §1.5) — the optional `net` accumulator is threaded into every
 * `fetchTextOnce` so the handler can distinguish "every layer answered cleanly with no plan"
 * (a genuine empty → 200 `{ zoning: null }`) from "the WFS did not answer" (`net.failed` → 502),
 * instead of collapsing both to the same `null`.
 *
 * @param {number} lon  EPSG:4326 longitude
 * @param {number} lat  EPSG:4326 latitude
 * @param {{ fetchImpl?: typeof fetch, timeoutMs?: number }} [deps]
 * @param {{ failed: boolean }} [net]  mutable accumulator — true if any upstream fetch failed
 * @returns {Promise<ZoningResult|null>}
 */
export async function fetchZoningAtPoint(lon, lat, deps = {}, net) {
    if (!Number.isFinite(lon) || !Number.isFinite(lat)) return null;
    /** @type {ZoningResult|null} The most-specific feature found, dimension or not. */
    let firstCandidate = null;
    for (const layer of PLANDATA_LAYERS) {
        for (const axis of /** @type {const} */ (['lonlat', 'latlon'])) {
            const url = buildPlandataWfsUrl(layer.typeName, lon, lat, axis);
            const text = await fetchTextOnce(url, deps, net);
            if (!text) continue;
            const props = pickFirstFeatureProps(text);
            if (!props) continue; // wrong axis order (off-map) → try the other
            const candidate = { layer: layer.key, properties: props };
            // A layer that publishes a real dimension wins immediately (most-specific first).
            if (hasUsableDimension(props)) return candidate;
            // §BYGGEFELT — a dimensionless, non-binding byggefelt is placement guidance,
            // not a number or a cap: skip it as the identity fallback so it never shadows
            // a richer lower layer (a BINDING byggefelt is kept — the downstream coverage
            // step reads its footprint).
            if (layer.key === 'byggefelt' && !isBindingFootprint(props)) break;
            // Otherwise remember the most-specific feature and fall through to the
            // next (broader) layer, which may carry the numbers this one omitted.
            if (!firstCandidate) firstCandidate = candidate;
            break; // this layer answered with a (dimensionless) feature — next layer
        }
    }
    return firstCandidate;
}

/** Set permissive same-origin cache headers on a zoning proxy response. */
function setProxyCacheHeaders(res) {
    // A day — zoning changes slowly; the shared server cache is the primary layer.
    res.setHeader('Cache-Control', 'public, max-age=86400, stale-while-revalidate=86400');
    res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
}

/**
 * Express handler for GET /api/plandata/zoning?lat=<>&lon=<>.
 *
 * Serves a cached-by-coordinate result instantly; otherwise resolves the winning
 * plan feature once, caches it (incl. a null-miss), and returns
 *   `{ zoning: { layer, properties } | null }`.
 *
 * NEVER crashes: bad/absent coords → 400; out-of-Denmark / no plan / upstream
 * failure → 200 `{ zoning: null }` (client falls back to the estimated pack).
 *
 * `deps` is injectable for tests (fetchImpl / timeoutMs).
 */
export function makePlandataZoningHandler(deps = {}) {
    return async function plandataZoningHandler(req, res) {
        const lat = Number.parseFloat(String(req.query?.lat ?? ''));
        const lon = Number.parseFloat(String(req.query?.lon ?? ''));
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
            return res.status(400).json({ error: 'lat and lon query params (EPSG:4326) are required.' });
        }
        // Guard the Danish national bbox loosely so a click elsewhere short-circuits
        // without a pointless gov round-trip (incl. Bornholm at ~lon 15.2).
        if (lon < 7.7 || lon > 15.3 || lat < 54.4 || lat > 57.9) {
            setProxyCacheHeaders(res);
            res.setHeader('X-Plandata-Cache', 'OUT-OF-BOUNDS');
            return res.status(200).json({ zoning: null });
        }

        const key = coordKey(lat, lon);
        const cached = cacheGet(key);
        if (cached !== undefined) {
            _hits++;
            setProxyCacheHeaders(res);
            res.setHeader('X-Plandata-Cache', 'HIT');
            return res.status(200).json({ zoning: cached });
        }
        _misses++;

        let zoning = null;
        // STRUCTURAL-SEAM-4 — track whether any upstream fetch FAILED (vs answered empty).
        const net = { failed: false };
        try {
            zoning = await fetchZoningAtPoint(lon, lat, deps, net);
        } catch (err) {
            console.warn('[plandata-proxy] unexpected error:', err?.message ?? err);
            zoning = null;
            net.failed = true;
        }

        // STRUCTURAL-SEAM-4 (C57 §1.5.3) — a same-origin proxy MUST NOT return `200 {…: null}` for an
        // upstream FAILURE. No plan resolved AND at least one upstream fetch failed → 502 (the client's
        // DkZoningProvider reads `!res.ok` as `unreachable` → the transient, retried refusal), never a
        // cached "no plan here". A clean empty (net.failed false) stays 200 `{ zoning: null }`.
        if (zoning === null && net.failed) {
            res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
            res.setHeader('X-Plandata-Cache', 'MISS-UNREACHABLE');
            return res.status(502).json({
                error:
                    'Plandata.dk did not answer. This is NOT a statement that the parcel has no ' +
                    'published plan.',
            });
        }

        cacheSet(key, zoning);
        setProxyCacheHeaders(res);
        res.setHeader('X-Plandata-Cache', zoning ? 'MISS-FETCH' : 'MISS-EMPTY');
        return res.status(200).json({ zoning });
    };
}

/** The default production handler (real `fetch`, real endpoint). */
export const plandataZoningHandler = makePlandataZoningHandler();

// ═════════════════════════════════════════════════════════════════════════════
// §BYGGEFELT-PROXY — GET /api/plandata/byggefelt (DK gap G3/G6 tier 1, stub S3)
// ═════════════════════════════════════════════════════════════════════════════
/**
 * WHY THIS ROUTE MUST EXIST — it is not a CORS convenience.
 *
 * `User-Agent` is a FORBIDDEN HEADER in browser `fetch`: the browser silently drops it. So a
 * browser calling geoserver.plandata.dk directly is an anonymous client hammering a public,
 * taxpayer-funded endpoint that Erhvervsstyrelsen cannot attribute or contact — and it would be
 * blocked by CORS + CSP `connect-src 'self'` anyway. Routing through our own origin is what makes
 * the identifying UA and the rate limit REAL, and enforces them ONCE for the whole product instead
 * of once per browser tab.
 *
 * ⚠ IT TAKES A BBOX, NEVER A URL AND NEVER A CQL FILTER. The upstream query is rebuilt here from
 * validated numbers. A proxy that forwarded a caller-supplied URL (or filter) would be an open
 * forwarder / SSRF gadget pointed at anything the server can reach.
 *
 * §FAILURE-IS-NOT-ABSENCE (C57 §1.5, L-422/457/467/469). Four outcomes, four responses:
 *   200 `{ features: [...] , numberMatched, numberReturned }`  — the register answered.
 *   200 `{ features: [] , numberMatched: 0 }`                  — a DURABLE "nothing here".
 *   502 `{ error }`                                            — upstream did not answer. NOT empty.
 *   400 `{ error }`                                            — the caller's bbox is unusable.
 * The client's `ByggefeltProducer` reads a non-OK status as `transient` and never caches it, so a
 * bad minute upstream can never become a TTL-long fake "no byggefelt here".
 *
 * Paging is the CLIENT's loop (`startIndex` in, `numberMatched` out) so the pagination policy stays
 * in one tested TypeScript place rather than being duplicated in JS here.
 */
export const PLANDATA_BYGGEFELT_PATH = '/api/plandata/byggefelt';

/** The adopted-byggefelt layer. Same constant the client's `DK_BYGGEFELT_LAYER` carries. */
export const BYGGEFELT_TYPE_NAME = 'theme_pdk_byggefelt_vedtaget';

/** Hard ceiling on `count`, so one request cannot ask the register for the whole country. */
export const BYGGEFELT_MAX_COUNT = 1000;

/**
 * Loose validity envelopes per CRS, used ONLY to reject a nonsense bbox before spending a
 * government round-trip on it. Deliberately generous — this is an abuse guard, not a geofence, and
 * rejecting a legitimate Danish parcel would be far worse than forwarding a slightly odd bbox.
 */
const BBOX_LIMITS = {
    'EPSG:25832': { minX: 100_000, maxX: 1_000_000, minY: 5_800_000, maxY: 6_600_000, maxSpan: 50_000 },
    'EPSG:4326': { minX: 7.0, maxX: 16.0, minY: 54.0, maxY: 58.5, maxSpan: 0.6 },
};

/**
 * Build the upstream byggefelt WFS URL from VALIDATED numbers.
 *
 * @param {{minX:number,minY:number,maxX:number,maxY:number}} bbox
 * @param {'EPSG:25832'|'EPSG:4326'} crs
 * @param {number} count
 * @param {number} startIndex
 * @param {boolean} bindingOnly
 * @returns {string}
 */
export function buildByggefeltWfsUrl(bbox, crs, count, startIndex, bindingOnly) {
    const filters = [`BBOX(geometri,${bbox.minX},${bbox.minY},${bbox.maxX},${bbox.maxY},'${crs}')`];
    // The binding predicate is a FIXED string chosen by a boolean, never interpolated from input.
    if (bindingOnly) filters.push('bygkunifelt=true AND bygvejledende=false');
    const params = new URLSearchParams({
        service: 'WFS',
        version: '2.0.0',
        request: 'GetFeature',
        typeNames: BYGGEFELT_TYPE_NAME,
        outputFormat: 'application/json',
        srsName: crs,
        count: String(count),
        startIndex: String(startIndex),
        CQL_FILTER: filters.join(' AND '),
    });
    return `${PLANDATA_WFS_ENDPOINT}?${params.toString()}`;
}

/**
 * Parse + VALIDATE the query into a request, or return `{ error }`.
 *
 * @param {Record<string, unknown>} query
 * @returns {{ ok: true, bbox: {minX:number,minY:number,maxX:number,maxY:number}, crs: 'EPSG:25832'|'EPSG:4326', count: number, startIndex: number, bindingOnly: boolean } | { ok: false, error: string }}
 */
export function parseByggefeltQuery(query) {
    const num = (k) => Number.parseFloat(String(query?.[k] ?? ''));
    const minX = num('minx');
    const minY = num('miny');
    const maxX = num('maxx');
    const maxY = num('maxy');
    if (![minX, minY, maxX, maxY].every(Number.isFinite)) {
        return { ok: false, error: 'minx, miny, maxx and maxy are required and must be finite numbers.' };
    }
    if (maxX <= minX || maxY <= minY) {
        return { ok: false, error: 'bbox must have a positive extent (maxx > minx and maxy > miny).' };
    }
    const rawCrs = String(query?.crs ?? 'EPSG:25832');
    const crs = rawCrs === 'EPSG:4326' ? 'EPSG:4326' : 'EPSG:25832';
    if (rawCrs !== crs && rawCrs !== 'EPSG:25832') {
        // ⚠ NEVER silently coerce an unrecognised CRS to a default: the caller's coordinates would
        // then be interpreted in a frame they were not written in, which is the plausible-but-wrong
        // failure this whole path is built to avoid.
        return { ok: false, error: `unsupported crs "${rawCrs}" — use EPSG:25832 or EPSG:4326.` };
    }
    const lim = BBOX_LIMITS[crs];
    if (minX < lim.minX || maxX > lim.maxX || minY < lim.minY || maxY > lim.maxY) {
        return { ok: false, error: `bbox is outside the Danish extent for ${crs}.` };
    }
    if (maxX - minX > lim.maxSpan || maxY - minY > lim.maxSpan) {
        return { ok: false, error: `bbox is too large for ${crs} (max span ${lim.maxSpan}).` };
    }
    const rawCount = Number.parseInt(String(query?.count ?? '500'), 10);
    const count = Number.isFinite(rawCount) && rawCount > 0 ? Math.min(rawCount, BYGGEFELT_MAX_COUNT) : 500;
    const rawStart = Number.parseInt(String(query?.startIndex ?? '0'), 10);
    const startIndex = Number.isFinite(rawStart) && rawStart >= 0 ? rawStart : 0;
    return {
        ok: true,
        bbox: { minX, minY, maxX, maxY },
        crs,
        count,
        startIndex,
        bindingOnly: String(query?.binding ?? '') === '1',
    };
}

/**
 * Express handler for GET /api/plandata/byggefelt.
 *
 * `deps` is injectable for tests (fetchImpl / timeoutMs). NEVER throws.
 */
export function makePlandataByggefeltHandler(deps = {}) {
    return async function plandataByggefeltHandler(req, res) {
        const parsed = parseByggefeltQuery(req.query ?? {});
        if (!parsed.ok) {
            res.setHeader('Cache-Control', 'no-store');
            return res.status(400).json({ error: parsed.error });
        }
        const url = buildByggefeltWfsUrl(
            parsed.bbox,
            parsed.crs,
            parsed.count,
            parsed.startIndex,
            parsed.bindingOnly,
        );

        const net = { failed: false };
        let text = null;
        try {
            text = await fetchTextOnce(url, deps, net);
        } catch (err) {
            console.warn('[plandata-byggefelt] unexpected error:', err?.message ?? err);
            net.failed = true;
        }

        // ⚠ UPSTREAM FAILURE → 502, NEVER 200 WITH AN EMPTY COLLECTION. An empty 200 here would be
        // read downstream as "the register published no byggefelt at this parcel" — a durable,
        // cacheable coverage fact manufactured out of one bad minute (STRUCTURAL-SEAM-4).
        if (net.failed) {
            res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
            return res.status(502).json({
                error:
                    'Plandata.dk did not answer. This is NOT a statement that there is no byggefelt ' +
                    'at this location.',
            });
        }
        if (text === null) {
            // A clean 2xx with an empty body. The register answered; there is nothing here.
            setProxyCacheHeaders(res);
            return res.status(200).json({ type: 'FeatureCollection', features: [], numberMatched: 0, numberReturned: 0 });
        }

        let json;
        try {
            json = JSON.parse(text);
        } catch {
            // ⚠ A 200 WITH AN UNPARSEABLE BODY IS A FAILURE, NOT AN EMPTY ANSWER. This is exactly the
            // truncated-payload trap the DAWA bulk endpoint springs (HTTP 200, exit 0, body cut off
            // mid-field). The status code is not the answer; the parse is.
            console.warn(`[plandata-byggefelt] 200 with an unparseable body (${text.length} bytes)`);
            res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
            return res.status(502).json({
                error: 'Plandata.dk returned a body that is not valid JSON (possibly truncated).',
            });
        }
        if (!json || !Array.isArray(json.features)) {
            res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
            return res.status(502).json({
                error: 'Plandata.dk returned a body with no `features` array — not a FeatureCollection.',
            });
        }

        setProxyCacheHeaders(res);
        res.setHeader('X-Plandata-Byggefelt-Count', String(json.features.length));
        return res.status(200).json({
            type: 'FeatureCollection',
            features: json.features,
            // Carried through UNCHANGED so the client's pagination loop can tell a complete read from
            // a partial one. Dropping these would make every answer look complete.
            numberMatched: typeof json.numberMatched === 'number' ? json.numberMatched : json.features.length,
            numberReturned: typeof json.numberReturned === 'number' ? json.numberReturned : json.features.length,
        });
    };
}

/** The default production byggefelt handler (real `fetch`, real endpoint). */
export const plandataByggefeltHandler = makePlandataByggefeltHandler();
