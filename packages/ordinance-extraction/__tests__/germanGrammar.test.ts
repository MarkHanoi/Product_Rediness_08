import { describe, expect, it } from 'vitest';
import { extractRules } from '../src/textExtract/extractor.js';
import { GERMAN_GRAMMAR, romanToInt } from '../src/grammars/german.js';
import { type TextExtractionSuccess } from '../src/textExtract/types.js';

const BERLIN_SOURCE = { document: 'begruendung-8-30.pdf', page: 42 };

/** Narrow to a success result or fail the test loudly. */
function ok(text: string, source = BERLIN_SOURCE): TextExtractionSuccess {
    const r = extractRules(text, GERMAN_GRAMMAR, source);
    if (!r.ok) throw new Error(`expected success, got refusal: ${r.reason} — ${r.detail}`);
    return r;
}

describe('GERMAN_GRAMMAR — the Berlin 8-30 evidence sentence (PROBE-VERDICT §4)', () => {
    // The exact clause read out of the born-digital Begründung.
    const BERLIN = 'Für das Plangebiet wird eine Grundflächenzahl (GRZ) von 0,3 sowie einer Geschossflächenzahl (GFZ) von 0,9 festgesetzt.';

    it('yields GRZ=0.3 as maxCoverage and GFZ=0.9 as maxFAR', () => {
        const r = ok(BERLIN);
        const grz = r.rules.find((x) => x.field === 'maxCoverage');
        const gfz = r.rules.find((x) => x.field === 'maxFAR');

        expect(grz?.value).toBeCloseTo(0.3, 10);
        expect(grz?.unit).toBe('ratio');
        expect(gfz?.value).toBeCloseTo(0.9, 10);
        expect(gfz?.unit).toBe('ratio');
        // W5-2 — BOTH ratios now declare their denominator, and by statute it is the SAME one:
        // §20(2) BauNVO puts GFZ over the Grundstücksfläche and §19(1) puts GRZ over it too.
        // GRZ previously carried NO basis at all, which is what let `densityCoherence()` relate
        // the two without ever establishing they were ratios of the same land.
        expect(gfz?.landBasis).toBe('parcel');
        expect(grz?.landBasis).toBe('parcel');
    });

    it('cites every value to the exact sentence + document (L-449 locator)', () => {
        const r = ok(BERLIN);
        for (const rule of r.rules) {
            expect(rule.citation.document).toBe('begruendung-8-30.pdf');
            expect(rule.citation.page).toBe(42);
            expect(rule.citation.sentence).toContain('Grundflächenzahl');
            expect(rule.rawText.length).toBeGreaterThan(0);
        }
    });

    it('stamps every value at pipeline-extracted-unverified (LOCK 1 — never higher)', () => {
        const r = ok(BERLIN);
        expect(r.rules.length).toBeGreaterThanOrEqual(2);
        for (const rule of r.rules) {
            expect(rule.confidence).toBe('pipeline-extracted-unverified');
            expect(rule.fieldProvenance).toBe('pipeline-extracted');
            expect(rule.domainConfidence.tier).toBe('pipeline-extracted-unverified');
            expect(rule.domainConfidence.validationState).toBe('not-checked');
        }
    });

    it('finds the §13a section anchor when present', () => {
        const withSection =
            'Gemäß § 13a BauGB wird eine Grundflächenzahl (GRZ) von 0,3 festgesetzt.';
        const grz = ok(withSection).rules.find((x) => x.field === 'maxCoverage');
        expect(grz?.citation.section).toBe('§ 13a');
    });
});

describe('GERMAN_GRAMMAR — decimal-comma parsing', () => {
    it('reads 0,4 as 0.4 (not 4), 12,5 m as 12.5', () => {
        const r = ok('GRZ 0,4 und eine Traufhöhe von 12,5 m.');
        expect(r.rules.find((x) => x.field === 'maxCoverage')?.value).toBeCloseTo(0.4, 10);
        expect(r.rules.find((x) => x.field === 'maxHeight_m')?.value).toBeCloseTo(12.5, 10);
    });
});

