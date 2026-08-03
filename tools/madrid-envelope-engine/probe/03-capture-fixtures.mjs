// 03-capture-fixtures — the LIVE rows the adapter is proved against, captured once and committed.
//
// ⚠ THE TESTS MUST NEVER HIT THE NETWORK. A suite that fetches is a suite that goes red when a
// municipal server has a bad afternoon, and a green suite then means "the server was up", not
// "the adapter is correct". So the rows are captured here, written to `fixtures/`, committed, and
// the adapter is exercised offline against them (the `tools/murcia-parcel-probe` convention).
//
// ⭐ THE MUNICIPALITY KEY IS 3-DIGIT AND THAT IS THE WHOLE TRAP. `CD_MUNICIPIO` is INE-5 with the
// `28` prefix STRIPPED: `'079'` returns 22,181 rows and `'28079'` returns **ZERO ON A CLEAN HTTP
// 200**. An empty page and a wrong key are indistinguishable at the transport layer, so this
// script asserts a NON-ZERO count per municipality and refuses to write a fixture otherwise.
//
// WHO IS CAPTURED, AND WHY EACH ONE
//   022 BOADILLA DEL MONTE — the PROVING municipality. ALTURA 79.42 % (= the regional MEDIAN,
//       so it is representative rather than cherry-picked) and override 9.0 %, and it is the
//       LARGEST of the low-override set (n=1,958) so the sample is not a hamlet.
//   090 MORALZARZAL   — 95.24 % / 1.2 %. The near-best case; proves the adapter does not need
//       Boadilla's particular shape.
//   160 VALDEMORILLO  — 98.34 % / 2.3 %. Second control.
//   080 MAJADAHONDA   — ⛔ THE ADVERSARIAL FIXTURE. Carries the corpus's worst internal
//       contradiction: "VIVIENDA UNIFAMILIAR AISLADA" with `NM_ALTURA=85` and `NM_PLANTAS=2`
//       = 42.5 m per storey. The adapter must REFUSE these, and a test that cannot see a real
//       contradictory row cannot prove that it does.
//   079 MADRID        — the capital, captured so its 8.86 % altura is a fixture fact rather than
//       a quoted statistic.
//
//   node tools/madrid-envelope-engine/probe/03-capture-fixtures.mjs

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURES = join(HERE, '..', 'fixtures');
const WFS = 'https://idem.comunidad.madrid/geoserver3/wfs';
const TYPE = 'sitcm:VPLA_V_ORDENANZA';

/** Every field the adapter reads, plus the provenance fields a citation needs. */
const FIELDS = [
    'CDID', 'CD_MUNICIPIO', 'DS_MUNICIPIO', 'DS_NOMB_ORD', 'DS_NOM_AMB',
    'NM_ALTURA', 'NM_N_PLTA', 'NM_OCP_MX', 'NM_FDO_MX_ED',
    'NM_RTR_FRNT', 'NM_RTR_LATL', 'NM_RTR_POST',
    'NM_C_ED_ORD', 'NM_FRTE_MIN', 'NM_S_MX_ED_O', 'NM_C_ED_MAZ', 'NM_OCP_PB',
    'DS_LEY', 'DS_DOCU', 'DS_PLANEAM_GRAL', 'FC_BOCM', 'DS_CLAS_SUE',
];

const TARGETS = [
    { cd: '022', name: 'BOADILLA DEL MONTE', role: 'proving' },
    { cd: '090', name: 'MORALZARZAL', role: 'control' },
    { cd: '160', name: 'VALDEMORILLO', role: 'control' },
    { cd: '080', name: 'MAJADAHONDA', role: 'adversarial-contradiction' },
    { cd: '079', name: 'MADRID', role: 'capital' },
];

const url = (p) => `${WFS}?${new URLSearchParams(p)}`;

async function hits(cql) {
    const res = await fetch(url({
        service: 'WFS', version: '2.0.0', request: 'GetFeature',
        typeNames: TYPE, resultType: 'hits', CQL_FILTER: cql,
    }));
    const body = await res.text();
    // ⚠ HTTP 200 IS NOT SUCCESS on an OGC service — a 200 can carry an ExceptionReport.
    if (/ExceptionReport|ServiceException/i.test(body)) return { count: null, error: body.slice(0, 300) };
    const m = body.match(/numberMatched="(\d+)"/);
    return { count: m ? Number(m[1]) : null, error: m ? null : 'no numberMatched' };
}

