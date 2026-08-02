#!/usr/bin/env node
// PROBE A · stage 2 — hunt the normative document behind NORMATIV='num_poum_sant_andreu_de_la_barca.titol_4.capitol_2'
// §CONTEXT-DATA-HONESTY: a 403/timeout is UNKNOWN, never "absent". Every attempt records status+bytes+ctype.
const UA_BROWSER = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const stem = 'num_poum_sant_andreu_de_la_barca';
const cands = [
  `https://geoportal.amb.cat/geoserveis/normativa/${stem}.htm`,
  `https://geoportal.amb.cat/normativa/${stem}.htm`,
  `https://geoportal.amb.cat/refos/normativa/${stem}.htm`,
  `https://geoportal.amb.cat/geoserveis/refos/${stem}.htm`,
  `https://geoportal.amb.cat/normativaurbanistica/${stem}.htm`,
  `https://www3.amb.cat/normativaurbanistica/${stem}.htm`,
  `https://geoportal.amb.cat/geoserveis/normativa/${stem}.pdf`,
  `https://geoportal.amb.cat/refosplanejament/normativa/${stem}.htm`,
  `https://geoportal.amb.cat/`,
];
for (const url of cands) {
  const t0 = Date.now();
  try {
    const r = await fetch(url, { headers: { 'user-agent': UA_BROWSER }, redirect: 'follow', signal: AbortSignal.timeout(20000) });
    const b = Buffer.from(await r.arrayBuffer());
    console.log(`${String(r.status).padEnd(4)} ${String(b.length).padStart(8)}B ${(r.headers.get('content-type') || '?').slice(0, 30).padEnd(32)} ${Date.now() - t0}ms  ${url}`);
  } catch (e) {
    console.log(`ERR  ${'-'.padStart(8)}  ${String(e.message).slice(0, 40).padEnd(32)} ${Date.now() - t0}ms  ${url}`);
  }
}
