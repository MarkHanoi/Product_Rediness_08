// Parity fixture for w05-opening-culling.

import { describe, expect, it } from 'vitest';
import {
  w05OpeningCulling,
  evaluateViewVisibility,
  type VisibilityElement,
  type VisibilityView,
  type VisibilityWaveContext,
} from '../../src/waves/index.js';

const view: VisibilityView = {
  id: 'plan-L1', visibleLevels: new Set(['L1']), unlevelScoped: false,
  categoryVisibility: new Map(), viewTemplate: null,
};

const el = (over: Partial<VisibilityElement> = {}): VisibilityElement => ({
  id: 'door-1', category: 'door', levelId: 'L1', ...over,
});

const ctx = (
  e: VisibilityElement,
  resolved: ReadonlyMap<string, boolean>,
): VisibilityWaveContext => ({ element: e, activeView: view, resolvedVisibility: resolved });

describe('w05-opening-culling (parity)', () => {
  it('non-opening (no hostWallId) → pass through visible', () => {
    expect(w05OpeningCulling(ctx(el({ hostWallId: null }), new Map())).visible).toBe(true);
  });

  it('opening with visible host wall → visible', () => {
    expect(w05OpeningCulling(ctx(
      el({ hostWallId: 'wall-1' }),
      new Map([['wall-1', true]]),
    )).visible).toBe(true);
  });

  it('opening with hidden host wall → hidden (PRYZM 1 #1 visual bug fix)', () => {
    expect(w05OpeningCulling(ctx(
      el({ hostWallId: 'wall-1' }),
      new Map([['wall-1', false]]),
    )).visible).toBe(false);
  });

  it('opening with orphan host (host deleted by peer) → visible by default (bug #11580)', () => {
    expect(w05OpeningCulling(ctx(
      el({ hostWallId: 'wall-deleted' }),
      new Map(),
    )).visible).toBe(true);
  });

  it('end-to-end: hidden wall hides its opening via the chain runner', () => {
    const wall: VisibilityElement = {
      id: 'wall-1', category: 'wall', levelId: 'L1',
      categoryOverride: 'hide',
    };
    const door: VisibilityElement = {
      id: 'door-1', category: 'door', levelId: 'L1',
      hostWallId: 'wall-1',
    };
    const result = evaluateViewVisibility([wall, door], view);
    expect(result.get('wall-1')?.visible).toBe(false);
    expect(result.get('door-1')?.visible).toBe(false);
  });

  it('end-to-end: hidden wall hides its end-cap via the chain runner', () => {
    const wall: VisibilityElement = {
      id: 'wall-1', category: 'wall', levelId: 'L1',
      categoryOverride: 'hide',
    };
    const cap: VisibilityElement = {
      id: 'cap-1', category: 'wall-cap', levelId: 'L1',
      parentWallId: 'wall-1',
    };
    const result = evaluateViewVisibility([wall, cap], view);
    expect(result.get('wall-1')?.visible).toBe(false);
    expect(result.get('cap-1')?.visible).toBe(false);
  });
});
