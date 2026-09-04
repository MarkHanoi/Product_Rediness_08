// §NL-VERGUNNINGVRIJ — the knip model: national floor + heritage exclusion + municipal overlay, no table.

import { describe, it, expect } from 'vitest';
import {
    resolveNlVergunningvrijOpa,
    nlVergunningvrijToRuleState,
    NL_VERGUNNINGVRIJ_REGIME,
} from '../src/rulepacks/nlVergunningvrij.js';

const REF = {
    country: 'NL',
    authority: 'Rijk (Bbl) + Gemeente (omgevingsplan)',
    dataset: 'Bbl / omgevingsplan',
    plan_id: null,
    object_id: null,
    document: null,
    article: 'Bbl 2.29–2.30',
    page: null,
} as const;

const NO_HERITAGE = { monument: 'none', rijksbeschermdGezichtFunctieaanduiding: false } as const;

describe('the regime is the current one, and says so', () => {
    it('names Bijlage II Bor as REPEALED and the citation status as not re-verified', () => {
        expect(NL_VERGUNNINGVRIJ_REGIME.repealed).toContain('lapsed 2024-01-01');
        expect(NL_VERGUNNINGVRIJ_REGIME.citationStatus).toBe('founder-sourced-not-re-verified');
        expect(NL_VERGUNNINGVRIJ_REGIME.notBuilt.length).toBeGreaterThan(0);
    });
    it('never emits a dimension anywhere in its output', () => {
        const outs = [
            resolveNlVergunningvrijOpa({ activity: 'art-2.29-listed-case', heritage: NO_HERITAGE, municipalOverlay: { read: false } }),
            resolveNlVergunningvrijOpa({ activity: 'bijbehorend-bouwwerk', heritage: NO_HERITAGE, municipalOverlay: { read: false } }),
        ];
        for (const o of outs) expect(JSON.stringify(o)).not.toMatch(/\d+\s?m[²³]?\b/);
    });
});

describe('bijbehorende bouwwerken — the GEMEENTE determines, there is no national answer', () => {
    it('overlay not read → municipal-determination-required → unrecovered/semantic/unknown', () => {
        const o = resolveNlVergunningvrijOpa({ activity: 'bijbehorend-bouwwerk', heritage: NO_HERITAGE, municipalOverlay: { read: false } });
        expect(o.kind).toBe('municipal-determination-required');
        const s = nlVergunningvrijToRuleState(o, REF);
        expect(s.rule).toBe('D3');
        if (s.status !== 'unrecovered') throw new Error('narrowing');
        expect(s.failure).toBe('semantic');
        expect(s.mechanism).toBe('unknown');
    });
    it('overlay read → the gemeente’s verdict passes through with its citation', () => {
        const o = resolveNlVergunningvrijOpa({
            activity: 'bijbehorend-bouwwerk',
            heritage: NO_HERITAGE,
            municipalOverlay: { read: true, bijbehorendeBouwwerken: 'extended', citation: 'omgevingsplan art. 22.36a' },
        });
        expect(o.kind).toBe('municipal-overlay-read');
        if (o.kind !== 'municipal-overlay-read') throw new Error('narrowing');
        expect(o.verdict).toBe('extended');
        expect(o.citation).toBe('omgevingsplan art. 22.36a');
        expect(nlVergunningvrijToRuleState(o, REF).status).toBe('qualitative');
    });
});

describe('the art. 2.30 exclusion is checked FIRST and on a functieaanduiding, not a heritage dataset', () => {
    it('a monument disapplies the floor even for a listed case', () => {
        const o = resolveNlVergunningvrijOpa({
            activity: 'art-2.29-listed-case',
            heritage: { monument: 'rijks', rijksbeschermdGezichtFunctieaanduiding: false },
            municipalOverlay: { read: false },
        });
        expect(o.kind).toBe('excluded-by-heritage');
        const s = nlVergunningvrijToRuleState(o, REF);
        if (s.status !== 'refused') throw new Error('narrowing');
        expect(s.basis).toBe('rule-not-applicable');
    });
    it('the functieaanduiding rijksbeschermd gezicht IN THE OMGEVINGSPLAN triggers lid 3', () => {
        const o = resolveNlVergunningvrijOpa({
            activity: 'bijbehorend-bouwwerk',
            heritage: { monument: 'none', rijksbeschermdGezichtFunctieaanduiding: true },
            municipalOverlay: { read: true, bijbehorendeBouwwerken: 'extended', citation: null },
        });
        expect(o.kind).toBe('excluded-by-heritage');
        if (o.kind !== 'excluded-by-heritage') throw new Error('narrowing');
        expect(o.trigger).toBe('rijksbeschermd-gezicht-functieaanduiding');
    });
    it('an UNKNOWN trigger (IMOW not queried) blocks the floor — retryable, mechanism present', () => {
        const o = resolveNlVergunningvrijOpa({
            activity: 'art-2.29-listed-case',
            heritage: { monument: 'none', rijksbeschermdGezichtFunctieaanduiding: null },
            municipalOverlay: { read: false },
        });
        expect(o.kind).toBe('heritage-status-unknown');
        const s = nlVergunningvrijToRuleState(o, REF);
        if (s.status !== 'unrecovered') throw new Error('narrowing');
        expect(s.failure).toBe('inaccessible');
        expect(s.mechanism).toBe('present');
    });
    it('a listed case with no exclusion → the national floor applies, as a SENTENCE not a number', () => {
        const o = resolveNlVergunningvrijOpa({ activity: 'art-2.29-listed-case', heritage: NO_HERITAGE, municipalOverlay: { read: false } });
        expect(o.kind).toBe('national-floor-applies');
        const s = nlVergunningvrijToRuleState(o, REF);
        expect(s.status).toBe('qualitative');
    });
});
