/**
 * @file server/jurisdiction/krParcelProxy.js
 * @description SOUTH KOREA — same-origin server proxy for the national cadastral map (지적도), on
 *   V-World's `LP_PA_CBND_BUBUN` (연속지적도 부번, the continuous cadastral parcel layer). It is a
 *   §KEYED-LEG: V-World requires a free 인증키, this repo holds none, AND V-World's origin refused
 *   every probe on 2026-09-06. So this route is HONEST-DEFERRED — it answers, it never crashes, and
 *   it NEVER invents a parcel.
 *
 * ⛔ THIS IS DELIBERATELY NOT A FAKE. [[fake-more-capable-than-real]]: a stub built from a service's
 *    documentation cannot falsify that documentation, and a proxy that returned a plausible-looking
 *    polygon would be indistinguishable from a working one until a Korean user drew a plot on it.
 *    Every branch here returns `{ parcel: null }` plus a MACHINE-READABLE `reason`, so the client
 *    renders a cited refusal (C57 §1.9) rather than either a fault or a lie.
 *
 * WHAT WAS PROBED, 2026-09-06, EACH WITH ITS EXACT ANSWER
 * ------------------------------------------------------
 * V-World is the ONE national door for Korean cadastre. Its whole origin refused:
 *   ✖ https://api.vworld.kr/req/data?service=data&request=GetFeature&data=LP_PA_CBND_BUBUN
 *       &format=json&size=1&geomFilter=POINT(126.978 37.5665)  → curl exit 52 "Empty reply from server"
 *   ✖ https://api.vworld.kr/req/wfs                              → HTTP 502, text/html, 107 B
 *   ✖ https://api.vworld.kr/req/wms?SERVICE=WMS&REQUEST=GetCapabilities → curl exit 52
 *   ✖ https://api.vworld.kr/req/address?service=address&request=getcoord → curl exit 52
 *   ✖ https://www.vworld.kr/                                     → HTTP 502, text/html, 107 B
 *   ✖ https://www.vworld.kr/dev/v4dv_2ddataguide2_s001.do (the API doc page) → HTTP 502, 107 B
 *   ✖ https://map.vworld.kr/                                     → HTTP 502, text/html, 107 B
 *   ⭐ TCP AND TLS SUCCEEDED ON EVERY ONE. `curl -v` shows "Trying 211.188.33.95:443", "schannel:
 *      SSL/TLS connection renegotiated", then "< HTTP/1.1 502 Bad Gateway". dns.google resolves
 *      api.vworld.kr → 211.188.33.95. This is an ORIGIN outage/block, NOT DNS and NOT our egress.
 *      ⛔ A 502 IS TRANSIENT BY NATURE — RE-PROBE BEFORE BELIEVING THIS FILE.
 *
 * The other doors, so the refusal is overturnable rather than merely asserted:
 *   ✖ nsdi.go.kr / www.nsdi.go.kr / openapi.nsdi.go.kr (국가공간정보포털 — the portal most Korean
 *       cadastral documentation points at) → DNS "Non-existent domain" from dns.google. That door is
 *       GONE, not shut, and any document citing it is stale.
 *   ⚠ https://api.odcloud.kr/api → HTTP 401, application/json, 60 B,
 *       {"code":-401,"msg":"인증키는 필수 항목 입니다."} — "an authentication key is a required field".
 *   ⚠ https://apis.data.go.kr/ → HTTP 400, application/xml, 292 B, NO_OPENAPI_SERVICE_ERROR
 *       (해당 오픈API 서비스가 없거나 폐기됨) — a wrong PATH, i.e. the gateway itself is alive.
 *   ⭐ THOSE TWO ARE THE GOOD NEWS. The 공공데이터포털 gateways are UP and merely KEYED, and a 서비스키
 *      is free on registration. So Korea is one credential away from a real answer, which is exactly
 *      why this is a keyed leg and not a `refused` row.
 *   ✔ https://www.lx.or.kr/ → HTTP 200 (LX 한국국토정보공사, the cadastral survey authority) and
 *     https://data.seoul.go.kr/ → HTTP 200, 111,596 B — both alive, neither probed to a parcel
 *     POLYGON by point. Recorded as NOT-YET-PROBED, never as "no source".
 *
 * SHAPE — why this file exists at all rather than nothing
 * ------------------------------------------------------
 * Clones the Danish keyed leg (`dkMatrikelProxy.js`, L-12888): credentials read SERVER-SIDE from env,
 * never in the browser; absent credentials degrade to `{ parcel: null }` so the client falls back to
 * the OSM footprint instead of erroring. The forward path below is WRITTEN AND WIRED — set
 * `VWORLD_API_KEY` and it makes a real request — but it has NEVER RETURNED A PARCEL here, because the
 * origin would not answer. `probeStatus` in the response says which of those worlds you are in, so a
 * future reader can tell "no key" from "key present, upstream refused" from "answered, no parcel at
 * this point" WITHOUT reading the server log. Those are three different facts and collapsing any two
 * of them is the L-422/L-457 family.
 *
 * ⚠ THIS ROUTE AUTHORISES NOTHING. A 지적도 parcel is IDENTITY and boundary (PNU code, 지번, area).
 * Korean buildable envelope comes from 용도지역 (use-zone) under the 국토계획법 plus the municipal
 * 도시계획조례, none of which is in this layer. No envelope may be computed from what this returns.
 *
 * @see server/jurisdiction/dkMatrikelProxy.js — the keyed-leg template this clones
 * @see server/jurisdiction/caBcParcelProxy.js — the keyless equivalent, for the response shape
 * @see docs/02-decisions/contracts/C57-PARCEL-DATA-LAYER.md
 */

