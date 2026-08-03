// 02-unit-and-routing-crosstab — WHAT SURVIVES BOTH GUARDS AT ONCE.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// WHY A CROSSTAB AND NOT TWO PERCENTAGES
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// Probe 01 measured two things separately and neither answer is usable alone:
//
//   • `UUBV_NM_ED > 0` on **96.17 %** of 19,833 rows — a buildability quantity at near-total
//     coverage, against the REGIONAL layer's 8.86 % `NM_ALTURA` for the same municipality;
//   • `UNI_TX_DEN` takes **SIX values**, and they are not six spellings of one unit. They are the
//     publisher's own statement of WHERE EACH NUMBER CAME FROM:
//         `m² Cat` 8,263 · `m² Plan` 6,086 · `m² Est` 2,906 · `m²/m² Plan` 2,335 ·
//         `m² Rev` 183 · `m² Libre` 60
//   • `AMB_TX_ETI` mixes Norma-Zonal codes (`4`, `3.1.a`, `1.3`) and DEVELOPMENT-instrument codes
//     (`UZP.2.01`, `UZPp.03.01-RP`, `APR.16.04`) in ONE column, 664 distinct values.
//
// ⛔ **A ROW MUST PASS BOTH GUARDS, AND MULTIPLYING THE MARGINALS IS NOT THE ANSWER.** 96 % × 42 %
// assumes independence, and there is no reason to think a `m² Cat` row is distributed across
// ámbitos like a `m² Plan` row. The founder-level number — *how many parcels can PRYZM actually
// say something cited about* — is a JOINT count, so it is measured jointly, server-side.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// ⚠⚠ THE SEMANTIC FINDING THAT DECIDES MADRID, STATED BEFORE THE NUMBERS
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// The service describes itself as *«Visualizar la situación de los ámbitos vigentes del PGOUM y la
// **edificabilidad disponible**»* — AVAILABLE buildability. `UNI_TX_DEN` is therefore not a unit
// column in the physics sense; it is a **provenance** column, and two of its six values are
// disqualifying on their face:
//
//   • **`m² Cat` — CATASTRO-DERIVED.** This is floorspace that EXISTS, read off the cadastre. It is
//     a measurement of the built city, not a statement of what the plan ALLOWS. Reading it as an
//     allowance is the same `not-the-rule-KIND` error as Murcia's `RB`/`RU` codes and València's
//     protection-derived `altura` — a wrong KIND, not a wrong number (ADR-0270).
//   • **`m² Est` — THE PUBLISHER'S OWN ESTIMATE.** PRYZM does not republish another body's estimate
//     as a determination. It has no article behind it, so it cannot be cited, and C58 §1.3 requires
//     every published number to carry its citation.
//
//   ⇒ Only `m² Plan` and `m²/m² Plan` are PLAN-SOURCED. `m² Rev` (revisión) and `m² Libre` are
//     undocumented tokens and are treated as UNKNOWN — ⛔ never as a default, never as zero.
//
// ⭐ **AND THAT IS THE OPPOSITE OF A PROBLEM. IT IS THE FIRST SPANISH SOURCE IN THIS REPO THAT
// LABELS ITS OWN PROVENANCE PER ROW.** València is a dead city in the dossier precisely because
// `altura` carries no unit and no convention and the publisher will not say (ADR-0287, ADR-0283).
// Madrid states it in a column. The 57.7 % this probe disqualifies is 57.7 % PRYZM would otherwise
// have published wrongly and never known.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// THE ROUTING CLASSES (`AMB_TX_ETI`)
// ═══════════════════════════════════════════════════════════════════════════════════════════════
//   NORMA-ZONAL  `^\d+(\.\d+)*(\.[a-z])?$`  — the base PGOUM-97 ordinance orders this land.
//   DEVELOPMENT  `APR|APE|API|UZP|UZI|UNP|AOE|SG|PP|PE|ED|UNC` prefixes — a per-site instrument
//                orders it, PRYZM does not hold that instrument ⇒ ⛔ REFUSE (`derived-plan`).
//   UNCLASSIFIED — anything else ⇒ ⛔ REFUSE. **An unrecognised routing token is UNKNOWN, and the
//                one thing it must never do is fall through to the base ordinance**, which would
//                silently assert *"no development plan governs here"* — the L-526 error.
//
//   node tools/madrid-envelope-engine/probe/02-unit-and-routing-crosstab.mjs

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
        if (!res.ok || !(res.headers.get('content-type') ?? '').includes('json')) {
            failures.push({ url, status: res.status });
            return null;
        }
        const body = await res.json();
        if (body?.error) { failures.push({ url, arcgis: body.error }); return null; }
        return body;
    } catch (e) { failures.push({ url, transport: String(e?.message ?? e) }); return null; }
}

/** The joint census: one server-side group-by over BOTH axes at once. */
async function crosstab() {
    const r = await q({
        where: 'UUBV_NM_ED > 0',
        groupByFieldsForStatistics: 'UNI_TX_DEN,AMB_TX_ETI',
        outStatistics: JSON.stringify([
            { statisticType: 'count', onStatisticField: 'OBJECTID', outStatisticFieldName: 'n' },
            { statisticType: 'sum', onStatisticField: 'Shape.STArea()', outStatisticFieldName: 'area_m2' },
        ]),
    });
    return (r?.features ?? []).map((f) => f.attributes);
}

const NORMA_ZONAL = /^\d+(\.\d+)*(\.[a-z])?$/;
const DEVELOPMENT = /^(APR|APE|API|UZP|UZPp|UZI|UNP|UNC|AOE|SG|PP|PE|ED|PAU|APIR)[.\s-]/i;

