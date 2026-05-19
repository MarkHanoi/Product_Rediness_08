// view-element-visibility unit tests (S33 — Contract 44 G5).

import { describe, expect, it } from 'vitest';
import { ViewElementVisibility } from '../src/view-element-visibility.js';

describe('ViewElementVisibility — default-true semantics', () => {
  it('isVisible defaults to true when no override exists', () => {
    const v = new ViewElementVisibility();
    expect(v.isVisible('view-A', 'w1')).toBe(true);
    expect(v.size).toBe(0);
  });

  it('set(false) hides; set(true) restores; size tracks override count', () => {
    const v = new ViewElementVisibility();
    expect(v.set('view-A', 'w1', false)).toBe(true);
    expect(v.isVisible('view-A', 'w1')).toBe(false);
    expect(v.size).toBe(1);

    // Second set(false) is a no-op (returns false).
    expect(v.set('view-A', 'w1', false)).toBe(false);
    expect(v.size).toBe(1);

    // Restore to default — table row removed.
    expect(v.set('view-A', 'w1', true)).toBe(true);
    expect(v.isVisible('view-A', 'w1')).toBe(true);
    expect(v.size).toBe(0);

    // Restore-when-already-default is a no-op.
    expect(v.set('view-A', 'w1', true)).toBe(false);
  });
});

describe('ViewElementVisibility — per-view isolation', () => {
  it('hiding in view-A does not affect view-B (G5)', () => {
    const v = new ViewElementVisibility();
    v.set('view-A', 'w1', false);
    expect(v.isVisible('view-A', 'w1')).toBe(false);
    expect(v.isVisible('view-B', 'w1')).toBe(true);
  });

  it('clearView drops every override for that view only', () => {
    const v = new ViewElementVisibility();
    v.set('view-A', 'w1', false);
    v.set('view-A', 'w2', false);
    v.set('view-B', 'w1', false);
    expect(v.size).toBe(3);
    expect(v.clearView('view-A')).toBe(true);
    expect(v.size).toBe(1);
    expect(v.isVisible('view-A', 'w1')).toBe(true);
    expect(v.isVisible('view-B', 'w1')).toBe(false);
  });
});

describe('ViewElementVisibility — entries iteration', () => {
  it('yields every (viewId, elementId) pair for which an override is set', () => {
    const v = new ViewElementVisibility();
    v.set('view-A', 'w1', false);
    v.set('view-A', 'w2', false);
    v.set('view-B', 'w3', false);
    const all = [...v.entries()].map(([view, el]) => `${view}/${el}`).sort();
    expect(all).toEqual(['view-A/w1', 'view-A/w2', 'view-B/w3']);
  });
});

describe('ViewElementVisibility — JSON round-trip', () => {
  it('toJSON / fromJSON preserve every override', () => {
    const v = new ViewElementVisibility();
    v.set('view-A', 'w1', false);
    v.set('view-B', 'w2', false);
    v.set('view-B', 'w3', false);
    const wire = v.toJSON();
    const v2 = ViewElementVisibility.fromJSON(wire);
    expect(v2.size).toBe(3);
    expect(v2.isVisible('view-A', 'w1')).toBe(false);
    expect(v2.isVisible('view-B', 'w2')).toBe(false);
    expect(v2.isVisible('view-B', 'w3')).toBe(false);
    expect(v2.isVisible('view-A', 'w-other')).toBe(true);
  });
});
