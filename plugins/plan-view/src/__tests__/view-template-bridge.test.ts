import { describe, expect, it } from 'vitest';
import { resolveSnapshotForView } from '../view-template-bridge.js';
import { ViewTemplateSchema } from '@pryzm/plugin-sdk';
import type { ElementForView, ResolvedViewRange } from '@pryzm/plugin-sdk';

const RANGE: ResolvedViewRange = {
  cutPlaneZ: 1.2,
  topClipZ: 3.0,
  bottomClipZ: 0.0,
};

const ELEMENTS: readonly ElementForView[] = [
  { id: 'w1', category: 'Wall', worldZMin: 0,    worldZMax: 3 },
  { id: 'w2', category: 'Wall', worldZMin: 0,    worldZMax: 3 },
  { id: 'f1', category: 'Furniture', worldZMin: 0, worldZMax: 0.8 },
];

describe('resolveSnapshotForView', () => {
  it('returns the no-op shape when no template is supplied', () => {
    const r = resolveSnapshotForView(undefined, ELEMENTS, RANGE);
    expect(r.hiddenIds.size).toBe(0);
    expect(r.halftoneIds.size).toBe(0);
    expect(r.byElementId.size).toBe(0);
  });

  it('returns the no-op shape when no elements are supplied', () => {
    const tpl = ViewTemplateSchema.parse({
      id: 'tpl-empty', name: 'tpl', viewType: 'plan', isSystemTemplate: false,
      categoryOverrides: {}, filters: [],
    });
    expect(resolveSnapshotForView(tpl, [], RANGE).byElementId.size).toBe(0);
  });

  it('hides whole categories when categoryOverrides.visible=false', () => {
    const tpl = ViewTemplateSchema.parse({
      id: 'tpl-no-furn', name: 'no-furn', viewType: 'plan',
      isSystemTemplate: false,
      categoryOverrides: { Furniture: { visible: false } },
      filters: [],
    });
    const r = resolveSnapshotForView(tpl, ELEMENTS, RANGE);
    expect(r.hiddenIds.has('f1')).toBe(true);
    expect(r.hiddenIds.has('w1')).toBe(false);
  });

  it('flags halftone categories', () => {
    const tpl = ViewTemplateSchema.parse({
      id: 'tpl-halftone', name: 'halftone', viewType: 'plan',
      isSystemTemplate: false,
      categoryOverrides: { Wall: { halftone: true } },
      filters: [],
    });
    const r = resolveSnapshotForView(tpl, ELEMENTS, RANGE);
    expect(r.halftoneIds.has('w1')).toBe(true);
    expect(r.halftoneIds.has('w2')).toBe(true);
    expect(r.halftoneIds.has('f1')).toBe(false);
  });

  it('produces a per-element instruction for every input element', () => {
    const tpl = ViewTemplateSchema.parse({
      id: 'tpl-all', name: 'all', viewType: 'plan',
      isSystemTemplate: false, categoryOverrides: {}, filters: [],
    });
    const r = resolveSnapshotForView(tpl, ELEMENTS, RANGE);
    expect(r.byElementId.size).toBe(ELEMENTS.length);
    for (const e of ELEMENTS) expect(r.byElementId.has(e.id)).toBe(true);
  });
});
