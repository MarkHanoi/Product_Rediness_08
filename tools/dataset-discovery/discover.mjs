#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// STAGE 0 — DATASET DISCOVERY · THE PROBE RUNNER AND CLI
//
// WHY THIS EXISTS
// ---------------
// Three authoritative datasets were found BY HAND in 48 hours, each after we had already started
// building the thing it made unnecessary:
//   • `Murcia:pgou_alineaciones`  — published block-level alignment polygons; a street-width
//                                   capability was nearly built on a dissolve instead.
//   • `Murcia:pgou_eje_comercial` — published, never queried; a live 0.7 % refusal rate that is
//                                   pure engineering, not missing data.
//   • `idecordoba:manzana`        — 20,730 published blocks, found while planning a cadastral
//                                   dissolve engine. ADR-0283 makes it the primary and the dissolve
//                                   the fallback.
// *"PRYZM currently discovers datasets manually. That does not scale."* — the founder. This tool is
// the mechanisation: **discover datasets before engineers invent geometry.**
//
// WHAT IT IS NOT
// --------------
// ⚠ It PROPOSES. It never resolves, never binds, never publishes. Every candidate variable it emits
// carries `status: 'candidate'` and every record carries `publishable: 'not-assessed-by-discovery'`
// (ADR-0288). A human and the ordinance dispose.
//
// PROBE DISCIPLINE (PROBE-DISCIPLINE.md · L-422/457/467/469)
// ---------------------------------------------------------
// Every HTTP call produces a ProbeRecord with url · httpStatus · contentType · bytes · ms · outcome.
// A 403 / 499 / timeout / DNS failure is `UNKNOWN`, never "no data", and never a zero. Feature
// counts are never reported as 0 unless the axis-order ladder has exhausted every form.
//
// USAGE
//   node discover.mjs --city cordoba                    # live probe, capabilities only (cheap)
//   node discover.mjs --city cordoba --deep 25          # + schema & count probes on the top 25
//   node discover.mjs --city murcia --deep 25 --out reports/
//   node discover.mjs --city cordoba --offline          # replay fixtures/, zero network
//   node discover.mjs --endpoints wfs=https://…/wfs --centroid 37.8882,-4.7794 --name "Ad hoc"
//
// LAYERING: a discovery/inspection tool, NOT a layered package — no OTel span, mirroring
// `tools/city-completion/computeScorecard.mjs` and `tools/context-bake/`.
// ─────────────────────────────────────────────────────────────────────────────
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseWfsCapabilities, parseWmsCapabilities, parseArcgisService, parseDescribeFeatureType, parseHits } from './capabilities.mjs';
import {
    classifyLayer, bboxToWgs84, verifyLocality, sanitiseWgs84Bbox, toEvidenceRegisterRows,
    epsgCodeOf, wgs84ToUtmEtrs89, CLASSIFIER_VERSION,
} from './classify.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
export const PROTOCOL_VERSION = '1.0';

// ═════════════════════════════════════════════════════════════════════════════
// §PUBLISHER REGISTRY — DECLARED, NEVER INFERRED FROM A HOSTNAME.
//
// ⚠ This registry is the second half of the GMU defence. The first half is geometric (reproject the
// extent); this half is institutional (who IS this publisher, and are they competent for planning
// in this municipality?). Inferring competence from a URL that "looks municipal" is precisely the
// reasoning that read `GMU_Services` as Gerencia Municipal de Urbanismo.
//
// `competentForPlanning: null` means UNKNOWN — an unlisted publisher is not scored 0, it is scored
// `null`, and the legal-authority axis reports itself as a lower bound.
// ═════════════════════════════════════════════════════════════════════════════
export const PUBLISHERS = {
    'ayto-cordoba': {
        label: 'Ayuntamiento de Córdoba (IDE Córdoba)',
        competentForPlanning: true,
        note: 'Municipal. Competent for planning — but its GeoServer carries NO calificación (measured 2026-08-02).',
    },
    'coaco': {
        label: 'Colegio Oficial de Arquitectos de Córdoba (COACo PGOU viewer)',
        competentForPlanning: false,
        note: '⚠ A PROFESSIONAL BODY, NOT THE PLANNING AUTHORITY. Its 2-district pilot is hand-traced '
            + '(heterogeneous coordinate precision, no Esri artefacts). Readable ≠ authoritative.',
    },
    'ayto-murcia': {
        label: 'Ayuntamiento de Murcia (geoserver.murcia.es)',
        competentForPlanning: true,
        note: 'Municipal. Publishes pgou_alineaciones — the SIG-MU2 street-width input.',
    },
};

// ═════════════════════════════════════════════════════════════════════════════
// §MUNICIPALITY REGISTRY — the Stage-0 input. A city is a centroid + declared endpoints + the
// candidate-host patterns to sweep. Adding a city is a data edit, not a code change.
// ═════════════════════════════════════════════════════════════════════════════
export const MUNICIPALITIES = {
    cordoba: {
        name: 'Córdoba', cc: 'es', ineCode: '14021', jurisdictionId: 'es-an-14021-cordoba',
        centroid: { lat: 37.8882, lon: -4.7794 },
        endpoints: [
            { id: 'ide-cordoba-wfs', service: 'WFS', publisher: 'ayto-cordoba', url: 'https://ide.cordoba.es/geoserver/wfs' },
            { id: 'ide-cordoba-wms', service: 'WMS', publisher: 'ayto-cordoba', url: 'https://ide.cordoba.es/geoserver/wms' },
            { id: 'coaco-wfs', service: 'WFS', publisher: 'coaco', url: 'https://geoserver.pgou.coacordoba.org/geoserver/wfs' },
        ],
        // Hosts to sweep in `--sweep` mode. A DNS failure here is recorded as `ERR`, never as
        // "no service exists" — six of these did not resolve on 2026-08-02 and that is a fact
        // about DNS, not about Córdoba's data.
        candidateHosts: [
            'ide.cordoba.es', 'www.cordoba.es', 'sig.cordoba.es', 'geoportal.cordoba.es',
            'cartografia.cordoba.es', 'www.gmucordoba.es', 'sig.gmucordoba.es', 'geoportal.gmucordoba.es',
        ],
    },
    murcia: {
        name: 'Murcia', cc: 'es', ineCode: '30030', jurisdictionId: 'es-mc-30030-murcia',
        centroid: { lat: 37.9838, lon: -1.1280 },
        endpoints: [
            { id: 'murcia-wfs', service: 'WFS', publisher: 'ayto-murcia', url: 'https://geoserver.murcia.es/geoserver/wfs' },
            { id: 'murcia-wms', service: 'WMS', publisher: 'ayto-murcia', url: 'https://geoserver.murcia.es/geoserver/wms' },
        ],
        candidateHosts: ['geoserver.murcia.es', 'urbanismo.murcia.es', 'sig.murcia.es'],
    },
};

/** The standard OGC/ArcGIS discovery paths appended to a candidate host in `--sweep` mode. */
export const SWEEP_PATHS = [
    { service: 'WFS', path: '/geoserver/wfs?service=WFS&version=2.0.0&request=GetCapabilities' },
    { service: 'WMS', path: '/geoserver/wms?service=WMS&version=1.3.0&request=GetCapabilities' },
    { service: 'WFS', path: '/wfs?service=WFS&version=2.0.0&request=GetCapabilities' },
    { service: 'WMS', path: '/wms?service=WMS&version=1.3.0&request=GetCapabilities' },
    { service: 'ArcGIS', path: '/arcgis/rest/services?f=json' },
    { service: 'ArcGIS', path: '/server/rest/services?f=json' },
    { service: 'OGCAPI', path: '/ogcapi/collections?f=json' },
];

/**
 * §HOST-SWEEP — candidate hosts for a municipality with NO declared endpoints.
 *
 * ⚠ THIS IS THE COLD-START PATH, and it is where the residual false-negative surface lives. A
 * municipality whose service uses a naming convention absent from this list reads as `Unknown` —
 * NEVER as `No`. That asymmetry is the whole point: guessing wrong about a host name must not
 * become a claim about a city's data (ADR-0290).
 *
 * Conventions are drawn from the Spanish municipal web estate: `{slug}.es` for the corporation,
 * and the `ide`/`sig`/`geoportal`/`cartografia` prefixes for its spatial-data infrastructure.
 */
