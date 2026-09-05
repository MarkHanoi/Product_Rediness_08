/**
 * @file docs/04-reference/jurisdictions/pt/findings/belverde-parcel-probe.mjs
 * @description §L-12912 — the re-runnable probe behind the Belverde (Seixal, PT) parcel defect.
 *
 *   Founder screenshot 2026-09-05 (production ee5d00a2): "Select parcel" at his house in the
 *   Belverde urbanisation returned a 7 670 659 m² ring covering the whole village, badged
 *   match=medium, labelled "Cadastral parcel / building footprint", with "Area computed from the
 *   ring (shoelace) — the source publishes no registry area".
 *
 *   This probe answers, with the upstream's own words, the three questions that decide the fix:
 *     ARM U (UPSTREAM) — what does DGT SNIC `inspire:cadastralparcel` serve at the click, using the
 *                        EXACT query `server/jurisdiction/euCadastreProxy.js` issues? Typename,
 *                        attributes verbatim, geometry type, parts/holes, shoelace vs `areavalue`.
 *     ARM P (PROD)     — what does https://pryzm.fly.dev/api/parcel/pt return at the same points?
 *     ARM C (CENSUS)   — how many parcels does SNIC publish in a ±1.5 km box around Belverde, and
 *                        what sizes are they? (Decides "wrong layer" vs "the lots are not there".)
 *
 *   Outputs `belverde-parcel-probe.json` next to this file. Never report a row it did not print.
 *
 * RUN:  node docs/04-reference/jurisdictions/pt/findings/belverde-parcel-probe.mjs
 *       node docs/04-reference/jurisdictions/pt/findings/belverde-parcel-probe.mjs --no-prod
 */
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HALF_DEG = 0.00035; // identical to euCadastreProxy.js
const SNIC = 'https://snicws.dgterritorio.gov.pt/geoserver/inspire/ows?service=WFS&version=2.0.0&request=GetFeature'
    + '&typeNames=inspire:cadastralparcel&srsName=EPSG:4326&outputFormat=application/json';
const PROD = 'https://pryzm.fly.dev/api/parcel/pt';

/** The founder's neighbourhood: Belverde (Seixal · Amora), plus the two neighbours the brief named. */
const POINTS = [
    ['Belverde (brief point)', 38.5720, -9.1440],
    ['Belverde NE', 38.5735, -9.1425],
    ['Belverde SW', 38.5705, -9.1460],
];
/** ±1.5 km census box around Belverde. */
const CENSUS_BBOX = { s: 38.565, w: -9.165, n: 38.592, e: -9.130 };

function ringArea(ring) { // [[lon,lat],…] → m², local equirectangular about ring[0] (same as the proxy)
    const R = 6378137, D2R = Math.PI / 180;
    const lat0 = ring[0][1], lon0 = ring[0][0], c = Math.cos(lat0 * D2R);
    const xy = ring.map(([lo, la]) => [(lo - lon0) * D2R * R * c, (la - lat0) * D2R * R]);
    let a = 0;
    for (let i = 0; i < xy.length; i++) { const p = xy[i], q = xy[(i + 1) % xy.length]; a += p[0] * q[1] - q[0] * p[1]; }
    return Math.abs(a / 2);
}
function describeFeature(f) {
    const g = f.geometry;
    const parts = g.type === 'MultiPolygon' ? g.coordinates : g.type === 'Polygon' ? [g.coordinates] : [];
    const net = parts.reduce((s, poly) => s + ringArea(poly[0]) - poly.slice(1).reduce((h, r) => h + ringArea(r), 0), 0);
    return {
        id: f.id, typename: String(f.id).split('.')[0], geometryType: g.type, parts: parts.length,
        outerVertices: parts[0]?.[0]?.length ?? 0, holes: parts.reduce((s, p) => s + p.length - 1, 0),
        shoelaceNetM2: Math.round(net), properties: f.properties,
    };
}
async function getJson(url) {
    const t0 = Date.now();
    const res = await fetch(url, { headers: { accept: 'application/json', 'user-agent': 'PRYZM-belverde-probe/1.0 (+https://pryzm.fly.dev)' } });
    const text = await res.text();
    let json = null; try { json = JSON.parse(text); } catch { /* keep null */ }
    return { status: res.status, contentType: res.headers.get('content-type'), bytes: text.length, ms: Date.now() - t0, json, textHead: json ? undefined : text.slice(0, 300) };
}

