// §ZURICH-BZO-PROXY (CH / canton ZH, BFS-Nr 261) — the City-of-Zürich BZO zone point lookup.
//
// ─────────────────────────────────────────────────────────────────────────────
// WHY THIS EXISTS — it is THE missing link, not a nice-to-have.
// ─────────────────────────────────────────────────────────────────────────────
// `packages/site-parcel-data/src/providers/zurichBzoProvider.ts` has shipped a complete client
// resolver (`resolveZurichBzoZone`) that calls `/api/ch/zurich-bzo`, and the L5 dispatcher
// (`applyChZoningThenFallback` → the `isInZurichCity` branch) has shipped the §L-616 COMPUTED BZO
// envelope behind the owner-signed `CH_FAR_CERTIFIED` gate. **That route did not exist**, so in
// production every Zürich parcel resolved `endpoint-unreachable` and fell through to the generic
// NATIONAL Grundnutzung refusal. The provider's own header says exactly this ("while absent this
// resolves unreachable"). This file closes it: with the route wired, a Zürich click resolves the
// municipal `typ` code + the per-parcel BZO 700.100 ordinance link, and the dispatcher computes the
// AZ-capped envelope from the owner-signed transcription — no client change required.
//
// THE LAYER (ZURICH-BZO-PROBE §2, live-verified 2026-07-25):
//   • `bzo_zone_v` on the City of Zürich open WFS. Carries `typ` (the municipal zone code, e.g.
//     `W2bIII`), `rechtsstatus`, `rechtsvorschrift_url` (a DIRECT link to THIS parcel's governing
//     BZO 700.100 ordinance), `plan_url`, `mutationsnummer`, `objectid`.
//   • ⚠ It carries NO numeric field — no `ausnuetzungsziffer`, no `vollgeschosse`, no
//     `gebaeudehoehe` (verified against `DescribeFeatureType`, for `bzo_zone_erhoehte_az_v` too).
//     So this proxy returns IDENTITY ONLY. It is structurally incapable of returning a buildable
//     number, and it must never be made to synthesise one: the AZ/height come from the owner-signed
//     BZO 700.100 transcription in `chZurichBzoCatalogue.ts`, under its own citation.
//
// HONESTY — a FAILURE and an EMPTY answer must never collapse (§CONTEXT-DATA-HONESTY, L-422/457/
// 467/469). Concretely:
//   • every axis variant errored (HTTP non-OK / timeout / OGC ExceptionReport) → **502**, so the
//     client returns `endpoint-unreachable` and the card says "the source did not answer";
//   • at least one variant answered with a well-formed but EMPTY collection → **200 `{ gml }`**
//     carrying that empty body, so the client's `numberReturned=0` branch returns `no-zone-here` —
//     a durable statement about the plan, not about our network;
//   • only a DURABLE answer is cached. A 502 is never cached, so a transient city outage cannot be
//     pinned for a week as "no BZO zone at this parcel".
//
// ⚠ CRS/AXIS — the reason this hedges three bbox forms. `bzo_zone_v` is native EPSG:2056 (LV95 /
// CH1903+), a PROJECTED CRS. A bare `EPSG:4326` bbox against a native-projected layer is the
// documented silent-empty gotcha this repo has now hit twice (Córdoba, then Murcia — see
// `server/murciaPgouProxy.js`). Rather than guess which form this QGIS Server honours, the request
// is issued in up to THREE forms and the FIRST that carries a feature wins:
//   1. `EPSG:4326` lon/lat  — the historically common WFS 1.1/2.0 client order;
//   2. `urn:ogc:def:crs:EPSG::4326` lat/lon — the AUTHORITY axis order (the Murcia fix);
//   3. `EPSG:2056` — the layer's NATIVE frame, computed with the official swisstopo approximate
//      WGS84→LV95 formulas. This is the belt-and-braces variant: it cannot be defeated by an
//      axis-order disagreement at all, because there is no lat/lon ambiguity in a projected bbox.
// A wrong-order bbox lands off-map ⇒ `numberReturned=0` ⇒ the next form is tried. The never-crash
// posture means a wholly wrong query degrades to a cited refusal, never to a fault and never to a
// fabricated zone.
//
// @see server/chGrundnutzungProxy.js — the national CH sibling (GML passthrough, axis hedging)
// @see server/murciaPgouProxy.js — the null-vs-empty + durable-cache discipline this mirrors
// @see packages/site-parcel-data/src/providers/zurichBzoProvider.ts — the client consumer
// @see docs/04-reference/jurisdictions/ch/regions/zurich/ZURICH-BZO-PROBE.md §2–§3

/** The same-origin route the client's `resolveZurichBzoZone` calls (`CH_ZURICH_BZO_PATH`). */
export const CH_ZURICH_BZO_PATH = '/api/ch/zurich-bzo';