export function candidateHostsFor(name, extra = []) {
    const slug = String(name)
        .normalize('NFD').replace(/[̀-ͯ]/g, '')
        .toLowerCase()
        .replace(/\([^)]*\)/g, '')
        .split('/')[0]
        .replace(/[^a-z0-9]+/g, '');
    if (!slug) return [...extra];
    const hosts = [
        `www.${slug}.es`, `${slug}.es`,
        `www.ayto${slug}.es`, `www.ayuntamiento${slug}.es`, `www.ayt2${slug}.es`,
        `ide.${slug}.es`, `sig.${slug}.es`, `geoportal.${slug}.es`,
        `cartografia.${slug}.es`, `mapas.${slug}.es`, `geoserver.${slug}.es`, `visor.${slug}.es`,
    ];
    return [...new Set([...extra, ...hosts])];
}

/**
 * Sweep candidate hosts for OGC/ArcGIS service directories.
 *
 * Two phases, because a naive 12 hosts × 7 paths is 84 requests of which most hit hosts that do not
 * resolve: (1) probe each host root once; (2) probe the service paths ONLY on hosts that answered.
 * Every non-answer is recorded with its outcome — a DNS failure is a fact about DNS, not about the
 * municipality's data.
 */
export async function sweepEndpoints(hosts, { probes, timeoutMs = 12000, probeImpl = probe } = {}) {
    const found = [];
    const hostOutcomes = [];
    for (const h of hosts) {
        const p = await probeImpl(`https://${h}/`, { timeoutMs });
        probes?.push(record(p, `sweep host root: ${h}`));
        hostOutcomes.push({ host: h, outcome: p.outcome, httpStatus: p.httpStatus });
        // A 4xx/5xx still proves the host EXISTS and may serve a service path; only a transport
        // failure removes it from consideration.
        if (p.outcome === 'network-error' || p.outcome === 'timeout') continue;
        for (const sp of SWEEP_PATHS) {
            const url = `https://${h}${sp.path}`;
            const q = await probeImpl(url, { timeoutMs });
            probes?.push(record(q, `sweep ${sp.service}: ${h}`));
            if (q.outcome !== 'ok') continue;
            const looksRight = sp.service === 'WFS' ? /WFS_Capabilities/i.test(q.body || '')
                : sp.service === 'WMS' ? /WMS_Capabilities|WMT_MS_Capabilities/i.test(q.body || '')
                    : /"(currentVersion|folders|services)"/.test(q.body || '');
            if (!looksRight) continue;
            found.push({
                id: `sweep-${h.replace(/\W+/g, '-')}-${sp.service.toLowerCase()}`,
                service: sp.service,
                publisher: null, // ⚠ UNDECLARED — competence is Unknown, never inferred from the host
                url: `https://${h}${sp.path.split('?')[0]}`,
                discoveredBy: 'sweep',
            });
        }
    }
    return { endpoints: found, hostOutcomes };
}

// ═════════════════════════════════════════════════════════════════════════════
// §PROBE — the one place this tool touches the network.
// ═════════════════════════════════════════════════════════════════════════════

/**
 * @returns {{url, httpStatus, contentType, bytes, ms, outcome, body?, error?}}
 *   outcome ∈ 'ok' | 'http-error' | 'network-error' | 'timeout'
 *   ⚠ 'network-error' and 'timeout' are UNKNOWN. They assert nothing about whether data exists.
 */
export async function probe(url, { timeoutMs = 45000, accept } = {}) {
    const t0 = Date.now();
    try {
        const res = await fetch(url, {
            signal: AbortSignal.timeout(timeoutMs),
            headers: { 'user-agent': 'PRYZM-dataset-discovery/1.0 (+Stage-0 protocol)', ...(accept ? { accept } : {}) },
        });
        const buf = Buffer.from(await res.arrayBuffer());
        return {
            url, httpStatus: res.status, contentType: res.headers.get('content-type'),
            bytes: buf.length, ms: Date.now() - t0,
            outcome: res.ok ? 'ok' : 'http-error',
            body: buf.toString('utf8'),
        };
    } catch (e) {
        const timedOut = /timeout|abort/i.test(String(e?.name) + String(e?.message));
        return {
            url, httpStatus: null, contentType: null, bytes: 0, ms: Date.now() - t0,
            outcome: timedOut ? 'timeout' : 'network-error',
            error: String(e?.message ?? e),
        };
    }
}

/** Drop the body before a ProbeRecord goes into a report — the evidence is the metadata. */
function record(p, note) {
    const { body, ...rest } = p;
    return { ...rest, bodyHead: body ? body.slice(0, 160).replace(/\s+/g, ' ') : undefined, note };
}

// ═════════════════════════════════════════════════════════════════════════════
// §AXIS-ORDER LADDER
//
// Córdoba's first `manzana` query returned 0 FEATURES — a WFS axis-order artefact, not absence. It
// was verified across five bbox forms before anything was recorded. This function is that discipline
// as code: a count is reported as ZERO only when EVERY form returned HTTP 200 with 0. Any other
// mixture is `unknown`, and the ladder's whole trace ships in the report.
// ═════════════════════════════════════════════════════════════════════════════

export function bboxForms(centroid, halfDeg, nativeCrs) {
    const { lat, lon } = centroid;
    const w = lon - halfDeg, e = lon + halfDeg, s = lat - halfDeg, n = lat + halfDeg;
    const forms = [
        { id: 'urn-4326-latlon', bbox: `${s},${w},${n},${e},urn:ogc:def:crs:EPSG::4326`, note: 'URN CRS84 order per WFS 2.0 = lat,lon' },
        { id: 'epsg-4326-lonlat', bbox: `${w},${s},${e},${n},EPSG:4326`, note: 'short form, commonly served lon,lat' },
        { id: 'crs84-lonlat', bbox: `${w},${s},${e},${n},urn:ogc:def:crs:OGC:1.3:CRS84`, note: 'CRS84 is unambiguously lon,lat' },
        { id: 'bare-lonlat', bbox: `${w},${s},${e},${n}`, note: 'no CRS — server default' },
        { id: 'bare-latlon', bbox: `${s},${w},${n},${e}`, note: 'no CRS, swapped — the form that rescued Córdoba manzana' },
    ];
    // ── THE CRS HALF OF THE MATRIX (correction 1). ───────────────────────────────────────────────
    // ⚠ Sending WGS84 DEGREES labelled with a projected CRS is a malformed request, and a 0 from it
    // proves nothing. So the native rung FORWARD-PROJECTS the bbox into the layer's own coordinates.
    // Both native orders are tried, because projected CRSs disagree about easting/northing order in
    // exactly the way geographic ones disagree about lat/lon.
    const code = epsgCodeOf(nativeCrs);
    const utmZone = (code >= 25828 && code <= 25838) ? code - 25800
        : (code >= 23028 && code <= 23038) ? code - 23000
            : (code >= 32601 && code <= 32660) ? code - 32600 : null;
    if (utmZone) {
        const a = wgs84ToUtmEtrs89(s, w, utmZone);
        const b = wgs84ToUtmEtrs89(n, e, utmZone);
        const [x0, y0, x1, y1] = [a.easting, a.northing, b.easting, b.northing].map((v) => Math.round(v));
        forms.push({ id: 'native-projected-en', bbox: `${x0},${y0},${x1},${y1},${nativeCrs}`, note: `forward-projected to ${nativeCrs} (easting,northing)` });
        forms.push({ id: 'native-projected-ne', bbox: `${y0},${x0},${y1},${x1},${nativeCrs}`, note: `forward-projected to ${nativeCrs}, swapped (northing,easting)` });
    } else if (nativeCrs) {
        forms.push({ id: 'native-crs-degrees', bbox: `${w},${s},${e},${n},${nativeCrs}`, note: 'layer default CRS with WGS84 ordinates — kept only to document that it was tried; a 0 here proves nothing' });
    }
    return forms;
}

/**
 * @param probeImpl injected so the ladder is exercised over a CAPTURED FIXTURE in tests — the same
 *   pattern Murcia's SIG-MU2 verification uses ("the fetch is injected so a captured fixture
 *   reproduces a live answer"). The ladder's correctness is the difference between recording
 *   "0 features" and recording "20,730", so it must be pinned by test, not by a live run.
 */
