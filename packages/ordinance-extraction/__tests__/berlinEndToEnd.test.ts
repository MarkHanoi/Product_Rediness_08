// END-TO-END — the born-digital German text path over the Berlin 8-30 fixture.
//
//   ordinance text → extractRules(GERMAN_GRAMMAR) → toEnvelopeParameters
//
// ⚠ SCOPE OF THE CLAIM. `BERLIN_8_30_VERBATIM` is the only string here with real
// provenance (PROBE-VERDICT-2026-07-31.md §4). The tests that use it are the ones
// that prove anything about Berlin's actual published text. Everything else is
// labelled synthetic in the fixture and proves only that the parser behaves as
// specified — see fixtures/berlin-8-30.ts.
//
// These tests assert NO verified Berlin planning value. The 8-30 row stands at
// `pending-L449`; what is asserted is that the pipeline READS what the probe read,
// cites it, and refuses to graduate it.

import { describe, expect, it } from 'vitest';
import { extractRules } from '../src/textExtract/extractor.js';
import { GERMAN_GRAMMAR } from '../src/grammars/german.js';
import { toEnvelopeParameters, findParameter } from '../src/envelope/mapper.js';
import { type EnvelopeExtraction, type ResolvedParameter } from '../src/envelope/types.js';
import {
    BERLIN_8_30_RECONSTRUCTED_SENTENCE,
    BERLIN_8_30_SOURCE,
    BERLIN_8_30_VERBATIM,
    BERLIN_STYLE_SYNTHETIC_PROSE,
} from './fixtures/berlin-8-30.js';

/** Run the whole chain, failing loudly on a refusal. */
function envelopeOf(text: string): EnvelopeExtraction {
    const extraction = extractRules(text, GERMAN_GRAMMAR, BERLIN_8_30_SOURCE);
    const env = toEnvelopeParameters(extraction);
    if (!env.ok) throw new Error(`expected an envelope, got refusal: ${env.reason} — ${env.detail}`);
    return env;
}

/** Narrow an outcome to `resolved` or fail with what it actually was. */
function resolved(env: EnvelopeExtraction, key: string): ResolvedParameter {
    const o = findParameter(env, key);
    if (o === null) throw new Error(`no outcome for ${key}`);
    if (o.status !== 'resolved') throw new Error(`${key} was ${o.status}, expected resolved`);
    return o;
}

