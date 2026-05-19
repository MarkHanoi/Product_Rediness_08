// evaluate-schedule.ts — turn a `ScheduleData` + element source into
// `ScheduleRow[]` (S41 / Phase 2C / ADR-0032).
//
// Pure pipeline:
//
//        elements
//           │
//           ▼
//   ┌────────────────┐
//   │  applyFilter   │  ← boolean formula evaluated per element
//   └───────┬────────┘
//           ▼
//   ┌────────────────┐
//   │ partitionByGB  │  ← optional groupBy (1 row per group)
//   └───────┬────────┘
//           ▼
//   ┌────────────────┐
//   │   evalCells    │  ← parse each column once, evaluate per row
//   └───────┬────────┘
//           ▼
//        ScheduleRow[]
//
// PER-CELL ERROR ISOLATION
// ─────────────────────────────────────────────────────────────────────────────
// Spec §S41 line 877: "If a column formula throws, the affected cell
// surfaces a sentinel string ('#ERR' / '#CIRCULAR' / '#UNDEF'); the
// REST of the row evaluates normally."  We catch around every column
// eval to honour this — never around the whole row.

import type {
  FormulaNode,
  FormulaResult,
  ScheduleData,
  ScheduleRow,
} from '@pryzm/plugin-sdk';
import {
  CELL_CIRCULAR,
  CELL_ERR,
  CELL_UNDEF,
} from '@pryzm/plugin-sdk';
import {
  evaluateAst,
  parseFormula,
  FormulaCircularError,
  type EvalContext,
  type EvalElement,
} from './formula-evaluator.js';
import {
  FormulaParseError,
  FormulaUndefinedIdentifierError,
} from './errors.js';
import { withScheduleSpan } from './tracing.js';

export interface EvaluateScheduleOptions {
  /** When true, parses each column formula every call (NO ast cache).
   *  Default false — see `clearAstCache()` if you mutate columns. */
  readonly noCache?: boolean;
}

/** Cache of parsed ASTs keyed by formula source string.  ASTs are
 *  pure data so a single global cache is safe across schedules. */
const astCache = new Map<string, FormulaNode | Error>();

/** Drop the parsed-AST cache.  The handler layer SHOULD NOT need this
 *  (column formulas are immutable strings and the cache is keyed by
 *  source); the test suite uses it to verify isolated parses. */
export function clearScheduleAstCache(): void {
  astCache.clear();
}

function getAst(source: string, noCache: boolean): FormulaNode | Error {
  if (noCache) {
    try { return parseFormula(source); }
    catch (e) { return e instanceof Error ? e : new Error(String(e)); }
  }
  const cached = astCache.get(source);
  if (cached !== undefined) return cached;
  let result: FormulaNode | Error;
  try { result = parseFormula(source); }
  catch (e) { result = e instanceof Error ? e : new Error(String(e)); }
  astCache.set(source, result);
  return result;
}

function emptyCellsFor(schedule: ScheduleData): Record<string, FormulaResult> {
  const cells: Record<string, FormulaResult> = {};
  for (const col of schedule.columns) cells[col.id] = null;
  return cells;
}

/** Evaluate one cell — wraps `evaluateAst` with the per-cell error
 *  isolation guarantee. */
function evalCell(ast: FormulaNode | Error, ctx: EvalContext): FormulaResult {
  if (ast instanceof Error) return CELL_ERR;
  try {
    return evaluateAst(ast, ctx);
  } catch (e) {
    if (e instanceof FormulaCircularError) return CELL_CIRCULAR;
    if (e instanceof FormulaUndefinedIdentifierError) return CELL_UNDEF;
    if (e instanceof FormulaParseError) return CELL_ERR;
    return CELL_ERR;
  }
}

/** Build the `columnsById` cross-reference map for a schedule.  Used
 *  by the evaluator to resolve column-to-column references. */
