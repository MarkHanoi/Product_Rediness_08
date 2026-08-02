// §ANDALUCIA-ENVELOPE-MAX / step 3 — the CODE-SPACE check between the two COACo layers.
// step 2 measured areaWeightedDocumentPointerRate = 0 while zone-level = 100 %. That is the
// signature of a VOCABULARY MISMATCH, not of a missing link. Dump both value spaces in full.
// ⛔ A REGEX THAT DOES NOT MATCH IS NOT AN ABSENT FIELD; a join that returns 0 is not an absent link.
import { getJson, isValid, pct } from './lib.mjs';
import { writeFileSync } from 'node:fs';

const GS = 'https://geoserver.pgou.coacordoba.org/geoserver/wfs';
const q = tn => `${GS}?service=WFS&version=2.0.0&request=GetFeature&typeNames=${tn}`
    + '&outputFormat=application/json&srsName=EPSG:25830&count=100000';

const [ord, parc, dot, glob] = await Promise.all([
    getJson(q('coaco:ordenanzas'), { timeout: 180000 }),
    getJson(q('coaco:vcatastro_urbanismo'), { timeout: 300000 }),
    getJson(q('coaco:usos_dotacionales'), { timeout: 180000 }),
    getJson(q('coaco:usos_globales'), { timeout: 180000 }),
]);

const tally = (feats, key) => {
    const m = new Map();
    for (const f of feats) { const v = f.properties?.[key]; const k = isValid(v) ? String(v) : '(INVALID/NULL)'; m.set(k, (m.get(k) ?? 0) + 1); }
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
};

const out = { measuredAt: new Date().toISOString() };
out.ordenanzasLayer_ordenanza = tally(ord.json.features, 'ordenanza');
out.ordenanzasLayer_et = tally(ord.json.features, 'et');
out.parcelLayer_ordenanza = tally(parc.json.features, 'ordenanza');
out.parcelLayer_zona_cod = tally(parc.json.features, 'zona_cod');
out.parcelLayer_zona_nom = tally(parc.json.features, 'zona_nom');
out.parcelLayer_uso_dominante = tally(parc.json.features, 'uso_dominante');
out.parcelLayer_usos = tally(parc.json.features, 'usos').slice(0, 30);
out.parcelLayer_equipamiento = tally(parc.json.features, 'equipamiento').slice(0, 20);
out.parcelLayer_actuacion = tally(parc.json.features, 'actuacion').slice(0, 20);
out.dotacionalesLayer_tipo = tally(dot.json.features, 'tipo');
out.globalesLayer_tipo = tally(glob.json.features, 'tipo');
out.globalesLayer_layer = tally(glob.json.features, 'layer');

for (const [k, v] of Object.entries(out)) {
    if (!Array.isArray(v)) continue;
    console.log(`\n--- ${k} (${v.length} distinct) ---`);
    for (const [val, n] of v.slice(0, 40)) console.log(`   ${String(n).padStart(5)}  ${val}`);
}

// The join test, both directions.
const ordCodes = new Set(out.ordenanzasLayer_ordenanza.map(([v]) => v));
const parcCodes = new Set(out.parcelLayer_ordenanza.map(([v]) => v).filter(v => v !== '(INVALID/NULL)'));
const inter = [...parcCodes].filter(c => ordCodes.has(c));
out.joinDiagnosis = {
    ordenanzaLayerDistinct: [...ordCodes], parcelLayerDistinct: [...parcCodes],
    intersection: inter, joinable: inter.length > 0,
    parcelsJoinable: parc.json.features.filter(f => ordCodes.has(String(f.properties.ordenanza))).length,
    parcelsTotal: parc.json.features.length,
};
console.log('\n=== JOIN DIAGNOSIS ===');
console.log('intersection of the two ordenanza value spaces:', JSON.stringify(inter));
console.log(`parcels whose ordenanza value exists in the ordenanzas layer: ` +
    `${out.joinDiagnosis.parcelsJoinable}/${out.joinDiagnosis.parcelsTotal} = ${pct(out.joinDiagnosis.parcelsJoinable, out.joinDiagnosis.parcelsTotal)}%`);

writeFileSync(new URL('./out/03-cordoba-vocab-join.json', import.meta.url), JSON.stringify(out, null, 2));
console.log('\nwrote out/03-cordoba-vocab-join.json');
