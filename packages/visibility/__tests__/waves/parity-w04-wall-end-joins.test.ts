// Parity fixture for w04-wall-end-joins.

import { describe, expect, it } from 'vitest';
import {
  w04WallEndJoins,
  type VisibilityElement,
  type VisibilityView,
  type VisibilityWaveContext,
} from '../../src/waves/index.js';

const view: VisibilityView = {
  id: 'plan-L1', visibleLevels: new Set(['L1']), unlevelScoped: false,
  categoryVisibility: new Map(), viewTemplate: null,
};

const el = (over: Partial<VisibilityElement> = {}): VisibilityElement => ({
  id: 'cap1', category: 'wall-cap', levelId: 'L1', ...over,
});

const ctx = (
  e: VisibilityElement,
  resolved: ReadonlyMap<string, boolean>,
): VisibilityWaveContext => ({ element: e, activeView: view, resolvedVisibility: resolved });

describe('w04-wall-end-joins (parity)', () => {
  it('non-join element (no parentWallId) → pass through visible', () => {
    expect(w04WallEndJoins(ctx(el({ parentWallId: null }), new Map())).visible).toBe(true);
  });

  it('join cap with visible parent wall → visible', () => {
    expect(w04WallEndJoins(ctx(
      el({ parentWallId: 'wall-1' }),
      new Map([['wall-1', true]]),
    )).visible).toBe(true);
  });

  it('join cap with hidden parent wall → hidden (bug #9018: wall hides → cap hides)', () => {
    expect(w04WallEndJoins(ctx(
      el({ parentWallId: 'wall-1' }),
      new Map([['wall-1', false]]),
    )).visible).toBe(false);
  });

  it('join cap whose parent is not yet resolved → visible by default', () => {
    expect(w04WallEndJoins(ctx(
      el({ parentWallId: 'wall-not-resolved' }),
      new Map(),
    )).visible).toBe(true);
  });
});