function routeClass(amb) {
    const v = (amb ?? '').trim();
    if (v === '') return 'unclassified';
    if (NORMA_ZONAL.test(v)) return 'norma-zonal';
    if (DEVELOPMENT.test(v)) return 'development';
    return 'unclassified';
}

const PLAN_SOURCED = new Set(['m² Plan', 'm²/m² Plan']);

async function main() {
    const rows = await crosstab();
    if (rows.length === 0) { console.error('⛔ crosstab empty/unreachable — UNKNOWN, not an answer.'); process.exit(1); }

    const cells = rows.map((a) => ({
        unit: a.UNI_TX_DEN,
        ambito: a.AMB_TX_ETI,
        route: routeClass(a.AMB_TX_ETI),
        planSourced: PLAN_SOURCED.has(a.UNI_TX_DEN),
        n: a.n,
        area_m2: a.area_m2,
    }));

    const agg = (pred) => cells.filter(pred).reduce(
        (acc, c) => ({ n: acc.n + c.n, area_m2: acc.area_m2 + (c.area_m2 ?? 0) }),
        { n: 0, area_m2: 0 },
    );

    const all = agg(() => true);
    const byRoute = {};
    for (const r of ['norma-zonal', 'development', 'unclassified']) byRoute[r] = agg((c) => c.route === r);
    const byUnit = {};
    for (const u of new Set(cells.map((c) => c.unit))) byUnit[u] = agg((c) => c.unit === u);

    // ⭐ THE JOINT SURVIVOR — plan-sourced AND base-ordinance-routed AND positive.
    const survivors = agg((c) => c.planSourced && c.route === 'norma-zonal');
    // The two refusal reasons, counted separately so a report can name WHY, never just "refused".
    const refusedRouting = agg((c) => c.route !== 'norma-zonal');
    const refusedProvenance = agg((c) => c.route === 'norma-zonal' && !c.planSourced);

    const pct = (x) => (all.n ? Number(((x / all.n) * 100).toFixed(2)) : null);
    const pctArea = (x) => (all.area_m2 ? Number(((x / all.area_m2) * 100).toFixed(2)) : null);

    // Which Norma Zonales survive, and how big is each? This is what an adapter can address.
    const survivorZones = {};
    for (const c of cells.filter((c) => c.planSourced && c.route === 'norma-zonal')) {
        const k = c.ambito;
        survivorZones[k] = survivorZones[k] ?? { n: 0, area_m2: 0, units: new Set() };
        survivorZones[k].n += c.n;
        survivorZones[k].area_m2 += c.area_m2 ?? 0;
        survivorZones[k].units.add(c.unit);
    }
    const survivorZoneList = Object.entries(survivorZones)
        .map(([zone, v]) => ({ zone, n: v.n, area_m2: Math.round(v.area_m2), units: [...v.units] }))
        .sort((a, b) => b.area_m2 - a.area_m2);

    // ⚠ A zone that carries BOTH `m² Plan` (absolute) and `m²/m² Plan` (ratio) is internally
    // inconsistent for a single-formula reading, and the adapter must branch per ROW, never per
    // zone. Counted here so the claim is measured rather than asserted.
    const mixedUnitZones = survivorZoneList.filter((z) => z.units.length > 1);

    const report = {
        probe: 'madrid-unit-and-routing-crosstab',
        ranAt: new Date().toISOString().slice(0, 10),
        service: SVC,
        layer: LAYER,
        where: 'UUBV_NM_ED > 0',
        denominator: all,
        byRoute,
        byUnit,
        planSourcedUnits: [...PLAN_SOURCED],
        survivors,
        survivorPctOfRows: pct(survivors.n),
        survivorPctOfArea: pctArea(survivors.area_m2),
        refusals: {
            routing: { ...refusedRouting, pctOfRows: pct(refusedRouting.n) },
            provenance: { ...refusedProvenance, pctOfRows: pct(refusedProvenance.n) },
        },
        survivorZoneList,
        mixedUnitZones,
        cellCount: cells.length,
        transportFailures: failures.length,
        failures,
    };

    mkdirSync(OUT_DIR, { recursive: true });
    writeFileSync(join(OUT_DIR, '02-unit-and-routing-crosstab.json'), JSON.stringify(report, null, 2));

    console.log(`denominator (UUBV_NM_ED>0): n=${all.n}  area=${(all.area_m2 / 1e6).toFixed(2)} km²`);
    console.log('by route:', JSON.stringify(Object.fromEntries(Object.entries(byRoute).map(([k, v]) => [k, `${v.n} (${pct(v.n)} %)`]))));
    console.log('by unit :', JSON.stringify(Object.fromEntries(Object.entries(byUnit).map(([k, v]) => [k, `${v.n} (${pct(v.n)} %)`]))));
    console.log(`⭐ SURVIVORS (plan-sourced ∧ norma-zonal): n=${survivors.n} (${report.survivorPctOfRows} % of rows, ${report.survivorPctOfArea} % of area)`);
    console.log(`   refused ROUTING   : ${refusedRouting.n} (${pct(refusedRouting.n)} %)`);
    console.log(`   refused PROVENANCE: ${refusedProvenance.n} (${pct(refusedProvenance.n)} %)`);
    console.log('survivor zones (top 20):', JSON.stringify(survivorZoneList.slice(0, 20)));
    console.log(`zones carrying MORE THAN ONE unit: ${mixedUnitZones.length}`);
    console.log(`failures: ${failures.length}`);
}

main();