describe('Berlin 8-30 — the VERBATIM probe fragment (the only real-provenance string)', () => {
    it('reads GRZ 0,3 and GFZ 0,9 out of the fragment exactly as the probe reported them', () => {
        const env = envelopeOf(BERLIN_8_30_VERBATIM);
        expect(resolved(env, 'maxCoverage').value).toBeCloseTo(0.3, 10);
        expect(resolved(env, 'maxFAR').value).toBeCloseTo(0.9, 10);
    });

    it('stamps the GFZ as a per-plot ratio (Geschossfläche ÷ Grundstücksfläche)', () => {
        const env = envelopeOf(BERLIN_8_30_VERBATIM);
        // Which denominator a FAR is measured against is the L-616 error class.
        expect(resolved(env, 'maxFAR').densityScope).toBe('per-plot-area');
        expect(resolved(env, 'maxFAR').unit).toBe('ratio');
    });

    it('cites both values to the real grund_www document, with page honestly null', () => {
        const env = envelopeOf(BERLIN_8_30_VERBATIM);
        for (const key of ['maxCoverage', 'maxFAR']) {
            const p = resolved(env, key);
            expect(p.citation.document).toBe('begruendung-8-30.pdf');
            // The probe reported no page index for the fragment — so neither do we.
            expect(p.citation.page).toBeNull();
            expect(p.citation.sentence).toContain('0,3');
        }
    });

    it('refuses to graduate either value above pipeline-extracted-unverified (L-449)', () => {
        const env = envelopeOf(BERLIN_8_30_VERBATIM);
        for (const key of ['maxCoverage', 'maxFAR']) {
            const p = resolved(env, key);
            expect(p.confidence).toBe('pipeline-extracted-unverified');
            expect(p.fieldProvenance).toBe('pipeline-extracted');
            expect(p.domainConfidence.validationState).toBe('not-checked');
        }
    });

    it('both values pass the locale + range gates (auto-accepted for review)', () => {
        const env = envelopeOf(BERLIN_8_30_VERBATIM);
        for (const key of ['maxCoverage', 'maxFAR']) {
            const p = resolved(env, key);
            expect(p.flags).toEqual([]);
            expect(p.autoAccepted).toBe(true);
            expect(p.gates.map((g) => g.gate).sort()).toEqual(['locale', 'range']);
        }
    });

    it('reports storeys and height as honest unknowns — the fragment states neither', () => {
        const env = envelopeOf(BERLIN_8_30_VERBATIM);
        expect(findParameter(env, 'maxFloors')?.status).toBe('unknown');
        expect(findParameter(env, 'maxHeight_m')?.status).toBe('unknown');
        expect(env.summary).toMatchObject({ resolved: 2, conflicted: 0 });
    });

    it('cannot run the density coherence check without storeys — and says so', () => {
        const env = envelopeOf(BERLIN_8_30_VERBATIM);
        const density = env.coherence.find((g) => g.detail.includes('FAR'));
        // "the check could not run" is reported, not silently omitted.
        expect(density?.verdict).toBe('not-applicable');
        expect(density?.detail).toContain('maxFloors');
    });

    it('resolves the §13a BauGB anchor when the sentence frame supplies one', () => {
        // NOTE: the frame is RECONSTRUCTED (see fixture); this asserts the § finder,
        // not that Berlin's sentence reads this way.
        const env = envelopeOf(BERLIN_8_30_RECONSTRUCTED_SENTENCE);
        expect(resolved(env, 'maxCoverage').citation.section).toBe('§ 13a');
    });
});

describe('Berlin-style SYNTHETIC prose — paths the one real fragment cannot reach', () => {
    it('resolves GRZ, Vollgeschosse and both height datums as separate parameters', () => {
        const env = envelopeOf(BERLIN_STYLE_SYNTHETIC_PROSE);
        expect(resolved(env, 'maxCoverage').value).toBeCloseTo(0.4, 10);
        expect(resolved(env, 'maxFloors').value).toBe(3);
        // Traufhöhe and Firsthöhe are DIFFERENT parameters, not a conflict.
        expect(resolved(env, 'maxHeight_m@eaves').value).toBeCloseTo(12.5, 10);
        expect(resolved(env, 'maxHeight_m@ridge').value).toBeCloseTo(16.0, 10);
    });

    it('passes the eaves ≤ ridge coherence check', () => {
        const env = envelopeOf(BERLIN_STYLE_SYNTHETIC_PROSE);
        const datum = env.coherence.find((g) => g.token.includes('height-datum'));
        expect(datum?.verdict).toBe('pass');
    });

    it('REJECTS the §17 BauNVO Orientierungswert GFZ — never a parcel value', () => {
        const env = envelopeOf(BERLIN_STYLE_SYNTHETIC_PROSE);
        const far = findParameter(env, 'maxFAR');
        expect(far?.status).toBe('unknown');
        if (far?.status === 'unknown') expect(far.reason).toBe('rejected-not-parcel-rule');
        // …and the drop is on the audit trail, not silent.
        expect(env.rejected.some((r) => r.field === 'maxFAR')).toBe(true);
    });

    it('runs the density coherence check once GRZ + Z are both present', () => {
        const env = envelopeOf(BERLIN_STYLE_SYNTHETIC_PROSE);
        const density = env.coherence.find((g) => g.detail.includes('FAR'));
        // GFZ was rejected (Orientierungswert), so FAR never resolved → not-applicable.
        expect(density?.verdict).toBe('not-applicable');
        expect(density?.detail).toContain('maxFAR');
    });
});
