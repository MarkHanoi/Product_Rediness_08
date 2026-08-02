// §ANDALUCIA-ENVELOPE-MAX / step 2 — CÓRDOBA ROUTING + PARAMETER CENSUS.
//
// Two questions, kept separate:
//   R) can a parcel be assigned to EXACTLY ONE zone?  (unique-assignment rate)
//   P) does that zone carry a VALID numeric parameter?  (VALID rate, never non-null)
//
// The denominator is BUILDABLE land (C63 §L-656): private, buildable urban parcels. Dotacional /
// viario / zona verde is NOT buildable-by-a-private-owner and is excluded, with the count stated.
import { get, getJson, isValid, pct } from './lib.mjs';
import { writeFileSync, mkdirSync } from 'node:fs';

const GS = 'https://geoserver.pgou.coacordoba.org/geoserver/wfs';
const q = (tn, extra = '') => `${GS}?service=WFS&version=2.0.0&request=GetFeature&typeNames=${tn}`
    + `&outputFormat=application/json&srsName=EPSG:25830&count=100000${extra}`;

console.log('fetching layers…');
const [ord, parc, dot, glob] = await Promise.all([
    getJson(q('coaco:ordenanzas'), { timeout: 180000 }),
    getJson(q('coaco:vcatastro_urbanismo'), { timeout: 300000 }),
    getJson(q('coaco:usos_dotacionales'), { timeout: 180000 }),
    getJson(q('coaco:usos_globales'), { timeout: 180000 }),
]);
for (const [n, r] of [['ordenanzas', ord], ['parcels', parc], ['dotacionales', dot], ['globales', glob]])
    console.log(`  ${n}: HTTP ${r.status} feats=${r.json?.features?.length ?? 'NULL'} ` +
        `numberMatched=${r.json?.numberMatched} totalFeatures=${r.json?.totalFeatures} ${r.parseError ? 'ERR:' + r.parseError : ''}`);

const out = { measuredAt: new Date().toISOString(), city: 'cordoba', ine: '14021', service: GS };

// ---------- TRUNCATION CONTROL: numberMatched must equal returned length ----------
out.truncation = {};
for (const [n, r] of [['ordenanzas', ord], ['vcatastro_urbanismo', parc], ['usos_dotacionales', dot], ['usos_globales', glob]]) {
    const got = r.json?.features?.length ?? 0;
    const matched = Number(r.json?.numberMatched ?? r.json?.totalFeatures ?? NaN);
    out.truncation[n] = { returned: got, numberMatched: matched, truncated: Number.isFinite(matched) ? got < matched : 'unknown' };
}
console.log('truncation:', JSON.stringify(out.truncation));

// ---------- ZONE VOCABULARY + the "link" (article?) field ----------
const zones = new Map();
for (const f of ord.json.features) {
    const p = f.properties;
    const k = p.ordenanza ?? '(null)';
    const e = zones.get(k) ?? { code: k, polys: 0, m2: 0, links: new Set(), ets: new Set(), fieldUnion: new Set() };
    e.polys++; e.m2 += Number(p.sup_m2) || 0;
    if (p.link) e.links.add(String(p.link));
    if (p.et) e.ets.add(String(p.et));
    for (const kk of Object.keys(p)) e.fieldUnion.add(kk);
    zones.set(k, e);
}
out.zoneVocabulary = [...zones.values()].sort((a, b) => b.m2 - a.m2).map(z => ({
    code: z.code, polys: z.polys, m2: Math.round(z.m2), links: [...z.links], ets: [...z.ets],
}));
out.ordenanzaFieldUnion = [...new Set(ord.json.features.flatMap(f => Object.keys(f.properties)))];
console.log('\n=== CÓRDOBA ZONE VOCABULARY (coaco:ordenanzas) ===');
console.log('field union:', out.ordenanzaFieldUnion.join(', '));
for (const z of out.zoneVocabulary)
    console.log(`  ${String(z.code).padEnd(22)} polys=${String(z.polys).padStart(4)} m2=${String(z.m2).padStart(9)}  link=${z.links[0] ?? 'NONE'}`);

// ---------- ROUTING: parcel -> zone, by the publisher's own attribute AND by geometry ----------
// The publisher already joins: vcatastro_urbanismo.ordenanza. That is the ATTRIBUTE route.
const parcels = parc.json.features;
const known = new Set(out.zoneVocabulary.map(z => z.code));
let attrAssigned = 0, attrNull = 0, attrUnknownCode = 0;
const perParcelZone = new Map();
for (const f of parcels) {
    const o = f.properties.ordenanza;
    if (!isValid(o)) { attrNull++; continue; }
    const codes = String(o).split(/[;,/]/).map(s => s.trim()).filter(Boolean);
    if (codes.length !== 1) { attrUnknownCode++; continue; }
    attrAssigned++;
    perParcelZone.set(f.properties.refcat, codes[0]);
    if (!known.has(codes[0])) attrUnknownCode++;
}
out.routing = {
    parcelsServed: parcels.length,
    attrAssignedUnique: attrAssigned,
    attrNull, attrMultiOrUnknown: attrUnknownCode,
    uniqueAssignmentRateOfServed: pct(attrAssigned, parcels.length),
};
console.log('\n=== ROUTING (attribute join, publisher-provided) ===');
console.log(JSON.stringify(out.routing, null, 2));

