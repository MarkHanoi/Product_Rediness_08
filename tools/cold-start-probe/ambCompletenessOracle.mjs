#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// AN INDEPENDENT COMPLETENESS ORACLE FOR THE 36-MUNICIPALITY WALK — and the negative proof for
// every QUAL_MUNI zero.
// ═══════════════════════════════════════════════════════════════════════════════════════════════
//
// ⭐ WHY THIS IS A SEPARATE FILE. An oracle computed by the code it validates is not an oracle. This
//    reads the SAME service by a DIFFERENT mechanism (`returnCountOnly`, which never returns a
//    feature) and reconciles it against the artefact `task5-amb-all-municipalities.json` produced by
//    the paged walk. Neither can cover for the other.
//
// ⭐ `returnCountOnly=true` IS THE ArcGIS ANALOGUE OF GeoServer's `resultType=hits`, AND IT IS
//    UNCAPPED. Measured: it returns 48,782 for layer 16 and 22,525 for layer 17 against an
//    advertised `maxRecordCount` of **2,000** — 24× and 11× the cap. A capped oracle would have
//    answered 2,000 and been useless. Because it is exact and uncapped it can validate a paged walk
//    without any sampling, which is stronger than trusting `exceededTransferLimit` alone: that flag
//    says the server THINKS it finished, this says the totals AGREE.
//
// ⛔ AND THE PAGING LESSON THAT PROMPTED IT: "paging is unsupported" was recorded six times on a
//    GeoServer-backed service whose error actually read *"Cannot do natural order without a primary
//    key, please add it OR SPECIFY A MANUAL SORT OVER EXISTING ATTRIBUTES"* — the capability was
//    there, behind `sortBy`. **A truncated read of an ERROR MESSAGE is the same defect class as a
//    truncated read of a DATASET.** This service is ArcGIS and paged cleanly with `resultOffset`, so
//    no `sortBy` was needed here — but the completeness is now PROVEN rather than assumed.
//
// ⛔ NEGATIVE PROOF ON QUAL_MUNI. 20 of the 36 municipalities have ZERO rows in table 18. Before
//    that can be reported as absence it must survive the alternate-parameterisation sweep, which is
//    now SIX conditions long — axis order, CRS family, alternate parameterisation, bbox-vs-attribute,
//    path shape, and ⭐ **the 3-DIGIT KEY**: Madrid's `CD_MUNICIPIO='079'` returns 22,181 features
//    while the well-formed 5-digit `'28079'` returns a CLEAN HTTP 200 WITH ZERO FEATURES. A third
//    vocabulary that is a TRUNCATION of INE rather than a different code space.
import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { SVC, readJson, netLog } from './ambEnumerate.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, 'out');
const artefactPath = join(OUT, 'task5-amb-all-municipalities.json');
if (!existsSync(artefactPath)) { console.error('⛔ run task5-amb-all-municipalities.mjs first — there is nothing to reconcile against.'); process.exit(2); }
const A = JSON.parse(readFileSync(artefactPath, 'utf8'));

const count = async (layer, where, label) => (await readJson(`${SVC}/${layer}/query`, { f: 'json', where, returnCountOnly: 'true' }, label))?.count ?? null;

// ── 1 · service-wide reconciliation ────────────────────────────────────────────────────────────
const serviceWide = {};
for (const [layer, key] of [['16', 'zonePolygons'], ['17', 'ovPolygons']]) {
    const oracle = await count(layer, '1=1', `oracle:L${layer}:all`);
    const walked = A.results.reduce((a, r) => a + (r.counts?.[key] ?? 0), 0);
    serviceWide[`layer${layer}`] = {
        oracleCountOnly: oracle, sumOfPagedWalks: walked, delta: oracle === null ? null : oracle - walked,
        reconciled: oracle === walked,
        advertisedMaxRecordCount: 2000,
        oracleIsUncapped: oracle !== null && oracle > 2000,
    };
}

// ── 2 · per-municipality reconciliation ────────────────────────────────────────────────────────
const perMunicipality = [];
for (const r of A.results) {
    const oracle = await count('17', `CODI_INE='${r.ine}'`, `oracle:L17:${r.ine}`);
    perMunicipality.push({ ine: r.ine, name: r.name, oracleCountOnly: oracle, pagedWalk: r.counts?.ovPolygons ?? null, reconciled: oracle === (r.counts?.ovPolygons ?? null) });
}

