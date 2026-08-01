#!/usr/bin/env node
// §MURCIA-CROSSTAB — calificación × clase-de-suelo, the measurement that turns "≤ 33.0 %" into a
// point value.
//
//   node tools/murcia-coverage-crosstab/crosstab.mjs            # uses ./.cache if present
//   node tools/murcia-coverage-crosstab/crosstab.mjs --refresh   # re-hit the municipal WFS
//   node tools/murcia-coverage-crosstab/crosstab.mjs --asof 2027-01-01
//
// Writes `out-crosstab.json` (committed — it is the audit trail for RATE.md §CLOSURE) and prints a
// markdown summary. Re-runnable by design: the cached pages make a re-run free, `--refresh` makes it
// current, and the two answers can be diffed.
//
// ⚠ IT PUBLISHES NO ENVELOPE AND AUTHORISES NOTHING. `MURCIA_ENVELOPE_VERIFIED` stays `false`; this
// tool measures what a signature WOULD render, which is a different act from signing.

import { fetchAll, geometryArea, inForce, parseSectorCode, pct, writeJson } from './lib.mjs';
import {
    BUILDABLE_FAMILIES, PACKED_FAMILIES, GENERICA_FAMILIES, REMITTED_FAMILIES,
    INTERIM_FAMILIES, CODE_PACKED_EXACT, CODE_REMITTED_PREFIXES,
    GROUND_ARTICLE, calificacionFamily, delegationGround,
} from './classify.mjs';

const argv = process.argv.slice(2);
const REFRESH = argv.includes('--refresh');
const ASOF = (() => {
    const i = argv.indexOf('--asof');
    return i >= 0 && argv[i + 1] ? argv[i + 1] : new Date().toISOString().slice(0, 10);
})();

const log = (s) => process.stderr.write(`${s}\n`);
const M = (m2) => Number((m2 / 1e6).toFixed(3));

// ── 1. the two layers ────────────────────────────────────────────────────────
log(`§MURCIA-CROSSTAB · asOf=${ASOF} · refresh=${REFRESH}`);
const sectores = await fetchAll(
    'Murcia:pgou_sectores', 'sector,clase_suelo,categoria,superficie,f_inicial,f_fin',
    { refresh: REFRESH, log },
);
const calificaciones = await fetchAll(
    'Murcia:pgou_alineaciones', 'calificacion,descripcion,sector,f_inicial,f_fin,wkb_geometry',
    { refresh: REFRESH, log },
);

// ⚠ A FETCH FAILURE IS NOT AN EMPTY MEASUREMENT (§CONTEXT-DATA-HONESTY). Exit non-zero and print
// nothing that could be mistaken for a share.
if (!sectores || !calificaciones) {
    console.log(JSON.stringify({
        ok: false,
        reason: 'fetch-failure',
        detail: 'The Murcia municipal WFS did not deliver a complete layer. This is NOT a measurement of zero coverage.',
        sectoresFetched: sectores ? sectores.length : null,
        calificacionesFetched: calificaciones ? calificaciones.length : null,
    }, null, 2));
    process.exit(2);
}

// ── 2. sector code → clase de suelo ──────────────────────────────────────────
// Attribute join on the publisher's own `sector` key. ⚠ NEVER on a code whose meaning we inferred:
// a first pass of the original §3b measurement read `Z*`/`UD` prefixes as ordinary urban and was
// wrong by 20 pp.
const claseBySector = new Map();
const categoriaBySector = new Map();
let sectorConflicts = 0;
for (const f of sectores) {
    const p = f.properties;
    if (inForce(p.f_inicial, p.f_fin, ASOF) !== true) continue;
    const k = String(p.sector ?? '').trim().toUpperCase();
    if (!k) continue;
    const prev = claseBySector.get(k);
    if (prev !== undefined && prev !== p.clase_suelo) sectorConflicts++;
    claseBySector.set(k, p.clase_suelo);
    categoriaBySector.set(k, p.categoria);
}

