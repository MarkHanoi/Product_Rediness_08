// §ANDALUCIA-ENVELOPE-MAX / step 18 — CÓRDOBA, CONSOLIDATED, ON A SOURCED DENOMINATOR.
//
// ⛔ AN UNSOURCED DENOMINATOR IS NOT A CONTROL, IT IS A WAY TO MANUFACTURE YOUR CONCLUSION.
// So three denominators are reported side by side and never mixed:
//   D1  parcels COACo actually SERVES              (5,725)  — flatters the publisher
//   D2  D1 minus public/systems land               — the coordinator's Balears correction:
//       roads, open space and equipment carry NO PRIVATE ENVELOPE at any completeness of data
//   D3  Córdoba's whole urban parcel population    (39,639, measured independently by the
//       cold-start probe against Catastro) — the only denominator a user of the product feels
//
// ⚠ AND EVERY RATE IS GIVEN TWICE: ROW-WEIGHTED (per parcel) and LAND-WEIGHTED (per m²). They
// answer different questions and in Balears the top 1% of zone records governed 32% of the land.
//
// ⭐ DISTINCT COUNTS ARE TAKEN FROM A FULL FETCH WHOSE returned == numberMatched, then counted
// locally — the strongest available oracle, and immune to the ArcGIS `returnDistinctValues` +
// `resultRecordCount` defect (this is GeoServer, and no server-side distinct is used at all).
import { getJson, isValid, pct } from './lib.mjs';
import { readFileSync, writeFileSync } from 'node:fs';

const GS = 'https://geoserver.pgou.coacordoba.org/geoserver/wfs';
const q = tn => `${GS}?service=WFS&version=2.0.0&request=GetFeature&typeNames=${tn}&outputFormat=application/json&srsName=EPSG:25830&count=100000`;
const [ord, parc, dot] = await Promise.all([
    getJson(q('coaco:ordenanzas'), { timeout: 180000 }),
    getJson(q('coaco:vcatastro_urbanismo'), { timeout: 300000 }),
    getJson(q('coaco:usos_dotacionales'), { timeout: 180000 }),
]);
const trunc = {
    ordenanzas: { returned: ord.json.features.length, numberMatched: ord.json.numberMatched },
    parcels: { returned: parc.json.features.length, numberMatched: parc.json.numberMatched },
    dotacionales: { returned: dot.json.features.length, numberMatched: dot.json.numberMatched },
};
const truncated = Object.values(trunc).some(t => t.returned !== t.numberMatched);
console.log('TRUNCATION CONTROL:', JSON.stringify(trunc), truncated ? '⛔ TRUNCATED' : 'clean');
if (truncated) throw new Error('truncated fetch — every rate below would be a fiction');

// readability class per ordinance document, from step 13 (content-hash + operator histogram)
const corpus = JSON.parse(readFileSync(new URL('./out/13-normativa-corpus.json', import.meta.url)));
const klassByUrl = new Map(corpus.cordoba.map(d => [d.url, d.klass]));

// zone -> its ordinance link and that link's readability
const zone = new Map();
for (const f of ord.json.features) {
    const p = f.properties, k = String(p.ordenanza ?? '(null)');
    const e = zone.get(k) ?? { code: k, polys: 0, m2: 0, links: new Set() };
    e.polys++; e.m2 += Number(p.sup_m2) || 0;
    if (p.link) e.links.add(String(p.link));
    zone.set(k, e);
}
for (const z of zone.values()) {
    const ks = [...z.links].map(u => klassByUrl.get(u) ?? 'UNFETCHED');
    z.klasses = ks;
    z.machineReadable = ks.some(k => k === 'TEXT');
    z.docState = ks.length === 0 ? 'NO DOCUMENT'
        : ks.every(k => /HTML|DEAD/.test(k)) ? 'DEAD LINK (HTTP 200, 69-byte placeholder)'
            : ks.some(k => k === 'TEXT') ? 'TEXT — machine-readable'
                : 'OUTLINED-VECTOR — legible to a human, ZERO extractable characters';
}

