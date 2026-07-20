/**
 * server/siuClassificationProxy.js
 *
 * §L-441 Tier B — same-origin proxy + shared cache for Spain's NATIONAL
 * clasificación-del-suelo register (SIU, Ministerio de Vivienda y Agenda Urbana), so a plot
 * anywhere in Spain resolves to `urbano / urbanizable / rústico` without the browser ever
 * touching a government host.
 *
 * Clones the cache/forward/fallback shape of `server/plandataZoningProxy.js` (Denmark) —
 * see that file for the template rationale.
 *
 * ─── WHY A LIVE QUERY AND NOT THE MIRROR ─────────────────────────────────────────────────
 * The founder approved a Supabase/PostGIS mirror of the whole corpus (~3 GB). That is the
 * right answer at national scale, and the ingest + schema exist for it. It is the WRONG
 * answer for beta: SIU answers a point query in ~0.5 s, which is entirely adequate for
 * "user clicked a plot, what class is it", and it costs nothing — no Supabase Pro, no 3 GB,
 * no refresh job. The mirror becomes worth its cost when we need map-wide rendering or bulk
 * analysis, not before. This proxy is the cheap path; the mirror is the scale path, and they
 * share the same normalisation so swapping is a provider change, not a rewrite.
 *
 * ─── TWO NON-OBVIOUS REQUIREMENTS, both learned the hard way ─────────────────────────────
 * 1. **ArcGIS REST, not WFS.** The SIU WFS projection of this layer omits `ClaseSuelo`
 *    entirely (it returns only OBJECTID/Shape/AreaLambert). Querying by WFS would return
 *    geometry with no classification and read as "no data". Do not "simplify" this to WFS.
 * 2. **Browser User-Agent.** The ministry's hosts 403 a default client UA. This is not
 *    cosmetic; several "endpoint is down" findings in the research record were this.
 *
 * Contract: C57 (parcel/geo data ingestion), C58 §1.11 (granularity), §07 BIM-SECURITY §11
 * (DB/network access confined to server/).
 */

/** Route this proxy answers on. */
export const SIU_CLASSIFICATION_PATH = '/api/siu/classification';

/** SIU layer 15 — `OGC_Clases_Suelo`, national. ArcGIS REST (see requirement 1 above). */
export const SIU_LAYER_URL =
    'https://mapas.fomento.gob.es/arcgis/rest/services/SIU/Servicios_OGC/MapServer/15';

/** See requirement 2 above. */
const UA =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';

/** Upstream timeout. Paid at most once per plot, then cached. */
export const SIU_UPSTREAM_TIMEOUT_MS = 15_000;

/**
 * Cache TTL. SIU refreshes on the order of semi-annually, so 24 h is conservative — the risk
 * of a stale answer within a day is effectively nil, and it keeps us far below any rate limit
 * a government host might impose.
 */
export const SIU_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
export const SIU_CACHE_MAX_ENTRIES = 512;

/**
 * Coordinate rounding for the cache key: 4 dp ≈ 11 m. Land-class polygons are far coarser
 * than a parcel, so two points 11 m apart are overwhelmingly the same class — this collapses
 * the repeated lookups a single user session generates while panning/re-selecting.
 */
const CACHE_COORD_DP = 4;

const _cache = new Map();

function cacheKey(lat, lon) {
    return `${lat.toFixed(CACHE_COORD_DP)},${lon.toFixed(CACHE_COORD_DP)}`;
}

function cacheGet(key) {
    const hit = _cache.get(key);
    if (!hit) return null;
    if (Date.now() - hit.at > SIU_CACHE_TTL_MS) { _cache.delete(key); return null; }
    // LRU touch
    _cache.delete(key); _cache.set(key, hit);
    return hit.value;
}

function cacheSet(key, value) {
    if (_cache.size >= SIU_CACHE_MAX_ENTRIES) {
        const oldest = _cache.keys().next().value;
        if (oldest !== undefined) _cache.delete(oldest);
    }
    _cache.set(key, { at: Date.now(), value });
}

/**
 * SIU's verbose Spanish → a stable machine key.
 *
 * Returns `null` for anything unrecognised — NEVER a guess. If SIU publishes a new class
 * after a refresh, the caller must see "unknown", not a plausible neighbour: silently mapping
 * an unfamiliar class onto `no_urbanizable` would misclassify real land with full confidence.
 * Mirrors `scripts/data/ingest-siu-classification.mjs` so the live and mirrored paths agree.
 */
