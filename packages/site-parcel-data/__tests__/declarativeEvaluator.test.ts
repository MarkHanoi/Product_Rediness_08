// LANE E1bc — evaluator unit arms: R3 temporal (legal vs ingestion is a
// THREE-way distinction), R1 rank precedence engine-side, the R1 basis
// companion contract, the tier-6 envelope guard, the fact vocabulary, and
// §DEC-2 inheritance. Fixtures, not Barcelona — the Barcelona arms live in
// declarativeGoldenParity.test.ts.

import { describe, it, expect } from 'vitest';
import { DeclarativeRulePackDocumentSchema } from '@pryzm/schemas';
import type { DeclarativeRulePackDocument, JsonValue } from '@pryzm/schemas';
import {
    assertKnownFacts,
    collectConditionVars,
    envelopeSolidHeightCap,
    evaluateZoneParameter,
    walkEvidenceChain,
    type DeclarativeInstrumentContext,
} from '../src/index.js';

const CTX: DeclarativeInstrumentContext = {
    instrument: { id: 'FX-Plan 1', kind: 'binding-plan' },
    legalStatus: 'binding',
    legalStatusSource: 'metadata',
    citation: 'fixture instrument context',
};

interface FxRuleSpec {
    readonly id: string;
    readonly value: number | null;
    readonly parameter?: string;
    readonly validityBasis?: 'legal' | 'ingestion';
    readonly valid_from?: string;
    readonly valid_to?: string | null;
    readonly rank?: { scheme: string; level: number } | null;
    readonly basisRef?: string;
    readonly rase?: string;
    readonly tier?: 1 | 6;
    readonly condition?: JsonValue;
}

function fxRule(s: FxRuleSpec): Record<string, unknown> {
    return {
        id: s.id,
        body: null,
        applicability: {
            basis: [{ kind: 'plan', ref: s.basisRef ?? 'plan-fx-1' }],
            geometry: null,
            useScope: [],
            rank: s.rank ?? null,
            condition: s.condition ?? null,
        },
        provenance: {
            parameter: s.parameter ?? 'maxHeight_m',
            value: s.value,
            unit: 'm',
            source: {
                country: 'DK',
                authority: 'FX Authority',
                dataset: 'fx-dataset',
                plan_id: 'FX-Plan 1',
                object_id: null,
                document: 'fx-doc.pdf',
                article: '§ 7',
                page: null,
            },
            derivation: 'DIRECT',
            confidence: { tier: s.tier ?? 1 },
            normativeForce: null,
            validityBasis: s.validityBasis ?? 'legal',
            valid_from: s.valid_from ?? '2005-01-01',
            valid_to: s.valid_to ?? null,
        },
        ...(s.rase ? { rase: { requirement: s.rase } } : {}),
    };
}

function fxDoc(
    rules: readonly Record<string, unknown>[],
    extraZones: readonly Record<string, unknown>[] = [],
): DeclarativeRulePackDocument {
    return DeclarativeRulePackDocumentSchema.parse({
        formatVersion: 1,
        plan: {
            id: 'plan-fx-1',
            kind: 'lokalplan',
            status: 'vedtaget',
            adoptedDate: '2005-01-01',
            inForceFrom: '2005-01-01',
            inForceTo: null,
            documents: ['doc-fx-1'],
            geometryRef: null,
            source: 'src-fx-1',
            version: null,
        },
        packs: [
            {
                meta: {
                    jurisdictionId: 'fx-test',
                    displayName: 'Fixture',
                    source: 'manual',
                    crs: 'EPSG:25832',
                    lastReviewed: '2026-01-01',
                    defaultConfidence: 'estimated-ruleset',
                },
                zones: [
                    {
                        code: 'FX1',
                        label: 'Fixture zone',
                        permittedUse: ['residential'],
                        fieldProvenance: {},
                        ordinanceRef: null,
                        inheritsFromZoneCode: null,
                        rules,
                    },
                    ...extraZones,
                ],
            },
        ],
        constructions: [],
        notes: [],
    });
}

