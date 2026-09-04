/**
 * @file docs/04-reference/jurisdictions/parcel-reach-probe.mjs
 * @description LANE PARCEL-REACH round 4 (2026-09-04) — the re-runnable probe behind
 *   PARCEL-SELECT-COVERAGE.md. It measures, per row, the TWO questions the founder asked
 *   separately and that this repo kept collapsing into one:
 *
 *     ARM U (UPSTREAM)  — does the national/state cadastre ANSWER, keylessly, at a real urban
 *                         point? Records the verbatim HTTP status, content-type, byte count.
 *     ARM E (END-TO-END)— does a PRYZM CLICK reach it? Drives `resolveEuParcelOutcome`, the exact
 *                         function `/api/parcel/:cc` calls, and reports the normalised parcel
 *                         (identifier + area + ring vertex count). A bbox-routed registry row is
 *                         NOT a working click; this arm is what proves the difference.
 *
 * ⛔ NEVER report a row this script did not print. Rows with no leg are probed by ARM D (direct)
 *    or are listed as ABSENT — never inferred.
 *
 * RUN:
 *   node docs/04-reference/jurisdictions/parcel-reach-probe.mjs             # every arm
 *   node docs/04-reference/jurisdictions/parcel-reach-probe.mjs eu          # ARM U+E, legged rows
 *   node docs/04-reference/jurisdictions/parcel-reach-probe.mjs prod        # ARM P (pryzm.fly.dev)
 *   node docs/04-reference/jurisdictions/parcel-reach-probe.mjs direct      # ARM D (unlegged)
 *   node docs/04-reference/jurisdictions/parcel-reach-probe.mjs eu lv,ee,pl # a subset
 */
import { EU_CADASTRE_SOURCES, resolveEuParcelOutcome } from '../../../server/jurisdiction/euCadastreProxy.js';

