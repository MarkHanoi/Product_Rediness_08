// Tokenizer for the PRYZM family expression DSL.
//
// Token grammar (kept tight on purpose — §20 risk #5: keep the DSL
// restrictive and grow it under DEV instrumentation):
//   NUMBER     = digit+ ('.' digit+)? UNIT?     where UNIT ∈ {mm,m,deg,rad}
//   IDENT      = [A-Za-z_][A-Za-z0-9_]*
//   OP         = + - * / ( ) ,
//   CMP        = < > <= >= == !=
//
// Identifiers are case-sensitive.  Whitespace is skipped.  Anything
// else is a `LexError`.

export type Unit = 'mm' | 'm' | 'deg' | 'rad';

export type Token =
  | { readonly kind: 'number'; readonly value: number; readonly unit: Unit | null; readonly start: number }
  | { readonly kind: 'ident'; readonly name: string; readonly start: number }
  | { readonly kind: 'op'; readonly op: '+' | '-' | '*' | '/' | '(' | ')' | ','; readonly start: number }
  | { readonly kind: 'cmp'; readonly op: '<' | '>' | '<=' | '>=' | '==' | '!='; readonly start: number };

export class LexError extends Error {
  constructor(message: string, public readonly position: number) {
    super(`[family-runtime/lex] ${message} at position ${position}`);
    this.name = 'LexError';
  }
}

const IDENT_HEAD = /[A-Za-z_]/;
const IDENT_TAIL = /[A-Za-z_0-9]/;
const DIGIT = /[0-9]/;
const UNIT_KEYWORDS: ReadonlySet<string> = new Set(['mm', 'm', 'deg', 'rad']);

/** Tokenise an expression source string.  Throws `LexError` on bad input. */
export function tokenize(src: string): Token[] {
  const out: Token[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i]!;
    if (c === ' ' || c === '\t' || c === '\n' || c === '\r') {
      i += 1;
      continue;
    }
    // Two-char comparisons first (==, !=, <=, >=).
    if (i + 1 < src.length) {
      const two = src.slice(i, i + 2);
      if (two === '==' || two === '!=' || two === '<=' || two === '>=') {
        out.push({ kind: 'cmp', op: two as '==' | '!=' | '<=' | '>=', start: i });
        i += 2;
        continue;
      }
    }
    if (c === '<' || c === '>') {
      out.push({ kind: 'cmp', op: c as '<' | '>', start: i });
      i += 1;
      continue;
    }
    if (c === '+' || c === '-' || c === '*' || c === '/' || c === '(' || c === ')' || c === ',') {
      out.push({ kind: 'op', op: c as '+' | '-' | '*' | '/' | '(' | ')' | ',', start: i });
      i += 1;
      continue;
    }
    if (DIGIT.test(c) || (c === '.' && i + 1 < src.length && DIGIT.test(src[i + 1]!))) {
      const numTok = readNumber(src, i);
      out.push(numTok.token);
      i = numTok.next;
      continue;
    }
    if (IDENT_HEAD.test(c)) {
      let j = i + 1;
      while (j < src.length && IDENT_TAIL.test(src[j]!)) j += 1;
      const name = src.slice(i, j);
      // A bare unit keyword adjacent to a number is consumed by `readNumber`,
      // so any unit keyword that reaches this branch is a free identifier
      // (e.g. a parameter literally named `mm`).  We honour that and treat
      // it as IDENT — the resolver gets to decide if it exists.
      out.push({ kind: 'ident', name, start: i });
      i = j;
      continue;
    }
    throw new LexError(`unexpected character ${JSON.stringify(c)}`, i);
  }
  return out;
}

interface NumberRead {
  readonly token: Token;
  readonly next: number;
}

function readNumber(src: string, start: number): NumberRead {
  let i = start;
  let sawDot = false;
  if (src[i] === '.') {
    sawDot = true;
    i += 1;
  }
  while (i < src.length) {
    const c = src[i]!;
    if (DIGIT.test(c)) {
      i += 1;
      continue;
    }
    if (c === '.') {
      if (sawDot) throw new LexError('invalid number: two dots', i);
      sawDot = true;
      i += 1;
      continue;
    }
    break;
  }
  const literal = src.slice(start, i);
  const value = Number(literal);
  if (!Number.isFinite(value)) {
    throw new LexError(`invalid numeric literal ${JSON.stringify(literal)}`, start);
  }
  // Optional unit suffix.  We accept it both glued (`5mm`) and
  // whitespace-separated (`5 mm`) — the latter matches the
  // spec examples in plan §10.1.  A glued identifier that ISN'T a
  // unit is a hard error (`5x`); a whitespace-separated identifier
  // that isn't a unit is left alone for the parser to reject as
  // adjacent-tokens.
  let unit: Unit | null = null;
  let cursor = i;
  while (cursor < src.length) {
    const c = src[cursor]!;
    if (c === ' ' || c === '\t') {
      cursor += 1;
      continue;
    }
    break;
  }
  const sawWhitespace = cursor !== i;
  if (cursor < src.length && IDENT_HEAD.test(src[cursor]!)) {
    let j = cursor + 1;
    while (j < src.length && IDENT_TAIL.test(src[j]!)) j += 1;
    const candidate = src.slice(cursor, j);
    if (UNIT_KEYWORDS.has(candidate)) {
      unit = candidate as Unit;
      i = j;
    } else if (!sawWhitespace) {
      // Glued non-unit identifier — surface a hard error so the user
      // doesn't silently get `5 * x` semantics from `5x`.
      throw new LexError(
        `unexpected identifier ${JSON.stringify(candidate)} after number; insert an operator or use a unit (mm | m | deg | rad)`,
        cursor,
      );
    }
  }
  return {
    token: { kind: 'number', value, unit, start },
    next: i,
  };
}