async function page(cql, startIndex, count) {
    const res = await fetch(url({
        service: 'WFS', version: '2.0.0', request: 'GetFeature', typeNames: TYPE,
        outputFormat: 'application/json', count: String(count), startIndex: String(startIndex),
        propertyName: FIELDS.join(','),
        // ⛔ THE FILTER MUST BE ON THE PAGED REQUEST TOO. A first cut of this script sent
        // `CQL_FILTER` only on the `resultType=hits` call, so the counts were per-municipality and
        // the ROWS were the head of the whole 93,839-row layer — and the only visible symptom was
        // `captured 2000 > matched 1958`. Reconciliation caught it; nothing else would have.
        CQL_FILTER: cql,
        // ⚠ PAGING REQUIRES `sortBy`. Without it the service answers
        // "Cannot do natural order without a primary key … or specify a manual sort over existing
        // attributes" — an error six research passes misread as "paging unsupported".
        sortBy: 'CDID',
    }));
    const body = await res.text();
    if (/ExceptionReport|ServiceException/i.test(body)) return { rows: null, error: body.slice(0, 300) };
    return { rows: JSON.parse(body).features.map((f) => f.properties), error: null };
}

async function main() {
    mkdirSync(FIXTURES, { recursive: true });
    const manifest = [];

    for (const t of TARGETS) {
        const cql = `CD_MUNICIPIO='${t.cd}'`;
        const { count, error } = await hits(cql);
        if (error || count === null) {
            console.error(`⛔ ${t.name}: hits failed — ${error}. NOT WRITING A FIXTURE (unknown ≠ empty).`);
            continue;
        }
        // ⛔ THE 3-DIGIT-KEY GUARD. Zero on a clean 200 is what a WRONG KEY looks like.
        if (count === 0) {
            console.error(`⛔ ${t.name} (cd='${t.cd}'): count 0 on a clean response — that is the`
                + ' signature of a wrong key, not of an empty municipality. NOT WRITING.');
            continue;
        }

        const cap = t.role === 'capital' ? 2000 : 5000;
        const rows = [];
        const seen = new Set();
        let dupes = 0;
        for (let s = 0; s < Math.min(count, cap); s += 1000) {
            const r = await page(cql, s, 1000);
            if (r.error) { console.error(`  page ${s} failed: ${r.error}`); break; }
            if (r.rows.length === 0) break;
            // ⚠ De-duplicate on the service's OWN primary key. A page walk that silently repeats
            // rows inflates every downstream rate, and `sortBy=CDID` is what makes the walk
            // disjoint — this counts the times it was not.
            for (const row of r.rows) {
                if (seen.has(row.CDID)) { dupes += 1; continue; }
                seen.add(row.CDID);
                rows.push(row);
            }
        }
        if (dupes > 0) console.error(`  ⚠ ${t.name}: ${dupes} duplicate CDID across pages`);
        // ⛔ A capture larger than the service's own count is IMPOSSIBLE and means the filter did
        // not reach the paged request. Hard-fail rather than commit a mislabelled fixture.
        if (rows.length > count) {
            console.error(`⛔ ${t.name}: captured ${rows.length} > matched ${count} — the filter did`
                + ' not apply to the page walk. NOT WRITING.');
            continue;
        }

        const file = join(FIXTURES, `ordenanza-${t.cd}.json`);
        writeFileSync(file, JSON.stringify({
            capturedAt: new Date().toISOString().slice(0, 10),
            endpoint: WFS,
            typeName: TYPE,
            cqlFilter: cql,
            /** ⚠ The service's OWN count, so a truncated capture is detectable, not silent. */
            numberMatched: count,
            rowsCaptured: rows.length,
            complete: rows.length === count,
            municipality: { cd: t.cd, name: t.name, role: t.role },
            rows,
        }, null, 1));

        manifest.push({ cd: t.cd, name: t.name, role: t.role, numberMatched: count, rowsCaptured: rows.length });
        console.log(`${t.name.padEnd(22)} cd=${t.cd}  matched ${count}  captured ${rows.length}`);
    }

    writeFileSync(join(FIXTURES, 'manifest.json'), JSON.stringify({
        capturedAt: new Date().toISOString().slice(0, 10),
        endpoint: WFS, typeName: TYPE, fields: FIELDS, municipalities: manifest,
    }, null, 2));
}

main();
