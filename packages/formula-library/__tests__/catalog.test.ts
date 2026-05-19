import { describe, it, expect } from 'vitest';
import {
  FormulaCatalog,
  FormulaNotFoundError,
  FormulaArityError,
  FormulaArgumentError,
  buildCatalogWithBuiltins,
  getDefaultCatalog,
} from '../src/index.js';

describe('FormulaCatalog.register', () => {
  it('registers + retrieves', () => {
    const c = new FormulaCatalog();
    c.register(
      {
        id: 'double',
        name: 'Double',
        description: 'x*2',
        signature: { params: [{ name: 'x', type: 'number' }], returnType: 'number' },
        version: '1.0.0',
      },
      (args) => (args[0] as number) * 2,
    );
    expect(c.has('double')).toBe(true);
    expect(c.invoke('double', [3])).toBe(6);
  });

  it('rejects duplicate id', () => {
    const c = new FormulaCatalog();
    c.register(
      { id: 'x', name: 'X', description: '', version: '1', signature: { params: [], returnType: 'number' } },
      () => 1,
    );
    expect(() =>
      c.register(
        { id: 'x', name: 'X', description: '', version: '1', signature: { params: [], returnType: 'number' } },
        () => 2,
      ),
    ).toThrow(/already registered/);
  });

  it('rejects malformed descriptor', () => {
    const c = new FormulaCatalog();
    expect(() =>
      c.register(
        { id: '', name: 'X', description: '', version: '1', signature: { params: [], returnType: 'number' } },
        () => 1,
      ),
    ).toThrow(/malformed/);
  });

  it('rejects after freeze', () => {
    const c = new FormulaCatalog();
    c.freeze();
    expect(() =>
      c.register(
        { id: 'x', name: 'X', description: '', version: '1', signature: { params: [], returnType: 'number' } },
        () => 1,
      ),
    ).toThrow(/frozen/);
  });
});

describe('FormulaCatalog.invoke', () => {
  it('throws FormulaNotFoundError for unknown id', () => {
    const c = new FormulaCatalog();
    expect(() => c.invoke('does-not-exist', [])).toThrow(FormulaNotFoundError);
  });

  it('throws FormulaArityError on wrong arg count', () => {
    const c = buildCatalogWithBuiltins();
    expect(() => c.invoke('sum', [1, 2])).toThrow(FormulaArityError);
  });

  it('throws FormulaArgumentError on wrong arg type', () => {
    const c = buildCatalogWithBuiltins();
    expect(() => c.invoke('sum', ['not an array' as any])).toThrow(FormulaArgumentError);
  });

  it('rejects non-finite numbers', () => {
    const c = buildCatalogWithBuiltins();
    expect(() => c.invoke('distance', [Number.NaN, 0])).toThrow(FormulaArgumentError);
    expect(() => c.invoke('distance', [Number.POSITIVE_INFINITY, 0])).toThrow(FormulaArgumentError);
  });
});

describe('built-in formulas — arithmetic', () => {
  const c = buildCatalogWithBuiltins();

  it('sum', () => expect(c.invoke('sum', [[1, 2, 3, 4]])).toBe(10));
  it('avg', () => expect(c.invoke('avg', [[2, 4, 6]])).toBe(4));
  it('min', () => expect(c.invoke('min', [[3, 1, 2]])).toBe(1));
  it('max', () => expect(c.invoke('max', [[3, 1, 2]])).toBe(3));
  it('count', () => expect(c.invoke('count', [[10, 20, 30, 40]])).toBe(4));

  it('avg of empty array → NaN (loud-fail-soft contract)', () => {
    expect(Number.isNaN(c.invoke('avg', [[]]) as number)).toBe(true);
  });
});

describe('built-in formulas — geometric (mm units)', () => {
  const c = buildCatalogWithBuiltins();
  it('distance |a-b|', () => expect(c.invoke('distance', [10, 3])).toBe(7));
  it('distance handles negatives', () => expect(c.invoke('distance', [-5, 5])).toBe(10));
  it('area-rect', () => expect(c.invoke('area-rect', [3, 4])).toBe(12));
  it('perimeter-rect', () => expect(c.invoke('perimeter-rect', [3, 4])).toBe(14));
});

describe('built-in formulas — utilities', () => {
  const c = buildCatalogWithBuiltins();
  it('ratio', () => expect(c.invoke('ratio', [10, 4])).toBe(2.5));
  it('ratio by zero → NaN', () => expect(Number.isNaN(c.invoke('ratio', [10, 0]) as number)).toBe(true));
  it('clamp inside', () => expect(c.invoke('clamp', [5, 0, 10])).toBe(5));
  it('clamp under', () => expect(c.invoke('clamp', [-3, 0, 10])).toBe(0));
  it('clamp over', () => expect(c.invoke('clamp', [99, 0, 10])).toBe(10));
  it('clamp inverted bounds → returns lo', () => expect(c.invoke('clamp', [5, 10, 0])).toBe(10));
  it('lerp t=0', () => expect(c.invoke('lerp', [0, 100, 0])).toBe(0));
  it('lerp t=1', () => expect(c.invoke('lerp', [0, 100, 1])).toBe(100));
  it('lerp t=0.5', () => expect(c.invoke('lerp', [0, 100, 0.5])).toBe(50));
  it('round', () => expect(c.invoke('round', [3.14159, 2])).toBe(3.14));
  it('round to 0 digits', () => expect(c.invoke('round', [3.7, 0])).toBe(4));
  it('round negative digits clamped to 0', () => expect(c.invoke('round', [3.7, -5])).toBe(4));
});

describe('list ordering + version pin', () => {
  it('list returns 12 built-in descriptors in registration order', () => {
    const c = buildCatalogWithBuiltins();
    const ids = c.list().map((d) => d.id);
    expect(ids).toEqual([
      'sum', 'avg', 'min', 'max', 'count',
      'distance', 'area-rect', 'perimeter-rect',
      'ratio', 'clamp', 'lerp', 'round',
    ]);
  });

  it('all built-ins are at version 1.0.0 — bump versions on signature change', () => {
    const c = buildCatalogWithBuiltins();
    for (const d of c.list()) expect(d.version).toBe('1.0.0');
  });

  it('list result is frozen', () => {
    const c = buildCatalogWithBuiltins();
    const list = c.list();
    expect(() => { (list as any).push({ id: 'oops' }); }).toThrow(TypeError);
  });
});

describe('default singleton', () => {
  it('getDefaultCatalog returns a frozen, identical instance', () => {
    const a = getDefaultCatalog();
    const b = getDefaultCatalog();
    expect(a).toBe(b);
    expect(a.isFrozen()).toBe(true);
    expect(a.size()).toBe(12);
  });

  it('default catalog cannot be extended (frozen)', () => {
    const c = getDefaultCatalog();
    expect(() =>
      c.register(
        { id: 'extra', name: 'X', description: '', version: '1.0.0', signature: { params: [], returnType: 'number' } },
        () => 1,
      ),
    ).toThrow(/frozen/);
  });
});
