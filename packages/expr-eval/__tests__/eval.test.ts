import { describe, expect, it } from 'vitest';
import { evaluate, ExprEvalError, parse } from '../src/index.js';
import { ParseError } from '../src/parser.js';

describe('@pryzm/expr-eval — light parametric expressions (SPEC-01 §4.1)', () => {
  describe('numbers', () => {
    it('reads integer literals', () => {
      expect(evaluate('42')).toBe(42);
    });
    it('reads decimal literals', () => {
      expect(evaluate('3.14')).toBeCloseTo(3.14, 10);
    });
    it('reads bare-dot decimal literals', () => {
      expect(evaluate('.5')).toBe(0.5);
    });
  });

  describe('arithmetic', () => {
    it('adds', () => expect(evaluate('1 + 2')).toBe(3));
    it('subtracts', () => expect(evaluate('5 - 3')).toBe(2));
    it('multiplies', () => expect(evaluate('4 * 6')).toBe(24));
    it('divides', () => expect(evaluate('10 / 4')).toBe(2.5));
    it('respects multiplicative precedence', () =>
      expect(evaluate('1 + 2 * 3')).toBe(7));
    it('respects parentheses', () => expect(evaluate('(1 + 2) * 3')).toBe(9));
    it('left-associates same-precedence ops', () =>
      expect(evaluate('100 - 30 - 20')).toBe(50));
    it('handles unary negation', () => expect(evaluate('-5')).toBe(-5));
    it('handles nested unary negation', () => expect(evaluate('--5')).toBe(5));
    it('handles unary inside parens', () => expect(evaluate('-(2 + 3)')).toBe(-5));
  });

  describe('identifiers', () => {
    it('resolves single identifier', () => {
      expect(evaluate('a', { a: 7 })).toBe(7);
    });
    it('substitutes identifiers in compound expressions', () => {
      expect(evaluate('a + b * 2', { a: 1, b: 3 })).toBe(7);
    });
    it('handles SPEC-01 §4.1 example: `length = a + b`', () => {
      expect(evaluate('a + b', { a: 1.5, b: 2.5 })).toBe(4);
    });
    it('handles SPEC-01 §4.1 example: `angle = 90 * 0.5`', () => {
      expect(evaluate('90 * 0.5')).toBe(45);
    });
    it('handles a realistic window-mullion-spacing expression', () => {
      const v = evaluate('(width - 2 * frame) / panes', {
        width: 1.2,
        frame: 0.05,
        panes: 2,
      });
      expect(v).toBeCloseTo(0.55, 10);
    });
    it('throws on unknown identifier', () => {
      expect(() => evaluate('a + b', { a: 1 })).toThrow(ExprEvalError);
      expect(() => evaluate('a + b', { a: 1 })).toThrow(/unknown identifier "b"/);
    });
    it('throws on non-finite identifier value', () => {
      expect(() => evaluate('a', { a: Number.POSITIVE_INFINITY })).toThrow(
        /non-finite value/,
      );
    });
  });

  describe('errors', () => {
    it('throws on division by zero', () => {
      expect(() => evaluate('1 / 0')).toThrow(ExprEvalError);
      expect(() => evaluate('1 / 0')).toThrow(/division by zero/);
    });
    it('throws ParseError on dangling operator', () => {
      expect(() => evaluate('1 +')).toThrow(ParseError);
    });
    it('throws ParseError on missing closing paren', () => {
      expect(() => evaluate('(1 + 2')).toThrow(ParseError);
    });
    it('throws ParseError on trailing tokens', () => {
      expect(() => evaluate('1 + 2 3')).toThrow(ParseError);
    });
    it('throws ParseError on unknown character', () => {
      expect(() => evaluate('1 # 2')).toThrow(ParseError);
    });
  });

  describe('determinism (SPEC-01 §6)', () => {
    it('same input → byte-identical output across repeated evaluations', () => {
      const expr = '(a + b) * c - d / e';
      const scope = { a: 1.1, b: 2.2, c: 3.3, d: 4.4, e: 5.5 };
      const first = evaluate(expr, scope);
      for (let i = 0; i < 100; i++) {
        expect(evaluate(expr, scope)).toBe(first);
      }
    });

    it('parse then walk many times yields identical results', () => {
      const ast = parse('a * a + b * b');
      const scope = { a: 1.234, b: 5.678 };
      const first = evaluate('a * a + b * b', scope);
      // Re-evaluate via the public surface — pre-parsed cache is a
      // future optimisation; for now we assert determinism end-to-end.
      for (let i = 0; i < 50; i++) {
        expect(evaluate('a * a + b * b', scope)).toBe(first);
      }
      // The AST itself is structurally stable.
      expect(ast.kind).toBe('binop');
    });
  });

  describe('purity guarantees', () => {
    it('does not mutate the scope', () => {
      const scope = { a: 1, b: 2 };
      evaluate('a + b', scope);
      expect(scope).toEqual({ a: 1, b: 2 });
    });
  });
});
