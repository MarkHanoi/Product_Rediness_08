// Tiny tree-walking evaluator for the parsed AST.
//
// Identifier lookup happens via the `Scope` argument: a plain
// `Record<string, number>` (or any function-style lookup wrapped in a
// proxy by the caller).  Unknown identifiers throw `ExprEvalError`.

import { parse, type AstNode, ParseError } from './parser.js';

export type Scope = Readonly<Record<string, number>>;

export class ExprEvalError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(`[expr-eval] ${message}`);
    this.name = 'ExprEvalError';
  }
}

function walk(ast: AstNode, scope: Scope): number {
  switch (ast.kind) {
    case 'number':
      return ast.value;
    case 'ident': {
      const v = scope[ast.name];
      if (v === undefined) {
        throw new ExprEvalError(`unknown identifier "${ast.name}"`);
      }
      if (!Number.isFinite(v)) {
        throw new ExprEvalError(`identifier "${ast.name}" resolved to non-finite value ${v}`);
      }
      return v;
    }
    case 'neg':
      return -walk(ast.child, scope);
    case 'binop': {
      const a = walk(ast.left, scope);
      const b = walk(ast.right, scope);
      switch (ast.op) {
        case '+':
          return a + b;
        case '-':
          return a - b;
        case '*':
          return a * b;
        case '/': {
          if (b === 0) {
            throw new ExprEvalError(`division by zero (${a} / 0)`);
          }
          return a / b;
        }
      }
    }
  }
}

/** Parse + evaluate an expression in one call.  Returns a finite
 *  number or throws `ExprEvalError` (or `ParseError` on syntax error,
 *  surfaced as-is so callers can pattern-match on parse vs runtime
 *  failures).  Pre-parse the AST via {@link parse} when evaluating
 *  the same expression repeatedly. */
export function evaluate(src: string, scope: Scope = {}): number {
  let ast: AstNode;
  try {
    ast = parse(src);
  } catch (e) {
    if (e instanceof ParseError) throw e;
    throw new ExprEvalError(`parse failed: ${(e as Error)?.message ?? e}`, e);
  }
  const v = walk(ast, scope);
  if (!Number.isFinite(v)) {
    throw new ExprEvalError(`evaluation produced non-finite value: ${v}`);
  }
  return v;
}
