// §NL-APPLICABILITY — deep audit Gap 1: an intersection is not an applicability.

import { describe, it, expect } from 'vitest';
import {
    NL_APPLICABILITY_AXES,
    NL_APPLICABILITY_SOURCES,
    nlApplicabilityBinds,
    nlApplicabilityToRuleState,
    resolveNlApplicability,
    type NlApplicabilityInputs,
} from '../src/rulepacks/nlApplicability.js';

const REF = {
    country: 'NL',
    authority: 'omgevingsplan',
    dataset: 'DSO Toepasbaar Opvragen v7',
    plan_id: null,
    object_id: null,
    document: null,
    article: null,
    page: null,
} as const;

const ALL_SATISFIED: NlApplicabilityInputs = Object.fromEntries(
    NL_APPLICABILITY_AXES.map((a) => [a, { verdict: 'satisfied' as const, why: `${a} checked` }]),
);

describe('the seven axes are the founder’s seven, in his order', () => {
    it('is a closed set of exactly seven', () => {
        expect(NL_APPLICABILITY_AXES).toEqual(['location', 'activity', 'subject', 'rule-scope', 'authority', 'effective-date', 'exceptions']);
    });
});

describe('⛔ an intersection alone can NEVER produce `applies`', () => {
    it('a polygon hit and nothing else is UNDETERMINED, and says so in those words', () => {
        const r = resolveNlApplicability({ location: { verdict: 'satisfied', why: 'the parcel is inside the rule geometry' } });
        expect(r.verdict).toBe('undetermined');
        expect(r.intersectionOnly).toBe(true);
        expect(r.unevaluated).toEqual(['activity', 'subject', 'rule-scope', 'authority', 'effective-date', 'exceptions']);
        expect(r.statement).toContain('INTERSECTION ONLY');
        expect(r.statement).toContain('A polygon hit is not an applicability');
    });

    it('and it does NOT bind an envelope parameter', () => {
        const r = resolveNlApplicability({ location: { verdict: 'satisfied', why: 'hit' } });
        expect(nlApplicabilityBinds(r)).toBe(false);
    });

    it('six of seven satisfied is still UNDETERMINED — there is no “nearly applies”', () => {
        const six = { ...ALL_SATISFIED };
        delete six.exceptions;
        const r = resolveNlApplicability(six);
        expect(r.verdict).toBe('undetermined');
        expect(r.unevaluated).toEqual(['exceptions']);
        expect(r.intersectionOnly).toBe(false);
        expect(nlApplicabilityBinds(r)).toBe(false);
    });

    it('an OMITTED axis is not-evaluated — omission is never assent', () => {
        const r = resolveNlApplicability({});
        expect(r.unevaluated.length).toBe(7);
        expect(r.findings.every((f) => f.verdict === 'not-evaluated')).toBe(true);
        expect(r.findings.every((f) => f.why.length > 0)).toBe(true);
    });
});

describe('one refuting axis settles it — the short-circuit that IS sound', () => {
    it('a rule addressed to another subject does not reach this parcel, however well the polygons overlap', () => {
        const r = resolveNlApplicability({
            location: { verdict: 'satisfied', why: 'the parcel is inside the rule geometry' },
            subject: { verdict: 'not-satisfied', why: 'the article addresses agrarische bedrijfsgebouwen; the parcel is bestemming Wonen' },
        });
        expect(r.verdict).toBe('does-not-apply');
        expect(r.refutedBy).toEqual(['subject']);
        expect(r.unevaluated).toEqual([]); // a refutation is complete; the rest need not be evaluated
        expect(r.statement).toContain('agrarische bedrijfsgebouwen');
    });

    it('a rule not yet in force is refuted on the date axis', () => {
        const r = resolveNlApplicability({
            ...ALL_SATISFIED,
            'effective-date': { verdict: 'not-satisfied', why: 'the wijzigingsbesluit takes effect 2027-01-01; the question is asked for 2026-09-04' },
        });
        expect(r.verdict).toBe('does-not-apply');
        expect(r.refutedBy).toEqual(['effective-date']);
    });

    it('several refutations are all reported, not just the first', () => {
        const r = resolveNlApplicability({
            location: { verdict: 'not-satisfied', why: 'outside' },
            authority: { verdict: 'not-satisfied', why: 'a waterschap rule on a gemeente matter' },
        });
        expect(r.refutedBy).toEqual(['location', 'authority']);
    });
});

describe('all seven satisfied — the only binding state', () => {
    it('applies, and binds', () => {
        const r = resolveNlApplicability(ALL_SATISFIED);
        expect(r.verdict).toBe('applies');
        expect(r.refutedBy).toEqual([]);
        expect(r.unevaluated).toEqual([]);
        expect(nlApplicabilityBinds(r)).toBe(true);
    });
});

describe('the RuleState projection keeps F1 and F2 apart', () => {
    it('does-not-apply is REFUSED / rule-not-applicable — F2, a correct absence, not our gap', () => {
        const s = nlApplicabilityToRuleState(
            resolveNlApplicability({ subject: { verdict: 'not-satisfied', why: 'addressed to another use' } }),
            'C2',
            REF,
        );
        expect(s.status).toBe('refused');
        expect(s.status === 'refused' && s.basis).toBe('rule-not-applicable');
    });

    it('undetermined is UNRECOVERED / semantic with the missing axes named — OUR gap', () => {
        const s = nlApplicabilityToRuleState(resolveNlApplicability({ location: { verdict: 'satisfied', why: 'hit' } }), 'C2', REF);
        expect(s.status).toBe('unrecovered');
        if (s.status !== 'unrecovered') return;
        expect(s.failure).toBe('semantic');
        expect(s.mechanism).toBe('present'); // the rule EXISTS; we did not resolve whether it reaches here
        expect(s.stoppedAt).toContain('INTERSECTION ONLY');
        expect(s.stoppedAt).toContain('exceptions');
    });

    it('applies projects to resolved / derivable', () => {
        const s = nlApplicabilityToRuleState(resolveNlApplicability(ALL_SATISFIED), 'C2', REF);
        expect(s.status === 'resolved' && s.value).toBe('applies');
        expect(s.reachability).toBe('derivable');
    });
});

describe('the source map records what feeds each axis — and that none is reachable today', () => {
    it('every axis has a named source', () => {
        for (const a of NL_APPLICABILITY_AXES) {
            expect(NL_APPLICABILITY_SOURCES.axes[a].length).toBeGreaterThan(10);
        }
    });

    it('⛔ the DSO data plane is 401 and no key is held — recorded, never assumed away', () => {
        expect(NL_APPLICABILITY_SOURCES.dataPlaneAnonymous).toBe(401);
        expect(NL_APPLICABILITY_SOURCES.keyHeld).toBe(false);
        expect(NL_APPLICABILITY_SOURCES.verifiedBy).toContain('no key held');
    });
});