export async function countFeatures(endpoint, layerName, { centroid, halfDeg = 0.02, nativeCrs, probes, timeoutMs, probeImpl = probe } = {}) {
    const base = `${endpoint}${endpoint.includes('?') ? '&' : '?'}service=WFS&version=2.0.0&request=GetFeature&typeNames=${encodeURIComponent(layerName)}&resultType=hits`;

    // 1 — the WHOLE-LAYER count. No bbox, therefore no axis ambiguity at all. This is the number to
    //     trust when it arrives, and it is why the ladder is a fallback and not the primary.
    const whole = await probeImpl(base, { timeoutMs });
    probes?.push(record(whole, `hits, whole layer: ${layerName}`));
    let wholeLayerZero = false;
    if (whole.outcome === 'ok') {
        const h = parseHits(whole.body);
        // A POSITIVE whole-layer count is decisive and needs no matrix — there is no axis ambiguity
        // in a query with no bbox.
        if (h.ok && h.count > 0) return { status: 'measured', count: h.count, via: 'whole-layer', ladder: [] };
        // ⚠⚠ A ZERO IS NOT DECISIVE, AND THIS IS CORRECTION 1.
        // *"Any zero-result probe must retry across the axis/CRS matrix before it may emit one."*
        // The previous version returned `zero-all-forms` right here, off a SINGLE query — which is
        // exactly the defect that makes a missed service and an absent service indistinguishable.
        if (h.ok && h.count === 0) wholeLayerZero = true;
    }

    // 2 — the axis/CRS matrix, at the municipality centroid.
    if (!centroid) {
        // ⚠ Without a centroid the matrix CANNOT be exercised, so a zero here is UNPROVEN by
        // construction and must not be emitted as a negative.
        return {
            status: wholeLayerZero ? 'unknown-matrix-unexercised' : whole.outcome === 'ok' ? 'unparseable' : whole.outcome,
            count: null, via: null, ladder: [],
            reason: wholeLayerZero ? 'whole-layer returned 0 but no centroid was supplied, so the axis/CRS matrix could not be run — a zero that has not survived the matrix is not a negative' : undefined,
        };
    }
    const ladder = [];
    let sawA200 = false;
    for (const f of bboxForms(centroid, halfDeg, nativeCrs)) {
        const p = await probeImpl(`${base}&bbox=${encodeURIComponent(f.bbox)}`, { timeoutMs });
        probes?.push(record(p, `hits ladder ${f.id}: ${layerName}`));
        const h = p.outcome === 'ok' ? parseHits(p.body) : { ok: false, reason: p.outcome };
        ladder.push({ form: f.id, note: f.note, httpStatus: p.httpStatus, ok: h.ok, count: h.ok ? h.count : null, reason: h.ok ? null : h.reason });
        if (p.outcome === 'ok') sawA200 = true;
        if (h.ok && h.count > 0) return { status: 'measured', count: h.count, via: f.id, ladder };
    }
    // ⚠ THE LOAD-BEARING BRANCH. A zero may be emitted ONLY when the whole axis/CRS matrix was
    // exercised and EVERY rung answered HTTP 200 with 0. Anything else is UNKNOWN with a null count.
    const allZero = ladder.length > 0 && ladder.every((l) => l.ok && l.count === 0);
    const axisOrdersTried = new Set(ladder.filter((l) => l.ok).map((l) => (/latlon|-ne$/.test(l.form) ? 'swapped' : 'standard')));
    const crsVariantsTried = new Set(ladder.filter((l) => l.ok).map((l) => (/native/.test(l.form) ? 'native' : 'wgs84')));
    // Both axis orders AND both CRS families must have actually ANSWERED for the matrix to count as
    // exercised. A matrix whose native rungs all errored has not tested the CRS hypothesis.
    const matrixExercised = axisOrdersTried.size >= 2 && crsVariantsTried.size >= 2;
    return {
        status: allZero
            ? (matrixExercised ? 'zero-all-forms' : 'unknown-matrix-incomplete')
            : sawA200 ? 'unknown-mixed-ladder' : 'unknown-no-response',
        count: allZero && matrixExercised ? 0 : null,
        via: null,
        ladder,
        matrix: {
            exercised: matrixExercised,
            axisOrdersAnswered: [...axisOrdersTried],
            crsVariantsAnswered: [...crsVariantsTried],
            wholeLayerZero,
            note: matrixExercised
                ? 'both axis orders and both CRS families answered; a zero here is a PROVEN negative'
                : '⚠ the axis/CRS matrix was NOT fully exercised — this zero is UNKNOWN, not a negative (correction 1)',
        },
    };
}

// ═════════════════════════════════════════════════════════════════════════════
// §STAGES
// ═════════════════════════════════════════════════════════════════════════════

/** STAGE 0.1+0.2 — enumerate a declared endpoint and gate it on locality. */
export async function enumerateEndpoint(ep, muni, { probes, offline, fixtureDir, timeoutMs }) {
    const url = ep.url + (ep.url.includes('?') ? '&' : '?')
        + (ep.service === 'WFS' ? 'service=WFS&version=2.0.0&request=GetCapabilities'
            : ep.service === 'WMS' ? 'service=WMS&version=1.3.0&request=GetCapabilities' : 'f=json');
    let body = null; let p;
    if (offline) {
        const f = join(fixtureDir, `${ep.id}.${ep.service === 'ArcGIS' ? 'json' : 'xml'}`);
        if (!existsSync(f)) {
            return { endpoint: ep, ok: false, reason: `no fixture for ${ep.id}`, probe: null, layers: [] };
        }
        body = readFileSync(f, 'utf8');
        p = { url, httpStatus: 200, contentType: 'fixture', bytes: Buffer.byteLength(body), ms: 0, outcome: 'ok' };
        probes.push(record(p, `FIXTURE replay: ${ep.id}`));
    } else {
        p = await probe(url, { timeoutMs });
        probes.push(record(p, `GetCapabilities: ${ep.id}`));
        if (p.outcome !== 'ok') {
            // ⚠ UNKNOWN, not empty. This endpoint contributes NO negative evidence.
            return { endpoint: ep, ok: false, reason: `${p.outcome}${p.httpStatus ? ` HTTP ${p.httpStatus}` : ''}${p.error ? ` — ${p.error}` : ''}`, unknown: true, probe: record(p), layers: [] };
        }
        body = p.body;
    }

    const parsed = ep.service === 'WFS' ? parseWfsCapabilities(body, ep.url)
        : ep.service === 'WMS' ? parseWmsCapabilities(body, ep.url)
            : parseArcgisService(body, ep.url);
    if (!parsed.ok) return { endpoint: ep, ok: false, reason: parsed.reason, unknown: true, probe: record(p), layers: [] };

    // ── THE GMU GATE, at SERVICE level, before a single layer is believed. ───────────────────────
    let serviceLocality = { verdict: 'unknown', reason: 'no service-level extent published', distanceKm: null, spanDeg: null };
    if (parsed.serviceBboxNative) {
        const rp = bboxToWgs84(parsed.serviceBboxNative, parsed.serviceCrs);
        serviceLocality = rp
            ? { ...verifyLocality(rp.bbox, muni.centroid), reprojectedVia: rp.via, note: rp.note }
            : { verdict: 'unknown', reason: `cannot reproject service extent from ${parsed.serviceCrs} — UNKNOWN, not far`, distanceKm: null, spanDeg: null };
    } else if (parsed.layers.some((l) => l.bboxWgs84)) {
        // ⚠ SANITISE BEFORE UNIONING. Murcia serves four layers with EPSG:25830 metres inside
        // `ows:WGS84BoundingBox`; unioning them raw produced a service extent spanning 4 214 390°
        // and made every honest verdict below it meaningless.
        const bs = parsed.layers
            .map((l) => sanitiseWgs84Bbox(l.bboxWgs84 ?? null, l.defaultCrs ?? null).bbox)
            .filter(Boolean);
        if (bs.length) {
            const union = [Math.min(...bs.map((b) => b[0])), Math.min(...bs.map((b) => b[1])), Math.max(...bs.map((b) => b[2])), Math.max(...bs.map((b) => b[3]))];
            serviceLocality = { ...verifyLocality(union, muni.centroid), derivedFrom: `union of ${bs.length} sanitised layer extents` };
        }
    }

    const layers = parsed.layers.map((l) => {
        let bboxWgs84 = l.bboxWgs84 ?? null;
        if (!bboxWgs84 && l.bboxNative) {
            const rp = bboxToWgs84(l.bboxNative, l.bboxNativeCrs);
            if (rp) bboxWgs84 = rp.bbox;
        }
        return { ...l, bboxWgs84, publisher: ep.publisher, service: ep.service, endpoint: ep.url };
    });

    return { endpoint: ep, ok: true, serviceTitle: parsed.title, serviceVersion: parsed.version, serviceOwner: parsed.owner ?? null, serviceLocality, probe: record(p), layers };
}

