// §MUC-INSTRUMENT-PROXY (L-658) — WHICH PLANNING INSTRUMENT GOVERNS THIS POINT, ANYWHERE IN
// CATALONIA.
//
// ─────────────────────────────────────────────────────────────────────────────
// WHY THIS EXISTS — it turns "we don't know what governs here" into a citation.
// ─────────────────────────────────────────────────────────────────────────────
// `mucZoningProxy.js` answers *what is this land qualified as?* for all 947 Catalan
// municipalities. It does not answer *which plan says so?* — and outside the handful of
// municipalities PRYZM has registered, that second question is the whole refusal. A refusal
// that says "PRYZM holds no ordinance for this municipality" is a statement about PRYZM;
// one that says "the instrument that governs this land is the POUM, expedient 2016/062086/N,
// here is its record in the Registre de Planejament Urbanístic de Catalunya" is a statement
// about the world, and it is the difference between a gap and an answer.
//
// ─────────────────────────────────────────────────────────────────────────────
// THE SOURCE — probed live 2026-07-31, real response bodies, not documentation.
// ─────────────────────────────────────────────────────────────────────────────
// No machine-readable API was located on the RPUC portal itself. What WAS located is better
// for this purpose: the MUC publishes a SPATIAL INDEX INTO the RPUC. Layer
// `MUC:MUCVW_AMBIT_PG_INE` (*àmbit del planejament general*) is a polygon per general-planning
// expedient. `DescribeFeatureType` gives its schema verbatim:
//
//     EXPEDIENT    the RPUC file number, e.g. '2001 / 001092 / G'
//     TIPUS        the instrument type in Catalan   ⚠ TRUNCATED TO 40 CHARACTERS by the source
//     CODI_INE     the municipality it was FILED under   ⚠⚠ NOT the territory it governs
//     ACCES_RPUC   a deep link to the RPUC record (present on 8 396 / 8 396 rows)
//
// MEASURED STATEWIDE: 8 396 expedients across 935 of the 947 municipalities (98.7 %). The 12
// with none: 08237, 17043, 17061, 17099, 17125, 17201, 25045, 25063, 25104, 25152, 25197, 25913.
//
// ⚠⚠ THE TRAP THIS FILE EXISTS TO AVOID — `CODI_INE` IS THE FILING MUNICIPALITY. Verified by
// re-fetching the geometries from WFS and measuring their own extents (EPSG:25831), which is an
// INDEPENDENT source from the field name:
//
//     '1985 / 000604 / B'  CODI_INE 08015 (Badalona)  →  ≈ 32 × 34 km, spans Barcelona
//     '2018 / 067068 / C'  CODI_INE 43004             →  ≈ 265 × 258 km, ALL OF CATALONIA
//     '2001 / 001092 / G'  CODI_INE 17079 (Girona)    →  ≈ 9.4 × 10 km, genuinely municipal
//
// Filtering by `CODI_INE` would therefore attribute metropolitan PGM modifications to Badalona
// alone and hide them everywhere else. **Point-in-polygon on the àmbit geometry is the only sound
// filter** — the same §MUC-ONE-CONTAINER-OR-REFUSE discipline `mucZoningProxy.js` already applies,
// and `geometryContainsPoint` is IMPORTED from there rather than restated, so the two proxies
// cannot drift.
//
// `CODI_INE` is kept as a CORROBORATING signal only: a containing general-plan expedient whose
// filing INE equals the point's own municipality is marked `confirmed: true`; one whose INE differs
// is reported with `confirmed: false` and is NEVER claimed to govern. Naming the wrong instrument
// is a wrong-jurisdiction answer, which is worse than admitting we do not know.
//
// ⚠ AXIS ORDER. GeoServer stamps this response `urn:ogc:def:crs:EPSG::4326`, whose formal axis
// order is lat,lon — but the coordinates it actually emits here are lon,lat (verified: a Girona
// ring begins `[2.8975, 41.985]`). We query in `CRS:84`, which is unambiguously lon,lat, and read
// the geometry as lon,lat. Do NOT "fix" this by swapping: a bare 4326 bbox against a projected
// layer on this server returns SILENTLY EMPTY, which is the failure that looks like an answer.
//
// §CONTEXT-DATA-HONESTY (L-422/457/467/469) — a FETCH FAILURE and a GENUINE EMPTY are DIFFERENT
// VALUES and this endpoint never merges them. `instrumentLookup` is one of `resolved` /
// `no-base-instrument-registered` / `unresolved`, and the middle value is a real, durable fact:
// Barcelona genuinely has no base instrument in this register, because the PGM-1976 predates it.

