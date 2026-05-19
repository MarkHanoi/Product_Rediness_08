// View-template schema round-trip tests (S31 Track C exit criterion).
//
// Verifies:
//   • Architectural-Plan reference template (PHASE-2B-SUPPLEMENT §B1) parses
//     and round-trips byte-identically.
//   • All 9 FilterCondition kinds parse and round-trip.
//   • Recursive `and` / `or` / `not` containing nested leaves parse.
//   • Empty `categoryOverrides` / `filters` / `annotationCategories` defaults
//     fire correctly when the input omits them.

import { describe, expect, it } from 'vitest';
import {
  CategoryVGSchema,
  FilterConditionSchema,
  StrokeStyleSchema,
  ViewFilterSchema,
  ViewRangeSchema,
  ViewTemplateSchema,
  type FilterCondition,
  type ViewTemplate,
} from '../src/view/view-template.js';

describe('StrokeStyleSchema', () => {
  it('parses with all defaults from {}', () => {
    const s = StrokeStyleSchema.parse({});
    expect(s).toEqual({ visible: true, weight: 0.25, color: '#000000', dash: 'solid' });
  });

  it('preserves non-default values', () => {
    const input = { visible: false, weight: 0.5, color: '#FF00FF', dash: 'dashed' as const };
    expect(StrokeStyleSchema.parse(input)).toEqual(input);
  });
});

describe('CategoryVGSchema', () => {
  it('parses with all-default nested strokes', () => {
    const v = CategoryVGSchema.parse({});
    expect(v.visible).toBe(true);
    expect(v.projection.weight).toBe(0.25);
    expect(v.cut.weight).toBe(0.25);
    expect(v.halftone).toBe(false);
    expect(v.transparency).toBe(0);
  });

  it('clamps transparency to [0, 100]', () => {
    expect(() => CategoryVGSchema.parse({ transparency: 110 })).toThrow();
    expect(() => CategoryVGSchema.parse({ transparency: -1 })).toThrow();
  });
});

describe('FilterConditionSchema — all 9 kinds', () => {
  const cases: FilterCondition[] = [
    { kind: 'pset-equals', pset: 'Pset_WallCommon', property: 'IsExternal', value: true },
    { kind: 'pset-equals', pset: 'Pset_WallCommon', property: 'FireRating', value: '60min' },
    { kind: 'pset-equals', pset: 'Pset_X', property: 'Y', value: 42 },
    { kind: 'pset-contains', pset: 'Pset_X', property: 'Mark', value: 'A1' },
    { kind: 'pset-greater', pset: 'Pset_X', property: 'Length', value: 5 },
    { kind: 'pset-less', pset: 'Pset_X', property: 'Length', value: 10 },
    { kind: 'pset-exists', pset: 'Pset_X', property: 'Volume' },
    { kind: 'type-name-is', typeName: 'Wall:Generic-200mm' },
    { kind: 'and', conditions: [
      { kind: 'pset-equals', pset: 'P', property: 'A', value: 1 },
      { kind: 'pset-greater', pset: 'P', property: 'B', value: 2 },
    ]},
    { kind: 'or', conditions: [
      { kind: 'pset-exists', pset: 'P', property: 'X' },
      { kind: 'type-name-is', typeName: 'X' },
    ]},
    { kind: 'not', condition: { kind: 'pset-equals', pset: 'P', property: 'A', value: 1 } },
  ];

  for (const c of cases) {
    it(`round-trips ${c.kind}`, () => {
      expect(FilterConditionSchema.parse(c)).toEqual(c);
    });
  }

  it('parses recursively-nested and/or/not', () => {
    const nested: FilterCondition = {
      kind: 'and',
      conditions: [
        {
          kind: 'or',
          conditions: [
            { kind: 'pset-equals', pset: 'P', property: 'A', value: 'x' },
            {
              kind: 'not',
              condition: { kind: 'pset-greater', pset: 'P', property: 'B', value: 0 },
            },
          ],
        },
        { kind: 'type-name-is', typeName: 'Foo' },
      ],
    };
    expect(FilterConditionSchema.parse(nested)).toEqual(nested);
  });

  it('rejects unknown kind', () => {
    expect(() => FilterConditionSchema.parse({ kind: 'bogus', value: 1 })).toThrow();
  });
});

describe('ViewFilterSchema', () => {
  it('defaults categories=[], overrides={}, enabled=true', () => {
    const f = ViewFilterSchema.parse({
      id: 'f1',
      name: 'Hide all small things',
      condition: { kind: 'pset-less', pset: 'P', property: 'L', value: 1 },
    });
    expect(f.categories).toEqual([]);
    expect(f.overrides).toEqual({});
    expect(f.enabled).toBe(true);
  });
});

describe('ViewRangeSchema', () => {
  it('defaults to plan-view standard offsets', () => {
    const r = ViewRangeSchema.parse({});
    expect(r).toEqual({
      topClipOffset: 2300,
      cutPlaneOffset: 1200,
      bottomClipOffset: -300,
      viewDepth: 'unlimited',
    });
  });

  it('accepts numeric viewDepth', () => {
    expect(ViewRangeSchema.parse({ viewDepth: 3000 }).viewDepth).toBe(3000);
  });

  it('rejects zero / negative viewDepth', () => {
    expect(() => ViewRangeSchema.parse({ viewDepth: 0 })).toThrow();
    expect(() => ViewRangeSchema.parse({ viewDepth: -1 })).toThrow();
  });
});

describe('ViewTemplateSchema — Architectural-Plan reference template', () => {
  it('round-trips the supplement §B1 reference template', () => {
    const tpl: ViewTemplate = {
      id: 'sys-arch-plan',
      name: 'Architectural Plan',
      discipline: 'Architectural',
      isSystemTemplate: true,
      detailLevel: 'Medium',
      displayStyle: 'HiddenLine',
      annotationCategories: { Dimension: true, Tag: true },
      filters: [],
      viewRange: {
        topClipOffset: 2300,
        cutPlaneOffset: 1200,
        bottomClipOffset: -300,
        viewDepth: 'unlimited',
      },
      categoryOverrides: {
        Wall: {
          visible: true,
          cut: { visible: true, weight: 0.50, color: '#000000', dash: 'solid' },
          projection: { visible: true, weight: 0.13, color: '#000000', dash: 'solid' },
          fillColor: '#000000',
          halftone: false,
          transparency: 0,
        },
        Door: {
          visible: true,
          cut: { visible: true, weight: 0.25, color: '#000000', dash: 'solid' },
          projection: { visible: true, weight: 0.13, color: '#000000', dash: 'solid' },
          halftone: false,
          transparency: 0,
        },
      },
    };
    expect(ViewTemplateSchema.parse(tpl)).toEqual(tpl);
  });

  it('parses minimal {id, name} input applying every default', () => {
    const t = ViewTemplateSchema.parse({ id: 'minimal', name: 'Minimal' });
    expect(t.detailLevel).toBe('Medium');
    expect(t.displayStyle).toBe('HiddenLine');
    expect(t.categoryOverrides).toEqual({});
    expect(t.filters).toEqual([]);
    expect(t.annotationCategories).toEqual({});
    expect(t.isSystemTemplate).toBe(false);
  });

  it('rejects empty name', () => {
    expect(() => ViewTemplateSchema.parse({ id: 'x', name: '' })).toThrow();
  });

  it('rejects > 120-char name', () => {
    expect(() => ViewTemplateSchema.parse({ id: 'x', name: 'a'.repeat(121) })).toThrow();
  });
});
