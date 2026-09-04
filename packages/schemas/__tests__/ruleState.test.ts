// §RULE-STATE — the invariants that make the shared vocabulary safe for four country lanes.
//
// These are NOT shape smoke-tests. Each block pins a distinction that, when it collapsed, cost
// this repository a named defect: F1 vs F2 (NL/NSW open gap), gap vs law (L-553), empty vs failure
// (§CONTEXT-DATA-HONESTY / L-422/457/467/469), and "0% because nothing was asked" vs "0% because
// everything failed" (the null-denominator rule).

import { describe, expect, it } from 'vitest';

import {
    ANSWER_DETERMINACY_RECONCILIATION,
    EnvelopeParameterKeySchema,
    RULE_REACHABILITY_ORDER,
    RuleReachabilitySchema,
    RuleStateSchema,
    isClosableByBuilding,
    isF1PlanNoMechanism,
    isF2CorrectNull,
    isRuleAnswered,
    isRuleLegallyGrounded,
    isRuleRetryable,
    ruleReachabilityRank,
    ruleRecovery,
    type RuleState,
} from '../src/site/zoning/RuleState.js';

// The E1a `RuleSourceRef` (siteintel/provenance.ts), imported whole by `RuleState` — three
// required fields (country/authority/dataset), five that thin out honestly to null.
const ref = {
    country: 'FR',
    authority: 'IGN / GPU',
    dataset: 'zone_urba',
    plan_id: null,
    object_id: null,
    document: null,
    article: null,
    page: null,
};

const resolved: RuleState = {
    rule: 'C2',
    status: 'resolved',
    reachability: 'source-complete',
    value: 9,
    unit: 'm',
    datum: 'facade-rasant',
    provenance: 'published-structured',
    ref: { ...ref, dataset: 'SRU_XML', document: '56248_PLU_20251209', article: 'UC 4.2', page: 41 },
};
const qualitative: RuleState = {
    rule: 'C2',
    status: 'qualitative',
    reachability: 'interpretive',
    text: "La hauteur doit s'harmoniser avec celle des constructions voisines.",
    ref: { ...ref, dataset: 'prescription_surf', object_id: 'TYPEPSC=39/STYPEPSC=97', article: 'UC 4.2' },
};
const alternative: RuleState = {
    rule: 'C4',
    status: 'alternative',
    reachability: 'extractable',
    alternatives: ['40 % emprise', 'alignement obligatoire sur voie'],
    ref,
};
const f1: RuleState = {
    rule: 'C5',
    status: 'unrecovered',
    reachability: 'extractable',
    failure: 'missing-source',
    mechanism: 'absent',
    stoppedAt: 'REGLEMENT.pdf',
    ref,
};
const f2: RuleState = {
    rule: 'C2',
    status: 'refused',
    reachability: 'undeterminable',
    basis: 'rule-not-applicable',
    reason: 'Rail corridor — no private construction rule has a subject here.',
    ref,
};
const pau: RuleState = {
    rule: 'B5',
    status: 'refused',
    reachability: 'undeterminable',
    basis: 'requires-determination',
    reason: 'RNU commune: PAU membership is not published at parcel level.',
    ref,
};
const inaccessible: RuleState = {
    rule: 'C3',
    status: 'unrecovered',
    reachability: 'extractable',
    failure: 'inaccessible',
    mechanism: 'present',
    stoppedAt: 'URLFIC 404',
    ref,
};

