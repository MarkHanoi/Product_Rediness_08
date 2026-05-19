// ViewResolutionAlgorithm tests (S33 Track C exit criterion).
//
// Verifies:
//   • Priority chain: per-element > filter > category > default.
//   • All 5 ElementClassification values.
//   • All 9 FilterCondition kinds.
//   • Cut vs projection stroke selection.

import { describe, expect, it } from 'vitest';
import type {
  CategoryVG,
  FilterCondition,
  ViewTemplate,
} from '@pryzm/schemas/view/view-template';
import {
  classifyElement,
  evaluateCondition,
  resolveElementInstructions,
  type ElementForView,
} from '../resolver.js';

// ── Helpers ────────────────────────────────────────────────────────────────

function tpl(overrides: Partial<ViewTemplate> = {}): ViewTemplate {
  return {
    id: 'sys-test',
    name: 'Test Template',
    detailLevel: 'Medium',
    displayStyle: 'HiddenLine',
    annotationCategories: {},
    isSystemTemplate: false,
    categoryOverrides: {},
    filters: [],
    ...overrides,
  };
}

const VIEW_RANGE_PLAN = {
  cutPlaneZ: 1.2,
  topClipZ: 2.3,
  bottomClipZ: -0.3,
  levelZ: 0,
};

const baseEl = (id: string): ElementForView => ({
  id,
  category: 'Wall',
  worldZMin: 0,
  worldZMax: 3,
});

// ── Classification (5 cases) ───────────────────────────────────────────────

describe('classifyElement', () => {
  it('cut: straddles cut plane', () => {
    expect(classifyElement({ worldZMin: 0, worldZMax: 3 }, VIEW_RANGE_PLAN)).toBe('cut');
  });
  it('beyond: entirely above cut, within top clip', () => {
    expect(classifyElement({ worldZMin: 1.5, worldZMax: 2.0 }, VIEW_RANGE_PLAN)).toBe('beyond');
  });
  it('hidden: entirely below cut, within bottom clip', () => {
    expect(classifyElement({ worldZMin: -0.2, worldZMax: 1.0 }, VIEW_RANGE_PLAN)).toBe('hidden');
  });
  it('outside-range: entirely above top clip', () => {
    expect(classifyElement({ worldZMin: 2.5, worldZMax: 3.0 }, VIEW_RANGE_PLAN)).toBe('outside-range');
  });
  it('outside-range: entirely below bottom clip', () => {
    expect(classifyElement({ worldZMin: -1.0, worldZMax: -0.5 }, VIEW_RANGE_PLAN)).toBe('outside-range');
  });
});

// ── Filter condition evaluation (all 9 kinds) ──────────────────────────────

