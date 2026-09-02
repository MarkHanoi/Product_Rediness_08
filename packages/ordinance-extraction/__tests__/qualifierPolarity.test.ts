// CONTROL 8, PROVEN TO FIRE — the qualifier-survival gate and its polarity arm.
//
// ⛔ WHY THIS FILE EXISTS. Run end-to-end over a REAL cached Berlin
// Bebauungsplan-Begründung (`0100062b_1-62b.pdf`, 2,513,468 bytes) on 2026-09-02,
// the spine emitted:
//
//     maxHeight_m = 19    from   "einer Mindestbauhöhe (Oberkante) von 19,0 m"
//     autoAccepted = true        qualifier: not-applicable
//
// A MINIMUM published as a MAXIMUM, auto-accepted, with a correct citation
// attached. TWO independent defects stacked to allow it, and this file pins both
// shut:
//
//   1. THE LEXICON WAS BLIND TO GERMAN COMPOUNDS. `/mindestens/` does not match
//      "Mindestbauhöhe"; `/höchstens/` does not match "höchstzulässige". The gate
//      reported `not-applicable` — a SILENT PASS — on the spans whose qualifier
//      mattered most.
//   2. THE GATE COULD NOT FAIL ON THE PROSE PATH. `readers.ts` passed
//      `qualifierCarriers: [rule.citation.sentence]` while the SPAN was that same
//      sentence, so "is the qualifier in a carrier?" was YES by construction.
//      `flag` was unreachable. A gate that cannot fail is not a gate.
//
// The §CORPUS-NEVER-JITTERED discipline is the point of the CONTROL tests below:
// prove the gate can FAIL before trusting it to PASS.

import { describe, expect, it } from 'vitest';
import {
    qualifierSurvivalGate,
    type QualifierLexicon,
} from '../src/gates/qualifierSurvival.js';
import { SWISS_GERMAN_QUALIFIERS } from '../src/adapters/swissZoneTable.js';
import { parameterPolarityFor } from '../src/spine/claimProducer.js';

const LEX: QualifierLexicon = SWISS_GERMAN_QUALIFIERS;

describe('the lexicon matches GERMAN COMPOUNDS, not just whole words', () => {
    // Every string here is VERBATIM from a real fetched document.
    const cases: readonly { span: string; id: string; matched: string }[] = [
        {
            span: 'geschlossenen Bauweise und einer Mindestbauhöhe (Oberkante) von 19,0 m (53,5 m über',
            id: 'de-mindestens',
            matched: 'Mindestbauhöhe',
        },
        {
            span: 'Berlin (BO 58) als höchstzulässige Nutzungsmaße eine Grundflächenzahl (GRZ) von 0,5 und',
            id: 'de-hoechstens',
            matched: 'höchstzulässige',
        },
        {
            span: 'Die durch § 17 Abs. 1 BauNVO bestimmte Obergrenze der GFZ von 1,2 für diese am 1.',
            id: 'de-obergrenze',
            matched: 'Obergrenze',
        },
    ];

    for (const c of cases) {
        it(`finds ${c.id} in "${c.matched}"`, () => {
            const r = qualifierSurvivalGate({ span: c.span, lexicon: LEX, carried: [] });
            expect(r.findings.map((f) => f.id)).toContain(c.id);
            expect(r.findings.find((f) => f.id === c.id)?.matched).toBe(c.matched);
        });
    }

    // ⭐ CONTROL — the lexicon must NOT match a sentence with no qualifier in it.
    // Without this, "matches everything" would pass every test above.
    it('CONTROL — a sentence with no qualifier matches NOTHING', () => {
        const r = qualifierSurvivalGate({
            span: 'Die entsprechende Geschossflächenzahl beträgt 1,8',
            lexicon: LEX,
            carried: [],
        });
        expect(r.findings).toEqual([]);
        expect(r.gate.verdict).toBe('not-applicable');
    });
});

