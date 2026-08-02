// §ANDALUCIA-ENVELOPE-MAX / step 11 — MÁLAGA muralPGOU:POLCALIF_T, the calificación polygons.
// ⭐ This layer's existence contradicts "Málaga serves no zoning web service". sig.malaga.eu's ROOT
// fails DNS while /geoserver/wfs answers — a dead host list is not an answer.
// The server is flaky, so every call retries. ⛔ A transport failure is not an absent schema.
import { get } from './lib.mjs';
import { writeFileSync } from 'node:fs';

const GS = 'https://sig.malaga.eu/geoserver/wfs';
async function retry(url, n = 5, timeout = 90000) {
    let last;
    for (let i = 0; i < n; i++) {
        const r = await get(url, { timeout });
        if (r.ok && r.bytes > 0) return { ...r, attempts: i + 1 };
        last = r; await new Promise(z => setTimeout(z, 2000 * (i + 1)));
    }
    return { ...last, attempts: n };
}
const TN = 'muralPGOU:POLCALIF_T';
const out = { measuredAt: new Date().toISOString(), service: GS, typeName: TN, steps: {} };

// 1. DescribeFeatureType — dump the WHOLE body, no regex trust.
const dft = await retry(`${GS}?service=WFS&version=2.0.0&request=DescribeFeatureType&typeNames=${encodeURIComponent(TN)}`);
out.steps.dft = { status: dft.status, attempts: dft.attempts, bytes: dft.bytes, body: dft.body };
console.log(`DFT HTTP ${dft.status} (${dft.attempts} attempts) ${dft.bytes}B`);
console.log(dft.body.replace(/></g, '>\n<').slice(0, 3000));

// 2. hits
const hits = await retry(`${GS}?service=WFS&version=2.0.0&request=GetFeature&typeNames=${encodeURIComponent(TN)}&resultType=hits`);
out.steps.hits = { status: hits.status, attempts: hits.attempts, body: hits.body.slice(0, 600) };
console.log('\nHITS HTTP', hits.status, '::', hits.body.replace(/\s+/g, ' ').slice(0, 400));

// 3. a real page of features — GeoJSON, then GML fallback (⛔ a 200 is not an applied filter)
const gj = await retry(`${GS}?service=WFS&version=2.0.0&request=GetFeature&typeNames=${encodeURIComponent(TN)}&outputFormat=application/json&count=25`);
out.steps.geojsonStatus = gj.status; out.steps.geojsonHead = gj.body.slice(0, 3000);
console.log('\nGEOJSON HTTP', gj.status, gj.bytes, 'B ::', gj.body.slice(0, 1200));

const gml = await retry(`${GS}?service=WFS&version=1.1.0&request=GetFeature&typeName=${encodeURIComponent(TN)}&maxFeatures=5`);
out.steps.gmlStatus = gml.status; out.steps.gmlHead = gml.body.slice(0, 4000);
console.log('\nGML HTTP', gml.status, gml.bytes, 'B ::', gml.body.replace(/></g, '>\n<').slice(0, 2500));

writeFileSync(new URL('./out/11-malaga-polcalif.json', import.meta.url), JSON.stringify(out, null, 2));
console.log('\nwrote out/11-malaga-polcalif.json');
