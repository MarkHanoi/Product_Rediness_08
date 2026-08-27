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
import { computeColumnTotal } from './scheduleViewModel';
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
