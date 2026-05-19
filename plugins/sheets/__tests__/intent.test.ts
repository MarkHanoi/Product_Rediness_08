// intent.ts — predicate + auto-format coverage (S37 / ADR-0031).

import { describe, it, expect } from 'vitest';
import {
  isSheetName,
  isSheetNumberFormat,
  formatAutoSheetNumber,
  isPaperSize,
  isOrientation,
  SHEET_NAME_MAX_LEN,
  SHEET_NUMBER_PATTERN,
} from '../src/intent.js';

describe('isSheetName', () => {
  it('accepts non-empty strings ≤ 200 chars', () => {
    expect(isSheetName('Site Plan')).toBe(true);
    expect(isSheetName('S')).toBe(true);
    expect(isSheetName('a'.repeat(SHEET_NAME_MAX_LEN))).toBe(true);
  });
  it('rejects empty / whitespace-only / too-long / non-string', () => {
    expect(isSheetName('')).toBe(false);
    expect(isSheetName('   ')).toBe(false);
    expect(isSheetName('a'.repeat(SHEET_NAME_MAX_LEN + 1))).toBe(false);
    expect(isSheetName(undefined)).toBe(false);
    expect(isSheetName(123)).toBe(false);
  });
});

describe('isSheetNumberFormat', () => {
  it('accepts standard formats', () => {
    expect(isSheetNumberFormat('A-001')).toBe(true);
    expect(isSheetNumberFormat('M-100')).toBe(true);
    expect(isSheetNumberFormat('S-12A')).toBe(true);
    expect(isSheetNumberFormat('AR-7')).toBe(true);
  });
  it('rejects malformed', () => {
    expect(isSheetNumberFormat('a-001')).toBe(false); // lowercase prefix
    expect(isSheetNumberFormat('A001')).toBe(false);  // missing dash
    expect(isSheetNumberFormat('')).toBe(false);
    expect(isSheetNumberFormat('1-001')).toBe(false); // numeric prefix
    expect(isSheetNumberFormat('A-')).toBe(false);    // empty suffix
  });
  it('exposes the pattern as a constant', () => {
    expect(SHEET_NUMBER_PATTERN).toBeInstanceOf(RegExp);
  });
});

describe('formatAutoSheetNumber', () => {
  it('zero-pads to 3 digits by default', () => {
    expect(formatAutoSheetNumber('A', 0)).toBe('A-000');
    expect(formatAutoSheetNumber('A', 1)).toBe('A-001');
    expect(formatAutoSheetNumber('A', 12)).toBe('A-012');
    expect(formatAutoSheetNumber('A', 123)).toBe('A-123');
  });
  it('grows past the pad without losing ordering', () => {
    expect(formatAutoSheetNumber('A', 1234)).toBe('A-1234');
    expect(formatAutoSheetNumber('A', 12345, 3)).toBe('A-12345');
  });
  it('uppercases the prefix', () => {
    expect(formatAutoSheetNumber('s', 7)).toBe('S-007');
  });
  it('throws on bad input', () => {
    expect(() => formatAutoSheetNumber('', 0)).toThrow();
    expect(() => formatAutoSheetNumber('A', -1)).toThrow();
    expect(() => formatAutoSheetNumber('A', 1.5)).toThrow();
    expect(() => formatAutoSheetNumber('A', 1, 0)).toThrow();
  });
  it('outputs match isSheetNumberFormat for non-negative indices', () => {
    for (const i of [0, 1, 9, 10, 99, 100, 999, 1000]) {
      expect(isSheetNumberFormat(formatAutoSheetNumber('A', i))).toBe(true);
    }
  });
});

describe('re-exports of paper-size predicates', () => {
  it('isPaperSize and isOrientation are functions', () => {
    expect(typeof isPaperSize).toBe('function');
    expect(typeof isOrientation).toBe('function');
  });
});
