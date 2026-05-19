// Tree-walking evaluator for the parsed family expression AST.
//
// Pure, sandboxed: no global access, no I/O, no DOM, no THREE.  Used
// from the editor (resolve at edit-time), the bake-worker (resolve
// at bake-time), and the AI worker (validate AI-proposed values).
//
// Per plan §14: every successful evaluation emits a
// `pryzm.family.parameter.evaluate` span via the injected sink.
//
// The evaluator never returns a non-finite number — non-finite
// intermediate results raise `ExpressionEvalError` so the caller
// (resolver) can surface a typed diagnostic.

import { collectIdentifiers, parse, ParseError, type AstNode } from './parser.js';
import { lookupBuiltin } from './functions.js';
import { LexError } from './tokenizer.js';
import { toCanonical } from './unit-coercion.js';
import { emitSpan, type SpanRecord } from '../span-sink.js';

export type EvalScope = Readonly<Record<string, number>>;

export class ExpressionEvalError extends Error {
  readonly code:
    | 'unknown-identifier'
    | 'unknown-function'
    | 'arity'
    | 'div-by-zero'
    | 'non-finite'
    | 'parse';
  constructor(code: ExpressionEvalError['code'], message: string) {
    super(`[family-runtime/eval] ${message}`);
    this.name = 'ExpressionEvalError';
    this.code = code;
  }
}

/** Parse + evaluate in one call.  Caller is expected to pre-parse
 *  and reuse the AST when evaluating the same expression repeatedly
 *  (the resolver does this in its dependency-sorted loop). */
export function evaluate(src: string, scope: EvalScope = {}): number {
  let ast: AstNode;
  try {
    ast = parse(src);
  } catch (e) {
    if (e instanceof ParseError || e instanceof LexError) {
      throw new ExpressionEvalError('parse', e.message);
    }
    throw e;
  }
  return evaluateAst(ast, scope, { src });
}

/** Evaluate a pre-parsed AST.  Hot path. */
export function evaluateAst(
  ast: AstNode,
  scope: EvalScope,
  context: { readonly src?: string; readonly parameterId?: string } = {},
): number {
  const start = nowMs();
  let value: number;
  let status: SpanRecord['status'] = 'ok';
  let errorMessage: string | undefined;
  try {
    value = walk(ast, scope);
    if (!Number.isFinite(value)) {
      throw new ExpressionEvalError('non-finite', `evaluation produced non-finite value ${value}`);
    }
  } catch (err) {
    status = 'error';
    errorMessage = err instanceof Error ? err.message : String(err);
    emitSpan({
      name: 'pryzm.family.parameter.evaluate',
      startedAt: Date.now(),
      durationMs: Math.max(0, nowMs() - start),
      status,
      attributes: spanAttrs(context, ast),
      ...(errorMessage !== undefined ? { errorMessage } : {}),
    });
    throw err;
  }
  emitSpan({
    name: 'pryzm.family.parameter.evaluate',
    startedAt: Date.now(),
    durationMs: Math.max(0, nowMs() - start),
    status,
    attributes: { ...spanAttrs(context, ast), 'family.parameter.value': value },
  });
  return value;
}

function spanAttrs(
  ctx: { readonly src?: string; readonly parameterId?: string },
  ast: AstNode,
): Readonly<Record<string, string | number | boolean>> {
  const ids = Array.from(collectIdentifiers(ast)).sort().join(',');
  const out: Record<string, string | number | boolean> = {
    'family.parameter.identifierCount': ids === '' ? 0 : ids.split(',').length,
    'family.parameter.identifiers': ids,
  };
  if (ctx.parameterId !== undefined) out['family.parameter.id'] = ctx.parameterId;
  if (ctx.src !== undefined) out['family.parameter.expression'] = ctx.src;
  return out;
}

function walk(ast: AstNode, scope: EvalScope): number {
  switch (ast.kind) {
    case 'number':
      return toCanonical(ast.value, ast.unit);
    case 'ident': {
      if (!Object.prototype.hasOwnProperty.call(scope, ast.name)) {
        throw new ExpressionEvalError('unknown-identifier', `unknown identifier ${JSON.stringify(ast.name)}`);
      }
      const v = scope[ast.name]!;
      if (!Number.isFinite(v)) {
        throw new ExpressionEvalError('non-finite', `identifier ${JSON.stringify(ast.name)} resolved to non-finite value ${v}`);
      }
      return v;
    }
    case 'neg':
      return -walk(ast.child, scope);
    case 'arith': {
      const a = walk(ast.left, scope);
      const b = walk(ast.right, scope);
      switch (ast.op) {
        case '+': return a + b;
        case '-': return a - b;
        case '*': return a * b;
        case '/': {
          if (b === 0) throw new ExpressionEvalError('div-by-zero', `division by zero (${a} / 0)`);
          return a / b;
        }
      }
      // Unreachable but TS is happier with this.
      throw new ExpressionEvalError('parse', `unknown arithmetic op ${(ast as { op: string }).op}`);
    }
    case 'cmp': {
      const a = walk(ast.left, scope);
      const b = walk(ast.right, scope);
      switch (ast.op) {
        case '<':  return a <  b ? 1 : 0;
        case '>':  return a >  b ? 1 : 0;
        case '<=': return a <= b ? 1 : 0;
        case '>=': return a >= b ? 1 : 0;
        case '==': return a === b ? 1 : 0;
        case '!=': return a !== b ? 1 : 0;
      }
      throw new ExpressionEvalError('parse', `unknown comparison op ${(ast as { op: string }).op}`);
    }
    case 'call': {
      const fn = lookupBuiltin(ast.name);
      if (fn === null) {
        throw new ExpressionEvalError('unknown-function', `unknown function ${JSON.stringify(ast.name)}`);
      }
      if (ast.args.length < fn.minArgs || ast.args.length > fn.maxArgs) {
        const arityMsg = fn.minArgs === fn.maxArgs
          ? `expected ${fn.minArgs}`
          : `expected ${fn.minArgs}–${fn.maxArgs}`;
        throw new ExpressionEvalError('arity', `function ${JSON.stringify(fn.name)} got ${ast.args.length} args (${arityMsg})`);
      }
      const argValues = ast.args.map((a) => walk(a, scope));
      const out = fn.call(argValues);
      if (!Number.isFinite(out)) {
        throw new ExpressionEvalError('non-finite', `function ${JSON.stringify(fn.name)} produced non-finite value ${out}`);
      }
      return out;
    }
  }
}

function nowMs(): number {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    return performance.now();
  }
  return Date.now();
}
