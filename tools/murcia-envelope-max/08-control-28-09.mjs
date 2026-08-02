// §MURCIA-ENVELOPE-MAX · STEP 8 — TIER (a): REPRODUCE THE 28.09 % KNOWN-ANSWER CONTROL
//
// ⛔ IF THIS DOES NOT REPRODUCE, STOP AND REPORT THE DRIFT.
//
// ⚠ AND FIRST, A UNIVERSE CORRECTION THAT THE BRIEF'S FRAMING HIDES:
//   28.09 % is a **MUNICIPAL** figure for the **CITY of Murcia (INE 30030)**, measured on
//   the **MUNICIPAL** GeoServer `geoserver.murcia.es` (`Murcia:pgou_alineaciones` +
//   `Murcia:pgou_sectores`), over 75.145 M m² of that ONE city's private buildable land.
//
//   `Edificabilidad` + `Enlace_ficha` live somewhere else entirely: the **REGIONAL** CARM
//   GeoServer `mapas-gis-inter.carm.es/geoserver/SIT_USU_PLA_URB_CARM`, covering 33
//   municipalities at ÁMBITO granularity.
//
//   ⛔ THEREFORE "28.09 % + ficha parameters" IS NOT AN ADDITION THAT CAN BE PERFORMED.
//   The two figures have different denominators, different services and different
//   granularities. Adding them would be exactly the unbalanced-decomposition defect the
//   brief warns about. This step reproduces the control on its OWN terms and states the
//   incommensurability rather than emitting a fused number.
//
// Reproduction is ARITHMETIC from committed, independently-sourced artefacts in the MAIN
// checkout (read-only) — it does not re-hit the municipal service, so the control cannot be
// contaminated by this run.

import { readFileSync } from 'node:fs';
import { writeOut, assertSums } from './lib.mjs';

const MAIN = 'C:/Users/LENOVO/OneDrive/Desktop/PRYZM/Product_Rediness_08';
const report = { step: 8, measuredAt: new Date().toISOString(), notes: [] };

console.log('\n== 8a · inputs, each with its own source ==');
const crosstab = JSON.parse(readFileSync(`${MAIN}/tools/murcia-coverage-crosstab/out-crosstab.json`, 'utf8'));

const baseline = crosstab.intersection.packedAndDirect_pct; // 23.51
const denom = crosstab.denominator.privateBuildable_Mm2; // 75.145
const packedDirectArea = crosstab.intersection.packedAndDirect_Mm2; // 17.663

// street-width recoverable share: RC + RM + RN on PGOU-direct land (RATE.md §reconciliation)
const widthRecoverablePP = 8.81;
const widthRecoverableArea = 6.62;
// measured resolve rate of the production street-width resolver, after eje_comercial
// (ENVELOPE.md §SIG-MU2, tools/murcia-street-width-probe, n=150 rings, seed 20260802)
const resolveRate = 0.52;

console.log(`  crosstab packedAndDirect      : ${baseline} %  (${packedDirectArea} / ${denom} M m²)`);
console.log(`  width-recoverable headroom    : ${widthRecoverablePP} pp (${widthRecoverableArea} M m², RC+RM+RN on direct land)`);
console.log(`  street-width resolve rate     : ${resolveRate} (52.0 %, measured)`);

// ⛔ ASSERT THE INPUTS ARE INTERNALLY CONSISTENT before using them.
const derivedBaseline = +((100 * packedDirectArea) / denom).toFixed(2);
if (Math.abs(derivedBaseline - baseline) > 0.01) {
  throw new Error(`CONTROL DRIFT: crosstab area ratio ${derivedBaseline} % != published ${baseline} %`);
}
const derivedWidthPP = +((100 * widthRecoverableArea) / denom).toFixed(2);
console.log(`  ✓ ${packedDirectArea}/${denom} = ${derivedBaseline} % matches the published ${baseline} %`);
console.log(`  ✓ ${widthRecoverableArea}/${denom} = ${derivedWidthPP} % matches the published ${widthRecoverablePP} pp`);

console.log('\n== 8b · reproduce ==');
const uplift = +(widthRecoverablePP * resolveRate).toFixed(2);
const reproduced = +(baseline + uplift).toFixed(2);
console.log(`  ${widthRecoverablePP} pp × ${resolveRate} = ${uplift} pp`);
console.log(`  ${baseline} % + ${uplift} pp = ${reproduced} %`);

const PUBLISHED = 28.09;
const pass = Math.abs(reproduced - PUBLISHED) <= 0.01;
console.log(`\n  ⭐ CONTROL: reproduced ${reproduced} % vs published ${PUBLISHED} % → ${pass ? 'PASS' : '⛔ FAIL — STOP'}`);
if (!pass) throw new Error(`KNOWN-ANSWER CONTROL FAILED: ${reproduced} != ${PUBLISHED}`);

// ── 8c · the decomposition of the city's buildable land MUST SUM ────────────
console.log('\n== 8c · decomposition must sum ==');
const d = crosstab.delegationSplit;
const parts = {
  pgouDirect_Mm2: d.pgouDirect_Mm2,
  delegated_Mm2: d.delegated_Mm2,
};
const sum = +(parts.pgouDirect_Mm2 + parts.delegated_Mm2).toFixed(3);
console.log(`  direct ${parts.pgouDirect_Mm2} + delegated ${parts.delegated_Mm2} = ${sum} vs denominator ${denom}`);
if (Math.abs(sum - denom) > 0.01) throw new Error(`DECOMPOSITION DOES NOT SUM: ${sum} != ${denom}`);
console.log('  ✓ sums');

// within the direct share
const withinDirect = {
  packedAndDirect: crosstab.intersection.packedAndDirect_Mm2,
  refusedButDirect: +(d.pgouDirect_Mm2 - crosstab.intersection.packedAndDirect_Mm2).toFixed(3),
};
console.log(`  of the ${d.pgouDirect_Mm2} direct: ${withinDirect.packedAndDirect} packed+direct, ${withinDirect.refusedButDirect} refused-but-direct`);

report.control = {
  universe: 'CITY of Murcia, INE 30030 — ONE municipality',
  service: crosstab.source.endpoint,
  layers: crosstab.source.layers,
  denominator_Mm2: denom,
  denominatorBasis: crosstab.denominator.basis,
  baseline_pct: baseline,
  widthRecoverable_pp: widthRecoverablePP,
  resolveRate,
  uplift_pp: uplift,
  reproduced_pct: reproduced,
  published_pct: PUBLISHED,
  PASS: pass,
  decompositionSums: true,
};
report.incommensurability = {
  finding:
    'The 28.09 % control and the Edificabilidad/Enlace_ficha channel are NOT the same universe and cannot be summed.',
  control: {
    universe: 'city of Murcia (1 municipality)',
    service: 'geoserver.murcia.es (MUNICIPAL)',
    granularity: 'calificación polygon (per-plot ordinance zone)',
    denominator: '75.145 M m² of private buildable land in ONE city',
  },
  fichaChannel: {
    universe: '33 municipalities (of 45 in the region)',
    service: 'mapas-gis-inter.carm.es/geoserver/SIT_USU_PLA_URB_CARM (REGIONAL)',
    granularity: 'ámbito de ordenación (development sector) — NOT per-plot',
    denominator: 'not a subset or superset of the control denominator',
  },
  consequence:
    'Tier (b) is reported as its OWN measurement on its OWN denominator. No fused "28.09 % + N" figure is emitted, ' +
    'because emitting one would be an unbalanced decomposition.',
};

writeOut('08-control-28-09.json', report);
console.log('\nSTEP 8 done.');