describe('GERMAN_GRAMMAR — Vollgeschosse (Arabic + Roman)', () => {
    it('reads "Zahl der Vollgeschosse beträgt III" as maxFloors=3', () => {
        const r = ok('Die Zahl der Vollgeschosse beträgt III.');
        const f = r.rules.find((x) => x.field === 'maxFloors');
        expect(f?.value).toBe(3);
        expect(f?.unit).toBe('storeys');
    });

    it('reads a leading Arabic numeral "höchstens 3 Vollgeschosse"', () => {
        const r = ok('Zulässig sind höchstens 3 Vollgeschosse.');
        expect(r.rules.find((x) => x.field === 'maxFloors')?.value).toBe(3);
    });
});

describe('GERMAN_GRAMMAR — height datum (measurement) is stamped', () => {
    it('Traufhöhe → eaves, Firsthöhe → ridge, Gebäudehöhe → building', () => {
        const eaves = ok('Die Traufhöhe (TH) beträgt maximal 12,5 m.').rules[0];
        const ridge = ok('Die Firsthöhe (FH) beträgt 15,0 m.').rules[0];
        const bld = ok('Die Gebäudehöhe darf 18 m nicht überschreiten.').rules[0];
        expect(eaves?.measurement).toBe('eaves');
        expect(ridge?.measurement).toBe('ridge');
        expect(bld?.measurement).toBe('building');
    });
});

describe('GERMAN_GRAMMAR — attested Festsetzung connectives', () => {
    it.each([
        ['Die Grundflächenzahl (GRZ) von 0,3 wird festgesetzt.', 'maxCoverage', 0.3],
        ['GRZ = 0,4', 'maxCoverage', 0.4],
        ['GRZ: 0,4', 'maxCoverage', 0.4],
        ['GRZ 0,35', 'maxCoverage', 0.35], // Nutzungsschablone table form (no connective)
        ['Die GRZ wird auf 0,45 festgesetzt.', 'maxCoverage', 0.45],
        ['Die Firsthöhe wird mit 15,0 m festgesetzt.', 'maxHeight_m', 15],
        ['Die Gebäudehöhe darf 18 m nicht überschreiten.', 'maxHeight_m', 18],
        ['Die Traufhöhe beträgt maximal 12,5 m.', 'maxHeight_m', 12.5],
        ['Zulässig ist eine Gebäudehöhe bis zu 22 m.', 'maxHeight_m', 22],
    ])('parses %s', (text, field, expected) => {
        const r = ok(text);
        expect(r.rules.find((x) => x.field === field)?.value).toBeCloseTo(expected, 10);
    });

    it('does NOT bridge across an unrelated clause (confident-wrong attribution guard)', () => {
        // "GRZ" is followed by `und die GFZ von 0,9` — `und`/`die` are NOT in the
        // closed connective set, so the GRZ matcher must NOT bind 0,9 to coverage.
        // A wildcard connective would silently produce maxCoverage = 0.9 here.
        const r = ok('Die GRZ und die GFZ von 0,9 werden festgesetzt.');
        expect(r.rules.find((x) => x.field === 'maxCoverage')).toBeUndefined();
        expect(r.unknowns.find((u) => u.field === 'maxCoverage')?.reason).toBe(
            'not-stated-in-text',
        );
        expect(r.rules.find((x) => x.field === 'maxFAR')?.value).toBeCloseTo(0.9, 10);
    });
});

describe('GERMAN_GRAMMAR — honesty: reject, unknown, no fabrication', () => {
    it('REJECTS an Orientierungswert §17 BauNVO sentence (not a parcel rule)', () => {
        const text =
            'Die Orientierungswerte des § 17 BauNVO nennen eine GFZ von 1,2 für dieses Baugebiet.';
        const r = ok(text);
        // No value emitted from the reject sentence…
        expect(r.rules.find((x) => x.field === 'maxFAR')).toBeUndefined();
        // …but the drop is recorded honestly, not silent.
        expect(r.rejected.some((x) => x.field === 'maxFAR' && x.rejectId === 'orientierungswerte'))
            .toBe(true);
        expect(r.unknowns.find((u) => u.field === 'maxFAR')?.reason).toBe(
            'rejected-not-parcel-rule',
        );
    });

    it('still emits a BINDING value stated in a separate sentence from the reject', () => {
        const text =
            'Die Orientierungswerte des § 17 BauNVO liegen höher. Festgesetzt wird eine Grundflächenzahl (GRZ) von 0,3.';
        const r = ok(text);
        expect(r.rules.find((x) => x.field === 'maxCoverage')?.value).toBeCloseTo(0.3, 10);
    });

    it('reports an ABSENT height as an honest unknown, never a fabricated value', () => {
        const r = ok('Eine Grundflächenzahl (GRZ) von 0,3 wird festgesetzt.');
        expect(r.rules.find((x) => x.field === 'maxHeight_m')).toBeUndefined();
        expect(r.unknowns.find((u) => u.field === 'maxHeight_m')?.reason).toBe('not-stated-in-text');
    });

    it('does not confuse GRZ and GFZ (attribution is load-bearing)', () => {
        const r = ok('Eine Geschossflächenzahl (GFZ) von 0,9 wird festgesetzt.');
        // Only GFZ→maxFAR is emitted; maxCoverage stays unknown.
        expect(r.rules.map((x) => x.field)).toContain('maxFAR');
        expect(r.rules.find((x) => x.field === 'maxCoverage')).toBeUndefined();
        expect(r.unknowns.find((u) => u.field === 'maxCoverage')?.reason).toBe('not-stated-in-text');
    });
});

