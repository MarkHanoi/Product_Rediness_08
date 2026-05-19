// RemoveWidgetHandler coverage (S39 / Phase 2C).

import { describe, it, expect } from 'vitest';
import { applyPatches, enablePatches } from 'immer';
import { RemoveWidgetHandler } from '../src/handlers/RemoveWidget.js';
import { WidgetNotFoundError, SheetNotFoundError } from '../src/errors.js';
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
  widgets: [
    { id: 'w-1', kind: 'text', x: 0, y: 0, width: 10, height: 10, payload: { text: 'a' } },
    { id: 'w-2', kind: 'line', x: 0, y: 0, width: 10, height: 10, payload: {} },
  ],
  revision: '',
  issue: '',
  seq: 0,
};

function ctx(state: SheetsState = { 'sheet-1': baseSheet }): { stores: { sheet: SheetsState } } {
  return { stores: { sheet: state } };
}

describe('RemoveWidgetHandler.canExecute', () => {
  const h = new RemoveWidgetHandler();

  it('accepts a valid widget id', () => {
    expect(h.canExecute(ctx() as never, { sheetId: 'sheet-1', widgetId: 'w-1' }))
      .toEqual({ valid: true });
  });

  it('rejects unknown sheet', () => {
    expect(h.canExecute(ctx() as never, { sheetId: 'nope', widgetId: 'w-1' }).valid).toBe(false);
  });

  it('rejects unknown widget', () => {
    expect(h.canExecute(ctx() as never, { sheetId: 'sheet-1', widgetId: 'w-999' }).valid).toBe(false);
  });

  it('rejects empty widget id', () => {
    expect(h.canExecute(ctx() as never, { sheetId: 'sheet-1', widgetId: '' }).valid).toBe(false);
  });
});

describe('RemoveWidgetHandler.execute', () => {
  const h = new RemoveWidgetHandler();

  it('removes the matching widget by id', () => {
    const r = h.execute(ctx() as never, { sheetId: 'sheet-1', widgetId: 'w-1' });
    const after = (r.nextStates!.sheet as SheetsState)['sheet-1']!;
    expect(after.widgets.map((w) => w.id)).toEqual(['w-2']);
  });

  it('produces patches whose inverse restores the widget at the same index', () => {
    const r = h.execute(ctx() as never, { sheetId: 'sheet-1', widgetId: 'w-1' });
    const after = applyPatches({ 'sheet-1': baseSheet }, [...r.forward]) as SheetsState;
    expect(after['sheet-1']!.widgets.map((w) => w.id)).toEqual(['w-2']);
    const back = applyPatches(after, [...r.inverse]) as SheetsState;
    expect(back['sheet-1']!.widgets.map((w) => w.id)).toEqual(['w-1', 'w-2']);
  });

  it('throws when the sheet vanishes between can/execute', () => {
    expect(() => h.execute(ctx({}) as never, { sheetId: 'sheet-1', widgetId: 'w-1' }))
      .toThrow(SheetNotFoundError);
  });

  it('throws WidgetNotFoundError on unknown id', () => {
    expect(() => h.execute(ctx() as never, { sheetId: 'sheet-1', widgetId: 'no-such' }))
      .toThrow(WidgetNotFoundError);
  });
});
