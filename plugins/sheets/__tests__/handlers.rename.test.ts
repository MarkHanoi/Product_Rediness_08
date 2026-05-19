// RenameSheetHandler — coverage (S37 / ADR-0031).

import { describe, it, expect } from 'vitest';
import { RenameSheetHandler } from '../src/handlers/RenameSheet.js';
import { SheetNotFoundError, DuplicateSheetNumberError } from '../src/errors.js';
import type { SheetData } from '@pryzm/plugin-sdk';
import type { SheetsState } from '@pryzm/plugin-sdk';

type Stores = Readonly<{ sheet: SheetsState }>;
const ctx = (s: SheetsState): { stores: Stores } => ({ stores: { sheet: s } });
const seed = (over: Partial<SheetData> = {}): SheetData => ({
  id: 'a', name: 'A', number: 'A-001', size: 'A1', orientation: 'landscape',
  titleBlockId: 'tb', viewports: [], widgets: [], revision: '', issue: '', seq: 0,
  ...over,
});

describe('RenameSheetHandler.canExecute', () => {
  const h = new RenameSheetHandler();

  it('rejects unknown sheetId', () => {
    expect(h.canExecute(ctx({}) as never, { sheetId: 'x' }).valid).toBe(false);
  });

  it('requires at least one of name or number', () => {
    const r = h.canExecute(ctx({ a: seed() }) as never, { sheetId: 'a' });
    expect(r.valid).toBe(false);
  });

  it('rejects malformed sheet number', () => {
    const r = h.canExecute(ctx({ a: seed() }) as never, { sheetId: 'a', number: 'a-001' });
    expect(r.valid).toBe(false);
  });

  it('rejects duplicate number', () => {
    const state: SheetsState = { a: seed(), b: seed({ id: 'b', number: 'A-002' }) };
    const r = h.canExecute(ctx(state) as never, { sheetId: 'a', number: 'A-002' });
    expect(r.valid).toBe(false);
  });

  it('allows a sheet to keep its own number', () => {
    const r = h.canExecute(ctx({ a: seed() }) as never, { sheetId: 'a', number: 'A-001' });
    expect(r.valid).toBe(true);
  });

  it('rejects name that is empty or too long', () => {
    expect(h.canExecute(ctx({ a: seed() }) as never, { sheetId: 'a', name: '' }).valid).toBe(false);
    expect(h.canExecute(ctx({ a: seed() }) as never, { sheetId: 'a', name: 'x'.repeat(201) }).valid).toBe(false);
  });
});

describe('RenameSheetHandler.execute', () => {
  const h = new RenameSheetHandler();

  it('updates name only', () => {
    const r = h.execute(ctx({ a: seed() }) as never, { sheetId: 'a', name: 'Renamed' });
    const next = (r.nextStates!.sheet as SheetsState)['a']!;
    expect(next.name).toBe('Renamed');
    expect(next.number).toBe('A-001');
  });

  it('updates number only', () => {
    const r = h.execute(ctx({ a: seed() }) as never, { sheetId: 'a', number: 'A-099' });
    const next = (r.nextStates!.sheet as SheetsState)['a']!;
    expect(next.number).toBe('A-099');
    expect(next.name).toBe('A');
  });

  it('updates both at once', () => {
    const r = h.execute(ctx({ a: seed() }) as never, { sheetId: 'a', name: 'X', number: 'A-009' });
    const next = (r.nextStates!.sheet as SheetsState)['a']!;
    expect(next).toMatchObject({ name: 'X', number: 'A-009' });
  });

  it('emits inverse that restores the original name + number', () => {
    const r = h.execute(ctx({ a: seed() }) as never, { sheetId: 'a', name: 'X', number: 'A-009' });
    expect(r.forward.length).toBeGreaterThan(0);
    expect(r.inverse.length).toBeGreaterThan(0);
  });

  it('throws SheetNotFoundError on missing id', () => {
    expect(() => h.execute(ctx({}) as never, { sheetId: 'no', name: 'X' })).toThrow(SheetNotFoundError);
  });

  it('throws DuplicateSheetNumberError if the desired number is in use by a different sheet', () => {
    const state: SheetsState = { a: seed(), b: seed({ id: 'b', number: 'A-002' }) };
    expect(() => h.execute(ctx(state) as never, { sheetId: 'a', number: 'A-002' }))
      .toThrow(DuplicateSheetNumberError);
  });
});