// ---------- BUILDABLE denominator ----------
// A parcel is NOT private-buildable if its ordenanza/uso marks it dotacional, viario or verde.
const NON_BUILDABLE = /^(SGEL|SGV|SGEQ|EL|EQ|V|VIA|VIARIO|ZV|DOT|SIPS|SG)/i;
let nonBuildable = 0, buildable = 0;
const buildableParcels = [];
for (const f of parcels) {
    const o = String(f.properties.ordenanza ?? '');
    const eq = String(f.properties.equipamiento ?? '');
    if ((o && NON_BUILDABLE.test(o)) || isValid(eq)) { nonBuildable++; continue; }
    buildable++; buildableParcels.push(f);
}
out.buildable = { nonBuildable, buildable, note: 'buildable = served parcel not flagged equipamiento and not a dotacional/viario/verde ordenanza code' };
console.log(`buildable parcels ${buildable} / served ${parcels.length} (nonBuildable ${nonBuildable})`);

// ---------- P: PARAMETERS. Do the served zones carry ANY numeric envelope parameter? ----------
const PARAMS = ['altura', 'alturas', 'plantas', 'n_plantas', 'num_plantas', 'ocupacion', 'ocup',
    'edificabilidad', 'edif', 'aprovechamiento', 'retranqueo', 'retranqueos', 'separacion',
    'alineacion', 'fondo', 'fondo_edificable', 'parcela_minima', 'densidad', 'dens'];
const allOrdKeys = out.ordenanzaFieldUnion.map(k => k.toLowerCase());
out.parameterFieldsPresentInSchema = PARAMS.filter(p => allOrdKeys.some(k => k === p || k.includes(p)));
const parcKeys = [...new Set(parcels.flatMap(f => Object.keys(f.properties)))];
out.parcelFieldUnion = parcKeys;
out.parcelParameterFieldsPresent = PARAMS.filter(p => parcKeys.some(k => k.toLowerCase() === p || k.toLowerCase().includes(p)));
console.log('\n=== P: PARAMETER FIELDS IN SCHEMA ===');
console.log('  coaco:ordenanzas ->', out.parameterFieldsPresentInSchema.length ? out.parameterFieldsPresentInSchema.join(', ') : 'NONE');
console.log('  coaco:vcatastro_urbanismo ->', out.parcelParameterFieldsPresent.join(', ') || 'NONE');

// max_plantas on the parcel layer is OBSERVED (built reality from Catastro), NOT normative.
// Measure it anyway and label it, because it is the only height-shaped number Córdoba serves.
let mpValid = 0;
for (const f of buildableParcels) if (isValid(f.properties.max_plantas)) mpValid++;
out.observedHeight = {
    field: 'vcatastro_urbanismo.max_plantas',
    validOfBuildable: pct(mpValid, buildable),
    provenance: 'OBSERVED (Catastro built stock) — NOT a normative maximum. Cannot be used as an envelope height.',
};
console.log(`  max_plantas VALID on ${mpValid}/${buildable} = ${out.observedHeight.validOfBuildable}% — but ${out.observedHeight.provenance}`);

// ---------- CITATION RATE: does a zone carry an ARTICLE? ----------
// `link` is a PDF URL, not an article number. A URL to a whole ordenanza PDF is a DOCUMENT
// pointer, not an article citation. Count both, separately.
const zWithLink = out.zoneVocabulary.filter(z => z.links.length > 0);
const zWithArticle = out.zoneVocabulary.filter(z => z.links.some(l => /art|#|art%C3%ADculo/i.test(l)));
out.citation = {
    zonesTotal: out.zoneVocabulary.length,
    zonesWithDocumentPointer: zWithLink.length,
    zonesWithArticleLevelCitation: zWithArticle.length,
    documentPointerRate: pct(zWithLink.length, out.zoneVocabulary.length),
    articleCitationRate: pct(zWithArticle.length, out.zoneVocabulary.length),
};
// area-weighted, on buildable parcels
let m2WithDoc = 0, m2All = 0;
for (const f of buildableParcels) {
    const z = zones.get(f.properties.ordenanza);
    const a = Number(f.properties.sup_pc_m2) || 0;
    m2All += a; if (z && z.links.length) m2WithDoc += a;
}
out.citation.areaWeightedDocumentPointerRate = pct(m2WithDoc, m2All);
console.log('\n=== CITATION ===', JSON.stringify(out.citation, null, 2));

mkdirSync(new URL('./out/', import.meta.url), { recursive: true });
writeFileSync(new URL('./out/02-cordoba-routing.json', import.meta.url), JSON.stringify(out, null, 2));
console.log('\nwrote out/02-cordoba-routing.json');