const out = { probedAt: new Date().toISOString(), points: POINTS, armU: [], armP: [], armC: null };
const noProd = process.argv.includes('--no-prod');

for (const [name, lat, lon] of POINTS) {
    const bbox = `${lat - HALF_DEG},${lon - HALF_DEG},${lat + HALF_DEG},${lon + HALF_DEG},urn:ogc:def:crs:EPSG::4326`;
    const u = await getJson(`${SNIC}&count=20&bbox=${encodeURIComponent(bbox)}`);
    const feats = (u.json?.features ?? []).map(describeFeature);
    out.armU.push({ point: name, lat, lon, http: u.status, contentType: u.contentType, bytes: u.bytes, ms: u.ms, numberMatched: u.json?.numberMatched, features: feats });
    console.log(`\n[ARM U] SNIC @ ${name} (${lat},${lon}) → HTTP ${u.status} ${u.bytes} B ${u.ms} ms · numberMatched=${u.json?.numberMatched}`);
    for (const f of feats) console.log('        ', JSON.stringify({ ...f, properties: { ...f.properties, referencepoint: f.properties?.referencepoint?.coordinates } }));

    if (!noProd) {
        const p = await getJson(`${PROD}?lat=${lat}&lon=${lon}`);
        const parcel = p.json?.parcel ?? null;
        const row = parcel ? { ...parcel, ring: undefined, ringVertices: parcel.ring?.length ?? 0 } : p.json;
        out.armP.push({ point: name, lat, lon, http: p.status, ms: p.ms, outcome: p.json?.outcome, parcel: row });
        console.log(`[ARM P] prod ${PROD}?lat=${lat}&lon=${lon} → HTTP ${p.status} ${p.ms} ms ·`, JSON.stringify(row));
    }
}

{
    const { s, w, n, e } = CENSUS_BBOX;
    const bbox = `${s},${w},${n},${e},urn:ogc:def:crs:EPSG::4326`;
    const c = await getJson(`${SNIC}&count=500&bbox=${encodeURIComponent(bbox)}`);
    const rows = (c.json?.features ?? []).map((f) => ({
        ref: f.properties.nationalcadastralreference, areavalue: f.properties.areavalue,
        shoelaceNetM2: describeFeature(f).shoelaceNetM2, outerVertices: describeFeature(f).outerVertices,
        dicofre: f.properties.administrativeunit, referencepoint: f.properties.referencepoint?.coordinates,
    })).sort((a, b) => b.areavalue - a.areavalue);
    const under2ha = rows.filter((r) => r.areavalue < 20_000).length;
    const over20ha = rows.filter((r) => r.areavalue > 200_000).length;
    out.armC = { bbox: CENSUS_BBOX, http: c.status, ms: c.ms, numberMatched: c.json?.numberMatched, parcels: rows.length, under2ha, over20ha, rows };
    console.log(`\n[ARM C] census ${JSON.stringify(CENSUS_BBOX)} → HTTP ${c.status} ${c.ms} ms · numberMatched=${c.json?.numberMatched} · ${rows.length} parcels · ${under2ha} under 2 ha · ${over20ha} over 20 ha`);
    for (const r of rows.slice(0, 8)) console.log('        ', JSON.stringify(r));
    if (rows.length > 8) console.log(`         … ${rows.length - 8} more (all in the JSON)`);
}

const here = dirname(fileURLToPath(import.meta.url));
writeFileSync(join(here, 'belverde-parcel-probe.json'), JSON.stringify(out, null, 1));
console.log(`\nwrote ${join(here, 'belverde-parcel-probe.json')}`);
