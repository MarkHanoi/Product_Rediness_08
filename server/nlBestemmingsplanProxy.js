// §NL-BESTEMMINGSPLAN-PROXY (L-609 / §NL-NATIONWIDE) — the Netherlands bestemmingsplan bouwvlak +
// maatvoering lookup, NATIONWIDE and KEYLESS.
//
// ─────────────────────────────────────────────────────────────────────────────
// WHY THIS EXISTS — the same-origin seam the client's `resolveNlBestemmingsplan` needs.
// ─────────────────────────────────────────────────────────────────────────────
// The Dutch bestemmingsplan is an `explicit-area` zone: the ordinance PUBLISHES the buildable
// footprint (`bouwvlak`) AND its dimensions (`maatvoering` — e.g. "maximum bouwhoogte (m)") as
// machine-readable geometry/attributes (IMRO2012 / SVBP2012). The DSO Ruimtelijke Plannen API v4 is
// authoritative but KEY-GATED (HTTP 401 without an Informatiehuis Ruimte key). The founder-verified
// KEYLESS alternative — a national mirror of every officially-published plan — is the PDOK
// "Ruimtelijke plannen" WMS. Its `GetFeatureInfo` at a WGS84 point returns the bouwvlak polygon +
// the maatvoering numbers, no key. The client cannot reach service.pdok.nl cross-origin under CSP
// (`connect-src 'self'`), so — exactly like `server/madridCondicionesProxy.js` — every client hits
// OUR origin, this proxy forwards the point queries, CONSOLIDATES + picks the governing plan, and
// returns a plain JSON body in the shape the client resolver parses.
//
// LIVE PROOF (2026-07-26, keyless): maximum bouwhoogte Rotterdam 40 m, Utrecht 26 m, Groningen 24 m.
//
// GOVERNING-PLAN PICK (§CONTEXT-DATA-HONESTY): a point can sit under several overlapping plans (an
// old plan + a facet revision). GetFeatureInfo returns them all, so two DIFFERENT bouwhoogte values
// can come back for one spot (observed at Utrecht: 26 and 5). We therefore pick ONE governing plan —
// most-authoritative status ("onherroepelijk"/"geconsolideerd" > "vastgesteld" > "ontwerp"), then
// most-recent `datum` — and pass through ONLY its bouwvlak + maatvoering + bestemming. Mixing values
// across plans would fabricate a rule nobody adopted.
//
// HONESTY — a FAILURE and an EMPTY answer must never collapse (§CONTEXT-DATA-HONESTY):
//   • upstream OK, no plan at the point → 200 `{ plan: null }` → the client reads `no-plan`;
//   • upstream OK, plan resolved        → 200 `{ plan, bestemmingsvlak, bouwvlak, maatvoeringen }`
//                                          (bestemmingsvlak now carries `{ naam, geometrie }` — the
//                                          zone footprint — for the §NL-SPARSE-FALLBACK when no
//                                          bouwvlak is published; see resolveNlBestemmingsplan.ts);
//   • upstream failure / timeout        → 502 `{ error }` → the client returns `endpoint-unreachable`.
//
// @see server/madridCondicionesProxy.js — the template this mirrors (cache/forward/never-crash)
// @see packages/site-parcel-data/src/providers/resolveNlBestemmingsplan.ts — the client consumer

/** The same-origin route the client's `resolveNlBestemmingsplan` calls. */
export const NL_BESTEMMINGSPLAN_PATH = '/api/nl/bestemmingsplan';

/** service.pdok.nl — the KEYLESS national "Ruimtelijke plannen" WMS (live-verified 2026-07-26). */
export const NL_RP_WMS_ENDPOINT =
    'https://service.pdok.nl/kadaster/ruimtelijke-plannen/wms/v1_0';

export const NL_UPSTREAM_TIMEOUT_MS = 15_000;
/** Planning geometry changes on the order of years; a long TTL is honest + polite (C57 §7.2). */
export const NL_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const NL_CACHE_MAX_ENTRIES = 512;

// ── cache ──────────────────────────────────────────────────────────────────
const _cache = new Map();
let _hits = 0;
let _misses = 0;

export function __resetNlBpCache() { _cache.clear(); _hits = 0; _misses = 0; }
export function nlBpCacheStats() { return { size: _cache.size, hits: _hits, misses: _misses }; }

/** Round to ~1 m so neighbouring clicks on the same parcel share a cache entry. */
function cacheKey(lat, lon) { return `${lat.toFixed(5)},${lon.toFixed(5)}`; }

