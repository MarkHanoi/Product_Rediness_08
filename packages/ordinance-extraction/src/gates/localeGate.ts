// GATE — locale number-format normaliser (`ORDINANCE-EXTRACTION-PIPELINE.md` §2
// Stage 4, L-590g §4.4).
//
// ⚠ THE 1000× TRAP. Spanish/Catalan ordinances write `2.000` for two-thousand
// (period = THOUSANDS) and `1,66` for one-point-six-six (comma = DECIMAL). An
// extractor using the anglophone convention reads `2.000` as 2.0 — a 1000× error
// that still "looks like a number" and passes a naive range check. Córdoba PAS-2
// mixes both on ONE page (`1,66` edificabilidad next to `2.000` parcela mínima).
//
// Pure: string → number, no I/O.

import { type GateResult } from '../types.js';

/**
 * Supported source locales. `es` covers Castilian AND Catalan; `de` (German)
 * shares the SAME numeric convention (`.`=thousands, `,`=decimal) — so
 * `"0,9"` → 0.9 and `"2.000"` → 2000 under both. `en` is the anglophone inverse.
 *
 * ⭐ `ch` ADDED 2026-09-01 (lane E8-SPINE) BECAUSE THE TRAP FIRED ON LIVE DATA.
 * SWISS German is NOT German for numbers: it writes `0.15` with a DOT decimal and
 * `1'000` with an APOSTROPHE thousands separator. The Luzern Bau- und
 * Zonenreglement's Überbauungsziffer column prints `0.15`, and reading it under
 * `de` (dot = thousands) yields **15** — a 100× overstatement of a coverage
 * ratio. Measured end-to-end on the real document: the range gate caught it
 * (`maxCoverage = 15 OUT OF [0, 1]`) and the locale gate reported
 * `pass-trap-avoided`, i.e. it CONFIRMED the wrong reading, because it had been
 * told the wrong convention.
 *
 * ⛔ THE LESSON IS NOT "add a locale". It is that `localeGate` verifies a value
 * against the convention it is GIVEN and cannot detect that the convention itself
 * is wrong — so a mis-declared locale turns the 1000×-trap gate into a rubber
 * stamp. A country adapter's `locale` is a load-bearing claim about the SOURCE,
 * and the range gate is the only thing behind it.
 */
export type NumberLocale = 'es' | 'en' | 'de' | 'ch';

/**
 * The separators a locale uses. `es` and `de` are identical; `en` is inverse;
 * `ch` shares `en`'s DECIMAL mark but uses the apostrophe for thousands (a
 * `1'000` group therefore parses, and a `1,000` group does not — which is
 * correct: a comma-grouped number is not Swiss orthography and refusing it is
 * better than guessing which convention wrote it).
 */
function localeSeparators(locale: NumberLocale): { thousands: string; decimal: string } {
    if (locale === 'en') return { thousands: ',', decimal: '.' };
    if (locale === 'ch') return { thousands: '’', decimal: '.' };
    return { thousands: '.', decimal: ',' };
}

/** The opposite convention — used to compute the "naive anglophone" trap value. */
function oppositeLocale(locale: NumberLocale): NumberLocale {
    return locale === 'en' || locale === 'ch' ? 'es' : 'en';
}

export interface LocaleParseResult {
    /** The correctly parsed value under the source locale, or null if unparseable. */
    readonly value: number | null;
    /** The value a NAIVE anglophone parse would have produced (the trap value). */
    readonly naiveValue: number | null;
    /** True when the two disagree — i.e. the 1000× (or decimal) trap was present. */
    readonly trapPresent: boolean;
}

