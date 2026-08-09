// §BCN-REFOS-OV-PROXY — the AMB "Refós de Planejament" *Ordenació Volumètrica* (`OV_Trames`)
// same-origin seam: the ONE thing that was missing for Barcelona clau 18.
//
// ─────────────────────────────────────────────────────────────────────────────
// WHY THIS EXISTS
// ─────────────────────────────────────────────────────────────────────────────
// clau 18 (*ordenació en volumetria específica*) is 17.5 % of Barcelona's private buildable land and
// a PERMANENT refusal: PGM-1976 NNUU Art. 306 does not STATE an envelope, it points at *"the
// established volumetric ordering"* — a different approved document per site. There is therefore no
// scalar for anyone to transcribe. But the AMB has already VECTORISED those plànols and publishes
// them as queryable GIS: `OV_Trames` carries a closed volumetric FOOTPRINT polygon plus a `PLANTES`
// storey count.
//
// The whole PRYZM side of that path was already written — the `explicit-area` rule pack
// (`rulepacks/esBarcelonaVolumetria18.ts`), the resolver (`providers/bcnRefosOVProvider.ts`) and the
// L5 dispatch branch (`siteDispatch.ts` → `tryBcnClau18Volumetria`) — and it rendered nothing,
// because THIS ROUTE DID NOT EXIST. Under the C57 CSP (`connect-src 'self'`) the browser cannot
// reach geoportal.amb.cat cross-origin, so the resolver's fetch failed and it refused
// `endpoint-unreachable` every time. This file closes that gap.
//
// ⚠ IT IS NOT SUFFICIENT ON ITS OWN. The dispatcher is ALSO gated on `BCN_REFOS_OV_CERTIFIED`
// (default OFF — the L-449 human gate on the Refós *vintage*). This route makes that gate SIGNABLE;
// it does not open it. Flipping the flag is a founder legal act, not an engineering change.
//
// ─────────────────────────────────────────────────────────────────────────────
// THE SOURCE — probed live 2026-07-31, real response bodies, not documentation.
// ─────────────────────────────────────────────────────────────────────────────
// geoportal.amb.cat `qualificacio_refos_3857/MapServer`, keyless:
//   layer 17 `OV_Trames` (polygon) — `where=CODI_INE='08019'` → **5 073** features; `PLANTES` is
//     100 % populated (`AND PLANTES IS NOT NULL AND PLANTES<>''` → 5 073 too). Sample attributes:
//     `{ "CLAU": "18hs", "PLANTES": "B+7", "EXP": "1998/001498" }`. Total SHAPE_Area 3 547 777 m².
//   layer 16 `QU_Trames` (the zone claus) — already consumed via `server/mucZoningProxy.js` (through
//     the Generalitat MUC WMS). Its clau field is `CLAU_URB`, not `CLAU`.
// The service stores in EPSG:25831 and publishes in EPSG:3857; we ask for `outSR=4326` so the ring
// comes back in WGS84 and the client never reprojects (resolver honesty property 2).
//
// ─────────────────────────────────────────────────────────────────────────────
// HONESTY — §CONTEXT-DATA-HONESTY: an OUTAGE and an EMPTY are DIFFERENT VALUES
// ─────────────────────────────────────────────────────────────────────────────
//   • upstream OK, including a genuine zero-feature answer → 200 `{ features: [] }` → the client
//     resolver reads `no-feature`, and the dispatcher shows the CITED Art. 306 refusal.
//   • upstream failure / timeout / non-JSON / an ArcGIS `{error}` envelope → **502** `{ error }` →
//     the client's `res.ok === false` path returns `endpoint-unreachable`, and the dispatcher shows
//     the SAME cited Art. 306 refusal.
// Both degrade to the refusal — but they are distinct status codes, distinct refusal reasons and
// distinct cache behaviour (a failure is NEVER cached), so an outage can never be mistaken for a
// legal statement that a parcel has no volumetric ordering, and never for a zero envelope.
//
// ─────────────────────────────────────────────────────────────────────────────
// NOT AN OPEN FORWARDER
// ─────────────────────────────────────────────────────────────────────────────
// The client sends a full Esri-shaped query string (that is the contract `bcnRefosOVProvider.ts`
// already emits, and it is not redesigned here). This route nonetheless treats every parameter as
// UNTRUSTED and rebuilds the upstream URL server-side from a fixed host + path:
//   • `layer` must be in `BCN_REFOS_ALLOWED_LAYERS` — no arbitrary layer, no arbitrary service.
//   • `where` must match `CODI_INE='<5 digits>'` exactly — the only SQL that reaches upstream, so
//     there is no injection surface beyond a five-digit municipal code.
//   • `outFields` is intersected with `BCN_REFOS_ALLOWED_FIELDS`.
//   • `geometry` must parse to a finite WGS84 point (Esri point JSON), or `lat`/`lon` is accepted.
//   • everything else (geometryType / inSR / spatialRel / returnGeometry / outSR / f) is FIXED here.
//
// @see server/madridCondicionesProxy.js — the ArcGIS-passthrough template this mirrors
// @see server/mucZoningProxy.js         — the original cache/forward/never-crash shape
// @see packages/site-parcel-data/src/providers/bcnRefosOVProvider.ts — the client consumer
// Contracts: C57 (same-origin/CSP), C58 §1.2/§1.4/§1.11, ADR-0270 (explicit-area), ADR-0273, L-449.

