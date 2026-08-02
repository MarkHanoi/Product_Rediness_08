/**
 * E0 — ⛔ IS `returnDistinctValues` HONOURED, OR SILENTLY IGNORED?
 *
 * E1 called distinct(QUALIFICACIONS,'CODICLAS') and got 46,607 rows of 'SU',
 * 'SU', 'SU'… — i.e. the FULL TABLE, not 3 distinct values. That is the exact
 * shape of the València `CQL_FILTER` defect: a query modifier accepted with an
 * HTTP 200 and NOT APPLIED, so the caller reads a row count as a distinct count.
 *
 * ⛔ THIS MATTERS BEYOND THIS PROBE. The published Balears headline is
 * "`QUALIFICACIONS.URL`: 100 % coverage AND 5,273 DISTINCT across 46,607 rows",
 * and "`GESTIO.URL`: 1,951 distinct / 2,210". Both were produced by the same
 * helper. If the modifier is conditionally ignored, one or both of those is a
 * ROW count wearing a DISTINCT label.
 *
 * KNOWN-ANSWER CONTROL: CLASSIFICACIO.CODIMUNI must be 67 (Balears has exactly
 * 67 municipalities) out of 916 rows, and CODICLAS must be 3. If a call returns
 * 916 it did not de-duplicate.
 *
 * The suspected difference between the working and failing calls is the extra
 * `resultRecordCount` parameter this probe's helper adds, so every combination
 * is run explicitly rather than reasoned about.
 *
 * Run:  node tools/balears-envelope-max/e0-distinct-integrity-control.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { LAYER, agsGet, count, sleep } from './lib.mjs';

const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), 'out');
fs.mkdirSync(OUT, { recursive: true });

const R = { probe: 'e0-distinct-integrity-control', runAt: new Date().toISOString(), trials: [] };

async function trial(name, layerId, field, extra, expected) {
  const p = {
    where: '1=1',
    outFields: field,
    returnDistinctValues: 'true',
    returnGeometry: 'false',
    ...extra,
  };
  try {
    const body = await agsGet(`/${layerId}/query`, p);
    const rows = (body.features || []).map((f) => f.attributes[field]);
    const trueDistinct = new Set(rows).size;
    const rec = {
      name,
      layerId,
      field,
      extra,
      rowsReturned: rows.length,
      trueDistinctInResponse: trueDistinct,
      exceededTransferLimit: body.exceededTransferLimit === true,
      expected,
      // If the server de-duplicated, rowsReturned === trueDistinct.
      serverDeduplicated: rows.length === trueDistinct,
      verdict:
        rows.length === trueDistinct && (expected == null || rows.length === expected)
          ? 'HONOURED'
          : rows.length !== trueDistinct
            ? '⛔ SILENTLY IGNORED (duplicates present in response)'
            : '⚠ deduplicated but count ≠ known answer',
    };
    R.trials.push(rec);
    console.error(
      `${name.padEnd(52)} rows=${String(rows.length).padStart(6)} trueDistinct=${String(trueDistinct).padStart(6)}  ${rec.verdict}`,
    );
    return rec;
  } catch (err) {
    const rec = { name, layerId, field, extra, error: String(err.message || err) };
    R.trials.push(rec);
    console.error(`${name} ERROR ${err.message}`);
    return rec;
  }
}

// ── known-answer controls on the small layer ─────────────────────────────────
R.knownAnswers = {
  classificacioRows: (await count(LAYER.CLASSIFICACIO, '1=1')).count,
  qualRows: (await count(LAYER.QUALIFICACIONS, '1=1')).count,
  gestioRows: (await count(LAYER.GESTIO, '1=1')).count,
  municipalitiesExpected: 67,
  codiclasExpected: 3,
};

await trial('CLASSIFICACIO.CODIMUNI  (no extras)', LAYER.CLASSIFICACIO, 'CODIMUNI', {}, 67);
await sleep(120);
await trial('CLASSIFICACIO.CODIMUNI  (+resultRecordCount 60000)', LAYER.CLASSIFICACIO, 'CODIMUNI', { resultRecordCount: '60000' }, 67);
await sleep(120);
await trial('CLASSIFICACIO.CODICLAS  (no extras)', LAYER.CLASSIFICACIO, 'CODICLAS', {}, 3);
await sleep(120);
await trial('CLASSIFICACIO.CODICLAS  (+resultRecordCount 60000)', LAYER.CLASSIFICACIO, 'CODICLAS', { resultRecordCount: '60000' }, 3);
await sleep(120);
await trial('QUALIFICACIONS.CODICLAS (no extras)', LAYER.QUALIFICACIONS, 'CODICLAS', {}, 3);
await sleep(200);
await trial('QUALIFICACIONS.CODICLAS (+resultRecordCount 60000)', LAYER.QUALIFICACIONS, 'CODICLAS', { resultRecordCount: '60000' }, 3);
await sleep(200);

// ── ⭐ THE PUBLISHED HEADLINE, RE-TESTED ─────────────────────────────────────
await trial('QUALIFICACIONS.URL      (no extras)  ⭐ headline 5,273', LAYER.QUALIFICACIONS, 'URL', {}, null);
await sleep(200);
await trial('QUALIFICACIONS.URL      (+resultRecordCount 60000)', LAYER.QUALIFICACIONS, 'URL', { resultRecordCount: '60000' }, null);
await sleep(200);
await trial('GESTIO.URL              (no extras)  ⭐ headline 1,951', LAYER.GESTIO, 'URL', {}, null);
await sleep(200);

// ── the independent oracle: GROUP BY. A statistics groupBy cannot silently
//    fail to group — the returned rows ARE the groups. ─────────────────────
async function groupOracle(name, layerId, field, where = '1=1') {
  const body = await agsGet(`/${layerId}/query`, {
    where,
    outStatistics: JSON.stringify([
      { statisticType: 'count', onStatisticField: 'OBJECTID', outStatisticFieldName: 'N' },
    ]),
    groupByFieldsForStatistics: field,
    returnGeometry: 'false',
    resultRecordCount: '60000',
  });
  const rows = (body.features || []).map((f) => f.attributes);
  const rec = {
    name,
    groups: rows.length,
    sumN: rows.reduce((s, r) => s + r.N, 0),
    exceededTransferLimit: body.exceededTransferLimit === true,
  };
  R.trials.push({ ...rec, method: 'GROUP BY oracle' });
  console.error(`ORACLE ${name.padEnd(45)} groups=${rec.groups} sumN=${rec.sumN} etl=${rec.exceededTransferLimit}`);
  return rec;
}

R.oracles = {};
R.oracles.classificacioCodimuni = await groupOracle('CLASSIFICACIO.CODIMUNI', LAYER.CLASSIFICACIO, 'CODIMUNI');
await sleep(150);
R.oracles.qualCodiclas = await groupOracle('QUALIFICACIONS.CODICLAS', LAYER.QUALIFICACIONS, 'CODICLAS');
await sleep(150);
R.oracles.qualUrl = await groupOracle('QUALIFICACIONS.URL ⭐', LAYER.QUALIFICACIONS, 'URL');
await sleep(150);
R.oracles.qualUrlBuildable = await groupOracle(
  'QUALIFICACIONS.URL on SU+SB ⭐',
  LAYER.QUALIFICACIONS,
  'URL',
  "CODICLAS IN ('SU','SB')",
);
await sleep(150);
R.oracles.gestioUrl = await groupOracle('GESTIO.URL ⭐', LAYER.GESTIO, 'URL');

fs.writeFileSync(path.join(OUT, 'e0-distinct-integrity-control.json'), JSON.stringify(R, null, 2));
console.error('\n=== E0 written ===');
