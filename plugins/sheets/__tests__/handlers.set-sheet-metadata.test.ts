// SetSheetMetadataHandler — coverage (S38 / Phase 2C / ADR-0031).

import { describe, it, expect } from 'vitest';
import {
  SetSheetMetadataHandler,
  SHEET_METADATA_FIELD_MAX_LEN,
} from '../src/handlers/SetSheetMetadata.js';
import type { SheetData } from '@pryzm/plugin-sdk';
import type { SheetsState } from '@pryzm/plugin-sdk';

const baseSheet: SheetData = {
  id: 'sheet-1', name: 'Plan', number: 'A-001',
  size: 'A1', orientation: 'landscape',
  titleBlockId: 'standard', viewports: [], widgets: [],
  revision: '', issue: '', seq: 0,
};

function ctx(state: SheetsState = { 'sheet-1': baseSheet }): { stores: { sheet: SheetsState } } {
  return { stores: { sheet: state } };
}

describe('SetSheetMetadataHandler.canExecute', () => {
  const h = new SetSheetMetadataHandler();

  it('accepts any single update', () => {
    expect(h.canExecute(ctx() as never, { sheetId: 'sheet-1', revision: 'P1' })).toEqual({ valid: true });
    expect(h.canExecute(ctx() as never, { sheetId: 'sheet-1', issue: 'FOR REVIEW' })).toEqual({ valid: true });
    expect(h.canExecute(ctx() as never, { sheetId: 'sheet-1', approvedBy: 'A. Architect' })).toEqual({ valid: true });
    expect(h.canExecute(ctx() as never, { sheetId: 'sheet-1', approvedBy: null })).toEqual({ valid: true });
  });

  it('rejects an unknown sheet', () => {
    const r = h.canExecute(ctx({}) as never, { sheetId: 'sheet-1', revision: 'P1' });
    expect(r.valid).toBe(false);
  });

  it('rejects a no-op call', () => {
    const r = h.canExecute(ctx() as never, { sheetId: 'sheet-1' });
    expect(r.valid).toBe(false);
  });

  it('rejects oversize values', () => {
    const tooLong = 'x'.repeat(SHEET_METADATA_FIELD_MAX_LEN + 1);
    expect(h.canExecute(ctx() as never, { sheetId: 'sheet-1', revision: tooLong }).valid).toBe(false);
    expect(h.canExecute(ctx() as never, { sheetId: 'sheet-1', issue: tooLong }).valid).toBe(false);
    expect(h.canExecute(ctx() as never, { sheetId: 'sheet-1', approvedBy: tooLong }).valid).toBe(false);
  });

  it('rejects non-string values', () => {
    expect(h.canExecute(ctx() as never, { sheetId: 'sheet-1', revision: 123 as never }).valid).toBe(false);
  });
});

describe('SetSheetMetadataHandler.execute', () => {
  const h = new SetSheetMetadataHandler();

  it('updates revision and issue independently', () => {
    const r = h.execute(ctx() as never, {
      sheetId: 'sheet-1', revision: 'P2', issue: 'FOR CONSTRUCTION',
    });
    const s = (r.nextStates!.sheet as SheetsState)['sheet-1']!;
    expect(s.revision).toBe('P2');
    expect(s.issue).toBe('FOR CONSTRUCTION');
  });

  it('sets and clears approvedBy via null sentinel', () => {
    const r1 = h.execute(ctx() as never, { sheetId: 'sheet-1', approvedBy: 'A. Architect' });
    expect((r1.nextStates!.sheet as SheetsState)['sheet-1']!.approvedBy).toBe('A. Architect');

    const seeded: SheetsState = { 'sheet-1': { ...baseSheet, approvedBy: 'A. Architect' } };
    const r2 = h.execute(ctx(seeded) as never, { sheetId: 'sheet-1', approvedBy: null });
    expect((r2.nextStates!.sheet as SheetsState)['sheet-1']!.approvedBy).toBeUndefined();
  });

  it('preserves untouched fields', () => {
    const r = h.execute(ctx() as never, { sheetId: 'sheet-1', revision: 'P1' });
    const s = (r.nextStates!.sheet as SheetsState)['sheet-1']!;
    expect(s.name).toBe('Plan');
    expect(s.number).toBe('A-001');
    expect(s.issue).toBe('');
  });

  it('emits forward + inverse patches', () => {
    const r = h.execute(ctx() as never, { sheetId: 'sheet-1', revision: 'P1' });
    expect(r.forward.length).toBeGreaterThan(0);
    expect(r.inverse.length).toBeGreaterThan(0);
  });
});
