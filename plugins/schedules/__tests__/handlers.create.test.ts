// CreateScheduleHandler — coverage (S41 / ADR-0032).

import { describe, it, expect } from 'vitest';
import { CreateScheduleHandler } from '../src/handlers/CreateSchedule.js';
import { DuplicateScheduleIdError } from '../src/errors.js';
import type { ScheduleData } from '@pryzm/plugin-sdk';
import type { SchedulesState } from '@pryzm/plugin-sdk';

type Stores = Readonly<{ schedule: SchedulesState }>;
const ctx = (s: SchedulesState = {}): { stores: Stores } => ({ stores: { schedule: s } });

describe('CreateScheduleHandler.canExecute', () => {
  const h = new CreateScheduleHandler();

  it('accepts a minimal payload', () => {
    expect(h.canExecute(ctx() as never, { elementType: 'door' })).toEqual({ valid: true });
  });

  it('requires elementType', () => {
    expect(h.canExecute(ctx() as never, {} as never).valid).toBe(false);
  });

  it('rejects duplicate id', () => {
    const state: SchedulesState = { 'sched-x': { id: 'sched-x' } as ScheduleData };
    expect(h.canExecute(ctx(state) as never, { id: 'sched-x', elementType: 'door' }).valid).toBe(false);
  });

  it('rejects non-identifier column ids', () => {
    expect(h.canExecute(ctx() as never, {
      elementType: 'door',
      columns: [{ id: 'has space', header: 'X', formula: '', type: 'string', widthMm: 20 }],
    }).valid).toBe(false);
  });

  it('rejects duplicate column ids in initial column list', () => {
    expect(h.canExecute(ctx() as never, {
      elementType: 'door',
      columns: [
        { id: 'x', header: 'X', formula: '', type: 'string', widthMm: 20 },
        { id: 'x', header: 'Y', formula: '', type: 'string', widthMm: 20 },
      ],
    }).valid).toBe(false);
  });

  it('rejects oversize names / formulas', () => {
    expect(h.canExecute(ctx() as never, { elementType: 'door', name: 'x'.repeat(201) }).valid).toBe(false);
  });
});

describe('CreateScheduleHandler.execute', () => {
  const h = new CreateScheduleHandler();

  it('mints a schedule with auto seq + auto name', () => {
    const r = h.execute(ctx() as never, { id: 'sched-a', elementType: 'door' });
    const state = r.nextStates!.schedule as SchedulesState;
    expect(state['sched-a']!.name).toBe('Door Schedule');
    expect(state['sched-a']!.seq).toBe(0);
    expect(state['sched-a']!.elementType).toBe('door');
    expect(state['sched-a']!.columns).toEqual([]);
    expect(state['sched-a']!.filter).toBe('');
  });

  it('respects an explicit name + seq + columns', () => {
    const r = h.execute(ctx() as never, {
      id: 'sched-b',
      name: 'My Custom',
      elementType: 'wall',
      seq: 7,
      columns: [{ id: 'mark', header: 'Mark', formula: 'id', type: 'string', widthMm: 20 }],
    });
    const sched = (r.nextStates!.schedule as SchedulesState)['sched-b']!;
    expect(sched.name).toBe('My Custom');
    expect(sched.seq).toBe(7);
    expect(sched.columns).toHaveLength(1);
  });

  it('appends with seq = max + 1', () => {
    const state: SchedulesState = {
      'a': { id: 'a', seq: 3 } as ScheduleData,
      'b': { id: 'b', seq: 7 } as ScheduleData,
    };
    const r = h.execute(ctx(state) as never, { id: 'c', elementType: 'wall' });
    expect((r.nextStates!.schedule as SchedulesState)['c']!.seq).toBe(8);
  });

  it('emits forward + inverse patches that round-trip', () => {
    const r = h.execute(ctx() as never, { id: 'rt', elementType: 'door' });
    expect(r.forward.length).toBeGreaterThan(0);
    expect(r.inverse.some((p) => p.op === 'remove' && p.path[0] === 'rt')).toBe(true);
  });

  it('throws DuplicateScheduleIdError on direct execute against duplicate state', () => {
    const state: SchedulesState = { 'dup': { id: 'dup' } as ScheduleData };
    expect(() => h.execute(ctx(state) as never, { id: 'dup', elementType: 'door' })).toThrow(DuplicateScheduleIdError);
  });

  it('persists groupBy and filter when provided', () => {
    const r = h.execute(ctx() as never, {
      id: 'sched-g', elementType: 'door',
      groupBy: 'type', filter: 'fireRating > 0',
    });
    const sched = (r.nextStates!.schedule as SchedulesState)['sched-g']!;
    expect(sched.groupBy).toBe('type');
    expect(sched.filter).toBe('fireRating > 0');
  });
});
