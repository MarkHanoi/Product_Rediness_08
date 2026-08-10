/**
 * E2 — INSIDE THE BUILDABLE DENOMINATOR: what is actually envelope-BEARING?
 *
 * E1 proved QUALIFICACIONS is a 3-class partition (SU / SB / SR) and that only
 * 67 of its 46,607 rows are rustic. So "exclude rustic" is nearly a no-op on
 * this layer. The live question is the one below it:
 *
 *   ⭐ how much of SU+SB is PUBLIC SYSTEM land (road, open space, equipment) —
 *   land that carries NO private envelope and therefore must not sit in the
 *   denominator of an envelope rate?
 *
 * MUIB harmonises the zone type into `CODIMUIB`. This censuses that vocabulary
 * over SU+SB with feature counts and area, and cross-checks the system share
 * against the independent SISTEMES layer (id 6), which is a different table
 * produced by the same publisher — an independent oracle, not a restatement.
 *
 * ⛔ CONTROLS: per-value counts must SUM to the SU+SB total; an impossible
 * CODIMUIB must return 0.
 *
 * Run:  node tools/balears-envelope-max/e2-buildable-vocabulary.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { LAYER, count, stats, distinct } from './lib.mjs';

const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), 'out');
fs.mkdirSync(OUT, { recursive: true });

const BUILDABLE = "CODICLAS IN ('SU','SB')";

const R = { probe: 'e2-buildable-vocabulary', runAt: new Date().toISOString(), controls: {}, errors: [] };

R.controls.impossibleCodimuib = (await count(LAYER.QUALIFICACIONS, "CODIMUIB = 'ZZZZ_NOPE'")).count;
R.buildableFeatures = (await count(LAYER.QUALIFICACIONS, BUILDABLE)).count;

const g = await stats(
  LAYER.QUALIFICACIONS,
  BUILDABLE,
  [
    { statisticType: 'sum', onStatisticField: 'Shape_Area', outStatisticFieldName: 'A' },
    { statisticType: 'count', onStatisticField: 'OBJECTID', outStatisticFieldName: 'N' },
  ],
  'CODIMUIB',
);
R.byCodimuib = g
  .map((r) => ({ codimuib: r.CODIMUIB, features: r.N, areaM2: r.A, areaKm2: +(r.A / 1e6).toFixed(4) }))
  .sort((a, b) => b.features - a.features);
R.controls.codimuibDistinct = R.byCodimuib.length;
R.controls.codimuibCountsSum = R.byCodimuib.reduce((s, r) => s + r.features, 0);
R.controls.codimuibCountsMatch = R.controls.codimuibCountsSum === R.buildableFeatures;
R.buildableAreaM2 = R.byCodimuib.reduce((s, r) => s + r.areaM2, 0);

// CODIMUIB_G — the coarser grouping, if it exists.
try {
  const gg = await stats(
    LAYER.QUALIFICACIONS,
    BUILDABLE,
    [
      { statisticType: 'sum', onStatisticField: 'Shape_Area', outStatisticFieldName: 'A' },
      { statisticType: 'count', onStatisticField: 'OBJECTID', outStatisticFieldName: 'N' },
    ],
    'CODIMUIB_G',
  );
  R.byCodimuibG = gg
    .map((r) => ({ g: r.CODIMUIB_G, features: r.N, areaKm2: +(r.A / 1e6).toFixed(4) }))
    .sort((a, b) => b.features - a.features);
  R.controls.codimuibGCountsMatch =
    R.byCodimuibG.reduce((s, r) => s + r.features, 0) === R.buildableFeatures;
} catch (err) {
  R.errors.push({ phase: 'codimuibG', error: String(err.message || err) });
}

// Independent oracle: the SISTEMES layer's own vocabulary + area.
try {
  R.sistemes = {
    features: (await count(LAYER.SISTEMES, '1=1')).count,
    byCodimuib: (
      await stats(
        LAYER.SISTEMES,
        '1=1',
        [
          { statisticType: 'sum', onStatisticField: 'SHAPE_Area', outStatisticFieldName: 'A' },
          { statisticType: 'count', onStatisticField: 'OBJECTID', outStatisticFieldName: 'N' },
        ],
        'CODIMUIB',
      )
    )
      .map((r) => ({ codimuib: r.CODIMUIB, features: r.N, areaKm2: +(r.A / 1e6).toFixed(4) }))
      .sort((a, b) => b.features - a.features)
      .slice(0, 40),
  };
} catch (err) {
  R.errors.push({ phase: 'sistemes', error: String(err.message || err) });
}

// NOM vocabulary — free text, but it names the zone in words.
try {
  const n = await distinct(LAYER.QUALIFICACIONS, 'NOM', BUILDABLE);
  R.nomDistinct = n.n;
  R.nomExceededTransferLimit = n.exceededTransferLimit;
  R.nomSample = n.rows.slice(0, 60).map((r) => r.NOM);
} catch (err) {
  R.errors.push({ phase: 'nom', error: String(err.message || err) });
}

fs.writeFileSync(path.join(OUT, 'e2-buildable-vocabulary.json'), JSON.stringify(R, null, 2));
console.error(JSON.stringify({ ...R, byCodimuib: `${R.byCodimuib.length} values`, nomSample: '…', sistemes: '…' }, null, 2));
console.error('\ntop CODIMUIB on SU+SB:');
for (const r of R.byCodimuib.slice(0, 30)) console.error(`  ${String(r.codimuib).padEnd(14)} n=${String(r.features).padStart(6)}  ${r.areaKm2} km²`);
