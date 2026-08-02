#!/usr/bin/env node
// PROBE A · stage 2 — VARY CLIENT AND PROTOCOL before recording the AMB-normative negative.
// Guard: "Default curl UA gets 403 from some Spanish hosts where a browser UA gets 200."
const targets = [
  ['browser-UA https', 'https://geoportalplanejament.amb.cat/Informacio/Normativa/08196_INDEX.htm', { 'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' }],
  ['browser-UA + Referer', 'https://geoportalplanejament.amb.cat/Informacio/Normativa/08196_INDEX.htm', { 'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36', referer: 'https://geoportalplanejament.amb.cat/Informacio/Contingut/Normativa/ca/default.html', accept: 'text/html,application/xhtml+xml,*/*' }],
  ['http (not https)', 'http://geoportalplanejament.amb.cat/Informacio/Normativa/08196_INDEX.htm', { 'user-agent': 'Mozilla/5.0 Chrome/120' }],
  ['www3 host', 'https://www3.amb.cat/normativaurbanistica/Normativa/08196_INDEX.htm', { 'user-agent': 'Mozilla/5.0 Chrome/120' }],
  ['amb.cat host', 'https://www.amb.cat/Informacio/Normativa/08196_INDEX.htm', { 'user-agent': 'Mozilla/5.0 Chrome/120' }],
  ['no UA at all', 'https://geoportalplanejament.amb.cat/Informacio/Normativa/08196_INDEX.htm', {}],
  ['wayback', 'https://archive.org/wayback/available?url=geoportalplanejament.amb.cat/Informacio/Normativa/08196_INDEX.htm', { 'user-agent': 'Mozilla/5.0 Chrome/120' }],
];
for (const [label, url, headers] of targets) {
  try {
    const r = await fetch(url, { headers, redirect: 'follow', signal: AbortSignal.timeout(25000) });
    const b = await r.text();
    console.log(`${label.padEnd(24)} ${String(r.status).padEnd(4)} ${String(b.length).padStart(7)}B  ${(r.headers.get('content-type') || '?').slice(0, 24)}`);
    if (label === 'wayback') console.log('    ', b.slice(0, 400));
  } catch (e) { console.log(`${label.padEnd(24)} ERR  ${String(e.message).slice(0, 50)}`); }
}
