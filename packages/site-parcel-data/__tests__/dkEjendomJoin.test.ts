// §DK-EJENDOM-JOIN — the BFE → ejendom join over keyless DAWA facts; the Copenhagen probe row is the fixture.

import { describe, it, expect } from 'vitest';
import {
    joinDkEjendom,
    resolveDkEjendomScopedBebygpct,
    dkEjendomBebygpctToRuleState,
    DK_DAWA_JORDSTYKKER_SOURCE,
} from '../src/rulepacks/dkEjendomJoin.js';

const REF = {
    country: 'DK',
    authority: 'Kommune (kommuneplanramme)',
    dataset: 'plandata.dk WFS + DAWA jordstykker',
    plan_id: 'test-ramme',
    object_id: null,
    document: null,
    article: 'bebygpct / bygberegnaf=2 (ejendom)',
    page: null,
} as const;

/** DAWA /jordstykker?x=12.5683&y=55.6761 (2026-09-04) — properties verbatim, trimmed. */
const CPH_7000Q = {
    ejerlavkode: 2000179,
    matrikelnr: '7000q',
    bfenummer: 100058855,
    registreretareal: 64981,
    vejareal: 64981,
    featureid: '100064063',
};

describe('the source is keyless and named', () => {
    it('records DAWA jordstykker as the keyless BFE route', () => {
        expect(DK_DAWA_JORDSTYKKER_SOURCE.keyless).toBe(true);
        expect(DK_DAWA_JORDSTYKKER_SOURCE.supports.some((s) => s.includes('bfenummer'))).toBe(true);
    });
});

describe('the join', () => {
    it('a single jordstykke on the BFE → the ejendom IS the parcel', () => {
        const j = joinDkEjendom([CPH_7000Q], 100058855);
        expect(j.kind).toBe('joined');
        if (j.kind !== 'joined') throw new Error('narrowing');
        expect(j.jordstykkeCount).toBe(1);
        expect(j.registreretArealM2).toBe(64981);
        expect(j.ejendomIsSingleParcel).toBe(true);
        expect(j.netAreaRule).toBe('not-encoded');
    });
    it('several jordstykker → areas SUMMED, vejareal carried, not applied', () => {
        const j = joinDkEjendom(
            [
                { bfenummer: 5, matrikelnr: '1a', ejerlavkode: 1, registreretareal: 400, vejareal: 0 },
                { bfenummer: 5, matrikelnr: '1b', ejerlavkode: 1, registreretareal: 600, vejareal: 50 },
            ],
            5,
        );
        if (j.kind !== 'joined') throw new Error('narrowing');
        expect(j.registreretArealM2).toBe(1000);
        expect(j.vejArealM2).toBe(50);
        expect(j.ejendomIsSingleParcel).toBe(false);
        expect(j.matrikler).toEqual(['1/1a', '1/1b']);
    });
    it('a foreign BFE in the input is a typed error, never silently dropped', () => {
        const j = joinDkEjendom([CPH_7000Q, { bfenummer: 999, registreretareal: 10 }], 100058855);
        expect(j.kind).toBe('mixed-bfe-input');
    });
    it('no jordstykker / missing area are typed, never a 0 m² ejendom', () => {
        expect(joinDkEjendom([], 7).kind).toBe('no-jordstykker-for-bfe');
        expect(joinDkEjendom([{ bfenummer: 7, matrikelnr: '2c', ejerlavkode: 3 }], 7).kind).toBe('area-missing');
    });
});

describe('an ejendom-scoped bebygpct — the D3 unlock', () => {
    it('single-parcel ejendom → per-parcel GFA, resolved D1 in m²', () => {
        const r = resolveDkEjendomScopedBebygpct({ bebygpct: 40, join: joinDkEjendom([CPH_7000Q], 100058855) });
        expect(r.kind).toBe('per-parcel-usable');
        if (r.kind !== 'per-parcel-usable') throw new Error('narrowing');
        expect(r.gfaM2).toBeCloseTo(25992.4, 3);
        const s = dkEjendomBebygpctToRuleState(r, REF);
        expect(s.rule).toBe('D1');
        if (s.status !== 'resolved') throw new Error('narrowing');
        expect(s.unit).toBe('m2');
        expect(s.reachability).toBe('derivable');
    });
    it('multi-parcel ejendom → a SHARED budget whose unit says so; never divided per parcel', () => {
        const join = joinDkEjendom(
            [
                { bfenummer: 5, matrikelnr: '1a', ejerlavkode: 1, registreretareal: 400 },
                { bfenummer: 5, matrikelnr: '1b', ejerlavkode: 1, registreretareal: 600 },
            ],
            5,
        );
        const r = resolveDkEjendomScopedBebygpct({ bebygpct: '50', join });
        expect(r.kind).toBe('ejendom-budget-shared');
        if (r.kind !== 'ejendom-budget-shared') throw new Error('narrowing');
        expect(r.ejendomGfaBudgetM2).toBe(500);
        const s = dkEjendomBebygpctToRuleState(r, REF);
        if (s.status !== 'resolved') throw new Error('narrowing');
        expect(s.unit).toContain('shared across 2 jordstykker');
        expect(s.unit).toContain('not a per-parcel figure');
    });
    it('an incomplete join is unrecovered/inaccessible (retryable), mechanism present', () => {
        const s = dkEjendomBebygpctToRuleState(
            resolveDkEjendomScopedBebygpct({ bebygpct: 40, join: joinDkEjendom([], 100058855) }),
            REF,
        );
        if (s.status !== 'unrecovered') throw new Error('narrowing');
        expect(s.failure).toBe('inaccessible');
        expect(s.mechanism).toBe('present');
    });
    it('a non-number pct is refused', () => {
        expect(resolveDkEjendomScopedBebygpct({ bebygpct: null, join: joinDkEjendom([CPH_7000Q], 100058855) }).kind).toBe('pct-invalid');
    });
});
