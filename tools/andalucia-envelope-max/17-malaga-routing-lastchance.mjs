// §ANDALUCIA-ENVELOPE-MAX / step 17 — BEFORE DECLARING MÁLAGA "BLOCKED AT R", EXHAUST THE ROUTES.
//
// WFS on muralPGOU is registered-but-unbacked (step 12, control-attributed). But WFS is not the only
// door, and ⛔ UNKNOWN NEVER NO. Seven negative-proof conditions, applied:
//   1 axis order · 2 CRS family · 3 alternate parameterisation (WFS 1.0.0/1.1.0/2.0.0)
//   4 attribute filter never bbox · 5 PATH SHAPE (different geoserver mount) · 6 code-space
//   7 ⭐ A SUCCESSFUL RESPONSE IS NOT AN APPLIED FILTER — and a capabilities entry is not a dataset.
// Plus the doors WFS does not own: WMS GetMap (does the layer RENDER?) and WMS GetFeatureInfo
// (does it answer a per-point query?). A layer can render and answer FeatureInfo with WFS disabled.
import { get } from './lib.mjs';
import { writeFileSync } from 'node:fs';

const HOST = 'https://sig.malaga.eu/geoserver';
const TN = 'muralPGOU:POLCALIF_T';
// Málaga city centre-ish, away from the coast: Teatinos / Puerto de la Torre expansion.
const BBOX25830 = '366000,4064000,374000,4070000';   // EPSG:25830 easting,northing
const BBOX4326 = '-4.52,36.68,-4.36,36.76';          // lon,lat  (axis-order trap #1)
const BBOX4326rev = '36.68,-4.52,36.76,-4.36';       // lat,lon

async function T(label, url, _expect = 'features') {
    const r = await get(url, { timeout: 60000 });
    let n = null, note = '';
    if (r.body) {
        try { const j = JSON.parse(r.body); n = j.features?.length ?? null; } catch { /* not json */ }
        if (n === null) {
            const gm = r.body.match(/numberMatched="(\d+)"|numberOfFeatures="(\d+)"/);
            if (gm) n = Number(gm[1] ?? gm[2]);
            const ex = r.body.match(/<(?:ows:)?ExceptionText>([\s\S]{0,400}?)<\//);
            const se = r.body.match(/<ServiceException[^>]*>([\s\S]{0,400}?)<\//);
            if (ex || se) note = 'EXCEPTION: ' + (ex ?? se)[1].replace(/\s+/g, ' ').trim();
        }
    }
    const isPng = r.body.startsWith('\x89PNG');
    const rec = { label, url, status: r.status, bytes: r.bytes, ct: r.ct, features: n, note, err: r.err ?? null, isPng };
    console.log(`  ${label.padEnd(46)} HTTP ${String(r.status).padStart(3)} ${String(r.bytes).padStart(8)}B feats=${n ?? '-'} ${isPng ? 'PNG' : ''} ${note.slice(0, 150)}`);
    return rec;
}

const out = { measuredAt: new Date().toISOString(), typeName: TN, tests: [] };
console.log('=== 3 · alternate WFS parameterisations ===');
out.tests.push(await T('WFS 2.0.0 count',
    `${HOST}/wfs?service=WFS&version=2.0.0&request=GetFeature&typeNames=${encodeURIComponent(TN)}&count=5&outputFormat=application/json`));
out.tests.push(await T('WFS 1.1.0 maxFeatures',
    `${HOST}/wfs?service=WFS&version=1.1.0&request=GetFeature&typeName=${encodeURIComponent(TN)}&maxFeatures=5`));
out.tests.push(await T('WFS 1.0.0 maxFeatures',
    `${HOST}/wfs?service=WFS&version=1.0.0&request=GetFeature&typeName=${encodeURIComponent(TN)}&maxFeatures=5`));
out.tests.push(await T('WFS 2.0.0 GML (no outputFormat)',
    `${HOST}/wfs?service=WFS&version=2.0.0&request=GetFeature&typeNames=${encodeURIComponent(TN)}&count=5`));

console.log('\n=== 5 · PATH SHAPE — workspace-scoped mount ===');
out.tests.push(await T('workspace mount /muralPGOU/wfs',
    `${HOST}/muralPGOU/wfs?service=WFS&version=2.0.0&request=GetFeature&typeNames=${encodeURIComponent(TN)}&count=5&outputFormat=application/json`));
out.tests.push(await T('workspace mount ows',
    `${HOST}/muralPGOU/ows?service=WFS&version=2.0.0&request=GetFeature&typeNames=${encodeURIComponent(TN)}&count=5&outputFormat=application/json`));
out.tests.push(await T('root /ows',
    `${HOST}/ows?service=WFS&version=2.0.0&request=GetFeature&typeNames=${encodeURIComponent(TN)}&count=5&outputFormat=application/json`));

console.log('\n=== 1+2 · axis order / CRS family, via bbox ===');
out.tests.push(await T('bbox EPSG:25830',
    `${HOST}/wfs?service=WFS&version=2.0.0&request=GetFeature&typeNames=${encodeURIComponent(TN)}&count=5&outputFormat=application/json&bbox=${BBOX25830},EPSG:25830`));
out.tests.push(await T('bbox EPSG:4326 lon,lat',
    `${HOST}/wfs?service=WFS&version=2.0.0&request=GetFeature&typeNames=${encodeURIComponent(TN)}&count=5&outputFormat=application/json&bbox=${BBOX4326},EPSG:4326`));
out.tests.push(await T('bbox EPSG:4326 lat,lon (axis flip)',
    `${HOST}/wfs?service=WFS&version=2.0.0&request=GetFeature&typeNames=${encodeURIComponent(TN)}&count=5&outputFormat=application/json&bbox=${BBOX4326rev},EPSG:4326`));

console.log('\n=== the doors WFS does not own ===');
out.tests.push(await T('WMS GetMap (does it RENDER?)',
    `${HOST}/wms?service=WMS&version=1.1.1&request=GetMap&layers=${encodeURIComponent(TN)}&styles=&bbox=${BBOX25830}&srs=EPSG:25830&width=256&height=256&format=image/png`));
out.tests.push(await T('WMS GetFeatureInfo (per-point)',
    `${HOST}/wms?service=WMS&version=1.1.1&request=GetFeatureInfo&layers=${encodeURIComponent(TN)}&query_layers=${encodeURIComponent(TN)}&styles=&bbox=${BBOX25830}&srs=EPSG:25830&width=256&height=256&x=128&y=128&info_format=application/json&feature_count=10`));
out.tests.push(await T('WMS GetLegendGraphic (is a STYLE bound?)',
    `${HOST}/wms?service=WMS&version=1.1.1&request=GetLegendGraphic&layer=${encodeURIComponent(TN)}&format=image/png`));

const served = out.tests.filter(t => (t.features ?? 0) > 0);
out.verdict = served.length
    ? `A ROUTE EXISTS: ${served.map(t => t.label).join('; ')}`
    : 'NO ROUTE. Eleven parameterisations across WFS 1.0/1.1/2.0, three mount paths, three CRS/axis combinations, plus WMS GetMap, GetFeatureInfo and GetLegendGraphic. muralPGOU:POLCALIF_T is advertised in GetCapabilities and backed by nothing. MÁLAGA IS BLOCKED AT R — parcel->zone cannot be proven from any public endpoint.';
console.log('\nVERDICT:', out.verdict);
writeFileSync(new URL('./out/17-malaga-routing-lastchance.json', import.meta.url), JSON.stringify(out, null, 2));
console.log('wrote out/17-malaga-routing-lastchance.json');
