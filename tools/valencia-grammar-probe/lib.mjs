// VALÈNCIA GRAMMAR PROBE — shared transport.
//
// ⛔ METHOD INVARIANTS (see VALENCIA-GRAMMAR-HYPOTHESIS.md §Method). This service is the
// corpus's REFERENCE FALSE-NEGATIVE case: 0 features on `lon,lat`, 2 on `lat,lon` with an
// explicit CRS token. Therefore:
//   - ZERO FEATURES IS NOT ABSENCE. Every zero must be retried across the axis/CRS matrix
//     before it may be reported.
//   - MUNICIPALITY ATTRIBUTE FILTER, NEVER BBOX (round4 proved bbox hits neighbours).
//   - Outcomes are THREE-VALUED: COVERED / EMPTY / UNKNOWN. UNKNOWN never collapses to NO.
import fs from 'node:fs';
import path from 'node:path';

export const DIR = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
export const BASE = 'https://terramapas.icv.gva.es/0702_Planeamiento';
const UA =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';

// Single-flight, serialised, polite. This box is shared with other probes — network-bound only.
let lastCall = 0;
const MIN_GAP_MS = 120;

export async function get(u, timeoutMs = 120000) {
    const wait = Math.max(0, lastCall + MIN_GAP_MS - Date.now());
    if (wait) await new Promise((r) => setTimeout(r, wait));
    lastCall = Date.now();
    try {
        const r = await fetch(u, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(timeoutMs) });
        return { http: r.status, ok: r.ok, body: await r.text() };
    } catch (e) {
        return { http: null, ok: false, body: '', err: String(e.name || e) };
    }
}

export function owsException(body) {
    if (!body) return null;
    const m = body.match(/ExceptionText>([^<]{0,200})/) || body.match(/<ows:ExceptionText[^>]*>([^<]{0,200})/);
    if (m) return m[1].replace(/\s+/g, ' ').trim();
    if (/ServiceException/i.test(body)) {
        const s = body.match(/ServiceException[^>]*>([^<]{0,200})/);
        if (s) return s[1].replace(/\s+/g, ' ').trim();
    }
    return null;
}

/** Count `<gml:featureMember>` OR WFS-2 `<wfs:member>` envelopes. */
export function countMembers(body) {
    const a = (body.match(/<gml:featureMember>/g) || []).length;
    const b = (body.match(/<wfs:member>/g) || []).length;
    return Math.max(a, b);
}

/** Parse every feature's ms:* properties out of a MapServer GML payload. */
export function parseFeatures(body) {
    const out = [];
    const chunks = body.split(/<gml:featureMember>|<wfs:member>/).slice(1);
    for (const c of chunks) {
        const props = {};
        for (const m of c.matchAll(/<ms:([A-Za-z0-9_]+)>([^<]*)<\/ms:\1>/g)) {
            if (m[1] !== 'msGeometry') props[m[1]] = m[2];
        }
        // Capture self-closing / xsi:nil elements too — a NIL field is PRESENT-but-null, which is
        // a different fact from ABSENT, and §"populated is not present" turns on the distinction.
        for (const m of c.matchAll(/<ms:([A-Za-z0-9_]+)\s+[^>]*nil="true"\s*\/>/g)) {
            if (!(m[1] in props)) props[m[1]] = null;
        }
        for (const m of c.matchAll(/<ms:([A-Za-z0-9_]+)\s*\/>/g)) {
            if (!(m[1] in props)) props[m[1]] = null;
        }
        if (Object.keys(props).length) out.push(props);
    }
    return out;
}

/**
 * OGC 1.1 attribute filter — the ONLY sanctioned spatial-scoping mechanism here.
 * `bbox` is deliberately not offered by this module.
 */
export function ineFilter(ine, field = 'cod_ine_mun') {
    return `<Filter><PropertyIsEqualTo><PropertyName>${field}</PropertyName><Literal>${ine}</Literal></PropertyIsEqualTo></Filter>`;
}

export function featureUrl({ typename, filter, maxfeatures = 3, srsname = null, version = '1.1.0' }) {
    let u = `${BASE}?service=WFS&version=${version}&request=GetFeature&typename=${encodeURIComponent(typename)}`;
    if (filter) u += `&filter=${encodeURIComponent(filter)}`;
    if (maxfeatures != null) u += `&maxfeatures=${maxfeatures}`;
    if (srsname) u += `&srsname=${encodeURIComponent(srsname)}`;
    return u;
}

/**
 * ⛔ THE AXIS/CRS MATRIX — the anti-false-negative gate.
 *
 * Runs the same logical query across both CRS families (EPSG:4326 geographic vs EPSG:25830
 * projected UTM30N, plus the urn: form that carries explicit axis semantics) and, for bbox-shaped
 * inputs, both axis orders. A zero may only be reported as EMPTY when EVERY cell returns zero
 * with a successful HTTP+OWS response. Any cell failing ⇒ UNKNOWN.
 */
