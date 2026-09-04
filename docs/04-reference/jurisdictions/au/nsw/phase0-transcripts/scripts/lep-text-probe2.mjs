// §LEP-TEXT-PROBE-2 (round 3) — clause HEADINGS. Probe 1 proved the text is readable and matched
// the map names, but its 300-char window fell short of the clause heading for Sydney / Randwick /
// Ryde. This pass finds the nearest preceding "N.N[A] Title" heading and adds the instruments the
// registry still needs. ONE request per instrument, 1.5 s apart; stop at the first non-200.
import fs from 'node:fs'; import path from 'node:path'; import https from 'node:https'; import { fileURLToPath } from 'node:url';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(HERE, '../lep-text-probe2.json');
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36';
const get = (u) => new Promise((r) => { const q = https.get(u, { timeout: 90000, headers: { 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8', 'Accept-Language': 'en-AU,en;q=0.9' } }, (x) => { let b = ''; x.setEncoding('utf8'); x.on('data', (c) => { if (b.length < 20000000) b += c; }); x.on('end', () => r({ s: x.statusCode, body: b })); }); q.on('timeout', () => q.destroy(new Error('t'))); q.on('error', (e) => r({ s: 0, err: String(e), body: '' })); });
const strip = (html) => html.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;|&#160;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#8212;|&mdash;/g, '—').replace(/\s+/g, ' ');
const HEAD = /\b(\d{1,2}\.\d{1,2}[A-Z]{0,2})\s+([A-Z][^.]{3,90}?)\s+(?:\(cf|\(1\)|The objectives?|This clause|Development consent|A building|In this|Despite)/g;
function headingBefore(text, idx) { let best = null; HEAD.lastIndex = 0; let m; while ((m = HEAD.exec(text)) && m.index < idx) best = { num: m[1], title: m[2].trim(), at: m.index }; return best; }
const TARGETS = [
  { id: 'epi-2012-0628', label: 'Sydney LEP 2012', needles: ['Alternative Height of Buildings Map', 'Sun Access Protection Map', '6.17 Sun access planes', '6.18 Overshadowing'] },
  { id: 'epi-2013-0036', label: 'Randwick LEP 2012', needles: ['Alternative Building Heights Map'] },
  { id: 'epi-2014-0608', label: 'Ryde LEP 2014', needles: ['Macquarie Park Incentive Height of Buildings Map'] },
  { id: 'epi-2014-0297', label: 'Byron LEP 2014', needles: ['Building Height Allowance Map', 'Minimum Level'] },
  { id: 'epi-2013-0524', label: 'Singleton LEP 2013', needles: ['Floor Height Restriction Map'] },
  { id: 'epi-2010-0076', label: 'Wollongong LEP 2009', needles: ['Sun Plane Protection Map', 'Overshadowing Map'] },
  { id: 'epi-2012-0550', label: 'Burwood LEP 2012', needles: ['Building Height Plane Map', 'building height plane'] },
  { id: 'epi-2021-0725', label: 'SEPP (Precincts—Central River City) 2021', needles: ['Height of Buildings Map', 'Reduced Level Map', 'prevails', 'does not apply'] },
  { id: 'epi-2021-0726', label: 'SEPP (Precincts—Eastern Harbour City) 2021', needles: ['Height of Buildings Map', 'prevails', 'does not apply'] },
  { id: 'epi-2021-0728', label: 'SEPP (Precincts—Western Parkland City) 2021', needles: ['Height of Buildings Map', 'Incentive Height of Buildings Map', 'Obstacle Limitation Surface', 'prevails'] },
  { id: 'epi-2021-0727', label: 'SEPP (Precincts—Regional) 2021', needles: ['Height of Buildings Map', 'prevails'] },
];
const out = { probedAt: new Date().toISOString().slice(0, 10), results: [] };
for (const t of TARGETS) {
  const url = `https://legislation.nsw.gov.au/view/whole/html/inforce/current/${t.id}`;
  const r = await get(url);
  const text = r.s === 200 ? strip(r.body) : '';
  const hits = {};
  for (const n of t.needles) {
    const found = []; let from = 0, k = 0;
    while (k < 4) { const idx = text.indexOf(n, from); if (idx < 0) break; found.push({ heading: headingBefore(text, idx), context: text.slice(Math.max(0, idx - 200), idx + 500) }); from = idx + n.length; k++; }
    hits[n] = found;
  }
  out.results.push({ ...t, url, status: r.s, bytes: r.body?.length ?? 0, hits, err: r.err ?? null });
  console.log(`\n=== ${t.label} (${t.id}) → ${r.s} (${r.body?.length ?? 0} bytes)${r.err ? ' ' + r.err : ''}`);
  for (const [n, arr] of Object.entries(hits)) { console.log(`  [${n}] ${arr.length} hit(s)`); for (const h of arr) console.log(`     heading: ${h.heading ? h.heading.num + ' ' + h.heading.title : '?'}\n     ...${h.context.slice(0, 560)}`); }
  if (r.s !== 200) { console.log('  → stopping at first non-200; not a crawler.'); break; }
  await new Promise((res) => setTimeout(res, 1500));
}
fs.writeFileSync(OUT, JSON.stringify(out, null, 1));
console.log('\nwrote', OUT);
