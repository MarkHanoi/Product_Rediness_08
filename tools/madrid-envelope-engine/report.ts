// THE REPORT — run the adapter over every captured municipality and count what it does.
//
//   npx tsx tools/madrid-envelope-engine/report.ts
//
// ⚠ OFFLINE. Reads only the committed `fixtures/*.json`. The numbers it prints are therefore
// reproducible byte-for-byte and can be disputed without a network.
//
// ⚠⚠ **EVERY RATE IS PER ORDINANCE POLYGON, NOT PER PARCEL.** The regional corpus contains NO
// PARCELS — a parcel-weighted figure needs a Catastro join that has not been run. Saying
// *"38 % of parcels"* when the denominator is ordinance polygons is the L-656 error, and it is
// the reason the denominator is printed beside every share here.

import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { adaptSpacmRow, type SpacmOrdenanzaRow } from '../../packages/site-parcel-data/src/rulepacks/esMadridSpacmAdapter.js';
import { isDrawable } from '../../packages/site-parcel-data/src/rulepacks/esMadridSpacmSchema.js';
import type { RefusalReason } from '../../packages/site-parcel-data/src/rulepacks/esMadridSpacmSchema.js';
import { buildAmbitoIndex, resolveAmbito, type AmbitoRow } from '../../packages/site-parcel-data/src/rulepacks/esMadridSpacmAmbitoJoin.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const FIX = join(HERE, 'fixtures');
const OUT = join(HERE, 'out');

interface Fixture {
    readonly rows: SpacmOrdenanzaRow[];
    readonly numberMatched: number;
    readonly rowsCaptured: number;
    readonly municipality: { readonly cd: string; readonly name: string; readonly role: string };
}

/**
 * ⚠ `verificationGateOpen` is passed as an ARGUMENT so the report can show BOTH states:
 *   • gate CLOSED  = what PRYZM would ship today (0 %, by design — L-449 is unsigned);
 *   • gate OPEN    = what the GEOMETRY half achieves, i.e. the size of the prize behind the gate.
 * ⛔ The second figure is NOT a claim that anything may be published. It is the answer to
 * *"what does signing buy?"*, and reporting only the first would make the gate look free.
 */
/** Both ámbito layers, indexed once. See `ambitoJoin.ts` for why BOTH is not belt-and-braces. */
const ambitoFixture = JSON.parse(readFileSync(join(FIX, 'ambitos.json'), 'utf8')) as {
    layers: Record<string, Record<string, { rows: AmbitoRow[] }>>;
};
function indexFor(cd: string) {
    return buildAmbitoIndex([
        { name: 'VPLA_V_AMBITO', rows: ambitoFixture.layers.VPLA_V_AMBITO[cd]?.rows ?? [] },
        { name: 'VPLA_V_AMBITO_MODIF', rows: ambitoFixture.layers.VPLA_V_AMBITO_MODIF[cd]?.rows ?? [] },
    ]);
}

function run(fixture: Fixture, gateOpen: boolean) {
    const byReason = new Map<RefusalReason, number>();
    const byGrammar = new Map<string, number>();
    let drawable = 0;
    const cd = fixture.municipality.cd;
    const index = indexFor(cd);

    for (const row of fixture.rows) {
        const name = row.DS_NOM_AMB === null || row.DS_NOM_AMB === undefined
            ? null : String(row.DS_NOM_AMB);
        const res = resolveAmbito(index, cd, name);
        const rec = adaptSpacmRow(row, {
            verificationGateOpen: gateOpen,
            instrumentKeyMatches: res.matches,
            instrumentFigure: res.figure,
            // ⚠ Only a POSITIVE resolution is passed. `matches === 0` on a named row means the join
            // failed to place it, and that must stay `routing-token-unrecognised` rather than
            // becoming a clearance.
            ambitoResolvesInRegister: res.matches > 0,
        });
        byGrammar.set(rec.grammar, (byGrammar.get(rec.grammar) ?? 0) + 1);
        if (isDrawable(rec)) { drawable += 1; continue; }
        for (const r of rec.refusals) byReason.set(r.reason, (byReason.get(r.reason) ?? 0) + 1);
    }

    const n = fixture.rows.length;
    const pct = (x: number) => Number(((x / n) * 100).toFixed(2));
    return {
        n,
        drawable,
        drawablePct: pct(drawable),
        grammar: Object.fromEntries([...byGrammar].sort((a, b) => b[1] - a[1])
            .map(([k, v]) => [k, { n: v, pct: pct(v) }])),
        // ⚠ Shares SUM TO MORE THAN 100 and that is correct: the guard is not short-circuited, so
        // one row can carry several reasons. Stated here so nobody "fixes" it.
        refusalsByReason: Object.fromEntries([...byReason].sort((a, b) => b[1] - a[1])
            .map(([k, v]) => [k, { n: v, pctOfRows: pct(v) }])),
    };
}

const CDS = ['022', '090', '160', '080', '079'];

const results = CDS.map((cd) => {
    const f: Fixture = JSON.parse(readFileSync(join(FIX, `ordenanza-${cd}.json`), 'utf8'));
    return {
        cd,
        name: f.municipality.name,
        role: f.municipality.role,
        numberMatched: f.numberMatched,
        rowsCaptured: f.rowsCaptured,
        /** ⚠ False for the capital: 2,000 of 22,181. Its rates are a HEAD SAMPLE, labelled as one. */
        completeCapture: f.rowsCaptured === f.numberMatched,
        gateClosed: run(f, false),
        gateOpen: run(f, true),
    };
});

const report = {
    tool: 'madrid-envelope-engine',
    ranAt: new Date().toISOString().slice(0, 10),
    denominator: 'ORDINANCE POLYGONS in sitcm:VPLA_V_ORDENANZA. ⚠ NOT parcels — this corpus '
        + 'contains none. A parcel-weighted figure requires a Catastro join that has not been run.',
    gate: 'MADRID_ENVELOPE_VERIFIED = false (L-449 unsigned). `gateClosed` is what ships today.',
    municipalities: results,
};

writeFileSync(join(OUT, '04-adapter-report.json'), JSON.stringify(report, null, 2));

console.log('MUNICIPALITY          rows   drawable(gate open)   top refusals (gate open)');
for (const r of results) {
    const top = Object.entries(r.gateOpen.refusalsByReason).slice(0, 3)
        .map(([k, v]) => `${k} ${v.pctOfRows}%`).join(' · ');
    const flag = r.completeCapture ? ' ' : '~';
    console.log(`${r.name.padEnd(20)}${flag}${String(r.rowsCaptured).padStart(6)}   `
        + `${String(r.gateOpen.drawablePct).padStart(6)} %          ${top}`);
}
console.log('\n(gate CLOSED ⇒ drawable is 0 % everywhere, by design — L-449 is unsigned)');
for (const r of results) {
    console.log(`\n${r.name} (cd=${r.cd}, ${r.role}${r.completeCapture ? '' : ', HEAD SAMPLE'})`);
    console.log('  grammar :', JSON.stringify(r.gateOpen.grammar));
    console.log('  refusals:', JSON.stringify(r.gateOpen.refusalsByReason));
    console.log('  gate-closed drawable:', r.gateClosed.drawablePct, '%');
}