/** One real URBAN point per leg — a city centre, never a bbox centroid (which lands in a field). */
export const PROBE_POINTS = {
    // ── Europe ────────────────────────────────────────────────────────────────────────────
    fr: ['Paris', 48.8566, 2.3522],
    nl: ['Amsterdam', 52.3676, 4.9041],
    no: ['Oslo', 59.9139, 10.7522],
    ch: ['Zürich', 47.3769, 8.5417],
    pt: ['Lisboa', 38.7223, -9.1393],
    cz: ['Praha', 50.0755, 14.4378],
    ie: ['Dublin', 53.3498, -6.2603],
    at: ['Wien', 48.2082, 16.3738],
    it: ['Roma', 41.9028, 12.4964],
    bg: ['Sofia', 42.6977, 23.3219],
    'be-vlg': ['Antwerpen', 51.2194, 4.4025],
    gb: ['London', 51.5074, -0.1278],
    ee: ['Tallinn', 59.437, 24.7536],
    lu: ['Luxembourg City', 49.6116, 6.1319],
    lt: ['Vilnius', 54.6872, 25.2797],
    pl: ['Warszawa', 52.2297, 21.0122],
    lv: ['Rīga', 56.9496, 24.1052],
    hr: ['Zagreb', 45.815, 15.9819],
    gr: ['Athina', 37.9838, 23.7275],
    si: ['Ljubljana', 46.0569, 14.5058],
    sk: ['Bratislava', 48.1486, 17.1077],
    // ── Germany, per Land ─────────────────────────────────────────────────────────────────
    'de-nrw': ['Düsseldorf', 51.2277, 6.7735],
    'de-bw': ['Stuttgart', 48.7758, 9.1829],
    'de-he': ['Frankfurt am Main', 50.1109, 8.6821],
    'de-ni': ['Hannover', 52.3759, 9.732],
    'de-sn': ['Dresden', 51.0504, 13.7373],
    'de-sh': ['Kiel', 54.3233, 10.1228],
    'de-bb': ['Potsdam', 52.3906, 13.0645],
    'de-st': ['Magdeburg', 52.1205, 11.6276],
    'de-mv': ['Schwerin', 53.6355, 11.4012],
    'de-sl': ['Saarbrücken', 49.2402, 6.9969],
    'de-hh': ['Hamburg', 53.5511, 9.9937],
    'de-rp': ['Mainz', 49.9929, 8.2473],
    'de-th': ['Erfurt', 50.9787, 11.0328],
    'de-hb': ['Bremen', 53.0793, 8.8017],
    'de-be': ['Berlin', 52.52, 13.405],
    // ── USA ───────────────────────────────────────────────────────────────────────────────
    'us-nyc': ['New York, NY', 40.7128, -74.006],
    'us-sf': ['San Francisco, CA', 37.7749, -122.4194],
    'us-chi': ['Chicago, IL', 41.8781, -87.6298],
    'us-ma': ['Boston, MA', 42.3601, -71.0589],
    'us-fl': ['Miami, FL', 25.7617, -80.1918],
    'us-wa-king': ['Seattle, WA', 47.6062, -122.3321],
    'us-tx-harris': ['Houston, TX', 29.7604, -95.3698],
    // ── Australia ─────────────────────────────────────────────────────────────────────────
    'au-nsw': ['Sydney', -33.8688, 151.2093],
    'au-vic': ['Melbourne', -37.8136, 144.9631],
    'au-qld': ['Brisbane', -27.4698, 153.0251],
    'au-sa': ['Adelaide', -34.9285, 138.6007],
    'au-tas': ['Hobart', -42.8821, 147.3272],
    'au-act': ['Canberra', -35.2809, 149.13],
    // ── Middle East ───────────────────────────────────────────────────────────────────────
    tr: ['İstanbul', 41.0082, 28.9784],
    qa: ['Doha', 25.2854, 51.531],
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** A `fetchImpl` that records the VERBATIM wire facts of every upstream call it forwards. */
function recordingFetch(log) {
    return async (url, init) => {
        const t0 = Date.now();
        try {
            const res = await fetch(url, init);
            const clone = res.clone();
            let bytes = -1;
            try { bytes = (await clone.text()).length; } catch { /* body already drained */ }
            log.push({
                url: String(url).slice(0, 300),
                status: res.status,
                contentType: res.headers.get('content-type') ?? '(none)',
                bytes,
                ms: Date.now() - t0,
            });
            return res;
        } catch (e) {
            log.push({
                url: String(url).slice(0, 300),
                status: 'NETWORK-ERROR',
                contentType: String(e && e.message ? e.message : e).slice(0, 160),
                bytes: -1,
                ms: Date.now() - t0,
            });
            throw e;
        }
    };
}

/** ARM U + ARM E for one leg key. */
async function probeLeg(cc) {
    const pt = PROBE_POINTS[cc];
    if (!pt) return { cc, skip: 'NO PROBE POINT DEFINED' };
    const [city, lat, lon] = pt;
    const wire = [];
    let out;
    try {
        out = await resolveEuParcelOutcome(cc, lon, lat, { fetchImpl: recordingFetch(wire) });
    } catch (e) {
        out = { outcome: 'THREW', parcel: null, err: String(e && e.message ? e.message : e) };
    }
    const w = wire[wire.length - 1] ?? null;
    const p = out.parcel;
    return {
        cc,
        city,
        lat,
        lon,
        outcome: out.outcome,
        http: w ? w.status : '(no upstream call — guard rejected)',
        contentType: w ? w.contentType : '—',
        bytes: w ? w.bytes : -1,
        ms: w ? w.ms : 0,
        calls: wire.length,
        polygon: p && Array.isArray(p.ring) && p.ring.length >= 4 ? `YES (${p.ring.length} vertices)` : 'NO',
        refcat: p ? String(p.refcat) : null,
        areaM2: p && Number.isFinite(p.areaM2) ? Math.round(p.areaM2) : null,
        address: p && p.address ? String(p.address).slice(0, 80) : null,
        firstVertex: p && p.ring && p.ring[0] ? `${p.ring[0].lat.toFixed(6)},${p.ring[0].lon.toFixed(6)}` : null,
    };
}

function printLeg(r) {
    if (r.skip) { console.log(`  ${r.cc.padEnd(14)} SKIP — ${r.skip}`); return; }
    console.log(
        `  ${r.cc.padEnd(14)} ${String(r.outcome).padEnd(12)} HTTP ${String(r.http).padEnd(14)} ` +
        `${String(r.contentType).slice(0, 46).padEnd(46)} ${String(r.bytes).padStart(8)}B ${String(r.ms).padStart(6)}ms`,
    );
    console.log(
        `  ${' '.repeat(14)} @ ${r.city} (${r.lat},${r.lon})  polygon=${r.polygon}  ` +
        `id=${r.refcat ?? '—'}  area=${r.areaM2 ?? '—'} m²  addr=${r.address ?? '—'}  v0=${r.firstVertex ?? '—'}`,
    );
}

/** ARM P — the PRODUCTION click path: exactly what the browser calls. */
async function probeProd(path, lat, lon, base) {
    const url = `${base}${path}${path.includes('?') ? '&' : '?'}lon=${lon}&lat=${lat}`;
    const t0 = Date.now();
    try {
        const res = await fetch(url, { headers: { accept: 'application/json' } });
        const txt = await res.text();
        let j = null;
        try { j = JSON.parse(txt); } catch { /* not json */ }
        const parcel = j && j.parcel ? j.parcel : null;
        return {
            url, status: res.status, contentType: res.headers.get('content-type') ?? '(none)',
            ms: Date.now() - t0, bytes: txt.length,
            polygon: parcel && Array.isArray(parcel.ring) && parcel.ring.length >= 4
                ? `YES (${parcel.ring.length} vertices)` : 'NO',
            refcat: parcel ? String(parcel.refcat) : null,
            body: parcel ? null : txt.slice(0, 140).replace(/\s+/g, ' '),
        };
    } catch (e) {
        return { url, status: 'NETWORK-ERROR', contentType: String(e && e.message ? e.message : e).slice(0, 160), ms: Date.now() - t0 };
    }
}

/**
 * ARM D — DIRECT probes of candidate sources for rows with no leg. Each entry is
 * `[label, url, what-a-pass-looks-like]`. ⛔ Every URL here is one this lane actually issued;
 * none is inferred from a pattern.
 */
export const DIRECT_PROBES = [
    // ── Europe, no leg today ──────────────────────────────────────────────────────────────
    ['DK · Datafordeler Matrikel WFS (Jordstykke)', 'https://services.datafordeler.dk/MATRIKEL/MatrikelGaeldendeOgForeloebigWFS/1.0.0/WFS?service=WFS&version=1.1.0&request=GetFeature&typename=mat:Jordstykke&count=1', 'a Jordstykke feature without credentials'],
    ['DK · DAWA jordstykker (keyless)', 'https://api.dataforsyningen.dk/jordstykker?x=12.5683&y=55.6761&srid=4326&format=json', 'the matrikelnummer at the point'],
    ['SE · Lantmäteriet Fastighetsindelning WFS', 'https://api.lantmateriet.se/distribution/produkter/fastighetsindelning/v1/wfs?service=WFS&version=2.0.0&request=GetCapabilities', 'capabilities without OAuth'],
    ['FI · MML kiinteistöjaotus WFS', 'https://avoin-paikkatieto.maanmittauslaitos.fi/geographic-names/features/v1/collections', 'a keyless collection listing'],
    ['FI · MML kiinteistorekisterikartta OGC API', 'https://avoin-paikkatieto.maanmittauslaitos.fi/kiinteisto-avoin/features/v1/collections?api-key=', 'the collections list; api-key requirement'],
    ['HU · Lechner INSPIRE CP WFS', 'https://inspire.lechnerkozpont.hu/geoserver/cp/wfs?service=WFS&version=2.0.0&request=GetCapabilities', 'a CadastralParcel feature type'],
    ['RO · ANCPI eTerra3 INSPIRE', 'https://geoportal.ancpi.ro/arcgis/rest/services?f=json', 'a public service directory'],
    ['BE-BRU · Brussels UrbIS / CIRB parcels', 'https://geoservices-urbis.irisnet.be/geoserver/ows?service=WFS&version=2.0.0&request=GetCapabilities', 'a cadastral parcel feature type'],
    ['BE-WAL · Wallonia WFS cadastre', 'https://geoservices.wallonie.be/arcgis/rest/services?f=json', 'a public service directory'],
    ['GB-SCT · Registers of Scotland INSPIRE', 'https://ros-inspire-services.azurewebsites.net/geoserver/ows?service=WFS&version=2.0.0&request=GetCapabilities', 'a cadastral parcel feature type'],
    ['IS · Ísland Landmælingar / HMS fasteignaskrá', 'https://gagnaveita.hms.is/', 'a keyless parcel service'],
    ['RS · Serbia RGZ Geosrbija', 'https://opendata.geosrbija.rs/', 'a keyless parcel service'],
    ['UA · Ukraine StateGeoCadastre', 'https://e.land.gov.ua/', 'a keyless parcel service'],
    ['CY · Cyprus DLS portal', 'https://eservices.dls.moi.gov.cy/', 'a keyless parcel service'],
    ['MT · Malta land registry / MapServer', 'https://msdi.data.gov.mt/geoserver/ows?service=WFS&version=2.0.0&request=GetCapabilities', 'a cadastral parcel feature type'],
    // ── USA nationals — is there ONE national parcel service? ──────────────────────────────
    ['US · FEMA/NGDA "National Parcel" (does it exist?)', 'https://services.arcgis.com/P3ePLMYs2RVChkJx/arcgis/rest/services?f=json', 'a federal parcel layer'],
    ['US · BLM National Surface Management Agency', 'https://gis.blm.gov/arcgis/rest/services?f=json', 'federal-land polygons (NOT private parcels)'],
    ['US · Regrid national parcel API (commercial)', 'https://app.regrid.com/api/v1/search.json?query=test', 'the licence wall'],
    ['US-CA · statewide parcel service?', 'https://gis.data.ca.gov/', 'a statewide parcel layer'],
    ['US-NY · NYS ITS GIS parcel service', 'https://gisservices.its.ny.gov/arcgis/rest/services?f=json', 'a statewide tax-parcel layer'],
    // ── Middle East ───────────────────────────────────────────────────────────────────────
    ['AE-DXB · Dubai Municipality GeoHub', 'https://gis.dubai.gov.ae/arcgis/rest/services?f=json', 'a public parcel/plot layer'],
    ['AE-DXB · Dubai Pulse / DLD open data', 'https://www.dubaipulse.gov.ae/', 'a keyless parcel dataset'],
    ['AE-AUH · Abu Dhabi Spatial Data (ADSIC)', 'https://sdi.abudhabi.ae/', 'a keyless parcel service'],
    ['SA · Balady municipal cadastre (WAF check)', 'https://balady.gov.sa/', 'reachability from a non-SA egress'],
    ['SA · MOMRAH / Saudi National GeoPortal', 'https://saudigeoportal.gov.sa/', 'a keyless parcel service'],
    ['KW · Kuwait PACI / KGD', 'https://gis.paci.gov.kw/arcgis/rest/services?f=json', 'a public parcel layer'],
    ['BH · Bahrain SLRB / Bahrain GIS', 'https://www.gis.gov.bh/', 'a keyless parcel service'],
    ['OM · Oman NSDI / MoH', 'https://omanmaps.gov.om/', 'a keyless parcel service'],
    ['JO · Jordan DLS', 'https://www.dls.gov.jo/', 'a keyless parcel service'],
    ['LB · Lebanon land registry', 'https://www.finance.gov.lb/', 'a keyless parcel service'],
];

async function probeDirect([label, url, expect]) {
    const t0 = Date.now();
    try {
        const res = await fetch(url, {
            redirect: 'follow',
            headers: { 'user-agent': 'PRYZM-parcel-reach-probe/1.0 (+https://pryzm.fly.dev)', accept: '*/*' },
            signal: AbortSignal.timeout(25000),
        });
        const txt = await res.text();
        return {
            label, url, expect, status: res.status, contentType: res.headers.get('content-type') ?? '(none)',
            bytes: txt.length, ms: Date.now() - t0,
            head: txt.slice(0, 220).replace(/\s+/g, ' '),
            wwwAuth: res.headers.get('www-authenticate') ?? null,
            server: res.headers.get('server') ?? null,
        };
    } catch (e) {
        return { label, url, expect, status: 'NETWORK-ERROR', contentType: String(e && e.message ? e.message : e).slice(0, 200), bytes: -1, ms: Date.now() - t0 };
    }
}

// ══════════════════════════════════════════════════════════════════════════════════════════
const argv = process.argv.slice(2);
const arms = argv.length === 0 ? ['eu', 'prod', 'direct'] : [argv[0]];
const only = argv[1] ? new Set(argv[1].split(',')) : null;
const PROD = process.env.PRYZM_BASE ?? 'https://pryzm.fly.dev';

console.log(`# PARCEL-REACH probe — ${new Date().toISOString()}  (node ${process.version})`);

if (arms.includes('eu')) {
    const keys = Object.keys(EU_CADASTRE_SOURCES).filter((k) => !only || only.has(k));
    console.log(`\n## ARM U+E — ${keys.length} legs in EU_CADASTRE_SOURCES, driven through resolveEuParcelOutcome\n`);
    for (const cc of keys) {
        printLeg(await probeLeg(cc));
        await sleep(250);
    }
}

if (arms.includes('prod')) {
    console.log(`\n## ARM P — the PRODUCTION click path on ${PROD}\n`);
    const paths = Object.keys(EU_CADASTRE_SOURCES).map((cc) => [cc, `/api/parcel/${cc}`])
        .concat([['dk', '/api/parcel/dk'], ['fi', '/api/parcel/fi'], ['il', '/api/parcel/il'],
                 ['es', '/api/catastro/parcel']]);
    for (const [cc, path] of paths) {
        if (only && !only.has(cc)) continue;
        const pt = PROBE_POINTS[cc] ?? (cc === 'dk' ? ['København', 55.6761, 12.5683]
            : cc === 'fi' ? ['Helsinki', 60.1699, 24.9384]
            : cc === 'il' ? ['Tel Aviv', 32.0853, 34.7818]
            : cc === 'es' ? ['Madrid', 40.4168, -3.7038] : null);
        if (!pt) { console.log(`  ${cc.padEnd(14)} SKIP — no probe point`); continue; }
        const r = await probeProd(path, pt[1], pt[2], PROD);
        console.log(`  ${cc.padEnd(14)} HTTP ${String(r.status).padEnd(14)} ${String(r.contentType).slice(0, 40).padEnd(40)} ` +
            `${String(r.ms).padStart(6)}ms  polygon=${r.polygon ?? '—'}  id=${r.refcat ?? '—'}${r.body ? `  body=${r.body}` : ''}`);
        await sleep(200);
    }
}

if (arms.includes('direct')) {
    console.log(`\n## ARM D — DIRECT probes for rows with no leg\n`);
    for (const p of DIRECT_PROBES) {
        if (only && !only.has(p[0].split(' ')[0].toLowerCase())) continue;
        const r = await probeDirect(p);
        console.log(`  ${r.label}`);
        console.log(`    ${r.url}`);
        console.log(`    HTTP ${r.status}  ct=${r.contentType}  ${r.bytes}B  ${r.ms}ms` +
            `${r.server ? `  server=${r.server}` : ''}${r.wwwAuth ? `  www-authenticate=${r.wwwAuth}` : ''}`);
        if (r.head) console.log(`    head: ${r.head}`);
        await sleep(300);
    }
}

console.log('\n# done');
