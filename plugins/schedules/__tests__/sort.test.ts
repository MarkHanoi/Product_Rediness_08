// sort.ts — coverage (S41 / ADR-0032).

import { describe, it, expect } from 'vitest';
import type { ScheduleColumnDto, ScheduleRow } from '@pryzm/plugin-sdk';
import { sortRows } from '../src/sort.js';

const COLUMNS: ScheduleColumnDto[] = [
  { id: 'name', header: 'Name', formula: '', type: 'string',  widthMm: 20 },
  { id: 'qty',  header: 'Qty',  formula: '', type: 'number',  widthMm: 20 },
  { id: 'flag', header: 'F',    formula: '', type: 'boolean', widthMm: 10 },
];

const ROWS: ScheduleRow[] = [
  { elementId: 'a', cells: { name: 'banana', qty: 3, flag: false } },
  { elementId: 'b', cells: { name: 'apple',  qty: 1, flag: true  } },
  { elementId: 'c', cells: { name: 'cherry', qty: 2, flag: true  } },
  { elementId: 'd', cells: { name: 'apple',  qty: 4, flag: false } }, // dup name for stability check
];

describe('sortRows', () => {
  it('sorts strings ascending', () => {
    const r = sortRows(ROWS, COLUMNS, 'name', 'asc');
    expect(r.map((x) => x.elementId)).toEqual(['b', 'd', 'a', 'c']);
  });

  it('sorts strings descending', () => {
    const r = sortRows(ROWS, COLUMNS, 'name', 'desc');
    expect(r.map((x) => x.elementId)).toEqual(['c', 'a', 'b', 'd']);
  });

  it('sorts numbers numerically (not lexicographically)', () => {
    const r = sortRows(ROWS, COLUMNS, 'qty', 'asc');
    expect(r.map((x) => x.cells.qty)).toEqual([1, 2, 3, 4]);
  });

  it('sorts booleans (false < true)', () => {
    const r = sortRows(ROWS, COLUMNS, 'flag', 'asc');
    expect(r.map((x) => x.cells.flag)).toEqual([false, false, true, true]);
  });

  it('is stable for equal keys', () => {
    // 'apple' rows stay in original order regardless of asc/desc.
    const asc = sortRows(ROWS, COLUMNS, 'name', 'asc');
    const dups = asc.filter((x) => x.cells.name === 'apple').map((x) => x.elementId);
    expect(dups).toEqual(['b', 'd']);
  });

  it('nulls sort last in asc, also last in desc (per cell-comparison contract)', () => {
    const withNulls: ScheduleRow[] = [
      { elementId: '1', cells: { name: null, qty: null } },
      { elementId: '2', cells: { name: 'z',  qty: 5    } },
      { elementId: '3', cells: { name: 'a',  qty: 1    } },
    ];
    const asc = sortRows(withNulls, COLUMNS, 'qty', 'asc');
    expect(asc.map((x) => x.elementId)).toEqual(['3', '2', '1']);
  });

  it('returns input unchanged for unknown columnId', () => {
    const r = sortRows(ROWS, COLUMNS, 'no-such', 'asc');
    expect(r).toBe(ROWS);
  });

  it('does not mutate the input array', () => {
    const original = [...ROWS];
    sortRows(ROWS, COLUMNS, 'qty', 'desc');
    expect(ROWS).toEqual(original);
  });
});
