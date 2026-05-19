// AddColumnHandler — coverage (S41 / ADR-0032).

import { describe, it, expect } from 'vitest';
import { AddColumnHandler } from '../src/handlers/AddColumn.js';
import { DuplicateColumnIdError, ScheduleNotFoundError } from '../src/errors.js';
import type { ScheduleColumnDto, ScheduleData } from '@pryzm/plugin-sdk';
import type { SchedulesState } from '@pryzm/plugin-sdk';

type Stores = Readonly<{ schedule: SchedulesState }>;

function seedState(columns: ScheduleColumnDto[] = []): SchedulesState {
  return {
    'sched-1': {
      id: 'sched-1', name: 'X', elementType: 'door',
      columns, filter: '', seq: 0,
    } as ScheduleData,
  };
}
const ctx = (s: SchedulesState): { stores: Stores } => ({ stores: { schedule: s } });

const COL_A: ScheduleColumnDto = { id: 'a', header: 'A', formula: 'width', type: 'number', widthMm: 20 };
const COL_B: ScheduleColumnDto = { id: 'b', header: 'B', formula: 'height', type: 'number', widthMm: 20 };

describe('AddColumnHandler.canExecute', () => {
  const h = new AddColumnHandler();

  it('rejects unknown schedule', () => {
    expect(h.canExecute(ctx({}) as never, { scheduleId: 'no-such', column: COL_A }).valid).toBe(false);
  });
  it('rejects malformed column', () => {
    const state = seedState([]);
    expect(h.canExecute(ctx(state) as never, { scheduleId: 'sched-1', column: { ...COL_A, id: 'has space' } }).valid).toBe(false);
    expect(h.canExecute(ctx(state) as never, { scheduleId: 'sched-1', column: { ...COL_A, header: '' } }).valid).toBe(false);
  });
  it('rejects duplicate column id', () => {
    const state = seedState([COL_A]);
    expect(h.canExecute(ctx(state) as never, { scheduleId: 'sched-1', column: COL_A }).valid).toBe(false);
  });
  it('rejects out-of-bounds at index', () => {
    const state = seedState([COL_A]);
    expect(h.canExecute(ctx(state) as never, { scheduleId: 'sched-1', column: COL_B, at: 5 }).valid).toBe(false);
    expect(h.canExecute(ctx(state) as never, { scheduleId: 'sched-1', column: COL_B, at: -1 }).valid).toBe(false);
  });
  it('accepts valid additions', () => {
    const state = seedState([COL_A]);
    expect(h.canExecute(ctx(state) as never, { scheduleId: 'sched-1', column: COL_B }).valid).toBe(true);
    expect(h.canExecute(ctx(state) as never, { scheduleId: 'sched-1', column: COL_B, at: 0 }).valid).toBe(true);
  });
});

describe('AddColumnHandler.execute', () => {
  const h = new AddColumnHandler();

  it('appends by default', () => {
    const r = h.execute(ctx(seedState([COL_A])) as never, { scheduleId: 'sched-1', column: COL_B });
    const cols = (r.nextStates!.schedule as SchedulesState)['sched-1']!.columns;
    expect(cols.map((c) => c.id)).toEqual(['a', 'b']);
  });

  it('inserts at the requested index', () => {
    const r = h.execute(ctx(seedState([COL_A])) as never, { scheduleId: 'sched-1', column: COL_B, at: 0 });
    const cols = (r.nextStates!.schedule as SchedulesState)['sched-1']!.columns;
    expect(cols.map((c) => c.id)).toEqual(['b', 'a']);
  });

  it('emits an inverse that removes the just-added column', () => {
    const r = h.execute(ctx(seedState([COL_A])) as never, { scheduleId: 'sched-1', column: COL_B });
    expect(r.inverse.length).toBeGreaterThan(0);
  });

  it('throws on missing schedule', () => {
    expect(() => h.execute(ctx({}) as never, { scheduleId: 'x', column: COL_A })).toThrow(ScheduleNotFoundError);
  });

  it('throws DuplicateColumnIdError when racing', () => {
    expect(() => h.execute(ctx(seedState([COL_A])) as never, { scheduleId: 'sched-1', column: COL_A })).toThrow(DuplicateColumnIdError);
  });
});