describe('§RULE-STATE — the five reachability states', () => {
    it('the ladder is a permutation of the enum (no member unrankable, none duplicated)', () => {
        const members = RuleReachabilitySchema.options;
        expect([...RULE_REACHABILITY_ORDER].sort()).toEqual([...members].sort());
        expect(new Set(RULE_REACHABILITY_ORDER).size).toBe(members.length);
        for (const m of members) expect(ruleReachabilityRank(m)).toBeGreaterThanOrEqual(0);
    });

    it('source-complete outranks derivable outranks extractable outranks interpretive', () => {
        expect(ruleReachabilityRank('source-complete')).toBeLessThan(ruleReachabilityRank('derivable'));
        expect(ruleReachabilityRank('derivable')).toBeLessThan(ruleReachabilityRank('extractable'));
        expect(ruleReachabilityRank('extractable')).toBeLessThan(ruleReachabilityRank('interpretive'));
        expect(ruleReachabilityRank('interpretive')).toBeLessThan(
            ruleReachabilityRank('undeterminable'),
        );
    });

    it('ONLY undeterminable is un-closable — a roadmap is not a wall', () => {
        // The founder's §0 correction in one assertion: derivable/extractable/interpretive are all
        // work PRYZM has not done. Reporting them as unreachable is the over-pessimism corrected.
        expect(isClosableByBuilding('derivable')).toBe(true);
        expect(isClosableByBuilding('extractable')).toBe(true);
        expect(isClosableByBuilding('interpretive')).toBe(true);
        expect(isClosableByBuilding('undeterminable')).toBe(false);
        expect(isClosableByBuilding('source-complete')).toBe(false);
    });
});

describe('§RULE-STATE — the union parses the founder’s four JSON shapes', () => {
    it.each([
        ['resolved', resolved],
        ['qualitative', qualitative],
        ['alternative', alternative],
        ['refused', pau],
        ['unrecovered (the PRYZM-side fifth arm)', f1],
    ])('%s', (_name, state) => {
        expect(RuleStateSchema.parse(state)).toMatchObject({ status: state.status });
    });

    it('rejects an alternative with fewer than two alternatives (that is a resolved value)', () => {
        expect(
            RuleStateSchema.safeParse({ ...alternative, alternatives: ['only one'] }).success,
        ).toBe(false);
    });

    it('rejects an unknown rule key rather than opening a silent second bucket', () => {
        expect(RuleStateSchema.safeParse({ ...resolved, rule: 'C9' }).success).toBe(false);
    });

    it('keeps D1 in the vocabulary — COS is dead, surface de plancher is not', () => {
        // FR-FOUNDER-REACHABILITY-BOUNDARY §6: never discard a floor-area constraint because it
        // lost its old name. D1 is NULLABLE per jurisdiction, never absent from the key set.
        expect(EnvelopeParameterKeySchema.safeParse('D1').success).toBe(true);
    });
});

describe('§F1-VS-F2 — the split both the NL and NSW audits name as their open gap', () => {
    it('F1 is a gap and is NOT legally grounded', () => {
        expect(isF1PlanNoMechanism(f1)).toBe(true);
        expect(isF2CorrectNull(f1)).toBe(false);
        expect(isRuleLegallyGrounded(f1)).toBe(false);
    });

    it('F2 is a correct null and IS legally grounded', () => {
        expect(isF2CorrectNull(f2)).toBe(true);
        expect(isF1PlanNoMechanism(f2)).toBe(false);
        expect(isRuleLegallyGrounded(f2)).toBe(true);
    });

    it('no state is ever both — they are disjoint by construction', () => {
        for (const s of [resolved, qualitative, alternative, f1, f2, pau, inaccessible]) {
            expect(isF1PlanNoMechanism(s) && isF2CorrectNull(s)).toBe(false);
        }
    });

    it('unrecovered is the ONLY arm that is a statement about PRYZM', () => {
        for (const s of [resolved, qualitative, alternative, f2, pau]) {
            expect(isRuleLegallyGrounded(s)).toBe(true);
        }
        expect(isRuleLegallyGrounded(inaccessible)).toBe(false);
    });
});

