// §DK-ZONESTATUS — composite codes 4 and 7 are decomposed, never flattened (RULE 8).

import { describe, it, expect } from 'vitest';
import {
    DK_ZONESTATUS_CODELIST,
    decomposeDkZoneStatus,
    isCompositeDkZoneStatus,
    resolveDkParcelZone,
    dkZoneToRuleState,
    readDkZonekortZone,
} from '../src/rulepacks/dkZoneStatus.js';

const REF = {
    country: 'DK',
    authority: 'Kommune (lokalplan)',
    dataset: 'plandata.dk WFS',
    plan_id: 'test-plan',
    object_id: null,
    document: null,
    article: 'zonestatus',
    page: null,
} as const;

describe('the codelist is the state’s, verbatim (live 2026-09-04)', () => {
    it('has exactly the 7 codes Plandata serves, with their labels', () => {
        expect(DK_ZONESTATUS_CODELIST.map((r) => r.code)).toEqual([1, 2, 3, 4, 5, 6, 7]);
        expect(DK_ZONESTATUS_CODELIST[3]!.text).toBe('Byzone og landzone');
        expect(DK_ZONESTATUS_CODELIST[6]!.text).toBe('Byzone, landzone og sommerhusområde');
    });
    it('decomposes 4 and 7 (the codes Phase 0 observed) into their members', () => {
        expect(decomposeDkZoneStatus(4)).toEqual(['byzone', 'landzone']);
        expect(decomposeDkZoneStatus('7')).toEqual(['byzone', 'landzone', 'sommerhusomraade']);
        expect(isCompositeDkZoneStatus(4)).toBe(true);
        expect(isCompositeDkZoneStatus(1)).toBe(false);
    });
    it('an unknown code is null — never an empty list, never a guess', () => {
        expect(decomposeDkZoneStatus(9)).toBeNull();
        expect(decomposeDkZoneStatus(null)).toBeNull();
        expect(decomposeDkZoneStatus('x')).toBeNull();
    });
});

describe('a composite plan code is never flattened to byzone', () => {
    it('composite + no zonekort → alternative, members named, none picked', () => {
        const r = resolveDkParcelZone({ planZoneStatus: 4 });
        expect(r.kind).toBe('composite-unresolved');
        const s = dkZoneToRuleState(r, REF);
        expect(s.rule).toBe('B2');
        expect(s.status).toBe('alternative');
        if (s.status !== 'alternative') throw new Error('narrowing');
        expect(s.alternatives).toHaveLength(2);
        expect(JSON.stringify(s)).not.toContain('"value"');
    });
    it('composite + zonekort naming a member → resolved to THAT zone', () => {
        const r = resolveDkParcelZone({ planZoneStatus: 4, zonekortAtPoint: 'Landzone' });
        expect(r.kind).toBe('composite-resolved-by-zonekort');
        const s = dkZoneToRuleState(r, REF);
        if (s.status !== 'resolved') throw new Error('narrowing');
        expect(s.value).toBe('landzone');
    });
    it('composite + zonekort naming a NON-member → a conflict, unrecovered/semantic, not a choice', () => {
        const r = resolveDkParcelZone({ planZoneStatus: 4, zonekortAtPoint: 3 });
        expect(r.kind).toBe('zonekort-disagrees');
        const s = dkZoneToRuleState(r, REF);
        if (s.status !== 'unrecovered') throw new Error('narrowing');
        expect(s.failure).toBe('semantic');
        expect(s.mechanism).toBe('present');
    });
    it('a single code resolves directly; a zonekort composite value is not a single zone', () => {
        expect(resolveDkParcelZone({ planZoneStatus: '2' }).kind).toBe('single');
        expect(readDkZonekortZone(7)).toBeNull();
        expect(readDkZonekortZone('sommerhusområde')).toBe('sommerhusomraade');
    });
    it('an unknown code is unrecovered with the codelist named', () => {
        const s = dkZoneToRuleState(resolveDkParcelZone({ planZoneStatus: 42 }), REF);
        if (s.status !== 'unrecovered') throw new Error('narrowing');
        expect(s.stoppedAt).toContain('codelist_zonestatus_v');
    });
});
