#!/usr/bin/env node
// PROBE A · stage 2 — locate the AMB consolidated-normative index for INE 08196.
// ⚠ geoportalplanejament.amb.cat serves a SOFT 404: HTTP 200 + a 1,657-byte JS redirect stub.
//   Status alone is therefore a LIE here. Every hit is classified by BODY, not by status.
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const SOFT404 = (b) => b.includes('window.location.replace') && b.includes('geoportalplanejament.amb.cat/AppGeoportalPlanejament2');
const H = 'https://geoportalplanejament.amb.cat';
const cands = [
  `${H}/Informacio/Normativa/08196_INDEX.htm`,
  `${H}/Informacio/Contingut/Normativa/08196_INDEX.htm`,
  `${H}/AppGeoportalPlanejament2/Normativa/08196_INDEX.htm`,
  `${H}/AppGeoportalPlanejament2/Informacio/Normativa/08196_INDEX.htm`,
  `${H}/Normativa/08196_INDEX.htm`,
  `${H}/AppGeoportalPlanejament/Normativa/08196_INDEX.htm`,
  `${H}/Informacio/Contingut/Normativa/ca/default.html`,
];
for (const url of cands) {
  try {
    const r = await fetch(url, { headers: { 'user-agent': UA }, redirect: 'follow', signal: AbortSignal.timeout(20000) });
    const b = await r.text();
    const cls = SOFT404(b) ? 'SOFT-404' : (r.ok ? 'REAL' : 'HTTP-ERR');
    console.log(`${cls.padEnd(9)} ${String(r.status).padEnd(4)} ${String(b.length).padStart(8)}B  ${url}`);
    if (cls === 'REAL' && b.length > 2000) {
      const hrefs = [...b.matchAll(/href="([^"]+)"/gi)].map((m) => m[1]);
      console.log(`   ${hrefs.length} hrefs; first 25:`);
      for (const h of hrefs.slice(0, 25)) console.log(`     ${h}`);
    }
  } catch (e) { console.log(`ERR       ---           ${String(e.message).slice(0, 30)}  ${url}`); }
}