/** The same-origin route the client calls. */
export const KR_PARCEL_PATH = '/api/parcel/kr';

/** V-World's data API. Keyed (`key=`), and refusing at the origin as of 2026-09-06. */
export const KR_VWORLD_ENDPOINT = process.env.VWORLD_DATA_URL || 'https://api.vworld.kr/req/data';

/** 연속지적도 — the continuous cadastral parcel layer (부번 = with sub-lot number). */
export const KR_VWORLD_PARCEL_LAYER = process.env.VWORLD_PARCEL_LAYER || 'LP_PA_CBND_BUBUN';

/** Cadastre changes slowly; a day-stale lookup is fine and keeps us polite to a free service. */
export const KR_PARCEL_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
export const KR_PARCEL_CACHE_MAX_ENTRIES = 512;
export const KR_UPSTREAM_TIMEOUT_MS = 15_000;

/**
 * Why a lookup produced no parcel. ⛔ These are FOUR DISTINCT FACTS and must never be collapsed:
 * a missing key is not an outage, an outage is not "no parcel here", and "no parcel here" is not
 * "outside Korea". Every one of them renders a different sentence to the user.
 */
export const KR_PARCEL_REASONS = Object.freeze({
    /** No `VWORLD_API_KEY` in the server env. The route is deferred, not broken. */
    NO_CREDENTIAL: 'kr-no-credential',
    /** The point is outside the `southkorea` bake rectangle — we never asked upstream. */
    OUT_OF_COUNTRY: 'kr-out-of-country',
    /** We asked and V-World did not answer usefully (the 2026-09-06 state). UNKNOWN, not empty. */
    UPSTREAM_REFUSED: 'kr-upstream-refused',
    /** V-World answered correctly and there is genuinely no parcel at this point. An honest EMPTY. */
    NO_PARCEL_HERE: 'kr-no-parcel-here',
});

/**
 * The `southkorea` bake rectangle, kept 1:1 with tools/context-bake/bake.mjs and terrain.mjs so a
 * point we serve context for is a point we at least ATTEMPT a parcel for. Pinned by a spec.
 */
export const KR_BBOX = Object.freeze([124.5, 32.9, 131.95, 38.65]);

/** True when `lon,lat` is inside the Korean rectangle. */
export function isInKorea(lon, lat) {
    if (!Number.isFinite(lon) || !Number.isFinite(lat)) return false;
    const [w, s, e, n] = KR_BBOX;
    return lon >= w && lon <= e && lat >= s && lat <= n;
}

/** Build the V-World GetFeature URL for a point. Exported so a spec can assert it without a network. */
export function krParcelRequestUrl(lon, lat, key) {
    const qs = new URLSearchParams({
        service: 'data',
        request: 'GetFeature',
        data: KR_VWORLD_PARCEL_LAYER,
        key,
        format: 'json',
        size: '1',
        geometry: 'true',
        attribute: 'true',
        crs: 'EPSG:4326',
        geomFilter: `POINT(${lon} ${lat})`,
    });
    return `${KR_VWORLD_ENDPOINT}?${qs.toString()}`;
}

/**
 * Normalise one V-World feature to the shape `caBcParcelProxy` returns, so the client has ONE parcel
 * contract across jurisdictions. `pnu` is Korea's 19-digit 필지고유번호 (the parcel's national id);
 * `jibun` is the human-facing 지번 address. Returns null for anything that is not a real feature —
 * ⛔ never a partially-filled object, which would read downstream as a parcel with missing fields.
 */
export function normaliseKrParcel(feature) {
    if (!feature || typeof feature !== 'object') return null;
    const props = feature.properties && typeof feature.properties === 'object' ? feature.properties : null;
    const geometry = feature.geometry && typeof feature.geometry === 'object' ? feature.geometry : null;
    if (!props || !geometry) return null;
    if (geometry.type !== 'Polygon' && geometry.type !== 'MultiPolygon') return null;
    const rawArea = props.parea ?? props.PAREA;
    return {
        source: 'vworld-lp-pa-cbnd-bubun',
        pnu: props.pnu ?? props.PNU ?? null,
        jibun: props.jibun ?? props.JIBUN ?? null,
        addr: props.addr ?? props.ADDR ?? null,
        /** 지목 — the statutory land category (대/전/답/…). IDENTITY only; it authorises nothing. */
        landCategory: props.jimok ?? props.JIMOK ?? null,
        /** Surveyed area in m², as published. Not re-derived from the polygon. */
        areaSqm: Number.isFinite(Number(rawArea)) ? Number(rawArea) : null,
        geometry,
    };
}