import express from 'express';
import {
    MUC_WMS_ENDPOINT,
    MUC_QUERY_HALF_DEG,
    MUC_UPSTREAM_TIMEOUT_MS,
    geometryContainsPoint,
} from './mucZoningProxy.js';

export const MUC_INSTRUMENT_PATH = '/api/muc/instrument';

/** The *àmbit del planejament general* layer — the spatial index into the RPUC. */
export const MUC_AMBIT_PG_LAYER = 'MUCVW_AMBIT_PG_INE';

/** The *terme municipal* layer — 969 polygons over the 947 Catalan municipalities. */
export const MUC_TERME_MUNICIPAL_LAYER = 'MUCVW_MUCS_TM';

/**
 * How many candidate expedients to ask for.
 *
 * ⚠ HIGHER THAN THE ZONING PROXY'S 10, DELIBERATELY. Measured worst case at Lleida's centre was
 * 12 containing features and the register stacks decades of modifications on dense urban land, so
 * a low cap would silently TRUNCATE the candidate set — and the base instrument is not guaranteed
 * to sort first. Truncation here does not fail loudly; it produces a confident
 * `no-base-instrument-registered` on a municipality that has one.
 */
export const MUC_INSTRUMENT_FEATURE_COUNT = 60;

/** Planning instruments change on the order of years — a long TTL is honest and polite (C57 §7.2). */
export const MUC_INSTRUMENT_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const MUC_INSTRUMENT_CACHE_MAX_ENTRIES = 512;

// ── cache ────────────────────────────────────────────────────────────────────
const _cache = new Map();
let _hits = 0;
let _misses = 0;

export function __resetMucInstrumentCache() {
    _cache.clear();
    _hits = 0;
    _misses = 0;
}
export function mucInstrumentCacheStats() {
    return { size: _cache.size, hits: _hits, misses: _misses };
}

function cacheKey(lat, lon) {
    return `${lat.toFixed(5)},${lon.toFixed(5)}`;
}

function cacheGet(key) {
    const e = _cache.get(key);
    if (!e) return null;
    if (Date.now() > e.expiresAt) {
        _cache.delete(key);
        return null;
    }
    return e.value;
}

function cacheSet(key, value, ttlMs = MUC_INSTRUMENT_CACHE_TTL_MS) {
    if (_cache.size >= MUC_INSTRUMENT_CACHE_MAX_ENTRIES) {
        const oldest = _cache.keys().next().value;
        if (oldest !== undefined) _cache.delete(oldest);
    }
    _cache.set(key, { value, expiresAt: Date.now() + ttlMs });
}

// ── the TIPUS taxonomy ───────────────────────────────────────────────────────

/**
 * Normalise a `TIPUS` string for matching: strip diacritics, unify apostrophes, lowercase,
 * collapse whitespace.
 *
 * ⚠ MATCHING MUST BE BY PREFIX, NEVER BY EQUALITY. The source column is 40 characters wide and
 * truncates: the register literally returns `"Modificació pla ordenació urbanística mu"` and
 * `"Revisió pla d'ordenació urbanística muni"`. An equality table built from a documentation page
 * would match nothing at all, and the failure would look like "no instrument here".
 */