/** The City of Zürich open WFS (keyless, public — ZURICH-BZO-PROBE §2). */
export const CH_ZURICH_BZO_ENDPOINT =
    'https://www.ogd.stadt-zuerich.ch/wfs/geoportal/Nutzungsplanung___kommunale_Bau__und_Zonenordnung__BZO_';

/** The zone-polygon layer. IDENTITY only — it publishes no numeric buildable field. */
export const CH_ZURICH_BZO_TYPENAME = 'bzo_zone_v';

// ── Config ───────────────────────────────────────────────────────────────────
/** Half-width (degrees) of the point-query bbox (~15 m) — inside a zone polygon, tiny candidate set. */
export const CH_ZURICH_BBOX_HALF_DEG = 0.00015;
/** Half-width (metres) of the NATIVE-frame (EPSG:2056) variant of the same box. */
export const CH_ZURICH_BBOX_HALF_M = 15;
export const CH_ZURICH_UPSTREAM_TIMEOUT_MS = 15_000;
/** Zoning changes on the order of years; a long TTL is honest + polite to a free municipal service. */
export const CH_ZURICH_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const CH_ZURICH_CACHE_MAX_ENTRIES = 512;

/** Loose City-of-Zürich bbox — mirrors `providers/zurichBbox.ts` (a coarse gate, never an authorisation). */
export const CH_ZURICH_BBOX = { minLat: 47.31, maxLat: 47.44, minLon: 8.44, maxLon: 8.63 };

// ── cache (keyed by rounded coordinate) ──────────────────────────────────────
const _cache = new Map();
let _hits = 0;
let _misses = 0;

/** Test/diagnostic helper — clear the shared cache + hit/miss counters. */
export function __resetZurichBzoCache() { _cache.clear(); _hits = 0; _misses = 0; }
/** Diagnostic snapshot of the cache. */
export function zurichBzoCacheStats() { return { size: _cache.size, hits: _hits, misses: _misses }; }

function cacheGet(key) {
    const e = _cache.get(key);
    if (!e) return undefined;
    if (Date.now() > e.expiresAt) { _cache.delete(key); return undefined; }
    return e.value;
}

function cacheSet(key, value, ttlMs = CH_ZURICH_CACHE_TTL_MS) {
    if (_cache.size >= CH_ZURICH_CACHE_MAX_ENTRIES) {
        const oldest = _cache.keys().next().value;
        if (oldest !== undefined) _cache.delete(oldest);
    }
    _cache.set(key, { value, expiresAt: Date.now() + ttlMs });
}

// ── WGS84 → LV95 (EPSG:2056), the official swisstopo APPROXIMATE formulas ────

/**
 * Convert a WGS84 point to LV95 (EPSG:2056) easting/northing using the swisstopo "Näherungslösungen"
 * (approximate formulas, doc `ch1903wgs84_e.pdf` / "Formeln und Konstanten für die Berechnung der
 * Schweizerischen schiefachsigen Zylinderprojektion"). Accurate to ≈ 1 m across Switzerland.
 *
 * ⚠ THE ACCURACY IS DELIBERATELY SUFFICIENT AND NO MORE. It is used ONLY to place a ~30 m query box
 * around a point that is already inside the City of Zürich, so a metre of error cannot change which
 * zone polygon is hit in any case where the answer is not already ambiguous — and an ambiguous hit
 * is REFUSED by the client (`ambiguous-zone`), never guessed. No coordinate produced here is ever
 * returned to the client or rendered.
 *
 * @param {number} lat  WGS84 latitude (degrees)
 * @param {number} lon  WGS84 longitude (degrees)
 * @returns {{ e: number, n: number }} LV95 easting/northing in metres
 */
export function wgs84ToLv95(lat, lon) {
    // Auxiliary values (in units of 10 000″ from the Bern fundamental point).
    const phi = (lat * 3600 - 169_028.66) / 10_000;
    const lam = (lon * 3600 - 26_782.5) / 10_000;
    const phi2 = phi * phi;
    const lam2 = lam * lam;
    // LV03 easting/northing, then the constant LV03→LV95 shift (+2 000 000 / +1 000 000).
    const y =
        600_072.37 +
        211_455.93 * lam -
        10_938.51 * lam * phi -
        0.36 * lam * phi2 -
        44.54 * lam2 * lam;
    const x =
        200_147.07 +
        308_807.95 * phi +
        3_745.25 * lam2 +
        76.63 * phi2 -
        194.56 * lam2 * phi +
        119.79 * phi2 * phi;
    return { e: y + 2_000_000, n: x + 1_000_000 };
}

// ── upstream URL (THE single source of truth) ────────────────────────────────

