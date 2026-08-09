// §BALEARS-MUIB-PROXY (L-680) — the Illes Balears zone + *fitxa* point lookup.
//
// ─────────────────────────────────────────────────────────────────────────────
// WHY THIS EXISTS — and it was MEASURED, not assumed (`tools/balears-muib-probe/r1-reachability.mjs`)
// ─────────────────────────────────────────────────────────────────────────────
// "Add a proxy" is the reflex; the probe was run first because a proxy nobody needs is dead weight
// and one more thing to keep alive. Both hosts fail the browser test, for DIFFERENT reasons, and
// only one of them is CORS:
//
//   • `ideib.caib.es` (the ArcGIS zoning layer) DOES send `Access-Control-Allow-Origin` — measured
//     live 2026-08-02, it echoed our Origin back. ⚠ AND IT IS STILL UNREACHABLE FROM THE BROWSER,
//     because PRYZM's OWN CSP `connect-src` is a configured ALLOWLIST (C51 §3.1.2.2,
//     `buildConnectSrc` in `server/securityHeaders.js`) and this host is not in it. CORS is the
//     remote server's policy; CSP is ours. Passing one says nothing about the other.
//   • `muib.caib.es` (the *fitxa* page) sends NO `Access-Control-Allow-Origin` at all, AND the URL
//     the publisher itself emits on every zoning feature is plain `http://` — MIXED CONTENT on an
//     HTTPS page, blocked before CORS is even consulted.
//
// ⇒ A same-origin seam is genuinely required. It is also the right shape for a second reason: the
// two upstreams are ONE question ("what governs this point, and what does its fitxa say?"), and
// resolving the fitxa here means the client never chooses which URL to trust — it reads the `URL`
// the zoning feature itself published, so a feature and its fitxa cannot disagree.
//
// ⚠ AND THE FITXA IS FETCHED OVER `https://` EVEN THOUGH THE PUBLISHER PRINTS `http://`. The
// upgrade is done HERE, in one place, and the host is checked against an allowlist first — a proxy
// that forwards whatever URL an upstream body contains is an SSRF, not a proxy.
//
// HONESTY — a FAILURE and an EMPTY answer must never collapse (§CONTEXT-DATA-HONESTY,
// L-422/457/467/469), and on this backend the trap is unusually sharp: ArcGIS answers a CLEAN HTTP
// 200 with an empty `features` array both when the point genuinely carries no polygon and when the
// query was malformed (the measured `CODIMUNI='07040'` → 0 features case). So:
//   • `qualificacions: null` ⇒ the zoning layer did NOT answer (transport, non-200, non-JSON, or an
//     Esri error object riding a 200). `[]` ⇒ it answered and covers nothing here.
//   • `fitxa: null` ⇒ not fetched or not fetchable. The client reports those as DIFFERENT refusals
//     (`endpoint-unreachable` vs `no-zoning-here` vs `fitxa-unreachable`) and never as one.
// Zoning layer down → 502, so the client says "the service did not answer" rather than the false
// negative "there is no plan here".
//
// ⛔ THIS ROUTE PUBLISHES NO BUILDABLE NUMBER AND AUTHORISES NOTHING. It returns what the Govern
// publishes. Whether PRYZM may state any of it as a determination is `envelopeAuthorisation.ts`'s
// question alone, and `BALEARS_ENVELOPE_VERIFIED` is `false`.
//
// @see server/murciaPgouProxy.js — the template this mirrors
// @see packages/site-parcel-data/src/providers/resolveBalearsMuib.ts — the client consumer
// @see tools/balears-muib-probe/r1-reachability.mjs — the measurement behind "a proxy IS required"

/** The same-origin route the client's `resolveBalearsMuib` calls. Mirrors `BALEARS_MUIB_PATH`. */
export const BALEARS_MUIB_PATH = '/api/es/balears-muib';

/** GOIB MUIB — the public, keyless ArcGIS REST MapServer. */
export const BALEARS_MUIB_SERVICE =
    'https://ideib.caib.es/geoserveis/rest/services/public/GOIB_MUIB/MapServer';

/** Layer id of `QUALIFICACIONS` (verified against the service's own layer tree). */
export const BALEARS_QUALIFICACIONS_LAYER = 10;

