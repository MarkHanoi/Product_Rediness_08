// Recursive-descent parser for the tiny PRYZM 2 expression grammar.
//
// Grammar:
//   expr   := term (('+' | '-') term)*
//   term   := factor (('*' | '/') factor)*
//   factor := '-' factor | primary
//   primary:= number | identifier | '(' expr ')'
//
// The output AST is a discriminated union the evaluator walks in
// O(N) without further allocation pressure.

export type AstNode =
  | { readonly kind: 'number'; readonly value: number }
  | { readonly kind: 'ident'; readonly name: string }
  | {
      readonly kind: 'binop';
      readonly op: '+' | '-' | '*' | '/';
      readonly left: AstNode;
      readonly right: AstNode;
    }
  | { readonly kind: 'neg'; readonly child: AstNode };

type Token =
  | { readonly kind: 'number'; readonly value: number; readonly start: number }
  | { readonly kind: 'ident'; readonly name: string; readonly start: number }
  | { readonly kind: 'op'; readonly op: '+' | '-' | '*' | '/' | '(' | ')'; readonly start: number };

export class ParseError extends Error {
  constructor(message: string, public readonly position: number) {
    super(`[expr-eval] ${message} at position ${position}`);
    this.name = 'ParseError';
  }
}

const IDENT_HEAD = /[A-Za-z_]/;
const IDENT_TAIL = /[A-Za-z_0-9]/;
const DIGIT = /[0-9]/;

function tokenize(src: string): Token[] {
  const out: Token[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i]!;
    if (c === ' ' || c === '\t' || c === '\n' || c === '\r') {
      i += 1;
      continue;
    }
    if (c === '+' || c === '-' || c === '*' || c === '/' || c === '(' || c === ')') {
      out.push({ kind: 'op', op: c as '+' | '-' | '*' | '/' | '(' | ')', start: i });
      i += 1;
      continue;
    }
    if (DIGIT.test(c) || (c === '.' && i + 1 < src.length && DIGIT.test(src[i + 1]!))) {
      let j = i;
      let sawDot = c === '.';
      j += 1;
      while (j < src.length) {
        const cj = src[j]!;
        if (DIGIT.test(cj)) {
          j += 1;
          continue;
        }
        if (cj === '.' && !sawDot) {
          sawDot = true;
          j += 1;
          continue;
        }
        break;
      }
      const lex = src.slice(i, j);
      const value = Number(lex);
      if (!Number.isFinite(value)) {
        throw new ParseError(`malformed number literal "${lex}"`, i);
      }
      out.push({ kind: 'number', value, start: i });
      i = j;
      continue;
    }
    if (IDENT_HEAD.test(c)) {
      let j = i + 1;
      while (j < src.length && IDENT_TAIL.test(src[j]!)) j += 1;
      out.push({ kind: 'ident', name: src.slice(i, j), start: i });
      i = j;
      continue;
    }
    throw new ParseError(`unexpected character "${c}"`, i);
  }
  return out;
}

class Cursor {
  constructor(public readonly tokens: readonly Token[], public pos: number = 0) {}

  peek(): Token | undefined {
    return this.tokens[this.pos];
  }
  next(): Token | undefined {
    return this.tokens[this.pos++];
  }
  eof(): boolean {
    return this.pos >= this.tokens.length;
  }
}

function parseExpr(c: Cursor): AstNode {
  let left = parseTerm(c);
  while (true) {
    const t = c.peek();
    if (t?.kind === 'op' && (t.op === '+' || t.op === '-')) {
      c.next();
      const right = parseTerm(c);
      left = { kind: 'binop', op: t.op, left, right };
      continue;
    }
    return left;
  }
}

function parseTerm(c: Cursor): AstNode {
  let left = parseFactor(c);
  while (true) {
    const t = c.peek();
    if (t?.kind === 'op' && (t.op === '*' || t.op === '/')) {
      c.next();
      const right = parseFactor(c);
      left = { kind: 'binop', op: t.op, left, right };
      continue;
    }
    return left;
  }
}

function parseFactor(c: Cursor): AstNode {
  const t = c.peek();
  if (t?.kind === 'op' && t.op === '-') {
    c.next();
    return { kind: 'neg', child: parseFactor(c) };
  }
  return parsePrimary(c);
}

function parsePrimary(c: Cursor): AstNode {
  const t = c.next();
  if (!t) {
    throw new ParseError('unexpected end of expression', c.tokens.length);
  }
  if (t.kind === 'number') return { kind: 'number', value: t.value };
  if (t.kind === 'ident') return { kind: 'ident', name: t.name };
  if (t.kind === 'op' && t.op === '(') {
    const inner = parseExpr(c);
    const close = c.next();
    if (!close || close.kind !== 'op' || close.op !== ')') {
      throw new ParseError('expected ")" to close subexpression', t.start);
    }
    return inner;
  }
  throw new ParseError(`unexpected token "${describe(t)}"`, t.start);
}

function describe(t: Token): string {
  if (t.kind === 'number') return String(t.value);
  if (t.kind === 'ident') return t.name;
  return t.op;
}

/** Parse `src` into an AST.  Throws `ParseError` on syntax error. */
export function parse(src: string): AstNode {
  const tokens = tokenize(src);
  const c = new Cursor(tokens);
  const ast = parseExpr(c);
  if (!c.eof()) {
    const t = c.peek()!;
    throw new ParseError(`trailing tokens after expression (next: "${describe(t)}")`, t.start);
  }
  return ast;
}