function buildColumnRegistry(schedule: ScheduleData, noCache: boolean): Record<string, FormulaNode> {
  const reg: Record<string, FormulaNode> = {};
  for (const col of schedule.columns) {
    if (!col.formula) continue;
    const ast = getAst(col.formula, noCache);
    if (!(ast instanceof Error)) reg[col.id] = ast;
  }
  return reg;
}

function applyFilter(
  schedule: ScheduleData,
  elements: readonly EvalElement[],
  registry: Record<string, FormulaNode>,
  noCache: boolean,
): readonly EvalElement[] {
  if (!schedule.filter) return elements;
  const ast = getAst(schedule.filter, noCache);
  if (ast instanceof Error) return []; // a broken filter excludes everything
  const out: EvalElement[] = [];
  for (const el of elements) {
    try {
      const v = evaluateAst(ast, { element: el, allElements: elements, columnsById: registry });
      if (v) out.push(el);
    } catch {
      /* element fails the filter on error — silently skip */
    }
  }
  return out;
}

/** Partition elements by `groupBy`.  Returns each group as a non-empty
 *  ordered tuple `[firstElement, group]`.  Insertion order of distinct
 *  groupBy values is preserved (Map iteration order). */
function partitionByGroup(
  groupBy: string,
  elements: readonly EvalElement[],
): ReadonlyArray<readonly [EvalElement, readonly EvalElement[]]> {
  const groups = new Map<unknown, EvalElement[]>();
  for (const el of elements) {
    const key = el[groupBy];
    const arr = groups.get(key);
    if (arr) arr.push(el);
    else groups.set(key, [el]);
  }
  const out: Array<readonly [EvalElement, readonly EvalElement[]]> = [];
  for (const arr of groups.values()) out.push([arr[0]!, arr]);
  return out;
}

/** Evaluate a schedule against a snapshot of the source elements.
 *  Pure — does not mutate any argument.  See class docstring above for
 *  the pipeline. */
export function evaluateSchedule(
  schedule: ScheduleData,
  elements: ReadonlyArray<EvalElement & { id: string }>,
  options: EvaluateScheduleOptions = {},
): readonly ScheduleRow[] {
  return withScheduleSpan(
    'pryzm.schedule.evaluate',
    () => evaluateScheduleInner(schedule, elements, options),
    { scheduleId: schedule.id, elementCount: elements.length },
  );
}

function evaluateScheduleInner(
  schedule: ScheduleData,
  elements: ReadonlyArray<EvalElement & { id: string }>,
  options: EvaluateScheduleOptions,
): readonly ScheduleRow[] {
  const noCache = options.noCache === true;
  const registry = buildColumnRegistry(schedule, noCache);

  // 1. Filter.
  const filtered = applyFilter(schedule, elements, registry, noCache) as ReadonlyArray<EvalElement & { id: string }>;

  // 2. Partition by groupBy (if set).
  const rows: ScheduleRow[] = [];
  if (schedule.groupBy) {
    const groups = partitionByGroup(schedule.groupBy, filtered);
    for (const [first, group] of groups) {
      const cells = emptyCellsFor(schedule);
      for (const col of schedule.columns) {
        if (!col.formula) { cells[col.id] = null; continue; }
        const ast = getAst(col.formula, noCache);
        cells[col.id] = evalCell(ast, {
          element: first,
          allElements: group,
          columnsById: registry,
        });
      }
      rows.push({
        elementId: (first as { id: string }).id,
        cells,
        groupSize: group.length,
      });
    }
  } else {
    for (const el of filtered) {
      const cells = emptyCellsFor(schedule);
      for (const col of schedule.columns) {
        if (!col.formula) { cells[col.id] = null; continue; }
        const ast = getAst(col.formula, noCache);
        cells[col.id] = evalCell(ast, {
          element: el,
          allElements: filtered,
          columnsById: registry,
        });
      }
      rows.push({ elementId: el.id, cells });
    }
  }
  return rows;
}
