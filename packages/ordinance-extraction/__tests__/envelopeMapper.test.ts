// The rule → typed-envelope-parameter mapper. These tests pin the THREE-VALUED
// output (resolved / conflicted / unknown) and the refusal pass-through, which are
// the module's whole reason to exist: every one of them is a place where a
// two-valued design would quietly answer a question it cannot answer.

import { describe, expect, it } from 'vitest';
import { extractRules } from '../src/textExtract/extractor.js';
import { GERMAN_GRAMMAR } from '../src/grammars/german.js';
import { toEnvelopeParameters, findParameter } from '../src/envelope/mapper.js';
import { type EnvelopeExtraction } from '../src/envelope/types.js';

const SRC = { document: 'begruendung-test.pdf', page: 3 };

function envelopeOf(text: string): EnvelopeExtraction {
    const env = toEnvelopeParameters(extractRules(text, GERMAN_GRAMMAR, SRC));
    if (!env.ok) throw new Error(`expected an envelope, got refusal: ${env.reason}`);
    return env;
}

describe('toEnvelopeParameters — a refusal is never flattened into an empty envelope', () => {
    it.each([
        ['   ', 'empty-input'],
        [null, 'invalid-input'],
    ])('passes the %s refusal straight through', (input, reason) => {
        const out = toEnvelopeParameters(
            extractRules(input as unknown as string, GERMAN_GRAMMAR, SRC),
        );
        expect(out.ok).toBe(false);
        if (!out.ok) expect(out.reason).toBe(reason);
    });

    it('a document with no document id refuses rather than returning zero parameters', () => {
        const out = toEnvelopeParameters(
            extractRules('GRZ 0,3', GERMAN_GRAMMAR, { document: '' }),
        );
        expect(out).toMatchObject({ ok: false, reason: 'no-document-id' });
    });

    it('an EMPTY result is ok:true with unknowns — structurally distinct from a refusal', () => {
        const env = envelopeOf('Das Plangebiet liegt im Bezirk Neukölln.');
        expect(env.summary.resolved).toBe(0);
        expect(env.summary.unknown).toBeGreaterThan(0);
        // The distinction the whole module is built on:
        expect(env.ok).toBe(true);
    });
});

describe('toEnvelopeParameters — CONFLICT: two stated values are never reconciled', () => {
    // A real B-Plan sets different values per Baugebiet. This core reads a
    // document, not a parcel — it has no zone attribution, so it must not choose.
    const TWO_ZONES = [
        'Für das WA 1 wird eine Grundflächenzahl (GRZ) von 0,3 festgesetzt.',
        'Für das WA 2 wird eine Grundflächenzahl (GRZ) von 0,5 festgesetzt.',
    ].join('\n');

    it('reports maxCoverage as conflicted, carrying NO value', () => {
        const o = findParameter(envelopeOf(TWO_ZONES), 'maxCoverage');
        expect(o?.status).toBe('conflicted');
        // The type forbids a `value` on a conflict; assert it is genuinely absent.
        expect((o as unknown as { value?: number }).value).toBeUndefined();
    });

    it('carries BOTH candidates, each with its own citation', () => {
        const o = findParameter(envelopeOf(TWO_ZONES), 'maxCoverage');
        if (o?.status !== 'conflicted') throw new Error('expected a conflict');
        expect(o.candidates.map((c) => c.value).sort()).toEqual([0.3, 0.5]);
        expect(o.candidates[0]!.citation.sentence).toContain('WA 1');
        expect(o.candidates[1]!.citation.sentence).toContain('WA 2');
    });

    it('does not pick the first, the max, or the modal value', () => {
        const env = envelopeOf(TWO_ZONES);
        expect(env.summary.resolved).toBe(0);
        expect(env.summary.conflicted).toBe(1);
    });
});

describe('toEnvelopeParameters — repetition corroborates but never graduates', () => {
    const REPEATED = [
        'Eine Grundflächenzahl (GRZ) von 0,3 wird festgesetzt.',
        'Die festgesetzte Grundflächenzahl (GRZ) von 0,3 entspricht dem Bestand.',
    ].join('\n');

    it('collapses the same value stated twice into ONE resolved parameter', () => {
        const o = findParameter(envelopeOf(REPEATED), 'maxCoverage');
        if (o?.status !== 'resolved') throw new Error('expected resolved');
        expect(o.value).toBeCloseTo(0.3, 10);
        expect(o.corroborations).toBe(2);
    });

    it('corroboration does NOT raise the confidence tier (LOCK 3 / L-449)', () => {
        const o = findParameter(envelopeOf(REPEATED), 'maxCoverage');
        if (o?.status !== 'resolved') throw new Error('expected resolved');
        // Repetition inside ONE document is not independent corroboration.
        expect(o.confidence).toBe('pipeline-extracted-unverified');
        expect(o.domainConfidence.tier).toBe('pipeline-extracted-unverified');
    });
});