describe('GERMAN_GRAMMAR — "on the drawing" ≠ "not stated" (§CONTEXT-DATA-HONESTY)', () => {
    it('reports a Planzeichnung delegation as stated-as-rule-not-value + on-drawing', () => {
        const r = ok('Die Zahl der Vollgeschosse ergibt sich aus der Planzeichnung.');
        const u = r.unknowns.find((x) => x.field === 'maxFloors');
        expect(u?.reason).toBe('stated-as-rule-not-value');
        expect(u?.rule).toBe('on-drawing');
        expect(u?.ruleReferenceId).toBe('de-planzeichnung');
        // …and NEVER a fabricated number.
        expect(r.rules.find((x) => x.field === 'maxFloors')).toBeUndefined();
    });

    it('is DISTINGUISHABLE from a genuinely silent text (the whole point)', () => {
        const silent = ok('Das Plangebiet liegt im Bezirk Neukölln.');
        expect(silent.unknowns.find((x) => x.field === 'maxFloors')?.reason).toBe(
            'not-stated-in-text',
        );
        const delegated = ok('Die Zahl der Vollgeschosse ergibt sich aus der Planzeichnung.');
        expect(delegated.unknowns.find((x) => x.field === 'maxFloors')?.reason).toBe(
            'stated-as-rule-not-value',
        );
    });

    it('flags a DERIVED value ("errechnet sich aus") as rule=derived', () => {
        const r = ok('Die zulässige Geschossflächenzahl errechnet sich aus der Grundstücksgröße.');
        const u = r.unknowns.find((x) => x.field === 'maxFAR');
        expect(u?.reason).toBe('stated-as-rule-not-value');
        expect(u?.rule).toBe('derived');
    });

    it('a STATED number outranks a rule phrase in the same sentence', () => {
        // GRZ is given a number here; only the height is delegated to the drawing.
        const r = ok(
            'Die GRZ beträgt 0,3; die Traufhöhe ergibt sich aus der Planzeichnung.',
        );
        expect(r.rules.find((x) => x.field === 'maxCoverage')?.value).toBeCloseTo(0.3, 10);
        expect(r.unknowns.find((x) => x.field === 'maxCoverage')).toBeUndefined();
        expect(r.unknowns.find((x) => x.field === 'maxHeight_m')?.rule).toBe('on-drawing');
    });

    it('a rule reference elsewhere never downgrades a value stated earlier', () => {
        const r = ok(
            'Die Grundflächenzahl (GRZ) von 0,3 wird festgesetzt.\nWeitere Maße ergeben sich aus der Planzeichnung.',
        );
        expect(r.rules.find((x) => x.field === 'maxCoverage')?.value).toBeCloseTo(0.3, 10);
    });
});

describe('romanToInt', () => {
    it('parses canonical numerals', () => {
        expect(romanToInt('I')).toBe(1);
        expect(romanToInt('III')).toBe(3);
        expect(romanToInt('IV')).toBe(4);
        expect(romanToInt('viii')).toBe(8); // case-insensitive
        expect(romanToInt('XII')).toBe(12);
    });
    it('rejects non-canonical / garbage numerals', () => {
        expect(romanToInt('IIII')).toBeNull();
        expect(romanToInt('VV')).toBeNull();
        expect(romanToInt('ABC')).toBeNull();
        expect(romanToInt('')).toBeNull();
    });
});
