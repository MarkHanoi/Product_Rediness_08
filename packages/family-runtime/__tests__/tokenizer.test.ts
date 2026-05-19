import { describe, expect, it } from 'vitest';

import { LexError, tokenize } from '../src/expression/tokenizer.js';

describe('tokenizer', () => {
  it('tokenises bare numbers', () => {
    const t = tokenize('1 2.5 .25');
    expect(t.map((x) => (x.kind === 'number' ? [x.value, x.unit] : null))).toEqual([
      [1, null],
      [2.5, null],
      [0.25, null],
    ]);
  });

  it('tokenises unit-tagged numbers', () => {
    const t = tokenize('5mm 0.5m 90deg 1.5707rad');
    expect(t.map((x) => (x.kind === 'number' ? [x.value, x.unit] : null))).toEqual([
      [5, 'mm'],
      [0.5, 'm'],
      [90, 'deg'],
      [1.5707, 'rad'],
    ]);
  });

  it('tokenises identifiers and operators', () => {
    const t = tokenize('Width / 2 + Frame_Depth');
    expect(t).toMatchObject([
      { kind: 'ident', name: 'Width' },
      { kind: 'op', op: '/' },
      { kind: 'number', value: 2, unit: null },
      { kind: 'op', op: '+' },
      { kind: 'ident', name: 'Frame_Depth' },
    ]);
  });

  it('tokenises every comparison op', () => {
    const t = tokenize('a < b > c <= d >= e == f != g');
    const ops = t.filter((x) => x.kind === 'cmp').map((x) => (x as { op: string }).op);
    expect(ops).toEqual(['<', '>', '<=', '>=', '==', '!=']);
  });

  it('tokenises function-call syntax', () => {
    const t = tokenize('min(Width, 600 mm)');
    expect(t).toMatchObject([
      { kind: 'ident', name: 'min' },
      { kind: 'op', op: '(' },
      { kind: 'ident', name: 'Width' },
      { kind: 'op', op: ',' },
      { kind: 'number', value: 600, unit: 'mm' },
      { kind: 'op', op: ')' },
    ]);
  });

  it('rejects an unknown character', () => {
    expect(() => tokenize('a $ b')).toThrow(LexError);
  });

  it('rejects a number followed by a non-unit identifier', () => {
    expect(() => tokenize('5x')).toThrow(/insert an operator/);
  });

  it('rejects a number with two dots', () => {
    expect(() => tokenize('1.2.3')).toThrow(LexError);
  });

  it('treats `mm` as an identifier when not adjacent to a number', () => {
    const t = tokenize('mm + 5');
    expect(t[0]).toMatchObject({ kind: 'ident', name: 'mm' });
  });

  it('skips every whitespace flavour', () => {
    expect(tokenize(' \t\n\r 1 ')).toMatchObject([{ kind: 'number', value: 1 }]);
  });
});
