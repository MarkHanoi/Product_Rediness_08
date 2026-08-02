// §ANDALUCIA-ENVELOPE-MAX / step 1 — COACo (Córdoba) SCHEMA SCOPE.
// Dumps the FULL field union for every layer. A regex that does not match is not an absent field,
// so we take the schema from DescribeFeatureType AND from a real feature sample, and union them.
import { get, getJson } from './lib.mjs';
import { writeFileSync, mkdirSync } from 'node:fs';

const GS = 'https://geoserver.pgou.coacordoba.org/geoserver/wfs';
const LAYERS = ['ordenanzas', 'usos_globales', 'usos_dotacionales', 'hojas_cus', 'vcatastro_urbanismo',
    'distritos', 'actuaciones', 'vbuilding', 'vhex25_max_plantas'];

const out = { measuredAt: new Date().toISOString(), service: GS, layers: {} };

for (const L of LAYERS) {
    const tn = `coaco:${L}`;
    const dft = await get(`${GS}?service=WFS&version=2.0.0&request=DescribeFeatureType&typeNames=${tn}`);
    const schema = [...dft.body.matchAll(/<xsd:element[^>]*name="([^"]+)"[^>]*type="([^"]+)"/g)]
        .map(m => ({ name: m[1], type: m[2] }));
    // hits: real count via resultType=hits
    const hits = await get(`${GS}?service=WFS&version=2.0.0&request=GetFeature&typeNames=${tn}&resultType=hits`);
    const n = Number((hits.body.match(/numberMatched="(\d+)"/) || [])[1] ?? NaN);
    // sample 5 real features so we see the ACTUAL key union, not just the declared one
    const s = await getJson(`${GS}?service=WFS&version=2.0.0&request=GetFeature&typeNames=${tn}`
        + '&outputFormat=application/json&count=5');
    const observed = new Set();
    for (const f of s.json?.features ?? []) for (const k of Object.keys(f.properties ?? {})) observed.add(k);
    out.layers[L] = {
        dftStatus: dft.status, hitsStatus: hits.status, numberMatched: n,
        declaredFields: schema, observedFields: [...observed],
        sampleProps: s.json?.features?.slice(0, 3).map(f => f.properties) ?? null,
        sampleErr: s.parseError ?? null,
    };
    console.log(`${L.padEnd(24)} n=${String(n).padStart(7)} declared=${schema.length} observed=${observed.size}`);
    console.log('   declared:', schema.map(f => `${f.name}:${f.type.replace('xsd:', '')}`).join(' '));
}

mkdirSync(new URL('./out/', import.meta.url), { recursive: true });
writeFileSync(new URL('./out/01-coaco-schema.json', import.meta.url), JSON.stringify(out, null, 2));
console.log('\nwrote out/01-coaco-schema.json');