export const CRS_MATRIX = [
    { tag: 'none', srsname: null },
    { tag: 'EPSG:4326', srsname: 'EPSG:4326' },
    { tag: 'urn:4326', srsname: 'urn:ogc:def:crs:EPSG::4326' },
    { tag: 'EPSG:25830', srsname: 'EPSG:25830' },
    { tag: 'urn:25830', srsname: 'urn:ogc:def:crs:EPSG::25830' },
];

/**
 * Attribute-filtered fetch swept across the CRS matrix.
 * Returns { st: COVERED|EMPTY|UNKNOWN, n, feats, cells }.
 */
export async function sweepFeature({ typename, filter, maxfeatures = 3 }) {
    const cells = [];
    let best = null;
    for (const c of CRS_MATRIX) {
        const u = featureUrl({ typename, filter, maxfeatures, srsname: c.srsname });
        const r = await get(u);
        const exc = owsException(r.body);
        if (!r.ok || exc) {
            cells.push({ crs: c.tag, st: 'UNKNOWN', why: exc || `HTTP ${r.http ?? r.err}` });
            continue;
        }
        const n = countMembers(r.body);
        cells.push({ crs: c.tag, st: n ? 'COVERED' : 'EMPTY', n });
        if (n && !best) best = { n, feats: parseFeatures(r.body) };
    }
    if (best) return { st: 'COVERED', n: best.n, feats: best.feats, cells };
    // No cell returned data. EMPTY only if every cell SUCCEEDED and returned zero.
    const allClean = cells.length > 0 && cells.every((c) => c.st === 'EMPTY');
    return { st: allClean ? 'EMPTY' : 'UNKNOWN', n: 0, feats: [], cells };
}

/**
 * CQL transport — the WORKING attribute-scoping mechanism (established in 02-filter-forms).
 *
 * ⚠ The OGC-Filter form on `cod_ine_mun` that round4 used fails server-side on this service
 * (`FLTApplyFilterToLayer() failed msPostGISLayerWhichShapes(): Query error`) for EVERY
 * municipality, including the known-positive control. It is a TRANSPORT DEFECT, not absence.
 * An OGC filter on `noms_mun` works, and CQL on `cod_ine_mun` works — so the defect is specific
 * to the OGC-Filter/cod_ine_mun pairing, and any earlier run that read that error as "no data"
 * would have recorded a FALSE NEGATIVE.
 */
export function cqlUrl({ typename, cql, count = 3, srsname = null, version = '1.1.0', hits = false }) {
    const tnParam = version === '2.0.0' ? 'typenames' : 'typename';
    let u = `${BASE}?service=WFS&version=${version}&request=GetFeature&${tnParam}=${encodeURIComponent(typename)}`;
    if (cql) u += `&CQL_FILTER=${encodeURIComponent(cql)}`;
    if (count != null && !hits) u += version === '2.0.0' ? `&count=${count}` : `&maxfeatures=${count}`;
    if (srsname) u += `&srsname=${encodeURIComponent(srsname)}`;
    if (hits) u += '&resultType=hits';
    return u;
}

/** Exact feature count via resultType=hits. Immune to maxfeatures truncation. */
export async function cqlHits(typename, cql) {
    const r = await get(cqlUrl({ typename, cql, hits: true, version: '2.0.0' }), 180000);
    const exc = owsException(r.body);
    if (!r.ok || exc) return { st: 'UNKNOWN', why: exc || `HTTP ${r.http ?? r.err}` };
    const m = r.body.match(/numberMatched="(\d+)"/) || r.body.match(/numberOfFeatures="(\d+)"/);
    if (!m) return { st: 'UNKNOWN', why: 'no count attribute', snip: r.body.slice(0, 200) };
    return { st: 'OK', n: Number(m[1]) };
}

/** CQL fetch swept across the CRS matrix — same anti-false-negative gate as sweepFeature. */
export async function cqlSweep({ typename, cql, count = 3 }) {
    const cells = [];
    let best = null;
    for (const c of CRS_MATRIX) {
        const r = await get(cqlUrl({ typename, cql, count, srsname: c.srsname }));
        const exc = owsException(r.body);
        if (!r.ok || exc) {
            cells.push({ crs: c.tag, st: 'UNKNOWN', why: (exc || `HTTP ${r.http ?? r.err}`).slice(0, 120) });
            continue;
        }
        const n = countMembers(r.body);
        cells.push({ crs: c.tag, st: n ? 'COVERED' : 'EMPTY', n });
        if (n && !best) best = { n, feats: parseFeatures(r.body) };
    }
    if (best) return { st: 'COVERED', n: best.n, feats: best.feats, cells };
    const allClean = cells.length > 0 && cells.every((c) => c.st === 'EMPTY');
    return { st: allClean ? 'EMPTY' : 'UNKNOWN', n: 0, feats: [], cells };
}

export function save(name, obj) {
    fs.writeFileSync(path.join(DIR, name), JSON.stringify(obj, null, 1));
}
export function load(name) {
    return JSON.parse(fs.readFileSync(path.join(DIR, name), 'utf8'));
}
