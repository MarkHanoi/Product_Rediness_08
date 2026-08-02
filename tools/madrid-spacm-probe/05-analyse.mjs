/**
 * STEP 5 — Analysis over the FULL CENSUS from step 4. No sampling anywhere.
 *
 * TASK 1 — per-municipality non-null AND VALID rates. Never a regional mean: the distribution
 *          IS the finding. "POPULATED IS NOT PRESENT" — every numeric field is checked for
 *          sentinel values and internal contradiction before any rate is quoted.
 *
 * TASK 2 — the development override ratio, computed three ways with each denominator named,
 *          because "all urban parcels" has no single meaning in this dataset.
 *
 * Run: node tools/madrid-spacm-probe/05-analyse.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';

const OUT = new URL('./out/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const log = [];
const say = (s = '') => { console.log(s); log.push(s); };

const load = (n) => {
  const d = JSON.parse(readFileSync(`${OUT}/census-${n}.json`, 'utf8'));
  if (!d.reconciled) throw new Error(`${n} did not reconcile — refusing to analyse`);
  return d.rows;
};
const ORD = load('VPLA_V_ORDENANZA');
const AMB = load('VPLA_V_AMBITO');
const AMBM = load('VPLA_V_AMBITO_MODIF');
const CLAS = load('VPLA_V_CLASIFICACION');
const ORDR23 = load('VPLA_V_ORDENANZA_REF_23');

say(`census loaded — ORDENANZA ${ORD.length}, AMBITO ${AMB.length}, AMBITO_MODIF ${AMBM.length}, ` +
    `CLASIFICACION ${CLAS.length}, ORDENANZA_REF_23 ${ORDR23.length}`);

// ═══ 0 · SENTINEL DETECTION — populated is not present ═══════════════════════
say('\n' + '='.repeat(78));
say('0 · SENTINEL DETECTION on VPLA_V_ORDENANZA numeric fields');
say('   A value can be non-null and still be an absence. Zero is the prime suspect.');
say('='.repeat(78));
const NUMFIELDS = ['NM_ALTURA', 'NM_N_PLTA', 'NM_OCP_MX', 'NM_RTR_FRNT', 'NM_RTR_LATL',
  'NM_RTR_POST', 'NM_FDO_MX_ED', 'NM_FRTE_MIN', 'NM_APRV_BC', 'NM_C_ED_ORD', 'NM_S_MX_ED_O',
  'NM_C_ED_MAZ', 'NM_OCP_PB'];
const sentinel = {};
say('field           nonNull    zero   negative  |  min      p50      max    distinct');
for (const f of NUMFIELDS) {
  const vals = ORD.map((r) => r[f]).filter((v) => v !== null && v !== undefined);
  const zero = vals.filter((v) => v === 0).length;
  const neg = vals.filter((v) => v < 0).length;
  const pos = vals.filter((v) => v > 0).sort((a, b) => a - b);
  const distinct = new Set(vals).size;
  sentinel[f] = { nonNull: vals.length, zero, neg, positive: pos.length };
  say(`${f.padEnd(14)} ${String(vals.length).padStart(7)} ${String(zero).padStart(7)} ` +
      `${String(neg).padStart(9)}  | ${String(pos[0] ?? '-').padStart(6)} ` +
      `${String(pos[Math.floor(pos.length / 2)] ?? '-').padStart(8)} ` +
      `${String(pos[pos.length - 1] ?? '-').padStart(8)} ${String(distinct).padStart(8)}`);
}

// ═══ 0b · INTERNAL CONTRADICTION — altura vs plantas ════════════════════════
say('\n0b · INTERNAL CONTRADICTION CHECK — NM_ALTURA against NM_N_PLTA');
say('     A height and a storey count that disagree cannot both be trusted.');
const both = ORD.filter((r) => r.NM_ALTURA > 0 && r.NM_N_PLTA > 0);
const ratios = both.map((r) => r.NM_ALTURA / r.NM_N_PLTA);
const plausible = ratios.filter((x) => x >= 2.2 && x <= 5.0).length;
say(`     rows with BOTH > 0                : ${both.length}`);
say(`     metres-per-storey within [2.2,5.0]: ${plausible} (${(plausible / both.length * 100).toFixed(2)} %)`);
const bad = both.filter((r) => { const x = r.NM_ALTURA / r.NM_N_PLTA; return x < 2.2 || x > 5.0; });
say(`     contradictory rows                : ${bad.length}`);
say('     worst 8 by name (R4 — never let an aggregate stand alone):');
for (const r of bad.sort((a, b) => Math.abs(b.NM_ALTURA / b.NM_N_PLTA - 3) - Math.abs(a.NM_ALTURA / a.NM_N_PLTA - 3)).slice(0, 8)) {
  say(`        ${String(r.DS_MUNICIPIO).padEnd(24)} ${String(r.DS_NOMB_ORD).slice(0, 28).padEnd(29)} ` +
      `altura=${r.NM_ALTURA} plantas=${r.NM_N_PLTA} -> ${(r.NM_ALTURA / r.NM_N_PLTA).toFixed(1)} m/storey`);
}

// ═══ 1 · PER-MUNICIPALITY COVERAGE ═══════════════════════════════════════════
// valid := non-null AND strictly positive (zero is treated as absence — justified by §0)
const KEY = ['NM_ALTURA', 'NM_N_PLTA', 'NM_OCP_MX', 'NM_FDO_MX_ED', 'NM_RTR_FRNT',
  'NM_RTR_LATL', 'NM_RTR_POST', 'NM_C_ED_ORD', 'NM_APRV_BC'];

function byMuni(rows) {
  const m = new Map();
  for (const r of rows) {
    const k = `${r.CD_MUNICIPIO}|${r.DS_MUNICIPIO}`;
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(r);
  }
  return m;
}
const munis = byMuni(ORD);
say('\n' + '='.repeat(78));
say('1 · PER-MUNICIPALITY VALID RATE on VPLA_V_ORDENANZA — FULL CENSUS, n = N = 93,839');
say('    valid := non-null AND > 0.  ⛔ NO REGIONAL MEAN IS REPORTED — the spread is the finding.');
say('='.repeat(78));

const rowsOut = [];
for (const [k, rs] of munis) {
  const [cd, ds] = k.split('|');
  const rec = { cd, ds, n: rs.length };
  for (const f of KEY) rec[f] = rs.filter((r) => r[f] > 0).length / rs.length * 100;
  rec.footprintAny = rs.filter((r) => r.NM_OCP_MX > 0 || r.NM_FDO_MX_ED > 0 ||
    r.NM_RTR_FRNT > 0 || r.NM_RTR_LATL > 0 || r.NM_RTR_POST > 0).length / rs.length * 100;
  rec.heightAndFootprint = rs.filter((r) => (r.NM_ALTURA > 0 || r.NM_N_PLTA > 0) &&
    (r.NM_OCP_MX > 0 || r.NM_FDO_MX_ED > 0)).length / rs.length * 100;
  rowsOut.push(rec);
}
rowsOut.sort((a, b) => b.n - a.n);
say(`municipalities present in ORDENANZA: ${rowsOut.length} of 179`);
say('');
say('muni                     n     ALTURA  PLANTAS  OCP_MX  FDO_MX  RTR_FRNT  C_ED_ORD  APRV_BC  fpAny  H+FP');
const fmt = (x) => (x).toFixed(1).padStart(7);
for (const r of rowsOut.slice(0, 25)) {
  say(`${r.ds.slice(0, 22).padEnd(23)}${String(r.n).padStart(6)} ${fmt(r.NM_ALTURA)} ${fmt(r.NM_N_PLTA)} ` +
      `${fmt(r.NM_OCP_MX)} ${fmt(r.NM_FDO_MX_ED)} ${fmt(r.NM_RTR_FRNT)} ${fmt(r.NM_C_ED_ORD)} ` +
      `${fmt(r.NM_APRV_BC)} ${fmt(r.footprintAny)} ${fmt(r.heightAndFootprint)}`);
}

say('\n  DISTRIBUTION of NM_ALTURA valid-rate across the ' + rowsOut.length + ' municipalities:');
const alt = rowsOut.map((r) => r.NM_ALTURA).sort((a, b) => a - b);
const pctl = (p) => alt[Math.floor(p / 100 * (alt.length - 1))].toFixed(1);
say(`     min ${pctl(0)} | p10 ${pctl(10)} | p25 ${pctl(25)} | median ${pctl(50)} | p75 ${pctl(75)} | p90 ${pctl(90)} | max ${pctl(100)}`);
say(`     municipalities at 0.0 %  : ${rowsOut.filter((r) => r.NM_ALTURA === 0).length}`);
say(`     municipalities at 100.0 %: ${rowsOut.filter((r) => r.NM_ALTURA >= 99.95).length}`);
const madrid = rowsOut.find((r) => r.cd === '079');
say(`     MADRID CAPITAL (cd=079, n=${madrid.n}): ALTURA ${madrid.NM_ALTURA.toFixed(2)} % | ` +
    `PLANTAS ${madrid.NM_N_PLTA.toFixed(2)} % | footprint-any ${madrid.footprintAny.toFixed(2)} %`);

// weighted-by-feature regional figure, shown ONLY to be contrasted with the spread
const wAlt = ORD.filter((r) => r.NM_ALTURA > 0).length / ORD.length * 100;
say(`\n  (feature-weighted regional NM_ALTURA valid rate = ${wAlt.toFixed(2)} % — quoted ONLY to show`);
say('   that it conceals a ' + pctl(0) + '–' + pctl(100) + ' spread. It is not a description of any municipality.)');

writeFileSync(`${OUT}/05-coverage-by-municipality.json`, JSON.stringify(rowsOut, null, 2));
writeFileSync(`${OUT}/05-coverage-by-municipality.csv`,
  ['cd,municipio,n,' + KEY.join(',') + ',footprintAny,heightAndFootprint',
    ...rowsOut.map((r) => [r.cd, `"${r.ds}"`, r.n, ...KEY.map((f) => r[f].toFixed(2)),
      r.footprintAny.toFixed(2), r.heightAndFootprint.toFixed(2)].join(','))].join('\n'));

// ═══ 2 · THE DEVELOPMENT OVERRIDE RATIO ══════════════════════════════════════
say('\n' + '='.repeat(78));
say('2 · THE DEVELOPMENT OVERRIDE RATIO');
say('    "Parcels controlled by Plan Parcial / Especial / modificación over all urban parcels."');
say('    ⚠ This corpus contains NO PARCELS. It is measured over ordinance polygons and over');
say('      area. Each denominator is named. A parcel-weighted figure would need a Catastro join');
say('      and is reported below as UNKNOWN.');
say('='.repeat(78));

const DEV_FIGS = new Set(['Plan Parcial', 'Plan Especial', 'Plan Especial Reforma Interior',
  'Plan Parcial Reforma Interior', 'PERI', 'Programa Actuación Urbanística', 'Plan Sectorización',
  'Estudio Detalle']);

say('\n2a · DS_FIG_DES domain — EXACT, full census of VPLA_V_AMBITO (n=' + AMB.length + ')');
const figTally = new Map();
for (const r of AMB) figTally.set(r.DS_FIG_DES ?? '(null)', (figTally.get(r.DS_FIG_DES ?? '(null)') ?? 0) + 1);
for (const [v, n] of [...figTally].sort((a, b) => b[1] - a[1])) {
  const area = AMB.filter((r) => (r.DS_FIG_DES ?? '(null)') === v).reduce((s, r) => s + (r.NM_AREA ?? 0), 0);
  say(`   ${String(n).padStart(5)}  ${(area / 1e6).toFixed(1).padStart(9)} km²  ${v}`);
}

say('\n2b · Does ORDENANZA join to AMBITO?  (ORDENANZA.DS_NOM_AMB -> AMBITO.DS_NOMB_AMB, same municipality)');
const ambIndex = new Map();
for (const a of AMB) ambIndex.set(`${a.CD_MUNICIPIO}|${(a.DS_NOMB_AMB ?? '').trim().toUpperCase()}`, a);
let joined = 0, ordWithAmbName = 0, joinedDev = 0;
for (const o of ORD) {
  const nm = (o.DS_NOM_AMB ?? '').trim();
  if (!nm) continue;
  ordWithAmbName++;
  const a = ambIndex.get(`${o.CD_MUNICIPIO}|${nm.toUpperCase()}`);
  if (a) { joined++; if (DEV_FIGS.has(a.DS_FIG_DES)) joinedDev++; }
}
say(`   ORDENANZA rows carrying DS_NOM_AMB : ${ordWithAmbName} / ${ORD.length} (${(ordWithAmbName / ORD.length * 100).toFixed(2)} %)`);
say(`   of those, resolving to an AMBITO   : ${joined} (${(joined / Math.max(ordWithAmbName, 1) * 100).toFixed(2)} % of named)`);
say(`   ⇒ NAME JOIN IS ${joined / Math.max(ordWithAmbName, 1) < 0.5 ? 'UNRELIABLE — not used for the ratio below' : 'usable'}`);

say('\n2c · MEASURE 1 — by AREA, denominator = VPLA_V_CLASIFICACION urban+urbanizable land');
const clasGen = new Map();
for (const c of CLAS) clasGen.set(c.DS_CLASIF_GEN ?? '(null)', (clasGen.get(c.DS_CLASIF_GEN ?? '(null)') ?? 0) + (c.NM_AREA ?? 0));
say('   DS_CLASIF_GEN area breakdown (full census, n=' + CLAS.length + '):');
for (const [v, a] of [...clasGen].sort((x, y) => y[1] - x[1])) say(`      ${(a / 1e6).toFixed(1).padStart(10)} km²  ${v}`);

const isUrbanish = (s) => /urban/i.test(s ?? '') && !/no urbanizable/i.test(s ?? '');
const denomArea = CLAS.filter((c) => isUrbanish(c.DS_CLASIF_GEN)).reduce((s, c) => s + (c.NM_AREA ?? 0), 0);
const devAmbUrban = AMB.filter((a) => DEV_FIGS.has(a.DS_FIG_DES) && isUrbanish(a.DS_CLAS_SUE));
const numerArea = devAmbUrban.reduce((s, a) => s + (a.NM_AREA ?? 0), 0);
say(`   numerator  : ${devAmbUrban.length} development ámbitos on urban/urbanizable soil = ${(numerArea / 1e6).toFixed(1)} km²`);
say(`   denominator: urban+urbanizable classified land               = ${(denomArea / 1e6).toFixed(1)} km²`);
say(`   ⇒ DEVELOPMENT OVERRIDE RATIO (area, region-wide) = ${(numerArea / denomArea * 100).toFixed(2)} %`);

say('\n2d · MEASURE 2 — by ORDINANCE POLYGON, denominator = urban-classed ORDENANZA polygons');
const ordUrban = ORD.filter((o) => isUrbanish(o.DS_CLAS_SUE));
const devAmbNames = new Set(AMB.filter((a) => DEV_FIGS.has(a.DS_FIG_DES))
  .map((a) => `${a.CD_MUNICIPIO}|${(a.DS_NOMB_AMB ?? '').trim().toUpperCase()}`));
const ordUrbanDev = ordUrban.filter((o) =>
  devAmbNames.has(`${o.CD_MUNICIPIO}|${(o.DS_NOM_AMB ?? '').trim().toUpperCase()}`));
say(`   urban-classed ORDENANZA polygons              : ${ordUrban.length}`);
say(`   of those, inside a named development ámbito   : ${ordUrbanDev.length}`);
say(`   ⇒ ratio (ordinance-polygon, region-wide) = ${(ordUrbanDev.length / ordUrban.length * 100).toFixed(2)} %`);
say('   ⚠ LOWER BOUND ONLY — depends on the name join measured in 2b.');

say('\n2e · MEASURE 3 — the MODIF layers: how much of the corpus is a modification at all?');
say(`   VPLA_V_AMBITO       ${AMB.length}   VPLA_V_AMBITO_MODIF       ${AMBM.length}  ` +
    `ratio ${(AMBM.length / AMB.length * 100).toFixed(2)} %`);
const ordModCount = JSON.parse(readFileSync(`${OUT}/census-VPLA_V_ORDENANZA_MODIF.json`, 'utf8')).rows.length;
say(`   VPLA_V_ORDENANZA ${ORD.length}   VPLA_V_ORDENANZA_MODIF ${ordModCount}  ` +
    `ratio ${(ordModCount / ORD.length * 100).toFixed(2)} %`);
const modFig = new Map();
for (const r of AMBM) modFig.set(r.DS_FIG_DES ?? '(null)', (modFig.get(r.DS_FIG_DES ?? '(null)') ?? 0) + 1);
say('   AMBITO_MODIF DS_FIG_DES:');
for (const [v, n] of [...modFig].sort((a, b) => b[1] - a[1])) say(`      ${String(n).padStart(5)}  ${v}`);

say('\n2f · PER-MUNICIPALITY override ratio (area basis) — the spread, not the mean');
const perMuni = [];
for (const [k] of byMuni(CLAS)) {
  const [cd, ds] = k.split('|');
  const d = CLAS.filter((c) => c.CD_MUNICIPIO === cd && isUrbanish(c.DS_CLASIF_GEN)).reduce((s, c) => s + (c.NM_AREA ?? 0), 0);
  const n = AMB.filter((a) => a.CD_MUNICIPIO === cd && DEV_FIGS.has(a.DS_FIG_DES) && isUrbanish(a.DS_CLAS_SUE)).reduce((s, a) => s + (a.NM_AREA ?? 0), 0);
  if (d > 0) perMuni.push({ cd, ds, ratio: n / d * 100, denomKm2: d / 1e6 });
}
perMuni.sort((a, b) => b.ratio - a.ratio);
say(`   municipalities with a non-zero urban denominator: ${perMuni.length}`);
const rs = perMuni.map((x) => x.ratio).sort((a, b) => a - b);
const rp = (p) => rs[Math.floor(p / 100 * (rs.length - 1))].toFixed(1);
say(`   spread: min ${rp(0)} | p25 ${rp(25)} | median ${rp(50)} | p75 ${rp(75)} | p90 ${rp(90)} | max ${rp(100)}`);
say(`   MADRID CAPITAL: ${(perMuni.find((x) => x.cd === '079')?.ratio ?? NaN).toFixed(2)} %`);
say('   highest 10:');
for (const x of perMuni.slice(0, 10)) say(`      ${x.ds.slice(0, 24).padEnd(25)} ${x.ratio.toFixed(1).padStart(6)} %   (urban denom ${x.denomKm2.toFixed(1)} km²)`);
say(`   at exactly 0 %: ${perMuni.filter((x) => x.ratio === 0).length} municipalities`);
writeFileSync(`${OUT}/05-override-by-municipality.json`, JSON.stringify(perMuni, null, 2));

// ═══ 3 · PROVENANCE / VALIDITY LINEAGE ═══════════════════════════════════════
say('\n' + '='.repeat(78));
say('3 · PROVENANCE FIELDS — inventory items 3 (ordinance text) and 9 (validity lineage)');
say('='.repeat(78));
for (const f of ['DS_LEY', 'DS_PLANEAM_GRAL', 'DS_DOCU', 'FC_BOCM']) {
  const nn = ORD.filter((r) => r[f] !== null && r[f] !== undefined && String(r[f]).trim() !== '').length;
  const distinct = new Set(ORD.map((r) => r[f]).filter(Boolean)).size;
  say(`   ORDENANZA.${f.padEnd(16)} non-empty ${String(nn).padStart(6)} (${(nn / ORD.length * 100).toFixed(2)} %)  distinct ${distinct}`);
}
const docs = ORD.map((r) => r.DS_DOCU).filter(Boolean);
say(`   DS_DOCU sample values: ${[...new Set(docs)].slice(0, 3).map((d) => String(d).slice(0, 90)).join(' | ')}`);
const leys = [...new Set(ORD.map((r) => r.DS_LEY).filter(Boolean))];
say(`   DS_LEY distinct values (${leys.length}): ${leys.slice(0, 6).join(' | ')}`);

// ═══ 4 · REF_23 vs LIVE ═════════════════════════════════════════════════════
say('\n4 · REFUNDIDO REF_23 vs the live ORDENANZA layer');
say(`   live ORDENANZA ${ORD.length} vs REF_23 ${ORDR23.length} — refundido covers ` +
    `${(ORDR23.length / ORD.length * 100).toFixed(2)} % as many polygons`);
const r23alt = ORDR23.filter((r) => r.NM_ALTURA > 0).length / ORDR23.length * 100;
say(`   REF_23 NM_ALTURA valid rate (feature-weighted) = ${r23alt.toFixed(2)} % vs live ${wAlt.toFixed(2)} %`);
const munisLive = new Set(ORD.map((r) => r.CD_MUNICIPIO));
const munisR23 = new Set(ORDR23.map((r) => r.CD_MUNICIPIO));
say(`   municipalities: live ${munisLive.size}, REF_23 ${munisR23.size}, in live but NOT in REF_23 ` +
    `${[...munisLive].filter((m) => !munisR23.has(m)).length}`);

writeFileSync(`${OUT}/05-analyse.log`, log.join('\n'));
say('\nwritten: out/05-analyse.log, 05-coverage-by-municipality.{json,csv}, 05-override-by-municipality.json');
