/**
 * Q3 - THE 67-MUNICIPALITY CENSUS: validity flags, instrument counts, and the
 * PTI (island territorial plan) adaptation question.
 *
 * KNOWN-ANSWER CONTROL: Balears has exactly 67 municipalities, split
 * Mallorca 53 / Menorca 8 / Eivissa 5 / Formentera 1. The island split here is
 * DERIVED from each municipality's own MUIB extent (longitude/latitude clusters
 * are disjoint between the four islands), NOT from a hardcoded list - so the
 * 53/8/5/1 split is an independent check that the derivation is sound.
 *
 * Run:  node tools/balears-muib-probe/q3-municipal-census.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { agsGet, count, distinct, sleep, EsriError } from './lib.mjs';

const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), 'out');

const QUAL = 10, RUSTIC = 11, CLASSIF = 12, GESTIO = 8;

// Island bounding boxes in EPSG:4326 (lon/lat). Disjoint by construction.
const ISLANDS = [
  { name: 'Mallorca', lon: [2.28, 3.55], lat: [39.24, 40.00] },
  { name: 'Menorca', lon: [3.75, 4.35], lat: [39.78, 40.12] },
  { name: 'Eivissa', lon: [1.18, 1.68], lat: [38.82, 39.16] },
  { name: 'Formentera', lon: [1.35, 1.62], lat: [38.60, 38.82] },
];

function islandOf(lon, lat) {
  const hits = ISLANDS.filter(
    (i) => lon >= i.lon[0] && lon <= i.lon[1] && lat >= i.lat[0] && lat <= i.lat[1],
  );
  if (hits.length === 1) return hits[0].name;
  if (hits.length === 0) return 'UNASSIGNED';
  return 'AMBIGUOUS:' + hits.map((h) => h.name).join('/');
}

const result = {
  probe: 'q3-municipal-census',
  runAt: new Date().toISOString(),
  municipalities: {},
  errors: [],
  controls: {},
};

// --- 1. the municipality list, from the classification layer (whole-territory).
const muniRows = await distinct(CLASSIF, ['CODIMUNI', 'MUNICIPI']);
result.controls.municipalityCount = muniRows.n;
result.controls.municipalityCountExpected = 67;
result.controls.municipalityCountMatches = muniRows.n === 67;
console.error(`municipalities from CLASSIFICACIO: ${muniRows.n} (expect 67)`);

// --- 2. per-municipality extent (for island assignment) + attributes.
for (const m of muniRows.rows) {
  const code = m.CODIMUNI;
  const rec = { codiMuni: code, municipi: m.MUNICIPI };
  try {
    // Extent in 4326 so island assignment is readable.
    const ext = await agsGet(`/${CLASSIF}/query`, {
      where: `CODIMUNI = '${code}'`,
      returnExtentOnly: 'true',
      outSR: '4326',
    });
    const e = ext.extent || {};
    rec.extent4326 = { xmin: e.xmin, ymin: e.ymin, xmax: e.xmax, ymax: e.ymax };
    const cx = (e.xmin + e.xmax) / 2, cy = (e.ymin + e.ymax) / 2;
    rec.centroid4326 = { lon: +cx.toFixed(5), lat: +cy.toFixed(5) };
    rec.island = islandOf(cx, cy);

    // Instruments governing this municipality's zoning.
    const cp = await distinct(QUAL, 'CODIPLA', `CODIMUNI = '${code}' AND CODIPLA IS NOT NULL AND CODIPLA <> ''`);
    rec.qualInstrumentCount = cp.n;
    rec.qualInstruments = cp.n <= 30 ? cp.rows.map((r) => r.CODIPLA) : cp.rows.slice(0, 30).map((r) => r.CODIPLA);
    rec.qualFeatureCount = (await count(QUAL, `CODIMUNI = '${code}'`)).count;

    // ⭐ VALIDITY SELF-DECLARATION: OBS on the zoning layer.
    const obsN = (await count(QUAL, `CODIMUNI = '${code}' AND OBS IS NOT NULL AND OBS <> ''`)).count;
    rec.qualObsCount = obsN;
    rec.qualObsPct = rec.qualFeatureCount ? +((100 * obsN) / rec.qualFeatureCount).toFixed(2) : null;
    if (obsN > 0) {
      const d = await distinct(QUAL, 'OBS', `CODIMUNI = '${code}' AND OBS IS NOT NULL AND OBS <> ''`);
      rec.qualObsValues = d.rows.map((r) => r.OBS);
    }
    rec.selfDeclaredNotCurrent = obsN > 0;

    // ⭐ THE PTI ABROGATION FLAG, on the rustic-categories layer.
    rec.rusticFeatureCount = (await count(RUSTIC, `CODIMUNI = '${code}'`)).count;
    const rObs = (await count(RUSTIC, `CODIMUNI = '${code}' AND OBS IS NOT NULL AND OBS <> ''`)).count;
    rec.rusticObsCount = rObs;
    rec.rusticObsPct = rec.rusticFeatureCount ? +((100 * rObs) / rec.rusticFeatureCount).toFixed(2) : null;

    // DFIVIGEN = end-of-validity. Non-null means an expiry is recorded.
    rec.qualDfivigenNonNull = (await count(QUAL, `CODIMUNI = '${code}' AND DFIVIGEN IS NOT NULL`)).count;
    rec.rusticDfivigenNonNull = (await count(RUSTIC, `CODIMUNI = '${code}' AND DFIVIGEN IS NOT NULL`)).count;

    // Management layer presence.
    rec.gestioFeatureCount = (await count(GESTIO, `CODIMUNI = '${code}'`)).count;
  } catch (err) {
    rec.error = String(err.message || err);
    rec.errorClass = err instanceof EsriError ? 'esri-error-in-200' : 'transport';
    result.errors.push({ codiMuni: code, error: rec.error, class: rec.errorClass });
  }
  result.municipalities[code] = rec;
  process.stderr.write(
    `${code} ${String(rec.municipi).padEnd(28)} ${String(rec.island).padEnd(11)} instr=${
      rec.qualInstrumentCount ?? '?'
    } qual=${rec.qualFeatureCount ?? '?'} OBS=${rec.qualObsPct ?? '?'}% rusticOBS=${
      rec.rusticObsPct ?? '?'
    }% gestio=${rec.gestioFeatureCount ?? '?'}${rec.error ? ' ERR ' + rec.error : ''}\n`,
  );
  await sleep(100);
}

// --- 3. controls + rollup
const byIsland = {};
for (const r of Object.values(result.municipalities)) {
  byIsland[r.island] = (byIsland[r.island] || 0) + 1;
}
result.controls.islandSplit = byIsland;
result.controls.islandSplitExpected = { Mallorca: 53, Menorca: 8, Eivissa: 5, Formentera: 1 };
result.controls.islandSplitMatches =
  byIsland.Mallorca === 53 && byIsland.Menorca === 8 && byIsland.Eivissa === 5 && byIsland.Formentera === 1;

const all = Object.values(result.municipalities);
result.rollup = {
  total: all.length,
  selfDeclaredNotCurrent: all.filter((r) => r.selfDeclaredNotCurrent).length,
  selfDeclaredNotCurrentNames: all.filter((r) => r.selfDeclaredNotCurrent).map((r) => r.municipi),
  withNoGestioPolygons: all.filter((r) => r.gestioFeatureCount === 0).length,
  withNoGestioNames: all.filter((r) => r.gestioFeatureCount === 0).map((r) => r.municipi),
  withRusticObs100: all.filter((r) => r.rusticObsPct === 100).length,
  withAnyDfivigen: all.filter((r) => (r.qualDfivigenNonNull || 0) + (r.rusticDfivigenNonNull || 0) > 0).length,
  multiInstrumentMunicipalities: all.filter((r) => (r.qualInstrumentCount || 0) > 1).length,
  maxInstrumentCount: Math.max(...all.map((r) => r.qualInstrumentCount || 0)),
};

fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, 'q3-municipal-census.json'), JSON.stringify(result, null, 2));
console.error('\n=== CONTROLS ===');
console.error(JSON.stringify(result.controls, null, 2));
console.error('=== ROLLUP ===');
console.error(JSON.stringify(result.rollup, null, 2));
console.error(`errors=${result.errors.length}`);
