// §WHERE-IS-YOUR-PROJECT (L-13057 item 4) — the ONE FIELD's discrimination, pinned.
//
// The point of these tests is not that the regexes match; it is the THREE BEHAVIOURS the founder's
// rules demand and that a future edit could quietly break:
//   1. a real place must NEVER be read as a cadastral reference,
//   2. an unrecognised registry shape must FALL THROUGH (null = "geocode it"), never error,
//   3. every reading and every miss must NAME the registry it concerns.

import { describe, expect, it } from 'vitest';
import {
    sniffCadastralRef,
    normaliseCadastralCandidate,
    describeCadastralReading,
    describeCadastralMiss,
} from '../src/ui/onboarding/cadastralRefSniff.js';

describe('sniffCadastralRef — Spanish references it MUST recognise', () => {
    // Every reference below is one this repo already holds in a fixture, a log line or a test.
    it.each([
        ['1722706DF3812B', 'the founder\'s own session log'],
        ['1035716DF3813E', 'envelopeResolutionState.ts'],
        ['1218101DF3811G', 'committedParcelRing.ts'],
        ['1950501UG4915S', 'officialFootprint.test.ts'],
        ['0229720DF3802G', 'catastroParcelProvider.test.ts'],
        ['2947201UG4924N', 'boundaryProjection.ts (Córdoba)'],
    ])('reads %s as an urban Catastro reference (source: %s)', (ref) => {
        const r = sniffCadastralRef(ref);
        expect(r).not.toBeNull();
        expect(r!.registry.id).toBe('es-catastro');
        expect(r!.kind).toBe('urban');
        expect(r!.parcelRef).toBe(ref);
        expect(r!.narrowedFromUnitRef).toBe(false);
    });

    it('narrows a 20-character UNIT reference to its 14-character PARCEL, and says so', () => {
        const r = sniffCadastralRef('9872023VH5797S0001WX');
        expect(r).not.toBeNull();
        expect(r!.parcelRef).toBe('9872023VH5797S');
        expect(r!.narrowedFromUnitRef).toBe(true);
        // The user must be told the narrowing happened — a flat becoming a parcel is a real
        // change of subject, not a formatting detail.
        expect(describeCadastralReading(r!)).toContain('names a unit');
    });

    it('recognises the RUSTIC shape (5 digits + letter + 8 digits), 14- and 20-character', () => {
        const short = sniffCadastralRef('13077A01800039');
        expect(short?.kind).toBe('rustic');
        expect(short?.parcelRef).toBe('13077A01800039');
        const long = sniffCadastralRef('13077A018000390000FP');
        expect(long?.kind).toBe('rustic');
        expect(long?.parcelRef).toBe('13077A01800039');
        expect(long?.narrowedFromUnitRef).toBe(true);
    });

    it('tolerates the separators a person types, and reports the normalised form it matched', () => {
        const r = sniffCadastralRef(' 1722706 df 3812 b ');
        expect(r?.parcelRef).toBe('1722706DF3812B');
        expect(normaliseCadastralCandidate('1722706-df.3812/b')).toBe('1722706DF3812B');
        // The announcement must echo the string that was actually matched, or it is not true.
        expect(describeCadastralReading(r!)).toContain('1722706DF3812B');
    });
});

describe('sniffCadastralRef — everything else FALLS THROUGH to the geocoder (rule 2)', () => {
    it.each([
        ['', 'empty'],
        ['   ', 'whitespace'],
        ['Barcelona', 'a city'],
        ['10 Downing Street, London', 'an address with a comma'],
        ['Passeig de Gracia 56 Barcelona', 'an address without one'],
        ['1600 Pennsylvania Avenue NW', 'a numeric street address'],
        // ⚠ THE ONE THAT MATTERS MOST: strips to exactly 14 alphanumerics. A loose
        // /^[0-9A-Z]{14}$/ would read this as a parcel reference. The positional pattern is
        // what stops "Main Street 123" from being flown to as a cadastral parcel.
        ['Bern Hauptstr 12', 'a 14-character alphanumeric address'],
        ['NL-ADM-0363-0001', 'a plausible reference from a registry that is NOT implemented'],
        ['DE 12345 678901234', 'a German-looking reference'],
        ['1722706DF3812', 'a Spanish reference one character short'],
        ['1722706DF3812BB', 'one character long'],
        ['ABCDEFGHIJKLMN', 'all letters'],
        ['12345678901234', 'all digits'],
    ])('returns null for %s (%s)', (input) => {
        expect(sniffCadastralRef(input)).toBeNull();
    });

    it('null is NOT an error — it is the instruction to geocode', () => {
        // Pinned as a behavioural statement rather than a type check: the caller branches on
        // null, and any future "throw on unrecognised" would break the founder's rule that an
        // unknown registry shape must reach the place search rather than a refusal.
        expect(() => sniffCadastralRef('Zürich Hauptbahnhof')).not.toThrow();
        expect(sniffCadastralRef('Zürich Hauptbahnhof')).toBeNull();
    });
});

describe('copy — the registry is always named (§CONTEXT-DATA-HONESTY)', () => {
    it('the miss line names the registry that was asked and the reference it was asked about', () => {
        const r = sniffCadastralRef('1722706DF3812B')!;
        const miss = describeCadastralMiss(r);
        expect(miss).toContain('Catastro (Spain)');
        expect(miss).toContain('1722706DF3812B');
        // ⛔ A bare "not found" is the message this function exists to prevent: it cannot be
        // told apart from "we never asked".
        expect(miss.toLowerCase()).not.toMatch(/^not found/);
        // …and it must leave the user a way forward.
        expect(miss).toContain('search for the place by name');
    });

    it('the reading line names the registry too, so the user knows which way it was read', () => {
        const r = sniffCadastralRef('13077A01800039')!;
        expect(describeCadastralReading(r)).toContain('Catastro (Spain)');
    });
});
