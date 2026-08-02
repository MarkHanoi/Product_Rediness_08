#!/usr/bin/env node
// PROBE A · stage 2 — resolve the true mount of AMB's per-municipality normative index.
// Cross-check with a co-located asset (Planejament.css) to prove the base path, rather than
// guessing at the document alone (PROBE-DISCIPLINE R2: an independent artefact at the same base).
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const H = 'https://geoportalplanejament.amb.cat';
const SOFT404 = (b) => b.includes('window.location.replace');
const bases = [
  '/Informacio', '/AppGeoportalPlanejament2/Informacio', '/AppGeoportalPlanejament2',
  '/AppGeoportalPlanejament', '', '/Informacio/Contingut', '/Planejament', '/AppGeoportalPlanejament2/Contingut',
];
const probe = async (url) => {
  try {
    const r = await fetch(url, { headers: { 'user-agent': UA }, redirect: 'follow', signal: AbortSignal.timeout(15000) });
    const b = await r.text();
    return { s: r.status, n: b.length, soft: SOFT404(b), body: b };
  } catch (e) { return { s: 'ERR', n: 0, soft: false, msg: String(e.message).slice(0, 40) }; }
};
for (const base of bases) {
  const css = await probe(`${H}${base}/css/Planejament.css`);
  const doc = await probe(`${H}${base}/Normativa/08196_INDEX.htm`);
  console.log(`base="${base}"  css=${css.s}/${css.n}${css.soft ? '(soft404)' : ''}   doc=${doc.s}/${doc.n}${doc.soft ? '(soft404)' : ''}`);
  if (doc.s === 200 && !doc.soft && doc.n > 2000) {
    console.log('  ⭐ REAL DOC. hrefs:');
    for (const m of [...doc.body.matchAll(/href="([^"]+)"/gi)].slice(0, 40)) console.log('    ', m[1]);
  }
}