describe('R3 — legal vs ingestion validity is a THREE-way temporal distinction (gate §B.3)', () => {
    const doc = fxDoc([
        fxRule({ id: 'r-legal', value: 20, valid_from: '2005-01-01', rase: 'fixture clause: max height 20 m' }),
        fxRule({ id: 'r-ingested', value: 18, validityBasis: 'ingestion', valid_from: '2026-01-15' }),
    ]);

    it('POSITIVE: a legal-as-of query is answered by the LEGAL rule, and the ingestion rule is surfaced NOT-ANSWERABLE beside it — never silently dropped', () => {
        const ev = evaluateZoneParameter(doc, 'FX1', 'maxHeight_m', { basis: 'legal-as-of', date: '2010-06-01' }, CTX);
        expect(ev.outcome.kind).toBe('attributed');
        if (ev.outcome.kind !== 'attributed') return;
        expect(ev.outcome.resolution.status).toBe('resolved');
        if (ev.outcome.resolution.status === 'resolved') {
            expect(ev.outcome.resolution.value).toBe(20);
        }
        expect(ev.notAnswerableTemporal).toHaveLength(1);
        expect(ev.notAnswerableTemporal[0]!.ruleId).toBe('r-ingested');
        expect(ev.notAnswerableTemporal[0]!.detail).toContain("validityBasis 'ingestion'");
    });

    it('NEGATIVE (the R3 defect made impossible): before the legal window, the ingestion rule must NOT convert the answer into a confident not-in-force — the outcome is NOT-ANSWERABLE, naming R3', () => {
        const ev = evaluateZoneParameter(doc, 'FX1', 'maxHeight_m', { basis: 'legal-as-of', date: '2004-01-01' }, CTX);
        // A naive isInForceOn over both rules would say "not in force" flatly —
        // the confident false negative gate §B.3 documents. R3 forbids it:
        expect(ev.outcome.kind).toBe('not-answerable-temporal');
        if (ev.outcome.kind !== 'not-answerable-temporal') return;
        expect(ev.outcome.refusals[0]!.validityBasis).toBe('ingestion');
        // …and the legal rule's real negative is still surfaced honestly:
        expect(ev.notInForce).toContain('r-legal');
    });

    it('POSITIVE: a current-set query is a membership question BOTH bases answer (REPORT §K.2) — corroborating values resolve', () => {
        const corro = fxDoc([
            fxRule({ id: 'r-legal', value: 20, valid_from: '2005-01-01', rase: 'fixture clause: max height 20 m' }),
            fxRule({ id: 'r-ingested', value: 20, validityBasis: 'ingestion', valid_from: '2026-01-15', rase: 'fixture clause re-served: max height 20 m' }),
        ]);
        const ev = evaluateZoneParameter(corro, 'FX1', 'maxHeight_m', { basis: 'current-set', date: '2026-06-01' }, CTX);
        expect(ev.outcome.kind).toBe('attributed');
        if (ev.outcome.kind !== 'attributed') return;
        expect(ev.outcome.resolution.status).toBe('resolved');
        expect(ev.notAnswerableTemporal).toHaveLength(0);
    });
});

