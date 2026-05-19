// SetFilterHandler — coverage (S41 / ADR-0032).

import { describe, it, expect } from 'vitest';
import { SetFilterHandler } from '../src/handlers/SetFilter.js';
import { ScheduleNotFoundError } from '../src/errors.js';
import type { ScheduleData } from '@pryzm/plugin-sdk';
import type { SchedulesState } from '@pryzm/plugin-sdk';

type Stores = Readonly<{ schedule: SchedulesState }>;
const ctx = (s: SchedulesState): { stores: Stores } => ({ stores: { schedule: s } });

function seed(filter = ''): SchedulesState {
  return {
    s1: {
      id: 's1', name: 'X', elementType: 'door',
      columns: [], filter, seq: 0,
    } as ScheduleData,
  };
}

describe('SetFilterHandler', () => {
  const h = new SetFilterHandler();

  it('canExecute: rejects unknown schedule', () => {
    expect(h.canExecute(ctx({}) as never, { scheduleId: 'x' }).valid).toBe(false);
  });

  it('canExecute: rejects oversize filter', () => {
    expect(h.canExecute(ctx(seed()) as never, { scheduleId: 's1', filter: 'x'.repeat(2049) }).valid).toBe(false);
  });

  it('canExecute: accepts undefined / empty / valid', () => {
    expect(h.canExecute(ctx(seed()) as never, { scheduleId: 's1' }).valid).toBe(true);
    expect(h.canExecute(ctx(seed()) as never, { scheduleId: 's1', filter: '' }).valid).toBe(true);
    expect(h.canExecute(ctx(seed()) as never, { scheduleId: 's1', filter: 'fireRating > 0' }).valid).toBe(true);
  });

  it('execute: sets a filter where none existed', () => {
    const r = h.execute(ctx(seed('')) as never, { scheduleId: 's1', filter: 'width > 800' });
    expect((r.nextStates!.schedule as SchedulesState)['s1']!.filter).toBe('width > 800');
  });

  it('execute: clears a filter when given empty / null / undefined', () => {
    const r = h.execute(ctx(seed('width > 800')) as never, { scheduleId: 's1', filter: '' });
    expect((r.nextStates!.schedule as SchedulesState)['s1']!.filter).toBe('');
  });

  it('execute: no-op when unchanged', () => {
    const r = h.execute(ctx(seed('width > 0')) as never, { scheduleId: 's1', filter: 'width > 0' });
    expect(r.forward).toEqual([]);
    expect(r.inverse).toEqual([]);
  });

  it('execute: does NOT validate the filter as parseable formula', () => {
    // A mid-edit malformed filter is allowed — the evaluator surfaces
    // the error per cell at evaluation time, NOT here.
    const r = h.execute(ctx(seed('')) as never, { scheduleId: 's1', filter: 'width >' });
    expect((r.nextStates!.schedule as SchedulesState)['s1']!.filter).toBe('width >');
  });

  it('execute: throws on unknown schedule (direct execute)', () => {
    expect(() => h.execute(ctx({}) as never, { scheduleId: 'x', filter: '' })).toThrow(ScheduleNotFoundError);
  });
});
