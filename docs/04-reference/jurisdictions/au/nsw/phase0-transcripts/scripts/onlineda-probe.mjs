// §ONLINE-DA-PROBE (round 3) — the NSW Planning Portal Online DA data API: is it open, what does a
// record carry (storeys? metres? lot ids? coordinates?), and can it be filtered to one LGA.
// Endpoint published at https://www.planningportal.nsw.gov.au/opendata/dataset/online-da-data-api
import fs from 'node:fs';
import path from 'node:path';
import https from 'node:https';
import { fileURLToPath } from 'node:url';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(HERE, '../onlineda-probe.json');
function req(url, headers) {
  return new Promise((r) => {
    const u = new URL(url);
    const q = https.request({ hostname: u.hostname, path: u.pathname + u.search, method: 'GET', headers, timeout: 60000 }, (x) => {
      let b = '';
      x.setEncoding('utf8');
      x.on('data', (c) => { if (b.length < 6000000) b += c; });
      x.on('end', () => { try { r({ s: x.statusCode, h: x.headers, j: JSON.parse(b) }); } catch { r({ s: x.statusCode, h: x.headers, j: null, raw: b.slice(0, 500) }); } });
    });
    q.on('timeout', () => q.destroy(new Error('t')));
    q.on('error', (e) => r({ s: 0, err: String(e) }));
    q.end();
  });
}
const EP = 'https://api.apps1.nsw.gov.au/eplanning/data/v0/OnlineDA';
const out = { probedAt: new Date().toISOString().slice(0, 10), endpoint: EP, attempts: [] };
const attempts = [
  { label: 'no filter, page 1 size 5', f: null },
  { label: 'City of Sydney determined 2025', f: { filters: { CouncilName: ['CITY OF SYDNEY'], ApplicationStatus: ['Determined'], DeterminationDateFrom: '2025-01-01', DeterminationDateTo: '2025-12-31' } } },
  { label: 'Council of the City of Sydney determined 2025', f: { filters: { CouncilName: ['Council of the City of Sydney'], ApplicationStatus: ['Determined'], DeterminationDateFrom: '2025-01-01', DeterminationDateTo: '2025-12-31' } } },
];
for (const a of attempts) {
  const headers = { PageSize: '5', PageNumber: '1', Accept: 'application/json' };
  if (a.f) headers.filters = JSON.stringify(a.f);
  const r = await req(EP, headers);
  const apps = r.j?.Application || r.j?.applications || r.j?.Applications || (Array.isArray(r.j) ? r.j : null);
  const first = apps?.[0] ?? null;
  const rec = {
    label: a.label, status: r.s, topKeys: r.j ? Object.keys(r.j) : null, count: apps?.length ?? null,
    total: r.j?.TotalPages ?? r.j?.TotalRecords ?? r.j?.totalCount ?? null,
    firstKeys: first ? Object.keys(first) : null, first, raw: r.raw ?? null, err: r.err ?? null,
    rateHeaders: r.h ? Object.fromEntries(Object.entries(r.h).filter(([k]) => /rate|limit|x-/i.test(k))) : null,
  };
  out.attempts.push(rec);
  console.log(`\n=== ${a.label}: status ${r.s} topKeys=${JSON.stringify(rec.topKeys)} count=${rec.count} total=${JSON.stringify(rec.total)}`);
  if (first) { console.log('  first record keys:', JSON.stringify(rec.firstKeys)); console.log('  first record:', JSON.stringify(first).slice(0, 1800)); }
  if (r.raw) console.log('  raw:', r.raw.slice(0, 300));
  if (r.err) console.log('  err:', r.err);
}
fs.writeFileSync(OUT, JSON.stringify(out, null, 1));
console.log('\nwrote', OUT);
