// SelectionStore tests (S16-T6, 5 cases per spec line 740).

import { describe, expect, it } from 'vitest';
import { SelectionStore } from '../src/SelectionStore.js';

function targets(...ids: string[]) {
  return ids.map((id) => ({ id, kind: 'wall' as const }));
}

describe('SelectionStore (S16-T6)', () => {
  it('select with mode=replace replaces the existing selection', () => {
    const store = new SelectionStore();
    store.select(targets('a', 'b'));
    store.select(targets('c'), 'replace');
    expect(store.ids().sort()).toEqual(['c']);
    expect(store.isSelected('a')).toBe(false);
    expect(store.isSelected('c')).toBe(true);
  });

  it('select with mode=add adds without removing', () => {
    const store = new SelectionStore();
    store.select(targets('a', 'b'));
    store.select(targets('c'), 'add');
    expect(store.ids().sort()).toEqual(['a', 'b', 'c']);
  });

  it('select with mode=toggle flips already-selected and adds new', () => {
    const store = new SelectionStore();
    store.select(targets('a', 'b'));
    store.select(targets('a', 'c'), 'toggle');
    // 'a' was selected → removed; 'c' added; 'b' untouched.
    expect(store.ids().sort()).toEqual(['b', 'c']);
  });

  it('clear empties the selection and is a no-op when already empty', () => {
    const store = new SelectionStore();
    store.select(targets('a', 'b'));
    store.clear();
    expect(store.ids()).toEqual([]);
    let firedAfterClear = false;
    store.subscribeDirty(() => {
      firedAfterClear = true;
    });
    store.clear();
    expect(firedAfterClear).toBe(false); // empty clear is no-op
  });

  it('subscribeDirty fires on add and remove with correct diff sets', () => {
    const store = new SelectionStore();
    const seen: { add: number; remove: number; updates: number }[] = [];
    store.subscribeDirty((diff) => {
      seen.push({
        add: diff.added.size,
        remove: diff.removed.size,
        updates: diff.updated.size,
      });
    });
    store.select(targets('a', 'b'));
    store.deselect(['a']);
    expect(seen).toHaveLength(2);
    expect(seen[0]).toEqual({ add: 2, remove: 0, updates: 0 });
    expect(seen[1]).toEqual({ add: 0, remove: 1, updates: 0 });
  });

  it('exposes the ephemeral=true static flag for the persistence layer', () => {
    expect(SelectionStore.ephemeral).toBe(true);
  });
});
