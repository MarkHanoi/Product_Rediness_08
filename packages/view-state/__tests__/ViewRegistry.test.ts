// ViewRegistry tests (S17-T4).

import { describe, expect, it } from 'vitest';
import type { Patch } from 'immer';
import { ViewRegistry } from '../src/ViewRegistry.js';
import { Default3DView, LevelOverview } from '../src/defaults.js';

describe('ViewRegistry (S17-T4)', () => {
  it('reports its storeKey as "view"', () => {
    const r = new ViewRegistry();
    expect(r.storeKey).toBe('view');
  });

  it('defaults() returns Default3DView + LevelOverview seed views', () => {
    const r = new ViewRegistry();
    const seeds = r.defaults();
    expect(seeds).toHaveLength(2);
    expect(seeds[0]?.id).toBe(Default3DView.id);
    expect(seeds[0]?.kind).toBe('3d-perspective');
    expect(seeds[1]?.id).toBe(LevelOverview.id);
    expect(seeds[1]?.kind).toBe('3d-orthographic');
  });

  it('accepts CRUD patches against `view-id` paths and exposes them via getState()', () => {
    const r = new ViewRegistry();
    const add: Patch = { op: 'add', path: [Default3DView.id], value: Default3DView };
    r.applyPatch([add]);
    expect(r.size()).toBe(1);
    expect(r.getState().get(Default3DView.id)).toEqual(Default3DView);
    const remove: Patch = { op: 'remove', path: [Default3DView.id] };
    r.applyPatch([remove]);
    expect(r.size()).toBe(0);
  });

  it('subscribeDirty fires on add and remove with correctly-partitioned diffs', () => {
    const r = new ViewRegistry();
    const seen: { add: number; rem: number; upd: number }[] = [];
    r.subscribeDirty((diff) => {
      seen.push({ add: diff.added.size, rem: diff.removed.size, upd: diff.updated.size });
    });
    r.applyPatch([
      { op: 'add', path: [Default3DView.id], value: Default3DView },
      { op: 'add', path: [LevelOverview.id], value: LevelOverview },
    ]);
    r.applyPatch([{ op: 'remove', path: [Default3DView.id] }]);
    expect(seen).toEqual([
      { add: 2, rem: 0, upd: 0 },
      { add: 0, rem: 1, upd: 0 },
    ]);
  });
});