describe('evaluateCondition (all 9 kinds)', () => {
  const psets = {
    Pset_WallCommon: { IsExternal: true, FireRating: '60min', Length: 5 },
    Pset_X: { Mark: 'A1-Stub', Volume: 12 },
  };

  it('pset-equals (string)', () => {
    const c: FilterCondition = { kind: 'pset-equals', pset: 'Pset_WallCommon', property: 'FireRating', value: '60min' };
    expect(evaluateCondition(c, psets, '')).toBe(true);
    expect(evaluateCondition({ ...c, value: '120min' }, psets, '')).toBe(false);
  });
  it('pset-equals (number)', () => {
    const c: FilterCondition = { kind: 'pset-equals', pset: 'Pset_WallCommon', property: 'Length', value: 5 };
    expect(evaluateCondition(c, psets, '')).toBe(true);
  });
  it('pset-equals (boolean)', () => {
    const c: FilterCondition = { kind: 'pset-equals', pset: 'Pset_WallCommon', property: 'IsExternal', value: true };
    expect(evaluateCondition(c, psets, '')).toBe(true);
  });
  it('pset-contains', () => {
    const c: FilterCondition = { kind: 'pset-contains', pset: 'Pset_X', property: 'Mark', value: 'A1' };
    expect(evaluateCondition(c, psets, '')).toBe(true);
    expect(evaluateCondition({ ...c, value: 'B2' }, psets, '')).toBe(false);
  });
  it('pset-greater', () => {
    expect(evaluateCondition({ kind: 'pset-greater', pset: 'Pset_X', property: 'Volume', value: 10 }, psets, '')).toBe(true);
    expect(evaluateCondition({ kind: 'pset-greater', pset: 'Pset_X', property: 'Volume', value: 20 }, psets, '')).toBe(false);
  });
  it('pset-less', () => {
    expect(evaluateCondition({ kind: 'pset-less', pset: 'Pset_X', property: 'Volume', value: 20 }, psets, '')).toBe(true);
  });
  it('pset-exists', () => {
    expect(evaluateCondition({ kind: 'pset-exists', pset: 'Pset_X', property: 'Mark' }, psets, '')).toBe(true);
    expect(evaluateCondition({ kind: 'pset-exists', pset: 'Pset_X', property: 'Missing' }, psets, '')).toBe(false);
  });
  it('type-name-is', () => {
    expect(evaluateCondition({ kind: 'type-name-is', typeName: 'Wall:Generic' }, psets, 'Wall:Generic')).toBe(true);
    expect(evaluateCondition({ kind: 'type-name-is', typeName: 'Wall:Generic' }, psets, 'Other')).toBe(false);
  });
  it('and (short-circuits false)', () => {
    const c: FilterCondition = {
      kind: 'and',
      conditions: [
        { kind: 'pset-exists', pset: 'Pset_X', property: 'Volume' },
        { kind: 'pset-equals', pset: 'Pset_X', property: 'Mark', value: 'NEVER' },
      ],
    };
    expect(evaluateCondition(c, psets, '')).toBe(false);
  });
  it('or (short-circuits true)', () => {
    const c: FilterCondition = {
      kind: 'or',
      conditions: [
        { kind: 'pset-equals', pset: 'Pset_X', property: 'Mark', value: 'A1-Stub' },
        { kind: 'pset-equals', pset: 'Pset_X', property: 'Mark', value: 'NEVER' },
      ],
    };
    expect(evaluateCondition(c, psets, '')).toBe(true);
  });
  it('not (negates leaf)', () => {
    const c: FilterCondition = {
      kind: 'not',
      condition: { kind: 'pset-equals', pset: 'Pset_X', property: 'Mark', value: 'A1-Stub' },
    };
    expect(evaluateCondition(c, psets, '')).toBe(false);
  });
  it('nested and(or(not(...)))', () => {
    const c: FilterCondition = {
      kind: 'and',
      conditions: [
        { kind: 'pset-exists', pset: 'Pset_X', property: 'Volume' },
        {
          kind: 'or',
          conditions: [
            { kind: 'not', condition: { kind: 'pset-equals', pset: 'Pset_X', property: 'Mark', value: 'NEVER' } },
            { kind: 'type-name-is', typeName: 'X' },
          ],
        },
      ],
    };
    expect(evaluateCondition(c, psets, '')).toBe(true);
  });
});

// ── Priority chain ─────────────────────────────────────────────────────────

