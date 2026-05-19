// Parity fixture for w10-design-option.

import { describe, expect, it } from 'vitest';
import {
  w10DesignOption,
  type VisibilityElement,
  type VisibilityView,
  type VisibilityWaveContext,
} from '../../src/waves/index.js';

const view = (active: ReadonlySet<string> | undefined): VisibilityView => ({
  id: 'v1', visibleLevels: new Set(['L1']), unlevelScoped: false,
  categoryVisibility: new Map(), viewTemplate: null,
  activeDesignOptions: active,
});

const el = (over: Partial<VisibilityElement> = {}): VisibilityElement => ({
  id: 'e1', category: 'wall', levelId: 'L1', ...over,
});

const ctx = (e: VisibilityElement, v: VisibilityView): VisibilityWaveContext => ({
  element: e, activeView: v, resolvedVisibility: new Map(),
});

describe('w10-design-option (parity)', () => {
  it('no design-option config in view → pass through', () => {
    expect(w10DesignOption(ctx(
      el({ designOptionId: 'OptA' }), view(undefined),
    )).visible).toBe(true);
  });

  it('main-model element (designOptionId null) → always visible', () => {
    expect(w10DesignOption(ctx(
      el({ designOptionId: null }), view(new Set(['OptA'])),
    )).visible).toBe(true);
  });

  it('main-model element (designOptionId undefined) → always visible', () => {
    expect(w10DesignOption(ctx(
      el(), view(new Set(['OptA'])),
    )).visible).toBe(true);
  });

  it('option element with active option → visible', () => {
    expect(w10DesignOption(ctx(
      el({ designOptionId: 'OptA' }), view(new Set(['OptA'])),
    )).visible).toBe(true);
  });

  it('option element with inactive option → hidden', () => {
    expect(w10DesignOption(ctx(
      el({ designOptionId: 'OptB' }), view(new Set(['OptA'])),
    )).visible).toBe(false);
  });

  it('empty active set → all option elements hidden, main visible', () => {
    expect(w10DesignOption(ctx(
      el({ designOptionId: 'OptA' }), view(new Set()),
    )).visible).toBe(false);
    expect(w10DesignOption(ctx(
      el({ designOptionId: null }), view(new Set()),
    )).visible).toBe(true);
  });

  it('orphan option (designOptionId not in active set) → hidden', () => {
    expect(w10DesignOption(ctx(
      el({ designOptionId: 'DeletedOption' }), view(new Set(['OptA'])),
    )).visible).toBe(false);
  });
});
