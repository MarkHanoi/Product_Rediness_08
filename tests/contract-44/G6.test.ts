// Contract 44 — G6: override graphics (material) MUST apply per-view.
//
// Spec: docs/00_NEW_ARCHITECTURE/phases/PHASE-2B-Q2-M16-M18-PLAN-VIEW.md §S33 line 627.

import { describe, expect, it } from 'vitest';
import { StyleResolver, type ElementStyle } from '@pryzm/plugin-plan-view';

const DEFAULT: ElementStyle = {
  strokeColor: '#000',
  lineWeight: 1,
  fillColor: '#fff',
  materialId: 'mat-default',
};

describe('Contract 44 — G6: per-view material overrides', () => {
  it('view-A material override does not propagate to view-B', () => {
    const overrides = [
      { viewId: 'view-A', elementId: 'wall-1', materialId: 'mat-red-brick' },
    ];
    const ra = new StyleResolver(overrides, 'view-A');
    const rb = new StyleResolver(overrides, 'view-B');

    expect(ra.resolve('wall-1', DEFAULT).materialId).toBe('mat-red-brick');
    expect(rb.resolve('wall-1', DEFAULT).materialId).toBe('mat-default');
  });

  it('per-view all-elements material override applies to every element in that view', () => {
    const r = new StyleResolver(
      [{ viewId: 'view-A', materialId: 'mat-shaded-grey' }],
      'view-A',
    );
    expect(r.resolve('w1', DEFAULT).materialId).toBe('mat-shaded-grey');
    expect(r.resolve('w2', DEFAULT).materialId).toBe('mat-shaded-grey');
  });
});
