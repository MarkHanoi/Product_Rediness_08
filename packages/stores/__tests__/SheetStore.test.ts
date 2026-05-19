// SheetStore — unit coverage for the seq-ordered list, byNumber lookup,
// applyPatch contract, and dirty diff (S37 / ADR-0031 / Phase 2C).

import { describe, it, expect } from 'vitest';
import { SheetStore } from '../src/SheetStore.js';
import type { SheetData } from '@pryzm/schemas/sheet';

function makeSheet(over: Partial<SheetData>): SheetData {
  return {
    id: 'sheet-x',
    name: 'X',
    number: 'A-100',
    size: 'A1',
    orientation: 'landscape',
    titleBlockId: 'tb-x',
    viewports: [],
    widgets: [],
    revision: '',
    issue: '',
    seq: 0,
    ...over,
  };
}

describe('SheetStore', () => {
  it('uses the storeKey "sheet"', () => {
    const s = new SheetStore();
    expect(s.storeKey).toBe('sheet');
  });

  it('starts empty', () => {
    const s = new SheetStore();
    expect(s.ids()).toEqual([]);
    expect(s.list()).toEqual([]);
    expect(s.nextSeq()).toBe(-1);
  });

  it('list() returns sheets sorted by seq, ties broken by id', () => {
    const s = new SheetStore();
    s.applyPatch([
      { op: 'add', path: ['c'], value: makeSheet({ id: 'c', number: 'A-003', seq: 2 }) },
      { op: 'add', path: ['a'], value: makeSheet({ id: 'a', number: 'A-001', seq: 0 }) },
      { op: 'add', path: ['b'], value: makeSheet({ id: 'b', number: 'A-002', seq: 1 }) },
    ]);
    expect(s.list().map((x) => x.id)).toEqual(['a', 'b', 'c']);
  });

  it('list() is frozen', () => {
    const s = new SheetStore();
    s.applyPatch([{ op: 'add', path: ['a'], value: makeSheet({ id: 'a' }) }]);
    const out = s.list();
    expect(Object.isFrozen(out)).toBe(true);
  });

  it('nextSeq returns the maximum current seq', () => {
    const s = new SheetStore();
    s.applyPatch([
      { op: 'add', path: ['a'], value: makeSheet({ id: 'a', number: 'A-001', seq: 0 }) },
      { op: 'add', path: ['b'], value: makeSheet({ id: 'b', number: 'A-002', seq: 5 }) },
      { op: 'add', path: ['c'], value: makeSheet({ id: 'c', number: 'A-003', seq: 2 }) },
    ]);
    expect(s.nextSeq()).toBe(5);
  });

  it('byNumber finds a sheet by user-facing number', () => {
    const s = new SheetStore();
    s.applyPatch([
      { op: 'add', path: ['a'], value: makeSheet({ id: 'a', number: 'A-101' }) },
      { op: 'add', path: ['b'], value: makeSheet({ id: 'b', number: 'A-102' }) },
    ]);
    expect(s.byNumber('A-101')?.id).toBe('a');
    expect(s.byNumber('A-999')).toBeUndefined();
  });

  it('emits a DirtyDiff with the touched id on add/remove/replace', () => {
    const s = new SheetStore();
    let diff: { added: Set<string>; removed: Set<string>; updated: Set<string> } | null = null;
    s.subscribeDirty((d) => { diff = { added: d.added, removed: d.removed, updated: d.updated }; });
    s.applyPatch([{ op: 'add', path: ['a'], value: makeSheet({ id: 'a' }) }]);
    expect(diff!.added.has('a')).toBe(true);

    diff = null;
    s.applyPatch([{ op: 'replace', path: ['a', 'name'], value: 'X' }]);
    expect(diff!.updated.has('a')).toBe(true);

    diff = null;
    s.applyPatch([{ op: 'remove', path: ['a'] }]);
    expect(diff!.removed.has('a')).toBe(true);
  });

  it('get() returns undefined for unknown ids', () => {
    const s = new SheetStore();
    expect(s.get('no-such')).toBeUndefined();
  });
});
