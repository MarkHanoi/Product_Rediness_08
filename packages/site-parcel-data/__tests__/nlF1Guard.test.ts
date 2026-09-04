// §NL-F1-GUARD — `absent` (F1) may not pass until the bruidsschat and the wijzigingsbesluiten were read.

import { describe, it, expect } from 'vitest';
import {
    nlGuardF1,
    nlGuardF1All,
    nlUncheckedLayers,
    nlF1Verdict,
    NL_BRUIDSSCHAT_BUILDING_RULE_ARTICLES,
} from '../src/rulepacks/nlF1Guard.js';
import type { RuleState } from '@pryzm/schemas';

const REF = {
    country: 'NL',
    authority: 'Gemeente (bestemmingsplan)',
    dataset: 'ruimtelijkeplannen/IMRO2012',
    plan_id: 'NL.IMRO.TEST.WONEN-VG01',
    object_id: null,
    document: null,
    article: 'Artikel 12 Wonen',
    page: null,
} as const;

/** The Phase 0 F1 shape: plain "Wonen", no bouwvlak, no height — read from the tijdelijk deel only. */
const F1_HEIGHT: RuleState = {
    rule: 'C2',
    status: 'unrecovered',
    reachability: 'extractable',
    failure: 'missing-source',
    mechanism: 'absent',
    stoppedAt: 'bestemming "Wonen": no bouwvlak, no maatvoering, no height rule in the regels',
    ref: REF,
};

describe('F1 is withheld until all three layers were read', () => {
    it('tijdelijk deel alone → mechanism downgraded to UNKNOWN, layers named', () => {
        const g = nlGuardF1(F1_HEIGHT, { tijdelijkDeelRead: true, bruidsschatChecked: false, wijzigingsbesluitenChecked: false });
        if (g.status !== 'unrecovered') throw new Error('narrowing');
        expect(g.mechanism).toBe('unknown');
        expect(g.failure).toBe('missing-source'); // the reader's own label survives
        expect(g.stoppedAt).toContain('bruidsschat');
        expect(g.stoppedAt).toContain('wijzigingsbesluiten');
        expect(g.stoppedAt).toContain('no bouwvlak'); // the reader's note is kept, not replaced
    });
    it('bruidsschat read but wijzigingsbesluiten not → still withheld', () => {
        const g = nlGuardF1(F1_HEIGHT, { tijdelijkDeelRead: true, bruidsschatChecked: true, wijzigingsbesluitenChecked: false });
        if (g.status !== 'unrecovered') throw new Error('narrowing');
        expect(g.mechanism).toBe('unknown');
        expect(nlUncheckedLayers({ tijdelijkDeelRead: true, bruidsschatChecked: true, wijzigingsbesluitenChecked: false })).toEqual([
            'wijzigingsbesluiten',
        ]);
    });
    it('all three read → F1 passes through UNCHANGED', () => {
        const checks = { tijdelijkDeelRead: true, bruidsschatChecked: true, wijzigingsbesluitenChecked: true };
        expect(nlGuardF1(F1_HEIGHT, checks)).toBe(F1_HEIGHT);
        expect(nlF1Verdict(checks)).toBe('f1-assertable');
    });
    it('non-F1 states pass through untouched, whatever the checks', () => {
        const resolved: RuleState = {
            rule: 'C2',
            status: 'resolved',
            reachability: 'source-complete',
            value: 9,
            unit: 'm',
            datum: 'peil',
            provenance: 'pipeline-extracted',
            ref: REF,
        };
        const present: RuleState = { ...F1_HEIGHT, mechanism: 'present' };
        const none = { tijdelijkDeelRead: false, bruidsschatChecked: false, wijzigingsbesluitenChecked: false };
        expect(nlGuardF1(resolved, none)).toBe(resolved);
        expect(nlGuardF1(present, none)).toBe(present);
    });
    it('guards a whole set order-preservingly', () => {
        const out = nlGuardF1All([F1_HEIGHT, { ...F1_HEIGHT, rule: 'C4' }], {
            tijdelijkDeelRead: true,
            bruidsschatChecked: false,
            wijzigingsbesluitenChecked: true,
        });
        expect(out.map((s) => s.rule)).toEqual(['C2', 'C4']);
        for (const s of out) {
            if (s.status !== 'unrecovered') throw new Error('narrowing');
            expect(s.mechanism).toBe('unknown');
        }
    });
    it('carries the founder’s bruidsschat articles with an honest citation status', () => {
        expect(NL_BRUIDSSCHAT_BUILDING_RULE_ARTICLES.articles).toEqual(['22.27', '22.36']);
        expect(NL_BRUIDSSCHAT_BUILDING_RULE_ARTICLES.citationStatus).toBe('founder-sourced-not-re-verified');
    });
});