// ── 3. per-polygon classification ────────────────────────────────────────────
const byFamily = new Map();      // family → { area, n, direct, delegated, unjoined, byGround }
const byGround = new Map();      // delegation ground → area
const byClase = new Map();       // clase_suelo bucket → area (over buildable land)
const crosstab = new Map();      // `${family}|${claseBucket}` → area

let denominator = 0, nBuildable = 0;
let notInForce = 0, nonBuildableArea = 0;
let unjoinedArea = 0, unjoinedCount = 0;
let directArea = 0, delegatedArea = 0;
let packedFamilyArea = 0, packedDirectArea = 0, packedDelegatedArea = 0, packedUnjoinedArea = 0;
let codeExactArea = 0, codeRendersArea = 0, codeRendersOnDelegatedArea = 0;
const codeRendersOnDelegatedByGround = new Map();
let interimDirectArea = 0, interimCodeRendersArea = 0;

const claseBucket = (c) => (c === undefined ? 'UNJOINED' : (c ?? 'null'));

for (const f of calificaciones) {
    const p = f.properties;
    if (inForce(p.f_inicial, p.f_fin, ASOF) !== true) { notInForce++; continue; }
    const raw = String(p.calificacion ?? '').trim().toUpperCase();
    const family = calificacionFamily(raw);
    const area = geometryArea(f.geometry);
    if (!family) { nonBuildableArea += area; continue; }

    denominator += area;
    nBuildable++;

    const sectorKey = String(p.sector ?? '').trim().toUpperCase();
    // ⚠ THREE VALUES, KEPT APART: a sector code that joins · a polygon with NO sector attribute ·
    // a sector code the sectores layer does not carry. The last two are `undefined` = UNJOINED and
    // are NEVER defaulted to "not delegated" — that default is precisely how a bound becomes a lie.
    const clase = sectorKey && claseBySector.has(sectorKey) ? claseBySector.get(sectorKey) : undefined;
    if (clase === undefined) { unjoinedArea += area; unjoinedCount++; }

    const prefix = parseSectorCode(sectorKey)?.prefix ?? null;
    const ground = delegationGround(family, prefix, clase);

    const bucket = claseBucket(clase);
    byClase.set(bucket, (byClase.get(bucket) ?? 0) + area);
    const ck = `${family}|${bucket}`;
    crosstab.set(ck, (crosstab.get(ck) ?? 0) + area);

    const fe = byFamily.get(family) ?? { area: 0, n: 0, direct: 0, delegated: 0, unjoined: 0 };
    fe.area += area; fe.n++;
    if (ground) { fe.delegated += area; delegatedArea += area; byGround.set(ground, (byGround.get(ground) ?? 0) + area); }
    else { fe.direct += area; directArea += area; }
    if (clase === undefined) fe.unjoined += area;
    byFamily.set(family, fe);

    const isPacked = PACKED_FAMILIES.includes(family);
    if (isPacked) {
        packedFamilyArea += area;
        if (ground) packedDelegatedArea += area; else packedDirectArea += area;
        if (clase === undefined) packedUnjoinedArea += area;
        if (!ground && INTERIM_FAMILIES.includes(family)) interimDirectArea += area;
    }

    // ── what the SHIPPING code would render the moment the gate flips ──
    const codePacked = CODE_PACKED_EXACT.includes(raw);
    if (codePacked) {
        codeExactArea += area;
        const codeRemitted = prefix !== null && CODE_REMITTED_PREFIXES.includes(prefix);
        if (!codeRemitted) {
            codeRendersArea += area;
            if (ground) {
                codeRendersOnDelegatedArea += area;
                codeRendersOnDelegatedByGround.set(ground, (codeRendersOnDelegatedByGround.get(ground) ?? 0) + area);
            }
            if (INTERIM_FAMILIES.includes(family)) interimCodeRendersArea += area;
        }
    }
}

