// §MURCIA-ENVELOPE-MAX · STEP 11 — WHAT THE FICHA ACTUALLY ADDS
//
// ⚠ DERIVE THE DICTIONARY FROM THE DATA. Murcian abbreviations are NOT assumed — every
//   label is read verbatim from the documents, and the six target parameters are matched
//   against those labels, not against a guessed code list. (Balears' guessed codes collided
//   with USE CLASSES and reported 49/80 present values as 0/80 absent.)
//
// ⛔ VALID VALUES, NOT PRESENCE. A label that renders with an empty cell is ABSENT.
//   `0` and `100` are treated as null substitutes unless corroborated.
//   `ocupación = 100 %` alongside a setback is recorded as a CONTRADICTION, not a result.
//
// ⛔ §4 TAKE PARTIALS, PER MUNICIPALITY, NEVER A MEAN:
//     complete rule    = a footprint rule AND a height   → draws a solid
//     partial-drawable = a footprint rule OR  a height   → draws something with an open top
//     not drawable     = neither (Edificabilidad alone is a quantum, not a shape)
//
// ⭐ §5 ARTICLE CITED — the rate that decides publication. And the DISTINCTION that
//   matters: an article cited for a MODIFICATION of the plan is NOT an article that
//   GRANTS an envelope parameter. Both are counted, separately.

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { writeOut, HERE } from './lib.mjs';
import { classify } from './detect.mjs';

const RAW = join(HERE, 'raw-fichas');
const report = { step: 11, measuredAt: new Date().toISOString(), notes: [] };

const harvest = JSON.parse(readFileSync(join(HERE, 'out', '10-ficha-harvest.json'), 'utf8'));
const meta = new Map(harvest.sample.map((s) => [String(s.wide), s]));

// ── 11a · parse every harvested ficha into verbatim label/value pairs ────────
function parse(html) {
  const flat = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&ordm;|&deg;/g, 'º')
    .replace(/<[^>]+>/g, '');
  const cells = flat.split('').map((s) => s.replace(/\s+/g, ' ').trim()).filter((s) => s.length);
  const pairs = [];
  for (let i = 0; i < cells.length; i++) {
    if (!/:$/.test(cells[i])) continue;
    const label = cells[i].replace(/:$/, '').trim();
    if (label.length < 2 || label.length > 70) continue;
    // the value is the next non-label cell, if any before the next label
    let v = '';
    for (let k = i + 1; k < cells.length && k <= i + 3; k++) {
      if (/:$/.test(cells[k])) break;
      v = (v ? v + ' ' : '') + cells[k];
    }
    pairs.push({ label, value: v.trim() });
  }
  return { pairs, cells };
}

const docs = [];
for (const f of readdirSync(RAW)) {
  if (!f.endsWith('.html')) continue;
  const wide = /ficha-(\d+)\.html/.exec(f)?.[1];
  const html = readFileSync(join(RAW, f), 'utf8');
  // ⛔ POSITIVE classification only — see detect.mjs. The WAF's sensor script appears in
  //    successful pages too, so a "mentions perfdrive" test would discard real fichas.
  if (classify(html) !== 'ficha') continue;
  const { pairs, cells } = parse(html);
  const m = meta.get(wide);
  docs.push({ wide, municipio: m?.municipio ?? null, ambito: m?.ambito ?? null, clasificacion: m?.clasificacion ?? null, edificabilidad: m?.edificabilidad ?? null, pairs, cells, html });
}
console.log(`\n== 11a · ${docs.length} fichas parsed ==`);
report.fichasParsed = docs.length;
if (!docs.length) throw new Error('NO FICHAS PARSED — refusing to emit rates from an empty corpus');

// ── 11b · the verbatim label inventory, derived ─────────────────────────────
const labelStats = new Map();
for (const d of docs) {
  const seen = new Set();
  for (const { label, value } of d.pairs) {
    if (seen.has(label)) continue;
    seen.add(label);
    if (!labelStats.has(label)) labelStats.set(label, { label, docs: 0, populated: 0, samples: [] });
    const s = labelStats.get(label);
    s.docs++;
    if (value && value !== '-' && value !== '0') { s.populated++; if (s.samples.length < 6) s.samples.push(`${d.municipio}=${value.slice(0, 60)}`); }
  }
}
report.labelInventory = [...labelStats.values()]
  .sort((a, b) => b.docs - a.docs)
  .map((s) => ({ ...s, populatedPct: +((100 * s.populated) / s.docs).toFixed(1) }));
console.log('\n== 11b · verbatim label inventory (derived, not assumed) ==');
for (const s of report.labelInventory)
  console.log(`  ${s.label.slice(0, 48).padEnd(49)} in ${String(s.docs).padStart(3)} docs · populated ${String(s.populated).padStart(3)} (${s.populatedPct}%)`);

