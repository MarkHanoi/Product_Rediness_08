// WallStore — unit tests for the pure DTO store (S07-T2).

import { describe, expect, it } from 'vitest';
import { WallStore, type WallData } from '../src/store.js';
import { Wall, createId } from '@pryzm/plugin-sdk';

function buildWall(overrides: Partial<WallData> = {}): WallData {
  return Wall.parse({
    id: createId('wall'),
    levelId: 'lvl_test',
    ...overrides,
  }) as WallData;
}

describe('WallStore', () => {
  it('starts empty and reports storeKey === "wall"', () => {
    const s = new WallStore();
    expect(s.storeKey).toBe('wall');
    expect(s.size()).toBe(0);
    expect(s.ids()).toEqual([]);
  });

  it('applies an `add` patch and reflects the new wall in getState()', () => {
    const s = new WallStore();
    const wall = buildWall();
    const diff = s.applyPatch([{ op: 'add', path: [wall.id], value: wall }]);
    expect(diff.added.has(wall.id)).toBe(true);
    expect(s.size()).toBe(1);
    expect(s.get(wall.id)?.id).toBe(wall.id);
  });

  it('applies a nested `replace` patch and emits an `updated` diff', () => {
    const s = new WallStore();
    const wall = buildWall({ height: 2.5 });
    s.applyPatch([{ op: 'add', path: [wall.id], value: wall }]);
    const diff = s.applyPatch([{ op: 'replace', path: [wall.id, 'height'], value: 3.0 }]);
    expect(diff.updated.has(wall.id)).toBe(true);
    expect(s.get(wall.id)?.height).toBe(3.0);
  });

  it('removes a wall on `remove` patch', () => {
    const s = new WallStore();
    const wall = buildWall();
    s.applyPatch([{ op: 'add', path: [wall.id], value: wall }]);
    const diff = s.applyPatch([{ op: 'remove', path: [wall.id] }]);
    expect(diff.removed.has(wall.id)).toBe(true);
    expect(s.size()).toBe(0);
  });

  it('byLevel() filters by levelId', () => {
    const s = new WallStore();
    const a = buildWall({ levelId: 'lvl-a' });
    const b1 = buildWall({ levelId: 'lvl-b' });
    const b2 = buildWall({ levelId: 'lvl-b' });
    for (const w of [a, b1, b2]) s.applyPatch([{ op: 'add', path: [w.id], value: w }]);
    expect(s.byLevel('lvl-a').map(w => w.id)).toEqual([a.id]);
    expect(s.byLevel('lvl-b').map(w => w.id).sort()).toEqual([b1.id, b2.id].sort());
  });

  it('subscribers receive dirty diffs and a frozen snapshot', () => {
    const s = new WallStore();
    const wall = buildWall();
    let saw: { added: number; updated: number; removed: number } | null = null;
    const off = s.subscribeDirty((diff, snap) => {
      saw = { added: diff.added.size, updated: diff.updated.size, removed: diff.removed.size };
      // snap is the canonical Map — entry should be frozen
      expect(Object.isFrozen(snap.get(wall.id))).toBe(true);
    });
    s.applyPatch([{ op: 'add', path: [wall.id], value: wall }]);
    expect(saw).toEqual({ added: 1, updated: 0, removed: 0 });
    off();
  });
});