/** STAGE 0.5 — the DEEP probe: schema + count, for the layers triage put on top. */
export async function deepProbeLayer(rec, layerMeta, muni, { probes, timeoutMs }) {
    if (rec.service !== 'WFS') return { attributes: null, geometryType: null, count: { status: 'not-applicable-wms', count: null, ladder: [] } };
    const dftUrl = `${rec.endpoint}${rec.endpoint.includes('?') ? '&' : '?'}service=WFS&version=2.0.0&request=DescribeFeatureType&typeNames=${encodeURIComponent(rec.layer)}`;
    const p = await probe(dftUrl, { timeoutMs });
    probes.push(record(p, `DescribeFeatureType: ${rec.layer}`));
    const dft = p.outcome === 'ok' ? parseDescribeFeatureType(p.body) : { ok: false, reason: p.outcome };
    const count = await countFeatures(rec.endpoint, rec.layer, {
        centroid: muni.centroid, nativeCrs: layerMeta?.defaultCrs ?? null, probes, timeoutMs,
    });
    return {
        attributes: dft.ok ? dft.attributes : null,
        geometryType: dft.ok ? dft.geometryType : null,
        schemaProbe: dft.ok ? 'ok' : `UNKNOWN — ${dft.reason}`,
        count,
    };
}

/** THE FULL STAGE-0 RUN. */
export async function runDiscovery(muni, opts = {}) {
    const t0 = Date.now();
    const probes = [];
    const fixtureDir = opts.fixtureDir ?? resolve(HERE, 'fixtures');
    const timeoutMs = opts.timeoutMs ?? 45000;

    // ── 0.1 / 0.2 / 0.3 ──────────────────────────────────────────────────────────────────────────
    // §HOST-SWEEP — for a cold-start municipality with no declared endpoints. Live mode only.
    let sweep = null;
    let declared = muni.endpoints ?? [];
    if (opts.sweep && !opts.offline) {
        sweep = await sweepEndpoints(candidateHostsFor(muni.name, muni.candidateHosts ?? []), {
            probes, timeoutMs: opts.sweepTimeoutMs ?? 12000,
        });
        const known = new Set(declared.map((e) => e.url));
        declared = [...declared, ...sweep.endpoints.filter((e) => !known.has(e.url))];
    }

    const endpoints = [];
    for (const ep of declared) {
        endpoints.push(await enumerateEndpoint(ep, muni, { probes, offline: opts.offline, fixtureDir, timeoutMs }));
    }

    // ── 0.4 classify everything. NOTHING is dropped: the register's highest-value column is the one
    //    recording what was looked at and rejected. ────────────────────────────────────────────────
    const ctx = { centroid: muni.centroid, municipality: muni.name, publisherRegistry: PUBLISHERS };
    const metaByKey = new Map();

    // ── §ONE-ROW-PER-DATASET. A GeoServer advertises most layers on BOTH its WFS and its WMS, so a
    //    naive inventory double-counts and buries the interesting rows. Merge by (publisher, layer
    //    name) — which is also the MACHINE-READABLE-EVIDENCE-REGISTER's own key (rule 1: one row per
    //    dataset).
    //    ⚠ The merge PRESERVES the WMS-only signal rather than hiding it: COACo's WMS advertises
    //    `areas`, `parcelario_urbanismo` and `actuaciones_tramitado`, none of which its WFS serves
    //    (all three answer `Feature type unknown`). A WMS-only name is a real, weaker readability
    //    fact and is flagged as one.
    const merged = new Map();
    for (const e of endpoints) {
        if (!e.ok) continue;
        for (const l of e.layers) {
            const key = `${e.endpoint.publisher ?? e.endpoint.id}::${l.name}`;
            metaByKey.set(`${e.endpoint.id}::${l.name}`, l);
            const prev = merged.get(key);
            if (!prev) {
                merged.set(key, { layer: l, services: [e.endpoint.service], endpointIds: [e.endpoint.id], serviceLocality: e.serviceLocality });
                continue;
            }
            prev.services.push(e.endpoint.service);
            prev.endpointIds.push(e.endpoint.id);
            // Prefer the WFS view: it is the one that can carry a schema and a feature count.
            if (e.endpoint.service === 'WFS') {
                prev.layer = { ...l, bboxWgs84: l.bboxWgs84 ?? prev.layer.bboxWgs84 };
                prev.serviceLocality = e.serviceLocality;
            } else if (!prev.layer.bboxWgs84 && l.bboxWgs84) prev.layer.bboxWgs84 = l.bboxWgs84;
        }
    }

    let records = [];
    for (const m of merged.values()) {
        const wfsIdx = m.services.indexOf('WFS');
        const primaryService = wfsIdx >= 0 ? 'WFS' : m.services[0];
        // §EXTENT-CONTRADICTS-SERVICE needs the SERVICE's verdict to tell a stale layer bbox apart
        // from a genuine collision.
        const r = classifyLayer({ ...m.layer, service: primaryService }, { ...ctx, serviceLocality: m.serviceLocality });
        r.services = [...new Set(m.services)];
        r.endpointId = m.endpointIds[wfsIdx >= 0 ? wfsIdx : 0];
        if (!r.services.includes('WFS') && r.services.includes('WMS')) {
            r.flags.push({
                id: 'wms-only',
                detail: 'advertised by WMS but not by WFS — commonly a layer GROUP or styled view carrying no '
                    + 'queryable features of its own. Confirm with a GetFeature before recording it as a dataset.',
            });
        }
        // A layer inherits the SERVICE's locality verdict when it publishes none of its own —
        // and it inherits `unknown` as `unknown`, never as a pass.
        if (r.locality.verdict === 'unknown' && m.serviceLocality?.verdict && m.serviceLocality.verdict !== 'unknown') {
            r.locality = { ...m.serviceLocality, inheritedFromService: true };
        }
        records.push(r);
    }
    records.sort((a, b) => b.triageRank - a.triageRank || a.layer.localeCompare(b.layer));

    // ── 0.5 deep probe the top N. ────────────────────────────────────────────────────────────────
    const deepN = opts.deep ?? 0;
    if (deepN > 0 && !opts.offline) {
        const targets = records.filter((r) => r.triageRank > 0).slice(0, deepN);
        for (const r of targets) {
            const meta = metaByKey.get(`${r.endpointId}::${r.layer}`);
            const d = await deepProbeLayer(r, meta, muni, { probes, timeoutMs });
            const re = classifyLayer({
                ...meta,
                attributes: d.attributes ?? undefined,
                geometryType: d.geometryType ?? undefined,
                featureCount: d.count.count,
                featureCountStatus: d.count.status,
            }, ctx);
            re.endpointId = r.endpointId;
            re.locality = r.locality;
            re.deep = { schemaProbe: d.schemaProbe, countVia: d.count.via, ladder: d.count.ladder };
            re.services = r.services;
            const i = records.indexOf(r);
            records[i] = re;
        }
        records.sort((a, b) => b.triageRank - a.triageRank || a.layer.localeCompare(b.layer));
    }

    const wallClockMs = Date.now() - t0;
    return {
        protocolVersion: PROTOCOL_VERSION,
        classifierVersion: CLASSIFIER_VERSION,
        sweep: sweep ? { hostsProbed: sweep.hostOutcomes.length, hostOutcomes: sweep.hostOutcomes, endpointsFound: sweep.endpoints.length } : null,
        municipality: { name: muni.name, cc: muni.cc, ineCode: muni.ineCode, jurisdictionId: muni.jurisdictionId, centroid: muni.centroid },
        mode: opts.offline ? 'offline-fixture-replay' : 'live',
        runAt: opts.now ?? new Date().toISOString(),
        endpoints: endpoints.map((e) => ({
            id: e.endpoint.id, service: e.endpoint.service, url: e.endpoint.url, publisher: e.endpoint.publisher,
            ok: e.ok, reason: e.reason ?? null, unknown: !!e.unknown,
            serviceTitle: e.serviceTitle ?? null, serviceOwner: e.serviceOwner ?? null,
            serviceLocality: e.serviceLocality ?? null, layerCount: e.layers.length,
        })),
        // §COST — what Stage 0 costs, measured, not estimated.
        cost: {
            requests: probes.length,
            wallClockMs,
            bytes: probes.reduce((s, p) => s + (p.bytes || 0), 0),
            failedProbes: probes.filter((p) => p.outcome !== 'ok').length,
            // ⚠ counted SEPARATELY from outcomes (PROBE-DISCIPLINE R5).
            unknownProbes: probes.filter((p) => p.outcome === 'network-error' || p.outcome === 'timeout').length,
        },
        totals: {
            layersEnumerated: records.length,
            normative: records.filter((r) => r.kind === 'normative').length,
            reusableGeometry: records.filter((r) => r.reusableGeometry.flag).length,
            withCandidateVariables: records.filter((r) => r.candidateVariables.length > 0).length,
            localityFar: records.filter((r) => r.locality.verdict === 'far').length,
            localityUnknown: records.filter((r) => r.locality.verdict === 'unknown').length,
        },
        records,
        probes,
    };
}

