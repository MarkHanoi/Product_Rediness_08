// sheet-list.ts — view-model + dispatch helper coverage (S37 / ADR-0031).

import { describe, it, expect, vi } from 'vitest';
import { SheetStore, ActiveSheetStore } from '@pryzm/plugin-sdk';
import {
  getSheetListItems,
  subscribeSheetList,
  activateSheet,
  dispatchCreateSheet,
  dispatchDeleteSheet,
  dispatchRenameSheet,
  dispatchReorderSheet,
} from '../src/sheet-list.js';
import type { SheetData } from '@pryzm/plugin-sdk';

function seed(over: Partial<SheetData> = {}): SheetData {
  return {
    id: 'a', name: 'A', number: 'A-001', size: 'A1', orientation: 'landscape',
    titleBlockId: 'tb', viewports: [], widgets: [], revision: '', issue: '', seq: 0,
    ...over,
  };
}

describe('getSheetListItems', () => {
  it('returns sheets in canonical order with isActive precomputed', () => {
    const sheets = new SheetStore();
    const active = new ActiveSheetStore({ activeSheetId: 'b' });
    sheets.applyPatch([
      { op: 'add', path: ['a'], value: seed({ id: 'a', name: 'A', number: 'A-001', seq: 0 }) },
      { op: 'add', path: ['b'], value: seed({ id: 'b', name: 'B', number: 'A-002', seq: 1 }) },
    ]);
    const items = getSheetListItems(sheets, active);
    expect(items.map((i) => i.id)).toEqual(['a', 'b']);
    expect(items.map((i) => i.isActive)).toEqual([false, true]);
    expect(Object.isFrozen(items)).toBe(true);
  });

  it('returns an empty list when no sheets are present', () => {
    const sheets = new SheetStore();
    const active = new ActiveSheetStore();
    expect(getSheetListItems(sheets, active)).toEqual([]);
  });
});

describe('subscribeSheetList', () => {
  it('fires onChange for either store mutation', () => {
    const sheets = new SheetStore();
    const active = new ActiveSheetStore();
    const onChange = vi.fn();
    const dispose = subscribeSheetList(sheets, active, onChange);

    sheets.applyPatch([{ op: 'add', path: ['a'], value: seed() }]);
    expect(onChange).toHaveBeenCalledTimes(1);

    active.setActive('a');
    expect(onChange).toHaveBeenCalledTimes(2);

    dispose();
    sheets.applyPatch([{ op: 'remove', path: ['a'] }]);
    active.setActive(null);
    expect(onChange).toHaveBeenCalledTimes(2);
  });

  it('disposer is idempotent', () => {
    const sheets = new SheetStore();
    const active = new ActiveSheetStore();
    const dispose = subscribeSheetList(sheets, active, () => {});
    dispose();
    expect(() => dispose()).not.toThrow();
  });
});

describe('activateSheet', () => {
  it('proxies to ActiveSheetStore.setActive', () => {
    const active = new ActiveSheetStore();
    activateSheet(active, 'sheet-7');
    expect(active.getActive().activeSheetId).toBe('sheet-7');
    activateSheet(active, null);
    expect(active.getActive().activeSheetId).toBeNull();
  });
});

describe('dispatch helpers', () => {
  function makeBus() {
    const calls: { type: string; payload: unknown }[] = [];
    const bus = {
      executeCommand: vi.fn((type: string, payload: unknown) => {
        calls.push({ type, payload });
        return Promise.resolve({});
      }),
    };
    return { bus, calls };
  }

  it('dispatchCreateSheet → sheet.create with payload', () => {
    const { bus, calls } = makeBus();
    dispatchCreateSheet(bus as never, { name: 'X' });
    expect(calls).toEqual([{ type: 'sheet.create', payload: { name: 'X' } }]);
  });

  it('dispatchDeleteSheet → sheet.delete with { sheetId }', () => {
    const { bus, calls } = makeBus();
    dispatchDeleteSheet(bus as never, 'a');
    expect(calls).toEqual([{ type: 'sheet.delete', payload: { sheetId: 'a' } }]);
  });

  it('dispatchRenameSheet → sheet.rename with merged changes', () => {
    const { bus, calls } = makeBus();
    dispatchRenameSheet(bus as never, 'a', { name: 'New', number: 'A-009' });
    expect(calls).toEqual([
      { type: 'sheet.rename', payload: { sheetId: 'a', name: 'New', number: 'A-009' } },
    ]);
  });

  it('dispatchReorderSheet → sheet.reorder with newIndex', () => {
    const { bus, calls } = makeBus();
    dispatchReorderSheet(bus as never, 'a', 3);
    expect(calls).toEqual([{ type: 'sheet.reorder', payload: { sheetId: 'a', newIndex: 3 } }]);
  });
});
