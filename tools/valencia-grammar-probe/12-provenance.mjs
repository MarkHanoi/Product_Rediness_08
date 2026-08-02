// STEP 12 — PROVENANCE: does url_abs route to a PER-MUNICIPALITY instrument, or is it the
// national "UrlLink trap" (99% populated, ~20 distinct values = register home pages)?
//
// This decides whether an ER-3 path to the real ordinance text EXISTS and how it is sized.
// The regional GIS carries no parameters, so the depth/height rules can only come from the
// approved municipal instrument. If url_abs resolves per municipality, the ER-3 cost is a
// DOCUMENT-INGESTION problem of known size. If it is 20 home pages, there is no route.
import fs from 'node:fs';
import path from 'node:path';
import { DIR, save } from './lib.mjs';

const body = fs.readFileSync(path.join(DIR, '_census_B.xml'), 'utf8');
const F = ['cod_ine_mun', 'noms_mun', 'url_abs', 'expediente'];
const rows = [];
for (const c of body.split('<gml:featureMember>').slice(1)) {
    const rec = {};
    for (const f of F) {
        const m = c.match(new RegExp(`<ms:${f}>([^<]*)</ms:${f}>`));
        rec[f] = m ? m[1] : null;
    }
    rows.push(rec);
}
console.error(`rows=${rows.length}`);

for (const f of F) {
    let valued = 0; const d = new Set();
    for (const r of rows) if (r[f] && r[f].trim()) { valued++; d.add(r[f]); }
    console.error(`  ${f.padEnd(12)} valued=${((100 * valued) / rows.length).toFixed(2)}%  distinct=${d.size}`);
}

// THE TRAP TEST: distinct url_abs values vs distinct municipalities.
const urls = new Set(rows.map((r) => r.url_abs).filter((u) => u && u.trim()));
const munis = new Set(rows.map((r) => r.cod_ine_mun));
const pairs = new Set(rows.filter((r) => r.url_abs && r.url_abs.trim()).map((r) => `${r.cod_ine_mun}|${r.url_abs}`));
console.error(`\n── url_abs TRAP TEST ──`);
console.error(`  distinct municipalities : ${munis.size}`);
console.error(`  distinct url_abs values : ${urls.size}`);
console.error(`  distinct (muni,url) pairs: ${pairs.size}`);
console.error(`  urls per municipality    : ${(urls.size / munis.size).toFixed(2)}`);
console.error(`  VERDICT: ${urls.size >= munis.size * 0.9 ? 'PER-MUNICIPALITY — a real document route' : urls.size < 50 ? '⛔ TRAP — register home pages, not documents' : 'PARTIAL'}`);
console.error(`\n  samples:`);
for (const u of [...urls].slice(0, 5)) console.error(`    ${u}`);

// municipalities with NO url at all
const withUrl = new Set(rows.filter((r) => r.url_abs && r.url_abs.trim()).map((r) => r.cod_ine_mun));
const without = [...munis].filter((m) => !withUrl.has(m));
console.error(`\n  municipalities with at least one url_abs: ${withUrl.size}/${munis.size}`);
console.error(`  municipalities with NONE: ${without.length} ${without.slice(0, 10).join(',')}`);

// expediente — the register reference (the other provenance handle)
const exps = new Set(rows.map((r) => r.expediente).filter((e) => e && e.trim() && e !== '00000000'));
console.error(`\n  distinct expediente (excl. 00000000): ${exps.size}`);
const zeroExp = rows.filter((r) => r.expediente === '00000000').length;
console.error(`  expediente == '00000000' (a null wearing a number): ${zeroExp} (${((100 * zeroExp) / rows.length).toFixed(2)}%)`);

save('_12_provenance.json', {
    rows: rows.length, municipalities: munis.size, distinctUrls: urls.size,
    urlsPerMuni: +(urls.size / munis.size).toFixed(2),
    muniWithUrl: withUrl.size, muniWithoutUrl: without,
    distinctExpediente: exps.size, expedienteZeroPct: +((100 * zeroExp) / rows.length).toFixed(2),
    sampleUrls: [...urls].slice(0, 10),
});
