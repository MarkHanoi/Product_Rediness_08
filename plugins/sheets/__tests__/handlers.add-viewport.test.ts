// AddViewportHandler — coverage (S38 / Phase 2C / ADR-0031).

import { describe, it, expect } from 'vitest';
import { AddViewportHandler } from '../src/handlers/AddViewport.js';
import { DuplicateViewportIdError } from '../src/errors.js';
import type { SheetData } from '@pryzm/plugin-sdk';
import type { SheetsState } from '@pryzm/plugin-sdk';

const baseSheet: SheetData = {
  id: 'sheet-1',
  name: 'Plan',
  number: 'A-001',
  size: 'A1',
  orientation: 'landscape',
  titleBlockId: 'standard',
  viewports: [],
  widgets: [],
  revision: '',
  issue: '',
  seq: 0,
};

function ctx(state: SheetsState = { 'sheet-1': baseSheet }): { stores: { sheet: SheetsState } } {
  return { stores: { sheet: state } };
}

describe('AddViewportHandler.canExecute', () => {
  const h = new AddViewportHandler();

  it('accepts a complete payload', () => {
    expect(h.canExecute(ctx() as never, {
      sheetId: 'sheet-1', viewId: 'view-1', x: 10, y: 20,
      width: 100, height: 80, scale: 100,
    })).toEqual({ valid: true });
  });

  it('rejects an unknown sheet', () => {
    const r = h.canExecute(ctx() as never, {
      sheetId: 'nope', viewId: 'view-1', x: 0, y: 0, width: 50, height: 50, scale: 100,
    });
    expect(r.valid).toBe(false);
  });

  it('rejects empty viewId', () => {
    const r = h.canExecute(ctx() as never, {
      sheetId: 'sheet-1', viewId: '', x: 0, y: 0, width: 50, height: 50, scale: 100,
    });
    expect(r.valid).toBe(false);
  });

  it('rejects non-positive dimensions and scale', () => {
    const base = { sheetId: 'sheet-1', viewId: 'view-1', x: 0, y: 0 };
    expect(h.canExecute(ctx() as never, { ...base, width: 0, height: 50, scale: 100 }).valid).toBe(false);
    expect(h.canExecute(ctx() as never, { ...base, width: 50, height: -1, scale: 100 }).valid).toBe(false);
    expect(h.canExecute(ctx() as never, { ...base, width: 50, height: 50, scale: 0 }).valid).toBe(false);
    expect(h.canExecute(ctx() as never, { ...base, width: 50, height: 50, scale: -100 }).valid).toBe(false);
    expect(h.canExecute(ctx() as never, { ...base, width: 50, height: 50, scale: Number.POSITIVE_INFINITY }).valid).toBe(false);
  });

  it('rejects a duplicate explicit id', () => {
    const state: SheetsState = {
      'sheet-1': { ...baseSheet, viewports: [
        { id: 'vp-1', viewId: 'view-1', x: 0, y: 0, width: 10, height: 10, scale: 100 },
      ] },
    };
    const r = h.canExecute(ctx(state) as never, {
      sheetId: 'sheet-1', viewId: 'view-2', x: 0, y: 0, width: 50, height: 50, scale: 100, id: 'vp-1',
    });
    expect(r.valid).toBe(false);
  });
});

describe('AddViewportHandler.execute', () => {
  const h = new AddViewportHandler();

  it('appends a viewport with an auto-minted id when none given', () => {
    const r = h.execute(ctx() as never, {
      sheetId: 'sheet-1', viewId: 'view-1', x: 10, y: 20, width: 100, height: 80, scale: 100,
    });
    const sheet = (r.nextStates!.sheet as SheetsState)['sheet-1']!;
    expect(sheet.viewports).toHaveLength(1);
    const vp = sheet.viewports[0]!;
    expect(vp.id).toMatch(/^view_/);
    expect(vp.viewId).toBe('view-1');
    expect(vp.scale).toBe(100);
    expect(vp.width).toBe(100);
    expect(vp.height).toBe(80);
  });

  it('honours explicit id and clippingBox', () => {
    const r = h.execute(ctx() as never, {
      sheetId: 'sheet-1', viewId: 'view-1', id: 'vp-explicit',
      x: 0, y: 0, width: 50, height: 50, scale: 200,
      clippingBox: { x: 1, y: 2, width: 3, height: 4 },
    });
    const sheet = (r.nextStates!.sheet as SheetsState)['sheet-1']!;
    expect(sheet.viewports[0]!.id).toBe('vp-explicit');
    expect(sheet.viewports[0]!.clippingBox).toEqual({ x: 1, y: 2, width: 3, height: 4 });
  });

  it('throws DuplicateViewportIdError when execute is forced past validation', () => {
    const state: SheetsState = {
      'sheet-1': { ...baseSheet, viewports: [
        { id: 'vp-1', viewId: 'view-1', x: 0, y: 0, width: 10, height: 10, scale: 100 },
      ] },
    };
    expect(() => h.execute(ctx(state) as never, {
      sheetId: 'sheet-1', viewId: 'view-2', id: 'vp-1', x: 0, y: 0, width: 50, height: 50, scale: 100,
    })).toThrow(DuplicateViewportIdError);
  });

  it('emits forward + inverse patches', () => {
    const r = h.execute(ctx() as never, {
      sheetId: 'sheet-1', viewId: 'view-1', x: 0, y: 0, width: 50, height: 50, scale: 100,
    });
    expect(r.forward.length).toBeGreaterThan(0);
    expect(r.inverse.length).toBeGreaterThan(0);
  });

  it('declares affectedStores=[sheet]', () => {
    expect(h.affectedStores).toEqual(['sheet']);
  });
});
