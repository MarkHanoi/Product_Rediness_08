// Parity fixture for w11-ghost-layer.

import { describe, expect, it } from 'vitest';
import {
  w11GhostLayer,
  type VisibilityElement,
  type VisibilityView,
  type VisibilityWaveContext,
} from '../../src/waves/index.js';

const view = (ghost: boolean | undefined): VisibilityView => ({
  id: 'v1', visibleLevels: new Set(['L1']), unlevelScoped: false,
  categoryVisibility: new Map(), viewTemplate: null,
  ghostLayerActive: ghost,
});

const el = (over: Partial<VisibilityElement> = {}): VisibilityElement => ({
  id: 'e1', category: 'wall', levelId: 'L1', ...over,
});

const ctx = (e: VisibilityElement, v: VisibilityView): VisibilityWaveContext => ({
  element: e, activeView: v, resolvedVisibility: new Map(),
});

describe('w11-ghost-layer (parity)', () => {
  it('ghost layer inactive → pass through', () => {
    expect(w11GhostLayer(ctx(
      el({ pendingPeerEdit: true }), view(false),
    )).visible).toBe(true);
    expect(w11GhostLayer(ctx(
      el({ pendingPeerEdit: true }), view(undefined),
    )).visible).toBe(true);
  });

  it('ghost layer active, no pending peer edit → pass through', () => {
    expect(w11GhostLayer(ctx(
      el({ pendingPeerEdit: false }), view(true),
    )).visible).toBe(true);
  });

  it('ghost layer active + pending peer edit → halftoned', () => {
    const r = w11GhostLayer(ctx(
      el({ pendingPeerEdit: true }), view(true),
    ));
    expect(r.visible).toBe(true);
    expect(r.halftone).toBe(true);
  });

  it('ghost layer never hides — bug #14502 fix', () => {
    // Even with pending peer edit + ghost active, visible must be true.
    // The whole point of the ghost layer is to AVOID hiding peer edits.
    const r = w11GhostLayer(ctx(
      el({ pendingPeerEdit: true }), view(true),
    ));
    expect(r.visible).toBe(true);
  });
});