function cacheGet(key) {
    const e = _cache.get(key);
    if (!e) return undefined;
    if (Date.now() > e.expiresAt) { _cache.delete(key); return undefined; }
    return e.value;
}
function cacheSet(key, value, ttlMs = NL_CACHE_TTL_MS) {
    if (_cache.size >= NL_CACHE_MAX_ENTRIES) {
        const oldest = _cache.keys().next().value;
        if (oldest !== undefined) _cache.delete(oldest);
    }
    _cache.set(key, { value, expiresAt: Date.now() + ttlMs });
}

// ── upstream URL (single source of truth) ─────────────────────────────────────

/**
 * Build a WMS 1.3.0 GetFeatureInfo URL for one layer at a WGS84 point. CRS EPSG:4326 in WMS 1.3.0
 * has axis order lat,lon, so BBOX = miny,minx,maxy,maxx = (lat-d),(lon-d),(lat+d),(lon+d). The
 * query pixel is the centre (i=j=25 of a 51×51 image), so the returned features are those the point
 * falls in. `info_format=application/json` → GeoJSON (with the bouwvlak geometry).
 */
export function buildNlGfiUrl(layer, lat, lon) {
    const d = 0.0004; // ~44 m box; centre pixel = the point.
    const qs = new URLSearchParams({
        service: 'WMS', version: '1.3.0', request: 'GetFeatureInfo',
        layers: layer, query_layers: layer, crs: 'EPSG:4326',
        bbox: `${lat - d},${lon - d},${lat + d},${lon + d}`,
        width: '51', height: '51', i: '25', j: '25',
        info_format: 'application/json', feature_count: '20',
    });
    return `${NL_RP_WMS_ENDPOINT}?${qs.toString()}`;
}

// ── SVBP2012 helpers (pure) ───────────────────────────────────────────────────

/** Unpack the PDOK `maatvoering` string `"<naam>"="<waarde>"` → { naam, waarde }, or null. */
export function parsePdokMaatvoering(props) {
    const packed = props?.maatvoering;
    const m = typeof packed === 'string' ? packed.match(/"([^"]+)"\s*=\s*"([^"]*)"/) : null;
    if (m) return { naam: m[1], waarde: m[2] };
    // Fallback: some records carry `naam` separately with the value only in the packed string; if the
    // packed form is absent but a `naam` typering is present, we cannot honestly invent a value.
    if (typeof props?.naam === 'string' && props.naam.trim() !== '') return { naam: props.naam, waarde: null };
    return null;
}

/** Priority of a plan status — higher governs. Unknown → 0. */
function planStatusRank(status) {
    const s = String(status ?? '').toLowerCase();
    if (s.includes('onherroepelijk')) return 4;
    if (s.includes('geconsolideerd')) return 3;
    if (s.includes('vastgesteld')) return 2;
    if (s.includes('ontwerp')) return 1;
    return 0;
}

/**
 * Pick the governing dossierid from a set of feature property bags carrying `dossierid`,
 * `dossierstatus`/`planstatus`, and `datum`. Most-authoritative status, then most-recent date.
 * Returns null when nothing usable is present.
 */
export function pickGoverningDossier(propBags) {
    let best = null;
    for (const p of propBags) {
        const dossierid = p?.dossierid;
        if (!dossierid) continue;
        const rank = Math.max(planStatusRank(p?.dossierstatus), planStatusRank(p?.planstatus));
        const datum = String(p?.datum ?? '');
        if (
            best === null ||
            rank > best.rank ||
            (rank === best.rank && datum > best.datum)
        ) {
            best = { dossierid, rank, datum };
        }
    }
    return best?.dossierid ?? null;
}

// ── upstream fetch ─────────────────────────────────────────────────────────

async function fetchGfiJson(layer, lat, lon, deps) {
    const fetchImpl = deps.fetchImpl || fetch;
    const timeoutMs = deps.timeoutMs || NL_UPSTREAM_TIMEOUT_MS;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
        const res = await fetchImpl(buildNlGfiUrl(layer, lat, lon), {
            headers: {
                Accept: 'application/json',
                'User-Agent': 'PRYZM-NL-Bestemmingsplan-Proxy/1.0 (+https://pryzm.fly.dev)',
            },
            signal: ctrl.signal,
        });
        if (!res.ok) return { error: `HTTP ${res.status}` };
        const text = await res.text();
        let json;
        try { json = JSON.parse(text); } catch { return { error: 'non-JSON' }; }
        return { features: Array.isArray(json?.features) ? json.features : [] };
    } catch (err) {
        return { error: String(err?.message ?? err) };
    } finally {
        clearTimeout(timer);
    }
}