// ── 4. report ────────────────────────────────────────────────────────────────
const D = denominator;
const familyRows = [...byFamily.entries()]
    .map(([family, e]) => ({
        family,
        class: PACKED_FAMILIES.includes(family) ? 'packed'
            : GENERICA_FAMILIES.includes(family) ? 'generica'
                : REMITTED_FAMILIES.includes(family) ? 'remitida'
                    : 'refused-direct',
        polygons: e.n,
        area_Mm2: M(e.area), shareOfBuildable_pct: Number(pct(e.area, D).toFixed(2)),
        pgouDirect_Mm2: M(e.direct), delegated_Mm2: M(e.delegated), unjoined_Mm2: M(e.unjoined),
    }))
    .sort((a, b) => b.area_Mm2 - a.area_Mm2);

const out = {
    ok: true,
    tool: '§MURCIA-CROSSTAB',
    asOf: ASOF,
    snapshot: new Date().toISOString(),
    source: {
        endpoint: 'https://geoserver.murcia.es/geoserver/wfs',
        layers: ['Murcia:pgou_alineaciones', 'Murcia:pgou_sectores'],
        crs: 'EPSG:25830 (native; areas are planar metres, never degrees)',
        calificacionFeatures: calificaciones.length,
        sectorFeatures: sectores.length,
    },
    honesty: {
        notInForcePolygons: notInForce,
        nonBuildableArea_Mm2: M(nonBuildableArea),
        unjoinedPolygons: unjoinedCount,
        unjoinedArea_Mm2: M(unjoinedArea),
        unjoinedShareOfBuildable_pct: Number(pct(unjoinedArea, D).toFixed(2)),
        sectorClaseConflicts: sectorConflicts,
        note: 'UNJOINED is a THIRD VALUE — it is neither PGOU-direct nor delegated. It is reported, never defaulted.',
    },
    denominator: {
        privateBuildable_Mm2: M(D),
        polygons: nBuildable,
        families: BUILDABLE_FAMILIES.length,
        basis: 'L-656 — BUILDABLE land, not all land, not clicks.',
    },
    delegationSplit: {
        pgouDirect_Mm2: M(directArea), pgouDirect_pct: Number(pct(directArea, D).toFixed(2)),
        delegated_Mm2: M(delegatedArea), delegated_pct: Number(pct(delegatedArea, D).toFixed(2)),
        byGround: Object.fromEntries([...byGround.entries()].map(([g, a]) => [g, {
            area_Mm2: M(a), pct: Number(pct(a, D).toFixed(2)), article: GROUND_ARTICLE[g],
        }])),
    },
    // ⭐ THE MEASUREMENT THIS TOOL EXISTS FOR.
    intersection: {
        packedByCode_Mm2: M(packedFamilyArea),
        packedByCode_pct: Number(pct(packedFamilyArea, D).toFixed(2)),
        packedAndDirect_Mm2: M(packedDirectArea),
        packedAndDirect_pct: Number(pct(packedDirectArea, D).toFixed(2)),
        packedButDelegated_Mm2: M(packedDelegatedArea),
        packedButDelegated_pct: Number(pct(packedDelegatedArea, D).toFixed(2)),
        packedUnjoined_Mm2: M(packedUnjoinedArea),
        firmFloorExcludingInterimRL_Mm2: M(packedDirectArea - interimDirectArea),
        firmFloorExcludingInterimRL_pct: Number(pct(packedDirectArea - interimDirectArea, D).toFixed(2)),
    },
    // ⚠ WHAT THE SHIPPING CODE WOULD ACTUALLY RENDER — a different, narrower and partly WIDER set.
    shippingBehaviour: {
        note: 'Drives resolveMurciaPgouZone\'s exact allow-list (14 codes + RF1 + IXT) and REMITTED_AMBITO_PREFIXES only.',
        packedExactStrings_Mm2: M(codeExactArea),
        packedExactStrings_pct: Number(pct(codeExactArea, D).toFixed(2)),
        wouldRenderOnSignature_Mm2: M(codeRendersArea),
        wouldRenderOnSignature_pct: Number(pct(codeRendersArea, D).toFixed(2)),
        ofWhichOnLegallyDelegatedLand_Mm2: M(codeRendersOnDelegatedArea),
        ofWhichOnLegallyDelegatedLand_pct: Number(pct(codeRendersOnDelegatedArea, D).toFixed(2)),
        ofWhichOnLegallyDelegatedLand_byGround: Object.fromEntries(
            [...codeRendersOnDelegatedByGround.entries()].sort((a, b) => b[1] - a[1]).map(([g, a]) => [g, {
                area_Mm2: M(a), pct: Number(pct(a, D).toFixed(2)), article: GROUND_ARTICLE[g],
            }])),
        firmFloorExcludingInterimRL_pct: Number(pct(codeRendersArea - interimCodeRendersArea, D).toFixed(2)),
    },
    byFamily: familyRows,
    byClaseSuelo: Object.fromEntries([...byClase.entries()].sort((a, b) => b[1] - a[1])
        .map(([k, a]) => [k, { area_Mm2: M(a), pct: Number(pct(a, D).toFixed(2)) }])),
    crosstab: Object.fromEntries([...crosstab.entries()].sort((a, b) => b[1] - a[1])
        .map(([k, a]) => [k, M(a)])),
};