/**
 * ⛔ THE ONLY HOST A FITXA MAY BE FETCHED FROM. The fitxa URL arrives inside an UPSTREAM RESPONSE
 * BODY, which makes it attacker-influenced data by definition, and a proxy that fetches whatever a
 * body tells it to is a Server-Side Request Forgery. Measured: 100 % of the 5,273 distinct `URL`
 * values on this layer are on this host.
 */
export const BALEARS_FITXA_HOST = 'muib.caib.es';

/** Loose Illes Balears bbox — mirrors `balearsBbox.ts` (a coarse gate, never an authorisation). */
export const BALEARS_BBOX = { minLat: 38.63, maxLat: 40.1, minLon: 1.12, maxLon: 4.34 };

export const BALEARS_UPSTREAM_TIMEOUT_MS = 20_000;
/** Planning geometry changes on the order of years; a long TTL is honest + polite (C57 §7.2). */
export const BALEARS_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const BALEARS_CACHE_MAX_ENTRIES = 512;

// ── cache (keyed by rounded coordinate) ───────────────────────────────────────
const _cache = new Map();
let _hits = 0;
let _misses = 0;

export function __resetBalearsCache() { _cache.clear(); _hits = 0; _misses = 0; }
export function balearsCacheStats() { return { size: _cache.size, hits: _hits, misses: _misses }; }

function cacheGet(key) {
    const e = _cache.get(key);
    if (!e) return undefined;
    if (Date.now() > e.expiresAt) { _cache.delete(key); return undefined; }
    return e.value;
}

function cacheSet(key, value, ttlMs = BALEARS_CACHE_TTL_MS) {
    if (_cache.size >= BALEARS_CACHE_MAX_ENTRIES) {
        const oldest = _cache.keys().next().value;
        if (oldest !== undefined) _cache.delete(oldest);
    }
    _cache.set(key, { value, expiresAt: Date.now() + ttlMs });
}

// ── upstream URLs (single source of truth) ────────────────────────────────────

/**
 * Build the `QUALIFICACIONS` point-intersect query URL for a WGS84 point.
 *
 * ⚠ `inSR=4326` + an explicit `spatialReference` on the geometry. The layer is native EPSG:25831;
 * omitting the input SR makes ArcGIS read the coordinates in the layer's own CRS, which lands the
 * point in the Atlantic and returns a CLEAN 200 WITH ZERO FEATURES — the empty-vs-failure collapse,
 * arriving through the query string. Fix it HERE, one place, never in the client.
 *
 * `returnGeometry=false`: the client needs the ATTRIBUTES (zone code, plan, class, fitxa URL). The
 * parcel ring comes from Catastro, which is the authority for a boundary; a zone polygon is not.
 *
 * @param {number} lat
 * @param {number} lon
 * @returns {string}
 */
export function buildBalearsQualificacionsUrl(lat, lon) {
    const qs = new URLSearchParams({
        f: 'json',
        geometry: JSON.stringify({ x: lon, y: lat, spatialReference: { wkid: 4326 } }),
        geometryType: 'esriGeometryPoint',
        inSR: '4326',
        outSR: '4326',
        spatialRel: 'esriSpatialRelIntersects',
        outFields: '*',
        returnGeometry: 'false',
        where: '1=1',
    });
    return `${BALEARS_MUIB_SERVICE}/${BALEARS_QUALIFICACIONS_LAYER}/query?${qs.toString()}`;
}

/**
 * ⛔ THE SSRF GUARD. Normalise a fitxa URL taken from an upstream body, or return `null`.
 *
 * Accepts ONLY `http`/`https` on `BALEARS_FITXA_HOST` (exact host match — `muib.caib.es.evil.com`
 * fails, as does a userinfo trick like `https://muib.caib.es@evil.com/`, because `URL.hostname`
 * parses the real host). An accepted `http://` URL is UPGRADED to `https://`, which is also what
 * makes the answer usable on an HTTPS page.
 *
 * @param {unknown} raw
 * @returns {string|null}
 */
export function normaliseBalearsFitxaUrl(raw) {
    if (typeof raw !== 'string' || raw.trim() === '') return null;
    let u;
    try { u = new URL(raw.trim()); } catch { return null; }
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    if (u.hostname.toLowerCase() !== BALEARS_FITXA_HOST) return null;
    u.protocol = 'https:';
    return u.toString();
}

