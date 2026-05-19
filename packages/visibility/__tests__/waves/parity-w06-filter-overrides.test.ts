// Parity fixture for w06-filter-overrides.

import { describe, expect, it } from 'vitest';
import {
  w06FilterOverrides,
  type VisibilityElement,
  type VisibilityView,
  type VisibilityWaveContext,
  type ViewFilterOverride,
} from '../../src/waves/index.js';

const view = (filters: readonly ViewFilterOverride[] | undefined): VisibilityView => ({
  id: 'plan-L1', visibleLevels: new Set(['L1']), unlevelScoped: false,
  categoryVisibility: new Map(), viewTemplate: null,
  filterOverrides: filters,
});

const el = (over: Partial<VisibilityElement> = {}): VisibilityElement => ({
  id: 'e1', category: 'wall', levelId: 'L1', ...over,
});

const ctx = (e: VisibilityElement, v: VisibilityView): VisibilityWaveContext => ({
  element: e, activeView: v, resolvedVisibility: new Map(),
});

describe('w06-filter-overrides (parity)', () => {
  it('no filters → pass through visible', () => {
    expect(w06FilterOverrides(ctx(el(), view(undefined))).visible).toBe(true);
    expect(w06FilterOverrides(ctx(el(), view([]))).visible).toBe(true);
  });

  it('hide filter that matches → element hidden', () => {
    const f: ViewFilterOverride = {
      id: 'F1', name: 'hide walls', verb: 'hide', matches: (e) => e.category === 'wall',
    };
    expect(w06FilterOverrides(ctx(el(), view([f]))).visible).toBe(false);
  });

  it('halftone filter that matches → halftone flag set', () => {
    const f: ViewFilterOverride = {
      id: 'F1', name: 'halftone walls', verb: 'halftone', matches: (e) => e.category === 'wall',
    };
    const r = w06FilterOverrides(ctx(el(), view([f])));
    expect(r.visible).toBe(true);
    expect(r.halftone).toBe(true);
  });

  it('show filter that matches → visible (no halftone)', () => {
    const f: ViewFilterOverride = {
      id: 'F1', name: 'show walls', verb: 'show', matches: (e) => e.category === 'wall',
    };
    const r = w06FilterOverrides(ctx(el(), view([f])));
    expect(r.visible).toBe(true);
    expect(r.halftone).toBeFalsy();
  });

  it('filter that does not match → continue to next filter', () => {
    const fNoMatch: ViewFilterOverride = {
      id: 'F1', name: 'hide doors', verb: 'hide', matches: (e) => e.category === 'door',
    };
    const fMatch: ViewFilterOverride = {
      id: 'F2', name: 'halftone walls', verb: 'halftone', matches: (e) => e.category === 'wall',
    };
    const r = w06FilterOverrides(ctx(el(), view([fNoMatch, fMatch])));
    expect(r.visible).toBe(true);
    expect(r.halftone).toBe(true);
  });

  it('first matching filter wins; later filters ignored', () => {
    const fHide: ViewFilterOverride = {
      id: 'F1', name: 'hide walls', verb: 'hide', matches: () => true,
    };
    const fShow: ViewFilterOverride = {
      id: 'F2', name: 'show walls', verb: 'show', matches: () => true,
    };
    expect(w06FilterOverrides(ctx(el(), view([fHide, fShow]))).visible).toBe(false);
  });

  it('predicate that throws is silently skipped (bug #11920)', () => {
    const fThrow: ViewFilterOverride = {
      id: 'F1', name: 'broken', verb: 'hide', matches: () => { throw new Error('bad filter'); },
    };
    const fHalftone: ViewFilterOverride = {
      id: 'F2', name: 'halftone all', verb: 'halftone', matches: () => true,
    };
    const r = w06FilterOverrides(ctx(el(), view([fThrow, fHalftone])));
    expect(r.visible).toBe(true);
    expect(r.halftone).toBe(true);
  });

  it('no filter matches → pass through', () => {
    const f: ViewFilterOverride = {
      id: 'F1', name: 'hide doors', verb: 'hide', matches: (e) => e.category === 'door',
    };
    const r = w06FilterOverrides(ctx(el(), view([f])));
    expect(r.visible).toBe(true);
    expect(r.halftone).toBeFalsy();
    expect(r.reason).toBe('no-filter-matched');
  });
});
