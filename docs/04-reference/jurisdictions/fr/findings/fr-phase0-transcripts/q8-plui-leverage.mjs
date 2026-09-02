import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
const db = new DatabaseSync('doc_urba_com.gpkg', { readOnly: true });
const pop = new Map(JSON.parse(readFileSync('communes-population.json', 'utf8')).map(c => [c.code, c.population || 0]));
const natPop = [...pop.values()].reduce((a, b) => a + b, 0);
// production doc_urba_com rows: commune ↔ document
const rows = db.prepare(`SELECT insee, idurba, partition, gpu_status FROM doc_urba_com`).all();
console.log('doc_urba_com rows:', rows.length, 'status values:', JSON.stringify([...new Set(rows.map(r => r.gpu_status))]));
const kind = id => {
  const u = (id || '').toUpperCase();
  if (u.includes('PLUI')) return 'PLUi';
  if (u.includes('PSMV')) return 'PSMV';
  if (u.includes('PLU')) return 'PLU';
  if (u.includes('POS')) return 'POS';
  if (u.includes('CC')) return 'CC';
  return 'OTHER';
};
// communes per document
const byDoc = new Map();
for (const r of rows) {
  if (!r.idurba || !r.insee) continue;
  if (!byDoc.has(r.idurba)) byDoc.set(r.idurba, new Set());
  byDoc.get(r.idurba).add(r.insee);
}
console.log('distinct documents in doc_urba_com:', byDoc.size);
// PLUi distribution: communes per PLUi
const pluis = [...byDoc.entries()].filter(([id]) => kind(id) === 'PLUi');
const sizes = pluis.map(([, s]) => s.size).sort((a, b) => a - b);
const q = p => sizes[Math.min(sizes.length - 1, Math.floor(sizes.length * p))];
console.log('=== PLUi leverage ===');
console.log('PLUi documents:', pluis.length);
console.log('communes covered by PLUi:', pluis.reduce((s, [, c]) => s + c.size, 0));
console.log('communes/PLUi min:', sizes[0], 'p25:', q(.25), 'p50:', q(.5), 'p75:', q(.75), 'p90:', q(.9), 'max:', sizes[sizes.length - 1]);
const pluiPop = pluis.reduce((s, [, c]) => s + [...c].reduce((x, i) => x + (pop.get(i) || 0), 0), 0);
console.log('population covered by PLUi docs:', pluiPop.toLocaleString(), '=', (100 * pluiPop / natPop).toFixed(1) + '% of national', natPop.toLocaleString());
// per-kind coverage
console.log('=== per-kind: docs, communes, population ===');
const agg = {};
for (const [id, cs] of byDoc) {
  const k = kind(id);
  agg[k] = agg[k] || { docs: 0, communes: new Set(), pop: 0 };
  agg[k].docs++;
  for (const i of cs) { if (!agg[k].communes.has(i)) { agg[k].communes.add(i); agg[k].pop += pop.get(i) || 0; } }
}
for (const [k, v] of Object.entries(agg)) console.log(' ', k.padEnd(6), 'docs=' + String(v.docs).padStart(6), 'communes=' + String(v.communes.size).padStart(6), 'pop=' + v.pop.toLocaleString().padStart(12), '(' + (100 * v.pop / natPop).toFixed(1) + '%)');
// documents needed for 25/50/75% of national population (rank all docs by covered pop)
const docPops = [...byDoc.entries()].map(([id, cs]) => [...cs].reduce((s, i) => s + (pop.get(i) || 0), 0)).sort((a, b) => b - a);
const totalCovered = docPops.reduce((a, b) => a + b, 0);
console.log('=== documents needed for X% of NATIONAL population (' + natPop.toLocaleString() + ') ===');
console.log('population covered by ANY GPU DU document:', totalCovered.toLocaleString(), '=', (100 * totalCovered / natPop).toFixed(1) + '%');
let cum = 0, n = 0;
const targets = [0.25, 0.5, 0.75].map(t => t * natPop);
let ti = 0;
for (const p of docPops) {
  cum += p; n++;
  while (ti < targets.length && cum >= targets[ti]) { console.log('  ' + (25 * (ti + 1)) + '% of national pop: ' + n + ' documents'); ti++; }
}
if (ti < targets.length) console.log('  targets beyond total GPU coverage: ' + (75 - 25 * ti) + '%+ unreachable via GPU docs alone (coverage ceiling ' + (100 * totalCovered / natPop).toFixed(1) + '%)');
// communes NOT in any doc (RNU or missing)
const covered = new Set(rows.filter(r => r.insee && r.idurba).map(r => r.insee));
let unc = 0, uncPop = 0;
for (const [code, p] of pop) if (!covered.has(code)) { unc++; uncPop += p; }
console.log('communes with NO GPU DU doc row:', unc, 'pop:', uncPop.toLocaleString(), '(' + (100 * uncPop / natPop).toFixed(1) + '%)');
