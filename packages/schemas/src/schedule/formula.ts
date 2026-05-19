// Formula DSL — types shared between parser, evaluator, and renderer
// (S41 / Phase 2C / ADR-0032).
//
// Pure-data types ONLY — no parser/evaluator code lives here so the
// schemas package stays free of plugin runtime concerns.  The parser
// + evaluator implementation lives in
// `plugins/schedules/src/formula-evaluator.ts` and consumes these
// types via subpath import (`@pryzm/schemas/schedule`).

/** A computed cell value.  `null` means "no value" (the cell renders
 *  blank).  Errors surface as the sentinel STRINGS `'#ERR'` and
 *  `'#CIRCULAR'` (NOT `null`) so a column whose result type is
 *  `'string'` can carry the error inline without losing typing. */
export type FormulaResult = string | number | boolean | null;

/** AST nodes.  Discriminated union — a `kind`-keyed switch in the
 *  evaluator covers every case at compile time. */
export type FormulaNode =
  | { readonly kind: 'lit'; readonly value: number | string | boolean | null }
  | { readonly kind: 'ident'; readonly name: string }
  | { readonly kind: 'call'; readonly name: string; readonly args: readonly FormulaNode[] }
  | { readonly kind: 'binary'; readonly op: BinaryOp; readonly left: FormulaNode; readonly right: FormulaNode }
  | { readonly kind: 'unary'; readonly op: UnaryOp; readonly operand: FormulaNode };

export type BinaryOp =
  | '+' | '-' | '*' | '/' | '%'
  | '==' | '!=' | '<' | '<=' | '>' | '>='
  | '&&' | '||';

export type UnaryOp = '-' | '!';

/** Built-in functions the evaluator recognises by name.  Identifiers
 *  the parser produces are case-sensitive — `COUNT` is built-in;
 *  `count` is a field reference. */
export const BUILTIN_FUNCTIONS = [
  'COUNT', 'SUM', 'AVG', 'MIN', 'MAX',
  'IF', 'ROUND', 'CONCAT', 'LEN',
  'UPPER', 'LOWER', 'COALESCE',
] as const;
export type BuiltinFunction = (typeof BUILTIN_FUNCTIONS)[number];

/** True iff `name` is one of the built-in DSL functions. */
export function isBuiltinFunction(name: string): name is BuiltinFunction {
  return (BUILTIN_FUNCTIONS as readonly string[]).includes(name);
}

/** Sentinel cell values surfaced by the evaluator. */
export const CELL_ERR = '#ERR' as const;
export const CELL_CIRCULAR = '#CIRCULAR' as const;
export const CELL_UNDEF = '#UNDEF' as const;

/** Maximum recursion depth before the evaluator forces `#CIRCULAR`
 *  (per ADR-0032 §"circular detection"). */
export const FORMULA_MAX_DEPTH = 100;

/** A single computed row — `cells` is keyed by `ScheduleColumn.id`. */
export interface ScheduleRow {
  /** The element id this row was derived from.  For grouped schedules,
   *  it's the id of the FIRST element in the group (stable across
   *  evaluations because element listing iterates in insertion order). */
  readonly elementId: string;
  /** Column id → computed cell value. */
  readonly cells: Readonly<Record<string, FormulaResult>>;
  /** When `groupBy` is set on the schedule, the count of elements that
   *  collapsed into this row.  `undefined` for ungrouped schedules. */
  readonly groupSize?: number;
}