// ═════════════════════════════════════════════════════════════════════════════
// §FORAL-EXCLUSION — País Vasco + Navarra are OUT OF SCOPE for the Cold Start Probe.
//
// They run their own cadastres under the foral regime. That makes them a SEPARATE ADAPTER, not a
// coverage gap, and letting one into a stratified national sample would contaminate the tier
// estimate with a structural difference masquerading as a data absence. The guard is here rather
// than in the sampling script because the sampling script is not the only caller.
// ═════════════════════════════════════════════════════════════════════════════
export const FORAL_PROVINCE_PREFIXES = {
    '01': 'Álava (País Vasco — foral cadastre)',
    '20': 'Gipuzkoa (País Vasco — foral cadastre)',
    '48': 'Bizkaia (País Vasco — foral cadastre)',
    '31': 'Navarra (foral cadastre)',
};

export function foralExclusion(muni) {
    const ine = String(muni.ineCode ?? '');
    const prefix = ine.slice(0, 2);
    if (muni.cc === 'es' && FORAL_PROVINCE_PREFIXES[prefix]) {
        return {
            excluded: true, reason: 'foral-regime-out-of-scope',
            detail: `${FORAL_PROVINCE_PREFIXES[prefix]} — a separate cadastral adapter, NOT a coverage gap. `
                + 'Excluded so it cannot contaminate the national tier estimate.',
        };
    }
    return { excluded: false };
}

// ═════════════════════════════════════════════════════════════════════════════
// §COLD-START-RECORD — the machine-readable per-municipality row Probe C aggregates.
//
// FOUNDER, ADDENDUM 1: *"Its performance on virgin cities is itself a measurement — log where it
// FAILS, not just what it finds."*
//
// ⚠⚠ EVERY FACT IS A TRISTATE `Yes | No | Unknown`, NEVER A BOOLEAN. A boolean forces an unreachable
// endpoint to become `false`, which is the exact defect this whole programme exists to prevent
// (L-422/457/467/469). `Unknown` is a first-class value with equal standing to `No`, and the
// `undecided` array names WHY for every one of them.
//
// ⚠ A FALSE NEGATIVE IS THE MOST EXPENSIVE ERROR THIS TOOL CAN MAKE (ADR-0290): it would send an
// engineer to build a derived solution while the authoritative dataset sits published. So the
// record is deliberately biased toward `Unknown` over `No` — `No` requires that every declared
// endpoint answered and none carried a candidate.
// ═════════════════════════════════════════════════════════════════════════════

export const UNDECIDED_REASONS = [
    'endpoint-unreachable',        // DNS / connection failure — asserts NOTHING about the data
    'auth-gated',                  // 401 / 403 / 499 Token Required (the València heritage case)
    'timeout',
    'schema-unrecognised',         // 200, but not a capabilities document we can parse
    'crs-unreprojectable',         // an extent we cannot verify — UNKNOWN locality, never `far`
    'count-ladder-inconclusive',   // the axis-order ladder gave a mixed answer
    'ambiguous-classification',    // planning terms hit, but nothing decisive
    'temporal-filter-required',    // validity end-date present; coverage unknown until filtered
    'undeclared-publisher',        // the planning publisher is not in PUBLISHERS — Unknown, not competent
];

function tristate(value, evidence, basis) { return { value, evidence, basis }; }

