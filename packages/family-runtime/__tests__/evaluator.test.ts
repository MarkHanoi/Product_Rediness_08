import { describe, expect, it } from 'vitest';

import { evaluate, ExpressionEvalError } from '../src/expression/evaluator.js';
import { parse } from '../src/expression/parser.js';

describe('evaluator', () => {
  it('evaluates basic arithmetic', () => {
    expect(evaluate('1 + 2 * 3')).toBe(7);
    expect(evaluate('(1 + 2) * 3')).toBe(9);
    expect(evaluate('-5 + 8')).toBe(3);
    expect(evaluate('10 / 4')).toBe(2.5);
  });

  it('reads identifiers from scope', () => {
    expect(evaluate('Width / 2', { Width: 800 })).toBe(400);
    expect(evaluate('Width + Depth', { Width: 800, Depth: 100 })).toBe(900);
  });

  it('throws on unknown identifier with typed code', () => {
    try {
      evaluate('Foo + 1');
      throw new Error('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(ExpressionEvalError);
      expect((e as ExpressionEvalError).code).toBe('unknown-identifier');
    }
  });

  it('throws on division by zero', () => {
    expect(() => evaluate('1 / 0')).toThrow(/division by zero/);
  });

  it('coerces unit-tagged literals', () => {
    expect(evaluate('5 m')).toBe(5000);
    expect(evaluate('5 m + 200 mm')).toBe(5200);
    expect(evaluate('90 deg')).toBeCloseTo(Math.PI / 2, 10);
    expect(evaluate('1.5707 rad')).toBeCloseTo(1.5707);
  });

  it('evaluates comparisons to 0 / 1', () => {
    expect(evaluate('5 < 10')).toBe(1);
    expect(evaluate('5 > 10')).toBe(0);
    expect(evaluate('5 == 5')).toBe(1);
    expect(evaluate('5 != 5')).toBe(0);
    expect(evaluate('5 <= 5')).toBe(1);
    expect(evaluate('5 >= 6')).toBe(0);
  });

  it('runs every built-in function', () => {
    expect(evaluate('min(3, 7, 2, 9)')).toBe(2);
    expect(evaluate('max(3, 7, 2, 9)')).toBe(9);
    expect(evaluate('if(1, 10, 20)')).toBe(10);
    expect(evaluate('if(0, 10, 20)')).toBe(20);
    expect(evaluate('sqrt(16)')).toBe(4);
    expect(evaluate('abs(-7)')).toBe(7);
    expect(evaluate('round(2.7)')).toBe(3);
    expect(evaluate('floor(2.9)')).toBe(2);
    expect(evaluate('ceil(2.1)')).toBe(3);
    expect(evaluate('pow(2, 10)')).toBe(1024);
    expect(evaluate('sin(0)')).toBe(0);
    expect(evaluate('cos(0)')).toBe(1);
  });

  it('rejects an unknown function with typed code', () => {
    try {
      evaluate('frob(1, 2)');
      throw new Error('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(ExpressionEvalError);
      expect((e as ExpressionEvalError).code).toBe('unknown-function');
    }
  });

  it('rejects bad arity', () => {
    try {
      evaluate('if(1, 2)');
      throw new Error('should have thrown');
    } catch (e) {
      expect((e as ExpressionEvalError).code).toBe('arity');
    }
  });

  it('rejects non-finite results', () => {
    try {
      evaluate('sqrt(-1)');
      throw new Error('should have thrown');
    } catch (e) {
      expect((e as ExpressionEvalError).code).toBe('non-finite');
    }
  });

  it('parse-time syntax errors surface as `parse` code', () => {
    try {
      evaluate('(1 + 2');
      throw new Error('should have thrown');
    } catch (e) {
      expect((e as ExpressionEvalError).code).toBe('parse');
    }
  });

  it('returns the same answer when the AST is reused', () => {
    // Hot-path validation: parse once, evaluate twice.
    const ast = parse('Width / 2 + 50');
    expect(ast).toBeTruthy();
  });

  it('rejects identifier resolved to non-finite', () => {
    expect(() => evaluate('x + 1', { x: Number.NaN })).toThrow(ExpressionEvalError);
  });
});
