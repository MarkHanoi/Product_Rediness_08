// §ANDALUCIA-ENVELOPE-MAX / step 12 — IS muralPGOU DEAD, OR IS MY TRANSPORT DEAD?
//
// ⛔ A transport failure is not an absent layer. muralPGOU:POLCALIF_T returns HTTP 0 on GetFeature,
// but so might anything on a flaky host. The only sound way to attribute the failure is a CONTROL:
// a DIFFERENT layer on THE SAME GeoServer, fetched with THE SAME code, in the same run. If the
// control returns rows and muralPGOU does not, the failure is the LAYER. If both fail, it is me.
//
// ⭐ It also tests the stronger claim: A LAYER ADVERTISED IN GetCapabilities IS NOT A SERVED LAYER.
// POLCALIF_T's DescribeFeatureType returns a 445-byte schema containing ONLY the gml import and
// NO element declaration — a registered-but-unbacked GeoServer layer. That is the same shape as
// "a successful response is not an applied filter", one level up: A SUCCESSFUL CAPABILITIES
// DOCUMENT IS NOT A SERVED DATASET.
import { get } from './lib.mjs';
import { writeFileSync } from 'node:fs';

const GS = 'https://sig.malaga.eu/geoserver/wfs';
async function retry(url, n = 5, timeout = 60000) {
    const tries = [];
    for (let i = 0; i < n; i++) {
        const r = await get(url, { timeout });
        tries.push({ status: r.status, bytes: r.bytes, err: r.err ?? null });
        if (r.ok && r.bytes > 0) return { ...r, attempts: i + 1, tries };
        await new Promise(z => setTimeout(z, 1500 * (i + 1)));
    }
    return { ok: false, status: 0, bytes: 0, body: '', attempts: n, tries };
}

// CONTROL layers (non-PGOU workspaces) vs SUBJECT layers (muralPGOU).
const CONTROL = ['DatosAbiertos:da_cartografiaBarrio', 'GeoPortal:gp_museos', 'Limasa:PAPELERAS_S'];
const SUBJECT = ['muralPGOU:POLCALIF_T', 'muralPGOU:LINALIN_T', 'muralPGOU:DENOMPGOUAPR_V',
    'muralPGOU:DENOMPGOUEXP_V', 'muralPGOU:DENOMPGOUTRM_V', 'muralPGOU:EXPCONSULTA_V',
    'muralPGOU:EXPTOPO_V', 'muralPGOU:TEXTOPON_T'];

const out = { measuredAt: new Date().toISOString(), service: GS, results: {} };
for (const [group, list] of [['CONTROL', CONTROL], ['SUBJECT-muralPGOU', SUBJECT]]) {
    console.log(`\n===== ${group} =====`);
    for (const tn of list) {
        const e = encodeURIComponent(tn);
        const dft = await retry(`${GS}?service=WFS&version=2.0.0&request=DescribeFeatureType&typeNames=${e}`);
        const nEl = (dft.body.match(/<xsd:element/g) || []).length;
        const hits = await retry(`${GS}?service=WFS&version=2.0.0&request=GetFeature&typeNames=${e}&resultType=hits`);
        const n = Number((hits.body.match(/numberMatched="(\d+)"/) || [])[1] ?? NaN);
        const gj = await retry(`${GS}?service=WFS&version=2.0.0&request=GetFeature&typeNames=${e}&outputFormat=application/json&count=3`);
        let feats = null, err = null;
        try { const j = JSON.parse(gj.body); feats = j.features?.length ?? null; } catch { err = gj.body.slice(0, 300); }
        const rec = {
            group, dftStatus: dft.status, dftBytes: dft.bytes, dftElements: nEl, dftTries: dft.tries,
            hitsStatus: hits.status, numberMatched: n, hitsTries: hits.tries,
            geojsonStatus: gj.status, geojsonFeatures: feats, geojsonErr: err, geojsonTries: gj.tries,
            verdict: nEl === 0 && dft.status === 200
                ? 'REGISTERED BUT UNBACKED — GetCapabilities advertises it, DescribeFeatureType returns a schema with ZERO elements, data plane never answers'
                : feats > 0 ? 'SERVED' : 'DEGRADED/UNKNOWN',
        };
        out.results[tn] = rec;
        console.log(`  ${tn.padEnd(34)} DFT ${dft.status}/${String(dft.bytes).padStart(6)}B els=${nEl}  hits ${hits.status} n=${n}  geojson ${gj.status} feats=${feats}`);
        console.log(`      => ${rec.verdict}`);
    }
}
const ctrlOk = CONTROL.filter(t => out.results[t]?.geojsonFeatures > 0).length;
const subjOk = SUBJECT.filter(t => out.results[t]?.geojsonFeatures > 0).length;
out.attribution = ctrlOk > 0 && subjOk === 0
    ? `ATTRIBUTED TO THE LAYER: ${ctrlOk}/${CONTROL.length} control layers served rows in the same run with the same code, ${subjOk}/${SUBJECT.length} muralPGOU layers did.`
    : ctrlOk === 0 ? 'ATTRIBUTED TO TRANSPORT/SANDBOX: control layers also failed. Nothing can be concluded about muralPGOU.'
        : `MIXED: control ${ctrlOk}/${CONTROL.length}, subject ${subjOk}/${SUBJECT.length}`;
console.log('\n' + out.attribution);
writeFileSync(new URL('./out/12-malaga-dataplane-control.json', import.meta.url), JSON.stringify(out, null, 2));
console.log('wrote out/12-malaga-dataplane-control.json');
