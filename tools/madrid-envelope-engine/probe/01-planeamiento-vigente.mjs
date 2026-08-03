// 01-planeamiento-vigente — THE LAYER THE CAPITAL WAS MISSING, MEASURED.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// WHAT THIS IS
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// `00-capital-field-sweep.mjs` swept all 41 folders / 447 services / 3,591 layers / 24,718 fields
// of `sigma.madrid.es`. Its headline negative stands (no `profundidad`/`fondo`/`retranqueo` field
// exists ANYWHERE in the municipal catalogue), but it surfaced a service that six prior Madrid
// passes never opened:
//
//   ANALISIS_URBANO/Visor_Edificabilidad_enero_2026/MapServer
//     layer 14  «Planeamiento Vigente»   polygon, 19,833 features
//     layer 10  «Parcelas Catastrales»    polygon, 1,102 — carries `rc14`, THE CATASTRO REFCAT
//     layer  0  «Parcelas urbanísticas»   polygon, 362 — one APR, a project extract
//
// Layer 14 carries `UUBV_NM_ED` (a buildability quantity) + `UNI_TX_DEN` (ITS UNIT, stated as a
// column) + `USP_TX_DEN` (the use) + `AMB_TX_ETI` (the governing ámbito) + `USP_TX_ALI`.
//
// ⚠⚠ **A UNIT COLUMN IS THE THING VALÈNCIA DIED FOR.** València's whole city is blocked because
// `altura` has no published unit and no offset convention (ADR-0287). Here the publisher states
// the unit per row. That does not make the number usable — it makes it CHECKABLE, which is the
// precondition. This probe measures whether it survives checking.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// THE FOUR QUESTIONS
// ═══════════════════════════════════════════════════════════════════════════════════════════════
//   Q1 COVERAGE  — how many of the 19,833 carry a positive `UUBV_NM_ED`? ⛔ Counted `> 0` ONLY:
//                  zero is a sentinel until proven a measurement (§CONTEXT-DATA-HONESTY, L-616).
//   Q2 UNITS     — what does `UNI_TX_DEN` actually contain, and is it single-valued? A quantity
//                  whose unit column has three values is three different quantities.
//   Q3 ROUTING   — what is in `AMB_TX_ETI`? Every `APR/APE/API` row is governed by a development
//                  instrument PRYZM does not hold ⇒ REFUSE, however good the number is.
//   Q4 EXTENT    — is this the CITY or one project? Layer 0 looked city-wide and was one ámbito.
//                  The same mistake at layer 14 would put a project extract under a city's name.
//
// Every figure is a server-side `outStatistics`/`returnCountOnly` census with `where` stated —
// no sampling, no client-side filtering. Deterministic on re-run.
//
//   node tools/madrid-envelope-engine/probe/01-planeamiento-vigente.mjs

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(HERE, '..', 'out');
const SVC = 'https://sigma.madrid.es/hosted/rest/services/ANALISIS_URBANO/Visor_Edificabilidad_enero_2026/MapServer';
const LAYER = 14;

const failures = [];

async function q(params) {
    const url = `${SVC}/${LAYER}/query?${new URLSearchParams({ f: 'json', ...params })}`;
    try {
        const res = await fetch(url, { headers: { Accept: 'application/json' } });
        const ct = res.headers.get('content-type') ?? '';
        if (!res.ok || !ct.includes('json')) {
            failures.push({ url, status: res.status, contentType: ct });
            return null;
        }
        const body = await res.json();
        if (body?.error) { failures.push({ url, arcgis: body.error }); return null; }
        return body;
    } catch (e) {
        failures.push({ url, transport: String(e?.message ?? e) });
        return null;
    }
}

const countWhere = async (where) => (await q({ where, returnCountOnly: 'true' }))?.count ?? null;

async function groupBy(field, where = '1=1') {
    const r = await q({
        where,
        groupByFieldsForStatistics: field,
        outStatistics: JSON.stringify([
            { statisticType: 'count', onStatisticField: 'OBJECTID', outStatisticFieldName: 'n' },
            { statisticType: 'sum', onStatisticField: 'Shape.STArea()', outStatisticFieldName: 'area_m2' },
        ]),
    });
    return (r?.features ?? [])
        .map((f) => ({ value: f.attributes[field], n: f.attributes.n, area_m2: f.attributes.area_m2 }))
        .sort((a, b) => b.n - a.n);
}

