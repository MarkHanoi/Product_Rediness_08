/**
 * STEP 6 — Can VPLA_V_AMBITO_MODIF serve as the R layer (the instrument selector)?
 *
 * Envelope = Geometry( P( R(parcel) ) ). Madrid has P and cannot say which of 179 PGOU corpora
 * governs. An instrument selector must answer, for a parcel: WHICH instrument, of WHAT class,
 * approved WHEN, under WHICH statute. This step measures whether the layer carries all four,
 * and whether the answer is UNIQUE (an ámbito that returns two instruments is not a selector).
 *
 * Also measures the Ley 9/2001 bulk mandate: sectors must define uso and coeficiente de
 * edificabilidad. Mandated ≠ served — this measures served.
 *
 * Run: node tools/madrid-spacm-probe/06-r-layer.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';

const OUT = new URL('./out/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const log = [];
const say = (s = '') => { console.log(s); log.push(s); };
const load = (n) => {
  const d = JSON.parse(readFileSync(`${OUT}/census-${n}.json`, 'utf8'));
  if (!d.reconciled) throw new Error(`${n} not reconciled`);
  return d.rows;
};
const AMB = load('VPLA_V_AMBITO');
const AMBM = load('VPLA_V_AMBITO_MODIF');
const ORD = load('VPLA_V_ORDENANZA');

const nn = (rows, f) => rows.filter((r) => r[f] !== null && r[f] !== undefined && String(r[f]).trim() !== '').length;
const gz = (rows, f) => rows.filter((r) => r[f] > 0).length;
const p = (a, b) => (a / b * 100).toFixed(2) + ' %';

say('='.repeat(78));
say('6 · THE R LAYER — instrument selector capability');
say('='.repeat(78));
say('\nThe four things a selector must answer, measured on the FULL CENSUS of both ámbito layers:');
say('');
say('                                  VPLA_V_AMBITO (n=' + AMB.length + ')   VPLA_V_AMBITO_MODIF (n=' + AMBM.length + ')');
const SEL = [
  ['WHICH instrument (name)', 'DS_NOMB_AMB'],
  ['WHAT class  (figura)   ', 'DS_FIG_DES'],
  ['WHEN approved (FC_AC)  ', 'FC_AC'],
  ['WHEN published (BOCM)  ', 'FC_BOCM'],
  ['UNDER WHICH statute    ', 'DS_LEY'],
  ['general plan doc type  ', 'DS_DOCU'],
  ['general plan name      ', 'DS_PLANEAM_GRAL'],
  ['soil class             ', 'DS_CLAS_SUE'],
  ['linked ordinance       ', 'DS_ORD_ASOC'],
];
for (const [label, f] of SEL) {
  say(`  ${label}  ${f.padEnd(16)} ${p(nn(AMB, f), AMB.length).padStart(9)}            ${p(nn(AMBM, f), AMBM.length).padStart(9)}`);
}

say('\n6b · BULK — Ley 9/2001 requires sectors to define uso and coeficiente de edificabilidad.');
say('     MANDATED ≠ SERVED. This is served:');
const BULK = [
  ['NM_C_ED      coef. edificabilidad', 'NM_C_ED'],
  ['NM_C_ED_EST  coef. estimado      ', 'NM_C_ED_EST'],
  ['NM_S_MAX_ED  sup. máx. edificable', 'NM_S_MAX_ED'],
  ['NM_APRO_TIPO aprovechamiento tipo', 'NM_APRO_TIPO'],
  ['NM_S_TOT     superficie total    ', 'NM_S_TOT'],
  ['DS_US_PRED   uso predominante    ', 'DS_US_PRED'],
];
for (const [label, f] of BULK) {
  const a = f.startsWith('NM') ? gz(AMB, f) : nn(AMB, f);
  const b = f.startsWith('NM') ? gz(AMBM, f) : nn(AMBM, f);
  say(`  ${label}  ${p(a, AMB.length).padStart(9)}            ${p(b, AMBM.length).padStart(9)}`);
}
say('  (numeric fields counted as > 0, i.e. zero treated as absence — see step 5 §0)');

// A coefficient without its denominator is not a coefficient.
say('\n6c · CAN THE COEFFICIENT BE USED? A coef. needs a denominator area on the same row.');
for (const [nm, rows] of [['AMBITO', AMB], ['AMBITO_MODIF', AMBM]]) {
  const withCoef = rows.filter((r) => r.NM_C_ED > 0);
  const withBoth = withCoef.filter((r) => r.NM_S_TOT > 0);
  const withMaxEd = withCoef.filter((r) => r.NM_S_MAX_ED > 0);
  say(`  ${nm.padEnd(14)} coef>0 ${String(withCoef.length).padStart(5)}  ` +
      `+ superficie total ${String(withBoth.length).padStart(5)} (${p(withBoth.length, Math.max(withCoef.length, 1))})  ` +
      `+ sup.máx.edif ${String(withMaxEd.length).padStart(5)} (${p(withMaxEd.length, Math.max(withCoef.length, 1))})`);
  // internal contradiction: does coef * area reproduce the stated max buildable area?
  const check = withCoef.filter((r) => r.NM_S_TOT > 0 && r.NM_S_MAX_ED > 0);
  const agree = check.filter((r) => {
    const pred = r.NM_C_ED * r.NM_S_TOT;
    return Math.abs(pred - r.NM_S_MAX_ED) / r.NM_S_MAX_ED < 0.10;
  }).length;
  say(`     internal-contradiction check: NM_C_ED × NM_S_TOT ≈ NM_S_MAX_ED (±10 %) on ` +
      `${agree} / ${check.length} testable rows = ${p(agree, Math.max(check.length, 1))}`);
}

// UNIQUENESS — a selector that returns two instruments has not selected.
say('\n6d · UNIQUENESS — is the ámbito name unique inside a municipality?');
for (const [nm, rows] of [['AMBITO', AMB], ['AMBITO_MODIF', AMBM]]) {
  const keys = new Map();
  for (const r of rows) {
    const k = `${r.CD_MUNICIPIO}|${(r.DS_NOMB_AMB ?? '').trim().toUpperCase()}`;
    keys.set(k, (keys.get(k) ?? 0) + 1);
  }
  const dup = [...keys.values()].filter((v) => v > 1).length;
  say(`  ${nm.padEnd(14)} distinct (muni,name) keys ${String(keys.size).padStart(5)}  ` +
      `keys with >1 row ${String(dup).padStart(5)} (${p(dup, keys.size)})`);
}

// Do the two ámbito layers describe the same ámbitos, or different ones?
say('\n6e · IS AMBITO_MODIF A SUPERSET, A SUBSET, OR A DIFFERENT POPULATION than AMBITO?');
const kA = new Set(AMB.map((r) => `${r.CD_MUNICIPIO}|${(r.DS_NOMB_AMB ?? '').trim().toUpperCase()}`));
const kM = new Set(AMBM.map((r) => `${r.CD_MUNICIPIO}|${(r.DS_NOMB_AMB ?? '').trim().toUpperCase()}`));
const inBoth = [...kM].filter((k) => kA.has(k)).length;
say(`  keys in AMBITO ${kA.size} | in AMBITO_MODIF ${kM.size} | in both ${inBoth}`);
say(`  AMBITO_MODIF keys NOT in AMBITO: ${kM.size - inBoth} (${p(kM.size - inBoth, kM.size)})`);
say(`  ⇒ ${inBoth / kM.size > 0.8 ? 'MODIF largely re-states the same ámbitos'
      : 'MODIF is a substantially DIFFERENT population — it adds ámbitos AMBITO does not carry'}`);
const munisA = new Set(AMB.map((r) => r.CD_MUNICIPIO));
const munisM = new Set(AMBM.map((r) => r.CD_MUNICIPIO));
say(`  municipalities: AMBITO ${munisA.size}, AMBITO_MODIF ${munisM.size}`);

// Which statute governs? distribution of DS_LEY
say('\n6f · STATUTE LINEAGE — DS_LEY on ORDENANZA (full census)');
const ley = new Map();
for (const r of ORD) ley.set(r.DS_LEY ?? '(null)', (ley.get(r.DS_LEY ?? '(null)') ?? 0) + 1);
for (const [v, n] of [...ley].sort((a, b) => b[1] - a[1])) {
  say(`   ${String(n).padStart(6)}  ${p(n, ORD.length).padStart(8)}  ${v}`);
}
say('\n6g · GENERAL-PLAN DOCUMENT TYPE — DS_DOCU (full census, ORDENANZA)');
const doc = new Map();
for (const r of ORD) doc.set(r.DS_DOCU ?? '(null)', (doc.get(r.DS_DOCU ?? '(null)') ?? 0) + 1);
for (const [v, n] of [...doc].sort((a, b) => b[1] - a[1])) {
  say(`   ${String(n).padStart(6)}  ${p(n, ORD.length).padStart(8)}  ${v}`);
}
// How many DISTINCT general-plan corpora are actually in play?
const corpora = new Set(ORD.map((r) => `${r.CD_MUNICIPIO}|${r.DS_PLANEAM_GRAL}|${r.DS_DOCU}`));
say(`\n   DISTINCT (municipality, planeamiento general, doc type) corpora = ${corpora.size}`);
const corporaPerMuni = new Map();
for (const r of ORD) {
  const k = r.CD_MUNICIPIO;
  if (!corporaPerMuni.has(k)) corporaPerMuni.set(k, new Set());
  corporaPerMuni.get(k).add(`${r.DS_PLANEAM_GRAL}|${r.DS_DOCU}`);
}
const multi = [...corporaPerMuni.values()].filter((s) => s.size > 1).length;
say(`   municipalities carrying MORE THAN ONE general-plan corpus = ${multi} of ${corporaPerMuni.size}`);

writeFileSync(`${OUT}/06-r-layer.log`, log.join('\n'));
