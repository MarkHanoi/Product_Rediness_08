// style-resolver unit tests (S33 — Contract 44 G4, G6).

import { describe, expect, it } from 'vitest';
import { StyleResolver, type ElementStyle, type ViewStyleOverride } from '../src/style-resolver.js';

const DEFAULT: ElementStyle = {
  strokeColor: '#000',
  lineWeight: 1,
  fillColor: '#fff',
};

describe('StyleResolver — precedence', () => {
  it('returns the default when no override matches the active view', () => {
    const r = new StyleResolver([], 'view-A');
    expect(r.resolve('w1', DEFAULT)).toEqual(DEFAULT);
  });

  it('per-view + per-element override beats per-view + all-elements override', () => {
    const overrides: ViewStyleOverride[] = [
      { viewId: 'view-A', fillColorOverride: '#aaa' },
      { viewId: 'view-A', elementId: 'w1', fillColorOverride: '#f00' },
    ];
    const r = new StyleResolver(overrides, 'view-A');
    expect(r.resolve('w1', DEFAULT).fillColor).toBe('#f00');
    expect(r.resolve('w2', DEFAULT).fillColor).toBe('#aaa');
  });

  it('overrides for a different view do not affect the active view', () => {
    const overrides: ViewStyleOverride[] = [
      { viewId: 'view-OTHER', fillColorOverride: '#999' },
      { viewId: 'view-OTHER', elementId: 'w1', fillColorOverride: '#888' },
    ];
    const r = new StyleResolver(overrides, 'view-A');
    expect(r.resolve('w1', DEFAULT)).toEqual(DEFAULT);
  });

  it('individual style fields can be overridden independently', () => {
    const r = new StyleResolver(
      [{ viewId: 'view-A', elementId: 'w1', lineWeightOverride: 4 }],
      'view-A',
    );
    const out = r.resolve('w1', DEFAULT);
    expect(out.lineWeight).toBe(4);
    expect(out.strokeColor).toBe('#000');
    expect(out.fillColor).toBe('#fff');
  });

  it('material override propagates per-element under per-view scope', () => {
    const r = new StyleResolver(
      [{ viewId: 'view-A', elementId: 'w1', materialId: 'mat-brick' }],
      'view-A',
    );
    expect(r.resolve('w1', DEFAULT).materialId).toBe('mat-brick');
    expect(r.resolve('w2', DEFAULT).materialId).toBeUndefined();
  });
});

describe('StyleResolver — visibility', () => {
  it('default-true when no override is set', () => {
    const r = new StyleResolver([], 'view-A');
    expect(r.resolveVisibility('w1')).toBe(true);
  });

  it('per-view visibility hides every element in the view', () => {
    const r = new StyleResolver(
      [{ viewId: 'view-A', visible: false }],
      'view-A',
    );
    expect(r.resolveVisibility('w1')).toBe(false);
    expect(r.resolveVisibility('w2')).toBe(false);
  });

  it('per-element visible:true beats per-view visible:false', () => {
    const r = new StyleResolver(
      [
        { viewId: 'view-A', visible: false },
        { viewId: 'view-A', elementId: 'w1', visible: true },
      ],
      'view-A',
    );
    expect(r.resolveVisibility('w1')).toBe(true);
    expect(r.resolveVisibility('w2')).toBe(false);
  });

  it('hasOverrides() is true iff at least one row matches', () => {
    expect(new StyleResolver([], 'view-A').hasOverrides()).toBe(false);
    expect(
      new StyleResolver([{ viewId: 'view-OTHER' }], 'view-A').hasOverrides(),
    ).toBe(false);
    expect(
      new StyleResolver([{ viewId: 'view-A' }], 'view-A').hasOverrides(),
    ).toBe(true);
  });
});