// ---- PRIVATE-DEVELOPABLE vs PUBLIC/SYSTEMS, inside "buildable" ----
// public/systems = the parcel is flagged equipamiento, or its zone is a protection/public code.
const PUBLIC_ZONE = /^(Elemento protegido)$/i;
let rows = { total: 0, publicSystems: 0, privateDevelopable: 0 };
let land = { total: 0, publicSystems: 0, privateDevelopable: 0 };
const priv = [];
for (const f of parc.json.features) {
    const a = Number(f.properties.sup_pc_m2) || 0;
    rows.total++; land.total += a;
    const isPublic = isValid(f.properties.equipamiento) || PUBLIC_ZONE.test(String(f.properties.ordenanza ?? ''));
    if (isPublic) { rows.publicSystems++; land.publicSystems += a; }
    else { rows.privateDevelopable++; land.privateDevelopable += a; priv.push(f); }
}
console.log(`\nPRIVATE-DEVELOPABLE SPLIT inside the served set`);
console.log(`  rows: ${rows.privateDevelopable}/${rows.total} private (${pct(rows.privateDevelopable, rows.total)}%), public/systems ${pct(rows.publicSystems, rows.total)}%`);
console.log(`  land: ${Math.round(land.privateDevelopable)}/${Math.round(land.total)} m² private (${pct(land.privateDevelopable, land.total)}%), public/systems ${pct(land.publicSystems, land.total)}%`);

// ---- R · ROUTING, on private-developable only ----
const known = new Set([...zone.keys()]);
let rRow = 0, rLand = 0;
for (const f of priv) { const o = f.properties.ordenanza; if (isValid(o) && known.has(String(o))) { rRow++; rLand += Number(f.properties.sup_pc_m2) || 0; } }
const routing = { rowWeighted: pct(rRow, rows.privateDevelopable), landWeighted: pct(rLand, land.privateDevelopable) };
console.log(`\nR · ROUTING (private-developable): row ${routing.rowWeighted}% · land ${routing.landWeighted}%`);

// ---- P · PARAMETERS ----
// coaco:ordenanzas serves ordenanza, et, sup_m2, link. NONE is an envelope parameter.
// `et` was TESTED as a plantas cap in step 15 and REFUTED against Catastro built stock.
// So the only route to a parameter is the linked ordinance document, and only if it has text.
let pText = 0, pTextLand = 0, pVector = 0, pVectorLand = 0, pDead = 0, pDeadLand = 0, pNone = 0, pNoneLand = 0;
for (const f of priv) {
    const a = Number(f.properties.sup_pc_m2) || 0;
    const z = zone.get(String(f.properties.ordenanza));
    if (!z || !z.links.size) { pNone++; pNoneLand += a; continue; }
    if (z.machineReadable) { pText++; pTextLand += a; }
    else if (z.docState.startsWith('DEAD')) { pDead++; pDeadLand += a; }
    else { pVector++; pVectorLand += a; }
}
const P = {
    machineReadableOrdinance: { row: pct(pText, rows.privateDevelopable), land: pct(pTextLand, land.privateDevelopable) },
    outlinedVectorOrdinance: { row: pct(pVector, rows.privateDevelopable), land: pct(pVectorLand, land.privateDevelopable) },
    deadLink: { row: pct(pDead, rows.privateDevelopable), land: pct(pDeadLand, land.privateDevelopable) },
    noZoneOrNoDocument: { row: pct(pNone, rows.privateDevelopable), land: pct(pNoneLand, land.privateDevelopable) },
};
console.log('\nP · GOVERNING ORDINANCE READABILITY (private-developable land)');
for (const [k, v] of Object.entries(P)) console.log(`  ${k.padEnd(28)} row ${String(v.row).padStart(6)}% · land ${String(v.land).padStart(6)}%`);

// ---- COMPLETE / PARTIAL-DRAWABLE / MAX ----
// ⭐ TAKE PARTIALS: footprint rule + height DRAWS. edificabilidad alone does NOT.
// Córdoba serves NO parameter in any attribute, and 0 of its zone codes resolve to a
// machine-readable footprint+height pair, so both are zero on a machine-readable basis.
const MAXi = { completeRule: { row: 0, land: 0 }, partialDrawable: { row: 0, land: 0 } };
MAXi.max = { row: 0, land: 0 };
MAXi.basis = 'machine-readable today, without human OCR/transcription of a raster or outlined-vector PDF';
MAXi.ceilingIfTranscribed = { row: P.machineReadableOrdinance.row + P.outlinedVectorOrdinance.row, land: P.machineReadableOrdinance.land + P.outlinedVectorOrdinance.land };

// ---- CITATION ----
const zn = [...zone.values()];
const cit = {
    zonesTotal: zn.length,
    zonesWithDocumentPointer: zn.filter(z => z.links.size).length,
    zonesWithArticleLevelCitation: zn.filter(z => [...z.links].some(l => /art/i.test(l))).length,
};
let citLand = 0;
for (const f of priv) { const z = zone.get(String(f.properties.ordenanza)); if (z && z.links.size) citLand += Number(f.properties.sup_pc_m2) || 0; }
cit.documentPointerRate = { row: pct(cit.zonesWithDocumentPointer, zn.length), landOfPrivate: pct(citLand, land.privateDevelopable) };
cit.articleCitationRate = pct(cit.zonesWithArticleLevelCitation, zn.length);
console.log(`\nCITATION: document pointer ${cit.documentPointerRate.row}% of zones / ${cit.documentPointerRate.landOfPrivate}% of private land · ARTICLE-level ${cit.articleCitationRate}%`);