/**
 * Build a `GetFeature` URL for `bzo_zone_v` at a WGS84 point, in one of three bbox forms. See the
 * CRS/AXIS note in the header for why all three exist and in what order they are tried.
 *
 * @param {number} lat
 * @param {number} lon
 * @param {'wgs84-lonlat'|'wgs84-urn-latlon'|'lv95'} axis
 * @returns {string}
 */
export function buildZurichBzoUrl(lat, lon, axis) {
    const r = (v) => Number(v.toFixed(7));
    let bbox;
    let srsName;
    if (axis === 'lv95') {
        const c = wgs84ToLv95(lat, lon);
        const h = CH_ZURICH_BBOX_HALF_M;
        bbox =
            `${Math.round(c.e - h)},${Math.round(c.n - h)},` +
            `${Math.round(c.e + h)},${Math.round(c.n + h)},EPSG:2056`;
        srsName = 'EPSG:2056';
    } else {
        const d = CH_ZURICH_BBOX_HALF_DEG;
        const minLon = r(lon - d), maxLon = r(lon + d);
        const minLat = r(lat - d), maxLat = r(lat + d);
        bbox =
            axis === 'wgs84-urn-latlon'
                // AUTHORITY (lat/lon) axis order — the documented native-projected-layer gotcha.
                ? `${minLat},${minLon},${maxLat},${maxLon},urn:ogc:def:crs:EPSG::4326`
                : `${minLon},${minLat},${maxLon},${maxLat},EPSG:4326`;
        srsName = 'EPSG:4326';
    }
    const qs = new URLSearchParams({
        service: 'WFS',
        version: '2.0.0',
        request: 'GetFeature',
        typeNames: CH_ZURICH_BZO_TYPENAME,
        srsName,
        count: '5',
        bbox,
    });
    return `${CH_ZURICH_BZO_ENDPOINT}?${qs.toString()}`;
}

// ── GML classification (server-side; the client stays the sole FIELD parser) ──

/**
 * Classify a WFS response body. Used ONLY to choose the winning axis form and to keep a FAILURE
 * apart from an EMPTY answer; the field-level parse is the client's job (`parseZurichBzoGml`), so
 * this proxy can never become a second, drifting parser.
 *
 * @param {string|null} text
 * @returns {'feature'|'empty'|'failure'}
 */
