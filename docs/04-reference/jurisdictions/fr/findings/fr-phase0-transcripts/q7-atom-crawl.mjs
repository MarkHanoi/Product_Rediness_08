import { writeFileSync } from 'node:fs';
const UA = 'PRYZM-Research/1.0 (+https://pryzm.app; contact pryzmhello@gmail.com)';
const base = 'https://www.geoportail-urbanisme.gouv.fr/atom/download-feed?f[pagination][page]=';
async function page(i, attempt = 0) {
  try {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 45000);
    const res = await fetch(base + i, { headers: { 'User-Agent': UA }, signal: ctl.signal });
    clearTimeout(t);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const xml = await res.text();
    const entries = [];
    const re = /<entry>([\s\S]*?)<\/entry>/g;
    let m;
    while ((m = re.exec(xml))) {
      const e = m[1];
      const title = (e.match(/<title>([\s\S]*?)<\/title>/) || [])[1]?.trim() ?? '';
      const summary = (e.match(/<summary>([\s\S]*?)<\/summary>/) || [])[1]?.trim() ?? '';
      entries.push({ title, summary });
    }
    return entries;
  } catch (err) {
    if (attempt < 3) { await new Promise(r => setTimeout(r, 2000 * (attempt + 1))); return page(i, attempt + 1); }
    return { failed: true, err: String(err) };
  }
}
// binary search last non-empty page
let lo = 0, hi = 1;
while (true) { const e = await page(hi); if (Array.isArray(e) && e.length > 0) { lo = hi; hi *= 2; } else break; if (hi > 65536) break; }
while (hi - lo > 1) { const mid = (lo + hi) >> 1; const e = await page(mid); if (Array.isArray(e) && e.length > 0) lo = mid; else hi = mid; }
const last = lo;
console.log('last non-empty page:', last, '(pages 0..' + last + ', 20/page)');
const all = [];
let failedPages = 0;
const ids = Array.from({ length: last + 1 }, (_, i) => i);
let done = 0;
await Promise.all(Array.from({ length: 6 }, async () => {
  while (ids.length) {
    const i = ids.shift();
    const e = await page(i);
    if (Array.isArray(e)) all.push(...e); else failedPages++;
    if (++done % 100 === 0) console.log('pages done', done);
  }
}));
console.log('entries:', all.length, 'failedPages:', failedPages);
// classify: document id from summary `document "XXXX"`
const fam = {};
for (const e of all) {
  const id = (e.summary.match(/"([^"]+)"/) || [])[1] ?? '';
  const mm = id.match(/^[0-9A-Za-z]+_([A-Za-z0-9]+)_/);
  let kind = mm ? mm[1].toUpperCase() : 'UNPARSED';
  // SUP ids look like <gestionnaire>_AC1_... or title contains 'SUP'
  const family = ['CC','PLU','PLUI','POS','PSMV'].includes(kind) ? 'DU'
    : ['SCOT','SD'].includes(kind) ? 'SCOT'
    : /SUP|servitude/i.test(e.title) || /^[A-Z]{1,3}[0-9]/.test(kind) ? 'SUP' : 'OTHER';
  const key = family + ':' + kind;
  fam[key] = (fam[key] || 0) + 1;
}
console.log(JSON.stringify(fam, null, 1));
writeFileSync('atom-inventory.json', JSON.stringify({ last, total: all.length, failedPages, fam, sample: all.slice(0, 5) }, null, 1));
console.log('ATOM_CRAWL_DONE');
