/**
 * E3 — ⛔ THE CEILING: HOW FAR DOES THE PTI-ABROGATION FLAG REACH?
 *
 * The published assessment records "67 of 67 municipalities carry the PTI
 * abrogation flag ON RUSTIC — 94.53 % of the land", and treats the flag as
 * rustic-scoped. That was inferred from `rusticObsPct === 100` on layer 11
 * (CATEGORIES DEL SÒL RÚSTIC).
 *
 * ⛔ BUT LAYER 11 IS NOT A RUSTIC-ONLY LAYER. E1 measured its class split as
 * SR 25,264 / SU 552 / SB 297, and its SU/SB areas match CLASSIFICACIO's SU/SB
 * to the square metre — i.e. layer 11 also carries whole-territory
 * classification polygons. So "OBS on 100 % of layer-11 rows" may mean the flag
 * is attached to BUILDABLE polygons as well, and the rustic-only reading would
 * be an artefact of the layer's name.
 *
 * This measures, by census and never by inference:
 *   1. the DISTINCT OBS strings and what they actually say (scope is a text
 *      question — a percentage cannot answer it);
 *   2. OBS coverage BROKEN DOWN BY CODICLAS on layer 11 — flagged SU / SB / SR
 *      features and area;
 *   3. OBS coverage on QUALIFICACIONS (layer 10) by class — the layer that
 *      actually carries the envelope parameters;
 *   4. ⭐ the PTI reach into BUILDABLE land, in km² and as a percentage of the
 *      272.95 km² buildable denominator.
 *
 * ⛔ UNKNOWN NEVER NO: if the OBS text is scoped to rustic in words while
 * sitting on buildable rows, BOTH facts are reported and neither is resolved
 * into a single number.
 *
 * Run:  node tools/balears-envelope-max/e3-pti-reach.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { LAYER, count, distinct, distinctViaGroupBy, queryRows, stats, sleep } from './lib.mjs';

const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), 'out');
fs.mkdirSync(OUT, { recursive: true });

const NONEMPTY_OBS = "OBS IS NOT NULL AND OBS <> ''";
const R = { probe: 'e3-pti-reach', runAt: new Date().toISOString(), errors: [], controls: {} };

// ── 1 · WHAT DOES THE FLAG SAY? ──────────────────────────────────────────────
// ⛔ A PERCENTAGE CANNOT ANSWER A SCOPE QUESTION. Read the strings.
// distinct() is corroborated by the GROUP BY oracle on every call, because
// `returnDistinctValues` is silently cancellable on this backend (see E0).
for (const [nm, id] of [
  ['RUSTIC_CATEGORIES', LAYER.RUSTIC_CATEGORIES],
  ['QUALIFICACIONS', LAYER.QUALIFICACIONS],
]) {
  try {
    const d = await distinct(id, 'OBS', NONEMPTY_OBS);
    const oracle = await distinctViaGroupBy(id, 'OBS', NONEMPTY_OBS);
    R[`obsDistinct_${nm}`] = {
      n: d.n,
      deduplicated: d.deduplicated,
      oracleGroups: oracle.groups,
      oracleSumN: oracle.sumN,
      agrees: d.n === oracle.groups,
      exceededTransferLimit: d.exceededTransferLimit,
      values: d.rows.map((r) => r.OBS).slice(0, 40),
      // Length distribution separates a repeated BOILERPLATE FLAG from
      // per-feature prose. CHAR_LENGTH is used because this backend rejects
      // LEN()/TRIM() with an Esri 400 inside an HTTP 200.
    };
    console.error(`${nm}: distinct=${d.n} (dedup=${d.deduplicated}) oracle=${oracle.groups}`);
  } catch (err) {
    R.errors.push({ phase: `obsDistinct_${nm}`, error: String(err.message || err) });
  }
  await sleep(120);
}

// Verbatim OBS on BUILDABLE rows of each layer — the scope evidence.
for (const [nm, id] of [
  ['RUSTIC_CATEGORIES', LAYER.RUSTIC_CATEGORIES],
  ['QUALIFICACIONS', LAYER.QUALIFICACIONS],
]) {
  try {
    const r = await queryRows(
      id,
      `CODICLAS IN ('SU','SB') AND ${NONEMPTY_OBS}`,
      ['OBJECTID', 'CODIMUNI', 'MUNICIPI', 'CODICLAS', 'OBS'],
      { resultRecordCount: '25', orderByFields: 'OBJECTID' },
    );
    R[`obsVerbatimBuildable_${nm}`] = r.rows.map((x) => ({
      codiMuni: x.CODIMUNI,
      municipi: x.MUNICIPI,
      codiclas: x.CODICLAS,
      obs: String(x.OBS || '').slice(0, 600),
    }));
  } catch (err) {
    R.errors.push({ phase: `obsVerbatimBuildable_${nm}`, error: String(err.message || err) });
  }
  await sleep(120);
}
// …and on rustic, for comparison.
try {
  const r = await queryRows(
    LAYER.RUSTIC_CATEGORIES,
    `CODICLAS = 'SR' AND ${NONEMPTY_OBS}`,
    ['OBJECTID', 'CODIMUNI', 'MUNICIPI', 'OBS'],
    { resultRecordCount: '15', orderByFields: 'OBJECTID' },
  );
  R.obsVerbatimRustic = r.rows.map((x) => ({
    codiMuni: x.CODIMUNI,
    municipi: x.MUNICIPI,
    obs: String(x.OBS || '').slice(0, 600),
  }));
} catch (err) {
  R.errors.push({ phase: 'obsVerbatimRustic', error: String(err.message || err) });
}

// ⭐ Does the flag text NAME the island territorial plan, and does it name a
// SCOPE? Counted server-side over the whole layer, both classes.
const PTI_PATTERNS = [
  ['pti', "OBS LIKE '%PTI%'"],
  ['pla_territorial', "UPPER(OBS) LIKE '%TERRITORIAL%'"],
  ['derogad', "UPPER(OBS) LIKE '%DEROGAD%'"],
  ['adaptat', "UPPER(OBS) LIKE '%ADAPTA%'"],
  ['rustic_word', "UPPER(OBS) LIKE '%RÚSTIC%' OR UPPER(OBS) LIKE '%RUSTIC%'"],
  ['no_vigent', "UPPER(OBS) LIKE '%NO MOSTRA%' OR UPPER(OBS) LIKE '%VIGENT%'"],
];
R.flagTextCounts = {};
for (const [nm, id] of [
  ['RUSTIC_CATEGORIES', LAYER.RUSTIC_CATEGORIES],
  ['QUALIFICACIONS', LAYER.QUALIFICACIONS],
]) {
  R.flagTextCounts[nm] = {};
  for (const [key, pred] of PTI_PATTERNS) {
    try {
      R.flagTextCounts[nm][key] = {
        all: (await count(id, `(${pred})`)).count,
        buildable: (await count(id, `CODICLAS IN ('SU','SB') AND (${pred})`)).count,
      };
    } catch (err) {
      R.flagTextCounts[nm][key] = { error: String(err.message || err) };
    }
    await sleep(80);
  }
}

// ── 2 & 3 · WHERE DOES THE FLAG SIT? by class, features AND area ─────────────
async function obsByClass(nm, id, areaField) {
  const rec = { layerId: id };
  const all = await stats(
    id,
    '1=1',
    [
      { statisticType: 'count', onStatisticField: 'OBJECTID', outStatisticFieldName: 'N' },
      { statisticType: 'sum', onStatisticField: areaField, outStatisticFieldName: 'A' },
    ],
    'CODICLAS',
  );
  const flagged = await stats(
    id,
    NONEMPTY_OBS,
    [
      { statisticType: 'count', onStatisticField: 'OBJECTID', outStatisticFieldName: 'N' },
      { statisticType: 'sum', onStatisticField: areaField, outStatisticFieldName: 'A' },
    ],
    'CODICLAS',
  );
  const fm = Object.fromEntries(flagged.map((r) => [r.CODICLAS, r]));
  rec.byClass = all.map((r) => {
    const f = fm[r.CODICLAS];
    return {
      codiclas: r.CODICLAS,
      features: r.N,
      areaKm2: +(r.A / 1e6).toFixed(4),
      flaggedFeatures: f ? f.N : 0,
      flaggedAreaKm2: f ? +(f.A / 1e6).toFixed(4) : 0,
      flaggedFeaturePct: +((100 * (f ? f.N : 0)) / r.N).toFixed(2),
      flaggedAreaPct: +((100 * (f ? f.A : 0)) / r.A).toFixed(4),
    };
  });
  // control: flagged + unflagged must reconstruct the layer total
  const unflagged = (await count(id, `OBS IS NULL OR OBS = ''`)).count;
  const flaggedTotal = (await count(id, NONEMPTY_OBS)).count;
  const total = (await count(id, '1=1')).count;
  rec.control_partition = { total, flaggedTotal, unflagged, matches: flaggedTotal + unflagged === total };
  return rec;
}

try {
  R.rusticLayer = await obsByClass('RUSTIC_CATEGORIES', LAYER.RUSTIC_CATEGORIES, 'Shape_Area');
} catch (err) {
  R.errors.push({ phase: 'obsByClass rustic', error: String(err.message || err) });
}
await sleep(150);
try {
  R.qualLayer = await obsByClass('QUALIFICACIONS', LAYER.QUALIFICACIONS, 'Shape_Area');
} catch (err) {
  R.errors.push({ phase: 'obsByClass qual', error: String(err.message || err) });
}

// ── 4 · THE HEADLINE: PTI reach INTO BUILDABLE ───────────────────────────────
function reach(rec) {
  if (!rec) return null;
  const bs = rec.byClass.filter((c) => c.codiclas === 'SU' || c.codiclas === 'SB');
  const feat = bs.reduce((s, c) => s + c.features, 0);
  const flagFeat = bs.reduce((s, c) => s + c.flaggedFeatures, 0);
  const area = bs.reduce((s, c) => s + c.areaKm2, 0);
  const flagArea = bs.reduce((s, c) => s + c.flaggedAreaKm2, 0);
  return {
    buildableFeatures: feat,
    flaggedBuildableFeatures: flagFeat,
    flaggedFeaturePct: +((100 * flagFeat) / (feat || 1)).toFixed(2),
    buildableAreaKm2: +area.toFixed(4),
    flaggedBuildableAreaKm2: +flagArea.toFixed(4),
    flaggedAreaPct: +((100 * flagArea) / (area || 1)).toFixed(2),
  };
}
R.ptiReachIntoBuildable = {
  viaRusticCategoriesLayer: reach(R.rusticLayer),
  viaQualificacionsLayer: reach(R.qualLayer),
};

// per-municipality: is the flag universal on buildable rows of layer 11?
try {
  const g = await stats(
    LAYER.RUSTIC_CATEGORIES,
    "CODICLAS IN ('SU','SB')",
    [{ statisticType: 'count', onStatisticField: 'OBJECTID', outStatisticFieldName: 'N' }],
    'CODIMUNI',
  );
  const gf = await stats(
    LAYER.RUSTIC_CATEGORIES,
    `CODICLAS IN ('SU','SB') AND ${NONEMPTY_OBS}`,
    [{ statisticType: 'count', onStatisticField: 'OBJECTID', outStatisticFieldName: 'N' }],
    'CODIMUNI',
  );
  const m = Object.fromEntries(gf.map((r) => [r.CODIMUNI, r.N]));
  R.perMuniBuildableFlag = g.map((r) => ({
    codiMuni: r.CODIMUNI,
    buildableRows: r.N,
    flagged: m[r.CODIMUNI] || 0,
    allFlagged: (m[r.CODIMUNI] || 0) === r.N,
  }));
  R.perMuniBuildableFlagSummary = {
    municipalities: R.perMuniBuildableFlag.length,
    allFlagged: R.perMuniBuildableFlag.filter((x) => x.allFlagged).length,
    noneFlagged: R.perMuniBuildableFlag.filter((x) => x.flagged === 0).length,
  };
} catch (err) {
  R.errors.push({ phase: 'perMuniBuildableFlag', error: String(err.message || err) });
}

fs.writeFileSync(path.join(OUT, 'e3-pti-reach.json'), JSON.stringify(R, null, 2));
console.error('\n=== PTI REACH ===');
console.error(JSON.stringify(R.ptiReachIntoBuildable, null, 2));
console.error(JSON.stringify(R.perMuniBuildableFlagSummary, null, 2));
console.error('errors:', R.errors.length);
