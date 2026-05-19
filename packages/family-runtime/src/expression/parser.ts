// Recursive-descent parser for the PRYZM family expression DSL.
//
// Grammar (tighter than expr-eval; supports comparisons + function
// calls + unit-tagged numeric literals — see `tokenizer.ts`):
//
//   expr     := compare
//   compare  := addsub (CMP addsub)?      // single-comparison only
//   addsub   := muldiv (('+' | '-') muldiv)*
//   muldiv   := unary  (('*' | '/') unary )*
//   unary    := '-' unary | call
//   call     := IDENT '(' args? ')' | primary
//   args     := expr (',' expr)*
//   primary  := NUMBER | IDENT | '(' expr ')'
//
// The output AST is a discriminated union the evaluator walks in
// O(N).  Function call arity is NOT validated here — that's a runtime
// concern of `evaluator.ts` so the registered function table is the
// single source of truth.

import {
  tokenize,
  type Token,
  type Unit,
} from './tokenizer.js';

export type CompareOp = '<' | '>' | '<=' | '>=' | '==' | '!=';
export type ArithOp = '+' | '-' | '*' | '/';

export type AstNode =
  | { readonly kind: 'number'; readonly value: number; readonly unit: Unit | null }
  | { readonly kind: 'ident'; readonly name: string }
  | { readonly kind: 'neg'; readonly child: AstNode }
  | { readonly kind: 'arith'; readonly op: ArithOp; readonly left: AstNode; readonly right: AstNode }
  | { readonly kind: 'cmp'; readonly op: CompareOp; readonly left: AstNode; readonly right: AstNode }
  | { readonly kind: 'call'; readonly name: string; readonly args: readonly AstNode[] };

export class ParseError extends Error {
  constructor(message: string, public readonly position: number) {
    super(`[family-runtime/parse] ${message} at position ${position}`);
    this.name = 'ParseError';
  }
}

interface State {
  readonly tokens: readonly Token[];
  index: number;
}

export function parse(src: string): AstNode {
  const tokens = tokenize(src);
  if (tokens.length === 0) {
    throw new ParseError('empty expression', 0);
  }
  const state: State = { tokens, index: 0 };
  const ast = parseExpr(state);
  if (state.index !== tokens.length) {
    throw new ParseError(`unexpected token after expression`, tokens[state.index]!.start);
  }
  return ast;
}

function peek(state: State): Token | null {
  return state.index < state.tokens.length ? state.tokens[state.index]! : null;
}

function consume(state: State): Token {
  const t = peek(state);
  if (t === null) {
    const last = state.tokens[state.tokens.length - 1];
    throw new ParseError('unexpected end of expression', last ? last.start : 0);
  }
  state.index += 1;
  return t;
}

function parseExpr(state: State): AstNode {
  return parseCompare(state);
}

function parseCompare(state: State): AstNode {
  const left = parseAddsub(state);
  const t = peek(state);
  if (t !== null && t.kind === 'cmp') {
    consume(state);
    const right = parseAddsub(state);
    return { kind: 'cmp', op: t.op, left, right };
  }
  return left;
}

function parseAddsub(state: State): AstNode {
  let left = parseMuldiv(state);
  while (true) {
    const t = peek(state);
    if (t !== null && t.kind === 'op' && (t.op === '+' || t.op === '-')) {
      consume(state);
      const right = parseMuldiv(state);
      left = { kind: 'arith', op: t.op, left, right };
      continue;
    }
    break;
  }
  return left;
}

function parseMuldiv(state: State): AstNode {
  let left = parseUnary(state);
  while (true) {
    const t = peek(state);
    if (t !== null && t.kind === 'op' && (t.op === '*' || t.op === '/')) {
      consume(state);
      const right = parseUnary(state);
      left = { kind: 'arith', op: t.op, left, right };
      continue;
    }
    break;
  }
  return left;
}

function parseUnary(state: State): AstNode {
  const t = peek(state);
  if (t !== null && t.kind === 'op' && t.op === '-') {
    consume(state);
    const child = parseUnary(state);
    return { kind: 'neg', child };
  }
  return parseCall(state);
}

function parseCall(state: State): AstNode {
  const t = peek(state);
  if (t !== null && t.kind === 'ident') {
    const next = state.tokens[state.index + 1];
    if (next && next.kind === 'op' && next.op === '(') {
      consume(state); // ident
      consume(state); // (
      const args: AstNode[] = [];
      const peeked = peek(state);
      if (!(peeked && peeked.kind === 'op' && peeked.op === ')')) {
        args.push(parseExpr(state));
        while (true) {
          const sep = peek(state);
          if (sep && sep.kind === 'op' && sep.op === ',') {
            consume(state);
            args.push(parseExpr(state));
            continue;
          }
          break;
        }
      }
      const close = peek(state);
      if (!(close && close.kind === 'op' && close.op === ')')) {
        throw new ParseError(`expected ')' to close call to ${JSON.stringify(t.name)}`, close ? close.start : t.start);
      }
      consume(state); // )
      return { kind: 'call', name: t.name, args };
    }
  }
  return parsePrimary(state);
}

function parsePrimary(state: State): AstNode {
  const t = peek(state);
  if (t === null) {
    throw new ParseError('unexpected end of expression', state.tokens[state.tokens.length - 1]?.start ?? 0);
  }
  if (t.kind === 'number') {
    consume(state);
    return { kind: 'number', value: t.value, unit: t.unit };
  }
  if (t.kind === 'ident') {
    consume(state);
    return { kind: 'ident', name: t.name };
  }
  if (t.kind === 'op' && t.op === '(') {
    consume(state);
    const inner = parseExpr(state);
    const close = peek(state);
    if (!(close && close.kind === 'op' && close.op === ')')) {
      throw new ParseError(`expected ')'`, close ? close.start : t.start);
    }
    consume(state);
    return inner;
  }
  throw new ParseError(`unexpected token`, t.start);
}

/** Walk the AST and collect every identifier name referenced.  Used
 *  by the resolver to build the dependency graph for cycle detection.
 *  Function names are NOT collected — they are resolved against the
 *  registered function table, not the parameter scope. */
export function collectIdentifiers(ast: AstNode, into: Set<string> = new Set()): Set<string> {
  switch (ast.kind) {
    case 'number':
      return into;
    case 'ident':
      into.add(ast.name);
      return into;
    case 'neg':
      return collectIdentifiers(ast.child, into);
    case 'arith':
    case 'cmp':
      collectIdentifiers(ast.left, into);
      collectIdentifiers(ast.right, into);
      return into;
    case 'call':
      for (const a of ast.args) collectIdentifiers(a, into);
      return into;
  }
}
