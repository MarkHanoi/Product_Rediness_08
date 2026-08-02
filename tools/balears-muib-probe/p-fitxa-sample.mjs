/**
 * P - EXTRACTION. Does the normativa URL yield GEOMETRIC PARAMETERS?
 *
 * The brief asked for ONE ordinance read. Two reads found VARIANCE - Manacor
 * RE-NA published NP=3 plantes and O=80%, while RE-IP-1 published a BLANK NP
 * ("segons planols d'ordenacio") and NO occupation parameter at all. One read
 * therefore cannot answer the question, so this measures a SEEDED SAMPLE.
 *
 * ⛔ POPULATED IS NOT PRESENT: a parameter ROW can exist with an EMPTY value and
 * the real number deferred to the ordinance drawings. This parses the value cell
 * and distinguishes:
 *     PRESENT_NUMERIC  - a usable number
 *     PRESENT_EMPTY    - the row exists, the value does not (deferred to planols)
 *     ABSENT           - no such row in the fitxa
 *
 * Sample is drawn from the QUALIFICACIONS layer's DISTINCT normativa URLs
 * (one fitxa per zone-instance), seeded and stratified by island.
 *
 * Run:  node tools/balears-muib-probe/p-fitxa-sample.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { queryRows, rng, sleep } from './lib.mjs';

const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), 'out');
const SEED = 20260802;
const PER_ISLAND = { Mallorca: 40, Menorca: 15, Eivissa: 15, Formentera: 10 };

const census = JSON.parse(fs.readFileSync(path.join(OUT, 'q3-municipal-census.json'), 'utf8'));
const byIsland = {};
for (const m of Object.values(census.municipalities)) (byIsland[m.island] ||= []).push(m);

// Parameters we need for an envelope, by their MUIB dictionary code.
//
// ⚠ CODES CORRECTED 2026-08-02 FROM p-dictionary-scan.mjs. The first version of
// this probe ASSUMED the code names and was WRONG in a way that silently
// reported real data as ABSENT, and worse, COLLIDED WITH USE-CLASS CODES:
//   - regulated height is HR / HT, NOT 'AR' / 'AT'.
//     ⛔ 'AT' in the real dictionary is "Allotjament turistic" - a USE, not a height.
//   - setbacks are "Reculada" (RA / RF / RM), NOT "Retranqueig" (RL / RP).
//     ⛔ 'RL' in the real dictionary is "Religios" - a USE, not a setback.
// The retracted run reported AR 0/80 and AT 0/80 "ABSENT"; HR is in fact present
// and numeric on most fitxes. Derive the dictionary, never assume it.
const WANT = [
  { code: 'NP', label: 'Nombre de plantes (storeys)' },
  { code: 'HR', label: 'Altura reguladora (regulated height, m)' },
  { code: 'HT', label: 'Altura total (total height, m)' },
  { code: 'O', label: 'Ocupacio maxima (%)' },
  { code: 'E', label: 'Coeficient edificabilitat neta (FAR)' },
  { code: 'PM', label: 'Parcel*la minima (m2)' },
  { code: 'AM', label: 'Amplada minima de facana (m)' },
  { code: 'RA', label: 'Reculada a alineacio oficial (front setback)' },
  { code: 'RF', label: "Reculada a interior d'illa (rear setback)" },
  { code: 'RM', label: 'Reculada a mitgera (party-wall setback)' },
  { code: 'IRP', label: 'Index intensitat us' },
  { code: 'T', label: 'Tipus ordenacio' },
];

function toText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Parse the fitxa's parameter rows out of the table markup. */
function parseFitxa(html) {
  const fullText = toText(html);
  // ⛔ PARSE ONLY THE PARAMETER REGION. Parameter codes COLLIDE with use-class
  // codes further down the fitxa (AT = Allotjament turistic, RL = Religios,
  // RE = Recreatiu, CO = Comercial...). Scanning the whole page therefore
  // matches a USE row and reports it as a geometric parameter. Everything from
  // the first "US <SECTION>" header onward is the use matrix, not parameters.
  const useStart = fullText.search(/[ÚU]S\s+(RESIDENCIAL|TUR[ÍI]STIC|TERCIARI|INDUSTRIAL|DOTACIONAL|ESPAI|EQUIPAMENTS)/);
  const text = useStart > 0 ? fullText.slice(0, useStart) : fullText;
  const out = { params: {}, articleRefs: [], rawLen: fullText.length, paramRegionLen: text.length };
  // Article references anywhere in the fitxa (the citation requirement).
  const arts = fullText.match(/[Aa]rticle\s+[\d]+(?:\.[\d]+)*(?:\.[a-z])?/g) || [];
  out.articleRefs = [...new Set(arts)];
  // Rows look like:  "CODE: Label --> VALUE UNITS Regim..."
  for (const w of WANT) {
    const re = new RegExp(
      `(?:^|\\s)${w.code.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}:\\s*([^-]{0,80}?)\\s*-->\\s*([\\s\\S]{0,120}?)(?=\\s(?:Sense r[eè]gims|Un r[eè]gim|Dos r[eè]gims|[A-Z]{1,4}:|PARAMETRE|ÚS |ALTRES|Observacions))`,
      '', // CASE-SENSITIVE: dictionary codes are uppercase, and a case-insensitive
          // match would let 'O:' or 'E:' match lowercase text mid-sentence.
    );
    const m = text.match(re);
    if (!m) { out.params[w.code] = { status: 'ABSENT' }; continue; }
    const val = (m[2] || '').trim();
    // A leading number = a usable value. No leading number = row present, value deferred.
    const num = val.match(/^(-?\d+(?:[.,]\d+)?)/);
    if (num) {
      out.params[w.code] = { status: 'PRESENT_NUMERIC', value: parseFloat(num[1].replace(',', '.')), raw: val.slice(0, 60) };
    } else if (w.code === 'T') {
      out.params[w.code] = { status: val ? 'PRESENT_TEXT' : 'PRESENT_EMPTY', raw: val.slice(0, 60) };
    } else {
      out.params[w.code] = { status: 'PRESENT_EMPTY', raw: val.slice(0, 60) };
    }
  }
  out.deferredToPlanols = /segons\s+pl[àa]nols/i.test(text);
  return out;
}

