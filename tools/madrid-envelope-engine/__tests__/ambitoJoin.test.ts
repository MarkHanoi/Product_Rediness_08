// ÁMBITO JOIN TESTS — the register, not the prefix, is the authority on whether an instrument
// exists.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildAmbitoIndex, resolveAmbito, type AmbitoRow } from '../../../packages/site-parcel-data/src/rulepacks/esMadridSpacmAmbitoJoin.js';
import { adaptSpacmRow, type SpacmOrdenanzaRow } from '../../../packages/site-parcel-data/src/rulepacks/esMadridSpacmAdapter.js';

const FIX = join(__dirname, '..', 'fixtures');
const ambitos = JSON.parse(readFileSync(join(FIX, 'ambitos.json'), 'utf8')) as {
    layers: Record<string, Record<string, { rows: AmbitoRow[]; numberMatched: number; rowsCaptured: number }>>;
};
const ordenanza = (cd: string) =>
    JSON.parse(readFileSync(join(FIX, `ordenanza-${cd}.json`), 'utf8')) as { rows: SpacmOrdenanzaRow[] };

const indexFor = (cd: string) => buildAmbitoIndex([
    { name: 'VPLA_V_AMBITO', rows: ambitos.layers.VPLA_V_AMBITO[cd]?.rows ?? [] },
    { name: 'VPLA_V_AMBITO_MODIF', rows: ambitos.layers.VPLA_V_AMBITO_MODIF[cd]?.rows ?? [] },
]);

const CDS = ['022', '090', '160', '080', '079'];

describe('the ámbito fixtures are complete captures', () => {
    it('reconciles every layer/municipality against the service\'s own numberMatched', () => {
        for (const layer of Object.values(ambitos.layers)) {
            for (const f of Object.values(layer)) expect(f.rowsCaptured).toBe(f.numberMatched);
        }
    });
});

