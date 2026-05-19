// AddWidgetHandler coverage (S39 / Phase 2C).

import { describe, it, expect } from 'vitest';
import { applyPatches, enablePatches } from 'immer';
import { AddWidgetHandler } from '../src/handlers/AddWidget.js';
import {
  DuplicateWidgetIdError,
  SheetNotFoundError,
} from '../src/errors.js';
import type { SheetData } from '@pryzm/plugin-sdk';
import type { SheetsState } from '@pryzm/plugin-sdk';

enablePatches();

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

describe('AddWidgetHandler.canExecute', () => {
  const h = new AddWidgetHandler();

  it('accepts a valid text-widget payload', () => {
    expect(h.canExecute(ctx() as never, {
      sheetId: 'sheet-1', kind: 'text', x: 10, y: 20, width: 50, height: 12,
      payload: { text: 'Hello' },
    })).toEqual({ valid: true });
  });

  it('accepts every built-in kind with default payloads', () => {
    const kinds = [
      ['text', {}],
      ['image', { src: 'https://x/y.png' }],
      ['north-arrow', {}],
      ['scale-bar', {}],
      ['legend', {}],
      ['revisions-table', {}],
      ['schedule-snapshot', { scheduleId: 'doors' }],
      ['bim-tag', { anchorX: 5, anchorY: 5 }],
      ['line', {}],
      ['region', {}],
    ] as const;
    for (const [kind, payload] of kinds) {
      expect(h.canExecute(ctx() as never, {
        sheetId: 'sheet-1', kind, x: 0, y: 0, width: 20, height: 20, payload,
      })).toEqual({ valid: true });
    }
  });

  it('rejects an unknown sheet', () => {
    const r = h.canExecute(ctx() as never, {
      sheetId: 'nope', kind: 'text', x: 0, y: 0, width: 10, height: 10, payload: {},
    });
    expect(r.valid).toBe(false);
  });

  it('rejects an unknown kind', () => {
    const r = h.canExecute(ctx() as never, {
      sheetId: 'sheet-1', kind: 'mystery', x: 0, y: 0, width: 10, height: 10, payload: {},
    });
    expect(r.valid).toBe(false);
  });

  it('rejects non-positive width/height', () => {
    expect(h.canExecute(ctx() as never, {
      sheetId: 'sheet-1', kind: 'text', x: 0, y: 0, width: 0, height: 10, payload: {},
    }).valid).toBe(false);
    expect(h.canExecute(ctx() as never, {
      sheetId: 'sheet-1', kind: 'text', x: 0, y: 0, width: 10, height: -1, payload: {},
    }).valid).toBe(false);
  });

  it('rejects an invalid payload (image with empty src)', () => {
    const r = h.canExecute(ctx() as never, {
      sheetId: 'sheet-1', kind: 'image', x: 0, y: 0, width: 30, height: 30, payload: { src: '' },
    });
    expect(r.valid).toBe(false);
  });

  it('rejects a duplicate explicit id', () => {
    const state: SheetsState = {
      'sheet-1': { ...baseSheet, widgets: [
        { id: 'w-1', kind: 'text', x: 0, y: 0, width: 10, height: 10, payload: {} },
      ] },
    };
    const r = h.canExecute(ctx(state) as never, {
      sheetId: 'sheet-1', kind: 'text', x: 0, y: 0, width: 10, height: 10, id: 'w-1', payload: {},
    });
    expect(r.valid).toBe(false);
  });
});

describe('AddWidgetHandler.execute', () => {
  const h = new AddWidgetHandler();

  it('appends a widget with an auto-minted id when none given', () => {
    const r = h.execute(ctx() as never, {
      sheetId: 'sheet-1', kind: 'text', x: 1, y: 2, width: 3, height: 4,
      payload: { text: 'hi' },
    });
    const sheet = (r.nextStates!.sheet as SheetsState)['sheet-1']!;
    expect(sheet.widgets).toHaveLength(1);
    expect(sheet.widgets[0]!.kind).toBe('text');
    expect(typeof sheet.widgets[0]!.id).toBe('string');
    expect(sheet.widgets[0]!.id.length).toBeGreaterThan(0);
  });

  it('honours an explicit id', () => {
    const r = h.execute(ctx() as never, {
      sheetId: 'sheet-1', kind: 'line', x: 0, y: 0, width: 10, height: 10,
      id: 'w-explicit', payload: { x1: 0, y1: 0, x2: 10, y2: 0 },
    });
    const sheet = (r.nextStates!.sheet as SheetsState)['sheet-1']!;
    expect(sheet.widgets[0]!.id).toBe('w-explicit');
  });

  it('strips the discriminator from the stored payload (kind lives at top level)', () => {
    const r = h.execute(ctx() as never, {
      sheetId: 'sheet-1', kind: 'text', x: 0, y: 0, width: 10, height: 10,
      payload: { text: 'x' },
    });
    const sheet = (r.nextStates!.sheet as SheetsState)['sheet-1']!;
    expect((sheet.widgets[0]!.payload as Record<string, unknown>).kind).toBeUndefined();
    expect((sheet.widgets[0]!.payload as Record<string, unknown>).text).toBe('x');
  });

  it('produces invertible patches', () => {
    const r = h.execute(ctx() as never, {
      sheetId: 'sheet-1', kind: 'text', x: 0, y: 0, width: 10, height: 10, payload: {},
    });
    const after = applyPatches({ 'sheet-1': baseSheet }, [...r.forward]) as SheetsState;
    expect(after['sheet-1']!.widgets).toHaveLength(1);
    const back = applyPatches(after, [...r.inverse]) as SheetsState;
    expect(back['sheet-1']!.widgets).toHaveLength(0);
  });

  it('throws when the sheet has been deleted between can/execute', () => {
    expect(() => h.execute(ctx({}) as never, {
      sheetId: 'sheet-1', kind: 'text', x: 0, y: 0, width: 10, height: 10, payload: {},
    })).toThrow(SheetNotFoundError);
  });

  it('throws on an explicit duplicate id', () => {
    const state: SheetsState = {
      'sheet-1': { ...baseSheet, widgets: [
        { id: 'w-dup', kind: 'text', x: 0, y: 0, width: 10, height: 10, payload: {} },
      ] },
    };
    expect(() => h.execute(ctx(state) as never, {
      sheetId: 'sheet-1', kind: 'text', x: 0, y: 0, width: 10, height: 10, id: 'w-dup', payload: {},
    })).toThrow(DuplicateWidgetIdError);
  });
});