/**
 * Fetch an ArcGIS query URL → the `features` array, or `null` on ANY failure. NEVER throws.
 *
 * ⚠⚠ HTTP 200 IS NOT SUCCESS ON ARCGIS: an Esri `{ error: {...} }` object rides a 200 body. Treating
 * that as "answered" would turn a malformed query into the sentence "there is no plan here".
 *
 * ⚠ `null` and `[]` are DIFFERENT ANSWERS and the caller must keep them apart.
 *
 * @param {string} url
 * @param {{ fetchImpl?: typeof fetch, timeoutMs?: number }} [deps]
 * @returns {Promise<Array<unknown>|null>}
 */
export async function fetchBalearsArcgis(url, deps = {}) {
    const fetchImpl = deps.fetchImpl || fetch;
    const timeoutMs = deps.timeoutMs || BALEARS_UPSTREAM_TIMEOUT_MS;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
        const res = await fetchImpl(url, {
            headers: {
                Accept: 'application/json',
                'User-Agent': 'PRYZM-Balears-MUIB-Proxy/1.0 (+https://pryzm.fly.dev)',
            },
            signal: ctrl.signal,
        });
        if (!res.ok) {
            console.warn(`[balears-proxy] MUIB HTTP ${res.status} — upstream miss.`);
            return null;
        }
        const text = await res.text();
        let json;
        try { json = JSON.parse(text); } catch {
            console.warn('[balears-proxy] MUIB returned non-JSON — upstream miss.');
            return null;
        }
        if (json && json.error) {
            console.warn(
                `[balears-proxy] MUIB Esri error ${json.error.code ?? '?'} on a 200 — upstream miss.`,
            );
            return null;
        }
        return Array.isArray(json?.features) ? json.features : null;
    } catch (err) {
        console.warn('[balears-proxy] MUIB fetch failed:', err?.message ?? err);
        return null;
    } finally {
        clearTimeout(timer);
    }
}

/**
 * Fetch one *fitxa* page as HTML. `null` on any failure. NEVER throws.
 *
 * @param {string} url  ALREADY normalised by `normaliseBalearsFitxaUrl`.
 * @param {{ fetchImpl?: typeof fetch, timeoutMs?: number }} [deps]
 * @returns {Promise<string|null>}
 */
export async function fetchBalearsFitxa(url, deps = {}) {
    const fetchImpl = deps.fetchImpl || fetch;
    const timeoutMs = deps.timeoutMs || BALEARS_UPSTREAM_TIMEOUT_MS;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
        const res = await fetchImpl(url, {
            headers: {
                Accept: 'text/html,application/xhtml+xml',
                'User-Agent': 'PRYZM-Balears-MUIB-Proxy/1.0 (+https://pryzm.fly.dev)',
            },
            signal: ctrl.signal,
        });
        if (!res.ok) {
            console.warn(`[balears-proxy] fitxa HTTP ${res.status} — upstream miss.`);
            return null;
        }
        const html = await res.text();
        // An EMPTY body is a failure, not an empty answer: the parser would see no code cells and
        // the client would report "this zone publishes little" about a page that never loaded.
        return typeof html === 'string' && html.length > 0 ? html : null;
    } catch (err) {
        console.warn('[balears-proxy] fitxa fetch failed:', err?.message ?? err);
        return null;
    } finally {
        clearTimeout(timer);
    }
}

/**
 * Resolve the zoning features at a point AND, when one of them names a fitxa, that fitxa's HTML.
 *
 * ⚠ THE FITXA URL IS TAKEN FROM THE FEATURE, NEVER FROM THE REQUEST. A client-supplied fitxa id
 * would let the caller pair any zone with any fitxa — the `fitxa-identity-mismatch` the resolver
 * exists to catch, manufactured by our own API surface.
 *
 * ⚠ ONLY THE FIRST feature's URL is followed. When two DIFFERENT zones cover a point the resolver
 * refuses (`ambiguous-zone`) before it ever looks at a fitxa, so fetching more would be work whose
 * result is discarded — and picking one of them here would be the coin flip that refusal prevents.
 *
 * @param {number} lat
 * @param {number} lon
 * @param {{ fetchImpl?: typeof fetch, timeoutMs?: number }} [deps]
 */