describe('POLARITY — a minimum written into a maximum seat is REFUSED', () => {
    const MINDEST =
        'geschlossenen Bauweise und einer Mindestbauhöhe (Oberkante) von 19,0 m (53,5 m über';

    it('FLAGS the real Berlin span that published a floor as a ceiling', () => {
        const r = qualifierSurvivalGate({
            span: MINDEST,
            lexicon: LEX,
            carried: [],
            parameterPolarity: parameterPolarityFor('maxHeight_m'),
        });
        expect(r.gate.verdict).toBe('flag');
        expect(r.gate.token).toBe('qualifier:flag-polarity');
        expect(r.gate.detail).toContain('POLARITY CONFLICT');
    });

    it('is NOT redeemable by carrying the qualifier text — the direction is wrong, not the wording', () => {
        const r = qualifierSurvivalGate({
            span: MINDEST,
            lexicon: LEX,
            // The word is carried in every seat and it STILL must not pass.
            carried: ['Mindestbauhöhe', 'Mindestbauhöhe', 'Mindestbauhöhe'],
            parameterPolarity: 'max',
        });
        expect(r.gate.verdict).toBe('flag');
        expect(r.gate.token).toBe('qualifier:flag-polarity');
    });

    it('flags the inverse too — a maximum written into a minimum seat', () => {
        const r = qualifierSurvivalGate({
            span: 'Die Fassadenhöhe beträgt höchstens 21 m',
            lexicon: LEX,
            carried: [],
            parameterPolarity: parameterPolarityFor('setback.front'), // a setback is a MINIMUM
        });
        expect(r.gate.verdict).toBe('flag');
        expect(r.gate.token).toBe('qualifier:flag-polarity');
    });

    // ⭐ THE ANTI-NOISE CONTROL. A gate that flags every correctly-read maximum is
    // as useless as one that flags none. A bound AGREEING with the parameter is
    // carried BY the parameter's own semantics.
    it('CONTROL — an AGREEING bound passes and is not noise', () => {
        const r = qualifierSurvivalGate({
            span: 'Berlin (BO 58) als höchstzulässige Nutzungsmaße eine Grundflächenzahl (GRZ) von 0,5 und',
            lexicon: LEX,
            carried: [],
            parameterPolarity: parameterPolarityFor('maxCoverage'),
        });
        expect(r.gate.verdict).toBe('pass');
    });

    it('CONTROL — with NO parameter polarity supplied, no conflict can be claimed', () => {
        const r = qualifierSurvivalGate({ span: MINDEST, lexicon: LEX, carried: [] });
        expect(r.gate.token).not.toBe('qualifier:flag-polarity');
    });
});

describe('CARRIAGE — a non-bound qualifier must reach a typed seat', () => {
    const SPAN =
        'Die Fassadenhöhe beträgt 21 m, gilt nicht für Garagen und Nebenanlagen.';

    it('FLAGS an exception that reached no seat', () => {
        const r = qualifierSurvivalGate({
            span: SPAN,
            lexicon: LEX,
            carried: [],
            parameterPolarity: 'max',
        });
        expect(r.gate.verdict).toBe('flag');
        expect(r.gate.detail).toContain('did NOT survive');
    });

    it('CONTROL — the SAME span passes once the exception is carried', () => {
        const r = qualifierSurvivalGate({
            span: SPAN,
            lexicon: LEX,
            carried: ['gilt nicht für Garagen und Nebenanlagen'],
            parameterPolarity: 'max',
        });
        expect(r.gate.verdict).toBe('pass');
    });
});

describe('parameter polarity table', () => {
    it('a setback is a MINIMUM distance even though its name does not say so', () => {
        expect(parameterPolarityFor('setback.front')).toBe('min');
        expect(parameterPolarityFor('setback.side')).toBe('min');
        expect(parameterPolarityFor('setback.rear')).toBe('min');
    });
    it('the four max* fields bound max, and minParcelArea bounds min', () => {
        expect(parameterPolarityFor('maxHeight_m')).toBe('max');
        expect(parameterPolarityFor('maxFloors')).toBe('max');
        expect(parameterPolarityFor('maxFAR')).toBe('max');
        expect(parameterPolarityFor('maxCoverage')).toBe('max');
        expect(parameterPolarityFor('minParcelArea_m2')).toBe('min');
    });
});
