// §LEP-TEXT-PROBE (round 3) — can the instrument TEXT be read at all, for the clause-registry
// drafts? legislation.nsw.gov.au returned one XML in Phase 0 and 403 (WAF) thereafter. This probe
// makes ONE request per instrument, with a browser UA, and greps for the map names the overlay
// layers use. A 403 is recorded as a 403 — never retried in a loop (do not build a crawler on it).
import fs from 'node:fs';
import path from 'node:path';
import https from 'node:https';
import { fileURLToPath } from 'node:url';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(HERE, '../lep-text-probe.json');
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36';
const get = (u) => new Promise((r) => { const q = https.get(u, { timeout: 60000, headers: { 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8', 'Accept-Language': 'en-AU,en;q=0.9' } }, (x) => { let b = ''; x.setEncoding('utf8'); x.on('data', (c) => { if (b.length < 12000000) b += c; }); x.on('end', () => r({ s: x.statusCode, h: x.headers, body: b })); }); q.on('timeout', () => q.destroy(new Error('t'))); q.on('error', (e) => r({ s: 0, err: String(e), body: '' })); });
const strip = (html) => html.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;|&#160;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\s+/g, ' ');
const TARGETS = [
  { id: 'act-1979-203', label: 'EP&A Act 1979', needles: ['3.28', 'Inconsistency between instruments', 'general presumption'] },
  { id: 'epi-2013-0020', label: 'Ballina LEP 2012 (PCO 2013-20)', needles: ['Building Height Allowance Map', 'Australian Height Datum', 'minimum level'] },
  { id: 'epi-2012-0628', label: 'Sydney LEP 2012 (PCO 2012-628)', needles: ['Alternative Height of Buildings Map', 'Sun Access Protection', '6.17', '6.18'] },
  { id: 'epi-2015-0239', label: 'Blacktown LEP 2015 (PCO 2015-239)', needles: ['Incentive Height of Buildings Map', '7.7A'] },
  { id: 'epi-2023-0117', label: 'Parramatta LEP 2023 (PCO 2023-117)', needles: ['Sun Access Protection Map', '7.7', 'Sun access'] },
  { id: 'epi-2013-0036', label: 'Randwick LEP 2012 (PCO 2013-36)', needles: ['Alternative Building Heights Map', 'Alternative Building Height'] },
  { id: 'epi-2014-0608', label: 'Ryde LEP 2014 (PCO 2014-608)', needles: ['Macquarie Park Corridor Precinct Incentive Height of Buildings Map', 'Incentive Height'] },
];
const out = { probedAt: new Date().toISOString().slice(0, 10), results: [] };
for (const t of TARGETS) {
  const url = `https://legislation.nsw.gov.au/view/whole/html/inforce/current/${t.id}`;
  const r = await get(url);
  const text = r.s === 200 ? strip(r.body) : '';
  const found = {};
  for (const n of t.needles) {
    const idx = text.indexOf(n);
    found[n] = idx >= 0 ? text.slice(Math.max(0, idx - 300), idx + 700) : null;
  }
  // Also lift any clause-heading context around "Map" mentions for the drafts.
  const rec = { ...t, url, status: r.s, bytes: r.body?.length ?? 0, server: r.h?.server ?? null, found, err: r.err ?? null };
  out.results.push(rec);
  console.log(`\n=== ${t.label} → ${r.s} (${rec.bytes} bytes)${r.err ? ' ' + r.err : ''}`);
  for (const [n, ctx] of Object.entries(found)) console.log(`  [${n}] ${ctx ? ctx.slice(0, 900) : 'NOT FOUND'}`);
  if (r.s !== 200) { console.log('  → stopping: the site is refusing; a loop here is a crawler.'); break; }
}
fs.writeFileSync(OUT, JSON.stringify(out, null, 1));
console.log('\nwrote', OUT);
