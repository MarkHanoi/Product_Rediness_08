// §ANDALUCIA-ENVELOPE-MAX / step 9b — sig.malaga.eu is FLAKY (intermittent HTTP 0 on the same
// URL that answered 200 seconds earlier). ⛔ A transport failure is not an absent schema. Retry
// with backoff, and DUMP THE RAW DescribeFeatureType body rather than trusting one regex.
import { get } from './lib.mjs';
import { writeFileSync } from 'node:fs';

const GS = 'https://sig.malaga.eu/geoserver/wfs';
async function retry(url, n = 6) {
    let last;
    for (let i = 0; i < n; i++) {
        const r = await get(url, { timeout: 120000 });
        if (r.ok && r.bytes > 0) return { ...r, attempts: i + 1 };
        last = r;
        await new Promise(z => setTimeout(z, 2500 * (i + 1)));
    }
    return { ...last, attempts: n };
}

const LAYERS = ['muralPGOU:POLCALIF_T', 'muralPGOU:LINALIN_T', 'muralPGOU:DENOMPGOUAPR_V',
    'muralPGOU:DENOMPGOUEXP_V', 'muralPGOU:DENOMPGOUTRM_V', 'muralPGOU:EXPCONSULTA_V',
    'muralPGOU:EXPTOPO_V', 'muralPGOU:TEXTOPON_T'];

const out = { measuredAt: new Date().toISOString(), service: GS, transport: 'sig.malaga.eu intermittently drops connections; every call retried up to 6× with backoff', layers: {} };
for (const tn of LAYERS) {
    const r = await retry(`${GS}?service=WFS&version=2.0.0&request=DescribeFeatureType&typeNames=${encodeURIComponent(tn)}`);
    const els = [...r.body.matchAll(/<xsd:element\b([^>]*)\/?>/g)].map(m => {
        const a = m[1];
        return { name: (a.match(/name="([^"]*)"/) || [])[1], type: (a.match(/type="([^"]*)"/) || [])[1], raw: a.trim() };
    });
    const hits = await retry(`${GS}?service=WFS&version=2.0.0&request=GetFeature&typeNames=${encodeURIComponent(tn)}&resultType=hits`);
    const n = Number((hits.body.match(/numberMatched="(\d+)"/) || [])[1] ?? NaN);
    out.layers[tn] = { status: r.status, attempts: r.attempts, bytes: r.bytes, elements: els, rawBody: r.body.slice(0, 4000), numberMatched: n, hitsBody: hits.body.slice(0, 400) };
    console.log(`\n=== ${tn} === HTTP ${r.status} (${r.attempts} attempts) ${r.bytes}B  numberMatched=${n}`);
    for (const e of els) console.log(`   ${String(e.name).padEnd(24)} ${e.type}`);
    if (!els.length) console.log('   RAW:', r.body.replace(/\s+/g, ' ').slice(0, 1200));
}
writeFileSync(new URL('./out/09b-malaga-dft-raw.json', import.meta.url), JSON.stringify(out, null, 2));
console.log('\nwrote out/09b-malaga-dft-raw.json');
