// STEP 6 — CENSUS ANALYSIS. Parses the two census pulls into a tidy table and reports the raw
// shape of the vocabulary before any grammar classification is applied.
import fs from 'node:fs';
import path from 'node:path';
import { DIR, save } from './lib.mjs';

/** Streaming-ish parse: split on featureMember and pluck ms:* leaf values. */
function parse(file, fields) {
    const body = fs.readFileSync(path.join(DIR, file), 'utf8');
    const rows = [];
    const chunks = body.split('<gml:featureMember>');
    for (let i = 1; i < chunks.length; i++) {
        const c = chunks[i];
        const rec = {};
        for (const f of fields) {
            const m = c.match(new RegExp(`<ms:${f}>([^<]*)</ms:${f}>`));
            // PRESENT-but-empty vs ABSENT are different facts; keep them distinct.
            rec[f] = m ? m[1] : c.includes(`<ms:${f}/>`) || c.includes(`<ms:${f} `) ? '' : null;
        }
        rows.push(rec);
    }
    return rows;
}

const A = parse('_census_A.xml', ['cod_ine_mun', 'zon_suelo', 'clas_suelo', 'descripcio']);
console.error(`census A rows: ${A.length}`);

const munis = new Set(A.map((r) => r.cod_ine_mun));
console.error(`distinct municipalities: ${munis.size}`);

// ── zon_suelo vocabulary, polygon-weighted ───────────────────────────────────
const byCode = new Map();
for (const r of A) {
    const k = r.zon_suelo === null ? '__ABSENT__' : r.zon_suelo === '' ? '__EMPTY__' : r.zon_suelo;
    let e = byCode.get(k);
    if (!e) byCode.set(k, (e = { code: k, n: 0, munis: new Set(), descr: new Map(), clas: new Set() }));
    e.n++;
    e.munis.add(r.cod_ine_mun);
    e.clas.add(r.clas_suelo);
    e.descr.set(r.descripcio, (e.descr.get(r.descripcio) || 0) + 1);
}

const codes = [...byCode.values()]
    .map((e) => ({
        code: e.code,
        n: e.n,
        pct: +((100 * e.n) / A.length).toFixed(3),
        muniCount: e.munis.size,
        clasSuelo: [...e.clas].slice(0, 5),
        topDescr: [...e.descr.entries()].sort((a, b) => b[1] - a[1])[0]?.[0]?.slice(0, 110),
        descrVariants: e.descr.size,
    }))
    .sort((a, b) => b.n - a.n);

console.error(`\ndistinct zon_suelo codes: ${codes.length}`);
console.error(`\nTOP 40 BY POLYGON COUNT:`);
for (const c of codes.slice(0, 40)) {
    console.error(
        `${String(c.n).padStart(7)} ${String(c.pct).padStart(6)}%  munis=${String(c.muniCount).padStart(3)}  ${c.code.padEnd(14)} dv=${String(c.descrVariants).padStart(3)}  ${c.topDescr || ''}`
    );
}

// ── clas_suelo vocabulary ────────────────────────────────────────────────────
const byClas = new Map();
for (const r of A) {
    const k = r.clas_suelo === null ? '__ABSENT__' : r.clas_suelo === '' ? '__EMPTY__' : r.clas_suelo;
    byClas.set(k, (byClas.get(k) || 0) + 1);
}
console.error(`\nclas_suelo vocabulary (${byClas.size} values):`);
for (const [k, v] of [...byClas.entries()].sort((a, b) => b[1] - a[1]))
    console.error(`  ${String(v).padStart(7)} ${((100 * v) / A.length).toFixed(2)}%  ${k}`);

// ── VOCABULARY SHARING — the real M1 test ────────────────────────────────────
// A shared SCHEMA is trivial here (MapServer declares one feature type). The question that
// actually decides "one ontology or 542" is whether the VALUES are shared across municipalities.
const perMuni = new Map();
for (const r of A) {
    let s = perMuni.get(r.cod_ine_mun);
    if (!s) perMuni.set(r.cod_ine_mun, (s = new Set()));
    s.add(r.zon_suelo);
}
const shared = codes.filter((c) => c.muniCount > 1).length;
const singleton = codes.filter((c) => c.muniCount === 1);
const singletonPolys = singleton.reduce((a, c) => a + c.n, 0);

console.error(`\n── VOCABULARY SHARING ──`);
console.error(`codes used by >1 municipality : ${shared}/${codes.length}`);
console.error(`codes unique to ONE municipality: ${singleton.length} (${((100 * singletonPolys) / A.length).toFixed(2)}% of polygons)`);
console.error(`median codes per municipality  : ${[...perMuni.values()].map((s) => s.size).sort((a, b) => a - b)[Math.floor(perMuni.size / 2)]}`);

save('_06_codes.json', { total: A.length, municipalities: munis.size, codes, clasSuelo: [...byClas.entries()] });
save('_06_permuni.json', [...perMuni.entries()].map(([k, v]) => ({ ine: k, codes: [...v] })));