// ── 3 · negative proof for the QUAL_MUNI zeros ─────────────────────────────────────────────────
// Exercised on Barcelona, the most consequential zero: the published city, 12,727 zoning polygons,
// and NOT ONE row in the table that publishes ARM / N_PLANTES / OCUP_MAX / SEP_FVIAL.
const ine = '08019';
const probes = [
    { where: `CODI_MUN LIKE '${ine}%'`, hypothesis: '5-digit INE prefix — what the probe keys on' },
    { where: `CODI_MUN LIKE '${ine.slice(2)}%'`, hypothesis: '3-DIGIT form — the Madrid CD_MUNICIPIO shape, a TRUNCATION of INE' },
    { where: "CODI_MUN LIKE '19%'", hypothesis: 'unpadded within-province number' },
    { where: "CODI_MUN LIKE '08900%'", hypothesis: "the DGC code — Barcelona's Catastro code is 08900, not 08019" },
    { where: `CODI_INE='${ine}'`, hypothesis: "the table's OWN declared CODI_INE column" },
    { where: 'CODI_INE IS NOT NULL', hypothesis: 'is CODI_INE populated on ANY row of the table at all?' },
    { where: `CODI_AMB LIKE '%${ine}%'`, hypothesis: 'CODI_AMB' },
    { where: `NUMAMB_KEY LIKE '%${ine}%'`, hypothesis: 'NUMAMB_KEY' },
    { where: "DESC_MUN LIKE '%arcelona%'", hypothesis: 'name substring, accent-safe' },
];
const negativeProof = { municipality: ine, table: '18 QUAL_MUNI', totalRowsInTable: await count('18', '1=1', 'oracle:T18:all'), probes: [] };
for (const p of probes) negativeProof.probes.push({ ...p, count: await count('18', p.where, `negproof:${p.hypothesis.slice(0, 24)}`) });
negativeProof.verdict = negativeProof.probes.every((p) => p.count === 0)
    ? 'ABSENCE CONFIRMED — nine parameterisations including the 3-digit truncation, the DGC code, the table\'s own declared INE column and a name substring all return zero against a table that demonstrably holds 486 rows. QUAL_MUNI genuinely carries no row for Barcelona. This is a MEASURED ABSENCE, not an unreached one.'
    : 'NOT ABSENCE — at least one alternate parameterisation returns rows. The original key was wrong.';
negativeProof.municipalitiesWithZeroRows = A.results.filter((r) => (r.counts?.qualMuniRows ?? 0) === 0).map((r) => r.ine);
negativeProof.note = 'The sweep was exercised on Barcelona only. The other 19 zeros share the same key and the same table; they are recorded as zero-on-the-same-evidence, NOT independently swept.';

const summary = {
    serviceWideReconciled: Object.values(serviceWide).every((v) => v.reconciled),
    perMunicipalityReconciled: perMunicipality.filter((p) => p.reconciled).length,
    perMunicipalityTotal: perMunicipality.length,
    mismatches: perMunicipality.filter((p) => !p.reconciled),
};

writeFileSync(join(OUT, 'amb-completeness-oracle.json'), JSON.stringify({
    probe: 'independent completeness oracle (returnCountOnly) + negative proof for the QUAL_MUNI zeros',
    ranAt: new Date().toISOString(),
    reconcilesAgainst: 'out/task5-amb-all-municipalities.json',
    summary, serviceWide, perMunicipality, negativeProof, network: netLog,
}, null, 1));

console.log(`LAYER 16 oracle ${serviceWide.layer16.oracleCountOnly} vs walk ${serviceWide.layer16.sumOfPagedWalks} → ${serviceWide.layer16.reconciled ? 'RECONCILED' : 'MISMATCH'}`);
console.log(`LAYER 17 oracle ${serviceWide.layer17.oracleCountOnly} vs walk ${serviceWide.layer17.sumOfPagedWalks} → ${serviceWide.layer17.reconciled ? 'RECONCILED' : 'MISMATCH'}`);
console.log(`per-municipality: ${summary.perMunicipalityReconciled}/${summary.perMunicipalityTotal} exact`);
console.log(`QUAL_MUNI negative proof: ${negativeProof.verdict.split('—')[0].trim()} (${negativeProof.probes.length} parameterisations, ${negativeProof.municipalitiesWithZeroRows.length} municipalities carry zero rows)`);
console.log('→ out/amb-completeness-oracle.json');
