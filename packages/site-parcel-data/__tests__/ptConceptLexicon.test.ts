// §PT-CONCEPT-LEXICON — the doctrine's §12 step 7 ("type-check every token … REJECT what does not
// type-check rather than guessing"), pinned.
//
// ⭐ THE THREE ASSERTIONS THAT MATTER are the three defect classes the module exists to make
// impossible: the Spanish `COS` reading carried into Portugal, `cércea` collapsed onto `Hf`, and
// the DR 5/2019 ↔ DR 9/2009 version boundary silently defaulted. Everything else here is shape.

import { describe, it, expect } from 'vitest';
import {
    PT_CERCEA_LOCAL_DEFINITION_CONFLICT,
    PT_CONCEPTS,
    PT_DICTIONARY_BOUNDARY_DATE,
    normalisePtTerm,
    ptConceptsWithoutC58Seat,
    resolveConceptDictionaryVersion,
    typeCheckPtToken,
} from '../src/countryAdapters/pt/ptConceptLexicon.js';

const V = 'DR-5/2019' as const;

describe('§2.6 — the version boundary REFUSES rather than defaulting', () => {
    it('resolves from the PROCEDURAL START DATE, both sides of the boundary', () => {
        const after = resolveConceptDictionaryVersion('2020-03-01');
        expect(after.ok).toBe(true);
        if (after.ok) expect(after.version).toBe('DR-5/2019');

        const before = resolveConceptDictionaryVersion('2016-05-10');
        expect(before.ok).toBe(true);
        if (before.ok) expect(before.version).toBe('DR-9/2009');

        // The boundary day itself is NOT "postdates" — DR 5/2019 needs a start AFTER it.
        const onTheDay = resolveConceptDictionaryVersion(PT_DICTIONARY_BOUNDARY_DATE);
        expect(onTheDay.ok).toBe(true);
        if (onTheDay.ok) expect(onTheDay.version).toBe('DR-9/2009');
    });

    it('⛔ an ABSENT start date is `unresolved`, never a default', () => {
        // Doctrine §0.3: "never silently substitute a default". A default here is the silent
        // error §2.6 names — a well-formed wrong answer with no symptom.
        for (const bad of [null, undefined, '', '   ', 'sometime in 2019', '2019']) {
            const r = resolveConceptDictionaryVersion(bad as string | null | undefined);
            expect(r.ok, String(bad)).toBe(false);
            if (!r.ok) expect(r.refusalReason).toContain('PROCEDURAL START DATE');
        }
    });

    it('every resolution carries its BASIS — a value derived under it can cite why', () => {
        const r = resolveConceptDictionaryVersion('2021-07-08');
        expect(r.ok).toBe(true);
        if (r.ok) expect(r.basis).toContain('2019-09-27');
    });
});

describe('⛔ TRAP 1 — `COS` is a FAR in Portugal and COVERAGE in Spain', () => {
    it('resolves PT `COS` to Iu (floor-area ratio), NOT to an occupation index', () => {
        const r = typeCheckPtToken('COS', { dictionaryVersion: V });
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        expect(r.concept.key).toBe('Iu');
        expect(r.concept.c58Seat).toBe('plotRatioFAR');
        // The seat it must NOT reach.
        expect(r.concept.c58Seat).not.toBe('maxCoverage');
    });

    it('carries the CROSS-JURISDICTION trap text, so a transcriber sees it at transcription time', () => {
        const r = typeCheckPtToken('cos', { dictionaryVersion: V });
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        expect(r.trap).toBeTruthy();
        expect(r.trap).toContain('SPAIN');
    });

    it('⛔ a PT `COS` of 0,6 offered as a percentage is REJECTED, not rescaled', () => {
        // This is the value that would otherwise land silently: ≤ 1, so `maxCoverage`'s own
        // `.max(1)` schema guard would NOT catch it.
        const r = typeCheckPtToken('COS', { dictionaryVersion: V, unit: 'percent', value: 60 });
        expect(r.ok).toBe(false);
        if (r.ok) return;
        expect(r.reason).toBe('unit-mismatch');
        expect(r.detail).toContain('NOT converted');
    });
});

