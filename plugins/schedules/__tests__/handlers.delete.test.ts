// DeleteScheduleHandler — coverage (S41 / ADR-0032).

import { describe, it, expect } from 'vitest';
import { DeleteScheduleHandler } from '../src/handlers/DeleteSchedule.js';
import { ScheduleNotFoundError } from '../src/errors.js';
import type { ScheduleData } from '@pryzm/plugin-sdk';
import type { SchedulesState } from '@pryzm/plugin-sdk';

type Stores = Readonly<{ schedule: SchedulesState }>;
const ctx = (s: SchedulesState): { stores: Stores } => ({ stores: { schedule: s } });

describe('DeleteScheduleHandler.canExecute', () => {
  const h = new DeleteScheduleHandler();

  it('rejects empty / wrong type', () => {
    expect(h.canExecute(ctx({}) as never, { scheduleId: '' }).valid).toBe(false);
    expect(h.canExecute(ctx({}) as never, { scheduleId: 1 as never }).valid).toBe(false);
  });
  it('rejects unknown id', () => {
    expect(h.canExecute(ctx({}) as never, { scheduleId: 'no-such' }).valid).toBe(false);
  });
  it('accepts an existing id', () => {
    expect(h.canExecute(ctx({ a: { id: 'a' } as ScheduleData }) as never, { scheduleId: 'a' }).valid).toBe(true);
  });
});

describe('DeleteScheduleHandler.execute', () => {
  const h = new DeleteScheduleHandler();

  it('removes the entry and emits inverse that re-adds it', () => {
    const original = { id: 'a', name: 'A', elementType: 'door', columns: [], filter: '', seq: 0 } as ScheduleData;
    const state: SchedulesState = { a: original };
    const r = h.execute(ctx(state) as never, { scheduleId: 'a' });
    expect((r.nextStates!.schedule as SchedulesState)['a']).toBeUndefined();
    expect(r.inverse.some((p) => p.op === 'add' && p.path[0] === 'a')).toBe(true);
  });

  it('throws ScheduleNotFoundError on direct execute against missing id', () => {
    expect(() => h.execute(ctx({}) as never, { scheduleId: 'missing' })).toThrow(ScheduleNotFoundError);
  });
});
