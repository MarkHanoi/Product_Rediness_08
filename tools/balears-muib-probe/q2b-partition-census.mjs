/**
 * Q2b - IS THE ZONING LAYER A PARTITION? A CENSUS, WITH ZERO SAMPLING.
 *
 * ⭐ INDEPENDENT ORACLE for Q2 (PROBE-DISCIPLINE R2): this uses AREA
 * RECONCILIATION via `outStatistics`, a COMPLETELY DIFFERENT ALGORITHM from the
 * point-in-polygon test in q2-routing-sample.mjs. If the two agree, the R result
 * is not an artefact of either method.
 *
 * The claim under test: QUALIFICACIONS tiles each municipality exactly - i.e.
 * sum(zone areas) == classified area. If it does, a point resolves to exactly
 * one zone BY CONSTRUCTION, and instrument ambiguity can only come from parcels
 * that STRADDLE a boundary (which the footprint test measures separately).
 *
 * ⚠ WHAT THIS CHECK CANNOT SEE (PROBE-DISCIPLINE R7): equal sums do not
 * strictly prove zero overlap - an overlap could in principle be cancelled by an
 * exactly equal gap. It is reported as a RECONCILIATION, and is corroborated by
 * the independent point-multiplicity measurement, never quoted alone.
 *
 * Run:  node tools/balears-muib-probe/q2b-partition-census.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { agsGet, sleep, EsriError } from './lib.mjs';

const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), 'out');
const QUAL = 10, RUSTIC = 11, CLASSIF = 12;

const census = JSON.parse(fs.readFileSync(path.join(OUT, 'q3-municipal-census.json'), 'utf8'));

async function sumArea(layer, where) {
  const b = await agsGet(`/${layer}/query`, {
    where,
    outStatistics: JSON.stringify([
      { statisticType: 'sum', onStatisticField: 'Shape_Area', outStatisticFieldName: 'A' },
      { statisticType: 'count', onStatisticField: 'OBJECTID', outStatisticFieldName: 'N' },
    ]),
  });
  const a = b.features?.[0]?.attributes || {};
  return { area: a.A ?? null, n: a.N ?? null };
}

const result = {
  probe: 'q2b-partition-census',
  runAt: new Date().toISOString(),
  method: 'area reconciliation via outStatistics - CENSUS, zero sampling',
  oracleFor: 'q2-routing-sample.mjs (independent algorithm)',
  municipalities: {},
  errors: [],
};

for (const m of Object.values(census.municipalities)) {
  const w = `CODIMUNI = '${m.codiMuni}'`;
  const rec = { codiMuni: m.codiMuni, municipi: m.municipi, island: m.island };
  try {
    const [q, c, r] = [await sumArea(QUAL, w), await sumArea(CLASSIF, w), await sumArea(RUSTIC, w)];
    rec.qualArea = q.area; rec.qualN = q.n;
    rec.classifArea = c.area; rec.classifN = c.n;
    rec.rusticArea = r.area; rec.rusticN = r.n;
    if (q.area != null && c.area != null && c.area > 0) {
      rec.ratio = +(q.area / c.area).toFixed(8);
      rec.absDiffM2 = +(q.area - c.area).toFixed(3);
      rec.relDiffPpm = +(((q.area - c.area) / c.area) * 1e6).toFixed(3); // parts per million
      // "reconciles" = within 1 part per million of the classified area.
      rec.reconciles = Math.abs(rec.relDiffPpm) < 1;
    } else {
      rec.reconciles = null;
    }
  } catch (err) {
    rec.error = String(err.message || err);
    rec.errorClass = err instanceof EsriError ? 'esri-error-in-200' : 'transport';
    result.errors.push({ codiMuni: m.codiMuni, error: rec.error, class: rec.errorClass });
  }
  result.municipalities[m.codiMuni] = rec;
  process.stderr.write(
    `${m.codiMuni} ${String(m.municipi).padEnd(28)} qual=${rec.qualArea?.toFixed(0) ?? '?'} classif=${
      rec.classifArea?.toFixed(0) ?? '?'
    } ratio=${rec.ratio ?? '?'} ppm=${rec.relDiffPpm ?? '?'} ${rec.reconciles ? 'RECONCILES' : 'MISMATCH'}\n`,
  );
  await sleep(90);
}

const all = Object.values(result.municipalities).filter((r) => !r.error);
result.summary = {
  total: all.length,
  reconciles: all.filter((r) => r.reconciles === true).length,
  mismatch: all.filter((r) => r.reconciles === false).length,
  worstByAbsPpm: all
    .filter((r) => r.relDiffPpm != null)
    .sort((a, b) => Math.abs(b.relDiffPpm) - Math.abs(a.relDiffPpm))
    .slice(0, 10)
    .map((r) => ({ municipi: r.municipi, island: r.island, ppm: r.relDiffPpm, absDiffM2: r.absDiffM2, ratio: r.ratio })),
  totalQualAreaKm2: +(all.reduce((s, r) => s + (r.qualArea || 0), 0) / 1e6).toFixed(3),
  totalClassifAreaKm2: +(all.reduce((s, r) => s + (r.classifArea || 0), 0) / 1e6).toFixed(3),
};
// KNOWN-ANSWER CONTROL: Balears land area is ~4,992 km2.
result.summary.knownAnswerControl = {
  publishedBalearsLandAreaKm2: 4992,
  measuredClassifiedKm2: result.summary.totalClassifAreaKm2,
  withinTenPercent:
    Math.abs(result.summary.totalClassifAreaKm2 - 4992) / 4992 < 0.1,
};

fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, 'q2b-partition-census.json'), JSON.stringify(result, null, 2));
console.error('\n=== SUMMARY ===');
console.error(JSON.stringify(result.summary, null, 2));
console.error(`errors=${result.errors.length}`);
