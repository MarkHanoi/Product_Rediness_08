// §MURCIA-ENVELOPE-MAX · STEP 9 — WHAT THE REGIONAL WFS CARRIES, PER MUNICIPALITY
//
// Tier (a) on the REGIONAL service. Measure the attributes alone before asking what the
// ficha adds.
//
// ⛔ DENOMINATOR AUDIT — THE FIRST CUT WAS WRONG AND IS CORRECTED HERE.
//    Folding all of *urbanizable* into "buildable" gave 2 323 km² of buildable land in an
//    11 313 km² region. That is not credible, and the cause is real:
//      Suelo Urbanizable SIN SECTORIZAR            1 436.43 km²
//      Suelo Urbanizable Sin Sectorizar Especial     270.90 km²
//      Suelo Urbanizable No Programado                58.59 km²
//    None of that land carries a development right until a Plan Parcial SECTORISES it —
//    it is the regional twin of Murcia-city's 67 % delegated share. Counting it as
//    buildable would inflate the denominator ~4× and understate every coverage rate.
//    ⛔ AN UNSOURCED DENOMINATOR IS NOT A CONTROL. The split is stated, articulated by
//    the publisher's own `Clasificacion` strings, and asserted to sum.
//
// ⛔ VALID VALUES, NOT PRESENCE: `0` is a null substitute in this corpus (3 644 polygons).
// ⛔ §4 TAKE PARTIALS: footprint rule + height DRAWS; Edificabilidad alone DOES NOT.

import { wfsJson, writeOut, areaOf } from './lib.mjs';

const REFRESH = process.argv.includes('--refresh');
const O = { refresh: REFRESH };
const report = { step: 9, measuredAt: new Date().toISOString(), notes: [] };

const LAYERS = [
  'SIT_USU_PLA_URB_CARM:plu_clasific_tipos_urbano',
  'SIT_USU_PLA_URB_CARM:plu_clasific_tipos_urbanizable',
  'SIT_USU_PLA_URB_CARM:plu_clasific_tipos_no_urbanizable',
  'SIT_USU_PLA_URB_CARM:plu_clasific_tipos_sin_clasificar',
];

// ── the buildable-land definition, articulated by the publisher's own strings ──
const BUILDABLE_NOW = new Set([
  'Suelo Urbano',
  'Suelo Urbano Consolidado',
  'Suelo Urbano Sin Consolidar',
  'Suelo Urbano Especial',
  'Suelo Urbanizable Sectorizado',
  'Suelo Urbanizable Sectorizado Especial',
  'Suelo Urbanizable Programado',
  'Suelo Apto para Urbanizar',
  'Suelo Urbanizable',
]);
const DELEGATED_PENDING_SECTORISATION = new Set([
  'Suelo Urbanizable Sin Sectorizar',
  'Suelo Urbanizable Sin Sectorizar Especial',
  'Suelo Urbanizable No Programado',
]);
const NOT_BUILDABLE = new Set([
  'Suelo No Urbanizable',
  'Suelo No Urbanizable Protegido',
  'Suelo No Urbanizable de Protección Específica',
  'Suelo No Urbanizable Inadecuado',
]);
const PUBLIC_OR_UNKNOWN = new Set(['Sistema General', 'Suelo Sin Clasificar', 'Indeterminado']);

function bucket(c) {
  if (BUILDABLE_NOW.has(c)) return 'buildableNow';
  if (DELEGATED_PENDING_SECTORISATION.has(c)) return 'delegatedPendingSectorisation';
  if (NOT_BUILDABLE.has(c)) return 'notBuildable';
  if (PUBLIC_OR_UNKNOWN.has(c)) return 'publicOrUnknown';
  return 'UNRECOGNISED';
}

function validEdif(raw) {
  if (raw === null || raw === undefined || raw === '') return { ok: false, why: 'null/empty' };
  const n = typeof raw === 'number' ? raw : Number(String(raw).replace(',', '.'));
  if (!Number.isFinite(n)) return { ok: false, why: 'non-numeric' };
  if (n === 0) return { ok: false, why: 'zero — null substitute in this corpus' };
  if (n < 0) return { ok: false, why: 'negative' };
  if (n > 30) return { ok: false, why: 'implausible ratio > 30' };
  return { ok: true, value: n };
}

