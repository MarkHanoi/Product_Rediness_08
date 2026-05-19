// ActiveViewStore tests (S17-T5).

import { describe, expect, it } from 'vitest';
import {
  ActiveViewStore,
  ACTIVE_VIEW_ID,
  DEFAULT_ACTIVE_VIEW_STATE,
} from '../src/ActiveViewStore.js';

describe('ActiveViewStore (S17-T5)', () => {
  it('reports its storeKey as "active-view" and seeds the singleton entry', () => {
    const s = new ActiveViewStore();
    expect(s.storeKey).toBe('active-view');
    expect(s.size()).toBe(1);
    expect(s.getActive()).toEqual(DEFAULT_ACTIVE_VIEW_STATE);
    expect(s.getState().get(ACTIVE_VIEW_ID)).toEqual(DEFAULT_ACTIVE_VIEW_STATE);
  });

  it('setActive replaces the singleton entry and notifies subscribers as `updated`', () => {
    const s = new ActiveViewStore();
    const seen: { add: number; upd: number; rem: number; activeViewId?: string }[] = [];
    s.subscribeDirty((diff, snapshot) => {
      const active = snapshot.get(ACTIVE_VIEW_ID);
      seen.push({
        add: diff.added.size,
        upd: diff.updated.size,
        rem: diff.removed.size,
        activeViewId: active?.activeViewId,
      });
    });
    s.setActive({ activeViewId: 'view-section-A', activeToolId: 'select' });
    expect(s.getActive()).toEqual({ activeViewId: 'view-section-A', activeToolId: 'select' });
    expect(seen).toHaveLength(1);
    expect(seen[0]).toEqual({ add: 0, upd: 1, rem: 0, activeViewId: 'view-section-A' });
  });

  it('exposes the ephemeral=true static flag for the persistence layer', () => {
    expect(ActiveViewStore.ephemeral).toBe(true);
  });
});