const rand = rng(SEED);
const result = {
  probe: 'p-fitxa-sample', runAt: new Date().toISOString(), seed: SEED, perIsland: PER_ISLAND,
  note: 'urban (SU/SB) zones only - rustic categories are governed by a different regime',
  fitxes: [], errors: [],
};

for (const [island, target] of Object.entries(PER_ISLAND)) {
  const munis = byIsland[island] || [];
  // Pool of distinct fitxa URLs for urban/urbanitzable zones on this island.
  const pool = [];
  for (const mu of munis) {
    try {
      const r = await queryRows(
        10,
        `CODIMUNI = '${mu.codiMuni}' AND CODICLAS IN ('SU','SB') AND URL IS NOT NULL AND URL <> ''`,
        ['URL', 'CODIAJ', 'CODIMUIB', 'CODIPLA', 'CODICLAS', 'MUNICIPI', 'IDENTITAT'],
        { returnDistinctValues: 'true', resultRecordCount: '2000' },
      );
      for (const row of r.rows) pool.push({ ...row, island, muni: mu.municipi });
    } catch (err) {
      result.errors.push({ island, muni: mu.municipi, phase: 'pool', error: String(err.message) });
    }
    await sleep(60);
  }
  // Seeded draw WITHOUT replacement.
  const picked = [];
  const seen = new Set();
  let guard = 0;
  while (picked.length < Math.min(target, pool.length) && guard++ < 5000) {
    const c = pool[Math.floor(rand() * pool.length)];
    if (!c || seen.has(c.URL)) continue;
    seen.add(c.URL); picked.push(c);
  }
  console.error(`${island}: pool=${pool.length} distinct-url, drawing ${picked.length}`);

  for (const p of picked) {
    try {
      const res = await fetch(p.URL, { headers: { 'User-Agent': 'PRYZM-balears-muib-probe/1.0' } });
      const html = await res.text();
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const parsed = parseFitxa(html);
      result.fitxes.push({ island, muni: p.MUNICIPI, codiPla: p.CODIPLA, codiAj: p.CODIAJ, codiMuib: p.CODIMUIB, soil: p.CODICLAS, url: p.URL, ...parsed });
    } catch (err) {
      result.errors.push({ island, url: p.URL, phase: 'fetch', error: String(err.message) });
    }
    await sleep(140);
  }
}

// ── AGGREGATE ────────────────────────────────────────────────────────────────
const F = result.fitxes;
const stat = (code) => {
  const s = { PRESENT_NUMERIC: 0, PRESENT_TEXT: 0, PRESENT_EMPTY: 0, ABSENT: 0 };
  for (const f of F) s[f.params[code]?.status || 'ABSENT']++;
  const n = F.length || 1;
  return { ...s, usablePct: +((100 * (s.PRESENT_NUMERIC + s.PRESENT_TEXT)) / n).toFixed(2) };
};
result.summary = {
  fitxesRead: F.length,
  byIsland: Object.fromEntries(Object.keys(PER_ISLAND).map((i) => [i, F.filter((f) => f.island === i).length])),
  parameters: Object.fromEntries(WANT.map((w) => [w.code, { label: w.label, ...stat(w.code) }])),
  withAnyArticleRef: F.filter((f) => f.articleRefs.length > 0).length,
  withAnyArticleRefPct: +((100 * F.filter((f) => f.articleRefs.length > 0).length) / (F.length || 1)).toFixed(2),
  deferredToPlanols: F.filter((f) => f.deferredToPlanols).length,
  deferredToPlanolsPct: +((100 * F.filter((f) => f.deferredToPlanols).length) / (F.length || 1)).toFixed(2),
  // The envelope-critical triple: a height signal AND occupation AND FAR.
  withHeightSignal: F.filter((f) => ['NP', 'HR', 'HT'].some((c) => f.params[c]?.status === 'PRESENT_NUMERIC')).length,
  withOccupation: F.filter((f) => f.params.O?.status === 'PRESENT_NUMERIC').length,
  withFar: F.filter((f) => f.params.E?.status === 'PRESENT_NUMERIC').length,
  withHeightAndOccAndFar: F.filter(
    (f) => ['NP', 'HR', 'HT'].some((c) => f.params[c]?.status === 'PRESENT_NUMERIC') &&
      f.params.O?.status === 'PRESENT_NUMERIC' && f.params.E?.status === 'PRESENT_NUMERIC',
  ).length,
  errors: result.errors.length,
};

fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, 'p-fitxa-sample.json'), JSON.stringify(result, null, 2));
console.error('\n=== P SUMMARY ===');
console.error(JSON.stringify(result.summary, null, 2));
