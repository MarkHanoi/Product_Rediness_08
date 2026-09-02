import { DatabaseSync } from 'node:sqlite';
const db = new DatabaseSync('zone_urba.gpkg', { readOnly: true });
// Sampling frame: 500 zone rows drawn uniformly at random from the 244,891 zones with
// non-empty urlfic (zone-weighted, not distinct-URL-weighted).
const rows = db.prepare(`SELECT urlfic FROM zone_urba WHERE urlfic IS NOT NULL AND TRIM(urlfic) <> '' ORDER BY RANDOM() LIMIT 500`).all();
db.close();
const urls = rows.map(r => r.urlfic.trim());
const isHttp = u => /^https?:\/\//i.test(u);
const untestable = urls.filter(u => !isHttp(u));
const testable = urls.filter(isHttp);
console.log('sampled=500 testable_http=' + testable.length + ' non_url_untestable=' + untestable.length);
const cache = new Map();
let done = 0;
async function probe(u) {
  if (cache.has(u)) return cache.get(u);
  let status = 'ERR';
  try {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 25000);
    const res = await fetch(u, { headers: { 'User-Agent': 'PRYZM-Research/1.0 (+https://pryzm.app; contact pryzmhello@gmail.com)', 'Range': 'bytes=0-0' }, signal: ctl.signal, redirect: 'follow' });
    clearTimeout(t);
    status = res.status;
    try { await res.body?.cancel(); } catch {}
  } catch (e) { status = 'ERR:' + (e.cause?.code || e.name); }
  cache.set(u, status);
  return status;
}
const results = [];
const queue = [...testable];
await Promise.all(Array.from({length: 12}, async () => {
  while (queue.length) {
    const u = queue.shift();
    const s = await probe(u);
    results.push({ u, s });
    if (++done % 50 === 0) console.log('progress', done + '/' + testable.length);
  }
}));
const counts = {};
for (const r of results) { const k = String(r.s); counts[k] = (counts[k]||0) + 1; }
console.log('STATUS COUNTS:', JSON.stringify(counts));
const ok = results.filter(r => r.s === 200 || r.s === 206).length;
console.log('HTTP-200/206 of testable:', ok, '/', testable.length, '=', (100*ok/testable.length).toFixed(1) + '%');
console.log('HTTP-200/206 of all 500 sampled:', ok, '/ 500 =', (100*ok/500).toFixed(1) + '%');
import { writeFileSync } from 'node:fs';
writeFileSync('urlfic-sample-results.json', JSON.stringify({ untestable, results }, null, 1));
console.log('URLFIC_TEST_DONE');
