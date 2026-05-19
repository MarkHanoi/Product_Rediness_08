// Contract 44 — G5: visibility flags MUST persist per-view.
//
// Spec: docs/00_NEW_ARCHITECTURE/phases/PHASE-2B-Q2-M16-M18-PLAN-VIEW.md §S33 line 626.

import { describe, expect, it } from 'vitest';
import { ViewElementVisibility } from '@pryzm/plugin-plan-view';

describe('Contract 44 — G5: per-view element visibility', () => {
  it('hiding in view-A does not hide in view-B (the PRYZM-1 global-flag regression)', () => {
    const v = new ViewElementVisibility();
    v.set('view-A', 'wall-1', false);
    expect(v.isVisible('view-A', 'wall-1')).toBe(false);
    expect(v.isVisible('view-B', 'wall-1')).toBe(true);
  });

  it('round-trips through JSON wire format (per-view visibility persists across reload)', () => {
    const v = new ViewElementVisibility();
    v.set('view-A', 'wall-1', false);
    v.set('view-B', 'wall-2', false);

    const wire = v.toJSON();
    const restored = ViewElementVisibility.fromJSON(wire);

    expect(restored.isVisible('view-A', 'wall-1')).toBe(false);
    expect(restored.isVisible('view-B', 'wall-2')).toBe(false);
    expect(restored.isVisible('view-A', 'wall-2')).toBe(true);
    expect(restored.isVisible('view-B', 'wall-1')).toBe(true);
  });

  it('size tracks override count; clearView drops a single view atomically', () => {
    const v = new ViewElementVisibility();
    v.set('view-A', 'w1', false);
    v.set('view-A', 'w2', false);
    v.set('view-B', 'w1', false);
    expect(v.size).toBe(3);
    expect(v.clearView('view-A')).toBe(true);
    expect(v.size).toBe(1);
  });
});