export function coldStartRecord(report, extra = {}) {
    const eps = report.endpoints;
    const undecided = [];
    const push = (reason, detail) => {
        const row = undecided.find((u) => u.reason === reason);
        if (row) { row.count += 1; row.detail.push(detail); } else undecided.push({ reason, count: 1, detail: [detail] });
    };

    for (const e of eps) {
        if (e.ok) continue;
        const r = String(e.reason ?? '');
        if (/network-error/.test(r)) push('endpoint-unreachable', `${e.id}: ${r}`);
        else if (/timeout/.test(r)) push('timeout', `${e.id}: ${r}`);
        else if (/HTTP 40[13]|HTTP 499|token/i.test(r)) push('auth-gated', `${e.id}: ${r}`);
        else if (/not a .* capabilities|not JSON|not an ArcGIS/i.test(r)) push('schema-unrecognised', `${e.id}: ${r}`);
        else push('schema-unrecognised', `${e.id}: ${r}`);
    }
    for (const rec of report.records) {
        if (rec.locality.verdict === 'unknown' && /cannot reproject/.test(rec.locality.reason ?? '')) {
            push('crs-unreprojectable', `${rec.layer}: ${rec.locality.reason}`);
        }
        if (String(rec.featureCountStatus).startsWith('unknown')) {
            push('count-ladder-inconclusive', `${rec.layer}: ${rec.featureCountStatus}`);
        }
        // CORRECTION 2 — a layer needing a temporal filter is an UNDECIDED for the aggregator: we
        // cannot say what it covers today without knowing which rows are in force.
        if (rec.temporalFilteringRequired) {
            push('temporal-filter-required', `${rec.layer}: ${rec.temporalValidity.endFields.join(', ')}`);
        }
    }

    const reachable = eps.filter((e) => e.ok);
    const unreachable = eps.filter((e) => !e.ok);

    // ── published GIS service ────────────────────────────────────────────────────────────────────
    const publishedGisService = reachable.length > 0
        ? tristate('Yes', `${reachable.length}/${eps.length} declared endpoints answered with a parseable capabilities document`, 'measured')
        : eps.length === 0
            ? tristate('Unknown', 'no endpoints were declared for this municipality — nothing was probed', 'not-probed')
            : tristate('Unknown', `all ${eps.length} declared endpoints failed (${unreachable.map((e) => e.reason).join(' · ')}) — a failure is UNKNOWN, never "no service"`, 'probe-failed');

    // ── digital PGOU: is a PLANNING INSTRUMENT represented as queryable vector features? ─────────
    // ⚠ This is a GIS-side question only. A municipality with a scanned-PDF PGOU and no GIS answers
    // `No` here and may still be perfectly compilable to a Tier-2 determination from the text.
    const normativeVector = report.records.filter((r) => r.kind === 'normative'
        && r.instruments.length > 0
        && r.services?.includes('WFS')
        && r.locality.verdict !== 'far');
    const normativeAny = report.records.filter((r) => r.kind === 'normative' && r.locality.verdict !== 'far');
    const digitalPgou = publishedGisService.value !== 'Yes'
        ? tristate('Unknown', 'no service answered — cannot say', 'probe-failed')
        : normativeVector.length > 0
            ? tristate('Yes', `${normativeVector.length} vector layer(s) attributed to a named instrument, e.g. ${normativeVector.slice(0, 3).map((r) => r.layer).join(', ')}`, 'measured')
            : normativeAny.length > 0
                ? tristate('Unknown', `${normativeAny.length} normative-looking layer(s) but none both instrument-attributed AND WFS-queryable — ambiguous`, 'ambiguous')
                : tristate('No', `all ${report.records.length} enumerated layers classified; none is an instrument-attributed normative layer`, 'measured');
    if (digitalPgou.basis === 'ambiguous') push('ambiguous-classification', `digitalPgou: ${digitalPgou.evidence}`);

    const vectorOrScanned = publishedGisService.value !== 'Yes' ? 'Unknown'
        : normativeVector.length > 0 ? 'vector'
            : report.records.some((r) => r.geometryKind === 'raster' || r.services?.length === 1 && r.services[0] === 'WMS') ? 'raster-or-wms-only'
                : normativeAny.length > 0 ? 'Unknown' : 'none-found';

    // ── publisher class. DECLARED, never inferred from a hostname (the GMU lesson). ──────────────
    const pubs = [...new Set(reachable.map((e) => e.publisher).filter(Boolean))];
    const classes = pubs.map((p) => (PUBLISHERS[p]?.competentForPlanning === true ? 'municipal'
        : PUBLISHERS[p]?.competentForPlanning === false ? 'non-authority' : 'Unknown'));
    const publisher = publishedGisService.value !== 'Yes' ? 'Unknown'
        : classes.includes('municipal') ? 'municipal'
            : classes.length === 0 ? 'Unknown'
                : classes.every((c) => c === 'non-authority') ? 'non-authority'
                    : 'Unknown';

    // ── §PUBLISHER-IS-PLANNING-AUTHORITY — CORRECTION 3, a FIRST-CLASS TRISTATE. ─────────────────
    // ⚠ Across 8,132 municipalities we will hit colegios, universities, consultancies and regional
    // aggregators publishing planning-SHAPED data with no normative authority. Córdoba is already
    // one: its only zoning vector is COACo's — a Colegio de Arquitectos — against a measured 0.0 %
    // envelope. That must be a queryable FIELD, not a caveat that happens to fire on one city.
    //
    // ⚠ It is asked of the publisher(s) of THE PLANNING EVIDENCE, not of the endpoints in general.
    // A city whose basemap comes from the Ayuntamiento and whose only zoning comes from a colegio
    // must answer `no` here, not `yes`.
    const evidencePubs = [...new Set(
        (normativeVector.length ? normativeVector : normativeAny).map((r) => r.publisher).filter(Boolean),
    )];
    const evidenceCompetence = evidencePubs.map((p) => PUBLISHERS[p]?.competentForPlanning ?? null);
    const publisherIsPlanningAuthority = publishedGisService.value !== 'Yes'
        ? tristate('unknown', 'no service answered — no planning evidence to attribute', 'probe-failed')
        : evidencePubs.length === 0
            ? tristate('unknown', 'no normative layer found, so there is no planning publisher to classify', 'no-evidence')
            : evidenceCompetence.some((c) => c === true)
                ? tristate('yes', `planning evidence published by ${evidencePubs.filter((p) => PUBLISHERS[p]?.competentForPlanning === true).join(', ')} — declared competent`, 'declared')
                : evidenceCompetence.every((c) => c === false)
                    ? tristate('no', `ALL planning evidence comes from ${evidencePubs.join(', ')} — declared NOT competent for planning (colegio / university / consultancy / aggregator class)`, 'declared')
                    : tristate('unknown', `competence of ${evidencePubs.filter((p) => PUBLISHERS[p]?.competentForPlanning == null).join(', ')} is UNDECLARED — add to PUBLISHERS before aggregating; an unlisted publisher is Unknown, never competent`, 'undeclared-publisher');
    if (publisherIsPlanningAuthority.value === 'unknown' && publisherIsPlanningAuthority.basis === 'undeclared-publisher') {
        push('undeclared-publisher', publisherIsPlanningAuthority.evidence);
    }

    // ── §TIER-SIGNAL — an UPPER BOUND, explicitly not a determination. ───────────────────────────
    // Stage 0 cannot read the ordinance, so it cannot know whether the instrument GRANTS the
    // determination (ADR-0288 condition 2). A `tier-1-candidate` may still land at tier 2 or 3 once
    // the law is read. A `tier-3-candidate` bounds only the GIS route — the municipality may still
    // reach tier 2 from a scanned instrument this probe never opened.
    const tier1Vars = new Set(['zoning-regime', 'building-line', 'storey-count', 'building-height', 'floor-area-ratio', 'coverage-ratio', 'buildable-depth']);
    const tier1Evidence = normativeVector.filter((r) => r.machineReadability.score >= 0.8
        && r.candidateVariables.some((v) => tier1Vars.has(v.variable)));
    const tierSignal = publishedGisService.value === 'Unknown'
        ? { value: 'undetermined', basis: 'no service answered — UNKNOWN, and an unknown may not be counted as tier 3' }
        : tier1Evidence.length > 0
            ? { value: 'tier-1-candidate', basis: `${tier1Evidence.length} instrument-attributed vector layer(s) carrying an envelope variable: ${tier1Evidence.slice(0, 3).map((r) => r.layer).join(', ')}` }
            : digitalPgou.value === 'No'
                ? { value: 'tier-3-candidate-via-gis', basis: 'a GIS service exists and carries no instrument-attributed planning vector — the GIS ROUTE only; a scanned instrument may still yield tier 2' }
                : { value: 'undetermined', basis: 'ambiguous classification — a human must look' };

    // ⚠ §PUBLISHER-CAVEAT. The tier-1 test asks whether an ENVELOPE VARIABLE is published as vector.
    // It does NOT ask who published it — deliberately, because that is the legal-authority axis and
    // ADR-0288 keeps the two apart. But an aggregator sizing national coverage must not read
    // "tier-1-candidate" as "the planning authority publishes this".
    //   Córdoba is the live case: its ONLY zoning vector is COACo's — a COLEGIO DE ARQUITECTOS, a
    //   professional body, hand-tracing a 2-district pilot. Readable, instrument-attributed, and NOT
    //   the planning authority. The city's measured envelope coverage is 0.0 %.
    const tier1Publishers = [...new Set(tier1Evidence.map((r) => r.publisher).filter(Boolean))];
    const nonAuthorityOnly = tier1Publishers.length > 0
        && tier1Publishers.every((p) => PUBLISHERS[p]?.competentForPlanning === false);
    const unknownPublisherOnly = tier1Publishers.length > 0
        && tier1Publishers.every((p) => PUBLISHERS[p]?.competentForPlanning == null);
    tierSignal.caveats = [];
    if (nonAuthorityOnly) {
        tierSignal.caveats.push(
            `⚠ ALL tier-1 evidence comes from a publisher DECLARED NOT COMPETENT for planning `
            + `(${tier1Publishers.join(', ')}). Readable and instrument-attributed, but not the planning `
            + 'authority — do not read this as "the municipality publishes its plan as vector".',
        );
    }
    if (unknownPublisherOnly) {
        tierSignal.caveats.push(
            `⚠ The competence of the tier-1 publisher(s) (${tier1Publishers.join(', ')}) is UNDECLARED. `
            + 'Add them to PUBLISHERS before this row is aggregated; an unlisted publisher is Unknown, not competent.',
        );
    }
    if (tierSignal.caveats.length) push('ambiguous-classification', `tierSignal: ${tierSignal.caveats[0]}`);

    return {
        schema: 'pryzm.stage0.cold-start-record/1.0',
        protocolVersion: report.protocolVersion,
        classifierVersion: report.classifierVersion,
        runAt: report.runAt,
        mode: report.mode,
        municipality: report.municipality,
        populationBand: extra.populationBand ?? null,
        foral: foralExclusion(report.municipality),
        publishedGisService,
        digitalPgou,
        vectorOrScanned,
        publisher,
        // CORRECTION 3 — a first-class tristate (`yes` | `no` | `unknown`), never a boolean and
        // never a caveat. Across 8,132 municipalities the colegio/university/consultancy/aggregator
        // class is common enough that an aggregator must be able to filter on it.
        publisherIsPlanningAuthority,
        counts: {
            endpointsDeclared: eps.length,
            endpointsAnswered: reachable.length,
            endpointsFailed: unreachable.length,
            layersEnumerated: report.totals.layersEnumerated,
            normativeLayers: report.totals.normative,
            reusableGeometryLayers: report.totals.reusableGeometry,
            instrumentAttributedVectorLayers: normativeVector.length,
            localityFar: report.totals.localityFar,
            localityUnknown: report.totals.localityUnknown,
        },
        cost: {
            requests: report.cost.requests,
            wallClockMinutes: Number((report.cost.wallClockMs / 60000).toFixed(3)),
            bytes: report.cost.bytes,
            failedProbes: report.cost.failedProbes,
            unknownProbes: report.cost.unknownProbes,
        },
        // ⚠ EQUALLY WEIGHTED WITH THE FINDINGS, per the founder. Where the tool could not decide, and why.
        undecided,
        undecidedTotal: undecided.reduce((s, u) => s + u.count, 0),
        tierSignal: {
            ...tierSignal,
            note: '⚠ A SIGNAL, NOT A DETERMINATION. Stage 0 never reads the ordinance, so it cannot know '
                + 'whether the instrument GRANTS a determination (ADR-0288). This bounds the GIS route only.',
        },
        knownLimitations: [
            'Only DECLARED endpoints are probed. A municipality whose service this tool was never told about reads as `Unknown`, not `No`.',
            'No ordinance text is opened. `digitalPgou: No` is a statement about GIS, not about the plan.',
            'Classification is lexical. A planning layer named in an idiom absent from taxonomy.mjs is a FALSE NEGATIVE and would read as `No` — the most expensive error available (ADR-0290).',
        ],
    };
}

