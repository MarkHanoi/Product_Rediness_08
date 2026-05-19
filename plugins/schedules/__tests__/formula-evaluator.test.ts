// Formula DSL — parser + evaluator coverage (S41 / ADR-0032).
//
// This file is the canonical fixture for the DSL semantics described
// in ADR-0032.  Adding a new built-in or operator?  Add a test here
// FIRST, then implement.

import { describe, it, expect } from 'vitest';
import {
  evaluateFormula,
  parseFormula,
  FormulaCircularError,
  type EvalElement,
} from '../src/formula-evaluator.js';
import {
  FormulaArityError,
  FormulaParseError,
  FormulaUndefinedIdentifierError,
} from '../src/errors.js';

const NO_ELEMENTS: readonly EvalElement[] = [];

function ctx(element: EvalElement = {}, allElements: readonly EvalElement[] = NO_ELEMENTS) {
  return { element, allElements };
}

describe('parseFormula — basics', () => {
  it('parses literals', () => {
    expect(parseFormula('1')).toMatchObject({ kind: 'lit', value: 1 });
    expect(parseFormula('1.5')).toMatchObject({ kind: 'lit', value: 1.5 });
    expect(parseFormula('"foo"')).toMatchObject({ kind: 'lit', value: 'foo' });
    expect(parseFormula("'bar'")).toMatchObject({ kind: 'lit', value: 'bar' });
    expect(parseFormula('true')).toMatchObject({ kind: 'lit', value: true });
    expect(parseFormula('false')).toMatchObject({ kind: 'lit', value: false });
    expect(parseFormula('null')).toMatchObject({ kind: 'lit', value: null });
  });

  it('parses identifiers', () => {
    expect(parseFormula('width')).toMatchObject({ kind: 'ident', name: 'width' });
  });

  it('parses calls with 0/1/many args', () => {
    expect(parseFormula('COUNT()')).toMatchObject({ kind: 'call', name: 'COUNT', args: [] });
    expect(parseFormula('SUM(width)')).toMatchObject({ kind: 'call', name: 'SUM' });
    expect(parseFormula('IF(a, b, c)')).toMatchObject({ kind: 'call', name: 'IF', args: [{}, {}, {}] });
  });

  it('handles operator precedence', () => {
    // 1 + 2 * 3 → 1 + (2*3)
    const ast = parseFormula('1 + 2 * 3') as { kind: 'binary'; op: string; right: { kind: 'binary' } };
    expect(ast.op).toBe('+');
    expect(ast.right.kind).toBe('binary');
    expect((ast.right as { op: string }).op).toBe('*');
  });

  it('handles parens', () => {
    const ast = parseFormula('(1 + 2) * 3') as { kind: 'binary'; op: string; left: { kind: 'binary' } };
    expect(ast.op).toBe('*');
    expect(ast.left.op).toBe('+');
  });

  it('throws on malformed input', () => {
    expect(() => parseFormula('1 +')).toThrow(FormulaParseError);
    expect(() => parseFormula('(1 + 2')).toThrow(FormulaParseError);
    expect(() => parseFormula('"unterminated')).toThrow(FormulaParseError);
    expect(() => parseFormula('@')).toThrow(FormulaParseError);
    expect(() => parseFormula('foo(')).toThrow(FormulaParseError);
  });

  it('parses string escapes', () => {
    expect(parseFormula('"line\\nfeed"')).toMatchObject({ kind: 'lit', value: 'line\nfeed' });
    expect(parseFormula('"q\\"u"')).toMatchObject({ kind: 'lit', value: 'q"u' });
  });
});