async function main() {
    const total = await countWhere('1=1');
    if (total === null) { console.error('⛔ layer unreachable — UNKNOWN, not an answer.'); process.exit(1); }

    // ── Q1 COVERAGE ──────────────────────────────────────────────────────────────────────────
    // ⛔ `> 0`, never `IS NOT NULL`. A stored 0 on a buildability field is an absence wearing a
    // number's clothes, and counting it as coverage is the exact L-616 / València-`0`-sentinel bug.
    const edPositive = await countWhere('UUBV_NM_ED > 0');
    const edZero = await countWhere('UUBV_NM_ED = 0');
    const edNull = await countWhere('UUBV_NM_ED IS NULL');

    // ── Q2 UNITS ─────────────────────────────────────────────────────────────────────────────
    const units = await groupBy('UNI_TX_DEN');
    const unitsOnPositive = await groupBy('UNI_TX_DEN', 'UUBV_NM_ED > 0');

    // ── Q3 ROUTING ───────────────────────────────────────────────────────────────────────────
    const ambitos = await groupBy('AMB_TX_ETI');
    const uses = await groupBy('USP_TX_DEN');
    const alignment = await groupBy('USP_TX_ALI');
    const nzFlag = await groupBy('UBOV_SN_NZ');
    const zoneLabel = await groupBy('UBOV_TX_ET');

    // ── Q4 EXTENT ────────────────────────────────────────────────────────────────────────────
    // Four points in four different districts, chosen because they are named in the repo's own
    // prior Madrid recon (`MADRID-DATA-RECON-SPIKE.md` §2) so the control is not invented here.
    const PROBE_POINTS = [
        { name: 'historic core (Sol/Austrias)', lon: -3.707959, lat: 40.423667, priorNZ: '1.2' },
        { name: 'Barrio de Salamanca', lon: -3.6807, lat: 40.4256, priorNZ: '1.3' },
        { name: 'Chamartín', lon: -3.6737, lat: 40.4577, priorNZ: '3.1.a' },
        { name: 'Mirasierra', lon: -3.7462, lat: 40.476, priorNZ: '8.2.a' },
    ];
    const pointHits = [];
    for (const p of PROBE_POINTS) {
        const r = await q({
            geometry: `${p.lon},${p.lat}`,
            geometryType: 'esriGeometryPoint',
            inSR: '4326',
            spatialRel: 'esriSpatialRelIntersects',
            outFields: 'UBOV_TX_ET,USP_TX_DEN,UUBV_NM_ED,UNI_TX_DEN,AMB_TX_ETI,AMB_TX_DEN,USP_TX_ALI,UBOV_SN_NZ,ZURV_TX_NO',
            returnGeometry: 'false',
        });
        pointHits.push({
            ...p,
            features: (r?.features ?? []).map((f) => f.attributes),
            // ⚠ 0 features here is a REAL answer (the layer does not cover this point), and it is
            // recorded as such — it is not a failure, and `failures` stays the only failure channel.
            featureCount: r ? (r.features ?? []).length : null,
        });
    }

    const report = {
        probe: 'madrid-planeamiento-vigente',
        ranAt: new Date().toISOString().slice(0, 10),
        service: SVC,
        layer: LAYER,
        total,
        coverage: {
            uubvNmEdPositive: edPositive,
            uubvNmEdZero: edZero,
            uubvNmEdNull: edNull,
            pctPositive: total ? Number(((edPositive / total) * 100).toFixed(2)) : null,
        },
        units,
        unitsOnPositive,
        ambitos: ambitos.slice(0, 60),
        ambitoDistinct: ambitos.length,
        uses,
        alignment,
        nzFlag,
        zoneLabelDistinct: zoneLabel.length,
        zoneLabelTop: zoneLabel.slice(0, 40),
        pointHits,
        transportFailures: failures.length,
        failures,
    };

    mkdirSync(OUT_DIR, { recursive: true });
    writeFileSync(join(OUT_DIR, '01-planeamiento-vigente.json'), JSON.stringify(report, null, 2));

    console.log(`total ${total} | UUBV_NM_ED > 0 : ${edPositive} (${report.coverage.pctPositive} %) | = 0 : ${edZero} | null : ${edNull}`);
    console.log('UNI_TX_DEN:', JSON.stringify(units));
    console.log('USP_TX_ALI:', JSON.stringify(alignment));
    console.log('UBOV_SN_NZ:', JSON.stringify(nzFlag));
    console.log(`AMB_TX_ETI distinct: ${ambitos.length}; top:`, JSON.stringify(ambitos.slice(0, 12)));
    console.log('USP_TX_DEN:', JSON.stringify(uses.slice(0, 15)));
    console.log(`UBOV_TX_ET distinct: ${zoneLabel.length}; top:`, JSON.stringify(zoneLabel.slice(0, 20)));
    for (const p of pointHits) console.log(`  point ${p.name}: ${p.featureCount} feature(s)`, JSON.stringify(p.features[0] ?? null));
    console.log(`failures: ${failures.length}`);
}

main();
