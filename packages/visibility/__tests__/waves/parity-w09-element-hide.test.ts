// Parity fixture for w09-element-hide.

import { describe, expect, it } from 'vitest';
import {
  w09ElementHide,
  type VisibilityElement,
  type VisibilityView,
  type VisibilityWaveContext,
} from '../../src/waves/index.js';

const view = (hides: ReadonlySet<string> | undefined): VisibilityView => ({
  id: 'v1', visibleLevels: new Set(['L1']), unlevelScoped: false,
  categoryVisibility: new Map(), viewTemplate: null,
  hiddenElementIds: hides,
});

const el = (id = 'e1', over: Partial<VisibilityElement> = {}): VisibilityElement => ({
  id, category: 'wall', levelId: 'L1', ...over,
});

const ctx = (e: VisibilityElement, v: VisibilityView): VisibilityWaveContext => ({
  element: e, activeView: v, resolvedVisibility: new Map(),
});

describe('w09-element-hide (parity)', () => {
  it('no hide list → pass through', () => {
    expect(w09ElementHide(ctx(el(), view(undefined))).visible).toBe(true);
    expect(w09ElementHide(ctx(el(), view(new Set()))).visible).toBe(true);
  });

  it('element in hide list → hidden', () => {
    expect(w09ElementHide(ctx(
      el('e1'), view(new Set(['e1', 'e2'])),
    )).visible).toBe(false);
  });

  it('element NOT in hide list → visible', () => {
    expect(w09ElementHide(ctx(
      el('e3'), view(new Set(['e1', 'e2'])),
    )).visible).toBe(true);
  });

  it('element-override of show does NOT bypass per-view hide', () => {
    const e: VisibilityElement = { id: 'e1', category: 'wall', levelId: 'L1', categoryOverride: 'show' };
    expect(w09ElementHide(ctx(e, view(new Set(['e1'])))).visible).toBe(false);
  });

  it('orphan hide (ID for deleted element) still hides (bug #11580)', () => {
    // The element exists; its ID happens to be in the hide list.
    // This test ensures the wave does not "self-heal" by checking
    // existence — cleanup is the L4 sync's responsibility.
    expect(w09ElementHide(ctx(
      el('orphaned-id'), view(new Set(['orphaned-id'])),
    )).visible).toBe(false);
  });
});
