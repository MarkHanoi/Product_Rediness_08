// ⭐ THE PROOF — one real parcel, one real ordinance row, one rule the shipped engine can solve.
//
//   npx tsx tools/madrid-envelope-engine/proveParcel.ts
//
// Reads `out/05-one-parcel.json` (captured live by `probe/05-prove-one-parcel.mjs`) and runs it
// through the adapter, printing the whole record: identity, rules with per-dimension provenance,
// grammar, the `GeometricRule`, the citation, and the constraints we do NOT hold.
//
// ⚠ THE ENVELOPE IS PRINTED UNDER `verificationGateOpen: true`. That is a DEMONSTRATION of the
// geometry half, not an authorisation: `MADRID_ENVELOPE_VERIFIED` is `false`, the L-449 gate is
// unsigned, and the gate-closed record is printed alongside so the difference is visible.

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { adaptSpacmRow, type SpacmOrdenanzaRow } from '../../packages/site-parcel-data/src/rulepacks/esMadridSpacmAdapter.js';
import { buildAmbitoIndex, resolveAmbito, type AmbitoRow } from '../../packages/site-parcel-data/src/rulepacks/esMadridSpacmAmbitoJoin.js';
import { isDrawable } from '../../packages/site-parcel-data/src/rulepacks/esMadridSpacmSchema.js';

const HERE = dirname(fileURLToPath(import.meta.url));

const parcel = JSON.parse(readFileSync(join(HERE, 'out', '05-one-parcel.json'), 'utf8')) as {
    proof: null | {
        lon: number; lat: number;
        catastro: { refcat: string; address: string };
        ordinance: SpacmOrdenanzaRow;
    };
};

if (!parcel.proof) {
    console.log('⛔ No parcel was proven in the last probe pass. Re-run '
        + '`node tools/madrid-envelope-engine/probe/05-prove-one-parcel.mjs`.');
    process.exit(0);
}

const { catastro, ordinance, lon, lat } = parcel.proof;

const ambitos = JSON.parse(readFileSync(join(HERE, 'fixtures', 'ambitos.json'), 'utf8')) as {
    layers: Record<string, Record<string, { rows: AmbitoRow[] }>>;
};
const index = buildAmbitoIndex([
    { name: 'VPLA_V_AMBITO', rows: ambitos.layers.VPLA_V_AMBITO['022'].rows },
    { name: 'VPLA_V_AMBITO_MODIF', rows: ambitos.layers.VPLA_V_AMBITO_MODIF['022'].rows },
]);
const name = ordinance.DS_NOM_AMB == null ? null : String(ordinance.DS_NOM_AMB);
const res = resolveAmbito(index, '022', name);

const ctx = {
    parcel: { id: catastro.refcat, cadastralRef: catastro.refcat, area_m2: null },
    instrumentKeyMatches: res.matches,
    instrumentFigure: res.figure,
    ambitoResolvesInRegister: res.matches > 0,
};

const shipped = adaptSpacmRow(ordinance, ctx);
const demo = adaptSpacmRow(ordinance, { ...ctx, verificationGateOpen: true });

const line = '─'.repeat(92);
console.log(line);
console.log('⭐ MADRID — ONE PARCEL, END TO END');
console.log(line);
console.log(`parcel        ${catastro.refcat}`);
console.log(`address       ${catastro.address}`);
console.log(`point         ${lon.toFixed(6)}, ${lat.toFixed(6)} (EPSG:4326)`);
console.log(`municipality  ${demo.municipality.name} — CD_MUNICIPIO '${demo.municipality.code}' `
    + `⇒ INE-5 ${demo.municipality.ine5}`);
console.log(`zone          «${demo.zoningCode.code}»  ·  soil ${demo.zoningCode.soilClass}`);
console.log(`instrument    ${demo.planningInstrument.name ?? 'NONE — the general plan orders this land directly'}`);
console.log(`              register matches: ${res.matches}${res.figure ? `, figure «${res.figure}»` : ''}`);
console.log(`grammar       ${demo.grammar}`);

console.log(`\nRULES (per-dimension provenance — ADR-0293)`);
for (const [k, p] of Object.entries(demo.rules)) {
    const v = p.value === null ? 'UNKNOWN' : String(p.value);
    console.log(`  ${k.padEnd(16)} ${v.padStart(8)}  ${String(p.provenance).padEnd(20)} `
        + `${p.sourceField ?? '—'}${p.value === null ? `   (${p.note})` : ''}`);
}

console.log(`\nENVELOPE (shipped GeometricRule kind — no Madrid-specific solver exists)`);
console.log(`  ${JSON.stringify(demo.envelope)}`);
console.log(`  drawable: ${isDrawable(demo)}`);

console.log(`\nCITATION`);
console.log(`  source    ${demo.provenance.source}`);
console.log(`  dataset   ${demo.provenance.dataset}  record ${demo.provenance.recordId}`);
console.log(`  document  ${demo.provenance.document}`);
console.log(`  statute   ${demo.provenance.statute}`);
console.log(`  published ${demo.provenance.published}`);
console.log(`  fields    ${demo.provenance.fields.join(', ')}`);

console.log(`\n⚠ CONSTRAINTS NOT HELD — every Madrid envelope is an OPEN TOP (ADR-0293)`);
for (const c of demo.missingConstraints) console.log(`  • ${c}`);

console.log(`\n⛔ WHAT ACTUALLY SHIPS TODAY (gate closed, MADRID_ENVELOPE_VERIFIED = false)`);
console.log(`  drawable: ${isDrawable(shipped)}   envelope: ${JSON.stringify(shipped.envelope)}`);
for (const r of shipped.refusals) console.log(`  • ${r.reason} — ${r.headline}`);
console.log(line);