/** The same-origin route `BCN_REFOS_OV_PATH` in `bcnRefosOVProvider.ts` points at. Keep in sync. */
export const BCN_REFOS_OV_PATH = '/api/bcn-refos/ov';

/** The keyless AMB Refós ArcGIS MapServer root (no trailing slash). */
export const BCN_REFOS_ENDPOINT =
    'https://geoportal.amb.cat/geoserveis/rest/services/qualificacio_refos_3857/MapServer';

/**
 * Layers this route will forward to. 17 = `OV_Trames` (the volumetric orderings — the clau-18 win);
 * 16 = `QU_Trames` (the zone claus) is allowed as a corroborating read. Anything else is a 400: this
 * is a purpose-built seam, not a generic ArcGIS tunnel.
 */
export const BCN_REFOS_ALLOWED_LAYERS = Object.freeze([16, 17]);

/** The default layer when the caller does not name one — `OV_Trames`. */
export const BCN_REFOS_OV_LAYER = 17;

/** Attributes this route will ask upstream for. An unlisted `outFields` entry is dropped, not sent. */
export const BCN_REFOS_ALLOWED_FIELDS = Object.freeze([
    'PLANTES', 'CLAU', 'EXP', 'CLAU_URB', 'CODI_INE', 'OBJECTID', 'NOMMUNI', 'PLAN', 'SHAPE_Area',
]);

/** What the client asks for by default (`bcnRefosOVProvider.ts`). */
export const BCN_REFOS_DEFAULT_FIELDS = 'PLANTES,CLAU,EXP';

/** Barcelona's INE code — the default `CODI_INE` scope on this metro-wide service. */
export const BCN_INE_CODE = '08019';

export const BCN_REFOS_UPSTREAM_TIMEOUT_MS = 15_000;

/**
 * Planning geometry changes on the order of YEARS — the Refós is a periodic re-edition, not a live
 * feed. A long TTL is honest here and keeps us polite to a free public service (C57 §7.2).
 */
export const BCN_REFOS_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const BCN_REFOS_CACHE_MAX_ENTRIES = 512;

// ── cache ────────────────────────────────────────────────────────────────────
const _cache = new Map();
let _hits = 0;
let _misses = 0;

export function __resetBcnRefosCache() { _cache.clear(); _hits = 0; _misses = 0; }
export function bcnRefosCacheStats() { return { size: _cache.size, hits: _hits, misses: _misses }; }

/** Round to ~1 m so neighbouring clicks on the same parcel share a cache entry. Layer-scoped. */
function cacheKey(layer, lat, lon, fields, ine) {
    return `${layer}|${lat.toFixed(5)},${lon.toFixed(5)}|${fields}|${ine}`;
}

function cacheGet(key) {
    const e = _cache.get(key);
    if (!e) return undefined;
    if (Date.now() > e.expiresAt) { _cache.delete(key); return undefined; }
    return e.value;
}

function cacheSet(key, value, ttlMs = BCN_REFOS_CACHE_TTL_MS) {
    if (_cache.size >= BCN_REFOS_CACHE_MAX_ENTRIES) {
        const oldest = _cache.keys().next().value;
        if (oldest !== undefined) _cache.delete(oldest);
    }
    _cache.set(key, { value, expiresAt: Date.now() + ttlMs });
}

// ── request parsing (every input is untrusted) ───────────────────────────────

/**
 * Extract the WGS84 query point from a request query.
 *
 * Accepts BOTH forms on purpose:
 *   • `geometry={"x":<lon>,"y":<lat>,"spatialReference":{"wkid":4326}}` — what the shipped
 *     `bcnRefosOVProvider.ts` sends. Esri point JSON: **x is the longitude**, y the latitude.
 *   • `lat=&lon=` — the plain form every other PRYZM proxy uses, so probes and tests can hit this
 *     route without hand-encoding Esri JSON.
 * Returns `null` when neither yields a finite in-range point — the caller 400s rather than guessing.
 */
