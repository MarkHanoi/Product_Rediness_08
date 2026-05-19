// Book — pure-data invariants + helper functions (S40).

import { describe, it, expect } from 'vitest';
import {
  BookSchema,
  createBook,
  addSheetToBook,
  removeSheetFromBook,
  moveSheetInBook,
} from '../src/book/book.js';

describe('BookSchema', () => {
  it('parses a valid empty book + applies defaults', () => {
    const b = BookSchema.parse({ id: 'b-1', name: 'Test', sheetIds: [] });
    expect(b).toEqual({ id: 'b-1', name: 'Test', sheetIds: [], revision: '', issuedFor: '', issuedDate: '' });
  });

  it('rejects duplicate sheet ids', () => {
    expect(() => BookSchema.parse({ id: 'b', name: 'n', sheetIds: ['a', 'a'] })).toThrow();
  });

  it('rejects empty id and empty name', () => {
    expect(() => BookSchema.parse({ id: '', name: 'n', sheetIds: [] })).toThrow();
    expect(() => BookSchema.parse({ id: 'b', name: '', sheetIds: [] })).toThrow();
  });

  it('rejects empty sheet id strings inside the array', () => {
    expect(() => BookSchema.parse({ id: 'b', name: 'n', sheetIds: ['a', ''] })).toThrow();
  });
});

describe('createBook', () => {
  it('throws when starter input contains duplicates', () => {
    expect(() => createBook({ id: 'b', name: 'n', sheetIds: ['s', 's'] })).toThrow();
  });
});

describe('addSheetToBook', () => {
  it('appends new sheet ids', () => {
    const b = createBook({ id: 'b', name: 'n' });
    const b2 = addSheetToBook(b, 's-1');
    expect(b2.sheetIds).toEqual(['s-1']);
  });

  it('is a no-op for already-present sheet ids', () => {
    const b = createBook({ id: 'b', name: 'n', sheetIds: ['s-1'] });
    expect(addSheetToBook(b, 's-1')).toBe(b);
  });

  it('does not mutate the input', () => {
    const b = createBook({ id: 'b', name: 'n' });
    addSheetToBook(b, 's-1');
    expect(b.sheetIds).toEqual([]);
  });
});

describe('removeSheetFromBook', () => {
  it('removes a present sheet id', () => {
    const b = createBook({ id: 'b', name: 'n', sheetIds: ['a', 'b', 'c'] });
    expect(removeSheetFromBook(b, 'b').sheetIds).toEqual(['a', 'c']);
  });

  it('is a no-op for missing sheet ids', () => {
    const b = createBook({ id: 'b', name: 'n', sheetIds: ['a'] });
    expect(removeSheetFromBook(b, 'z')).toBe(b);
  });
});

describe('moveSheetInBook', () => {
  it('moves a sheet to the requested index', () => {
    const b = createBook({ id: 'b', name: 'n', sheetIds: ['a', 'b', 'c', 'd'] });
    expect(moveSheetInBook(b, 'a', 2).sheetIds).toEqual(['b', 'c', 'a', 'd']);
    expect(moveSheetInBook(b, 'd', 0).sheetIds).toEqual(['d', 'a', 'b', 'c']);
  });

  it('clamps out-of-range indices', () => {
    const b = createBook({ id: 'b', name: 'n', sheetIds: ['a', 'b', 'c'] });
    expect(moveSheetInBook(b, 'a', 99).sheetIds).toEqual(['b', 'c', 'a']);
    expect(moveSheetInBook(b, 'c', -5).sheetIds).toEqual(['c', 'a', 'b']);
  });

  it('is a no-op when the sheet id is missing', () => {
    const b = createBook({ id: 'b', name: 'n', sheetIds: ['a', 'b'] });
    expect(moveSheetInBook(b, 'z', 0)).toBe(b);
  });

  it('is a no-op when the sheet is already at the target index', () => {
    const b = createBook({ id: 'b', name: 'n', sheetIds: ['a', 'b'] });
    expect(moveSheetInBook(b, 'a', 0)).toBe(b);
  });
});
