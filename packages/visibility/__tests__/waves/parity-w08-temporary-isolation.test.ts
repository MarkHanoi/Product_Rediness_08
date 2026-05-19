// Parity fixture for w08-temporary-isolation.

import { describe, expect, it } from 'vitest';
import {
  w08TemporaryIsolation,
  type VisibilityElement,
  type VisibilityView,
  type VisibilityWaveContext,
  type TemporaryIsolationState,
} from '../../src/waves/index.js';

const view = (iso: TemporaryIsolationState | null | undefined): VisibilityView => ({
  id: 'v1', visibleLevels: new Set(['L1']), unlevelScoped: false,
  categoryVisibility: new Map(), viewTemplate: null,
  temporaryIsolation: iso,
});

const el = (id = 'e1'): VisibilityElement => ({ id, category: 'wall', levelId: 'L1' });

const ctx = (e: VisibilityElement, v: VisibilityView): VisibilityWaveContext => ({
  element: e, activeView: v, resolvedVisibility: new Map(),
});

describe('w08-temporary-isolation (parity)', () => {
  it('no isolation → pass through', () => {
    expect(w08TemporaryIsolation(ctx(el(), view(null))).visible).toBe(true);
    expect(w08TemporaryIsolation(ctx(el(), view(undefined))).visible).toBe(true);
  });

  it('isolation inactive → pass through', () => {
    expect(w08TemporaryIsolation(ctx(
      el(), view({ active: false, elementIds: new Set(['other']) }),
    )).visible).toBe(true);
  });

  it('isolation active, element in set → visible', () => {
    expect(w08TemporaryIsolation(ctx(
      el('e1'), view({ active: true, elementIds: new Set(['e1', 'e2']) }),
    )).visible).toBe(true);
  });

  it('isolation active, element NOT in set → hidden', () => {
    expect(w08TemporaryIsolation(ctx(
      el('e1'), view({ active: true, elementIds: new Set(['e2']) }),
    )).visible).toBe(false);
  });

  it('isolation active with empty set → all elements hidden (bug #8901)', () => {
    expect(w08TemporaryIsolation(ctx(
      el('e1'), view({ active: true, elementIds: new Set() }),
    )).visible).toBe(false);
  });

  it('element-override of show does NOT bypass isolation (CR-2019-44)', () => {
    const e: VisibilityElement = { id: 'e1', category: 'wall', levelId: 'L1', categoryOverride: 'show' };
    expect(w08TemporaryIsolation(ctx(
      e, view({ active: true, elementIds: new Set(['e2']) }),
    )).visible).toBe(false);
  });
});
