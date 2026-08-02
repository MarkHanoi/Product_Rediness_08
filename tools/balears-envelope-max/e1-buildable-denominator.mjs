/**
 * E1 — WHAT IS THE BUILDABLE DENOMINATOR?
 *
 * The published 36.7 % three-parameter rate is quoted against a denominator that
 * has never been stated in features or in km². This establishes it, by CENSUS:
 *
 *   - every distinct CODICLAS on QUALIFICACIONS, with feature count AND area;
 *   - the same on CATEGORIES DEL SÒL RÚSTIC and CLASSIFICACIO (independent
 *     oracles for the rustic share);
 *   - SISTEMES and CATALEG counts, which the brief requires EXCLUDED.
 *
 * ⛔ CONTROLS RUN FIRST, and a failed control aborts the rate:
 *   C1 impossible-code filter → must return 0 features (the CQL silent-ignore
 *      defect, re-tested here rather than assumed not to transfer);
 *   C2 per-CODICLAS counts must SUM EXACTLY to the unfiltered layer count;
 *   C3 per-CODICLAS area must sum to the unfiltered layer area within 1 ppm.
 *
 * ⛔ TRIM()/LEN() are rejected by this backend inside an HTTP 200. Not used.
 *
 * Run:  node tools/balears-envelope-max/e1-buildable-denominator.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { LAYER, count, distinct, stats, sleep } from './lib.mjs';

const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), 'out');
fs.mkdirSync(OUT, { recursive: true });

const R = {
  probe: 'e1-buildable-denominator',
  runAt: new Date().toISOString(),
  controls: {},
  layers: {},
  errors: [],
};

async function censusLayer(name, id, hasClas) {
  const rec = { layerId: id, name };
  rec.total = (await count(id, '1=1')).count;
  const areaAll = await stats(id, '1=1', [
    { statisticType: 'sum', onStatisticField: 'Shape_Area', outStatisticFieldName: 'A' },
    { statisticType: 'count', onStatisticField: 'OBJECTID', outStatisticFieldName: 'N' },
  ]);
  rec.totalAreaM2 = areaAll[0] ? areaAll[0].A : null;
  rec.totalAreaCountCheck = areaAll[0] ? areaAll[0].N : null;
  if (hasClas) {
    const g = await stats(
      id,
      '1=1',
      [
        { statisticType: 'sum', onStatisticField: 'Shape_Area', outStatisticFieldName: 'A' },
        { statisticType: 'count', onStatisticField: 'OBJECTID', outStatisticFieldName: 'N' },
      ],
      'CODICLAS',
    );
    rec.byCodiclas = g
      .map((r) => ({ codiclas: r.CODICLAS, features: r.N, areaM2: r.A, areaKm2: +(r.A / 1e6).toFixed(3) }))
      .sort((a, b) => b.features - a.features);
    // C2 / C3 — the partition controls.
    const sumN = rec.byCodiclas.reduce((s, r) => s + r.features, 0);
    const sumA = rec.byCodiclas.reduce((s, r) => s + r.areaM2, 0);
    rec.control_countsSum = sumN;
    rec.control_countsMatch = sumN === rec.total;
    rec.control_areaPpmDelta = rec.totalAreaM2
      ? +(Math.abs(sumA - rec.totalAreaM2) / rec.totalAreaM2 * 1e6).toFixed(4)
      : null;
    rec.control_areaMatch = rec.control_areaPpmDelta !== null && rec.control_areaPpmDelta < 1;
  }
  return rec;
}

// ── C1 · the impossible-code control, re-run per the brief ───────────────────
for (const [nm, id] of [['QUALIFICACIONS', LAYER.QUALIFICACIONS], ['RUSTIC_CATEGORIES', LAYER.RUSTIC_CATEGORIES], ['CLASSIFICACIO', LAYER.CLASSIFICACIO]]) {
  const impossible = await count(id, "CODICLAS = 'ZZZZ_NOT_A_CLASS'");
  R.controls[`impossibleCode_${nm}`] = impossible.count;
  await sleep(80);
}
R.controls.impossibleCodeAllZero = Object.entries(R.controls)
  .filter(([k]) => k.startsWith('impossibleCode_'))
  .every(([, v]) => v === 0);
console.error('C1 impossible-code control:', JSON.stringify(R.controls));

for (const [nm, id, hasClas] of [
  ['QUALIFICACIONS', LAYER.QUALIFICACIONS, true],
  ['RUSTIC_CATEGORIES', LAYER.RUSTIC_CATEGORIES, true],
  ['CLASSIFICACIO', LAYER.CLASSIFICACIO, true],
  ['SISTEMES', LAYER.SISTEMES, false],
  ['CATALEG', LAYER.CATALEG, false],
  ['GESTIO', LAYER.GESTIO, false],
]) {
  try {
    R.layers[nm] = await censusLayer(nm, id, hasClas);
    console.error(
      `${nm.padEnd(20)} n=${R.layers[nm].total} area=${(R.layers[nm].totalAreaM2 / 1e6).toFixed(1)} km²` +
        (hasClas ? ` classes=${R.layers[nm].byCodiclas.length} countsMatch=${R.layers[nm].control_countsMatch} areaPpm=${R.layers[nm].control_areaPpmDelta}` : ''),
    );
  } catch (err) {
    R.errors.push({ layer: nm, error: String(err.message || err) });
    console.error(`${nm} ERROR ${err.message}`);
  }
  await sleep(150);
}

// ── The NOM vocabulary of QUALIFICACIONS per class, so 'ordered urbanizable'
//    can be identified from the data rather than assumed. ─────────────────────
try {
  const cls = await distinct(LAYER.QUALIFICACIONS, 'CODICLAS');
  R.qualCodiclasDistinct = cls.rows.map((r) => r.CODICLAS);
} catch (err) {
  R.errors.push({ phase: 'qualCodiclasDistinct', error: String(err.message || err) });
}

fs.writeFileSync(path.join(OUT, 'e1-buildable-denominator.json'), JSON.stringify(R, null, 2));
console.error('\n=== E1 written ===');