describe('R1 rank — precedence resolved ENGINE-side reading applicability.rank (verdict §F.7, §G item 1b)', () => {
    it('POSITIVE (the DK ladder shape): level 1 outranks level 4 on one scheme; the loser is recorded OUTRANKED with both levels named', () => {
        const doc = fxDoc([
            fxRule({ id: 'r-ramme', value: 24, rank: { scheme: 'dk-plandata', level: 4 }, rase: 'ramme clause 24 m' }),
            fxRule({ id: 'r-byggefelt', value: 12, rank: { scheme: 'dk-plandata', level: 1 }, rase: 'byggefelt clause 12 m' }),
        ]);
        const ev = evaluateZoneParameter(doc, 'FX1', 'maxHeight_m', { basis: 'current-set', date: '2026-06-01' }, CTX);
        expect(ev.outcome.kind).toBe('attributed');
        if (ev.outcome.kind !== 'attributed') return;
        expect(ev.outcome.resolution.status).toBe('resolved');
        if (ev.outcome.resolution.status === 'resolved') {
            expect(ev.outcome.resolution.value).toBe(12);
        }
        expect(ev.outcome.rankRejected).toHaveLength(1);
        expect(ev.outcome.rankRejected[0]!.ruleId).toBe('r-ramme');
        expect(ev.outcome.rankRejected[0]!.detail).toContain('level 4 loses to level 1');
    });

    it('NEGATIVE: a level TIE with disagreeing values REFUSES — never pick on a tie (attribution invariant 1)', () => {
        const doc = fxDoc([
            fxRule({ id: 'r-a', value: 24, rank: { scheme: 'dk-plandata', level: 2 } }),
            fxRule({ id: 'r-b', value: 18, rank: { scheme: 'dk-plandata', level: 2 } }),
        ]);
        const ev = evaluateZoneParameter(doc, 'FX1', 'maxHeight_m', { basis: 'current-set', date: '2026-06-01' }, CTX);
        expect(ev.outcome.kind).toBe('conflicted-rank');
        if (ev.outcome.kind !== 'conflicted-rank') return;
        expect(ev.outcome.reason).toBe('rank-tie');
    });

    it('NEGATIVE: ranks from DIFFERENT schemes (or a missing rank) are INCOMPARABLE — refused, never guessed', () => {
        const mixedSchemes = fxDoc([
            fxRule({ id: 'r-a', value: 24, rank: { scheme: 'dk-plandata', level: 1 } }),
            fxRule({ id: 'r-b', value: 18, rank: { scheme: 'other-ladder', level: 2 } }),
        ]);
        const ev1 = evaluateZoneParameter(mixedSchemes, 'FX1', 'maxHeight_m', { basis: 'current-set', date: '2026-06-01' }, CTX);
        expect(ev1.outcome.kind).toBe('conflicted-rank');
        if (ev1.outcome.kind === 'conflicted-rank') expect(ev1.outcome.reason).toBe('rank-incomparable');

        const missingRank = fxDoc([
            fxRule({ id: 'r-a', value: 24, rank: { scheme: 'dk-plandata', level: 1 } }),
            fxRule({ id: 'r-b', value: 18 }),
        ]);
        const ev2 = evaluateZoneParameter(missingRank, 'FX1', 'maxHeight_m', { basis: 'current-set', date: '2026-06-01' }, CTX);
        expect(ev2.outcome.kind).toBe('conflicted-rank');
        if (ev2.outcome.kind === 'conflicted-rank') expect(ev2.outcome.reason).toBe('rank-incomparable');
    });
});

describe('R1 companion contract — every basis ref resolves to a MINTED entity (gate §B.2)', () => {
    it('NEGATIVE: a basis ref naming no minted entity is a HARD refusal naming the dangling ref', () => {
        const doc = fxDoc([fxRule({ id: 'r-dangling', value: 20, basisRef: 'plan-DOES-NOT-EXIST' })]);
        const ev = evaluateZoneParameter(doc, 'FX1', 'maxHeight_m', { basis: 'current-set', date: '2026-06-01' }, CTX);
        expect(ev.outcome.kind).toBe('dangling-basis');
        if (ev.outcome.kind !== 'dangling-basis') return;
        expect(ev.outcome.dangling[0]!.ref).toBe('plan-DOES-NOT-EXIST');
        expect(ev.outcome.detail).toContain('MUST resolve to a minted entity');
    });
});

describe('tier-6 guard — no null-capped solids from tier-6 rules (supplement §8.1, L-616)', () => {
    it('NEGATIVE: a tier-6 UNKNOWN height refuses the solid cap with the reason named', () => {
        const doc = fxDoc([fxRule({ id: 'r-unknown', value: null, tier: 6 })]);
        const ev = evaluateZoneParameter(doc, 'FX1', 'maxHeight_m', { basis: 'current-set', date: '2026-06-01' }, CTX);
        expect(ev.outcome.kind).toBe('unknown-tier6');
        const cap = envelopeSolidHeightCap(ev);
        expect(cap.ok).toBe(false);
        if (cap.ok) return;
        expect(cap.refusal).toBe('tier6-unknown-height');
        expect(cap.detail).toContain('L-616');
    });

    it('CONTROL: a resolved numeric height yields the cap', () => {
        const doc = fxDoc([fxRule({ id: 'r-ok', value: 20, rase: 'fixture clause: 20 m' })]);
        const ev = evaluateZoneParameter(doc, 'FX1', 'maxHeight_m', { basis: 'current-set', date: '2026-06-01' }, CTX);
        const cap = envelopeSolidHeightCap(ev);
        expect(cap).toEqual({ ok: true, maxHeightM: 20 });
    });

    it('a tier-6 sibling is set aside (surfaced) when a valued rule answers — UNKNOWN never shadows a real value, and vice versa', () => {
        const doc = fxDoc([
            fxRule({ id: 'r-ok', value: 20, rase: 'fixture clause: 20 m' }),
            fxRule({ id: 'r-unknown', value: null, tier: 6 }),
        ]);
        const ev = evaluateZoneParameter(doc, 'FX1', 'maxHeight_m', { basis: 'current-set', date: '2026-06-01' }, CTX);
        expect(ev.outcome.kind).toBe('attributed');
        expect(ev.tier6SetAside).toEqual(['r-unknown']);
    });
});