/**
 * Resolve + CONSOLIDATE the bestemmingsplan at a WGS84 point via the keyless PDOK RP WMS. Returns
 * the consolidated body `{ plan, bestemmingsvlak, bouwvlak, maatvoeringen }`, or `{ plan: null }`
 * when no plan covers the point, or null on ANY upstream failure. NEVER throws. `deps` injectable.
 */
export async function fetchNlBestemmingsplan(lat, lon, deps = {}) {
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;

    // Query the four layers in parallel. `plangebied`/`enkelbestemming` establish the plan identity
    // + status; `bouwvlak` gives the footprint geometry; `maatvoering` the numbers.
    const [gebied, enkel, bouwvlak, maatvoering] = await Promise.all([
        fetchGfiJson('bestemmingsplangebied', lat, lon, deps),
        fetchGfiJson('enkelbestemming', lat, lon, deps),
        fetchGfiJson('bouwvlak', lat, lon, deps),
        fetchGfiJson('maatvoering', lat, lon, deps),
    ]);

    // If EVERY layer errored, the service is unreachable — a FAILURE, not an empty answer.
    if (gebied.error && enkel.error && bouwvlak.error && maatvoering.error) {
        return null;
    }

    const gebiedFeatures = gebied.features ?? [];
    const enkelFeatures = enkel.features ?? [];
    const bouwvlakFeatures = bouwvlak.features ?? [];
    const maatFeatures = maatvoering.features ?? [];

    // ⚠ GOVERNING PLAN — pick it from the SUBSTANTIVE layers (enkelbestemming / bouwvlak /
    // maatvoering), NOT from `bestemmingsplangebied`. A point sits under many plangebied polygons,
    // and the highest-status ones are usually THEMATIC overlays ("Parapluherziening",
    // "Algemene regels", "Herziening Parkeren") that carry NO bouwvlak/maatvoering. The detailed plan
    // that OWNS the buildable rule is the one whose enkelbestemming/bouwvlak/maatvoering features are
    // present here — so the governing dossier must come from those layers (verified 2026-07-26:
    // Groningen → NL.IMRO.0014.BP574BinnenstadGV, bouwhoogte 24 m, not the Parkeren overlay).
    const substantiveBags = [
        ...enkelFeatures.map((f) => f.properties),
        ...bouwvlakFeatures.map((f) => f.properties),
        ...maatFeatures.map((f) => f.properties),
    ];
    const governingDossier = pickGoverningDossier(substantiveBags);

    if (!governingDossier) {
        // No substantive bestemmingsplan feature at this point → honest empty (not a failure).
        return { plan: null };
    }

    const byDossier = (f) => !f.properties?.dossierid || f.properties.dossierid === governingDossier;

    // Bestemming (zone) from the governing enkelbestemming feature. `identificatie` is the
    // bestemmingsvlak (EP…) id — the KEY that ties a maatvoering to the exact zone the point sits in.
    const enkelForDossier = enkelFeatures.filter((f) => f.properties?.dossierid === governingDossier);
    const bestemmingNaam = enkelForDossier[0]?.properties?.naam ?? null;
    const bestemmingsvlakId = enkelForDossier[0]?.properties?.identificatie ?? null;
    // §NL-SPARSE-FALLBACK — carry the enkelbestemming (zone) FOOTPRINT too, not only its naam. A live
    // probe (Amsterdam/Rotterdam) showed `bouwvlak` is SPARSE: most parcels publish only an
    // enkelbestemming (the zone) + a maatvoering ON that zone, with NO separate bouwvlak. So the zone
    // polygon is the honest fallback footprint (an UPPER BOUND on the buildable extent, not a precise
    // buildable area). The client resolver uses it ONLY when no bouwvlak resolves. First
    // enkelbestemming feature for the governing dossier that carries geometry.
    const bestemmingsvlakGeom = enkelForDossier.find((f) => f.geometry)?.geometry ?? null;
    const bestemmingsvlak =
        bestemmingNaam || bestemmingsvlakGeom
            ? { naam: bestemmingNaam, geometrie: bestemmingsvlakGeom }
            : null;

    // Plan identity: prefer the matching plangebied feature (carries the human plan `naam`); else fall
    // back to the substantive feature's `plangebied` (versioned plan id) and the dossier id.
    const gebiedMatch = gebiedFeatures.find((f) => f.properties?.dossierid === governingDossier);
    const substantiveRef = enkelForDossier[0] ?? bouwvlakFeatures.find(byDossier) ?? maatFeatures.find(byDossier);
    const plan = {
        id:
            gebiedMatch?.properties?.identificatie ??
            substantiveRef?.properties?.plangebied ??
            governingDossier,
        naam: gebiedMatch?.properties?.naam ?? enkelForDossier[0]?.properties?.naam ?? null,
    };

    // Bouwvlak geometry (GeoJSON) from the governing plan's first bouwvlak feature with geometry.
    const bouwvlakForDossier = bouwvlakFeatures
        .filter((f) => f.properties?.dossierid === governingDossier)
        .find((f) => f.geometry);
    const bouwvlakOut = bouwvlakForDossier?.geometry ? { geometrie: bouwvlakForDossier.geometry } : null;

    // Maatvoeringen from the governing plan. ⚠ A point in a dense plan can catch SEVERAL maatvoering
    // polygons (e.g. a 26 m main mass + a 5 m ancillary area — observed at Utrecht). Picking one
    // arbitrarily would fabricate a number. So we TIE the maatvoering to the exact bestemmingsvlak the
    // point is in: a maatvoering's `bestemmingsvlak` field references the enkelbestemming `EP…` id, so
    // we keep only those referencing THIS point's bestemmingsvlak. That is a spatial-semantic join, not
    // a guess. If no maatvoering carries the reference (older plans), we fall back to the governing
    // plan's set (the resolver then takes the first clean value per kind, deterministically).
    let govMaatFeatures = maatFeatures.filter((f) => f.properties?.dossierid === governingDossier);
    if (bestemmingsvlakId) {
        const tied = govMaatFeatures.filter(
            (f) =>
                typeof f.properties?.bestemmingsvlak === 'string' &&
                f.properties.bestemmingsvlak.includes(bestemmingsvlakId),
        );
        if (tied.length > 0) govMaatFeatures = tied;
    }
    const maatvoeringen = [];
    for (const f of govMaatFeatures) {
        const mv = parsePdokMaatvoering(f.properties);
        if (mv) maatvoeringen.push(mv);
    }

    return { plan, bestemmingsvlak, bouwvlak: bouwvlakOut, maatvoeringen };
}