// ── 11c · THE SIX TARGET PARAMETERS, matched against DERIVED labels ─────────
// The matchers are deliberately GENEROUS on the Spanish/Murcian vocabulary so that a miss
// is a genuine absence, not a vocabulary gap.
const TARGETS = {
  'altura/plantas': /altura|plantas|nº de plantas|nº plantas|alt\. m[aá]x|cornisa/i,
  'ocupación': /ocupaci[oó]n/i,
  'edificabilidad/aprovechamiento': /edificabilidad|aprovechamiento|coef\.? edif/i,
  'retranqueos': /retranqueo|separaci[oó]n a lind|reculad/i,
  'fondo edificable': /fondo edificable|fondo m[aá]x|profundidad edificable/i,
  'parcela mínima': /parcela m[ií]nima|superficie m[ií]nima de parcela|parc\.? m[ií]n/i,
};

function validValue(v) {
  if (!v) return { ok: false, why: 'empty cell' };
  const s = v.trim();
  if (!s || s === '-' || s === '--' || /^n\/?a$/i.test(s)) return { ok: false, why: 'placeholder' };
  const n = Number(s.replace(/\./g, '').replace(',', '.').replace(/[^0-9.]/g, ''));
  if (!Number.isFinite(n)) return { ok: !!s, why: 'non-numeric text', text: s };
  // ⛔ 0 and 100 have BOTH been null substitutes in this corpus
  if (n === 0) return { ok: false, why: 'zero — null substitute' };
  return { ok: true, value: n, text: s };
}

console.log('\n== 11c · the six parameters, per ficha ==');
const perDoc = [];
for (const d of docs) {
  const found = {};
  for (const [target, re] of Object.entries(TARGETS)) {
    const hits = d.pairs.filter((p) => re.test(p.label));
    let best = null;
    for (const h of hits) {
      const v = validValue(h.value);
      if (v.ok) { best = { label: h.label, raw: h.value, ...v }; break; }
      if (!best) best = { label: h.label, raw: h.value, ok: false, why: v.why };
    }
    found[target] = best || { ok: false, why: 'label absent from document' };
  }
  perDoc.push({ wide: d.wide, municipio: d.municipio, ambito: d.ambito, clasificacion: d.clasificacion, params: found });
}
report.perDoc = perDoc;

// ── 11d · DRAWABILITY per ficha, then rolled up PER MUNICIPALITY ────────────
const FOOTPRINT = ['ocupación', 'retranqueos', 'fondo edificable'];
for (const p of perDoc) {
  const hasFootprint = FOOTPRINT.some((k) => p.params[k]?.ok);
  const hasHeight = !!p.params['altura/plantas']?.ok;
  p.drawability = hasFootprint && hasHeight ? 'complete-rule' : hasFootprint || hasHeight ? 'partial-drawable' : 'not-drawable';
  // ⛔ CONTRADICTION CHECK
  const occ = p.params['ocupación'];
  const ret = p.params['retranqueos'];
  p.contradiction = occ?.ok && occ.value === 100 && ret?.ok ? 'ocupación=100 % alongside a setback' : null;
}

// ── 11e · ⭐ ARTICLE CITATION RATE — the §5 comparison against Balears ───────
// Two kinds, counted separately:
//   GRANTING  — an article cited as the source of an envelope parameter
//   MODIFYING — an article cited in "Documentación adicional" as a plan modification
const ART = /\b(?:art[íi]?culo?s?\.?|art\.?|artº|arts?\.)\s*º?\s*\d+[\d.\-\/]*/gi;
console.log('\n== 11e · article citations ==');
for (const p of perDoc) {
  const d = docs.find((x) => x.wide === p.wide);
  const text = d.html.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ');
  const all = [...new Set((text.match(ART) || []).map((s) => s.trim()))];
  // where does each citation sit? "Documentación adicional" / "Observaciones" = modifying.
  const addIdx = text.search(/Documentaci[oó]n adicional/i);
  const modifying = [];
  const granting = [];
  for (const c of all) {
    const at = text.indexOf(c);
    (addIdx >= 0 && at > addIdx ? modifying : granting).push(c);
  }
  p.articles = { total: all.length, granting, modifying, anyCitation: all.length > 0 };
}