describe('fact vocabulary — two packs must never spell one fact two ways (supplement §3.4)', () => {
    it('collectConditionVars walks nested JSON-Logic', () => {
        expect(
            collectConditionVars({ '<': [{ var: 'parcelAreaM2' }, { '+': [{ var: 'ampladaDeVialM' }, 5] }] }),
        ).toEqual(['parcelAreaM2', 'ampladaDeVialM']);
    });

    it('NEGATIVE: an undeclared spelling refuses naming the token and the declared set', () => {
        const verdict = assertKnownFacts({ '<': [{ var: 'parcel_area' }, 400] });
        expect(verdict.ok).toBe(false);
        if (verdict.ok) return;
        expect(verdict.unknown).toEqual(['parcel_area']);
        expect(verdict.detail).toContain('parcelAreaM2');
    });

    it('NEGATIVE: a rule whose condition uses an undeclared fact is refused by the evaluator', () => {
        const doc = fxDoc([fxRule({ id: 'r-cond', value: 20, condition: { '<': [{ var: 'parcel_area' }, 400] } })]);
        const ev = evaluateZoneParameter(doc, 'FX1', 'maxHeight_m', { basis: 'current-set', date: '2026-06-01' }, CTX);
        expect(ev.outcome.kind).toBe('unknown-fact');
        if (ev.outcome.kind === 'unknown-fact') expect(ev.outcome.unknownFacts).toEqual(['parcel_area']);
    });

    it('a declared-fact condition still refuses with the NAMED seam (constructions migrate with the body dialect tag) — a condition is never silently ignored', () => {
        const doc = fxDoc([fxRule({ id: 'r-cond', value: 20, condition: { '<': [{ var: 'parcelAreaM2' }, 400] } })]);
        const ev = evaluateZoneParameter(doc, 'FX1', 'maxHeight_m', { basis: 'current-set', date: '2026-06-01' }, CTX);
        expect(ev.outcome.kind).toBe('condition-not-evaluable');
        if (ev.outcome.kind === 'condition-not-evaluable') {
            expect(ev.outcome.detail).toContain('body dialect tag');
        }
    });
});

describe('§DEC-2 inheritance — zone supplement, NOT layer precedence', () => {
    const childZone = {
        code: 'FX-CHILD',
        label: 'Fixture child zone',
        permittedUse: ['residential'],
        fieldProvenance: {},
        ordinanceRef: null,
        inheritsFromZoneCode: 'FX1',
        rules: [fxRule({ id: 'r-child-floors', value: 4, parameter: 'maxFloors' })],
    };

    it('an absent parameter inherits the base zone rule; a present one overrides wholly', () => {
        const doc = fxDoc([fxRule({ id: 'r-base-h', value: 20, rase: 'base clause 20 m' })], [childZone]);
        const inherited = evaluateZoneParameter(doc, 'FX-CHILD', 'maxHeight_m', { basis: 'current-set', date: '2026-06-01' }, CTX);
        expect(inherited.outcome.kind).toBe('attributed');
        if (inherited.outcome.kind === 'attributed' && inherited.outcome.resolution.status === 'resolved') {
            expect(inherited.outcome.resolution.value).toBe(20);
        }
        const own = evaluateZoneParameter(doc, 'FX-CHILD', 'maxFloors', { basis: 'current-set', date: '2026-06-01' }, CTX);
        expect(own.outcome.kind).toBe('resolved-unattributed');
        if (own.outcome.kind === 'resolved-unattributed') expect(own.outcome.value).toBe(4);
    });
});

describe('chain walk — required hops fail loudly, honest gaps do not', () => {
    it('NEGATIVE: a chain with an unresolved required hop fails NAMING the hop', () => {
        const verdict = walkEvidenceChain([
            { hop: 'zone', ref: 'FX1', detail: '' },
            { hop: 'plan', ref: null, detail: 'severed' },
            { hop: 'document', ref: 'fx-doc.pdf', detail: '' },
            { hop: 'article', ref: '§ 7', detail: '' },
            { hop: 'rule', ref: 'r-1', detail: '' },
            { hop: 'value', ref: '20', detail: '' },
        ]);
        expect(verdict.ok).toBe(false);
        if (!verdict.ok) expect(verdict.missingHop).toBe('plan');
    });
});
