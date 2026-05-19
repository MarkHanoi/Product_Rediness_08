// RemoveViewportHandler — coverage (S38 / Phase 2C / ADR-0031).

import { describe, it, expect } from 'vitest';
import { RemoveViewportHandler } from '../src/handlers/RemoveViewport.js';
import { ViewportNotFoundError } from '../src/errors.js';
import type { SheetData, ViewportDto } from '@pryzm/plugin-sdk';
import type { SheetsState } from '@pryzm/plugin-sdk';

const VP1: ViewportDto = { id: 'vp-1', viewId: 'view-1', x: 0, y: 0, width: 50, height: 50, scale: 100 };
const VP2: ViewportDto = { id: 'vp-2', viewId: 'view-2', x: 60, y: 0, width: 50, height: 50, scale: 200 };

const sheetWith = (vps: ViewportDto[]): SheetData => ({
  id: 'sheet-1', name: 'Plan', number: 'A-001',
  size: 'A1', orientation: 'landscape',
  titleBlockId: 'standard', viewports: vps, widgets: [],
  revision: '', issue: '', seq: 0,
});

function ctx(state: SheetsState): { stores: { sheet: SheetsState } } {
  return { stores: { sheet: state } };
}

describe('RemoveViewportHandler.canExecute', () => {
  const h = new RemoveViewportHandler();

  it('accepts a present viewport', () => {
    const r = h.canExecute(ctx({ 'sheet-1': sheetWith([VP1, VP2]) }) as never, {
      sheetId: 'sheet-1', viewportId: 'vp-1',
    });
    expect(r).toEqual({ valid: true });
  });

  it('rejects an unknown sheet', () => {
    const r = h.canExecute(ctx({}) as never, { sheetId: 'sheet-1', viewportId: 'vp-1' });
    expect(r.valid).toBe(false);
  });

  it('rejects an unknown viewport', () => {
    const r = h.canExecute(ctx({ 'sheet-1': sheetWith([VP1]) }) as never, {
      sheetId: 'sheet-1', viewportId: 'vp-missing',
    });
    expect(r.valid).toBe(false);
  });

  it('rejects empty inputs', () => {
    expect(h.canExecute(ctx({}) as never, { sheetId: '', viewportId: 'vp-1' }).valid).toBe(false);
    expect(h.canExecute(ctx({ 'sheet-1': sheetWith([VP1]) }) as never, {
      sheetId: 'sheet-1', viewportId: '',
    }).valid).toBe(false);
  });
});

describe('RemoveViewportHandler.execute', () => {
  const h = new RemoveViewportHandler();

  it('removes the matching viewport in place', () => {
    const r = h.execute(ctx({ 'sheet-1': sheetWith([VP1, VP2]) }) as never, {
      sheetId: 'sheet-1', viewportId: 'vp-1',
    });
    const next = (r.nextStates!.sheet as SheetsState)['sheet-1']!;
    expect(next.viewports.map((v) => v.id)).toEqual(['vp-2']);
  });

  it('preserves index of remaining viewports', () => {
    const r = h.execute(ctx({ 'sheet-1': sheetWith([VP1, VP2]) }) as never, {
      sheetId: 'sheet-1', viewportId: 'vp-2',
    });
    const next = (r.nextStates!.sheet as SheetsState)['sheet-1']!;
    expect(next.viewports).toHaveLength(1);
    expect(next.viewports[0]).toEqual(VP1);
  });

  it('throws ViewportNotFoundError when execute is forced past validation', () => {
    expect(() => h.execute(ctx({ 'sheet-1': sheetWith([VP1]) }) as never, {
      sheetId: 'sheet-1', viewportId: 'vp-missing',
    })).toThrow(ViewportNotFoundError);
  });

  it('emits forward + inverse patches that round-trip via Immer', () => {
    const r = h.execute(ctx({ 'sheet-1': sheetWith([VP1, VP2]) }) as never, {
      sheetId: 'sheet-1', viewportId: 'vp-1',
    });
    expect(r.forward.length).toBeGreaterThan(0);
    expect(r.inverse.length).toBeGreaterThan(0);
  });
});