describe('evaluateFormula — literals & identifiers', () => {
  it('returns literal values', () => {
    expect(evaluateFormula('42', ctx())).toBe(42);
    expect(evaluateFormula('"hi"', ctx())).toBe('hi');
    expect(evaluateFormula('true', ctx())).toBe(true);
    expect(evaluateFormula('null', ctx())).toBe(null);
  });

  it('reads field references off the current element', () => {
    expect(evaluateFormula('width', ctx({ width: 900 }))).toBe(900);
    expect(evaluateFormula('type', ctx({ type: 'sliding' }))).toBe('sliding');
  });

  it('resolves bare COUNT to allElements.length', () => {
    expect(evaluateFormula('COUNT', ctx({}, [{}, {}, {}]))).toBe(3);
    expect(evaluateFormula('COUNT', ctx({}, []))).toBe(0);
  });

  it('throws on undefined identifier', () => {
    expect(() => evaluateFormula('nope', ctx({}))).toThrow(FormulaUndefinedIdentifierError);
  });

  it('coerces object values to JSON strings', () => {
    expect(evaluateFormula('meta', ctx({ meta: { a: 1 } }))).toBe('{"a":1}');
  });
});

describe('evaluateFormula — arithmetic', () => {
  it('adds, subtracts, multiplies, divides', () => {
    expect(evaluateFormula('1 + 2', ctx())).toBe(3);
    expect(evaluateFormula('10 - 3', ctx())).toBe(7);
    expect(evaluateFormula('4 * 5', ctx())).toBe(20);
    expect(evaluateFormula('10 / 4', ctx())).toBe(2.5);
    expect(evaluateFormula('10 % 3', ctx())).toBe(1);
  });

  it('div by zero → null', () => {
    expect(evaluateFormula('1 / 0', ctx())).toBe(null);
    expect(evaluateFormula('1 % 0', ctx())).toBe(null);
  });

  it('coerces string-numbers', () => {
    expect(evaluateFormula('width + 1', ctx({ width: '5' }))).toBe(6);
  });

  it('coerces booleans to 0/1', () => {
    expect(evaluateFormula('true + 0', ctx())).toBe(1);
    expect(evaluateFormula('false + 0', ctx())).toBe(0);
  });

  it('returns null when a side is non-numeric', () => {
    expect(evaluateFormula('"foo" + 1', ctx())).toBe(null);
  });

  it('respects operator precedence in evaluation', () => {
    expect(evaluateFormula('2 + 3 * 4', ctx())).toBe(14);
    expect(evaluateFormula('(2 + 3) * 4', ctx())).toBe(20);
    expect(evaluateFormula('-2 * 3', ctx())).toBe(-6);
  });
});

describe('evaluateFormula — comparison & logical', () => {
  it('equality with type coercion', () => {
    expect(evaluateFormula('1 == 1', ctx())).toBe(true);
    expect(evaluateFormula('"3" == 3', ctx())).toBe(true);
    expect(evaluateFormula('1 != 2', ctx())).toBe(true);
    expect(evaluateFormula('"a" == "a"', ctx())).toBe(true);
    expect(evaluateFormula('null == null', ctx())).toBe(true);
  });

  it('ordering operators', () => {
    expect(evaluateFormula('1 < 2', ctx())).toBe(true);
    expect(evaluateFormula('2 <= 2', ctx())).toBe(true);
    expect(evaluateFormula('3 > 2', ctx())).toBe(true);
    expect(evaluateFormula('3 >= 3', ctx())).toBe(true);
  });

  it('logical && / || with short-circuit', () => {
    expect(evaluateFormula('true && false', ctx())).toBe(false);
    expect(evaluateFormula('true && true', ctx())).toBe(true);
    expect(evaluateFormula('false || true', ctx())).toBe(true);
    // Short-circuit: 1/0 is null, but the && short-circuits on the
    // first false so the right side is never evaluated.
    expect(evaluateFormula('false && (1/0)', ctx())).toBe(false);
    expect(evaluateFormula('true || (1/0)', ctx())).toBe(true);
  });

  it('unary ! and -', () => {
    expect(evaluateFormula('!true', ctx())).toBe(false);
    expect(evaluateFormula('!false', ctx())).toBe(true);
    expect(evaluateFormula('!0', ctx())).toBe(true);
    expect(evaluateFormula('!"foo"', ctx())).toBe(false);
    expect(evaluateFormula('-5', ctx())).toBe(-5);
  });
});