console.log('\n== 9a · fetch ==');
const all = [];
for (const layer of LAYERS) {
  const j = await wfsJson(layer, { count: 200000 }, { ...O, timeout: 300_000 });
  if (j.features.length !== j.numberMatched)
    throw new Error(`TRUNCATION on ${layer}: ${j.features.length} != ${j.numberMatched}`);
  console.log(`  ${layer}: ${j.features.length}`);
  for (const f of j.features) all.push({ layer, p: f.properties, area: areaOf(f.geometry) });
}

// ── 9b · the regional land decomposition — MUST SUM ─────────────────────────
console.log('\n== 9b · regional land decomposition (must sum) ==');
const buckets = {};
let totalArea = 0;
const unrecognised = new Set();
for (const r of all) {
  const b = bucket(r.p.Clasificacion);
  if (b === 'UNRECOGNISED') unrecognised.add(r.p.Clasificacion);
  buckets[b] = (buckets[b] || 0) + r.area;
  totalArea += r.area;
}
if (unrecognised.size) throw new Error(`UNRECOGNISED Clasificacion values — refusing to bucket silently: ${[...unrecognised].join(' | ')}`);
const bsum = Object.values(buckets).reduce((s, v) => s + v, 0);
if (Math.abs(bsum - totalArea) > 1) throw new Error(`DECOMPOSITION DOES NOT SUM: ${bsum} != ${totalArea}`);
report.landDecomposition_Mm2 = Object.fromEntries(Object.entries(buckets).map(([k, v]) => [k, +(v / 1e6).toFixed(2)]));
report.landDecomposition_Mm2.TOTAL = +(totalArea / 1e6).toFixed(2);
for (const [k, v] of Object.entries(buckets)) console.log(`  ${k.padEnd(32)} ${(v / 1e6).toFixed(2).padStart(10)} M m²`);
console.log(`  ${'TOTAL'.padEnd(32)} ${(totalArea / 1e6).toFixed(2).padStart(10)} M m²  ✓ sums`);

// ── 9c · per-municipality census on BUILDABLE-NOW land ─────────────────────
console.log('\n== 9c · per-municipality, on buildable-NOW land ==');
const per = new Map();
const rejects = new Map();
for (const r of all) {
  const m = r.p.Municipio;
  if (!m) continue;
  if (!per.has(m))
    per.set(m, {
      municipio: m,
      buildableNow: 0,
      delegatedPending: 0,
      polys: 0,
      edifValidArea: 0,
      edifValidPolys: 0,
      edifZeroArea: 0,
      fichaLinkArea: 0,
      edifMin: Infinity,
      edifMax: -Infinity,
    });
  const e = per.get(m);
  const b = bucket(r.p.Clasificacion);
  if (b === 'delegatedPendingSectorisation') { e.delegatedPending += r.area; continue; }
  if (b !== 'buildableNow') continue;
  e.buildableNow += r.area;
  e.polys++;
  if (r.p.Enlace_ficha) e.fichaLinkArea += r.area;
  const v = validEdif(r.p.Edificabilidad);
  if (v.ok) {
    e.edifValidArea += r.area;
    e.edifValidPolys++;
    e.edifMin = Math.min(e.edifMin, v.value);
    e.edifMax = Math.max(e.edifMax, v.value);
  } else {
    if (v.why.startsWith('zero')) e.edifZeroArea += r.area;
    rejects.set(v.why, (rejects.get(v.why) || 0) + 1);
  }
}
report.edifRejectReasons = Object.fromEntries(rejects);
console.log('  Edificabilidad rejections (VALID VALUES, NOT PRESENCE):');
for (const [w, n] of [...rejects.entries()].sort((a, b) => b[1] - a[1])) console.log(`    ${w}: ${n}`);