export function parseQueryPoint(query) {
    const q = query || {};
    const finite = (lat, lon) =>
        Number.isFinite(lat) && Number.isFinite(lon) &&
        lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180
            ? { lat, lon }
            : null;

    if (typeof q.geometry === 'string' && q.geometry.trim() !== '') {
        try {
            const g = JSON.parse(q.geometry);
            // Esri point JSON is {x: lon, y: lat}. A `points`/`rings` payload is NOT a point query
            // and is refused rather than coerced.
            if (g && typeof g === 'object' && !Array.isArray(g)) {
                const hit = finite(Number(g.y), Number(g.x));
                if (hit) return hit;
            }
        } catch {
            // Malformed geometry JSON — fall through to lat/lon, then 400. Never silently "0,0".
        }
        // A comma pair ("lon,lat") is also valid Esri shorthand.
        const parts = q.geometry.split(',');
        if (parts.length === 2) {
            const hit = finite(Number(parts[1]), Number(parts[0]));
            if (hit) return hit;
        }
        return null;
    }

    return finite(Number(q.lat), Number(q.lon));
}

/**
 * Validate the requested layer against `BCN_REFOS_ALLOWED_LAYERS`. Absent → the OV layer (17).
 * Present-but-not-allowed → `null`, which the handler turns into a 400. This is what stops the route
 * being a generic ArcGIS tunnel.
 */
export function parseLayer(raw) {
    if (raw === undefined || raw === null || raw === '') return BCN_REFOS_OV_LAYER;
    const n = Number(raw);
    if (!Number.isInteger(n)) return null;
    return BCN_REFOS_ALLOWED_LAYERS.includes(n) ? n : null;
}

/**
 * Validate the `where` clause. The ONLY SQL permitted upstream is the municipal scope
 * `CODI_INE='<5 digits>'`, so the injection surface is a five-digit code and nothing else. Absent →
 * Barcelona. Present but any other shape → `null` → 400 (we do not silently substitute a different
 * filter than the caller asked for; that would answer a question nobody asked).
 */
export function parseIneScope(raw) {
    if (raw === undefined || raw === null || raw === '') return BCN_INE_CODE;
    const m = /^\s*CODI_INE\s*=\s*'(\d{5})'\s*$/i.exec(String(raw));
    return m ? m[1] : null;
}

/** Intersect a comma-separated `outFields` with the allowlist. Empty result → the default set. */
export function parseOutFields(raw) {
    if (raw === undefined || raw === null || String(raw).trim() === '') return BCN_REFOS_DEFAULT_FIELDS;
    const kept = String(raw)
        .split(',')
        .map((s) => s.trim())
        .filter((s) => BCN_REFOS_ALLOWED_FIELDS.includes(s));
    return kept.length > 0 ? kept.join(',') : BCN_REFOS_DEFAULT_FIELDS;
}

// ── upstream URL (single source of truth) ────────────────────────────────────

/**
 * Build the `OV_Trames` point-intersect query URL for a WGS84 point. Esri point JSON with
 * `inSR=4326`, `spatialRel=esriSpatialRelIntersects`, `returnGeometry=true` and — the load-bearing
 * one — `outSR=4326`, so the volumetric footprint returns in WGS84 and the client resolver does no
 * EPSG:3857 reprojection of its own.
 */
export function buildBcnRefosOvUrl(lat, lon, { layer = BCN_REFOS_OV_LAYER, outFields = BCN_REFOS_DEFAULT_FIELDS, ine = BCN_INE_CODE } = {}) {
    const qs = new URLSearchParams({
        geometry: JSON.stringify({ x: lon, y: lat, spatialReference: { wkid: 4326 } }),
        geometryType: 'esriGeometryPoint',
        inSR: '4326',
        spatialRel: 'esriSpatialRelIntersects',
        where: `CODI_INE='${ine}'`,
        outFields,
        returnGeometry: 'true',
        outSR: '4326',
        f: 'json',
    });
    return `${BCN_REFOS_ENDPOINT}/${layer}/query?${qs.toString()}`;
}

/**
 * Fetch the raw Esri JSON at a point. Resolves to the parsed body on a 2xx JSON response, or `null`
 * on ANY failure (non-OK, timeout, non-JSON, or an ArcGIS `{error}` envelope — the AMB service
 * answers 200 with an error envelope on a malformed query, and that is a FAILURE, not an empty
 * area). NEVER throws. `deps` is injectable so the route is unit-testable without the network.
 */