describe('⭐ THE JOIN RESOLVES — and it overturned the prefix reading', () => {
    // The measurement that corrected this tool's own earlier conclusion. Moralzarzal's `Z24-P1`
    // matches NO development prefix and IS a development ámbito: 817 of 817 resolve.
    //
    // ⚠⚠ **AND THIS TEST CORRECTED IT A SECOND TIME.** It was first written as *"resolves EVERY
    // named ámbito in EVERY municipality"*, on the strength of four municipalities that all hit
    // 100 %. **Majadahonda resolves 37 of 43 — 86.0 %.** The four-for-four was a real pattern and
    // "100 %" was still an overclaim, and asserting it would have hard-coded a false universal.
    // The census's own region-wide figure is **95.77 % of named rows** (`05-analyse.log` §2b), so
    // 86 % is inside the expected spread, not an anomaly.
    //
    // ⇒ The assertion is now per-municipality and honest about the floor, and the NEXT test pins
    // the behaviour that actually matters: an unresolved name is still refused.
    it('resolves the large majority of named ámbitos, per municipality', () => {
        const rates: Record<string, number> = {};
        for (const cd of CDS) {
            const index = indexFor(cd);
            const named = ordenanza(cd).rows
                .map((r) => (r.DS_NOM_AMB == null ? null : String(r.DS_NOM_AMB)))
                .filter((n): n is string => n !== null && n.trim() !== '');
            if (named.length === 0) continue;
            const resolved = named.filter((n) => resolveAmbito(index, cd, n).matches > 0).length;
            rates[cd] = (resolved / named.length) * 100;
        }
        // Four municipalities resolve completely…
        for (const cd of ['022', '090', '160', '079']) expect(rates[cd]).toBe(100);
        // …and Majadahonda does not, which is recorded rather than smoothed over.
        expect(rates['080']).toBeCloseTo(86.05, 1);
        expect(rates['080']).toBeLessThan(100);
    });

    // ⛔ THE BEHAVIOUR THAT MATTERS. An unresolved name must NOT become a clearance — the join
    // failing to place an ámbito is exactly the case where we know least.
    it('refuses a named row the register could not place, rather than clearing it', () => {
        const index = indexFor('080');
        const unresolved = ordenanza('080').rows.filter((r) => {
            const n = r.DS_NOM_AMB == null ? null : String(r.DS_NOM_AMB);
            return n !== null && n.trim() !== '' && resolveAmbito(index, '080', n).matches === 0;
        });
        expect(unresolved.length).toBeGreaterThan(0);
        for (const row of unresolved) {
            const rec = adaptSpacmRow(row, {
                verificationGateOpen: true, instrumentKeyMatches: 0, ambitoResolvesInRegister: false,
            });
            expect(rec.refusals.length).toBeGreaterThan(0);
            expect(rec.envelope).toBeNull();
        }
    });

    it('resolves Moralzarzal\'s opaque Z##-P# tokens specifically', () => {
        const index = indexFor('090');
        const z = ordenanza('090').rows.find((r) => String(r.DS_NOM_AMB ?? '').startsWith('Z24-P1'));
        expect(z).toBeDefined();
        expect(resolveAmbito(index, '090', String(z!.DS_NOM_AMB)).matches).toBeGreaterThan(0);
    });

    // ⛔ MUTATION: `resolveAmbito` returning `matches: 1` for a blank name. That would make every
    // base-plan row look delegated.
    it('returns matches 0 for a blank, null or unknown name', () => {
        const index = indexFor('022');
        for (const n of [null, '', '   ', 'NO SUCH ÁMBITO 99']) {
            expect(resolveAmbito(index, '022', n).matches).toBe(0);
        }
    });

    it('is case- and whitespace-insensitive on the name, as the corpus is not consistent', () => {
        const index = indexFor('022');
        const row = ordenanza('022').rows.find((r) => r.DS_NOM_AMB != null)!;
        const name = String(row.DS_NOM_AMB);
        expect(resolveAmbito(index, '022', `  ${name.toLowerCase()}  `).matches).toBeGreaterThan(0);
    });

    it('does not leak across municipalities — the key is (municipality, name)', () => {
        const boadillaName = String(ordenanza('022').rows.find((r) => r.DS_NOM_AMB != null)!.DS_NOM_AMB);
        expect(resolveAmbito(indexFor('090'), '090', boadillaName).matches).toBe(0);
    });
});

describe('AMBIGUITY — two instruments is not a selection', () => {
    it('finds real non-unique keys in the captured data', () => {
        // Without this the ambiguity assertions would be vacuous. Measured region-wide: 8.81 % of
        // AMBITO keys and 30.66 % of AMBITO_MODIF keys are non-unique.
        const ambiguous = CDS.flatMap((cd) => [...indexFor(cd).values()].filter((r) => r.matches > 1));
        expect(ambiguous.length).toBeGreaterThan(0);
    });

    // ⛔ MUTATION: `figure: figures[0]`. One match saying *Plan Parcial* and another *Estudio
    // Detalle* are different legal regimes; picking either asserts the fact we just said we
    // cannot establish.
    it('yields a null figure when matches disagree, and records every figure seen', () => {
        const disagreeing = CDS.flatMap((cd) => [...indexFor(cd).values()])
            .filter((r) => r.figures.length > 1);
        for (const r of disagreeing) {
            expect(r.figure).toBeNull();
            expect(r.figures.length).toBeGreaterThan(1);
        }
    });

    it('yields the figure when every match agrees on it', () => {
        const agreeing = CDS.flatMap((cd) => [...indexFor(cd).values()])
            .filter((r) => r.figures.length === 1);
        expect(agreeing.length).toBeGreaterThan(0);
        for (const r of agreeing) expect(r.figure).toBe(r.figures[0]);
    });

    // ⛔ MUTATION: adding `null` to the figure set. A key with one real figure and three nulls
    // would then look ambiguous, and a determinable class would be refused.
    it('never treats a null DS_FIG_DES as a distinct figure', () => {
        const index = buildAmbitoIndex([{
            name: 'T',
            rows: [
                { CD_MUNICIPIO: '022', DS_NOMB_AMB: 'X', DS_FIG_DES: 'Plan Parcial' },
                { CD_MUNICIPIO: '022', DS_NOMB_AMB: 'X', DS_FIG_DES: null },
                { CD_MUNICIPIO: '022', DS_NOMB_AMB: 'X', DS_FIG_DES: '' },
            ],
        }]);
        const r = resolveAmbito(index, '022', 'X');
        expect(r.matches).toBe(3);
        expect(r.figures).toEqual(['Plan Parcial']);
        expect(r.figure).toBe('Plan Parcial');
    });
});

