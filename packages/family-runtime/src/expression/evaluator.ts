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
import {
  assertAngleArgument,
  divideKinds,
  kindOf,
  multiplyKinds,
  toCanonical,
  unifyKinds,
  type CanonicalKind,
  type Quantity,
} from './unit-coercion.js';
import { emitSpan, type SpanRecord } from '../span-sink.js';

/**
 * A scope entry.
 *
 * ⛔ §UNIT-KIND-ERASURE (C110 §3.5) — THIS IS THE FIX, AND IT IS THE WHOLE
 *    FIX.  `EvalScope` was `Readonly<Record<string, number>>`: a value's
 *    unit kind was erased the instant it entered scope, so `walk()` could
 *    not compare kinds EVEN IN PRINCIPLE, and `UnitMismatchError` — written,
 *    exported and documented since S55 — had no reachable throw site.  C110
 *    §3.5-a names the exit as a typed scope and this is it.
 *
 * ⭐ A BARE `number` IS STILL ACCEPTED, and that is deliberate rather than a
 *    compatibility shim: a number with no declared kind IS `scalar`, which
 *    is the permissive member, so the old spelling keeps its old meaning
 *    exactly.  ⛔ It is also the reason a unit mismatch is only detectable
 *    when the CALLER supplies kinds — `evaluate('W + A', {W: 1, A: 2})`
 *    cannot refuse and must not pretend to.  The production caller,
 *    `resolveParameter`, always supplies kinds (from each parameter's
 *    declared `dataType`), which is where the refusal actually lands and is
 *    where its test reads it back.
 */
export type ScopeValue = number | Quantity;

export type EvalScope = Readonly<Record<string, ScopeValue>>;

function asQuantity(v: ScopeValue): Quantity {
  return typeof v === 'number' ? { value: v, kind: 'scalar' } : v;
}

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

/** Evaluate a pre-parsed AST.  Hot path.  Returns the number only — see
 *  `evaluateAstQuantity` when the caller needs the computed quantity kind
 *  as well. */
export function evaluateAst(
  ast: AstNode,
  scope: EvalScope,
  context: { readonly src?: string; readonly parameterId?: string } = {},
): number {
  return evaluateAstQuantity(ast, scope, context).value;
}

/**
 * Evaluate a pre-parsed AST and return BOTH the number and the quantity
 * kind the expression computes.
 *
 * ⭐ The kind is what the numeric-only signature threw away.  It is returned
 *    rather than merely used-and-discarded because the next question — *does
 *    this expression's computed kind match the kind its parameter DECLARES?*
 *    — is answerable from here and from nowhere else.  That check is NOT
 *    enabled yet (it would need a decision about `count`/`number`
 *    parameters carrying length-valued formulas, which C110 §7 G-1 leaves
 *    open); exposing the value is what stops the next lane having to redo
 *    the erasure fix to ask it.
 */
export function evaluateAstQuantity(
  ast: AstNode,
  scope: EvalScope,
  context: { readonly src?: string; readonly parameterId?: string } = {},
): Quantity {
  const start = nowMs();
  let quantity: Quantity;
  let value: number;
  let status: SpanRecord['status'] = 'ok';
  let errorMessage: string | undefined;
  try {
    quantity = walk(ast, scope);
    value = quantity.value;
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
    attributes: {
      ...spanAttrs(context, ast),
      'family.parameter.value': value,
      // The kind is on the span for the same reason it is on the return:
      // an observability surface that reports a value without its quantity
      // kind is the erasure again, one layer out.
      'family.parameter.quantityKind': quantity.kind,
    },
  });
  return quantity;
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

/**
 * The tree walk.
 *
 * ⛔ IT RETURNS A `Quantity`, NOT A `number`, AND THAT IS THE POINT.  Every
 *    node now carries the kind it measures alongside its value, so the
 *    operators that require agreement can ask for it.  The numeric-only
 *    signature this replaced is the mechanism C110 §3.5 names as
 *    §UNIT-KIND-ERASURE's root: it is not that nobody wrote the check, it is
 *    that the check had nothing to read.
 */