export async function fetchBcnRefosOv(lat, lon, deps = {}) {
    const fetchImpl = deps.fetchImpl || fetch;
    const timeoutMs = deps.timeoutMs || BCN_REFOS_UPSTREAM_TIMEOUT_MS;
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
        const res = await fetchImpl(buildBcnRefosOvUrl(lat, lon, deps), {
            headers: {
                Accept: 'application/json',
                'User-Agent': 'PRYZM-BcnRefos-Proxy/1.0 (+https://pryzm.fly.dev)',
            },
            signal: ctrl.signal,
        });
        if (!res.ok) {
            console.warn(`[bcn-refos-proxy] OV query HTTP ${res.status} — upstream miss.`);
            return null;
        }
        const text = await res.text();
        let json;
        try { json = JSON.parse(text); } catch {
            console.warn('[bcn-refos-proxy] OV query returned non-JSON — upstream miss.');
            return null;
        }
        if (json && typeof json === 'object' && json.error) {
            console.warn('[bcn-refos-proxy] ArcGIS error envelope — upstream miss:', json.error?.message ?? json.error);
            return null;
        }
        return json;
    } catch (err) {
        console.warn('[bcn-refos-proxy] OV query fetch failed:', err?.message ?? err);
        return null;
    } finally {
        clearTimeout(timer);
    }
}

// ── handler ──────────────────────────────────────────────────────────────────

/**
 * `GET /api/bcn-refos/ov?geometry=<esri point json>&layer=17&where=CODI_INE='08019'&outFields=…`
 * (also accepts the plain `?lat=&lon=` form).
 *
 * 200 `{ features: [...] }` — the raw Esri response, possibly `features: []` (a genuine "no
 *     volumetric ordering published here"). The client reads `no-feature` and the dispatcher shows
 *     the cited PGM Art. 306 refusal.
 * 502 `{ error }`          — upstream failure / timeout / bad body. DISTINCT from an empty answer so
 *     the client returns `endpoint-unreachable`, never `no-feature`. Never cached.
 * 400                      — no usable point, a layer outside the allowlist, or a `where` that is
 *     not a bare `CODI_INE='<5 digits>'` scope.
 */
export function makeBcnRefosOvHandler(deps = {}) {
    return async function bcnRefosOvHandler(req, res) {
        const point = parseQueryPoint(req.query);
        if (!point) {
            return res.status(400).json({
                error:
                    'A WGS84 query point is required: either geometry={"x":<lon>,"y":<lat>,' +
                    '"spatialReference":{"wkid":4326}} or lat=&lon=.',
            });
        }
        const layer = parseLayer(req.query?.layer);
        if (layer === null) {
            return res.status(400).json({
                error: `layer must be one of ${BCN_REFOS_ALLOWED_LAYERS.join(', ')} — this route is not a general ArcGIS proxy.`,
            });
        }
        const ine = parseIneScope(req.query?.where);
        if (ine === null) {
            return res.status(400).json({
                error: "where, when supplied, must be exactly CODI_INE='<5 digits>'.",
            });
        }
        const outFields = parseOutFields(req.query?.outFields);

        const key = cacheKey(layer, point.lat, point.lon, outFields, ine);
        const cached = cacheGet(key);
        if (cached !== undefined) {
            _hits++;
            res.setHeader('X-Bcn-Refos-Cache', 'HIT');
            return res.status(200).json(cached);
        }
        _misses++;

        const body = await fetchBcnRefosOv(point.lat, point.lon, { ...deps, layer, outFields, ine });
        if (body === null) {
            // §CONTEXT-DATA-HONESTY: a failure must never be cached and must never look like an
            // empty answer. 502 ⇒ the client refuses `endpoint-unreachable`, not `no-feature`.
            res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
            res.setHeader('X-Bcn-Refos-Cache', 'MISS-UNREACHABLE');
            return res.status(502).json({
                error:
                    'The AMB Refós de Planejament service did not answer. This is NOT a statement ' +
                    'that the parcel has no published volumetric ordering.',
            });
        }

        // Normalise to `{ features: [...] }` so the client always reads an array (never a null crash).
        const payload = { features: Array.isArray(body.features) ? body.features : [] };
        cacheSet(key, payload);
        res.setHeader('Cache-Control', 'public, max-age=86400');
        res.setHeader('X-Bcn-Refos-Cache', 'MISS');
        return res.status(200).json(payload);
    };
}

export const bcnRefosOvHandler = makeBcnRefosOvHandler();