describe('toEnvelopeParameters — height datums are separate parameters, not a conflict', () => {
    it('keys Traufhöhe and Firsthöhe independently', () => {
        const env = envelopeOf(
            'Die Traufhöhe (TH) beträgt 12,0 m.\nDie Firsthöhe (FH) beträgt 16,0 m.',
        );
        expect(findParameter(env, 'maxHeight_m@eaves')?.status).toBe('resolved');
        expect(findParameter(env, 'maxHeight_m@ridge')?.status).toBe('resolved');
        expect(env.summary.conflicted).toBe(0);
    });

    it('but TWO Traufhöhen ARE a conflict on the eaves key', () => {
        const env = envelopeOf(
            'Die Traufhöhe (TH) beträgt 12,0 m.\nIm WA 2 beträgt die Traufhöhe (TH) 15,0 m.',
        );
        expect(findParameter(env, 'maxHeight_m@eaves')?.status).toBe('conflicted');
    });
});

describe('toEnvelopeParameters — gating (Stage 4)', () => {
    it('an out-of-band value KEEPS its value but loses auto-acceptance', () => {
        // GFZ 5,0 is outside the default maxFAR band [0.2, 3.0].
        const o = findParameter(envelopeOf('Eine Geschossflächenzahl (GFZ) von 5,0 gilt.'), 'maxFAR');
        if (o?.status !== 'resolved') throw new Error('expected resolved');
        expect(o.value).toBeCloseTo(5.0, 10); // the value is carried for the reviewer…
        expect(o.autoAccepted).toBe(false); //  …but must not ship un-reviewed.
        expect(o.flags.length).toBeGreaterThan(0);
    });

    it('honours a caller-supplied bounds override', () => {
        const env = toEnvelopeParameters(
            extractRules('Eine Geschossflächenzahl (GFZ) von 5,0 gilt.', GERMAN_GRAMMAR, SRC),
            { bounds: { maxFAR: { min: 0.2, max: 6.0 } } },
        );
        if (!env.ok) throw new Error('expected an envelope');
        const o = findParameter(env, 'maxFAR');
        if (o?.status !== 'resolved') throw new Error('expected resolved');
        expect(o.autoAccepted).toBe(true);
    });

    it('records WHICH gates ran, so a skipped check is visible', () => {
        const o = findParameter(envelopeOf('GRZ 0,3'), 'maxCoverage');
        if (o?.status !== 'resolved') throw new Error('expected resolved');
        expect(o.gates.map((g) => g.gate).sort()).toEqual(['locale', 'range']);
    });
});

describe('envelopeCoherence — cross-parameter checks catch what per-value gates cannot', () => {
    it('FLAGS a GFZ that exceeds GRZ × Z (each value individually plausible)', () => {
        // GRZ 0,3 × 2 Vollgeschosse = 0,6, but GFZ is stated as 1,5. Every per-value
        // gate passes: 1,5 is in band and parses cleanly. Only the sibling
        // relationship reveals the impossibility.
        const env = envelopeOf(
            [
                'Eine Grundflächenzahl (GRZ) von 0,3 wird festgesetzt.',
                'Die Zahl der Vollgeschosse beträgt 2.',
                'Eine Geschossflächenzahl (GFZ) von 1,5 wird festgesetzt.',
            ].join('\n'),
        );
        const far = findParameter(env, 'maxFAR');
        if (far?.status !== 'resolved') throw new Error('expected resolved');
        expect(far.autoAccepted).toBe(true); // per-value gates all passed…

        const density = env.coherence.find((g) => g.token.includes('density'));
        expect(density?.verdict).toBe('flag'); // …the envelope check caught it.
        expect(density?.detail).toContain('EXCEEDS');
    });

    it('PASSES the Berlin-shaped triple GRZ 0,3 / Z 3 / GFZ 0,9 (exactly on the identity)', () => {
        const env = envelopeOf(
            [
                'Eine Grundflächenzahl (GRZ) von 0,3 wird festgesetzt.',
                'Die Zahl der Vollgeschosse beträgt III.',
                'Eine Geschossflächenzahl (GFZ) von 0,9 wird festgesetzt.',
            ].join('\n'),
        );
        const density = env.coherence.find((g) => g.token.includes('density'));
        expect(density?.verdict).toBe('pass');
    });

    it('FLAGS a Traufhöhe above the Firsthöhe', () => {
        const env = envelopeOf(
            'Die Traufhöhe (TH) beträgt 18,0 m.\nDie Firsthöhe (FH) beträgt 15,0 m.',
        );
        const datum = env.coherence.find((g) => g.token.includes('height-datum'));
        expect(datum?.verdict).toBe('flag');
    });

    it('reports not-applicable explicitly rather than omitting an unrun check', () => {
        const env = envelopeOf('GRZ 0,3');
        // Both checks are present; neither could run. "Did not run" is stated.
        expect(env.coherence).toHaveLength(2);
        expect(env.coherence.every((g) => g.verdict === 'not-applicable')).toBe(true);
    });
});

describe('findParameter — forces the caller to confront the three-way outcome', () => {
    it('returns null for a parameter the grammar never seeks at all', () => {
        // The German grammar has no setback matchers, so there is no outcome —
        // distinct from an outcome that says "unknown".
        expect(findParameter(envelopeOf('GRZ 0,3'), 'setback.front')).toBeNull();
    });

    it('carries an on-drawing delegation through to the unknown outcome', () => {
        const o = findParameter(
            envelopeOf('Die Zahl der Vollgeschosse ergibt sich aus der Planzeichnung.'),
            'maxFloors',
        );
        if (o?.status !== 'unknown') throw new Error('expected unknown');
        expect(o.reason).toBe('stated-as-rule-not-value');
        expect(o.rule).toBe('on-drawing');
    });
});