/**
 * The pure decision half — no network, no Express — so the four reasons above are unit-testable.
 * Returns what the handler should answer BEFORE any upstream call, or null meaning "go ask".
 */
export function krParcelPreflight(lon, lat, apikey) {
    if (!Number.isFinite(lon) || !Number.isFinite(lat)) return { status: 400 };
    if (!isInKorea(lon, lat)) {
        return { status: 200, body: { parcel: null, reason: KR_PARCEL_REASONS.OUT_OF_COUNTRY, probeStatus: 'not-asked' } };
    }
    if (!apikey) {
        return {
            status: 200,
            body: {
                parcel: null,
                reason: KR_PARCEL_REASONS.NO_CREDENTIAL,
                probeStatus: 'not-asked',
                // The client shows this verbatim. It must name the door, not apologise vaguely.
                cite: 'V-World (국토교통부 공간정보 오픈플랫폼) 연속지적도 LP_PA_CBND_BUBUN — requires a free 인증키; none is configured on this server.',
            },
        };
    }
    return null;
}

/** Tiny coord-keyed TTL cache, same shape as the Swiss/BC proxies. */
const cache = new Map();
function cacheGet(key) {
    const hit = cache.get(key);
    if (!hit) return null;
    if (Date.now() - hit.at > KR_PARCEL_CACHE_TTL_MS) { cache.delete(key); return null; }
    return hit.body;
}
function cacheSet(key, body) {
    if (cache.size >= KR_PARCEL_CACHE_MAX_ENTRIES) cache.delete(cache.keys().next().value);
    cache.set(key, { at: Date.now(), body });
}

/**
 * The forward leg. ⚠ NEVER VERIFIED AGAINST A REAL RESPONSE — see the header: V-World would not
 * answer on 2026-09-06, so `normaliseKrParcel`'s property names come from V-World's PUBLISHED layer
 * schema and NOT from a response this repo has seen. [[probe-can-be-wrong-three-ways]]: the first
 * real 200 must be diffed against `normaliseKrParcel` before this leg is trusted, and the spec's
 * fixture is marked SYNTHETIC for exactly that reason.
 */
export async function fetchKrParcel(lon, lat, deps = {}) {
    const apikey = deps.apikey ?? process.env.VWORLD_API_KEY;
    const pre = krParcelPreflight(lon, lat, apikey);
    if (pre) return pre;

    const key = `${lon.toFixed(6)},${lat.toFixed(6)}`;
    const cached = cacheGet(key);
    if (cached) return { status: 200, body: cached };

    const doFetch = deps.fetch ?? globalThis.fetch;
    let body;
    try {
        const ctl = new AbortController();
        const timer = setTimeout(() => ctl.abort(), KR_UPSTREAM_TIMEOUT_MS);
        let json;
        try {
            const res = await doFetch(krParcelRequestUrl(lon, lat, apikey), { signal: ctl.signal });
            // A non-2xx is an UNKNOWN, never an empty. This is the branch that fires today.
            if (!res.ok) {
                return { status: 200, body: { parcel: null, reason: KR_PARCEL_REASONS.UPSTREAM_REFUSED, probeStatus: `http-${res.status}` } };
            }
            json = await res.json();
        } finally { clearTimeout(timer); }

        const features = json?.response?.result?.featureCollection?.features;
        if (!Array.isArray(features)) {
            // V-World signals its own errors inside a 200 body — that is a REFUSAL, not an empty.
            const status = json?.response?.status ?? 'unparseable';
            return { status: 200, body: { parcel: null, reason: KR_PARCEL_REASONS.UPSTREAM_REFUSED, probeStatus: `body-${status}` } };
        }
        const parcel = features.length ? normaliseKrParcel(features[0]) : null;
        body = parcel
            ? { parcel, reason: null, probeStatus: 'ok' }
            : { parcel: null, reason: KR_PARCEL_REASONS.NO_PARCEL_HERE, probeStatus: 'ok' };
    } catch (err) {
        // Timeout, DNS, TLS, abort — all UNKNOWN. Never a false "no parcel here".
        return { status: 200, body: { parcel: null, reason: KR_PARCEL_REASONS.UPSTREAM_REFUSED, probeStatus: `error-${err?.name ?? 'unknown'}` } };
    }
    cacheSet(key, body);
    return { status: 200, body };
}

/** The Express handler. Bad coords → 400; everything else → 200 with a named reason. Never crashes. */
export async function krParcelHandler(req, res) {
    const lon = Number(req.query?.lon);
    const lat = Number(req.query?.lat);
    const out = await fetchKrParcel(lon, lat);
    if (out.status === 400) { res.status(400).json({ error: 'lat and lon are required numbers' }); return; }
    res.status(200).json(out.body);
}
