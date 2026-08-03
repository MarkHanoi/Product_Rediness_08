// 04-capture-ambitos — the ROUTING half of the fixture set.
//
// ⚠⚠ WITHOUT THIS, THE ROUTING GUARD RUNS BLIND. `RoutingFacts.instrumentKeyMatches` and
// `.instrumentFigure` are supplied by the caller from the ámbito layers, and a report run with
// `instrumentKeyMatches: 0` is measuring the guard's NO-JOIN behaviour — a worst case, not the
// guard. The ORDENANZA capture alone cannot exercise the two refusals the brief calls the point of
// the adapter (`instrument-key-ambiguous`, `instrument-class-unpublished`).
//
// BOTH ÁMBITO LAYERS ARE CAPTURED, AND THAT IS NOT BELT-AND-BRACES. Measured (`06-r-layer.log` §6e):
//   • `VPLA_V_AMBITO` 5,937 rows · `VPLA_V_AMBITO_MODIF` 3,724
//   • **54.83 % of MODIF keys are ABSENT from AMBITO** ⇒ MODIF is a substantially DIFFERENT
//     population, not a revision of the same one. Joining against either alone would miss
//     instruments the other holds, and "not found" would silently read as "no instrument".
//   • uniqueness differs sharply too: 8.81 % of AMBITO `(muni, name)` keys are non-unique
//     against **30.66 %** of MODIF's.
//
//   node tools/madrid-envelope-engine/probe/04-capture-ambitos.mjs

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURES = join(HERE, '..', 'fixtures');
const WFS = 'https://idem.comunidad.madrid/geoserver3/wfs';

const FIELDS = [
    'CDID', 'CD_MUNICIPIO', 'DS_MUNICIPIO', 'DS_NOMB_AMB', 'DS_CLAS_SUE',
    'DS_FIG_DES', 'DS_SIST_ACT', 'DS_ORD_ASOC',
    'NM_C_ED', 'NM_S_MAX_ED', 'NM_S_TOT', 'DS_LEY', 'DS_DOCU', 'FC_AC', 'FC_BOCM',
];

const TYPES = ['sitcm:VPLA_V_AMBITO', 'sitcm:VPLA_V_AMBITO_MODIF'];
const CDS = ['022', '090', '160', '080', '079'];

const url = (p) => `${WFS}?${new URLSearchParams(p)}`;

async function hits(typeName, cql) {
    const res = await fetch(url({
        service: 'WFS', version: '2.0.0', request: 'GetFeature',
        typeNames: typeName, resultType: 'hits', CQL_FILTER: cql,
    }));
    const body = await res.text();
    if (/ExceptionReport|ServiceException/i.test(body)) return null;
    const m = body.match(/numberMatched="(\d+)"/);
    return m ? Number(m[1]) : null;
}

async function page(typeName, cql, startIndex) {
    const res = await fetch(url({
        service: 'WFS', version: '2.0.0', request: 'GetFeature', typeNames: typeName,
        outputFormat: 'application/json', count: '1000', startIndex: String(startIndex),
        propertyName: FIELDS.join(','), sortBy: 'CDID', CQL_FILTER: cql,
    }));
    const body = await res.text();
    if (/ExceptionReport|ServiceException/i.test(body)) return null;
    // ⚠ THE SERVICE IGNORES `propertyName` ON THIS LAYER and returns all 92 columns (1.8 KB/row,
    // 4.9 MB across five municipalities). Projecting client-side keeps the committed fixture to
    // the columns the join actually reads — and `provenance.fields` on every record is what
    // documents that choice, so nothing is dropped silently.
    return JSON.parse(body).features.map((f) => {
        const p = f.properties;
        const out = {};
        for (const k of FIELDS) if (k in p) out[k] = p[k];
        return out;
    });
}

async function main() {
    mkdirSync(FIXTURES, { recursive: true });
    const out = {};

    for (const typeName of TYPES) {
        const short = typeName.split(':')[1];
        out[short] = {};
        for (const cd of CDS) {
            const cql = `CD_MUNICIPIO='${cd}'`;
            const n = await hits(typeName, cql);
            if (n === null) { console.error(`⛔ ${short} ${cd}: hits failed — UNKNOWN, not empty.`); continue; }
            const rows = [];
            const seen = new Set();
            for (let s = 0; s < n; s += 1000) {
                const r = await page(typeName, cql, s);
                if (r === null) { console.error(`  ${short} ${cd} page ${s} failed`); break; }
                if (r.length === 0) break;
                for (const row of r) { if (!seen.has(row.CDID)) { seen.add(row.CDID); rows.push(row); } }
            }
            // ⚠ A genuine 0 is recorded as 0. 47 municipalities sit at exactly 0 % override, so an
            // empty ámbito set is a REAL answer here and must not be confused with a failed fetch —
            // which is why a failed `hits` above `continue`s instead of writing an empty array.
            out[short][cd] = { numberMatched: n, rowsCaptured: rows.length, complete: rows.length === n, rows };
            console.log(`${short.padEnd(24)} cd=${cd}  matched ${n}  captured ${rows.length}`);
        }
    }

    writeFileSync(join(FIXTURES, 'ambitos.json'), JSON.stringify({
        capturedAt: new Date().toISOString().slice(0, 10),
        endpoint: WFS, typeNames: TYPES, fields: FIELDS, layers: out,
    }, null, 1));
}

main();
