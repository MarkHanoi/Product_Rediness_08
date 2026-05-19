// Parity fixture for w01-level-scope.
//
// Per SPEC-30 §6 ("literal preservation, not redesign") the parity tests
// are the GROUND TRUTH for each wave — a wave is "done" iff every fixture
// produces the same verdict the PRYZM 1 implementation produced.  Each
// fixture below is a reduction of a real PRYZM 1 plan-view scene.

import { describe, expect, it } from 'vitest';
import {
  w01LevelScope,
  type VisibilityElement,
  type VisibilityView,
  type VisibilityWaveContext,
} from '../../src/waves/index.js';

const view = (over: Partial<VisibilityView> = {}): VisibilityView => ({
  id: 'plan-L1', visibleLevels: new Set(['L1']), unlevelScoped: false,
  categoryVisibility: new Map(), viewTemplate: null, ...over,
});

const el = (over: Partial<VisibilityElement> = {}): VisibilityElement => ({
  id: 'e1', category: 'wall', levelId: 'L1', ...over,
});

const ctx = (e: VisibilityElement, v: VisibilityView): VisibilityWaveContext => ({
  element: e, activeView: v, resolvedVisibility: new Map(),
});

describe('w01-level-scope (parity)', () => {
  it('element on a level in the view\'s visibleLevels → visible', () => {
    expect(w01LevelScope(ctx(el({ levelId: 'L1' }), view())).visible).toBe(true);
  });

  it('element on a level NOT in the view\'s visibleLevels → hidden', () => {
    expect(w01LevelScope(ctx(el({ levelId: 'L2' }), view())).visible).toBe(false);
  });

  it('unlevel-scoped view → always visible (3D / schedule)', () => {
    expect(
      w01LevelScope(ctx(el({ levelId: 'L99' }), view({ unlevelScoped: true }))).visible,
    ).toBe(true);
  });

  it('project-root pseudo-level requires explicit inclusion (PRYZM 1 bug #4421)', () => {
    expect(
      w01LevelScope(ctx(el({ levelId: '__root__' }), view())).visible,
    ).toBe(false);
    expect(
      w01LevelScope(ctx(
        el({ levelId: '__root__' }),
        view({ visibleLevels: new Set(['L1', '__root__']) }),
      )).visible,
    ).toBe(true);
  });

  it('empty visibleLevels on level-scoped view → every element hidden (bug #5118)', () => {
    expect(
      w01LevelScope(ctx(el({ levelId: 'L1' }), view({ visibleLevels: new Set() }))).visible,
    ).toBe(false);
  });
});
