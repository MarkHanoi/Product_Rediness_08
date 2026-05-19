// Store<T> base-class unit tests (S05-T1).
//
// Covers the contract surfaced by `phases/PHASE-1A-Q1-M1-M3-SKELETON-RAILS.md`
// §S05-T1 (line 506):
//
//   "Store<T> base class: applyPatch(patches) → DirtyDiff +
//    subscribeDirty(diff => ...) → Disposer + getState()."
//
// Test matrix:
//   • applyPatch
//       — root add of a new id  ⇒ added set non-empty
//       — root replace of existing id ⇒ updated set
//       — nested replace ⇒ updated set, frozen entry
//       — root remove ⇒ removed set; subsequent getState() omits id
//       — empty patch list ⇒ EMPTY_DIFF + no listener call
//       — non-string root path ⇒ throws (defensive)
//   • diff aggregation
//       — add THEN nested replace inside one call  ⇒ `added` (history wins)
//       — add THEN remove inside one call          ⇒ no diff entry
//       — multiple ids touched in one call         ⇒ partitioned correctly
//   • frozen state
//       — entries deeply frozen (mutation throws in strict mode)
//   • multi-subscriber
//       — both listeners observe each diff
//       — disposer removes only the disposed listener
//       — listener that unsubscribes during fan-out doesn't perturb others
//
// Patterns mirrored: `src/elements/walls/__tests__/WallStore.test.ts`.

import { describe, expect, it, vi } from 'vitest';
import type { Patch } from 'immer';
import { Store } from '../src/Store.js';
import type { DirtyDiff } from '../src/types.js';

interface DemoDto {
  readonly value: number;
  readonly nested?: { readonly tag: string };
}

class DemoStore extends Store<DemoDto> {
  constructor() {
    super('demo');
  }
}

const ADD = (id: string, value: DemoDto): Patch => ({ op: 'add', path: [id], value });
const REPLACE_ROOT = (id: string, value: DemoDto): Patch => ({ op: 'replace', path: [id], value });
const REMOVE = (id: string): Patch => ({ op: 'remove', path: [id] });
const REPLACE_NESTED = (id: string, key: string, value: unknown): Patch => ({
  op: 'replace',
  path: [id, key],
  value,
});

describe('Store.applyPatch — root add/update/remove', () => {
  it('adds a new entry (diff.added; getState contains it)', () => {
    const store = new DemoStore();
    const diff = store.applyPatch([ADD('a', { value: 1 })]);
    expect([...diff.added]).toEqual(['a']);
    expect(diff.updated.size).toBe(0);
    expect(diff.removed.size).toBe(0);
    expect(store.getState().get('a')).toEqual({ value: 1 });
    expect(store.size()).toBe(1);
  });

  it('replaces a root entry (diff.updated)', () => {
    const store = new DemoStore();
    store.applyPatch([ADD('a', { value: 1 })]);
    const diff = store.applyPatch([REPLACE_ROOT('a', { value: 2 })]);
    expect([...diff.updated]).toEqual(['a']);
    expect(diff.added.size).toBe(0);
    expect(diff.removed.size).toBe(0);
    expect(store.getState().get('a')).toEqual({ value: 2 });
  });

  it('updates a nested key (diff.updated; nested value applied)', () => {
    const store = new DemoStore();
    store.applyPatch([ADD('a', { value: 1, nested: { tag: 'old' } })]);
    const diff = store.applyPatch([REPLACE_NESTED('a', 'nested', { tag: 'new' })]);
    expect([...diff.updated]).toEqual(['a']);
    expect(store.getState().get('a')?.nested).toEqual({ tag: 'new' });
  });

  it('removes a root entry (diff.removed; getState omits it)', () => {
    const store = new DemoStore();
    store.applyPatch([ADD('a', { value: 1 })]);
    const diff = store.applyPatch([REMOVE('a')]);
    expect([...diff.removed]).toEqual(['a']);
    expect(diff.added.size).toBe(0);
    expect(diff.updated.size).toBe(0);
    expect(store.getState().has('a')).toBe(false);
  });

  it('returns EMPTY_DIFF and notifies no one for an empty patch list', () => {
    const store = new DemoStore();
    const listener = vi.fn();
    store.subscribeDirty(listener);
    const diff = store.applyPatch([]);
    expect(diff.added.size).toBe(0);
    expect(diff.updated.size).toBe(0);
    expect(diff.removed.size).toBe(0);
    expect(listener).not.toHaveBeenCalled();
  });

  it('throws on a patch with non-string root path', () => {
    const store = new DemoStore();
    // path[0] = number — illegal at the Store boundary.
    expect(() =>
      store.applyPatch([{ op: 'add', path: [0 as unknown as string], value: { value: 1 } }]),
    ).toThrow(/non-string root path/);
  });
});