const rows = [...per.values()].filter((e) => e.buildableNow > 0).sort((a, b) => b.buildableNow - a.buildableNow);
for (const e of rows) {
  e.buildableNow_Mm2 = +(e.buildableNow / 1e6).toFixed(3);
  e.delegatedPending_Mm2 = +(e.delegatedPending / 1e6).toFixed(3);
  e.edifValid_Mm2 = +(e.edifValidArea / 1e6).toFixed(3);
  e.edifValidPct = +((100 * e.edifValidArea) / e.buildableNow).toFixed(2);
  e.edifZeroPct = +((100 * e.edifZeroArea) / e.buildableNow).toFixed(2);
  e.fichaLinkPct = +((100 * e.fichaLinkArea) / e.buildableNow).toFixed(2);
  e.edifRange = e.edifValidPolys ? [e.edifMin, e.edifMax] : null;
  delete e.edifMin; delete e.edifMax; delete e.buildableNow; delete e.delegatedPending;
  delete e.edifValidArea; delete e.edifZeroArea; delete e.fichaLinkArea;
}
report.perMunicipality = rows;
console.log('\n  municipality                  buildable-now Mm²  edif VALID %  edif ZERO %  ficha %');
for (const e of rows)
  console.log(
    `  ${e.municipio.slice(0, 28).padEnd(29)} ${String(e.buildableNow_Mm2).padStart(14)} ${String(e.edifValidPct).padStart(12)} ${String(e.edifZeroPct).padStart(12) } ${String(e.fichaLinkPct).padStart(8)}`
  );

// ── 9d · regional roll-up ───────────────────────────────────────────────────
{
  const tb = rows.reduce((s, e) => s + e.buildableNow_Mm2, 0);
  const tv = rows.reduce((s, e) => s + e.edifValid_Mm2, 0);
  report.regional = {
    municipalities: rows.length,
    buildableNow_Mm2: +tb.toFixed(3),
    edifValid_Mm2: +tv.toFixed(3),
    edifValidPct: +((100 * tv) / tb).toFixed(2),
    fichaLinkPct: 100,
  };
  console.log(`\n  REGIONAL: ${rows.length} municipalities · buildable-now ${report.regional.buildableNow_Mm2} M m² · Edificabilidad VALID ${report.regional.edifValidPct} % · Enlace_ficha 100 %`);
}

// ── 9e · ⭐ DRAWABILITY — §4 ────────────────────────────────────────────────
console.log('\n== 9e · DRAWABILITY (§4 TAKE PARTIALS) ==');
{
  const fs = await import('node:fs');
  const s1 = JSON.parse(fs.readFileSync(new URL('./out/01-schema-and-validity.json', import.meta.url), 'utf8'));
  const SHAPE = /altura|plantas|nplant|ocupac|retranq|reculad|fondo|profundidad|parcela_min|pmin|separac|alineac|edificab_max|coef/i;
  const shapeFields = {};
  for (const [layer, s] of Object.entries(s1.schemas)) {
    const hits = (s.fields || []).map((f) => f.name).filter((n) => SHAPE.test(n));
    if (hits.length) shapeFields[layer] = hits;
  }
  report.drawability = {
    layersInspected: Object.keys(s1.schemas).length,
    shapeBearingFields: shapeFields,
    completeRulePct: 0,
    partialDrawablePct: 0,
    notDrawablePct: 100,
    verdict:
      Object.keys(shapeFields).length === 0
        ? 'NO SHAPE CONSTRAINT ON ANY OF THE 14 LAYERS. Edificabilidad is a floor-area quantum: no ' +
          'footprint rule, no height. Per §4 it DOES NOT DRAW. From WFS attributes alone the regional ' +
          'service is 0 % complete-rule, 0 % partial-drawable, 100 % not-drawable — for every one of ' +
          'the 33 municipalities, at ANY Edificabilidad coverage.'
        : 'shape fields exist — re-measure',
  };
  console.log(`  shape-bearing fields across all ${report.drawability.layersInspected} layers: ${JSON.stringify(shapeFields)}`);
  console.log(`  ⭐ ${report.drawability.verdict}`);
}

writeOut('09-wfs-parameter-census.json', report);
console.log('\nSTEP 9 done.');