describe('⛔ TRAP 2 — `cércea` is H, and the Porto conflict is RECORDED not resolved', () => {
    it('the alias resolves to H (roof included), never to Hf', () => {
        const r = typeCheckPtToken('cércea', { dictionaryVersion: V });
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        expect(r.concept.key).toBe('H');
        expect(r.concept.meaning).toContain('HIGHEST POINT');
        expect(r.trap).toContain('NEVER the altura da fachada');
    });

    it('H and Hf are DISTINCT concepts that share one C58 seat — the amendment need, pinned', () => {
        const h = PT_CONCEPTS.find((c) => c.key === 'H');
        const hf = PT_CONCEPTS.find((c) => c.key === 'Hf');
        expect(h?.c58Seat).toBe('maxHeight_m');
        expect(hf?.c58Seat).toBe('maxHeight_m');
        // Sharing a seat is the DEFECT, so the note must say so rather than the code hiding it.
        expect(hf?.seatNote).toContain('MUST NOT');
    });

    it('⚠ the Porto local definition conflict is stated with its safe handling', () => {
        expect(PT_CERCEA_LOCAL_DEFINITION_CONFLICT.municipalReading).toContain('Art. 3.º g)');
        expect(PT_CERCEA_LOCAL_DEFINITION_CONFLICT.safeHandling).toContain('NEVER promote it to H');
        expect(PT_CERCEA_LOCAL_DEFINITION_CONFLICT.unresolvedBecause).toContain(
            'PROCEDURAL START DATE',
        );
    });

    it('⛔ `H` and `h` are not the same concept, and case must not conflate them', () => {
        const big = typeCheckPtToken('H', { dictionaryVersion: V });
        const small = typeCheckPtToken('h', { dictionaryVersion: V });
        expect(big.ok && small.ok).toBe(true);
        if (!big.ok || !small.ok) return;
        expect(big.concept.pt).toBe('altura da edificação');
        expect(small.concept.pt).toBe('altura entre pisos');
    });
});

describe('⛔ TRAP 3 — impermeabilisation is NOT coverage', () => {
    it('Iimp has NO C58 seat, and its note says why borrowing maxCoverage overstates', () => {
        const r = typeCheckPtToken('Iimp', { dictionaryVersion: V });
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        expect(r.concept.c58Seat).toBeNull();
        expect(r.concept.seatNote).toContain('OVERSTATES');
    });

    it('Pm (average storeys) is NOT maxFloors', () => {
        const r = typeCheckPtToken('Pm', { dictionaryVersion: V });
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        expect(r.concept.unit).toBe('storeys-average');
        expect(r.concept.c58Seat).toBeNull();
    });

    it('Alt is never collapsed into H', () => {
        const r = typeCheckPtToken('Alt', { dictionaryVersion: V });
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        expect(r.concept.seatNote).toContain('NEVER COLLAPSE');
    });
});

describe('the checker rejects rather than guesses', () => {
    it('an unrecognised token is `unknown-concept` and says the lexicon is partial', () => {
        const r = typeCheckPtToken('coeficiente de aproveitamento', { dictionaryVersion: V });
        expect(r.ok).toBe(false);
        if (r.ok) return;
        expect(r.reason).toBe('unknown-concept');
        // Absence must never read as "not a concept" — the scope statement travels with it.
        expect(r.detail).toContain('73 technical concepts');
    });

    it('a percentage above 100 is rejected, not rescaled', () => {
        const r = typeCheckPtToken('Io', { dictionaryVersion: V, unit: 'percent', value: 120 });
        expect(r.ok).toBe(false);
        if (r.ok) return;
        expect(r.reason).toBe('value-not-admissible');
    });

    it('the municipal numerator traps (Lisboa Sp, Porto área de edificação) are surfaced', () => {
        const lisboa = typeCheckPtToken('superfície de pavimento', { dictionaryVersion: V });
        expect(lisboa.ok).toBe(true);
        if (lisboa.ok) expect(lisboa.trap).toContain('varandas');

        const ie = typeCheckPtToken('índice de edificabilidade', { dictionaryVersion: V });
        expect(ie.ok).toBe(true);
        if (ie.ok) expect(ie.trap).toContain('Art. 38.º');
    });

    it('normalisation is accent- and punctuation-insensitive (served PT text is messy)', () => {
        expect(normalisePtTerm('  Índice   de   Ocupação ')).toBe('indice de ocupacao');
        const r = typeCheckPtToken('ÍNDICE DE OCUPAÇÃO', { dictionaryVersion: V });
        expect(r.ok).toBe(true);
        if (r.ok) expect(r.concept.key).toBe('Io');
    });
});

describe('the amendment surface is DERIVED, never hand-listed', () => {
    it('names every concept PRYZM has no seat for', () => {
        const keys = ptConceptsWithoutC58Seat().map((c) => c.key);
        // These are the reportable gaps as of 2026-09-04. If a C58 amendment lands, this list
        // SHRINKS and the test fails loudly — which is the point: the gap list must not rot.
        expect(keys).toEqual(['Iimp', 'Iv', 'Pm', 'Dhab', 'Alt', 'h', 'Ac', 'Ai', 'As']);
    });

    it('every concept states a unit and a seat-note; no silent blanks', () => {
        for (const c of PT_CONCEPTS) {
            expect(c.key.length, c.key).toBeGreaterThan(0);
            expect(c.pt.length, c.key).toBeGreaterThan(0);
            expect(c.unit.length, c.key).toBeGreaterThan(0);
            expect(c.seatNote.length, `${c.key} must explain its seat (or its absence)`).toBeGreaterThan(0);
        }
    });
});
