/**
 * §CONSTRUCTION-4D (L-3110) — the pure date arithmetic a programme is signed on.
 *
 * Every expected value below was derived on paper, not by running the code. The
 * off-by-one at the end of a task is the single most common defect in scheduling
 * software, and it is invisible until someone counts days on a calendar.
 */

import { describe, it, expect } from 'vitest';
import {
  isIsoDate, isoToMs, msToIso, addDays, endOfDayMs,
  taskFinishDate, taskWindowMs, taskProgressAt, scheduleWindowMs, taskDefects,
  MS_PER_DAY, DURATIONS_ARE_CALENDAR_DAYS, TASK_DEPENDENCIES_ARE_RECORDED_NOT_SOLVED,
  type ConstructionTask,
} from '../src/construction/index.js';

const task = (over: Partial<ConstructionTask> = {}): ConstructionTask => ({
  id: 't1',
  name: 'Blockwork',
  chapter: 'walls',
  startDate: '2026-09-05',
  durationDays: 10,
  durationSource: 'USER_ENTERED',
  lineCodes: ['WALL.x.200'],
  elementIds: [],
  dependsOn: [],
  ...over,
});

describe('date primitives', () => {
  it('accepts a real calendar date and rejects one that only looks like one', () => {
    expect(isIsoDate('2026-09-05')).toBe(true);
    expect(isIsoDate('2026-02-29')).toBe(false); // 2026 is not a leap year
    expect(isIsoDate('2026-02-30')).toBe(false); // rolls over silently in some engines
    expect(isIsoDate('2026-13-01')).toBe(false);
    expect(isIsoDate('05/09/2026')).toBe(false);
    expect(isIsoDate('')).toBe(false);
  });

  it('round-trips through epoch ms at UTC midnight', () => {
    expect(msToIso(isoToMs('2026-09-05')!)).toBe('2026-09-05');
    expect(isoToMs('nonsense')).toBeNull();
  });

  it('adds and subtracts whole calendar days across a month boundary', () => {
    expect(addDays('2026-09-28', 5)).toBe('2026-10-03');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(addDays('nope', 1)).toBeNull();
    expect(MS_PER_DAY).toBe(86_400_000);
  });

  it('endOfDayMs is the LAST instant of the day, one ms before the next', () => {
    expect(endOfDayMs('2026-09-05')).toBe(isoToMs('2026-09-06')! - 1);
    expect(endOfDayMs('bad')).toBeNull();
  });
});

describe('a duration is INCLUSIVE calendar days', () => {
  it('1 day starting on the 5th finishes on the 5th', () => {
    expect(taskFinishDate(task({ durationDays: 1 }))).toBe('2026-09-05');
  });

  it('10 days starting on the 5th finishes on the 14th, not the 15th', () => {
    expect(taskFinishDate(task())).toBe('2026-09-14');
  });

  it('an unusable duration has NO finish date rather than a wrong one', () => {
    expect(taskFinishDate(task({ durationDays: 0 }))).toBeNull();
    expect(taskFinishDate(task({ durationDays: Number.NaN }))).toBeNull();
    expect(taskWindowMs(task({ startDate: 'bad' }))).toBeNull();
    expect(taskWindowMs(task({ durationDays: 0 }))).toBeNull();
  });

  it('the window ends at the END of the finish day', () => {
    const w = taskWindowMs(task())!;
    expect(msToIso(w.startMs)).toBe('2026-09-05');
    expect(w.endMs).toBe(endOfDayMs('2026-09-14'));
  });
});

describe('progress at an instant', () => {
  const t = task();
  it('reads NOT_STARTED before, IN_PROGRESS during, COMPLETE at the end of the last day', () => {
    expect(taskProgressAt(t, isoToMs('2026-09-04')!)).toBe('NOT_STARTED');
    expect(taskProgressAt(t, isoToMs('2026-09-05')!)).toBe('IN_PROGRESS');
    expect(taskProgressAt(t, endOfDayMs('2026-09-13')!)).toBe('IN_PROGRESS');
    expect(taskProgressAt(t, endOfDayMs('2026-09-14')!)).toBe('COMPLETE');
    expect(taskProgressAt(t, isoToMs('2027-01-01')!)).toBe('COMPLETE');
  });

  it('a task with unusable dates has NO state — which is not the same as NOT_STARTED', () => {
    expect(taskProgressAt(task({ startDate: '2026-02-30' }), Date.now())).toBeNull();
  });
});

describe('the programme window', () => {
  it('spans the earliest start to the latest finish', () => {
    const w = scheduleWindowMs([
      task({ id: 'a', startDate: '2026-09-05', durationDays: 10 }),
      task({ id: 'b', startDate: '2026-08-20', durationDays: 3 }),
    ])!;
    expect(msToIso(w.startMs)).toBe('2026-08-20');
    expect(w.endMs).toBe(endOfDayMs('2026-09-14'));
  });

  it('is NULL when nothing is usably dated — not a zero-length bar at the epoch', () => {
    expect(scheduleWindowMs([])).toBeNull();
    expect(scheduleWindowMs([task({ startDate: 'bad' })])).toBeNull();
  });
});

describe('taskDefects returns REASONS, not a boolean', () => {
  it('a well-formed task has none', () => {
    expect(taskDefects(task())).toEqual([]);
  });

  it('names each defect in words the user can act on', () => {
    const d = taskDefects(task({ id: '', name: '  ', startDate: 'nope', durationDays: 0, lineCodes: [], elementIds: [] }));
    expect(d.join(' ')).toMatch(/no id/);
    expect(d.join(' ')).toMatch(/no name/);
    expect(d.join(' ')).toMatch(/not a calendar date/);
    expect(d.join(' ')).toMatch(/at least 1 whole calendar day/);
    expect(d.join(' ')).toMatch(/schedules nothing/);
  });

  it('rejects a fractional duration rather than rounding it', () => {
    expect(taskDefects(task({ durationDays: 2.5 })).join(' ')).toMatch(/whole number/);
  });

  it('⭐ refuses any duration source other than USER_ENTERED, and says why', () => {
    const bad = { ...task(), durationSource: 'DERIVED' as unknown as ConstructionTask['durationSource'] };
    expect(taskDefects(bad).join(' ')).toMatch(/PRYZM holds no output rates/);
  });
});

describe('the two things this vocabulary states so nobody infers otherwise', () => {
  it('durations are calendar days — there is no working calendar', () => {
    expect(DURATIONS_ARE_CALENDAR_DAYS).toBe(true);
  });
  it('dependencies are recorded, not solved — nothing reschedules', () => {
    expect(TASK_DEPENDENCIES_ARE_RECORDED_NOT_SOLVED).toBe(true);
  });
});