describe('evaluateFormula — built-ins', () => {
  const elements: EvalElement[] = [
    { width: 100, height: 200, type: 'A' },
    { width: 200, height: 100, type: 'B' },
    { width: 300, height: 150, type: 'A' },
  ];
  const c = ctx(elements[0]!, elements);

  it('COUNT() and COUNT(predicate)', () => {
    expect(evaluateFormula('COUNT()', c)).toBe(3);
    expect(evaluateFormula('COUNT(width > 150)', c)).toBe(2);
    expect(evaluateFormula('COUNT(type == "A")', c)).toBe(2);
  });

  it('SUM / AVG / MIN / MAX', () => {
    expect(evaluateFormula('SUM(width)', c)).toBe(600);
    expect(evaluateFormula('AVG(height)', c)).toBe(150);
    expect(evaluateFormula('MIN(width)', c)).toBe(100);
    expect(evaluateFormula('MAX(width)', c)).toBe(300);
  });

  it('SUM / AVG handle empty / non-numeric values', () => {
    expect(evaluateFormula('SUM(width)', ctx({}, []))).toBe(0);
    expect(evaluateFormula('AVG(width)', ctx({}, []))).toBe(null);
  });

  it('SUM(expr) with mixed-numeric values skips non-numeric', () => {
    const mix = [{ x: 1 }, { x: 'foo' }, { x: 2 }];
    expect(evaluateFormula('SUM(x)', ctx(mix[0]!, mix))).toBe(3);
  });

  it('IF(cond, then, else)', () => {
    expect(evaluateFormula('IF(true, 1, 2)', c)).toBe(1);
    expect(evaluateFormula('IF(false, 1, 2)', c)).toBe(2);
    expect(evaluateFormula('IF(width > 50, "big", "small")', c)).toBe('big');
  });

  it('ROUND with optional digits', () => {
    expect(evaluateFormula('ROUND(1.4)', c)).toBe(1);
    expect(evaluateFormula('ROUND(1.5)', c)).toBe(2);
    expect(evaluateFormula('ROUND(1.234, 2)', c)).toBe(1.23);
    expect(evaluateFormula('ROUND(width / 7, 2)', c)).toBe(14.29);
  });

  it('CONCAT, UPPER, LOWER, LEN', () => {
    expect(evaluateFormula('CONCAT("a", "b", "c")', c)).toBe('abc');
    expect(evaluateFormula('CONCAT(width, "mm")', c)).toBe('100mm');
    expect(evaluateFormula('UPPER("foo")', c)).toBe('FOO');
    expect(evaluateFormula('LOWER("FOO")', c)).toBe('foo');
    expect(evaluateFormula('LEN("hello")', c)).toBe(5);
    expect(evaluateFormula('LEN(null)', c)).toBe(0);
  });

  it('COALESCE returns first non-null', () => {
    expect(evaluateFormula('COALESCE(null, null, "fallback")', c)).toBe('fallback');
    expect(evaluateFormula('COALESCE(width, "fallback")', c)).toBe(100);
  });

  it('arity errors', () => {
    expect(() => evaluateFormula('IF(true, 1)', c)).toThrow(FormulaArityError);
    expect(() => evaluateFormula('SUM()', c)).toThrow(FormulaArityError);
    expect(() => evaluateFormula('UPPER("a", "b")', c)).toThrow(FormulaArityError);
  });
});

describe('evaluateFormula — cross-column references and circular detection', () => {
  it('resolves a cross-column reference', () => {
    const columnsById = {
      area: parseFormula('width * height'),
    };
    const r = evaluateFormula('area / 1000', {
      element: { width: 100, height: 200 },
      allElements: [{ width: 100, height: 200 }],
      columnsById,
    });
    expect(r).toBe(20);
  });

  it('detects two-column cycles', () => {
    const columnsById = {
      a: parseFormula('b + 1'),
      b: parseFormula('a + 1'),
    };
    expect(() => evaluateFormula('a', {
      element: {},
      allElements: [],
      columnsById,
    })).toThrow(FormulaCircularError);
  });

  it('detects self-reference cycles', () => {
    const columnsById = { x: parseFormula('x + 1') };
    expect(() => evaluateFormula('x', {
      element: {},
      allElements: [],
      columnsById,
    })).toThrow(FormulaCircularError);
  });
});
