// SetGroupByHandler — coverage (S41 / ADR-0032).

import { describe, it, expect } from 'vitest';
import { SetGroupByHandler } from '../src/handlers/SetGroupBy.js';
import { ScheduleNotFoundError } from '../src/errors.js';
import type { ScheduleData } from '@pryzm/plugin-sdk';
import type { SchedulesState } from '@pryzm/plugin-sdk';

type Stores = Readonly<{ schedule: SchedulesState }>;
const ctx = (s: SchedulesState): { stores: Stores } => ({ stores: { schedule: s } });

function seed(groupBy?: string): SchedulesState {
  const sched: ScheduleData = {
    id: 's1', name: 'X', elementType: 'door',
    columns: [], filter: '', seq: 0,
    ...(groupBy !== undefined ? { groupBy } : {}),
  } as ScheduleData;
  return { s1: sched };
}

describe('SetGroupByHandler.canExecute', () => {
  const h = new SetGroupByHandler();
  it('rejects unknown schedule', () => {
    expect(h.canExecute(ctx({}) as never, { scheduleId: 'x' }).valid).toBe(false);
  });
  it('accepts undefined / null / empty (clear)', () => {
    expect(h.canExecute(ctx(seed()) as never, { scheduleId: 's1' }).valid).toBe(true);
    expect(h.canExecute(ctx(seed()) as never, { scheduleId: 's1', groupBy: null }).valid).toBe(true);
    expect(h.canExecute(ctx(seed()) as never, { scheduleId: 's1', groupBy: '' }).valid).toBe(true);
  });
  it('accepts a valid identifier', () => {
    expect(h.canExecute(ctx(seed()) as never, { scheduleId: 's1', groupBy: 'type' }).valid).toBe(true);
  });
  it('rejects malformed identifiers', () => {
    expect(h.canExecute(ctx(seed()) as never, { scheduleId: 's1', groupBy: 'has space' }).valid).toBe(false);
  });
});

describe('SetGroupByHandler.execute', () => {
  const h = new SetGroupByHandler();

  it('sets groupBy on a schedule that has none', () => {
    const r = h.execute(ctx(seed()) as never, { scheduleId: 's1', groupBy: 'type' });
    expect((r.nextStates!.schedule as SchedulesState)['s1']!.groupBy).toBe('type');
  });

  it('clears groupBy when given empty / null / undefined', () => {
    const r = h.execute(ctx(seed('type')) as never, { scheduleId: 's1', groupBy: '' });
    expect((r.nextStates!.schedule as SchedulesState)['s1']!.groupBy).toBeUndefined();
  });

  it('no-ops when value is unchanged (empty patches)', () => {
    const r = h.execute(ctx(seed('type')) as never, { scheduleId: 's1', groupBy: 'type' });
    expect(r.forward).toEqual([]);
    expect(r.inverse).toEqual([]);
  });

  it('throws on unknown schedule (direct execute)', () => {
    expect(() => h.execute(ctx({}) as never, { scheduleId: 'x', groupBy: 'type' })).toThrow(ScheduleNotFoundError);
  });
});
