// Parity fixture for w02-category-visibility.

import { describe, expect, it } from 'vitest';
import {
  w02CategoryVisibility,
  type VisibilityElement,
  type VisibilityView,
  type VisibilityWaveContext,
} from '../../src/waves/index.js';

const view = (
  catMap: Iterable<[string, 'show' | 'hide' | 'halftone']> = [],
): VisibilityView => ({
  id: 'plan-L1', visibleLevels: new Set(['L1']), unlevelScoped: false,
  categoryVisibility: new Map(catMap), viewTemplate: null,
});

const el = (over: Partial<VisibilityElement> = {}): VisibilityElement => ({
  id: 'e1', category: 'wall', levelId: 'L1', ...over,
});

const ctx = (e: VisibilityElement, v: VisibilityView): VisibilityWaveContext => ({
  element: e, activeView: v, resolvedVisibility: new Map(),
});

describe('w02-category-visibility (parity)', () => {
  it('view-level hide → element hidden', () => {
    expect(w02CategoryVisibility(ctx(el(), view([['wall', 'hide']]))).visible).toBe(false);
  });

  it('view-level halftone → element visible + halftone flagged', () => {
    const r = w02CategoryVisibility(ctx(el(), view([['wall', 'halftone']])));
    expect(r.visible).toBe(true);
    expect(r.halftone).toBe(true);
  });

  it('view-level show / undefined → element passes through', () => {
    expect(w02CategoryVisibility(ctx(el(), view())).visible).toBe(true);
    expect(w02CategoryVisibility(ctx(el(), view([['wall', 'show']]))).visible).toBe(true);
  });

  it('element override "show" wins over view-level "hide" (PRYZM 1 bug #6701)', () => {
    const r = w02CategoryVisibility(ctx(
      el({ categoryOverride: 'show' }),
      view([['wall', 'hide']]),
    ));
    expect(r.visible).toBe(true);
    expect(r.halftone).toBeFalsy();
  });

  it('element override "halftone" wins over view-level "show" (bug #7122)', () => {
    const r = w02CategoryVisibility(ctx(
      el({ categoryOverride: 'halftone' }),
      view([['wall', 'show']]),
    ));
    expect(r.visible).toBe(true);
    expect(r.halftone).toBe(true);
  });

  it('element override "hide" wins over view-level "show"', () => {
    expect(w02CategoryVisibility(ctx(
      el({ categoryOverride: 'hide' }),
      view([['wall', 'show']]),
    )).visible).toBe(false);
  });
});