describe('Store.applyPatch — diff aggregation across one call', () => {
  it('add THEN nested replace within one call ⇒ added (history wins)', () => {
    const store = new DemoStore();
    const diff = store.applyPatch([
      ADD('a', { value: 1, nested: { tag: 'init' } }),
      REPLACE_NESTED('a', 'nested', { tag: 'evolved' }),
    ]);
    expect([...diff.added]).toEqual(['a']);
    expect(diff.updated.size).toBe(0);
    expect(store.getState().get('a')?.nested).toEqual({ tag: 'evolved' });
  });

  it('add THEN remove within one call ⇒ no diff entry, state unchanged', () => {
    const store = new DemoStore();
    const diff = store.applyPatch([ADD('a', { value: 1 }), REMOVE('a')]);
    expect(diff.added.size).toBe(0);
    expect(diff.updated.size).toBe(0);
    expect(diff.removed.size).toBe(0);
    expect(store.getState().has('a')).toBe(false);
  });

  it('multiple ids in one call are partitioned by transition', () => {
    const store = new DemoStore();
    store.applyPatch([ADD('a', { value: 1 }), ADD('b', { value: 2 })]);
    const diff = store.applyPatch([
      ADD('c', { value: 3 }), // add
      REPLACE_ROOT('a', { value: 11 }), // update
      REMOVE('b'), // remove
    ]);
    expect([...diff.added].sort()).toEqual(['c']);
    expect([...diff.updated].sort()).toEqual(['a']);
    expect([...diff.removed].sort()).toEqual(['b']);
  });
});

describe('Store frozen state contract', () => {
  it('returned entries are deeply frozen', () => {
    const store = new DemoStore();
    store.applyPatch([ADD('a', { value: 1, nested: { tag: 't' } })]);
    const a = store.getState().get('a')!;
    expect(Object.isFrozen(a)).toBe(true);
    expect(Object.isFrozen(a.nested)).toBe(true);
    // Mutation attempts throw in strict mode (vitest defaults to ESM strict).
    expect(() => {
      (a as { value: number }).value = 99;
    }).toThrow();
  });

  it('getState() identity is stable across mutations', () => {
    const store = new DemoStore();
    const m1 = store.getState();
    store.applyPatch([ADD('a', { value: 1 })]);
    const m2 = store.getState();
    // Map identity is preserved — bindStore relies on this.
    expect(m1).toBe(m2);
  });
});

describe('Store.subscribeDirty — multi-subscriber + disposer', () => {
  it('both listeners observe every diff', () => {
    const store = new DemoStore();
    const a = vi.fn();
    const b = vi.fn();
    store.subscribeDirty(a);
    store.subscribeDirty(b);
    store.applyPatch([ADD('x', { value: 1 })]);
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
    const [diffA, snapA] = a.mock.calls[0]!;
    expect(diffA.added.has('x')).toBe(true);
    // Snapshot is the same Map identity as getState().
    expect(snapA).toBe(store.getState());
  });

  it('disposer removes only the disposed listener; idempotent', () => {
    const store = new DemoStore();
    const a = vi.fn();
    const b = vi.fn();
    const disposeA = store.subscribeDirty(a);
    store.subscribeDirty(b);
    disposeA();
    disposeA(); // second call is a no-op (idempotent)
    store.applyPatch([ADD('x', { value: 1 })]);
    expect(a).not.toHaveBeenCalled();
    expect(b).toHaveBeenCalledTimes(1);
  });

  it('listener that unsubscribes mid-iteration does not perturb the rest', () => {
    const store = new DemoStore();
    const seen: string[] = [];
    let disposeA: (() => void) | null = null;
    const a = vi.fn((diff: DirtyDiff) => {
      seen.push('a:' + [...diff.added, ...diff.updated, ...diff.removed].join(','));
      disposeA?.();
    });
    const b = vi.fn((diff: DirtyDiff) => {
      seen.push('b:' + [...diff.added, ...diff.updated, ...diff.removed].join(','));
    });
    disposeA = store.subscribeDirty(a);
    store.subscribeDirty(b);
    store.applyPatch([ADD('x', { value: 1 })]);
    // Both ran once on the first diff; A unsubscribed itself.
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
    store.applyPatch([ADD('y', { value: 2 })]);
    // A is gone, B still fires.
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(2);
    expect(seen).toEqual(['a:x', 'b:x', 'b:y']);
  });
});

describe('Store.clear', () => {
  it('emits a removed-only diff when entries exist', () => {
    const store = new DemoStore();
    store.applyPatch([ADD('a', { value: 1 }), ADD('b', { value: 2 })]);
    const listener = vi.fn();
    store.subscribeDirty(listener);
    store.clear();
    expect(store.size()).toBe(0);
    expect(listener).toHaveBeenCalledTimes(1);
    const [diff] = listener.mock.calls[0]!;
    expect(diff.added.size).toBe(0);
    expect(diff.updated.size).toBe(0);
    expect([...diff.removed].sort()).toEqual(['a', 'b']);
  });

  it('is a no-op (no listener call) when already empty', () => {
    const store = new DemoStore();
    const listener = vi.fn();
    store.subscribeDirty(listener);
    store.clear();
    expect(listener).not.toHaveBeenCalled();
  });
});
