// DeleteSheetHandler — coverage (S37 / ADR-0031).

import { describe, it, expect } from 'vitest';
import { DeleteSheetHandler } from '../src/handlers/DeleteSheet.js';
import { SheetNotFoundError } from '../src/errors.js';
import type { SheetData } from '@pryzm/plugin-sdk';
import type { SheetsState } from '@pryzm/plugin-sdk';

type Stores = Readonly<{ sheet: SheetsState }>;
const ctx = (s: SheetsState): { stores: Stores } => ({ stores: { sheet: s } });

describe('DeleteSheetHandler.canExecute', () => {
  const h = new DeleteSheetHandler();
  it('rejects empty / wrong-typed sheetId', () => {
    expect(h.canExecute(ctx({}) as never, { sheetId: '' }).valid).toBe(false);
    expect(h.canExecute(ctx({}) as never, { sheetId: 1 as never }).valid).toBe(false);
  });
  it('rejects unknown sheet id', () => {
    expect(h.canExecute(ctx({}) as never, { sheetId: 'no-such' }).valid).toBe(false);
  });
  it('accepts an existing sheet id', () => {
    const r = h.canExecute(ctx({ a: { id: 'a' } as SheetData }) as never, { sheetId: 'a' });
    expect(r.valid).toBe(true);
  });
});

describe('DeleteSheetHandler.execute', () => {
  const h = new DeleteSheetHandler();
  it('removes the entry and emits inverse that re-adds it', () => {
    const original = { id: 'a', name: 'A', number: 'A-001', seq: 0 } as SheetData;
    const r = h.execute(ctx({ a: original }) as never, { sheetId: 'a' });
    expect(Object.keys(r.nextStates!.sheet as SheetsState)).toEqual([]);
    expect(r.inverse.some((p) => p.op === 'add' && p.path[0] === 'a')).toBe(true);
  });
  it('throws SheetNotFoundError if execute is called with a missing id', () => {
    expect(() => h.execute(ctx({}) as never, { sheetId: 'missing' })).toThrow(SheetNotFoundError);
  });
});
