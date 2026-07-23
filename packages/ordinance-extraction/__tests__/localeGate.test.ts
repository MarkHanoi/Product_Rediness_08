import { describe, expect, it } from 'vitest';
import {
    parseLocaleNumber,
    normaliseLocaleNumber,
    localeGate,
} from '../src/gates/localeGate.js';

describe('parseLocaleNumber — es convention (. thousands, , decimal)', () => {
    it('reads 2.000 as two thousand', () => {
        expect(parseLocaleNumber('2.000', 'es')).toBe(2000);
    });
    it('reads 1,66 as one-point-six-six', () => {
        expect(parseLocaleNumber('1,66', 'es')).toBeCloseTo(1.66, 10);
    });
    it('reads 1.449,78 as 1449.78', () => {
        expect(parseLocaleNumber('1.449,78', 'es')).toBeCloseTo(1449.78, 10);
    });
    it('reads a bare integer', () => {
        expect(parseLocaleNumber('750', 'es')).toBe(750);
    });
    it('handles a leading sign and whitespace', () => {
        expect(parseLocaleNumber(' -12,5 ', 'es')).toBeCloseTo(-12.5, 10);
    });
    it('rejects prose / units / empty / double-decimal', () => {
        expect(parseLocaleNumber('resultante', 'es')).toBeNull();
        expect(parseLocaleNumber('', 'es')).toBeNull();
        expect(parseLocaleNumber('1,6,6', 'es')).toBeNull();
        expect(parseLocaleNumber(',', 'es')).toBeNull();
    });
});

describe('parseLocaleNumber — en convention', () => {
    it('reads 2,000 as two thousand and 1.66 as 1.66', () => {
        expect(parseLocaleNumber('2,000', 'en')).toBe(2000);
        expect(parseLocaleNumber('1.66', 'en')).toBeCloseTo(1.66, 10);
    });
});

describe('normaliseLocaleNumber — trap detection', () => {
    it('flags the 1000× trap on 2.000', () => {
        const r = normaliseLocaleNumber('2.000', 'es');
        expect(r.value).toBe(2000);
        expect(r.naiveValue).toBe(2); // anglophone reads it as 2.0
        expect(r.trapPresent).toBe(true);
    });
    it('no trap when the naive read matches (1,66 vs unparseable-as-en → 166)', () => {
        // '1,66' under en = 166 (comma=thousands) → differs → trap present.
        const r = normaliseLocaleNumber('1,66', 'es');
        expect(r.value).toBeCloseTo(1.66, 10);
        expect(r.trapPresent).toBe(true);
    });
    it('no trap on a separator-free integer', () => {
        expect(normaliseLocaleNumber('750', 'es').trapPresent).toBe(false);
    });
});

describe('localeGate', () => {
    it('passes when the extracted value is the locale-correct read', () => {
        expect(localeGate('2.000', 2000, 'es').verdict).toBe('pass');
    });
    it('FLAGS the 1000× trap: extracted 2.0 for raw 2.000', () => {
        const g = localeGate('2.000', 2, 'es');
        expect(g.verdict).toBe('flag');
        expect(g.token).toBe('locale:flag-trap');
    });
    it('is not-applicable when there is no numeric value', () => {
        expect(localeGate('resultante de aplicar', null, 'es').verdict).toBe('not-applicable');
    });
    it('flags an unparseable raw string', () => {
        expect(localeGate('~~~', 12, 'es').verdict).toBe('flag');
    });
    it('flags a value matching neither parse', () => {
        expect(localeGate('2.000', 999, 'es').token).toBe('locale:flag-mismatch');
    });
    it('reports trap-avoided when a correct read dodged a present trap', () => {
        expect(localeGate('2.000', 2000, 'es').token).toBe('locale:pass-trap-avoided');
    });
});
