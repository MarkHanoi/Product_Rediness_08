/**
 * E4 — THE BUILDABLE INVENTORY, AND THE LAND WEIGHT BEHIND EVERY FITXA.
 *
 * ⭐ WHY THIS EXISTS. The 36.7 % baseline is a rate over FITXES — one vote per
 * zone-instance document. But a fitxa governs anything from 235 m² to several
 * km², so a per-fitxa rate answers "what fraction of DOCUMENTS are complete",
 * not "what fraction of BUILDABLE LAND can we draw on". Those are different
 * numbers and only the second one is the product question.
 *
 * This walks every SU/SB feature of QUALIFICACIONS (46,540) and builds the
 * URL → { features, area, municipalities, islands, zone groups } map, so any
 * fitxa sample can be re-weighted onto land afterwards.
 *
 * ⛔ CONTROLS:
 *   - the walk must reconcile against the returnCountOnly oracle;
 *   - summed Shape_Area must reconcile against the server-side SUM within 1 ppm;
 *   - pages must be DISJOINT on OBJECTID (paging is ordered, but verify);
 *   - distinct-URL count must agree with the GROUP BY oracle
 *     (⛔ never with returnDistinctValues alone — see E0).
 *
 * Islands are joined from tools/balears-muib-probe/out/q3-municipal-census.json,
 * READ-ONLY, whose 53/8/5/1 split was itself an independent known-answer check.
 *
 * Run:  node tools/balears-envelope-max/e4-buildable-inventory.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { LAYER, agsGet, count, stats, distinctViaGroupBy, sleep, findMuibArtefact, deriveIslands } from './lib.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, 'out');
fs.mkdirSync(OUT, { recursive: true });

// READ-ONLY input from the MUIB probe; derived from the service if unavailable.
const islandOf = {};
let islandSource;
const CENSUS = findMuibArtefact(HERE, 'out/q3-municipal-census.json', path, fs);
if (CENSUS) {
  const census = JSON.parse(fs.readFileSync(CENSUS, 'utf8'));
  for (const m of Object.values(census.municipalities)) islandOf[m.codiMuni] = m.island;
  islandSource = `balears-muib-probe q3 census (${CENSUS})`;
} else {
  const derived = await deriveIslands();
  for (const m of Object.values(derived)) islandOf[m.codiMuni] = m.island;
  islandSource = 'DERIVED live from CLASSIFICACIO extents (muib census artefact not reachable)';
}
const islandSplit = Object.values(islandOf).reduce((a, i) => ((a[i] = (a[i] || 0) + 1), a), {});
console.error(`islands from: ${islandSource}`);
console.error(`island split (known answer 53/8/5/1):`, JSON.stringify(islandSplit));

const BUILDABLE = "CODICLAS IN ('SU','SB')";
const PAGE = 8000;
const FIELDS = ['OBJECTID', 'CODIMUNI', 'MUNICIPI', 'CODICLAS', 'CODIMUIB', 'CODIMUIB_G', 'CODIPLA', 'URL', 'Shape_Area'];

const R = { probe: 'e4-buildable-inventory', runAt: new Date().toISOString(), controls: {}, errors: [] };
R.islandSource = islandSource;
R.controls.islandSplit = islandSplit;
R.controls.islandSplitMatchesKnownAnswer =
  islandSplit.Mallorca === 53 && islandSplit.Menorca === 8 && islandSplit.Eivissa === 5 && islandSplit.Formentera === 1;

// ── oracles first ────────────────────────────────────────────────────────────
R.controls.oracleCount = (await count(LAYER.QUALIFICACIONS, BUILDABLE)).count;
const areaOracle = await stats(LAYER.QUALIFICACIONS, BUILDABLE, [
  { statisticType: 'sum', onStatisticField: 'Shape_Area', outStatisticFieldName: 'A' },
]);
R.controls.oracleAreaM2 = areaOracle[0].A;
const urlOracle = await distinctViaGroupBy(LAYER.QUALIFICACIONS, 'URL', BUILDABLE);
R.controls.oracleDistinctUrls = urlOracle.groups;
R.controls.oracleUrlSumN = urlOracle.sumN;
console.error(
  `oracles: features=${R.controls.oracleCount} area=${(R.controls.oracleAreaM2 / 1e6).toFixed(3)} km² distinctUrls=${R.controls.oracleDistinctUrls}`,
);

// ── the walk ─────────────────────────────────────────────────────────────────
const rows = [];
const seenOid = new Set();
let dupOid = 0;
for (let offset = 0; ; offset += PAGE) {
  const body = await agsGet(`/${LAYER.QUALIFICACIONS}/query`, {
    where: BUILDABLE,
    outFields: FIELDS.join(','),
    returnGeometry: 'false',
    orderByFields: 'OBJECTID',
    resultOffset: String(offset),
    resultRecordCount: String(PAGE),
  }, { timeoutMs: 180000 });
  const page = (body.features || []).map((f) => f.attributes);
  for (const r of page) {
    if (seenOid.has(r.OBJECTID)) dupOid++;
    seenOid.add(r.OBJECTID);
    rows.push(r);
  }
  console.error(`  page @${offset}: ${page.length} rows (total ${rows.length})`);
  if (page.length < PAGE) break;
  if (offset > 200000) { R.errors.push({ phase: 'walk', error: 'runaway paging guard' }); break; }
  await sleep(200);
}

R.controls.walked = rows.length;
R.controls.walkDuplicateOids = dupOid;
R.controls.walkReconciles = rows.length === R.controls.oracleCount && dupOid === 0;
const walkedArea = rows.reduce((s, r) => s + (r.Shape_Area || 0), 0);
R.controls.walkedAreaM2 = walkedArea;
R.controls.areaPpmDelta = +((Math.abs(walkedArea - R.controls.oracleAreaM2) / R.controls.oracleAreaM2) * 1e6).toFixed(4);
R.controls.areaReconciles = R.controls.areaPpmDelta < 1;

if (!R.controls.walkReconciles || !R.controls.areaReconciles) {
  console.error('⛔ RECONCILIATION FAILED — inventory written but NOT usable as a denominator.');
}

// ── URL → land weight ────────────────────────────────────────────────────────
const byUrl = new Map();
let nullUrl = 0;
for (const r of rows) {
  const u = r.URL;
  if (!u) { nullUrl++; continue; }
  let e = byUrl.get(u);
  if (!e) {
    e = {
      url: u, features: 0, areaM2: 0, munis: new Set(), islands: new Set(),
      codimuibG: new Set(), codiclas: new Set(), codipla: new Set(),
      exampleMunicipi: r.MUNICIPI, exampleCodimuib: r.CODIMUIB,
    };
    byUrl.set(u, e);
  }
  e.features++;
  e.areaM2 += r.Shape_Area || 0;
  e.munis.add(r.CODIMUNI);
  e.islands.add(islandOf[r.CODIMUNI] || 'UNASSIGNED');
  e.codimuibG.add(r.CODIMUIB_G);
  e.codiclas.add(r.CODICLAS);
  e.codipla.add(r.CODIPLA);
}
R.controls.nullOrEmptyUrlFeatures = nullUrl;
R.controls.walkDistinctUrls = byUrl.size;
R.controls.urlAgreesWithOracle = byUrl.size === R.controls.oracleDistinctUrls;

const inventory = [...byUrl.values()]
  .map((e) => ({
    url: e.url,
    features: e.features,
    areaM2: +e.areaM2.toFixed(2),
    areaKm2: +(e.areaM2 / 1e6).toFixed(6),
    municipalities: [...e.munis],
    islands: [...e.islands],
    codimuibG: [...e.codimuibG],
    codiclas: [...e.codiclas],
    codipla: [...e.codipla],
    exampleMunicipi: e.exampleMunicipi,
    exampleCodimuib: e.exampleCodimuib,
  }))
  .sort((a, b) => b.areaM2 - a.areaM2);

// ── land-share concentration: is a per-fitxa rate even a fair proxy? ─────────
const totalArea = inventory.reduce((s, e) => s + e.areaM2, 0);
const sortedArea = [...inventory].sort((a, b) => b.areaM2 - a.areaM2);
const shareOfTop = (k) => +((100 * sortedArea.slice(0, k).reduce((s, e) => s + e.areaM2, 0)) / totalArea).toFixed(2);
R.concentration = {
  distinctFitxes: inventory.length,
  totalAreaKm2: +(totalArea / 1e6).toFixed(4),
  medianFitxaAreaM2: +sortedArea[Math.floor(sortedArea.length / 2)].areaM2.toFixed(1),
  top1PctFitxesShareOfLandPct: shareOfTop(Math.ceil(inventory.length * 0.01)),
  top5PctFitxesShareOfLandPct: shareOfTop(Math.ceil(inventory.length * 0.05)),
  top10PctFitxesShareOfLandPct: shareOfTop(Math.ceil(inventory.length * 0.1)),
};

// ── per-island and per-zone-group denominators ───────────────────────────────
const rollup = (keyFn) => {
  const m = {};
  for (const e of inventory) {
    for (const k of keyFn(e)) {
      m[k] ||= { fitxes: 0, features: 0, areaM2: 0 };
      m[k].fitxes++; m[k].features += e.features; m[k].areaM2 += e.areaM2;
    }
  }
  return Object.fromEntries(
    Object.entries(m).map(([k, v]) => [k, { ...v, areaKm2: +(v.areaM2 / 1e6).toFixed(4) }]),
  );
};
R.byIsland = rollup((e) => e.islands);
R.byZoneGroup = rollup((e) => e.codimuibG);
R.byClass = rollup((e) => e.codiclas);

fs.writeFileSync(path.join(OUT, 'e4-buildable-inventory.json'), JSON.stringify({ ...R, inventory }, null, 2));
console.error('\n=== E4 CONTROLS ===');
console.error(JSON.stringify(R.controls, null, 2));
console.error(JSON.stringify(R.concentration, null, 2));
console.error('byIsland:', JSON.stringify(R.byIsland, null, 2));
