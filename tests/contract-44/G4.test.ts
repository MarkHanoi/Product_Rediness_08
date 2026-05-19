// Contract 44 — G4: style overrides MUST be per-view (not global).
//
// Spec: docs/00_NEW_ARCHITECTURE/phases/PHASE-2B-Q2-M16-M18-PLAN-VIEW.md §S33 line 625.

import { describe, expect, it } from 'vitest';
import { StyleResolver, type ElementStyle, type ViewStyleOverride } from '@pryzm/plugin-plan-view';

const DEFAULT: ElementStyle = { strokeColor: '#000', lineWeight: 1, fillColor: '#fff' };

describe('Contract 44 — G4: per-view style overrides', () => {
  it('an override on view-A does NOT affect view-B (the PRYZM-1 global-bug regression)', () => {
    const overrides: ViewStyleOverride[] = [
      { viewId: 'view-A', strokeColorOverride: '#f00', lineWeightOverride: 3 },
    ];
    const resolverA = new StyleResolver(overrides, 'view-A');
    const resolverB = new StyleResolver(overrides, 'view-B');

    expect(resolverA.resolve('w1', DEFAULT).strokeColor).toBe('#f00');
    expect(resolverA.resolve('w1', DEFAULT).lineWeight).toBe(3);

    // view-B sees defaults — global bug would leak the red here.
    expect(resolverB.resolve('w1', DEFAULT).strokeColor).toBe('#000');
    expect(resolverB.resolve('w1', DEFAULT).lineWeight).toBe(1);
  });

  it('per-element override beats per-view override under the active view', () => {
    const overrides: ViewStyleOverride[] = [
      { viewId: 'view-A', strokeColorOverride: '#f00' },
      { viewId: 'view-A', elementId: 'w-special', strokeColorOverride: '#0f0' },
    ];
    const r = new StyleResolver(overrides, 'view-A');
    expect(r.resolve('w-special', DEFAULT).strokeColor).toBe('#0f0');
    expect(r.resolve('w-other', DEFAULT).strokeColor).toBe('#f00');
  });
});