export async function fetchBalearsMuibAtPoint(lat, lon, deps = {}) {
    const qualificacions = await fetchBalearsArcgis(buildBalearsQualificacionsUrl(lat, lon), deps);
    if (qualificacions === null) return { qualificacions: null, fitxa: null };
    if (qualificacions.length === 0) return { qualificacions: [], fitxa: null };

    const attrs = qualificacions[0]?.attributes ?? qualificacions[0] ?? {};
    const fitxaUrl = normaliseBalearsFitxaUrl(attrs?.URL);
    if (fitxaUrl === null) return { qualificacions, fitxa: null };

    const html = await fetchBalearsFitxa(fitxaUrl, deps);
    return {
        qualificacions,
        // `null` ⇒ the fitxa did not load (the client says so, and offers a retry). A body that
        // loaded is returned VERBATIM: parsing is the client's pure, tested job, not the proxy's.
        fitxa: html === null ? null : {
            identitat: attrs?.IDENTITAT ?? null,
            url: fitxaUrl,
            html,
        },
    };
}

// ── handler ───────────────────────────────────────────────────────────────────

/**
 * `GET /api/es/balears-muib?lat=&lon=` →
 *   200 `{ qualificacions: Feature[]|null, fitxa: { identitat, url, html }|null }`
 *   502 `{ error }` when the ZONING layer did not answer (a failure, never a false "nothing here")
 *   400 on missing/bad coordinates
 *
 * A point outside the loose Balears bbox short-circuits to 200 with `qualificacions: []` — an honest
 * empty, not a failure, and no pointless round trip to the Govern's service.
 */
export function makeBalearsMuibHandler(deps = {}) {
    return async function balearsMuibHandler(req, res) {
        const lat = Number(req.query?.lat);
        const lon = Number(req.query?.lon);
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
            return res.status(400).json({ error: 'lat and lon query parameters (EPSG:4326) are required.' });
        }
        if (
            lat < BALEARS_BBOX.minLat || lat > BALEARS_BBOX.maxLat ||
            lon < BALEARS_BBOX.minLon || lon > BALEARS_BBOX.maxLon
        ) {
            res.setHeader('X-Balears-Cache', 'OUT-OF-BOUNDS');
            return res.status(200).json({ qualificacions: [], fitxa: null });
        }

        const key = `muib:${lat.toFixed(5)},${lon.toFixed(5)}`;
        const cached = cacheGet(key);
        if (cached !== undefined) {
            _hits++;
            res.setHeader('Cache-Control', 'public, max-age=86400');
            res.setHeader('X-Balears-Cache', 'HIT');
            return res.status(200).json(cached);
        }
        _misses++;

        let payload;
        try {
            payload = await fetchBalearsMuibAtPoint(lat, lon, deps);
        } catch (err) {
            console.warn('[balears-proxy] unexpected error:', err?.message ?? err);
            payload = { qualificacions: null, fitxa: null };
        }

        if (payload.qualificacions === null) {
            res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
            res.setHeader('X-Balears-Cache', 'MISS-UNREACHABLE');
            return res.status(502).json({
                error:
                    'The Illes Balears MUIB service did not answer. This is NOT a statement that the ' +
                    'parcel carries no planning record.',
            });
        }

        // ⚠ Cache only a COMPLETE answer. A zoning hit whose fitxa failed is a HALF-answer; pinning
        // it for a week would turn one transient fitxa outage into a lasting "this zone publishes
        // nothing" for every later visitor to the same parcel.
        const fitxaExpected = normaliseBalearsFitxaUrl(
            (payload.qualificacions[0]?.attributes ?? payload.qualificacions[0] ?? {})?.URL,
        ) !== null;
        if (payload.qualificacions.length === 0 || !fitxaExpected || payload.fitxa !== null) {
            cacheSet(key, payload);
        }
        res.setHeader('Cache-Control', 'public, max-age=86400');
        res.setHeader('X-Balears-Cache', 'MISS');
        return res.status(200).json(payload);
    };
}

export const balearsMuibHandler = makeBalearsMuibHandler();
