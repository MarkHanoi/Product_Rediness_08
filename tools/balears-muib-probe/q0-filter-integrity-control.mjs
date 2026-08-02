/**
 * Q0 - FILTER INTEGRITY CONTROL. RUN THIS BEFORE BELIEVING ANY FILTERED NUMBER.
 *
 * ⛔ THE SEVENTH NEGATIVE-PROOF CONDITION: A SUCCESSFUL RESPONSE IS NOT AN
 * APPLIED FILTER. On terramapas.icv.gva.es, `CQL_FILTER` was accepted and
 * SILENTLY IGNORED - HTTP 200, no exception, plausible data, and the identical
 * whole-layer total returned for Valencia, for Tollos AND for Madrid. Every
 * per-municipality figure was a regional total wearing a municipal label, and
 * ONLY THE NEGATIVE CONTROL CAUGHT IT.
 *
 * MUIB is ArcGIS REST with SQL `where`, a different engine from MapServer's
 * CQL_FILTER - so that specific defect does not transfer. THE CONTROL IS RUN
 * ANYWAY, because "different engine" is an argument, not evidence.
 *
 * A filter is accepted only when ALL FOUR hold:
 *   (a) every returned feature CARRIES the requested value
 *   (b) a value KNOWN to be outside the region returns ZERO
 *   (c) per-municipality counts SUM to the unfiltered total
 *   (d) two different municipalities return DIFFERENT counts
 *
 * Run:  node tools/balears-muib-probe/q0-filter-integrity-control.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { count, queryRows, distinct, sleep } from './lib.mjs';

const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), 'out');
const LAYERS = [
  { id: 10, name: 'QUALIFICACIONS' },
  { id: 11, name: 'CATEGORIES_RUSTIC' },
  { id: 8, name: 'GESTIO' },
  { id: 12, name: 'CLASSIFICACIO' },
];

// Codes that CANNOT exist in a Balears layer.
const IMPOSSIBLE = [
  { code: '07040', why: 'INE-5 form of Palma - wrong code space for this field' },
  { code: '079', why: 'Madrid city, INE-3 truncated form - different region entirely' },
  { code: '28079', why: 'Madrid city, full INE-5' },
  { code: 'ZZZ', why: 'non-numeric nonsense' },
  { code: '999', why: 'numeric but no such Balears municipality' },
];

const result = { probe: 'q0-filter-integrity-control', runAt: new Date().toISOString(), layers: {}, verdict: {} };

for (const L of LAYERS) {
  const rec = { id: L.id, name: L.name, checks: {} };
  const total = await count(L.id, '1=1');
  rec.unfilteredTotal = total.count;

  // (b) NEGATIVE CONTROL - the one that actually catches a silently-ignored filter.
  rec.checks.negativeControl = [];
  let negPass = true;
  for (const imp of IMPOSSIBLE) {
    const c = await count(L.id, `CODIMUNI = '${imp.code}'`);
    const ok = c.count === 0;
    if (!ok) negPass = false;
    rec.checks.negativeControl.push({ code: imp.code, why: imp.why, count: c.count, pass: ok });
    await sleep(80);
  }
  rec.checks.negativeControlPass = negPass;

  // (d) two different municipalities must return DIFFERENT FEATURE SETS.
  // ⚠ CORRECTED 2026-08-02: comparing COUNTS is too weak. On CLASSIFICACIO
  // (916 rows / 67 municipalities, mean 13.7) two municipalities legitimately
  // both returned 3 features and the count comparison raised a FALSE ALARM.
  // Comparing the returned OBJECTID SETS is what actually discriminates an
  // applied filter from a silently-ignored one.
  const muni = await distinct(L.id, ['CODIMUNI'], "CODIMUNI IS NOT NULL AND CODIMUNI <> ''");
  const codes = muni.rows.map((r) => r.CODIMUNI).sort();
  rec.distinctMunicipalityCodes = codes.length;
  const cA = codes[0], cB = codes[Math.floor(codes.length / 2)];
  const a = await count(L.id, `CODIMUNI = '${cA}'`);
  const b = await count(L.id, `CODIMUNI = '${cB}'`);
  const idsA = (await queryRows(L.id, `CODIMUNI = '${cA}'`, ['OBJECTID'], { resultRecordCount: '300', orderByFields: 'OBJECTID ASC' })).rows.map((r) => r.OBJECTID);
  const idsB = (await queryRows(L.id, `CODIMUNI = '${cB}'`, ['OBJECTID'], { resultRecordCount: '300', orderByFields: 'OBJECTID ASC' })).rows.map((r) => r.OBJECTID);
  const setB = new Set(idsB);
  const overlap = idsA.filter((x) => setB.has(x));
  rec.checks.twoMunicipalities = {
    codeA: cA, countA: a.count, codeB: cB, countB: b.count,
    countsDiffer: a.count !== b.count,
    featureSetsDisjoint: overlap.length === 0,
    overlappingIds: overlap.length,
    neitherEqualsTotal: a.count !== rec.unfilteredTotal && b.count !== rec.unfilteredTotal,
  };
  rec.checks.twoMunicipalitiesPass =
    overlap.length === 0 && idsA.length > 0 && idsB.length > 0 &&
    rec.checks.twoMunicipalities.neitherEqualsTotal;

  // (c) per-municipality counts must SUM to the unfiltered total.
  let sum = 0;
  const per = {};
  for (const c of codes) {
    const n = await count(L.id, `CODIMUNI = '${c}'`);
    per[c] = n.count; sum += n.count;
    await sleep(60);
  }
  rec.checks.sumOfParts = { sum, unfilteredTotal: rec.unfilteredTotal, matches: sum === rec.unfilteredTotal, delta: sum - rec.unfilteredTotal };
  rec.checks.sumOfPartsPass = sum === rec.unfilteredTotal;
  rec.perMunicipalityCounts = per;

  // (a) every returned feature must CARRY the requested value.
  const probe = codes[Math.floor(codes.length / 3)];
  const rows = await queryRows(L.id, `CODIMUNI = '${probe}'`, ['CODIMUNI'], { resultRecordCount: '400', orderByFields: 'OBJECTID ASC' });
  const bad = rows.rows.filter((r) => r.CODIMUNI !== probe);
  rec.checks.everyFeatureCarriesValue = {
    probeCode: probe, inspected: rows.rows.length, mismatches: bad.length,
    pass: rows.rows.length > 0 && bad.length === 0,
  };
  rec.checks.everyFeatureCarriesValuePass = rec.checks.everyFeatureCarriesValue.pass;

  rec.FILTER_TRUSTWORTHY =
    rec.checks.negativeControlPass && rec.checks.twoMunicipalitiesPass &&
    rec.checks.sumOfPartsPass && rec.checks.everyFeatureCarriesValuePass;

  result.layers[L.name] = rec;
  console.error(
    `${L.name.padEnd(20)} total=${rec.unfilteredTotal} neg=${rec.checks.negativeControlPass ? 'PASS' : 'FAIL'} ` +
    `two=${rec.checks.twoMunicipalitiesPass ? 'PASS' : 'FAIL'} sum=${rec.checks.sumOfPartsPass ? 'PASS' : 'FAIL'}(${rec.checks.sumOfParts.sum}/${rec.unfilteredTotal}) ` +
    `carry=${rec.checks.everyFeatureCarriesValuePass ? 'PASS' : 'FAIL'} => ${rec.FILTER_TRUSTWORTHY ? 'TRUSTWORTHY' : '⛔ NOT TRUSTWORTHY'}`,
  );
}

result.verdict.allLayersTrustworthy = Object.values(result.layers).every((l) => l.FILTER_TRUSTWORTHY);
fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, 'q0-filter-integrity-control.json'), JSON.stringify(result, null, 2));
console.error(`\nALL LAYERS TRUSTWORTHY: ${result.verdict.allLayersTrustworthy}`);
