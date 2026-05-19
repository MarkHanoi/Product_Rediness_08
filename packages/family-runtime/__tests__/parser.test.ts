import { describe, expect, it } from 'vitest';

import { collectIdentifiers, parse, ParseError } from '../src/expression/parser.js';

describe('parser', () => {
  it('parses a single number', () => {
    expect(parse('1')).toMatchObject({ kind: 'number', value: 1 });
  });

  it('parses left-associative addition', () => {
    expect(parse('1 + 2 + 3')).toMatchObject({
      kind: 'arith',
      op: '+',
      left: { kind: 'arith', op: '+', left: { kind: 'number', value: 1 }, right: { kind: 'number', value: 2 } },
      right: { kind: 'number', value: 3 },
    });
  });

  it('respects mul/add precedence', () => {
    const ast = parse('1 + 2 * 3');
    expect(ast).toMatchObject({
      kind: 'arith',
      op: '+',
      left: { kind: 'number', value: 1 },
      right: {
        kind: 'arith',
        op: '*',
        left: { kind: 'number', value: 2 },
        right: { kind: 'number', value: 3 },
      },
    });
  });

  it('parses parenthesised expressions', () => {
    const ast = parse('(1 + 2) * 3');
    expect(ast).toMatchObject({
      kind: 'arith',
      op: '*',
      left: { kind: 'arith', op: '+' },
      right: { kind: 'number', value: 3 },
    });
  });

  it('parses unary negation', () => {
    expect(parse('-Width')).toMatchObject({ kind: 'neg', child: { kind: 'ident', name: 'Width' } });
    expect(parse('-(1 + 2)')).toMatchObject({ kind: 'neg' });
  });

  it('parses a comparison', () => {
    expect(parse('Width >= 800')).toMatchObject({ kind: 'cmp', op: '>=' });
  });

  it('parses a function call with arguments', () => {
    expect(parse('min(Width, 600)')).toMatchObject({
      kind: 'call',
      name: 'min',
      args: [{ kind: 'ident', name: 'Width' }, { kind: 'number', value: 600 }],
    });
  });

  it('parses a no-arg call', () => {
    expect(parse('foo()')).toMatchObject({ kind: 'call', name: 'foo', args: [] });
  });

  it('parses a nested if expression', () => {
    expect(parse('if(Width > 800, Width, 800)')).toMatchObject({
      kind: 'call',
      name: 'if',
    });
  });

  it('rejects an empty expression', () => {
    expect(() => parse('')).toThrow(ParseError);
  });

  it('rejects an unclosed paren', () => {
    expect(() => parse('(1 + 2')).toThrow(/expected '\)'/);
  });

  it('rejects trailing garbage', () => {
    expect(() => parse('1 + 2 3')).toThrow(ParseError);
  });

  it('collects identifiers but not function names', () => {
    const ast = parse('min(Width, max(Height, 600)) + Depth');
    const ids = Array.from(collectIdentifiers(ast)).sort();
    expect(ids).toEqual(['Depth', 'Height', 'Width']);
  });
});