function walk(ast: AstNode, scope: EvalScope): Quantity {
  switch (ast.kind) {
    case 'number':
      // The literal's suffix is where the kind ENTERS the tree — `800 mm` is
      // a length, `2` is a scalar, and `toCanonical` and `kindOf` read the
      // same §UNIT-TABLE row so the value and its kind cannot disagree.
      return { value: toCanonical(ast.value, ast.unit), kind: kindOf(ast.unit) };
    case 'ident': {
      if (!Object.prototype.hasOwnProperty.call(scope, ast.name)) {
        throw new ExpressionEvalError('unknown-identifier', `unknown identifier ${JSON.stringify(ast.name)}`);
      }
      const q = asQuantity(scope[ast.name]!);
      if (!Number.isFinite(q.value)) {
        throw new ExpressionEvalError('non-finite', `identifier ${JSON.stringify(ast.name)} resolved to non-finite value ${q.value}`);
      }
      return q;
    }
    case 'neg': {
      const c = walk(ast.child, scope);
      return { value: -c.value, kind: c.kind };
    }
    case 'arith': {
      const a = walk(ast.left, scope);
      const b = walk(ast.right, scope);
      switch (ast.op) {
        // `+` and `-` are the operators that REQUIRE agreement — adding a
        // length to an angle is the mismatch spec §11 demands be detected.
        case '+': return { value: a.value + b.value, kind: unifyKinds(a.kind, b.kind, '+') };
        case '-': return { value: a.value - b.value, kind: unifyKinds(a.kind, b.kind, '-') };
        // `*` and `/` are the operators that BUILD derived kinds. They never
        // refuse: `Width * Height` is an area, and a rule that refused
        // unlike kinds here would refuse real formulas.
        case '*': return { value: a.value * b.value, kind: multiplyKinds(a.kind, b.kind) };
        case '/': {
          if (b.value === 0) throw new ExpressionEvalError('div-by-zero', `division by zero (${a.value} / 0)`);
          return { value: a.value / b.value, kind: divideKinds(a.kind, b.kind) };
        }
      }
      // Unreachable but TS is happier with this.
      throw new ExpressionEvalError('parse', `unknown arithmetic op ${(ast as { op: string }).op}`);
    }
    case 'cmp': {
      const a = walk(ast.left, scope);
      const b = walk(ast.right, scope);
      // Comparing a length against an angle is as meaningless as adding
      // them, so the same rule applies — but the RESULT is a genuine 0/1
      // and is therefore `scalar`, never the operands' kind.
      unifyKinds(a.kind, b.kind, ast.op);
      const truth = ((): boolean => {
        switch (ast.op) {
          case '<':  return a.value <  b.value;
          case '>':  return a.value >  b.value;
          case '<=': return a.value <= b.value;
          case '>=': return a.value >= b.value;
          case '==': return a.value === b.value;
          case '!=': return a.value !== b.value;
        }
        throw new ExpressionEvalError('parse', `unknown comparison op ${(ast as { op: string }).op}`);
      })();
      return { value: truth ? 1 : 0, kind: 'scalar' };
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
      const args = ast.args.map((a) => walk(a, scope));
      const kind = callResultKind(fn, args);
      const out = fn.call(args.map((a) => a.value));
      if (!Number.isFinite(out)) {
        throw new ExpressionEvalError('non-finite', `function ${JSON.stringify(fn.name)} produced non-finite value ${out}`);
      }
      return { value: out, kind };
    }
  }
}

/**
 * Apply a built-in's declared kind rule.
 *
 * ⛔ The rule lives ON the function table (`functions.ts`), not in a second
 *    table keyed by function name here.  A parallel name→rule map would be
 *    the same duplicate-source-of-truth defect this lane removed from the
 *    unit vocabulary, reintroduced two files later.
 */
function callResultKind(
  fn: NonNullable<ReturnType<typeof lookupBuiltin>>,
  args: readonly Quantity[],
): CanonicalKind {
  if (fn.argKind === 'angle') {
    for (const a of args) assertAngleArgument(a.kind, fn.name);
  }
  switch (fn.resultKind) {
    case 'scalar':
      return 'scalar';
    case 'unify': {
      // `if(cond, a, b)` unifies only its BRANCHES — the condition's kind is
      // none of the result's business, which is why the table carries an
      // index rather than the rule assuming argument 0.
      const considered = args.slice(fn.unifyFrom);
      let acc: CanonicalKind = considered.length === 0 ? 'scalar' : considered[0]!.kind;
      for (let i = 1; i < considered.length; i += 1) {
        acc = unifyKinds(acc, considered[i]!.kind, fn.name);
      }
      return acc;
    }
    case 'derived':
      // `sqrt(area)` is a length and `sqrt(16)` is a number, and this engine
      // declines to guess which one it is looking at. `unknown` is the
      // honest answer; `scalar` would be a claim of dimensionlessness.
      return args.every((a) => a.kind === 'scalar') ? 'scalar' : 'unknown';
  }
}

function nowMs(): number {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    return performance.now();
  }
  return Date.now();
}