// ── 11f · PER MUNICIPALITY, NEVER A MEAN ────────────────────────────────────
console.log('\n== 11f · PER MUNICIPALITY ==');
const byMuni = new Map();
for (const p of perDoc) {
  if (!byMuni.has(p.municipio)) byMuni.set(p.municipio, []);
  byMuni.get(p.municipio).push(p);
}
const muniRows = [];
for (const [muni, list] of [...byMuni.entries()].sort()) {
  const row = {
    municipio: muni,
    fichas: list.length,
    completeRule: list.filter((p) => p.drawability === 'complete-rule').length,
    partialDrawable: list.filter((p) => p.drawability === 'partial-drawable').length,
    notDrawable: list.filter((p) => p.drawability === 'not-drawable').length,
    articleAnyCitation: list.filter((p) => p.articles.anyCitation).length,
    articleGranting: list.filter((p) => p.articles.granting.length > 0).length,
    contradictions: list.filter((p) => p.contradiction).length,
  };
  // ⛔ ASSERT THE DECOMPOSITION SUMS
  const s = row.completeRule + row.partialDrawable + row.notDrawable;
  if (s !== row.fichas) throw new Error(`DRAWABILITY DOES NOT SUM for ${muni}: ${s} != ${row.fichas}`);
  row.completeRulePct = +((100 * row.completeRule) / row.fichas).toFixed(1);
  row.partialDrawablePct = +((100 * row.partialDrawable) / row.fichas).toFixed(1);
  row.articleAnyPct = +((100 * row.articleAnyCitation) / row.fichas).toFixed(1);
  row.articleGrantingPct = +((100 * row.articleGranting) / row.fichas).toFixed(1);
  muniRows.push(row);
}
report.perMunicipality = muniRows;
console.log('  municipality                 n  complete  partial  not-draw  art(any)  art(granting)');
for (const r of muniRows)
  console.log(
    `  ${r.municipio.slice(0, 26).padEnd(27)} ${String(r.fichas).padStart(2)} ${String(r.completeRule).padStart(9)} ${String(r.partialDrawable).padStart(8)} ${String(r.notDrawable).padStart(9)} ${String(r.articleAnyCitation).padStart(9)} ${String(r.articleGranting).padStart(14)}`
  );

// ── 11g · corpus roll-up (stated as a corpus rate, NOT a per-municipality mean)
{
  const n = perDoc.length;
  const tot = {
    fichas: n,
    completeRule: perDoc.filter((p) => p.drawability === 'complete-rule').length,
    partialDrawable: perDoc.filter((p) => p.drawability === 'partial-drawable').length,
    notDrawable: perDoc.filter((p) => p.drawability === 'not-drawable').length,
    articleAny: perDoc.filter((p) => p.articles.anyCitation).length,
    articleGranting: perDoc.filter((p) => p.articles.granting.length > 0).length,
    contradictions: perDoc.filter((p) => p.contradiction).length,
  };
  if (tot.completeRule + tot.partialDrawable + tot.notDrawable !== n)
    throw new Error('CORPUS DRAWABILITY DOES NOT SUM');
  report.corpus = {
    ...tot,
    completeRulePct: +((100 * tot.completeRule) / n).toFixed(2),
    partialDrawablePct: +((100 * tot.partialDrawable) / n).toFixed(2),
    notDrawablePct: +((100 * tot.notDrawable) / n).toFixed(2),
    articleAnyPct: +((100 * tot.articleAny) / n).toFixed(2),
    articleGrantingPct: +((100 * tot.articleGranting) / n).toFixed(2),
    note: 'a corpus rate over the seeded sample; the per-municipality table above is the reportable form',
  };
  console.log('\n== 11g · corpus ==');
  console.log(`  n=${n}  complete-rule ${report.corpus.completeRulePct} %  partial-drawable ${report.corpus.partialDrawablePct} %  not-drawable ${report.corpus.notDrawablePct} %`);
  console.log(`  article cited ANYWHERE ${report.corpus.articleAnyPct} %  ·  article GRANTING a parameter ${report.corpus.articleGrantingPct} %`);
}

// ── 11h · per-parameter presence, corpus-wide ──────────────────────────────
console.log('\n== 11h · per-parameter VALID-VALUE rate ==');
report.perParameter = {};
for (const t of Object.keys(TARGETS)) {
  const ok = perDoc.filter((p) => p.params[t]?.ok).length;
  const labelPresentButEmpty = perDoc.filter((p) => !p.params[t]?.ok && p.params[t]?.why && p.params[t].why !== 'label absent from document').length;
  const labelAbsent = perDoc.filter((p) => p.params[t]?.why === 'label absent from document').length;
  report.perParameter[t] = {
    validValues: ok,
    of: perDoc.length,
    validPct: +((100 * ok) / perDoc.length).toFixed(2),
    labelPresentButNoValidValue: labelPresentButEmpty,
    labelAbsentEntirely: labelAbsent,
  };
  console.log(`  ${t.padEnd(32)} VALID ${String(ok).padStart(4)}/${perDoc.length}  (${report.perParameter[t].validPct} %)   label-present-but-empty ${labelPresentButEmpty}   label-absent ${labelAbsent}`);
}

writeOut('11-ficha-extract.json', report);
console.log('\nSTEP 11 done.');
