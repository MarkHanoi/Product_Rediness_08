// RemoveColumnHandler — coverage (S41 / ADR-0032).

import { describe, it, expect } from 'vitest';
import { RemoveColumnHandler } from '../src/handlers/RemoveColumn.js';
import { ColumnNotFoundError, ScheduleNotFoundError } from '../src/errors.js';
import type { ScheduleColumnDto, ScheduleData } from '@pryzm/plugin-sdk';
import type { SchedulesState } from '@pryzm/plugin-sdk';

type Stores = Readonly<{ schedule: SchedulesState }>;
const ctx = (s: SchedulesState): { stores: Stores } => ({ stores: { schedule: s } });

const COLS: ScheduleColumnDto[] = [
  { id: 'a', header: 'A', formula: '', type: 'string', widthMm: 20 },
  { id: 'b', header: 'B', formula: '', type: 'string', widthMm: 20 },
  { id: 'c', header: 'C', formula: '', type: 'string', widthMm: 20 },
];
const state: SchedulesState = {
  'sched-1': {
    id: 'sched-1', name: 'X', elementType: 'door',
    columns: [...COLS], filter: '', seq: 0,
  } as ScheduleData,
};

describe('RemoveColumnHandler.canExecute', () => {
  const h = new RemoveColumnHandler();
  it('rejects unknown schedule', () => {
    expect(h.canExecute(ctx({}) as never, { scheduleId: 'x', columnId: 'a' }).valid).toBe(false);
  });
  it('rejects unknown column', () => {
    expect(h.canExecute(ctx(state) as never, { scheduleId: 'sched-1', columnId: 'no-such' }).valid).toBe(false);
  });
  it('accepts a valid request', () => {
    expect(h.canExecute(ctx(state) as never, { scheduleId: 'sched-1', columnId: 'b' }).valid).toBe(true);
  });
});

describe('RemoveColumnHandler.execute', () => {
  const h = new RemoveColumnHandler();
  it('removes the column and preserves the rest in order', () => {
    const r = h.execute(ctx(state) as never, { scheduleId: 'sched-1', columnId: 'b' });
    const cols = (r.nextStates!.schedule as SchedulesState)['sched-1']!.columns;
    expect(cols.map((c) => c.id)).toEqual(['a', 'c']);
  });
  it('inverse re-adds the removed column at its original index', () => {
    const r = h.execute(ctx(state) as never, { scheduleId: 'sched-1', columnId: 'b' });
    expect(r.inverse.length).toBeGreaterThan(0);
  });
  it('throws on unknown schedule', () => {
    expect(() => h.execute(ctx({}) as never, { scheduleId: 'x', columnId: 'a' })).toThrow(ScheduleNotFoundError);
  });
  it('throws on unknown column', () => {
    expect(() => h.execute(ctx(state) as never, { scheduleId: 'sched-1', columnId: 'zzz' })).toThrow(ColumnNotFoundError);
  });
});