const NUMERIC = /^[+-]?[\d.,\s’']+$/;

/**
 * Parse a raw ordinance number string under a locale. `es`: `.`=thousands,
 * `,`=decimal. `en`: `,`=thousands, `.`=decimal.
 *
 * Returns null for anything that is not a clean number (prose, ranges, units are
 * the caller's job to strip first).
 */
export function parseLocaleNumber(raw: string, locale: NumberLocale): number | null {
    const t = raw.trim();
    if (t === '' || !NUMERIC.test(t)) return null;
    const sign = t.startsWith('-') ? -1 : 1;
    // Swiss thousands groups are written with either the typographic apostrophe
    // (U+2019) or the ASCII one; normalise to the former before splitting.
    const body = t.replace(/^[+-]/, '').replace(/\s/g, '').replace(/'/g, '’');

    const { thousands, decimal } = localeSeparators(locale);

    // Reject a second decimal separator (ambiguous / malformed).
    if (body.split(decimal).length > 2) return null;

    const [intPart = '', fracPart] = body.split(decimal);
    const intDigits = intPart.split(thousands).join('');
    if (intDigits === '' && (fracPart === undefined || fracPart === '')) return null;
    if (!/^\d*$/.test(intDigits)) return null;
    if (fracPart !== undefined && !/^\d+$/.test(fracPart)) return null;

    const normalised = fracPart !== undefined ? `${intDigits || '0'}.${fracPart}` : intDigits;
    const n = Number(normalised);
    return Number.isFinite(n) ? sign * n : null;
}

/**
 * Normalise a raw number under the jurisdiction locale AND report whether the
 * anglophone convention would have read it differently (the trap).
 */
export function normaliseLocaleNumber(raw: string, locale: NumberLocale): LocaleParseResult {
    const value = parseLocaleNumber(raw, locale);
    const naiveValue = parseLocaleNumber(raw, oppositeLocale(locale));
    const trapPresent =
        value !== null && naiveValue !== null && Math.abs(value - naiveValue) > 1e-9;
    return { value, naiveValue, trapPresent };
}

/**
 * The locale gate as a `GateResult`: confirm the extracted numeric value matches
 * the LOCALE-correct parse of the raw string.
 *   - `pass`  — the extracted value equals the locale-correct parse (trap avoided).
 *   - `flag`  — the extracted value equals the NAIVE parse, not the locale one
 *               (the 1000× trap fired), or the raw string is unparseable.
 *   - the raw string carries no separators to disambiguate → `pass` (nothing to trap).
 */
export function localeGate(
    rawText: string,
    extractedValue: number | null,
    locale: NumberLocale,
): GateResult {
    const { value, naiveValue, trapPresent } = normaliseLocaleNumber(rawText, locale);

    if (extractedValue === null) {
        return {
            gate: 'locale',
            verdict: 'not-applicable',
            detail: 'No numeric value to normalise (algorithm/absent).',
            token: 'locale:not-applicable',
        };
    }

    if (value === null) {
        return {
            gate: 'locale',
            verdict: 'flag',
            detail: `Raw "${rawText}" is not a clean ${locale}-locale number — cannot confirm the read.`,
            token: 'locale:flag-unparseable',
        };
    }

    const matchesLocale = Math.abs(extractedValue - value) <= 1e-9;
    const matchesNaive =
        naiveValue !== null && Math.abs(extractedValue - naiveValue) <= 1e-9;

    if (matchesLocale) {
        return {
            gate: 'locale',
            verdict: 'pass',
            detail: trapPresent
                ? `Locale-correct (${value}); the anglophone read would have been ${naiveValue} — trap avoided.`
                : `Locale-correct (${value}).`,
            token: trapPresent ? 'locale:pass-trap-avoided' : 'locale:pass',
        };
    }

    if (matchesNaive && trapPresent) {
        return {
            gate: 'locale',
            verdict: 'flag',
            detail: `1000×/decimal trap: extracted ${extractedValue} is the anglophone read; the ${locale} value is ${value}.`,
            token: 'locale:flag-trap',
        };
    }

    return {
        gate: 'locale',
        verdict: 'flag',
        detail: `Extracted ${extractedValue} matches neither the ${locale} parse (${value}) nor the naive parse (${naiveValue}).`,
        token: 'locale:flag-mismatch',
    };
}