describe('§RULE-STATE — answered, and the retry affordance', () => {
    it('qualitative and alternative are ANSWERS, not unknowns', () => {
        expect(isRuleAnswered(qualitative)).toBe(true);
        expect(isRuleAnswered(alternative)).toBe(true);
        expect(isRuleAnswered(resolved)).toBe(true);
        expect(isRuleAnswered(f1)).toBe(false);
        expect(isRuleAnswered(pau)).toBe(false);
    });

    it('exactly one combination is retryable — unrecovered + inaccessible', () => {
        expect(isRuleRetryable(inaccessible)).toBe(true);
        for (const s of [resolved, qualitative, alternative, f1, f2, pau]) {
            expect(isRuleRetryable(s)).toBe(false);
        }
    });

    it('a determination refusal NEVER earns a retry (it would loop for ever)', () => {
        expect(isRuleRetryable(pau)).toBe(false);
    });
});

describe('§RULE-STATE — the coverage reducer', () => {
    it('EXCLUDES F2 correct-nulls from the denominator', () => {
        const r = ruleRecovery([resolved, f1, f2]);
        expect(r.f2CorrectNull).toBe(1);
        expect(r.denominator).toBe(2); // 3 states − 1 correct null
        expect(r.parameterRecoveryRate).toBe(0.5);
    });

    it('merging F1 into F2 would change the answer — which is why they are separate', () => {
        const honest = ruleRecovery([resolved, f1]);
        const merged = ruleRecovery([resolved, { ...f1, ...f2 } as RuleState]);
        expect(honest.parameterRecoveryRate).toBe(0.5);
        expect(merged.parameterRecoveryRate).toBe(1); // 100% — the corrupted figure
        expect(honest.parameterRecoveryRate).not.toBe(merged.parameterRecoveryRate);
    });

    it('qualitative and alternative are NOT in the parameter numerator, but ARE honest answers', () => {
        const r = ruleRecovery([qualitative, alternative]);
        expect(r.parameterRecoveryRate).toBe(0);
        expect(r.honestAnswerRate).toBe(1);
    });

    it('a determination refusal counts as an honest answer, never as a recovered parameter', () => {
        const r = ruleRecovery([pau]);
        expect(r.requiresDetermination).toBe(1);
        expect(r.parameterRecoveryRate).toBe(0);
        expect(r.honestAnswerRate).toBe(1);
    });

    it('returns NULL, never 0, when nothing was asked', () => {
        expect(ruleRecovery([]).parameterRecoveryRate).toBeNull();
        expect(ruleRecovery([f2]).denominator).toBe(0);
        expect(ruleRecovery([f2]).parameterRecoveryRate).toBeNull();
        // ...and 0 when everything asked failed. Two different values, two different printings.
        expect(ruleRecovery([f1]).parameterRecoveryRate).toBe(0);
    });

    it('counts failures by the founder’s six labels and is order-independent', () => {
        const a = ruleRecovery([f1, inaccessible, resolved]);
        const b = ruleRecovery([resolved, inaccessible, f1]);
        expect(a).toEqual(b);
        expect(a.failures['missing-source']).toBe(1);
        expect(a.failures.inaccessible).toBe(1);
        expect(a.failures.pdf).toBe(0);
        expect(a.f1PlanNoMechanism).toBe(1);
        expect(a.unrecovered).toBe(2);
    });

    it('the counts always reconstruct the denominator (the arithmetic is auditable)', () => {
        const all = [resolved, qualitative, alternative, f1, f2, pau, inaccessible];
        const r = ruleRecovery(all);
        const sum =
            r.resolved +
            r.qualitative +
            r.alternative +
            r.unrecovered +
            r.noLimitStated +
            r.requiresDetermination;
        expect(sum).toBe(r.denominator);
        expect(r.denominator + r.f2CorrectNull).toBe(all.length);
    });
});

describe('§RECONCILIATION — one vocabulary, not three', () => {
    it('every A–F2 letter has exactly one seat, and F1 ≠ F2', () => {
        const keys = Object.keys(ANSWER_DETERMINACY_RECONCILIATION);
        expect(keys).toEqual(['A', 'B', 'C', 'D', 'E', 'F1', 'F2']);
        expect(ANSWER_DETERMINACY_RECONCILIATION.F1).not.toBe(
            ANSWER_DETERMINACY_RECONCILIATION.F2,
        );
    });
});
