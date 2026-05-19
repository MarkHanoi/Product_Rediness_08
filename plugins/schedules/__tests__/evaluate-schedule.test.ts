// evaluate-schedule.ts — coverage (S41 / ADR-0032).

import { describe, it, expect, beforeEach } from 'vitest';
import {
  ScheduleSchema,
  CELL_ERR,
  CELL_UNDEF,
  CELL_CIRCULAR,
} from '@pryzm/plugin-sdk';
import { evaluateSchedule, clearScheduleAstCache } from '../src/evaluate-schedule.js';

beforeEach(() => clearScheduleAstCache());

const DOORS = [
  { id: 'd1', width: 900, height: 2100, type: 'sliding', fireRating: 60 },
  { id: 'd2', width: 800, height: 2000, type: 'swing',   fireRating: 30 },
  { id: 'd3', width: 1000, height: 2100, type: 'sliding', fireRating: 60 },
];

function makeSchedule(overrides: Record<string, unknown> = {}) {
  return ScheduleSchema.parse({
    id: 'sched',
    name: 'Door Schedule',
    elementType: 'door',
    seq: 0,
    columns: [
      { id: 'mark',  header: 'Mark',  formula: 'id',          type: 'string', widthMm: 20 },
      { id: 'w',     header: 'W',     formula: 'width',       type: 'number', widthMm: 20 },
      { id: 'h',     header: 'H',     formula: 'height',      type: 'number', widthMm: 20 },
      { id: 'type',  header: 'Type',  formula: 'UPPER(type)', type: 'string', widthMm: 30 },
      { id: 'fr',    header: 'FR',    formula: 'fireRating',  type: 'number', widthMm: 15 },
    ],
    ...overrides,
  });
}

describe('evaluateSchedule — basic flow', () => {
  it('emits one row per element with all cells computed', () => {
    const rows = evaluateSchedule(makeSchedule(), DOORS);
    expect(rows).toHaveLength(3);
    expect(rows[0]!.cells).toEqual({ mark: 'd1', w: 900, h: 2100, type: 'SLIDING', fr: 60 });
  });

  it('preserves element insertion order', () => {
    const rows = evaluateSchedule(makeSchedule(), DOORS);
    expect(rows.map((r) => r.elementId)).toEqual(['d1', 'd2', 'd3']);
  });

  it('blank-formula columns produce null cells', () => {
    const sched = makeSchedule({
      columns: [
        { id: 'mark', header: 'Mark', formula: 'id',  type: 'string', widthMm: 20 },
        { id: 'note', header: 'Note', formula: '',    type: 'string', widthMm: 20 },
      ],
    });
    const rows = evaluateSchedule(sched, DOORS);
    expect(rows[0]!.cells.note).toBeNull();
  });
});

describe('evaluateSchedule — filter', () => {
  it('drops elements that fail the filter', () => {
    const sched = makeSchedule({ filter: 'fireRating > 30' });
    const rows = evaluateSchedule(sched, DOORS);
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.elementId)).toEqual(['d1', 'd3']);
  });

  it('a malformed filter excludes everything (defensive)', () => {
    const sched = makeSchedule({ filter: 'width >' });
    const rows = evaluateSchedule(sched, DOORS);
    expect(rows).toHaveLength(0);
  });
});

describe('evaluateSchedule — groupBy', () => {
  it('emits one row per group, with COUNT/SUM aggregating per group', () => {
    const sched = makeSchedule({
      groupBy: 'type',
      columns: [
        { id: 'type',   header: 'Type',  formula: 'type',     type: 'string', widthMm: 20 },
        { id: 'qty',    header: 'Qty',   formula: 'COUNT',    type: 'number', widthMm: 15 },
        { id: 'totalW', header: 'Total', formula: 'SUM(width)',type: 'number', widthMm: 20 },
      ],
    });
    const rows = evaluateSchedule(sched, DOORS);
    // Two distinct types: sliding (d1, d3) and swing (d2).  Insertion
    // order is sliding first.
    expect(rows).toHaveLength(2);
    expect(rows[0]!.cells).toEqual({ type: 'sliding', qty: 2, totalW: 1900 });
    expect(rows[0]!.groupSize).toBe(2);
    expect(rows[1]!.cells).toEqual({ type: 'swing', qty: 1, totalW: 800 });
    expect(rows[1]!.groupSize).toBe(1);
  });

  it('groups can use the filter pipeline', () => {
    const sched = makeSchedule({
      groupBy: 'type',
      filter: 'fireRating == 60',
      columns: [
        { id: 'type', header: 'Type', formula: 'type',  type: 'string', widthMm: 20 },
        { id: 'qty',  header: 'Qty',  formula: 'COUNT', type: 'number', widthMm: 15 },
      ],
    });
    const rows = evaluateSchedule(sched, DOORS);
    // Only d1 + d3 pass the filter — both 'sliding' → one group.
    expect(rows).toHaveLength(1);
    expect(rows[0]!.cells).toEqual({ type: 'sliding', qty: 2 });
  });
});

describe('evaluateSchedule — per-cell error sentinels', () => {
  it('parse failures surface #ERR (other cells unaffected)', () => {
    const sched = makeSchedule({
      columns: [
        { id: 'good', header: 'Good', formula: 'width', type: 'number', widthMm: 20 },
        { id: 'bad',  header: 'Bad',  formula: 'width +', type: 'number', widthMm: 20 },
      ],
    });
    const rows = evaluateSchedule(sched, DOORS);
    expect(rows[0]!.cells.good).toBe(900);
    expect(rows[0]!.cells.bad).toBe(CELL_ERR);
  });

  it('undefined identifiers surface #UNDEF', () => {
    const sched = makeSchedule({
      columns: [
        { id: 'x', header: 'X', formula: 'unknownField', type: 'string', widthMm: 20 },
      ],
    });
    const rows = evaluateSchedule(sched, DOORS);
    expect(rows[0]!.cells.x).toBe(CELL_UNDEF);
  });

  it('circular cross-column refs surface #CIRCULAR', () => {
    const sched = makeSchedule({
      columns: [
        { id: 'a', header: 'A', formula: 'b + 1', type: 'number', widthMm: 20 },
        { id: 'b', header: 'B', formula: 'a + 1', type: 'number', widthMm: 20 },
      ],
    });
    const rows = evaluateSchedule(sched, DOORS);
    expect(rows[0]!.cells.a).toBe(CELL_CIRCULAR);
    expect(rows[0]!.cells.b).toBe(CELL_CIRCULAR);
  });
});

describe('evaluateSchedule — empty inputs', () => {
  it('empty element list → zero rows', () => {
    expect(evaluateSchedule(makeSchedule(), [])).toEqual([]);
  });

  it('schedule with no columns → rows with empty cell maps', () => {
    const sched = makeSchedule({ columns: [] });
    const rows = evaluateSchedule(sched, DOORS);
    expect(rows).toHaveLength(3);
    expect(rows[0]!.cells).toEqual({});
  });
});
