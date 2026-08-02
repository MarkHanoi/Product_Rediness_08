#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// G1 EVIDENCE, MADE AN ARTEFACT — the DGC↔INE map for the AMB 36, derived not asserted.
// ═══════════════════════════════════════════════════════════════════════════════════════════════
//
// WHY THIS IS SEPARATE FROM THE RUN: on a cached frame `buildFrame()` short-circuits the ATOM hop,
// so G1 reports `exercised: false` — a guard NOT RE-EXERCISED, which is not a passed guard. Rather
// than render that null as a tick, the mapping is derived HERE, deterministically, from the
// province ATOM, and written where it can be diffed.
//
// ⛔⛔ THE FINDING THIS EXISTS TO RECORD, AND IT IS NATIONAL.
//   `REGIONAL-INTAKE-LIST` §1 says *"Three collisions found in one week."* In **province 08 alone,
//   27 of the AMB's 36 municipalities have DGC ≠ INE**, and in **24 of them the INE code resolves in
//   the SAME ATOM to a REAL, DIFFERENT municipality** — so a code-keyed lookup does not fail, it
//   returns a plausible wrong city. The offset is NOT a constant: −1 across most of the alphabet,
//   +1 for Viladecans, the 900-series for the provincial capital (08019 → 08900), and 08312/08313
//   for the two municipalities created after the INE list was fixed (08904 Badia, 08905 La Palma).
//
//   ⇒ THE COLLISION IS NOT AN EXCEPTION LIST. IT IS THE DEFAULT. Any "is this the right
//     municipality?" check that is not NAME-authoritative passes on the wrong city 75 % of the time
//     in this province, and the AMB contains BOTH sides of the worst pair (INE 08204 Sant Climent
//     vs DGC 08204 Sant Cugat, whose INE is 08205).
import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { findEnclosure, normName } from './catastroParcelFrame.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, 'out');
if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true });

const universe = JSON.parse(readFileSync(join(OUT, 'amb-enumeration.json'), 'utf8'));
const xml = readFileSync(join(HERE, '.cache', 'atom_08.xml'), 'utf8');
const titles = new Map([...xml.matchAll(/<title>\s*(\d{5})-([^<]*?)\s*Cadastral Parcels<\/title>/gi)].map((m) => [m[1], m[2]]));

const rows = universe.municipalities.map((m) => {
    const hit = findEnclosure(xml, m.ine, m.name);
    const whatTheIneCodeIsInCatastro = titles.get(m.ine) ?? null;
    return {
        ine: m.ine,
        nameFromAmbService: m.name,
        dgcCode: hit?.code ?? null,
        matchedBy: hit?.matchedBy ?? null,
        collides: hit ? hit.code !== m.ine : null,
        // ⚠ THE DANGEROUS COLUMN. If this is non-null and the codes differ, a code-keyed lookup
        //   silently returns THIS municipality's parcels instead — a real place, a plausible count.
        ineCodeResolvesInCatastroTo: whatTheIneCodeIsInCatastro,
        silentWrongCityRisk: hit ? (hit.code !== m.ine && whatTheIneCodeIsInCatastro !== null) : null,
        publisherNameDefect: hit?.warning?.startsWith('PUBLISHER NAME DEFECT') ? hit.warning : null,
    };
});

const summary = {
    municipalities: rows.length,
    dgcDiffersFromIne: rows.filter((r) => r.collides).length,
    silentWrongCityRisk: rows.filter((r) => r.silentWrongCityRisk).length,
    unmatched: rows.filter((r) => r.dgcCode === null).length,
    matchedByPublisherGapWildcard: rows.filter((r) => r.publisherNameDefect).length,
    docsClaim: 'REGIONAL-INTAKE-LIST §1: "Three collisions found in one week."',
    verdict: 'UNDERSTATED BY MORE THAN AN ORDER OF MAGNITUDE. In this one province the collision rate among the AMB 36 is 75 %, and 24 of those return a real, different municipality rather than an error.',
};

writeFileSync(join(OUT, 'amb-dgc-ine-map.json'), JSON.stringify({
    probe: 'G1 evidence — DGC↔INE map for the AMB 36, derived from the province-08 Catastro INSPIRE ATOM',
    ranAt: new Date().toISOString(),
    codeSpaces: { INE: 'AMB layer-16 CODI_INE; the same space SIU keys on (ProvINE) and the rest of this repo uses', DGC: 'Catastro Dirección General del Catastro municipality code, used in the INSPIRE CP enclosure path' },
    summary, rows,
}, null, 1));

console.log(`AMB 36 · DGC≠INE on ${summary.dgcDiffersFromIne} · of which ${summary.silentWrongCityRisk} would return a REAL DIFFERENT municipality on a code-keyed lookup · unmatched ${summary.unmatched}`);
for (const r of rows.filter((x) => x.collides)) console.log(`  ${r.ine} ${String(r.nameFromAmbService).padEnd(28)} → DGC ${r.dgcCode}   [INE ${r.ine} in Catastro = ${JSON.stringify(r.ineCodeResolvesInCatastroTo)}]`);
console.log('→ out/amb-dgc-ine-map.json');
