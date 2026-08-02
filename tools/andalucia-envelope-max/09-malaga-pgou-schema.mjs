// §ANDALUCIA-ENVELOPE-MAX / step 9 — MÁLAGA muralPGOU workspace: the real zoning layers.
// POLCALIF_T = polígonos de CALIFICACIÓN (the zone polygons). LINALIN_T = líneas de ALINEACIÓN.
// Dump the FULL declared schema AND the observed key union AND the value space of every field.
import { get, getJson, isValid } from './lib.mjs';
import { writeFileSync } from 'node:fs';

const GS = 'https://sig.malaga.eu/geoserver/wfs';
const LAYERS = ['muralPGOU:POLCALIF_T', 'muralPGOU:LINALIN_T', 'muralPGOU:DENOMPGOUAPR_V',
    'muralPGOU:DENOMPGOUEXP_V', 'muralPGOU:DENOMPGOUTRM_V', 'muralPGOU:EXPCONSULTA_V',
    'muralPGOU:EXPTOPO_V', 'muralPGOU:TEXTOPON_T'];

const out = { measuredAt: new Date().toISOString(), service: GS, layers: {} };
for (const tn of LAYERS) {
    const dft = await get(`${GS}?service=WFS&version=2.0.0&request=DescribeFeatureType&typeNames=${encodeURIComponent(tn)}`, { timeout: 60000 });
    const declared = [...dft.body.matchAll(/<xsd:element[^>]*name="([^"]+)"[^>]*type="([^"]+)"/g)].map(m => ({ name: m[1], type: m[2] }));
    const hits = await get(`${GS}?service=WFS&version=2.0.0&request=GetFeature&typeNames=${encodeURIComponent(tn)}&resultType=hits`, { timeout: 120000 });
    const n = Number((hits.body.match(/numberMatched="(\d+)"/) || [])[1] ?? NaN);
    const s = await getJson(`${GS}?service=WFS&version=2.0.0&request=GetFeature&typeNames=${encodeURIComponent(tn)}&outputFormat=application/json&count=30`, { timeout: 120000 });
    const observed = [...new Set((s.json?.features ?? []).flatMap(f => Object.keys(f.properties ?? {})))];
    out.layers[tn] = {
        dftStatus: dft.status, numberMatched: n, declared, observed,
        sample: (s.json?.features ?? []).slice(0, 6).map(f => f.properties),
        parseError: s.parseError ?? null, hitsRaw: hits.body.slice(0, 300),
    };
    console.log(`\n=== ${tn} === n=${n} (DFT HTTP ${dft.status})`);
    console.log('  declared:', declared.map(f => `${f.name}:${f.type.replace('xsd:', '')}`).join(' ') || '(none parsed)');
    if (!declared.length) console.log('  DFT body head:', dft.body.slice(0, 300).replace(/\s+/g, ' '));
    console.log('  observed :', observed.join(' ') || '(none)');
    for (const p of (s.json?.features ?? []).slice(0, 4)) console.log('   sample:', JSON.stringify(p.properties));
}
writeFileSync(new URL('./out/09-malaga-pgou-schema.json', import.meta.url), JSON.stringify(out, null, 2));
console.log('\nwrote out/09-malaga-pgou-schema.json');