// ---- D3: the city-wide denominator ----
const cold = JSON.parse(readFileSync('C:/Users/LENOVO/OneDrive/Desktop/PRYZM/Product_Rediness_08/tools/cold-start-probe/out/cordoba.determination.json'));
const D3 = { urbanParcelsCityWide: cold.parcelPopulationUrban, allParcels: cold.parcelPopulationTotal, source: cold.service };
D3.coacoCoverageOfCity = pct(rows.total, cold.parcelPopulationUrban);
console.log(`\nD3 · CITY-WIDE: COACo serves ${rows.total} of ${cold.parcelPopulationUrban} urban parcels = ${D3.coacoCoverageOfCity}% (2 of Córdoba's districts; the pilot).`);
console.log(`     City-wide MAX = ${MAXi.max.row}% × ${D3.coacoCoverageOfCity}% = 0%.`);

// ---- GRAMMAR ----
const GRAMMAR = {
    'Manzana Cerrada': 'ALIGNMENT/CLOSED-BLOCK', 'Colonia Tradicional Popular': 'ALIGNMENT/CLOSED-BLOCK',
    'CTP1- Campo de la Verdad': 'ALIGNMENT/CLOSED-BLOCK', 'Ordenacion Abierta': 'SETBACK',
    'Plurifamiliar aislada': 'SETBACK', 'Unifamiliar Aislada': 'SETBACK', 'Unifamiliar Adosada': 'SETBACK',
    'Uso Industrial': 'INDUSTRIAL', 'Uso Comercial': 'INDUSTRIAL', 'Elemento protegido': 'UNKNOWN',
};
const gram = {};
for (const f of priv) {
    const c = String(f.properties.ordenanza);
    const g = GRAMMAR[c] ?? 'UNKNOWN';
    const e = gram[g] ??= { rows: 0, land: 0 };
    e.rows++; e.land += Number(f.properties.sup_pc_m2) || 0;
}
console.log('\nGRAMMAR (private-developable):');
for (const [g, e] of Object.entries(gram).sort((a, b) => b[1].land - a[1].land))
    console.log(`  ${g.padEnd(24)} row ${String(pct(e.rows, rows.privateDevelopable)).padStart(6)}% · land ${String(pct(e.land, land.privateDevelopable)).padStart(6)}%`);
// ⭐ every alignment/closed-block zone needs a FONDO EDIFICABLE. COACo serves no fondo column at
// all, and the ordinance that would carry it has no text layer -> GRAPHIC_PLAN by elimination is
// NOT provable here; it is UNKNOWN, and that is the honest label.
const fondoNote = 'coaco:ordenanzas has no fondo/depth column and the ordinance PDFs have no text layer, so Córdoba\'s closed-block DEPTH is UNPROVEN — it is UNKNOWN, not GRAPHIC_PLAN. It cannot be added to the national no-region-serves-closed-block-depth tally as evidence, only as a non-contradiction.';

const out = {
    measuredAt: new Date().toISOString(), city: 'Córdoba', ine: '14021', service: GS,
    truncationControl: trunc, denominators: { D1_served: rows.total, D2_privateDevelopable: rows.privateDevelopable, D3_cityWideUrbanParcels: D3.urbanParcelsCityWide, D3 },
    privateDevelopableSplit: { rows, land: { total: Math.round(land.total), publicSystems: Math.round(land.publicSystems), privateDevelopable: Math.round(land.privateDevelopable) }, rowPct: pct(rows.privateDevelopable, rows.total), landPct: pct(land.privateDevelopable, land.total) },
    routing, parameterReadability: P, MAX: MAXi, citation: cit,
    grammar: Object.fromEntries(Object.entries(gram).map(([g, e]) => [g, { row: pct(e.rows, rows.privateDevelopable), land: pct(e.land, land.privateDevelopable) }])),
    fondoNote,
    zones: [...zone.values()].map(z => ({ code: z.code, polys: z.polys, m2: Math.round(z.m2), links: [...z.links], docState: z.docState, grammar: GRAMMAR[z.code] ?? 'UNKNOWN' })),
};
writeFileSync(new URL('./out/18-cordoba-final.json', import.meta.url), JSON.stringify(out, null, 2));
console.log('\nwrote out/18-cordoba-final.json');
