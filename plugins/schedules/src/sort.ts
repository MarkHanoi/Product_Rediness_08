// sort.ts — stable row sorter for the schedules plugin (S41).
//
// Sort is an external concern: it lives outside `evaluateSchedule()`
// because the live table view re-sorts on header click without a full
// re-evaluation, and the sheet ScheduleSnapshot widget bakes a
// frozen sort order into its payload.

import type { FormulaResult, ScheduleColumnDto, ScheduleRow } from '@pryzm/plugin-sdk';

export type SortDirection = 'asc' | 'desc';

/** Compare two cell values according to the column's declared `type`. */
function compareCells(a: FormulaResult, b: FormulaResult, type: ScheduleColumnDto['type']): number {
  // Nulls sort last (regardless of asc/desc — flip is applied by caller).
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;

  if (type === 'number') {
    const an = typeof a === 'number' ? a : Number(a);
    const bn = typeof b === 'number' ? b : Number(b);
    if (Number.isNaN(an) && Number.isNaN(bn)) return 0;
    if (Number.isNaN(an)) return 1;
    if (Number.isNaN(bn)) return -1;
    return an - bn;
  }
  if (type === 'boolean') {
    const ab = a ? 1 : 0;
    const bb = b ? 1 : 0;
    return ab - bb;
  }
  // String — locale-aware (matches the case-insensitive ordering
  // expected by users).
  return String(a).localeCompare(String(b));
}

/** Stable sort by a single column.  Returns a NEW array; does not
 *  mutate input.  Stable: rows with equal sort key retain their
 *  original relative order (preserves the evaluator's element-list
 *  insertion order). */
export function sortRows(
  rows: readonly ScheduleRow[],
  columns: readonly ScheduleColumnDto[],
  columnId: string,
  direction: SortDirection = 'asc',
): readonly ScheduleRow[] {
  const col = columns.find((c) => c.id === columnId);
  if (!col) return rows;
  // Decorate-sort-undecorate for stable ordering.
  const decorated = rows.map((r, i) => ({ row: r, i }));
  decorated.sort((a, b) => {
    const av = a.row.cells[columnId] ?? null;
    const bv = b.row.cells[columnId] ?? null;
    const cmp = compareCells(av, bv, col.type);
    if (cmp !== 0) return direction === 'asc' ? cmp : -cmp;
    return a.i - b.i;
  });
  return decorated.map((d) => d.row);
}