// ═════════════════════════════════════════════════════════════════════════════
// §ACID-TEST — "does it independently surface the three datasets humans missed?"
//
// ⚠ THIS IS A MEASUREMENT, NOT A CLAIM, AND IT IS ONE-WAY. It reports where a named layer landed in
// the triage order. It must never be used to TUNE the taxonomy: a dictionary reverse-engineered from
// its own answer key proves nothing, and the founder's brief says so explicitly — *"report that
// honestly rather than tuning until it passes."* The expectations live in `ACID_TEST_TARGETS` next
// to the reason each one matters, so a future reader can see what was being tested for.
// ═════════════════════════════════════════════════════════════════════════════
/**
 * ⚠⚠ CORRECTION 4 — THE LIMIT OF THE ACID TEST, printed in the REPORT BODY, not a footnote.
 * *"Someone will quote the top-20 result as recall otherwise."*
 */
export const ACID_TEST_LIMIT =
    '> ⚠⚠ **WHAT THIS TEST DOES AND DOES NOT SHOW.** All targets below were **already-known**\n'
    + '> discoveries, found by hand and **held in context by the agent that wrote the vocabulary**.\n'
    + '> The test therefore demonstrates exactly one thing: **the tool does not miss known-good\n'
    + '> datasets.** It is **NOT evidence of recall on datasets nobody has found yet** — that number\n'
    + '> is unmeasured and, without a ground-truth inventory of what every city publishes,\n'
    + '> unmeasurable. **Do not quote a top-20 rank as recall.**';

export const ACID_TEST_TARGETS = {
    murcia: [
        { layer: 'Murcia:pgou_alineaciones', why: 'published block-level alignment polygons; a street-width capability was nearly built on a dissolve instead' },
        { layer: 'Murcia:pgou_eje_comercial', why: 'published, never queried — a live 0.7 % refusal rate that is engineering, not missing data' },
    ],
    cordoba: [
        { layer: 'idecordoba:manzana', why: '20,730 published blocks; ADR-0283 makes this primary and our cadastral dissolve the fallback' },
    ],
};

/**
 * §FALSE-NEGATIVE RATE. The founder asked for this explicitly, and for an honest "cannot measure"
 * where it cannot be measured.
 *
 * ⚠ WHAT THIS CAN AND CANNOT MEASURE. A false negative is a PUBLISHED, AUTHORITATIVE layer that
 * Stage 0 failed to surface. Measuring the true rate needs a complete ground-truth inventory of what
 * each city publishes — which is precisely the thing nobody has, and the reason this tool exists.
 * So the honest denominator is small and NAMED: the datasets a human sweep has independently
 * confirmed. It is a recall measurement over a known-good set, NOT a population rate, and it must
 * never be quoted as one (PROBE-DISCIPLINE §3 — say which denominator).
 */
export function falseNegativeRate(report, targets, topN = 20) {
    const results = acidTest(report, targets);
    const missed = results.filter((r) => !r.found);
    const belowFold = results.filter((r) => r.found && r.rank > topN);
    return {
        denominator: `${results.length} independently-confirmed published datasets for ${report.municipality.name}`,
        denominatorWarning: '⚠ A RECALL MEASUREMENT OVER A KNOWN-GOOD SET, NOT A POPULATION FALSE-NEGATIVE RATE. '
            + 'The true rate is UNMEASURABLE without a complete ground-truth inventory of what each city '
            + 'publishes — the very thing whose absence this tool exists to address. Do not quote it as a rate.',
        hardMisses: missed.length,
        hardMissRate: results.length ? Number((missed.length / results.length).toFixed(3)) : null,
        surfacedButBelowTop: belowFold.length,
        topN,
        detail: results,
    };
}

export function acidTest(report, targets) {
    const n = report.records.length;
    return targets.map((t) => {
        const i = report.records.findIndex((r) => r.layer === t.layer);
        if (i < 0) return { ...t, found: false, rank: null, of: n, percentile: null, verdict: '⛔ NOT SURFACED' };
        const r = report.records[i];
        return {
            ...t, found: true, rank: i + 1, of: n,
            percentile: Number((((n - i) / n) * 100).toFixed(1)),
            triageRank: r.triageRank,
            kind: r.kind,
            candidateVariables: r.candidateVariables.map((v) => v.variable),
            machineReadability: r.machineReadability.score,
            legalAuthority: r.legalAuthority.score,
            reusableGeometry: r.reusableGeometry.flag,
            verdict: i < 20 ? '✅ surfaced in the top 20' : i < 50 ? '⚠ surfaced, but below the top 20' : '⚠ surfaced only deep in the list',
        };
    });
}

// ═════════════════════════════════════════════════════════════════════════════
// §REPORT
// ═════════════════════════════════════════════════════════════════════════════

export function renderMarkdown(report, topN = 30) {
    const L = [];
    L.push(`# Stage 0 — Dataset discovery · ${report.municipality.name}`);
    L.push('');
    L.push(`> Protocol \`v${report.protocolVersion}\` · classifier \`v${report.classifierVersion}\` · mode **${report.mode}** · run ${report.runAt}`);
    L.push(`> **Cost:** ${report.cost.requests} requests · ${(report.cost.wallClockMs / 1000).toFixed(1)} s wall-clock · ${(report.cost.bytes / 1024).toFixed(0)} KiB · ${report.cost.failedProbes} failed (${report.cost.unknownProbes} UNKNOWN, counted separately).`);
    L.push('');
    L.push('## Endpoints');
    L.push('');
    L.push('| id | service | publisher | result | service extent verdict | layers |');
    L.push('|---|---|---|---|---|---:|');
    for (const e of report.endpoints) {
        const loc = e.serviceLocality ? `${e.serviceLocality.verdict}${e.serviceLocality.distanceKm != null ? ` (${e.serviceLocality.distanceKm.toFixed(0)} km)` : ''}` : '—';
        L.push(`| \`${e.id}\` | ${e.service} | ${e.publisher ?? '—'} | ${e.ok ? '200 OK' : `⚠ ${e.reason}`} | ${loc} | ${e.layerCount} |`);
    }
    L.push('');
    L.push(`## Top ${topN} by triage rank`);
    L.push('');
    L.push('> ⚠ **Triage rank is not a score.** It orders what a human looks at first. It contains no legal-authority term and never enters a publication decision (ADR-0288).');
    L.push('');
    L.push('| # | layer | kind | geom | MR | LA | reusable | candidate variables | flags |');
    L.push('|---:|---|---|---|---:|---:|:---:|---|---|');
    report.records.slice(0, topN).forEach((r, i) => {
        const mr = `${r.machineReadability.score.toFixed(2)}${r.machineReadability.isLowerBound ? '⌊' : ''}`;
        const la = `${r.legalAuthority.score.toFixed(2)}${r.legalAuthority.isLowerBound ? '⌊' : ''}`;
        L.push(`| ${i + 1} | \`${r.layer}\` | ${r.kind} | ${r.geometryKind ?? '?'} | ${mr} | ${la} | ${r.reusableGeometry.flag ? '✅' : ''} | ${r.candidateVariables.map((v) => v.variable).join(', ') || '—'} | ${r.flags.map((f) => f.id).join(' · ')} |`);
    });
    L.push('');
    L.push('`⌊` = the score is a **lower bound**: at least one bit was not probed. It is not a measurement (PROBE-DISCIPLINE R8).');
    L.push('');
    L.push('## Draft rows for the MACHINE-READABLE EVIDENCE REGISTER');
    L.push('');
    L.push('> Stage 0 **populates** the register; a human **moves rows in**. `Publishable` is emitted as the ADR-0288 constant because discovery structurally cannot answer that column.');
    L.push('');
    L.push('| Dataset | Machine-readable | Publishable | Status | Next action (one, owned) |');
    L.push('|---|---|---|---|---|');
    for (const row of toEvidenceRegisterRows(report.records.slice(0, topN).filter((r) => r.kind === 'normative' || r.reusableGeometry.flag), report.municipality.name)) {
        L.push(`| ${row.dataset} | ${row.machineReadable} | ${row.publishable} | ${row.status} | ${row.nextAction} — **exit:** ${row.exit} |`);
    }
    L.push('');
    return L.join('\n');
}