export function classifyZurichBzoGml(text) {
    if (typeof text !== 'string' || text.length === 0) return 'failure';
    // A service exception is a FAILURE — never an "empty here" (the crux of §CONTEXT-DATA-HONESTY).
    if (/ServiceException|ExceptionReport/i.test(text)) return 'failure';
    if (/<(?:[A-Za-z0-9_]+:)?bzo_zone_v\b[\s\S]*?<\/(?:[A-Za-z0-9_]+:)?bzo_zone_v>/.test(text)) {
        return 'feature';
    }
    // A well-formed collection with nothing in it — a real answer, and a durable one.
    if (/numberReturned=["']0["']|numberMatched=["']0["']|FeatureCollection/i.test(text)) return 'empty';
    return 'failure';
}

// ── upstream fetch (timeout, never-throw) ────────────────────────────────────

/**
 * Fetch a URL once with a timeout; resolve to the response TEXT on a 2xx non-empty body, else null.
 * NEVER throws. `deps.fetchImpl` is injectable so the route is unit-testable without the network.
 *
 * @param {string} url
 * @param {{ fetchImpl?: typeof fetch, timeoutMs?: number }} [deps]
 * @returns {Promise<string|null>}
 */
export async function fetchZurichBzoOnce(url, deps = {}) {
    const fetchImpl = deps.fetchImpl || fetch;
    const timeoutMs = deps.timeoutMs || CH_ZURICH_UPSTREAM_TIMEOUT_MS;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
        const res = await fetchImpl(url, {
            method: 'GET',
            headers: {
                Accept: 'application/gml+xml, application/xml, text/xml, */*',
                'User-Agent': 'PRYZM-CH-Zurich-BZO-Proxy/1.0 (+https://pryzm.fly.dev)',
            },
            signal: ctrl.signal,
        });
        if (!res.ok) {
            console.warn(`[ch-zurich-bzo-proxy] HTTP ${res.status} for ${url}`);
            return null;
        }
        const text = await res.text();
        return text && text.length > 0 ? text : null;
    } catch (err) {
        console.warn(`[ch-zurich-bzo-proxy] fetch failed: ${err?.message ?? err}`);
        return null;
    } finally {
        clearTimeout(timer);
    }
}

/**
 * Resolve the `bzo_zone_v` GML at a WGS84 point, trying each bbox form until one carries a feature.
 *
 * Returns `{ gml, outcome }` where `outcome` is:
 *   • `'feature'` — a zone polygon was returned (`gml` is that body);
 *   • `'empty'`   — at least one form answered a well-formed, feature-less collection (`gml` is that
 *                   body, so the client's own `numberReturned=0` branch decides `no-zone-here`);
 *   • `'failure'` — EVERY form errored (`gml` is null). The caller MUST surface this as a 502, not
 *                   as an empty answer: they are different claims (§CONTEXT-DATA-HONESTY).
 *
 * NEVER throws.
 *
 * @param {number} lat
 * @param {number} lon
 * @param {{ fetchImpl?: typeof fetch, timeoutMs?: number }} [deps]
 * @returns {Promise<{ gml: string|null, outcome: 'feature'|'empty'|'failure' }>}
 */
export async function fetchZurichBzoAtPoint(lat, lon, deps = {}) {
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return { gml: null, outcome: 'failure' };
    let lastEmpty = null;
    for (const axis of ['wgs84-lonlat', 'wgs84-urn-latlon', 'lv95']) {
        const text = await fetchZurichBzoOnce(buildZurichBzoUrl(lat, lon, axis), deps);
        const kind = classifyZurichBzoGml(text);
        if (kind === 'feature') return { gml: text, outcome: 'feature' };
        if (kind === 'empty' && lastEmpty === null) lastEmpty = text;
        // 'failure' (or a wrong-axis off-map empty) → try the next form.
    }
    return lastEmpty !== null
        ? { gml: lastEmpty, outcome: 'empty' }
        : { gml: null, outcome: 'failure' };
}

// ── handler ──────────────────────────────────────────────────────────────────

/** Same-origin cache headers for a durable answer. */
function setDurableHeaders(res) {
    res.setHeader('Cache-Control', 'public, max-age=86400, stale-while-revalidate=86400');
    res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
}

/**
 * `GET /api/ch/zurich-bzo?lat=&lon=` →
 *   200 `{ gml: string|null }` — a durable answer (a zone, or a well-formed empty collection)
 *   502 `{ error }`            — EVERY upstream form failed. NOT "no zone here".
 *   400                        — missing/bad coordinates
 *
 * A point outside the loose City-of-Zürich bbox short-circuits to 200 `{ gml: null }` — an honest
 * "nothing of ours here", with no pointless round-trip to a municipal service.
 */
export function makeZurichBzoHandler(deps = {}) {
    return async function zurichBzoHandler(req, res) {
        const lat = Number.parseFloat(String(req.query?.lat ?? ''));
        const lon = Number.parseFloat(String(req.query?.lon ?? ''));
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
            return res.status(400).json({ error: 'lat and lon query params (EPSG:4326) are required.' });
        }
        if (
            lat < CH_ZURICH_BBOX.minLat || lat > CH_ZURICH_BBOX.maxLat ||
            lon < CH_ZURICH_BBOX.minLon || lon > CH_ZURICH_BBOX.maxLon
        ) {
            setDurableHeaders(res);
            res.setHeader('X-Zurich-Bzo-Cache', 'OUT-OF-BOUNDS');
            return res.status(200).json({ gml: null });
        }

        const key = `bzo:${lat.toFixed(5)},${lon.toFixed(5)}`;
        const cached = cacheGet(key);
        if (cached !== undefined) {
            _hits++;
            setDurableHeaders(res);
            res.setHeader('X-Zurich-Bzo-Cache', 'HIT');
            return res.status(200).json({ gml: cached });
        }
        _misses++;

        let result;
        try {
            result = await fetchZurichBzoAtPoint(lat, lon, deps);
        } catch (err) {
            console.warn('[ch-zurich-bzo-proxy] unexpected error:', err?.message ?? err);
            result = { gml: null, outcome: 'failure' };
        }

        if (result.outcome === 'failure') {
            // ⚠ NOT CACHED, and NOT a 200. A transient city outage must never be pinned for a week
            // as "this parcel has no BZO zone" — the client returns `endpoint-unreachable` on a 502.
            res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
            res.setHeader('X-Zurich-Bzo-Cache', 'MISS-UNREACHABLE');
            return res.status(502).json({
                error:
                    'The City of Zürich BZO WFS did not answer. This is NOT a statement that the ' +
                    'parcel carries no BZO zone.',
            });
        }

        cacheSet(key, result.gml); // durable: a real zone, or a real "nothing here".
        setDurableHeaders(res);
        res.setHeader('X-Zurich-Bzo-Cache', result.outcome === 'feature' ? 'MISS-FETCH' : 'MISS-EMPTY');
        return res.status(200).json({ gml: result.gml });
    };
}

/** The default production handler (real `fetch`, real endpoint). */
export const zurichBzoHandler = makeZurichBzoHandler();