// ── handler ──────────────────────────────────────────────────────────────────

/**
 * `GET /api/nl/bestemmingsplan?lat=&lon=`
 *
 * 200 `{ plan, bestemmingsvlak, bouwvlak, maatvoeringen }` — the consolidated governing plan (or
 *     `{ plan: null }` when no plan covers the point). The client resolver reads the ring + numbers.
 * 502 `{ error }` — upstream failure / timeout (distinct from an empty answer, so the client returns
 *     `endpoint-unreachable`, never `no-plan`).
 * 400 — missing/invalid coordinates.
 */
export function makeNlBestemmingsplanHandler(deps = {}) {
    return async function nlBestemmingsplanHandler(req, res) {
        const lat = Number(req.query?.lat);
        const lon = Number(req.query?.lon);
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
            return res.status(400).json({ error: 'lat and lon query parameters (EPSG:4326) are required.' });
        }

        const key = cacheKey(lat, lon);
        const cached = cacheGet(key);
        if (cached !== undefined) {
            _hits++;
            res.setHeader('X-NL-BP-Cache', 'HIT');
            return res.status(200).json(cached);
        }
        _misses++;

        let body;
        try {
            body = await fetchNlBestemmingsplan(lat, lon, deps);
        } catch (err) {
            console.warn('[nl-bp-proxy] unexpected error:', err?.message ?? err);
            body = null;
        }

        if (body === null) {
            // A failure must never be cached and must never look like an empty answer.
            res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
            res.setHeader('X-NL-BP-Cache', 'MISS-UNREACHABLE');
            return res.status(502).json({
                error:
                    'The PDOK Ruimtelijke Plannen WMS did not answer. This is NOT a statement that the ' +
                    'parcel has no published bestemmingsplan.',
            });
        }

        cacheSet(key, body);
        res.setHeader('Cache-Control', 'public, max-age=86400');
        res.setHeader('X-NL-BP-Cache', 'MISS');
        return res.status(200).json(body);
    };
}

export const nlBestemmingsplanHandler = makeNlBestemmingsplanHandler();