export function normaliseClaseSuelo(raw) {
    if (typeof raw !== 'string') return null;
    switch (raw.trim().toUpperCase()) {
        case 'SUELO URBANO': return 'urbano';
        case 'SUELO URBANO NO CONSOLIDADO': return 'urbano_no_consolidado';
        case 'SUELO URBANIZABLE DELIMITADO O SECTORIZADO': return 'urbanizable_delimitado';
        case 'SUELO URBANIZABLE NO DELIMITADO O SECTORIZADO': return 'urbanizable_no_delimitado';
        case 'SUELO NO URBANIZABLE': return 'no_urbanizable';
        case 'SISTEMAS GENERALES Y OTROS': return 'sistemas_generales';
        default: return null;
    }
}

/** `FechaBaja === '99999999'` (or empty) means the record is still in force. */
export function isInForce(fechaBaja) {
    const s = String(fechaBaja ?? '').trim();
    return s === '' || s === '99999999';
}

function buildQueryUrl(lat, lon) {
    const geometry = encodeURIComponent(
        JSON.stringify({ x: lon, y: lat, spatialReference: { wkid: 4326 } }),
    );
    return `${SIU_LAYER_URL}/query`
        + `?geometry=${geometry}`
        + `&geometryType=esriGeometryPoint`
        + `&inSR=4326&spatialRel=esriSpatialRelIntersects`
        + `&outFields=${encodeURIComponent('ProvINE,ClaseSuelo,NuclRural,FechaBaja')}`
        + `&returnGeometry=false&f=json`;
}

/**
 * GET /api/siu/classification?lat=..&lon=..
 *
 * NON-FATAL BY DESIGN (mirrors the Overpass/Plandata proxies): any upstream failure returns
 * 200 with `{ found: false, reason }` rather than an error status. A classification lookup is
 * an ENRICHMENT — the parcel is already selected and the user is mid-flow. Failing the request
 * would surface as a broken interaction for something that is, at worst, a missing chip.
 */
export async function siuClassificationHandler(req, res) {
    const lat = Number(req.query?.lat);
    const lon = Number(req.query?.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
        return res.status(400).json({ found: false, reason: 'bad-coordinates' });
    }

    const key = cacheKey(lat, lon);
    const cached = cacheGet(key);
    if (cached) return res.status(200).json({ ...cached, cached: true });

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), SIU_UPSTREAM_TIMEOUT_MS);
    try {
        const upstream = await fetch(buildQueryUrl(lat, lon), {
            headers: { 'User-Agent': UA, Accept: 'application/json' },
            signal: controller.signal,
        });
        if (!upstream.ok) {
            return res.status(200).json({ found: false, reason: `upstream-${upstream.status}` });
        }
        const json = await upstream.json();
        if (json?.error) {
            return res.status(200).json({ found: false, reason: 'upstream-error' });
        }

        const feature = (json.features ?? [])[0];
        if (!feature) {
            // A real answer: the point is outside SIU's coverage (e.g. at sea, or a gap).
            const miss = { found: false, reason: 'no-coverage' };
            cacheSet(key, miss);
            return res.status(200).json(miss);
        }

        const a = feature.attributes ?? {};
        const clase = normaliseClaseSuelo(a.ClaseSuelo);
        const municipioIne = /^\d{5}$/.test(String(a.ProvINE ?? '').trim())
            ? String(a.ProvINE).trim() : null;

        const value = {
            found: true,
            // `clase: null` + `claseRaw` set means SIU published something we do not know.
            // Surfaced honestly rather than coerced — see normaliseClaseSuelo.
            clase,
            claseRaw: a.ClaseSuelo ?? null,
            // SIU names this field ProvINE but it holds the 5-digit MUNICIPALITY code.
            municipioIne,
            nucleoRural: String(a.NuclRural ?? '') === '1',
            inForce: isInForce(a.FechaBaja),
            // C58 §1.11 — this answers "what class of land", NOT "what may I build".
            // Stated in the payload so no consumer can mistake it for a parcel envelope.
            granularity: 'municipality-polygon',
            source: 'siu',
            sourceUrl: SIU_LAYER_URL,
            confidence: 'published-structured',
        };
        cacheSet(key, value);
        return res.status(200).json(value);
    } catch (err) {
        const reason = err?.name === 'AbortError' ? 'upstream-timeout' : 'upstream-unreachable';
        return res.status(200).json({ found: false, reason });
    } finally {
        clearTimeout(timer);
    }
}

/** Test seam — lets a suite assert cache behaviour without reaching the network. */
export function __resetSiuCacheForTests() { _cache.clear(); }