export function normaliseTipus(tipus) {
    if (typeof tipus !== 'string') return '';
    return (
        tipus
            .normalize('NFD')
            // U+0300–U+036F = the combining diacritical marks NFD just split off. Written as
            // ESCAPES on purpose: a literal range of combining marks in source is invisible, and
            // any editor that re-normalises the file to NFC would silently delete the range.
            .replace(/[\u0300-\u036f]/g, '')
            // Unify the three apostrophes the register mixes ('  ’  ´) so `d'ordenacio` matches.
            .replace(/[\u2018\u2019\u00b4`]/g, "'")
            .toLowerCase()
            .replace(/\s+/g, ' ')
            .trim()
    );
}

/**
 * What kind of planning instrument a `TIPUS` names.
 *
 *   `general-plan`   the BASE municipal general planning instrument — the thing that governs.
 *   `modification`   a *modificació* of one. Real and in force, but not the base instrument.
 *   `supramunicipal` a Pla Director Urbanístic or a Pla Territorial — governs, but not as the
 *                    municipality's general plan, and often across the whole of Catalonia.
 *   `programme`      a *programa d'actuació urbanística* — a delivery programme, not the plan.
 *   `unclassified`   NOT IN THE TABLE. Deliberately its own value and never folded into any of the
 *                    above: a `TIPUS` this file does not recognise must not be silently promoted
 *                    to "the governing plan", nor silently dropped as noise.
 */
const TIPUS_RULES = [
    // ⚠ FIRST, and it must stay first: "Modificació del pla director urbanístic" and
    // "Modificació delimitació de sòl urbà" both start with a token that appears below.
    { prefix: 'modificacio', kind: 'modification', family: 'Modificació' },
    { prefix: 'revisio programa actuacio', kind: 'programme', family: "Revisió del programa d'actuació" },
    { prefix: "programa d'actuacio urbanistica", kind: 'programme', family: "Programa d'actuació urbanística" },
    { prefix: 'programa actuacio urbanistica', kind: 'programme', family: "Programa d'actuació urbanística municipal" },
    { prefix: 'pla director urbanistic', kind: 'supramunicipal', family: 'Pla Director Urbanístic' },
    { prefix: 'pla territorial', kind: 'supramunicipal', family: 'Pla Territorial general o sectorial' },
    // ── the BASE general-planning families ──
    { prefix: "revisio pla d'ordenacio urbanistica", kind: 'general-plan', family: "Pla d'Ordenació Urbanística Municipal (POUM), revisió" },
    { prefix: "pla d'ordenacio urbanistica municipal", kind: 'general-plan', family: "Pla d'Ordenació Urbanística Municipal (POUM)" },
    { prefix: 'revisio pla general ordenacio urbana', kind: 'general-plan', family: "Pla General d'Ordenació Urbana Municipal (PGOU), revisió" },
    { prefix: "revisio pla general d'ordenacio urbana", kind: 'general-plan', family: "Pla General d'Ordenació Urbana Municipal (PGOU), revisió" },
    { prefix: "pla general d'ordenacio urbana", kind: 'general-plan', family: "Pla General d'Ordenació Urbana (PGOU)" },
    { prefix: 'revisio-adaptacio normes subsidiaries', kind: 'general-plan', family: 'Normes Subsidiàries de planejament, revisió-adaptació' },
    { prefix: 'normes subsidiaries', kind: 'general-plan', family: 'Normes Subsidiàries de planejament' },
    { prefix: 'normes de planejament urbanistic', kind: 'general-plan', family: 'Normes de Planejament Urbanístic' },
    { prefix: 'normes complementaries', kind: 'general-plan', family: 'Normes Complementàries' },
    { prefix: 'text refos normes urbanist', kind: 'general-plan', family: 'Text refós de les normes urbanístiques del planejament general' },
    { prefix: 'delimitacio de sol urba', kind: 'general-plan', family: 'Delimitació de sòl urbà' },
];

/**
 * Classify a `TIPUS` value. Pure; never throws.
 *
 * Returns `{ kind, family }`. An unrecognised value yields `kind: 'unclassified'` and
 * `family: null` — NOT a guess. See the note on `unclassified` above for why that matters.
 */
export function classifyInstrumentTipus(tipus) {
    const n = normaliseTipus(tipus);
    if (n.length === 0) return { kind: 'unclassified', family: null };
    for (const r of TIPUS_RULES) {
        if (n.startsWith(r.prefix)) return { kind: r.kind, family: r.family };
    }
    return { kind: 'unclassified', family: null };
}

/**
 * The RPUC `codiPublic` an expedient's rows share.
 *
 * Girona returns BOTH `'2001 / 001092 / G'` and `'2001 / 001092 / G / 00037'` as separate
 * containing rows of the same plan; both `ACCES_RPUC` links carry the identical
 * `codiPublic=2001/001092/G`. Deduplicating on the raw `EXPEDIENT` would report one plan twice and
 * — worse — make a single-instrument municipality look ambiguous. Pure; never throws.
 */
export function rpucCodiPublic(expedient) {
    if (typeof expedient !== 'string') return null;
    const parts = expedient
        .split('/')
        .map((p) => p.trim())
        .filter((p) => p.length > 0);
    if (parts.length < 3) return null;
    return parts.slice(0, 3).join('/');
}

// ── upstream ─────────────────────────────────────────────────────────────────

/** Build a `GetFeatureInfo` URL for a WGS84 point. `CRS:84` is unambiguously lon,lat. */
export function buildInstrumentInfoUrl(layer, lat, lon, featureCount, halfDeg = MUC_QUERY_HALF_DEG) {
    const r = (n) => Number(n.toFixed(7));
    const qs = new URLSearchParams({
        service: 'WMS',
        version: '1.3.0',
        request: 'GetFeatureInfo',
        layers: layer,
        query_layers: layer,
        crs: 'CRS:84',
        bbox: `${r(lon - halfDeg)},${r(lat - halfDeg)},${r(lon + halfDeg)},${r(lat + halfDeg)}`,
        width: '3',
        height: '3',
        i: '1',
        j: '1',
        info_format: 'application/json',
        feature_count: String(featureCount),
    });
    return `${MUC_WMS_ENDPOINT}?${qs.toString()}`;
}

/**
 * Fetch one layer's GeoJSON at a point.
 *
 * ⚠ RETURNS `null` FOR A FAILURE AND `{ features: [] }` FOR A GENUINE EMPTY. Those are different
 * values and every caller below branches on the difference. A service-exception body (this WMS
 * answers XML `ServiceExceptionReport` on a bad request) is a FAILURE, never "nothing here".
 */
async function fetchLayerAtPoint(layer, lat, lon, featureCount, deps) {
    const fetchImpl = deps.fetchImpl || fetch;
    const timeoutMs = deps.timeoutMs || MUC_UPSTREAM_TIMEOUT_MS;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
        const res = await fetchImpl(buildInstrumentInfoUrl(layer, lat, lon, featureCount), {
            headers: {
                Accept: 'application/json',
                'User-Agent': 'PRYZM-MUC-Instrument-Proxy/1.0 (+https://pryzm.fly.dev)',
            },
            signal: ctrl.signal,
        });
        if (!res.ok) {
            console.warn(`[muc-instrument] ${layer} HTTP ${res.status} — unresolved.`);
            return null;
        }
        const text = await res.text();
        try {
            const json = JSON.parse(text);
            return Array.isArray(json?.features) ? json : null;
        } catch {
            console.warn(`[muc-instrument] ${layer} returned non-JSON (service exception?) — unresolved.`);
            return null;
        }
    } catch (err) {
        console.warn(`[muc-instrument] ${layer} failed:`, err?.message ?? err);
        return null;
    } finally {
        clearTimeout(timer);
    }
}

/**
 * §MUC-ONE-CONTAINER-OR-REFUSE, applied to the municipality — pick the ONE *terme municipal*
 * polygon that contains the point, or refuse.
 *
 * Refuses on zero (outside Catalonia, or at sea) AND on more than one (a point exactly on a
 * municipal boundary is genuinely ambiguous). The municipality is what the whole refusal is
 * addressed to, so guessing it would mis-address every sentence that follows.
 */
export function selectMunicipality(featureCollection, lon, lat) {
    const features = Array.isArray(featureCollection?.features) ? featureCollection.features : [];
    const containing = features.filter((f) => geometryContainsPoint(f?.geometry, lon, lat));
    if (containing.length !== 1) return null;
    const p = containing[0]?.properties ?? {};
    const ine = typeof p.CODI_INE === 'string' ? p.CODI_INE.trim() : '';
    if (ine === '') return null;
    return {
        ineCode: ine,
        municipalityName: typeof p.MUNICIPI === 'string' ? p.MUNICIPI : null,
    };
}

/**
 * Resolve the governing instrument from the register's containing expedients.
 *
 * THE RULE, and why each clause is here:
 *   1. Keep only expedients whose àmbit POLYGON CONTAINS the point. `CODI_INE` is not a filter —
 *      see the header on why filtering by it would hide every metropolitan instrument.
 *   2. Classify each by `TIPUS`; deduplicate on the RPUC `codiPublic`.
 *   3. Among the `general-plan` ones, prefer those whose filing INE MATCHES the point's
 *      municipality — those are `confirmed`. If exactly one distinct plan is confirmed, that is
 *      the governing instrument.
 *   4. If none is confirmed but one general-plan expedient contains the point, report it with
 *      `confirmed: false`. It is evidence, not an attribution.
 *   5. If several confirmed plans tie, report the FIRST and mark `ambiguous` — the caller must not
 *      be handed one of several as though it were the answer.
 *   6. Otherwise `null` with `no-base-instrument-registered`, which is a REAL fact (Barcelona).
 */
export function selectGoverningInstrument(featureCollection, lon, lat, municipalityIne) {
    const features = Array.isArray(featureCollection?.features) ? featureCollection.features : [];
    const containing = features.filter((f) => geometryContainsPoint(f?.geometry, lon, lat));

    const seen = new Set();
    const rows = [];
    for (const f of containing) {
        const p = f?.properties ?? {};
        const expedient = typeof p.EXPEDIENT === 'string' ? p.EXPEDIENT.trim() : '';
        if (expedient === '') continue;
        const codi = rpucCodiPublic(expedient) ?? expedient;
        const tipus = typeof p.TIPUS === 'string' ? p.TIPUS.trim() : '';
        const filedUnderIne = typeof p.CODI_INE === 'string' ? p.CODI_INE.trim() || null : null;
        const key = `${codi}|${filedUnderIne ?? ''}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const { kind, family } = classifyInstrumentTipus(tipus);
        rows.push({
            expedient,
            codiPublic: codi,
            tipus,
            family,
            kind,
            filedUnderIne,
            rpucUrl: typeof p.ACCES_RPUC === 'string' && p.ACCES_RPUC.trim() ? p.ACCES_RPUC.trim() : null,
            confirmed: filedUnderIne !== null && filedUnderIne === municipalityIne,
        });
    }

    const generals = rows.filter((r) => r.kind === 'general-plan');
    const confirmed = generals.filter((r) => r.confirmed);
    const distinctConfirmed = new Set(confirmed.map((r) => r.codiPublic));

    let governing = null;
    let outcome = 'no-base-instrument-registered';
    let ambiguous = false;
    if (distinctConfirmed.size === 1) {
        governing = confirmed[0];
        outcome = 'resolved';
    } else if (distinctConfirmed.size > 1) {
        governing = confirmed[0];
        outcome = 'resolved';
        ambiguous = true;
    } else if (generals.length > 0) {
        governing = generals[0];
        outcome = 'resolved';
    }

    return {
        outcome,
        ambiguous,
        governingInstrument: governing
            ? {
                  expedient: governing.expedient,
                  tipus: governing.family ?? governing.tipus,
                  tipusRaw: governing.tipus,
                  filedUnderIne: governing.filedUnderIne,
                  rpucUrl: governing.rpucUrl,
                  confirmed: governing.confirmed,
              }
            : null,
        /** Every containing expedient, classified. Diagnostics + provenance; never a constraint. */
        allContaining: rows,
    };
}

/**
 * Resolve the municipality + governing instrument at a point. NEVER throws.
 *
 * Each half degrades INDEPENDENTLY: a failed municipality lookup does not turn a successful
 * instrument lookup into an absence, and vice versa. Collapsing them would be the exact
 * failure≠empty conflation this file's header forbids.
 */
export async function fetchInstrumentAtPoint(lat, lon, deps = {}) {
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;

    const [tmJson, pgJson] = await Promise.all([
        fetchLayerAtPoint(MUC_TERME_MUNICIPAL_LAYER, lat, lon, 5, deps),
        fetchLayerAtPoint(MUC_AMBIT_PG_LAYER, lat, lon, MUC_INSTRUMENT_FEATURE_COUNT, deps),
    ]);

    const municipality = tmJson === null ? null : selectMunicipality(tmJson, lon, lat);
    const municipalityLookup =
        tmJson === null ? 'unresolved' : municipality ? 'resolved' : 'no-municipality-at-point';

    if (pgJson === null) {
        return {
            municipality,
            municipalityLookup,
            instrumentLookup: 'unresolved',
            governingInstrument: null,
            ambiguous: false,
            allContaining: [],
        };
    }

    const sel = selectGoverningInstrument(pgJson, lon, lat, municipality?.ineCode ?? null);
    return {
        municipality,
        municipalityLookup,
        instrumentLookup: sel.outcome,
        governingInstrument: sel.governingInstrument,
        ambiguous: sel.ambiguous,
        allContaining: sel.allContaining,
    };
}

// ── handler ──────────────────────────────────────────────────────────────────

/**
 * `GET /api/muc/instrument?lat=&lon=`
 *
 * 200 `{ municipality, municipalityLookup, instrumentLookup, governingInstrument, … }`
 * 400 — missing/invalid coordinates.
 *
 * ⚠ NEVER 404s AND NEVER RETURNS A BARE `null`. Every outcome is a NAMED value, because the caller
 * has to render a different refusal for "the register says there is no base instrument" than for
 * "we could not ask". A `null` body would force the client to invent that distinction, and it
 * would invent it wrong.
 */
export function makeMucInstrumentHandler(deps = {}) {
    return async function mucInstrumentHandler(req, res) {
        const lat = Number(req.query?.lat);
        const lon = Number(req.query?.lon);
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
            return res.status(400).json({ error: 'lat and lon query parameters are required.' });
        }

        const key = cacheKey(lat, lon);
        const cached = cacheGet(key);
        if (cached !== null) {
            _hits++;
            res.setHeader('X-Muc-Instrument-Cache', 'HIT');
            return res.status(200).json(cached);
        }
        _misses++;

        const result = await fetchInstrumentAtPoint(lat, lon, deps);
        if (!result) {
            res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
            res.setHeader('X-Muc-Instrument-Cache', 'MISS-UNRESOLVED');
            return res.status(200).json({
                municipality: null,
                municipalityLookup: 'unresolved',
                instrumentLookup: 'unresolved',
                governingInstrument: null,
                ambiguous: false,
                allContaining: [],
                detail:
                    'PRYZM could not resolve the planning instrument at this point. This is NOT a ' +
                    'statement that no instrument governs it.',
            });
        }

        // ⚠ A FAILURE IS NEVER CACHED — caching it would make one outage look like a durable fact
        // for a week, which is exactly how a transient failure becomes a published absence.
        if (result.instrumentLookup === 'unresolved' || result.municipalityLookup === 'unresolved') {
            res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
            res.setHeader('X-Muc-Instrument-Cache', 'MISS-UNRESOLVED');
            return res.status(200).json(result);
        }

        cacheSet(key, result);
        res.setHeader('Cache-Control', 'public, max-age=86400');
        res.setHeader('X-Muc-Instrument-Cache', 'MISS');
        return res.status(200).json(result);
    };
}

export const mucInstrumentHandler = makeMucInstrumentHandler();

export const mucInstrumentRouter = express.Router();
mucInstrumentRouter.get(MUC_INSTRUMENT_PATH, mucInstrumentHandler);
