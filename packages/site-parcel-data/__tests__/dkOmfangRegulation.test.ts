// §DK-IOMFANGREG — tests for Denmark's F1 discriminator.
//
// The flag values exercised here are the ones Phase 0 actually observed on the wire
// (dk-phase0-report.json §D4/§D4c): Plandata serves these booleans as the JSON strings `"true"` /
// `"false"`, not as JSON booleans, which is why `readDkPlandataFlag` exists at all and why the
// three-valued read is tested first.

import { describe, it, expect } from 'vitest';
import {
    readDkPlandataFlag,
    resolveDkOmfangRegulation,
    dkOmfangToRuleState,
} from '../src/rulepacks/dkOmfangRegulation.js';

const REF = {
    country: 'DK',
    authority: 'Plandata.dk',
    dataset: 'theme_pdk_lokalplan_vedtaget',
    plan_id: '1234567',
    object_id: null,
    document: null,
    article: null,
    page: null,
} as const;

describe('⚠ the flag is THREE-VALUED — absence is never `false`', () => {
    it('reads the wire spellings Plandata actually serves', () => {
        for (const t of [true, 'true', 't', '1', 'ja', 'TRUE']) expect(readDkPlandataFlag(t)).toBe(true);
        for (const f of [false, 'false', 'f', '0', 'nej', 'FALSE']) expect(readDkPlandataFlag(f)).toBe(false);
    });

    it('an ABSENT flag is null (UNKNOWN), never false', () => {
        for (const a of [null, undefined, '']) {
            expect(readDkPlandataFlag(a)).toBeNull();
            expect(readDkPlandataFlag(a)).not.toBe(false);
        }
    });

    it('an UNRECOGNISED token is null, never false — silence is not an assurance', () => {
        expect(readDkPlandataFlag('måske')).toBeNull();
        expect(readDkPlandataFlag(7)).toBeNull();
    });
});

describe('⭐ iomfangreg=true is a statement about the INSTRUMENT — mechanism PRESENT, never F1', () => {
    const v = resolveDkOmfangRegulation({
        flags: { iomfangreg: 'true' },
        numbers: { maxbygnhjd: null, bebygpct: null, maxetager: null },
        doklink: 'https://dokument.plandata.dk/20_1234567_APPROVED.pdf',
        planLabel: 'Lokalplan 593 "Lindgreens Allé II"',
    });

    it('classifies as regulated-outside-structured-fields', () => {
        expect(v.kind).toBe('regulated-outside-structured-fields');
    });

    it('says the plan is NOT silent, and cites the document', () => {
        expect(v.statement).toContain('DOES regulate building extent');
        expect(v.statement).toContain('not a gap in PRYZM');
        expect(v.statement).toContain('20_1234567_APPROVED.pdf');
    });

    it('maps to unrecovered/pdf with mechanism PRESENT — the F1 separation', () => {
        const s = dkOmfangToRuleState(v, REF);
        expect(s).not.toBeNull();
        if (s === null || s.status !== 'unrecovered') throw new Error('narrowing');
        expect(s.failure).toBe('pdf');
        // THE assertion. `absent` would claim the plan has no extent rule; the register says it has one.
        expect(s.mechanism).toBe('present');
        expect(s.mechanism).not.toBe('absent');
        expect(s.stoppedAt).toContain('plandata.dk');
    });

    it('warns when numbers ARE present alongside the flag — partial facts, not the whole rule', () => {
        const withNums = resolveDkOmfangRegulation({
            flags: { iomfangreg: 'true' },
            numbers: { maxbygnhjd: 12 },
            planLabel: 'Lokalplan X',
        });
        if (withNums.kind !== 'regulated-outside-structured-fields') throw new Error('narrowing');
        expect(withNums.numbersPresent).toBe(true);
        expect(withNums.statement).toContain('never as the complete extent rule');
    });
});

describe('kompleks=true outranks everything and is never deterministic (master §4.2)', () => {
    it('routes to interpretation even when the extent fields are populated', () => {
        const v = resolveDkOmfangRegulation({
            flags: { iomfangreg: 'false', kompleks: 'true', kbeskriv: 'Bevaringsværdigt miljø' },
            numbers: { maxbygnhjd: 8.5, bebygpct: 40 },
            planLabel: 'Lokalplan Y',
        });
        expect(v.kind).toBe('complex-requires-interpretation');
        if (v.kind !== 'complex-requires-interpretation') throw new Error('narrowing');
        expect(v.description).toBe('Bevaringsværdigt miljø');
    });

    it('maps to a legally grounded refusal, not a coverage gap', () => {
        const s = dkOmfangToRuleState(
            resolveDkOmfangRegulation({ flags: { kompleks: true }, planLabel: 'Lokalplan Y' }),
            REF,
        );
        if (s === null || s.status !== 'refused') throw new Error('narrowing');
        expect(s.basis).toBe('requires-determination');
    });
});

describe('iomfangreg=false splits into TWO different claims', () => {
    it('with numbers → the municipality declares the fields representative', () => {
        const v = resolveDkOmfangRegulation({
            flags: { iomfangreg: 'false' },
            numbers: { maxbygnhjd: 8.5 },
        });
        expect(v.kind).toBe('structured-fields-declared-representative');
        // ⚠ still not a completeness certificate
        expect(v.statement).toContain('Not a certificate of completeness');
        // it is not itself a rule value — the caller emits the number
        expect(dkOmfangToRuleState(v, REF)).toBeNull();
    });

    it('WITHOUT numbers → a NAMED AMBIGUITY, and PRYZM refuses to resolve it', () => {
        const v = resolveDkOmfangRegulation({ flags: { iomfangreg: 'false' }, numbers: {} });
        expect(v.kind).toBe('declared-representative-but-empty');
        expect(v.statement).toContain('AMBIGUOUS');
        // ⚠ the guard against the worst available error
        expect(v.statement).toContain('does not report "the plan sets no limit"');
    });

    it('the ambiguous case is mechanism UNKNOWN — asserting `absent` would be claiming F1', () => {
        const s = dkOmfangToRuleState(
            resolveDkOmfangRegulation({ flags: { iomfangreg: 'false' }, numbers: {} }),
            REF,
        );
        if (s === null || s.status !== 'unrecovered') throw new Error('narrowing');
        expect(s.mechanism).toBe('unknown');
        expect(s.mechanism).not.toBe('absent');
    });
});

describe('an unserved flag is about the RESPONSE, not the plan', () => {
    it('is flag-not-served, and says absence ≠ false', () => {
        const v = resolveDkOmfangRegulation({ flags: {}, numbers: { maxbygnhjd: 8.5 } });
        expect(v.kind).toBe('flag-not-served');
        expect(v.statement).toContain('not the same as');
    });

    it('maps to failure `inaccessible` — the only label a retry may clear', () => {
        const s = dkOmfangToRuleState(resolveDkOmfangRegulation({ flags: {} }), REF);
        if (s === null || s.status !== 'unrecovered') throw new Error('narrowing');
        expect(s.failure).toBe('inaccessible');
    });
});

describe('determinism (C58 §1.1)', () => {
    it('repeats byte-identically', () => {
        const opts = { flags: { iomfangreg: 'true' }, doklink: 'https://x', planLabel: 'LP 1' };
        const first = JSON.stringify(resolveDkOmfangRegulation(opts));
        for (let i = 0; i < 50; i++) {
            expect(JSON.stringify(resolveDkOmfangRegulation(opts))).toBe(first);
        }
    });
});
