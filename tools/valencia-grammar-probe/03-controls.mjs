// STEP 3 — CONTROLS ON THE WORKING TRANSPORT (CQL).
// Re-runs the known-answer controls, establishes hits support, and cross-checks hits against a
// full download to expose truncation. Nothing downstream may be trusted until this passes.
import { cqlSweep, cqlHits, cqlUrl, get, owsException, countMembers, save } from './lib.mjs';

const TN = 'ms:Planeamiento.Zonificacion';
const out = { transport: 'CQL_FILTER', controls: {}, hits: {}, truncation: {}, sample: {} };

const CONTROLS = [
    { tag: 'POSITIVE valencia-46250', cql: "cod_ine_mun='46250'", expect: 'COVERED' },
    { tag: 'POSITIVE alicante-03014', cql: "cod_ine_mun='03014'", expect: 'COVERED' },
    { tag: 'NEGATIVE madrid-28079', cql: "cod_ine_mun='28079'", expect: 'EMPTY' },
    { tag: 'NEGATIVE nonsense-99999', cql: "cod_ine_mun='99999'", expect: 'EMPTY' },
];

let allPass = true;
for (const c of CONTROLS) {
    const r = await cqlSweep({ typename: TN, cql: c.cql, count: 3 });
    const pass = r.st === c.expect;
    allPass &&= pass;
    out.controls[c.tag] = { cql: c.cql, expect: c.expect, got: r.st, n: r.n, pass, cells: r.cells };
    console.error(`${pass ? 'PASS' : '**FAIL**'} ${c.tag.padEnd(26)} expect=${c.expect} got=${r.st} n=${r.n}`);
    if (pass && c.expect === 'COVERED' && r.feats?.length && !out.sample.feature) out.sample.feature = r.feats[0];
}
out.controlsPass = allPass;

// hits support + agreement with a full download (anti-truncation)
for (const ine of ['46250', '03130']) {
    const h = await cqlHits(TN, `cod_ine_mun='${ine}'`);
    out.hits[ine] = h;
    console.error(`hits ${ine}: ${JSON.stringify(h)}`);

    const r = await get(cqlUrl({ typename: TN, cql: `cod_ine_mun='${ine}'`, count: null }), 300000);
    const exc = owsException(r.body);
    if (!r.ok || exc) {
        out.truncation[ine] = { st: 'UNKNOWN', why: (exc || `HTTP ${r.http ?? r.err}`).slice(0, 140) };
    } else {
        const n = countMembers(r.body);
        out.truncation[ine] = {
            downloaded: n,
            hits: h.n ?? null,
            agree: h.n != null ? n === h.n : null,
            roundSuspect: [1000, 2000, 3000, 5000, 10000].includes(n),
        };
    }
    console.error(`trunc ${ine}: ${JSON.stringify(out.truncation[ine])}`);
}

save('_03_controls.json', out);
console.error(`\nCONTROLS ${allPass ? 'PASS — downstream counts may be trusted' : 'FAIL — STOP'}`);