writeJson('out-crosstab.json', out);

// markdown summary → stdout
const P = (x) => `${x.toFixed(2)} %`;
console.log(`\n## §MURCIA-CROSSTAB — snapshot ${out.snapshot.slice(0, 10)} (asOf ${ASOF})\n`);
console.log(`Denominator (private buildable, L-656): **${out.denominator.privateBuildable_Mm2} M m²** over ${nBuildable} in-force polygons`);
console.log(`Unjoined (third value, never defaulted): ${out.honesty.unjoinedArea_Mm2} M m² = ${P(out.honesty.unjoinedShareOfBuildable_pct)}\n`);
console.log('| | M m² | share of buildable |');
console.log('|---|---:|---:|');
console.log(`| PGOU-DIRECT | ${out.delegationSplit.pgouDirect_Mm2} | ${P(out.delegationSplit.pgouDirect_pct)} |`);
console.log(`| DELEGATED | ${out.delegationSplit.delegated_Mm2} | ${P(out.delegationSplit.delegated_pct)} |`);
for (const [g, v] of Object.entries(out.delegationSplit.byGround)) {
    console.log(`| … ${g} (${v.article}) | ${v.area_Mm2} | ${P(v.pct)} |`);
}
console.log(`| 14 packed calificaciones BY CODE | ${out.intersection.packedByCode_Mm2} | ${P(out.intersection.packedByCode_pct)} |`);
console.log(`| **⭐ packed ∧ PGOU-direct (the cross-tab)** | **${out.intersection.packedAndDirect_Mm2}** | **${P(out.intersection.packedAndDirect_pct)}** |`);
console.log(`| … of which the FIRM FLOOR (excl. interim RL) | ${out.intersection.firmFloorExcludingInterimRL_Mm2} | ${P(out.intersection.firmFloorExcludingInterimRL_pct)} |`);
console.log(`| packed but DELEGATED (refuses anyway) | ${out.intersection.packedButDelegated_Mm2} | ${P(out.intersection.packedButDelegated_pct)} |`);
console.log(`| ⚠ what the SHIPPING code would render on signature | ${out.shippingBehaviour.wouldRenderOnSignature_Mm2} | ${P(out.shippingBehaviour.wouldRenderOnSignature_pct)} |`);
console.log(`| ⚠ … of that, on land the PGOU DELEGATES | ${out.shippingBehaviour.ofWhichOnLegallyDelegatedLand_Mm2} | ${P(out.shippingBehaviour.ofWhichOnLegallyDelegatedLand_pct)} |`);
console.log('\nFull detail → `tools/murcia-coverage-crosstab/out-crosstab.json`');
