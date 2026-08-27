/**
 * scheduleViewModel.test.ts — §LIVESCHED151 (E), `computeColumnTotal`.
 *
 * Picked up by apps/editor's own broad `src/**\/*.test.ts` vitest include
 * (apps/editor/vitest.config.ts, `environment: 'node'`) — no DOM needed, this
 * is pure. §FEAT-SCHEDULE-VIEW-EDIT's own header names this file as split out
 * specifically so its logic could be unit-tested; this is that test's first
 * arrival for the totals-row addition.
 */
import { describe, it, expect } from 'vitest';
import {
  computeColumnTotal,
  supportedFilterAxes,
  distinctAxisValues,
  applyScheduleFilters,
  EMPTY_SCHEDULE_FILTER,
} from './scheduleViewModel';
import type { ScheduleColumn } from '@pryzm/core-app-model';

const areaCol: ScheduleColumn = { id: 'grossArea', label: 'Area (m²)', value: (e) => e.grossArea };
const nameCol: ScheduleColumn = { id: 'name', label: 'Name', value: (e) => e.name };
const costCol: ScheduleColumn = { id: 'cost', label: 'Cost', value: () => '' }; // value unused by computeColumnTotal for 'cost'

describe('computeColumnTotal', () => {
  it('empty row set: null (nothing to total)', () => {
    expect(computeColumnTotal(areaCol, [])).toBeNull();
  });

  it('a purely textual column (Name) totals to null — never a bogus 0', () => {
    const rows = [{ name: 'Kitchen' }, { name: 'Bedroom 1' }];
    expect(computeColumnTotal(nameCol, rows)).toBeNull();
  });

  it('a fully numeric column sums exactly, no lower-bound marker', () => {
    const rows = [{ grossArea: '24.00' }, { grossArea: '18.50' }];
    expect(computeColumnTotal(areaCol, rows)).toBe('42.50');
  });

  it('a column where SOME rows are unreadable numbers is a LOWER BOUND (≥)', () => {
    const rows = [{ grossArea: '24.00' }, { grossArea: '⚠ cannot determine' }];
    const total = computeColumnTotal(areaCol, rows);
    expect(total).toBe('≥ 24.00');
  });

  it('a text-with-leading-digit cell (e.g. "3 room(s)") is NOT parsed as a number — avoids a false total', () => {
    const roomsCol: ScheduleColumn = { id: 'rooms', label: 'Rooms', value: (e) => e.rooms };
    const rows = [{ rooms: '3 room(s)' }, { rooms: '2 room(s)' }];
    expect(computeColumnTotal(roomsCol, rows)).toBeNull();
  });

  // ── Cost column — §CONTEXT-DATA-HONESTY / C78 §8.1 ─────────────────────────

  it('cost: nothing in view is even measured by the take-off → null (not "0")', () => {
    const rows = [{ costMeasured: false }, { costMeasured: false }];
    expect(computeColumnTotal(costCol, rows)).toBeNull();
  });

  it('cost: measured but not one priced line anywhere → "NO RATE", never "0.00"', () => {
    const rows = [
      { costMeasured: true, costComplete: false, cost: null, costCurrency: null },
      { costMeasured: true, costComplete: false, cost: null, costCurrency: null },
    ];
    expect(computeColumnTotal(costCol, rows)).toBe('NO RATE');
  });

  it('cost: fully priced rows sum exactly, WITH currency, no lower-bound marker', () => {
    const rows = [
      { costMeasured: true, costComplete: true, cost: 480, costCurrency: 'EUR' },
      { costMeasured: true, costComplete: true, cost: 220, costCurrency: 'EUR' },
    ];
    expect(computeColumnTotal(costCol, rows)).toBe('EUR 700.00');
  });

  it('cost: one row unpriced/unmeasured among priced rows → sums only the priced ones AND is a LOWER BOUND', () => {
    const rows = [
      { costMeasured: true, costComplete: true, cost: 480, costCurrency: 'EUR' },
      { costMeasured: true, costComplete: false, cost: null, costCurrency: 'EUR' }, // no rate
      { costMeasured: false }, // not even measured
    ];
    const total = computeColumnTotal(costCol, rows);
    expect(total).toBe('≥ EUR 480.00');
  });
});

// ── Filtering (§SCHED156-FILTER, L-12606) ────────────────────────────────────

const levelCol: ScheduleColumn = { id: 'level', label: 'Level', value: (e) => e.level };
const roomFromCol: ScheduleColumn = { id: 'roomFrom', label: 'Room From', value: (e) => e.roomFrom };
const roomToCol: ScheduleColumn = { id: 'roomTo', label: 'Room To', value: (e) => e.roomTo };

