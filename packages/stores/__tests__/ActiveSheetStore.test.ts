// ActiveSheetStore — singleton-on-Store pattern coverage (S37 /
// ADR-0031 / Phase 2C).  Mirrors ActiveViewStore.test.ts.

import { describe, it, expect } from 'vitest';
import {
  ActiveSheetStore,
  ACTIVE_SHEET_ID,
  DEFAULT_ACTIVE_SHEET_STATE,
} from '../src/ActiveSheetStore.js';

describe('ActiveSheetStore', () => {
  it('exposes the storeKey "active-sheet"', () => {
    const s = new ActiveSheetStore();
    expect(s.storeKey).toBe('active-sheet');
  });

  it('is marked ephemeral (matches SelectionStore / ActiveViewStore)', () => {
    expect(ActiveSheetStore.ephemeral).toBe(true);
  });

  it('starts in the DEFAULT_ACTIVE_SHEET_STATE (activeSheetId = null)', () => {
    const s = new ActiveSheetStore();
    expect(s.getActive()).toEqual(DEFAULT_ACTIVE_SHEET_STATE);
    expect(s.getActive().activeSheetId).toBeNull();
  });

  it('accepts an initial state via the constructor', () => {
    const s = new ActiveSheetStore({ activeSheetId: 'sheet-7' });
    expect(s.getActive().activeSheetId).toBe('sheet-7');
  });

  it('setActive updates state and notifies subscribers', () => {
    const s = new ActiveSheetStore();
    let calls = 0;
    s.subscribeDirty(() => calls++);
    s.setActive('sheet-42');
    expect(s.getActive().activeSheetId).toBe('sheet-42');
    expect(calls).toBeGreaterThan(0);
  });

  it('setActive(null) clears the active sheet', () => {
    const s = new ActiveSheetStore({ activeSheetId: 'sheet-1' });
    s.setActive(null);
    expect(s.getActive().activeSheetId).toBeNull();
  });

  it('only ever holds one entry under ACTIVE_SHEET_ID', () => {
    const s = new ActiveSheetStore();
    s.setActive('sheet-a');
    s.setActive('sheet-b');
    s.setActive(null);
    expect([...s.getState().keys()]).toEqual([ACTIVE_SHEET_ID]);
  });
});
