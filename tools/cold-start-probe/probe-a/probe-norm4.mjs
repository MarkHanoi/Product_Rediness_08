#!/usr/bin/env node
// PROBE A · stage 2 — is the AMB normative index 404 SPECIFIC to 08196, or programme-wide?
// (R5: an error is not an outcome. Distinguish "this city has no normative index" from
//  "AMB's published link table is stale for everyone".)
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const B = 'https://geoportalplanejament.amb.cat/Informacio';
const probe = async (url) => {
  try {
    const r = await fetch(url, { headers: { 'user-agent': UA }, redirect: 'follow', signal: AbortSignal.timeout(15000) });
    const b = await r.text(); return { s: r.status, n: b.length, body: b };
  } catch (e) { return { s: 'ERR', n: 0, body: '', msg: String(e.message).slice(0, 40) }; }
};
console.log('— per-municipality index, same path shape —');
for (const ine of ['08015', '08904', '08196', '08101', '08073', '08125']) {
  const r = await probe(`${B}/Normativa/${ine}_INDEX.htm`);
  console.log(`  ${ine}  ${r.s}/${r.n}B`);
}
console.log('— filename variants for 08196 —');
for (const v of ['08196_INDEX.HTM', '08196_index.htm', '08196_INDEX.html', '08196_Index.htm', '08196.htm', '08196_INDEX.pdf']) {
  const r = await probe(`${B}/Normativa/${v}`);
  console.log(`  ${v.padEnd(20)} ${r.s}/${r.n}B`);
}
console.log('— directory listing / sibling discovery —');
for (const v of ['', 'index.htm', 'default.html']) {
  const r = await probe(`${B}/Normativa/${v}`);
  console.log(`  "${v}"  ${r.s}/${r.n}B`);
}
