/**
 * P-DICT - DERIVE THE MUIB PARAMETER DICTIONARY FROM THE DATA.
 *
 * ⛔ UNKNOWN NEVER NO. p-fitxa-sample.mjs found RL/RP (side/rear setback) ABSENT
 * on 80/80 fitxes. That is only evidence of absence if those are the codes MUIB
 * actually uses. This enumerates EVERY "CODE: Label -->" row across a seeded
 * sample instead of assuming a code list, so "not published" can be
 * distinguished from "published under a name I did not look for".
 *
 * Also answers the ontology claim: MUIB advertises "a wide parameter database
 * with a SINGLE DICTIONARY OF URBAN CONCEPTS". Q1 showed ZERO ArcGIS coded-value
 * domains on any layer - so if the dictionary is real, it lives HERE, in the
 * fitxa, not in the service metadata.
 *
 * Run:  node tools/balears-muib-probe/p-dictionary-scan.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { queryRows, rng, sleep } from './lib.mjs';

const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), 'out');
const SEED = 20260802;
const N_PER_ISLAND = { Mallorca: 30, Menorca: 12, Eivissa: 12, Formentera: 6 };

const census = JSON.parse(fs.readFileSync(path.join(OUT, 'q3-municipal-census.json'), 'utf8'));
const byIsland = {};
for (const m of Object.values(census.municipalities)) (byIsland[m.island] ||= []).push(m);

const toText = (h) =>
  h.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();

const rand = rng(SEED);
const codeTally = new Map();   // CODE -> {label, seen, numeric, empty}
const sectionTally = new Map();
const result = { probe: 'p-dictionary-scan', runAt: new Date().toISOString(), seed: SEED, read: 0, errors: [] };

for (const [island, target] of Object.entries(N_PER_ISLAND)) {
  const pool = [];
  for (const mu of byIsland[island] || []) {
    try {
      const r = await queryRows(
        10,
        `CODIMUNI = '${mu.codiMuni}' AND CODICLAS IN ('SU','SB') AND URL IS NOT NULL AND URL <> ''`,
        ['URL', 'CODIAJ', 'MUNICIPI'],
        { returnDistinctValues: 'true', resultRecordCount: '2000' },
      );
      for (const row of r.rows) pool.push(row);
    } catch (e) { result.errors.push({ island, muni: mu.municipi, error: String(e.message) }); }
    await sleep(50);
  }
  const seen = new Set(); const picked = []; let g = 0;
  while (picked.length < Math.min(target, pool.length) && g++ < 5000) {
    const c = pool[Math.floor(rand() * pool.length)];
    if (!c || seen.has(c.URL)) continue;
    seen.add(c.URL); picked.push(c);
  }
  for (const p of picked) {
    try {
      const res = await fetch(p.URL, { headers: { 'User-Agent': 'PRYZM-balears-muib-probe/1.0' } });
      const t = toText(await res.text());
      result.read++;
      // Section headers, e.g. "PARAMETRE DE PARCEL·LA", "PARAMETRE D'EDIFICACIO".
      for (const s of t.match(/PAR[ÀA]METRES? [A-ZÀ-Ú'’ ·]+/g) || []) {
        sectionTally.set(s.trim(), (sectionTally.get(s.trim()) || 0) + 1);
      }
      // Parameter rows: "CODE: Label --> VALUE"
      const re = /([A-ZÀ-Ú][A-ZÀ-Ú0-9_]{0,5}):\s*([^-]{2,60}?)\s*-->\s*([\s\S]{0,60}?)(?=\s(?:Sense r[eè]gims|Un r[eè]gim|Dos r[eè]gims|Tres r[eè]gims|[A-ZÀ-Ú][A-ZÀ-Ú0-9_]{0,5}:|PAR[ÀA]METRE|[ÚU]S |ALTRES|Observacions))/g;
      let m;
      while ((m = re.exec(t))) {
        const code = m[1], label = m[2].trim(), val = (m[3] || '').trim();
        const e = codeTally.get(code) || { code, labels: new Set(), seen: 0, numeric: 0, empty: 0 };
        e.labels.add(label.slice(0, 60)); e.seen++;
        if (/^-?\d/.test(val)) e.numeric++; else if (!val) e.empty++;
        codeTally.set(code, e);
      }
    } catch (e) { result.errors.push({ url: p.URL, error: String(e.message) }); }
    await sleep(120);
  }
  console.error(`${island}: read ${picked.length}`);
}

result.dictionary = [...codeTally.values()]
  .map((e) => ({ code: e.code, seen: e.seen, numericValues: e.numeric, emptyValues: e.empty, labels: [...e.labels].slice(0, 4) }))
  .sort((a, b) => b.seen - a.seen);
result.sections = [...sectionTally.entries()].sort((a, b) => b[1] - a[1]).map(([s, n]) => ({ section: s, seen: n }));
result.setbackLike = result.dictionary.filter((d) => d.labels.some((l) => /retranqueig|separaci|dist[àa]ncia/i.test(l)));
result.heightLike = result.dictionary.filter((d) => d.labels.some((l) => /al[çc]ada|plantes|altura/i.test(l)));

fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, 'p-dictionary-scan.json'), JSON.stringify(result, null, 2));
console.error(`\nfitxes read: ${result.read}, distinct parameter codes: ${result.dictionary.length}, errors: ${result.errors.length}`);
console.error('\n=== SETBACK-LIKE CODES ===');
console.error(JSON.stringify(result.setbackLike, null, 1));
console.error('=== HEIGHT-LIKE CODES ===');
console.error(JSON.stringify(result.heightLike, null, 1));
console.error('=== TOP 25 CODES ===');
for (const d of result.dictionary.slice(0, 25)) console.error(`  ${d.code.padEnd(7)} seen=${String(d.seen).padStart(3)} num=${String(d.numericValues).padStart(3)} empty=${String(d.emptyValues).padStart(3)}  ${d.labels[0]}`);
