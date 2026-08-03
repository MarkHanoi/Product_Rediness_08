// ⭐ THE PROVEN PARCEL, PINNED.
//
// *"One drawn envelope with provenance beats any coverage figure."* This test is that envelope,
// asserted end to end against the live capture in `out/05-one-parcel.json`:
//
//   4228504VK2742N — CL JUAN DE VILLANUEVA 10, BOADILLA DEL MONTE (MADRID)
//
// ⚠ **THIS IS A LABELLED FALLBACK FROM THE CAPITAL.** Madrid capital publishes no height, depth or
// setback at any granularity — 24,718 municipal fields swept, zero hits — so no solid can be drawn
// there without inventing a storey height. Boadilla was the pre-declared fallback: `NM_ALTURA`
// 79.42 % (the regional MEDIAN), override 9.0 %, n=1,958 (the largest of the low-override set).

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { adaptSpacmRow, type SpacmOrdenanzaRow } from '../../../packages/site-parcel-data/src/rulepacks/esMadridSpacmAdapter.js';
import { buildAmbitoIndex, resolveAmbito, type AmbitoRow } from '../../../packages/site-parcel-data/src/rulepacks/esMadridSpacmAmbitoJoin.js';
import { isDrawable } from '../../../packages/site-parcel-data/src/rulepacks/esMadridSpacmSchema.js';

const HERE = join(__dirname, '..');

const captured = JSON.parse(readFileSync(join(HERE, 'out', '05-one-parcel.json'), 'utf8')) as {
    fallbackFromCapital: boolean;
    fallbackReason: string;
    attempts: Array<{ name: string; catastro: { ok: boolean }; ordinance: SpacmOrdenanzaRow | null }>;
    proof: null | {
        lon: number; lat: number;
        catastro: { refcat: string; address: string };
        ordinance: SpacmOrdenanzaRow;
    };
};

const ambitos = JSON.parse(readFileSync(join(HERE, 'fixtures', 'ambitos.json'), 'utf8')) as {
    layers: Record<string, Record<string, { rows: AmbitoRow[] }>>;
};
const index = buildAmbitoIndex([
    { name: 'VPLA_V_AMBITO', rows: ambitos.layers.VPLA_V_AMBITO['022'].rows },
    { name: 'VPLA_V_AMBITO_MODIF', rows: ambitos.layers.VPLA_V_AMBITO_MODIF['022'].rows },
]);