describe('resolveElementInstructions priority chain', () => {
  const cyanCut: Partial<CategoryVG> = {
    visible: true,
    cut: { visible: true, weight: 0.7, color: '#00FFFF', dash: 'solid' },
    projection: { visible: true, weight: 0.3, color: '#00FFFF', dash: 'solid' },
  };
  const redOverride: Partial<CategoryVG> = {
    visible: true,
    cut: { visible: true, weight: 0.4, color: '#FF0000', dash: 'dashed' },
    projection: { visible: true, weight: 0.4, color: '#FF0000', dash: 'dashed' },
  };
  const greenFilterVG: Partial<CategoryVG> = {
    visible: true,
    cut: { visible: true, weight: 0.5, color: '#00FF00', dash: 'solid' },
    projection: { visible: true, weight: 0.5, color: '#00FF00', dash: 'solid' },
  };

  it('priority 1: per-element override wins over filter + category', () => {
    const tplWithFilterAndCat = tpl({
      categoryOverrides: { Wall: { ...cyanCut } as CategoryVG },
      filters: [
        {
          id: 'f1',
          name: 'External walls',
          categories: ['Wall'],
          condition: { kind: 'pset-equals', pset: 'P', property: 'X', value: 1 },
          overrides: greenFilterVG,
          enabled: true,
        },
      ],
    });
    const el = { ...baseEl('e1'), psets: { P: { X: 1 } } };
    const overrides = new Map([['e1', redOverride]]);
    const [r] = resolveElementInstructions([el], tplWithFilterAndCat, VIEW_RANGE_PLAN, overrides);
    expect(r.stroke.color).toBe('#FF0000');
  });

  it('priority 2: matching filter wins over category default', () => {
    const t = tpl({
      categoryOverrides: { Wall: { ...cyanCut } as CategoryVG },
      filters: [
        {
          id: 'f1',
          name: 'External walls',
          categories: ['Wall'],
          condition: { kind: 'pset-equals', pset: 'P', property: 'X', value: 1 },
          overrides: greenFilterVG,
          enabled: true,
        },
      ],
    });
    const el = { ...baseEl('e1'), psets: { P: { X: 1 } } };
    const [r] = resolveElementInstructions([el], t, VIEW_RANGE_PLAN, new Map());
    expect(r.stroke.color).toBe('#00FF00');
  });

  it('priority 3: category override applies when no filter matches', () => {
    const t = tpl({
      categoryOverrides: { Wall: { ...cyanCut } as CategoryVG },
      filters: [
        {
          id: 'f1',
          name: 'No-match filter',
          categories: ['Wall'],
          condition: { kind: 'pset-equals', pset: 'P', property: 'X', value: 999 },
          overrides: greenFilterVG,
          enabled: true,
        },
      ],
    });
    const el = { ...baseEl('e1'), psets: { P: { X: 1 } } };
    const [r] = resolveElementInstructions([el], t, VIEW_RANGE_PLAN, new Map());
    expect(r.stroke.color).toBe('#00FFFF');
  });

  it('priority 4: package default (black 0.5mm cut) when nothing matches', () => {
    const el = baseEl('e1');
    const [r] = resolveElementInstructions([el], tpl(), VIEW_RANGE_PLAN, new Map());
    expect(r.stroke.color).toBe('#000000');
    expect(r.stroke.weight).toBe(0.5);     // cut stroke at default
    expect(r.classification).toBe('cut');
  });

  it('disabled filter is skipped', () => {
    const t = tpl({
      filters: [
        {
          id: 'f1',
          name: 'X',
          categories: ['Wall'],
          condition: { kind: 'pset-equals', pset: 'P', property: 'X', value: 1 },
          overrides: greenFilterVG,
          enabled: false,
        },
      ],
    });
    const el = { ...baseEl('e1'), psets: { P: { X: 1 } } };
    const [r] = resolveElementInstructions([el], t, VIEW_RANGE_PLAN, new Map());
    expect(r.stroke.color).toBe('#000000');
  });

  it('filter with empty categories list applies to ALL categories', () => {
    const t = tpl({
      filters: [
        {
          id: 'f1',
          name: 'Universal',
          categories: [],
          condition: { kind: 'pset-exists', pset: 'P', property: 'X' },
          overrides: greenFilterVG,
          enabled: true,
        },
      ],
    });
    const wallEl = { ...baseEl('e1'), psets: { P: { X: 1 } } };
    const slabEl = { ...baseEl('e2'), category: 'Slab' as const, psets: { P: { X: 1 } } };
    const [r1, r2] = resolveElementInstructions([wallEl, slabEl], t, VIEW_RANGE_PLAN, new Map());
    expect(r1.stroke.color).toBe('#00FF00');
    expect(r2.stroke.color).toBe('#00FF00');
  });

  it('invisible VG → instruction.visible=false, transparent stroke', () => {
    const t = tpl({
      categoryOverrides: { Wall: { visible: false } as CategoryVG },
    });
    const [r] = resolveElementInstructions([baseEl('e1')], t, VIEW_RANGE_PLAN, new Map());
    expect(r.visible).toBe(false);
    expect(r.stroke.color).toBe('transparent');
  });

  it('cut elements use cut stroke; beyond elements use projection stroke', () => {
    const t = tpl({
      categoryOverrides: { Wall: {
        visible: true,
        cut: { visible: true, weight: 0.6, color: '#000000', dash: 'solid' },
        projection: { visible: true, weight: 0.1, color: '#888888', dash: 'dashed' },
        halftone: false,
        transparency: 0,
      } },
    });
    const cutEl = { ...baseEl('cut'), worldZMin: 0, worldZMax: 3 };
    const beyondEl = { ...baseEl('beyond'), worldZMin: 1.5, worldZMax: 2.0 };
    const [rCut, rBeyond] = resolveElementInstructions([cutEl, beyondEl], t, VIEW_RANGE_PLAN, new Map());
    expect(rCut.stroke.weight).toBe(0.6);
    expect(rBeyond.stroke.weight).toBe(0.1);
    expect(rBeyond.stroke.color).toBe('#888888');
  });

  it('fillColor → fill instruction; transparency → opacity', () => {
    const t = tpl({
      categoryOverrides: { Wall: {
        visible: true,
        cut: { visible: true, weight: 0.6, color: '#000000', dash: 'solid' },
        projection: { visible: true, weight: 0.1, color: '#000000', dash: 'solid' },
        fillColor: '#FF00FF',
        hatchName: 'concrete',
        halftone: false,
        transparency: 25,
      } },
    });
    const [r] = resolveElementInstructions([baseEl('e1')], t, VIEW_RANGE_PLAN, new Map());
    expect(r.fill).toBeDefined();
    expect(r.fill?.color).toBe('#FF00FF');
    expect(r.fill?.hatch).toBe('concrete');
    expect(r.fill?.opacity).toBeCloseTo(0.75, 5);
  });
});
