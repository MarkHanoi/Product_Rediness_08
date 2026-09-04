// §NL-REGELING-IDENTITY — the precedence state travels WITH the answer, and B1 is one regeling.

import { describe, it, expect } from 'vitest';
import {
    parseNlAknIdentifier,
    stampNlPrecedence,
    nlPrecedenceRiskCount,
    nlRegelingToRuleState,
    NL_TIJDELIJK_DEEL_SERVING,
    NL_OVERRIDES_NOT_CHECKED_CAVEAT,
    type NlRegelingRef,
} from '../src/rulepacks/nlRegelingIdentity.js';
import type { RuleState } from '@pryzm/schemas';

const REF = {
    country: 'NL',
    authority: 'Gemeente Amsterdam',
    dataset: 'omgevingsplan (LVBB)',
    plan_id: null,
    object_id: null,
    document: null,
    article: null,
    page: null,
} as const;

const RESOLVED_HEIGHT: RuleState = {
    rule: 'C2',
    status: 'resolved',
    reachability: 'source-complete',
    value: 12,
    unit: 'm',
    datum: 'peil',
    provenance: 'pipeline-extracted',
    ref: REF,
};
const UNRECOVERED: RuleState = {
    rule: 'C6',
    status: 'unrecovered',
    reachability: 'extractable',
    failure: 'pdf',
    mechanism: 'present',
    stoppedAt: 'x',
    ref: REF,
};

describe('AKN identifiers — the founder’s citable object', () => {
    it('parses the gemeente omgevingsplan expression the founder cites', () => {
        const a = parseNlAknIdentifier('/akn/nl/act/gm0363/2024/omgevingsplan/nld@2024-01-01;1');
        expect(a).not.toBeNull();
        expect(a!.work).toBe('/akn/nl/act/gm0363/2024/omgevingsplan');
        expect(a!.expression).toBe('/akn/nl/act/gm0363/2024/omgevingsplan/nld@2024-01-01;1');
        expect(a!.gemeenteCode).toBe('0363');
        expect(a!.consolidatedAt).toBe('2024-01-01');
        expect(a!.versie).toBe('1');
    });
    it('parses a bare Work and reports no expression', () => {
        const a = parseNlAknIdentifier('/akn/nl/act/gm0599/2024/omgevingsplan');
        expect(a!.expression).toBeNull();
        expect(a!.taal).toBeNull();
    });
    it('refuses a ruimtelijkeplannen plan id — it is not a regeling identifier', () => {
        expect(parseNlAknIdentifier('NL.IMRO.0363.GA2102PBPGST-VG02')).toBeNull();
        expect(parseNlAknIdentifier('')).toBeNull();
        expect(parseNlAknIdentifier(null)).toBeNull();
    });
});

describe('precedence travels with the answer', () => {
    const NOT_CHECKED: NlRegelingRef = {
        readFrom: 'ruimtelijkeplannen-tijdelijk-deel',
        planId: 'NL.IMRO.0363.GA2102PBPGST-VG02',
        akn: null,
        precedence: 'overrides-not-checked',
        wijzigingsbesluitenConsulted: [],
    };
    const CHECKED: NlRegelingRef = {
        ...NOT_CHECKED,
        akn: parseNlAknIdentifier('/akn/nl/act/gm0363/2024/omgevingsplan/nld@2024-01-01;1'),
        precedence: 'overrides-checked-none-apply',
        wijzigingsbesluitenConsulted: ['/akn/nl/act/gm0363/2025/wijziging-1/nld@2025-03-01;1'],
    };

    it('a confident (resolved) answer with overrides not checked is a CORRECTNESS RISK', () => {
        const s = stampNlPrecedence(RESOLVED_HEIGHT, NOT_CHECKED);
        expect(s.correctnessRisk).toBe(true);
        expect(s.caveat).toBe(NL_OVERRIDES_NOT_CHECKED_CAVEAT);
        expect(s.caveat).toContain('as at the tijdelijk deel, overrides not checked');
    });
    it('an unrecovered answer carries no precedence risk — it already says we do not know', () => {
        expect(stampNlPrecedence(UNRECOVERED, NOT_CHECKED).correctnessRisk).toBe(false);
    });
    it('once overrides are checked the risk and the caveat clear', () => {
        const s = stampNlPrecedence(RESOLVED_HEIGHT, CHECKED);
        expect(s.correctnessRisk).toBe(false);
        expect(s.caveat).toBeNull();
    });
    it('counts the at-risk answers in a set', () => {
        expect(
            nlPrecedenceRiskCount([
                stampNlPrecedence(RESOLVED_HEIGHT, NOT_CHECKED),
                stampNlPrecedence(UNRECOVERED, NOT_CHECKED),
                stampNlPrecedence(RESOLVED_HEIGHT, CHECKED),
            ]),
        ).toBe(1);
    });

    it('B1 is NOT resolved on a plan id alone — the regeling version is unsettled', () => {
        const s = nlRegelingToRuleState(NOT_CHECKED, REF);
        expect(s.rule).toBe('B1');
        expect(s.status).toBe('unrecovered');
        if (s.status !== 'unrecovered') throw new Error('narrowing');
        expect(s.mechanism).toBe('present');
        expect(s.stoppedAt).toContain('NL.IMRO.0363.GA2102PBPGST-VG02');
    });
    it('B1 resolves to the AKN expression once the regeling is identified and precedence checked', () => {
        const s = nlRegelingToRuleState(CHECKED, REF);
        if (s.status !== 'resolved') throw new Error('narrowing');
        expect(s.value).toBe('/akn/nl/act/gm0363/2024/omgevingsplan/nld@2024-01-01;1');
    });
});

describe('the not-verified question has a documented answer', () => {
    it('records that the tijdelijk deel is NOT served through Ozon, with its citations', () => {
        // Round 3 refined round 2's 'not-served-through-ozon' from an INDEPENDENT source (the public
        // OpenAPI documents): the bruidsschat half IS an Ozon tijdelijk regelingdeel, the IMRO half is not.
        expect(NL_TIJDELIJK_DEEL_SERVING.verdict).toBe('split-bruidsschat-in-ozon-imro-on-ruimtelijkeplannen');
        expect(NL_TIJDELIJK_DEEL_SERVING.roundTwoVerdict).toContain('not-served-through-ozon');
        expect(NL_TIJDELIJK_DEEL_SERVING.evidence.length).toBeGreaterThanOrEqual(5);
        expect(NL_TIJDELIJK_DEEL_SERVING.consequence).toContain('do NOT collapse');
        expect(NL_TIJDELIJK_DEEL_SERVING.consequence).toContain('ONE credential');
    });
});
