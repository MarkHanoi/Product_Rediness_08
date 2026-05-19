// SetViewportScaleHandler — coverage (S38 / Phase 2C / ADR-0031).

import { describe, it, expect } from 'vitest';
import { SetViewportScaleHandler } from '../src/handlers/SetViewportScale.js';
import { ViewportNotFoundError } from '../src/errors.js';
import type { SheetData, ViewportDto } from '@pryzm/plugin-sdk';
import type { SheetsState } from '@pryzm/plugin-sdk';

const VP: ViewportDto = { id: 'vp-1', viewId: 'view-1', x: 10, y: 20, width: 100, height: 80, scale: 100 };

const sheetWith = (vps: ViewportDto[]): SheetData => ({
  id: 'sheet-1', name: 'Plan', number: 'A-001',
  size: 'A1', orientation: 'landscape',
  titleBlockId: 'standard', viewports: vps, widgets: [],
  revision: '', issue: '', seq: 0,
});

function ctx(state: SheetsState = { 'sheet-1': sheetWith([VP]) }): { stores: { sheet: SheetsState } } {
  return { stores: { sheet: state } };
}

describe('SetViewportScaleHandler.canExecute', () => {
  const h = new SetViewportScaleHandler();

  it('accepts a scale-only update', () => {
    expect(h.canExecute(ctx() as never, { sheetId: 'sheet-1', viewportId: 'vp-1', scale: 50 })).toEqual({ valid: true });
  });

  it('rejects a no-op call', () => {
    const r = h.canExecute(ctx() as never, { sheetId: 'sheet-1', viewportId: 'vp-1' });
    expect(r.valid).toBe(false);
  });

  it('rejects unknown sheet / viewport', () => {
    expect(h.canExecute(ctx({}) as never, { sheetId: 'sheet-1', viewportId: 'vp-1', scale: 50 }).valid).toBe(false);
    expect(h.canExecute(ctx() as never, { sheetId: 'sheet-1', viewportId: 'nope', scale: 50 }).valid).toBe(false);
  });

  it('rejects bad numeric inputs', () => {
    const base = { sheetId: 'sheet-1', viewportId: 'vp-1' };
    expect(h.canExecute(ctx() as never, { ...base, scale: 0 }).valid).toBe(false);
    expect(h.canExecute(ctx() as never, { ...base, scale: -1 }).valid).toBe(false);
    expect(h.canExecute(ctx() as never, { ...base, scale: Number.NaN }).valid).toBe(false);
    expect(h.canExecute(ctx() as never, { ...base, x: Number.POSITIVE_INFINITY }).valid).toBe(false);
    expect(h.canExecute(ctx() as never, { ...base, width: 0 }).valid).toBe(false);
  });

  it('rejects malformed clippingBox', () => {
    const r = h.canExecute(ctx() as never, {
      sheetId: 'sheet-1', viewportId: 'vp-1',
      clippingBox: { x: 0, y: 0, width: -1, height: 10 },
    });
    expect(r.valid).toBe(false);
  });
});

describe('SetViewportScaleHandler.execute', () => {
  const h = new SetViewportScaleHandler();

  it('updates scale only', () => {
    const r = h.execute(ctx() as never, { sheetId: 'sheet-1', viewportId: 'vp-1', scale: 200 });
    const vp = (r.nextStates!.sheet as SheetsState)['sheet-1']!.viewports[0]!;
    expect(vp.scale).toBe(200);
    expect(vp.x).toBe(10);
    expect(vp.y).toBe(20);
    expect(vp.width).toBe(100);
    expect(vp.height).toBe(80);
  });

  it('updates rectangle without touching scale', () => {
    const r = h.execute(ctx() as never, {
      sheetId: 'sheet-1', viewportId: 'vp-1',
      x: 5, y: 6, width: 200, height: 150,
    });
    const vp = (r.nextStates!.sheet as SheetsState)['sheet-1']!.viewports[0]!;
    expect(vp).toMatchObject({ x: 5, y: 6, width: 200, height: 150, scale: 100 });
  });

  it('sets and clears clippingBox via null sentinel', () => {
    const seeded: SheetsState = {
      'sheet-1': sheetWith([{ ...VP, clippingBox: { x: 0, y: 0, width: 10, height: 10 } }]),
    };
    const r = h.execute(ctx(seeded) as never, {
      sheetId: 'sheet-1', viewportId: 'vp-1', clippingBox: null,
    });
    expect((r.nextStates!.sheet as SheetsState)['sheet-1']!.viewports[0]!.clippingBox).toBeUndefined();

    const r2 = h.execute(ctx() as never, {
      sheetId: 'sheet-1', viewportId: 'vp-1',
      clippingBox: { x: 1, y: 2, width: 3, height: 4 },
    });
    expect((r2.nextStates!.sheet as SheetsState)['sheet-1']!.viewports[0]!.clippingBox).toEqual({ x: 1, y: 2, width: 3, height: 4 });
  });

  it('throws ViewportNotFoundError when execute is forced past validation', () => {
    expect(() => h.execute(ctx() as never, {
      sheetId: 'sheet-1', viewportId: 'nope', scale: 50,
    })).toThrow(ViewportNotFoundError);
  });
});
