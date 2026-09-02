import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
const db = new DatabaseSync('doc_urba_com.gpkg', { readOnly: true });
const pop = new Map(JSON.parse(readFileSync('communes-population.json', 'utf8')).map(c => [c.code, c.population || 0]));
const natPop = [...pop.values()].reduce((a, b) => a + b, 0);
const rows = db.prepare(`SELECT insee, idurba FROM doc_urba_com WHERE insee IS NOT NULL AND idurba IS NOT NULL`).all();
const kind = id => {
  const u = (id || '').toUpperCase();
  if (u.includes('PLUI')) return 'PLUi';
  if (u.includes('PSMV')) return 'PSMV';
  if (u.includes('PLU')) return 'PLU';
  if (u.includes('POS')) return 'POS';
  if (u.includes('CC')) return 'CC';
  return 'OTHER';
};
console.log('=== OTHER idurba samples ===');
const others = {};
for (const r of rows) if (kind(r.idurba) === 'OTHER') others[r.idurba] = (others[r.idurba] || 0) + 1;
console.log('distinct OTHER idurba:', Object.keys(others).length);
console.log(Object.entries(others).slice(0, 12).map(([k, v]) => k + ' x' + v).join('\n'));
// dedupe commune → one doc, preference PLUi > PLU > CC > POS > OTHER, EXCLUDE PSMV (sector docs)
const pref = { PLUi: 5, PLU: 4, CC: 3, POS: 2, OTHER: 1, PSMV: 0 };
const communeDoc = new Map();
for (const r of rows) {
  const k = kind(r.idurba);
  if (k === 'PSMV') continue;
  const cur = communeDoc.get(r.insee);
  if (!cur || pref[k] > pref[cur.k]) communeDoc.set(r.insee, { id: r.idurba, k });
}
const byDoc = new Map();
for (const [insee, { id }] of communeDoc) {
  if (!byDoc.has(id)) byDoc.set(id, 0);
  byDoc.set(id, byDoc.get(id) + (pop.get(insee) || 0));
}
const docPops = [...byDoc.values()].sort((a, b) => b - a);
const totalCovered = docPops.reduce((a, b) => a + b, 0);
console.log('=== DEDUPED (one doc per commune, PSMV excluded) ===');
console.log('docs:', byDoc.size, 'covered pop:', totalCovered.toLocaleString(), '=', (100 * totalCovered / natPop).toFixed(1) + '% of national');
let cum = 0, n = 0, ti = 0;
const targets = [0.25, 0.5, 0.75].map(t => t * natPop);
for (const p of docPops) {
  cum += p; n++;
  while (ti < targets.length && cum >= targets[ti]) { console.log('  ' + (25 * (ti + 1)) + '% of national pop: ' + n + ' documents (cum ' + cum.toLocaleString() + ')'); ti++; }
}
if (ti < targets.length) console.log('  ' + (25 * (ti + 1)) + '% NOT reachable: ceiling ' + (100 * totalCovered / natPop).toFixed(1) + '%');
// municipality.gpkg is_rnu
const mdb = new DatabaseSync('municipality.gpkg', { readOnly: true });
const mcols = mdb.prepare('PRAGMA table_info(municipality)').all().map(c => c.name);
console.log('=== municipality.gpkg ===', 'cols:', mcols.join(','));
const mt = mdb.prepare('SELECT COUNT(*) c FROM municipality').get().c;
const rnu = mdb.prepare(`SELECT is_rnu, COUNT(*) c FROM municipality GROUP BY 1`).all();
console.log('rows:', mt, 'is_rnu distribution:', JSON.stringify(rnu));
let rnuPop = 0, rnuN = 0;
for (const r of mdb.prepare(`SELECT insee FROM municipality WHERE is_rnu = 1 OR is_rnu = 'true' OR is_rnu = 't'`).all()) { rnuN++; rnuPop += pop.get(r.insee) || 0; }
console.log('RNU communes:', rnuN, 'population:', rnuPop.toLocaleString(), '(' + (100 * rnuPop / natPop).toFixed(2) + '% of national)');