describe('BOTH LAYERS — MODIF is a different population, not a revision', () => {
    // 54.83 % of MODIF keys are absent from AMBITO. Indexing one alone returns matches: 0 for
    // instruments the other holds — and 0 reads as "no instrument governs here".
    it('records which layer(s) each key came from', () => {
        const index = indexFor('079');
        const layersSeen = new Set([...index.values()].flatMap((r) => r.layers));
        expect(layersSeen.has('VPLA_V_AMBITO')).toBe(true);
        expect(layersSeen.has('VPLA_V_AMBITO_MODIF')).toBe(true);
    });

    it('resolves strictly more names with both layers than with AMBITO alone', () => {
        const both = indexFor('079');
        const onlyBase = buildAmbitoIndex([
            { name: 'VPLA_V_AMBITO', rows: ambitos.layers.VPLA_V_AMBITO['079'].rows },
        ]);
        expect(both.size).toBeGreaterThan(onlyBase.size);
    });
});

describe('the join, wired through the adapter', () => {
    const cd = '090';
    const index = indexFor(cd);
    const adapt = (row: SpacmOrdenanzaRow) => {
        const name = row.DS_NOM_AMB == null ? null : String(row.DS_NOM_AMB);
        const res = resolveAmbito(index, cd, name);
        return adaptSpacmRow(row, {
            verificationGateOpen: true,
            instrumentKeyMatches: res.matches,
            instrumentFigure: res.figure,
            ambitoResolvesInRegister: res.matches > 0,
        });
    };

    // ⭐ THE CORRECTION, ASSERTED. Before the join, `Z24-P1` produced
    // `routing-token-unrecognised` — a statement about PRYZM's vocabulary. With the join it
    // produces `development-ambito-governs` — a statement about the LAW. Same parcel, and the
    // second is both truer and more useful.
    it('upgrades an unrecognised token to a NAMED DELEGATION once the register confirms it', () => {
        const row = ordenanza(cd).rows.find((r) => String(r.DS_NOM_AMB ?? '').startsWith('Z24-P1'))!;
        const rec = adapt(row);
        const dev = rec.refusals.find((x) => x.reason === 'development-ambito-governs');
        expect(dev).toBeDefined();
        expect(dev?.legallyGrounded).toBe(true);
        expect(rec.refusals.some((x) => x.reason === 'routing-token-unrecognised')).toBe(false);
    });

    it('still refuses a named row whose class the register does not publish', () => {
        const rows = ordenanza(cd).rows.filter((r) => r.DS_NOM_AMB != null);
        const anyUnpublished = rows.map(adapt)
            .some((rec) => rec.refusals.some((x) => x.reason === 'instrument-class-unpublished'));
        expect(anyUnpublished).toBe(true);
    });

    // ⛔ The one-directional rule: a resolution may only ADD a delegation, never remove one.
    it('never clears a parcel because the join failed', () => {
        const row = { ...ordenanza(cd).rows.find((r) => r.DS_NOM_AMB != null)!, DS_NOM_AMB: 'GHOST-99' };
        const rec = adaptSpacmRow(row, {
            verificationGateOpen: true, instrumentKeyMatches: 0, ambitoResolvesInRegister: false,
        });
        expect(rec.refusals.length).toBeGreaterThan(0);
        expect(rec.envelope).toBeNull();
    });
});