describe('supportedFilterAxes', () => {
  it('a schedule with no Level or Room-shaped column supports neither axis', () => {
    expect(supportedFilterAxes([nameCol])).toEqual([]);
  });

  it('Level is supported the moment a "level" column exists', () => {
    expect(supportedFilterAxes([levelCol, nameCol])).toEqual(['level']);
  });

  it('Room is supported by ANY of its candidate column ids (Doors carries roomFrom/roomTo, not "room")', () => {
    expect(supportedFilterAxes([levelCol, roomFromCol, roomToCol])).toEqual(['level', 'room']);
  });
});

describe('distinctAxisValues', () => {
  it('collects distinct values, dropping blanks and the undetermined sentinel', () => {
    const rows = [{ level: 'Ground Floor' }, { level: 'Level 1' }, { level: 'Ground Floor' }, { level: '—' }, { level: '' }];
    expect(distinctAxisValues('level', [levelCol], rows)).toEqual(['Ground Floor', 'Level 1']);
  });

  it('the ROOM axis unions across every candidate column present (roomFrom OR roomTo)', () => {
    const rows = [
      { roomFrom: '101 Bedroom', roomTo: 'Corridor' },
      { roomFrom: 'Corridor', roomTo: '102 Bathroom' },
    ];
    expect(distinctAxisValues('room', [roomFromCol, roomToCol], rows)).toEqual(['101 Bedroom', '102 Bathroom', 'Corridor']);
  });
});

describe('applyScheduleFilters', () => {
  const cols = [levelCol, roomFromCol, roomToCol];
  const rows = [
    { id: 'D1', level: 'Ground Floor', roomFrom: '101 Bedroom', roomTo: 'Corridor' },
    { id: 'D2', level: 'Ground Floor', roomFrom: 'Corridor', roomTo: '102 Bathroom' },
    { id: 'D3', level: 'Level 1', roomFrom: '201 Bedroom', roomTo: 'Corridor' },
  ];

  it('no filters set → every row, as a fresh array', () => {
    const out = applyScheduleFilters(cols, rows, EMPTY_SCHEDULE_FILTER);
    expect(out).toEqual(rows);
    expect(out).not.toBe(rows);
  });

  it('filters by level alone', () => {
    const out = applyScheduleFilters(cols, rows, { level: 'Ground Floor', room: null });
    expect(out.map((r) => r.id)).toEqual(['D1', 'D2']);
  });

  it('filters by room across BOTH candidate columns (OR)', () => {
    const out = applyScheduleFilters(cols, rows, { level: null, room: 'Corridor' });
    expect(out.map((r) => r.id)).toEqual(['D1', 'D2', 'D3']);
  });

  it('level AND room together narrow further (AND across axes)', () => {
    const out = applyScheduleFilters(cols, rows, { level: 'Ground Floor', room: 'Corridor' });
    expect(out.map((r) => r.id)).toEqual(['D1', 'D2']);
  });

  it('a filter combination matching nothing returns an empty array, not the unfiltered set', () => {
    const out = applyScheduleFilters(cols, rows, { level: 'Level 1', room: '102 Bathroom' });
    expect(out).toEqual([]);
  });

  // ⭐ THE REQUIREMENT: totals must recompute over the FILTERED set, and the
  // ≥ lower-bound marker must be recomputed too — a filter can make an
  // incomplete total complete. `computeColumnTotal` needed NO changes for
  // this: it already takes whatever row array its caller passes it.
  it('a filtered total is a DIFFERENT number from the unfiltered total, computed over fewer rows', () => {
    const costCols = [levelCol, costCol];
    const priced = [
      { level: 'Ground Floor', costMeasured: true, costComplete: true, cost: 100, costCurrency: 'EUR' },
      { level: 'Ground Floor', costMeasured: true, costComplete: false, cost: null, costCurrency: 'EUR' }, // unpriced
      { level: 'Level 1', costMeasured: true, costComplete: true, cost: 500, costCurrency: 'EUR' },
    ];
    const unfilteredTotal = computeColumnTotal(costCol, priced);
    // Sums the two PRICED rows (100 + 500); the Ground Floor unpriced row
    // drags the WHOLE total to a lower bound without contributing an amount.
    expect(unfilteredTotal).toBe('≥ EUR 600.00');

    const filtered = applyScheduleFilters(costCols, priced, { level: 'Level 1', room: null });
    const filteredTotal = computeColumnTotal(costCol, filtered);
    // Filtering OUT the unpriced Ground Floor row makes the remaining total
    // genuinely COMPLETE — the ≥ marker must disappear, not just shrink.
    expect(filteredTotal).toBe('EUR 500.00');
  });
});
