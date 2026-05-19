// CreateSheetHandler — coverage (S37 / ADR-0031).

import { describe, it, expect } from 'vitest';
import { CreateSheetHandler } from '../src/handlers/CreateSheet.js';
import { DuplicateSheetIdError } from '../src/errors.js';
import type { SheetData } from '@pryzm/plugin-sdk';
import type { SheetsState } from '@pryzm/plugin-sdk';

type Stores = Readonly<{ sheet: SheetsState }>;

function ctx(state: SheetsState = {}): { stores: Stores } {
  return { stores: { sheet: state } };
}

describe('CreateSheetHandler.canExecute', () => {
  const h = new CreateSheetHandler();

  it('accepts a minimal payload', () => {
    expect(h.canExecute(ctx() as never, {})).toEqual({ valid: true });
  });

  it('rejects an empty id', () => {
    const r = h.canExecute(ctx() as never, { id: '' });
    expect(r.valid).toBe(false);
  });

  it('rejects a duplicate id', () => {
    const state: SheetsState = { 'sheet-1': { id: 'sheet-1' } as SheetData };
    const r = h.canExecute(ctx(state) as never, { id: 'sheet-1' });
    expect(r.valid).toBe(false);
  });

  it('rejects an invalid name (empty / too long)', () => {
    expect(h.canExecute(ctx() as never, { name: '' }).valid).toBe(false);
    expect(h.canExecute(ctx() as never, { name: 'x'.repeat(201) }).valid).toBe(false);
  });

  it('rejects an unknown size / orientation', () => {
    expect(h.canExecute(ctx() as never, { size: 'B5' as never }).valid).toBe(false);
    expect(h.canExecute(ctx() as never, { orientation: 'square' as never }).valid).toBe(false);
  });

  it('rejects a malformed sheet number', () => {
    expect(h.canExecute(ctx() as never, { number: 'a-001' }).valid).toBe(false);
    expect(h.canExecute(ctx() as never, { number: 'A001' }).valid).toBe(false);
  });

  it('rejects a duplicate sheet number', () => {
    const state: SheetsState = { 'sheet-1': { id: 'sheet-1', number: 'A-001' } as SheetData };
    const r = h.canExecute(ctx(state) as never, { number: 'A-001' });
    expect(r.valid).toBe(false);
  });

  it('rejects a non-integer or negative seq', () => {
    expect(h.canExecute(ctx() as never, { seq: 1.5 }).valid).toBe(false);
    expect(h.canExecute(ctx() as never, { seq: -1 }).valid).toBe(false);
  });
});

describe('CreateSheetHandler.execute', () => {
  const h = new CreateSheetHandler();

  it('mints a sheet with auto-generated id and number when none supplied', () => {
    const r = h.execute(ctx() as never, {});
    const next = r.nextStates!.sheet as SheetsState;
    const ids = Object.keys(next);
    expect(ids).toHaveLength(1);
    const sheet = next[ids[0]!]!;
    expect(sheet.number).toMatch(/^A-\d{3,}$/);
    expect(sheet.size).toBe('A1');
    expect(sheet.orientation).toBe('landscape');
    expect(sheet.seq).toBe(0);
    expect(sheet.viewports).toEqual([]);
    expect(sheet.widgets).toEqual([]);
  });

  it('honours explicit id, name, number, size, orientation', () => {
    const r = h.execute(ctx() as never, {
      id: 'sheet-x', name: 'Site Plan', number: 'M-101',
      size: 'A3', orientation: 'portrait',
    });
    const sheet = (r.nextStates!.sheet as SheetsState)['sheet-x']!;
    expect(sheet.name).toBe('Site Plan');
    expect(sheet.number).toBe('M-101');
    expect(sheet.size).toBe('A3');
    expect(sheet.orientation).toBe('portrait');
  });

  it('emits forward + inverse patches that round-trip', () => {
    const r = h.execute(ctx() as never, { id: 'sheet-rt', name: 'X', number: 'A-001' });
    expect(r.forward.length).toBeGreaterThan(0);
    expect(r.inverse.length).toBeGreaterThan(0);
    // Inverse should remove the just-added entry.
    expect(r.inverse.some((p) => p.op === 'remove' && p.path[0] === 'sheet-rt')).toBe(true);
  });

  it('appends with seq = max(existing seqs) + 1', () => {
    const state: SheetsState = {
      'a': { id: 'a', seq: 0, number: 'A-001' } as SheetData,
      'b': { id: 'b', seq: 5, number: 'A-002' } as SheetData,
    };
    const r = h.execute(ctx(state) as never, { id: 'c', name: 'C', number: 'A-003' });
    expect((r.nextStates!.sheet as SheetsState)['c']!.seq).toBe(6);
  });

  it('auto-numbering picks (max(existing prefix index) + 1)', () => {
    const state: SheetsState = {
      'a': { id: 'a', number: 'A-001' } as SheetData,
      'b': { id: 'b', number: 'A-005' } as SheetData,
      'c': { id: 'c', number: 'A-003' } as SheetData,
    };
    const r = h.execute(ctx(state) as never, {});
    const ids = Object.keys(r.nextStates!.sheet as SheetsState);
    const newSheet = (r.nextStates!.sheet as SheetsState)[ids.find((id) => id !== 'a' && id !== 'b' && id !== 'c')!]!;
    expect(newSheet.number).toBe('A-006');
  });

  it('autoNumberPrefix overrides the default A', () => {
    const r = h.execute(ctx() as never, { id: 'sheet-mep', autoNumberPrefix: 'M' });
    expect((r.nextStates!.sheet as SheetsState)['sheet-mep']!.number).toMatch(/^M-/);
  });

  it('throws DuplicateSheetIdError if execute runs against a state that already contains the id', () => {
    const state: SheetsState = { 'dup': { id: 'dup' } as SheetData };
    expect(() => h.execute(ctx(state) as never, { id: 'dup' })).toThrow(DuplicateSheetIdError);
  });
});