describe('⭐ ONE PARCEL, END TO END', () => {
    it('a parcel WAS proven — the capture is not an empty record', () => {
        expect(captured.proof).not.toBeNull();
    });

    // ⚠ The fallback is asserted, not merely commented. A future reader must not be able to mistake
    // a Boadilla proof for a capital proof.
    it('records that this is a labelled fallback from the capital, and why', () => {
        expect(captured.fallbackFromCapital).toBe(true);
        expect(captured.fallbackReason).toMatch(/24,718/);
        expect(captured.fallbackReason).toMatch(/no solid can be drawn/i);
    });

    // The first five hand-picked points landed on SERVICIOS URBANOS, RED VIARIA and three rustic
    // parcels. Keeping them in the record is what makes the method auditable rather than curated.
    it('keeps the failed hand-picked attempts in the record', () => {
        const misses = captured.attempts.filter((a) => a.ordinance === null
            || !['RESIDENCIAL UNIFAMILIAR'].includes(String(a.ordinance.DS_NOMB_ORD)));
        expect(misses.length).toBeGreaterThan(0);
    });

    const proof = captured.proof!;
    const adapt = (gateOpen: boolean) => {
        const name = proof.ordinance.DS_NOM_AMB == null ? null : String(proof.ordinance.DS_NOM_AMB);
        const res = resolveAmbito(index, '022', name);
        return adaptSpacmRow(proof.ordinance, {
            parcel: { id: proof.catastro.refcat, cadastralRef: proof.catastro.refcat, area_m2: null },
            instrumentKeyMatches: res.matches,
            instrumentFigure: res.figure,
            ambitoResolvesInRegister: res.matches > 0,
            verificationGateOpen: gateOpen,
        });
    };

    it('identifies the parcel from Catastro, by identifier and not by a pin guess', () => {
        expect(proof.catastro.refcat).toBe('4228504VK2742N');
        expect(proof.catastro.address).toContain('BOADILLA DEL MONTE');
        // 14 characters: pc1 (7) + pc2 (7). A shorter string is a truncated parse, not a refcat.
        expect(proof.catastro.refcat).toHaveLength(14);
    });

    it('routes to the BASE general plan — no development instrument governs this parcel', () => {
        const rec = adapt(true);
        expect(proof.ordinance.DS_NOM_AMB).toBeNull();
        expect(rec.refusals.some((r) => r.reason === 'development-ambito-governs')).toBe(false);
        expect(rec.zoningCode.soilClass).toBe('Suelo Urbano Consolidado');
    });

    it('classifies the grammar as SETBACK from a complete published triple plus a height', () => {
        const rec = adapt(true);
        expect(rec.grammar).toBe('setback');
        expect(rec.rules.height_m.value).toBe(7);
        expect(rec.rules.storeys.value).toBe(2);
        expect(rec.rules.setbackFront_m.value).toBe(3);
        expect(rec.rules.setbackSide_m.value).toBe(3);
        expect(rec.rules.setbackRear_m.value).toBe(3);
        // 7 m over 2 storeys = 3.5 m/storey — inside the plausible band, so no contradiction.
        expect(rec.contradictions).toEqual([]);
    });

    it('emits a SHIPPED GeometricRule kind — no Madrid-specific solver is introduced', () => {
        expect(adapt(true).envelope).toEqual({ kind: 'setback', front_m: 3, side_m: 3, rear_m: 3 });
    });

    it('reports the unpublished dimensions as UNKNOWN with a reason, never as 0', () => {
        const rec = adapt(true);
        for (const p of [rec.rules.depth_m, rec.rules.minFrontage_m]) {
            expect(p.value).toBeNull();
            expect(p.provenance).toBe('unknown');
            expect(p.note).toBeTruthy();
        }
    });

    // ⚠ The FAR came from `NM_C_ED_MAZ` (per MANZANA) because `NM_C_ED_ORD` (per ORDINANCE) is
    // null. The granularity difference is real (C58 §1.11) and the `sourceField` is what carries it.
    it('records WHICH FAR column it read, because the two have different granularity', () => {
        const far = adapt(true).rules.plotRatioFAR;
        expect(far.value).toBe(0.7);
        expect(far.sourceField).toBe('NM_C_ED_MAZ');
    });

    it('cites source, dataset, record, document, statute, publication date and fields', () => {
        const p = adapt(true).provenance;
        expect(p.source).toBe('idem.comunidad.madrid/geoserver3/wfs');
        expect(p.dataset).toBe('sitcm:VPLA_V_ORDENANZA');
        expect(p.recordId).toBe(253995);
        expect(p.document).toBe('PLAN GENERAL / MATRIZ');
        expect(p.statute).toBe('CM Ley 9/2001, E Ley 6/1998');
        expect(p.published).toBe('2015-10-28');
        expect(p.fields.length).toBeGreaterThan(15);
    });

    it('carries the parcel identity onto the record', () => {
        const rec = adapt(true);
        expect(rec.parcel.cadastralRef).toBe('4228504VK2742N');
        expect(rec.municipality.ine5).toBe('28022');
    });

    it('is an OPEN TOP with three stated missing constraints (ADR-0293)', () => {
        expect(adapt(true).missingConstraints).toHaveLength(3);
    });

    // ⛔ THE LAST WORD. The geometry half works; nothing publishes.
    it('is DRAWABLE with the gate open and REFUSED with the gate closed', () => {
        expect(isDrawable(adapt(true))).toBe(true);

        const shipped = adapt(false);
        expect(isDrawable(shipped)).toBe(false);
        expect(shipped.envelope).toBeNull();
        expect(shipped.refusals.map((r) => r.reason)).toEqual(['verification-gate-closed']);
    });
});