// ═════════════════════════════════════════════════════════════════════════════
// §CLI
// ═════════════════════════════════════════════════════════════════════════════

function parseArgs(argv) {
    const o = { deep: 0, offline: false, top: 30 };
    for (let i = 0; i < argv.length; i += 1) {
        const a = argv[i];
        if (a === '--city') o.city = argv[++i];
        else if (a === '--deep') o.deep = Number(argv[++i]);
        else if (a === '--offline') o.offline = true;
        else if (a === '--out') o.out = argv[++i];
        else if (a === '--top') o.top = Number(argv[++i]);
        else if (a === '--name') o.name = argv[++i];
        else if (a === '--centroid') { const [lat, lon] = argv[++i].split(',').map(Number); o.centroid = { lat, lon }; }
        else if (a === '--endpoints') o.endpoints = argv[++i];
        else if (a === '--capture-fixtures') o.captureFixtures = true;
        else if (a === '--batch') o.batch = argv[++i];
        else if (a === '--cold-start') o.coldStart = true;
    }
    return o;
}

/**
 * §BATCH — the Cold Start Probe (Probe C) driver.
 *
 * Reads a JSON array of municipality descriptors (the same shape as `MUNICIPALITIES` entries, plus
 * an optional `populationBand`) and emits ONE cold-start record per municipality as JSONL, so a
 * third party can aggregate without re-running anything.
 *
 * ⚠ It never stops on a failure. A municipality whose every endpoint dies still produces a record —
 * with `publishedGisService: Unknown` and a populated `undecided` array. That row is DATA, and
 * dropping it would silently bias the national estimate toward the cities that happened to answer.
 */
export async function runBatch(municipalities, opts = {}) {
    const out = [];
    for (const m of municipalities) {
        const foral = foralExclusion(m);
        if (foral.excluded) {
            out.push({
                schema: 'pryzm.stage0.cold-start-record/1.0', municipality: m, foral,
                skipped: true,
                note: 'NOT PROBED. Excluded before any request so it cannot enter the tier estimate.',
            });
            continue;
        }
        try {
            const report = await runDiscovery(m, opts);
            out.push(coldStartRecord(report, { populationBand: m.populationBand }));
        } catch (e) {
            // Even a crash is a measurement about the tool, not a fact about the municipality.
            out.push({
                schema: 'pryzm.stage0.cold-start-record/1.0', municipality: m, foral,
                publishedGisService: { value: 'Unknown', evidence: `discovery threw: ${String(e?.message ?? e)}`, basis: 'tool-error' },
                undecided: [{ reason: 'schema-unrecognised', count: 1, detail: [String(e?.message ?? e)] }],
                toolError: true,
            });
        }
    }
    return out;
}

async function main() {
    const a = parseArgs(process.argv.slice(2));

    if (a.batch) {
        const munis = JSON.parse(readFileSync(resolve(process.cwd(), a.batch), 'utf8'));
        const rows = await runBatch(munis, { deep: a.deep, offline: a.offline });
        const dir = resolve(HERE, a.out ?? 'reports');
        mkdirSync(dir, { recursive: true });
        const f = join(dir, 'cold-start.jsonl');
        writeFileSync(f, rows.map((r) => JSON.stringify(r)).join('\n') + '\n');
        console.log(`wrote ${f} — ${rows.length} cold-start records`);
        const tally = (k) => rows.reduce((m, r) => { const v = r.skipped ? 'skipped' : (r[k]?.value ?? r[k] ?? 'Unknown'); m[v] = (m[v] ?? 0) + 1; return m; }, {});
        console.log('publishedGisService', tally('publishedGisService'));
        console.log('digitalPgou        ', tally('digitalPgou'));
        console.log('tierSignal         ', tally('tierSignal'));
        console.log('⚠ `Unknown` is NOT `No`. Do not collapse them when aggregating.');
        return;
    }

    let muni = a.city ? MUNICIPALITIES[a.city] : null;
    if (!muni && a.endpoints && a.centroid) {
        muni = {
            name: a.name ?? 'ad-hoc', cc: '??', ineCode: null, jurisdictionId: null, centroid: a.centroid,
            endpoints: a.endpoints.split(',').map((s, i) => {
                const [svc, ...rest] = s.split('=');
                return { id: `adhoc-${i}`, service: svc.toUpperCase(), publisher: null, url: rest.join('=') };
            }),
            candidateHosts: [],
        };
    }
    if (!muni) {
        console.error(`usage: discover.mjs --city <${Object.keys(MUNICIPALITIES).join('|')}> [--deep N] [--offline] [--out DIR] [--top N]`);
        console.error('   or: discover.mjs --endpoints wfs=URL[,wms=URL] --centroid LAT,LON [--name NAME]');
        process.exit(2);
    }

    // Fixture capture: write the raw capabilities bytes so the suite can replay them offline.
    if (a.captureFixtures) {
        const dir = resolve(HERE, 'fixtures');
        mkdirSync(dir, { recursive: true });
        for (const ep of muni.endpoints) {
            const url = ep.url + (ep.url.includes('?') ? '&' : '?')
                + (ep.service === 'WFS' ? 'service=WFS&version=2.0.0&request=GetCapabilities'
                    : ep.service === 'WMS' ? 'service=WMS&version=1.3.0&request=GetCapabilities' : 'f=json');
            const p = await probe(url);
            const f = join(dir, `${ep.id}.${ep.service === 'ArcGIS' ? 'json' : 'xml'}`);
            if (p.outcome === 'ok') { writeFileSync(f, p.body); console.log(`captured ${f} — HTTP ${p.httpStatus} ${p.contentType} ${p.bytes} B`); }
            else console.log(`NOT captured ${ep.id} — ${p.outcome} ${p.httpStatus ?? ''} ${p.error ?? ''}`);
        }
        return;
    }

    const report = await runDiscovery(muni, { deep: a.deep, offline: a.offline });
    let md = renderMarkdown(report, a.top);
    if (a.coldStart) {
        report.coldStart = coldStartRecord(report);
        console.log(JSON.stringify(report.coldStart, null, 2));
    }
    const targets = ACID_TEST_TARGETS[a.city];
    if (targets) {
        report.acidTest = acidTest(report, targets);
        report.falseNegative = falseNegativeRate(report, targets);
        md += '\n## Acid test — the datasets humans missed\n\n'
            + `${ACID_TEST_LIMIT}\n\n`
            + '| layer | rank | of | percentile | kind | MR | LA | reusable | verdict |\n|---|---:|---:|---:|---|---:|---:|:---:|---|\n'
            + report.acidTest.map((t) => `| \`${t.layer}\` | ${t.rank ?? '—'} | ${t.of} | ${t.percentile ?? '—'} | ${t.kind ?? '—'} | ${t.machineReadability ?? '—'} | ${t.legalAuthority ?? '—'} | ${t.reusableGeometry ? '✅' : ''} | ${t.verdict} |`).join('\n')
            + '\n';
    }
    if (a.out) {
        mkdirSync(resolve(HERE, a.out), { recursive: true });
        const slug = (a.city ?? 'adhoc');
        writeFileSync(resolve(HERE, a.out, `${slug}.discovery.json`), JSON.stringify(report, null, 2));
        writeFileSync(resolve(HERE, a.out, `${slug}.discovery.md`), md);
        console.log(`wrote ${resolve(HERE, a.out, `${slug}.discovery.json`)}`);
    }
    console.log(md);
}

// Import-safe: the CLI runs only when invoked directly (mirrors heightSources.mjs).
if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
    main().catch((e) => { console.error(e); process.exit(1); });
}
