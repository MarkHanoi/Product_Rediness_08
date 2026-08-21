/**
 * ScheduleModel — 4D, asserted on the boundaries a programme is actually wrong at.
 *
 * ⭐ WHAT MAKES THIS SUITE DIFFERENTIATING. A 4D implementation that "works"
 * passes a test that slides a scrubber and sees things disappear. These pin the
 * three places such an implementation is silently wrong:
 *
 *   • the INCLUSIVE finish date — a 1-day task starting on the 5th finishes on
 *     the 5th, and the classic off-by-one gives the 6th;
 *   • UNSCHEDULED ≠ NOT-YET-BUILT — an element no task covers must come back in
 *     its OWN set, and an implementation that folded it into `notStarted` would
 *     pass every "does the filter hide things" test and be asserting something
 *     the data does not support;
 *   • line codes track the model — adding a wall of an already-scheduled type
 *     must extend the task's element set with no edit to the task.
 */

import { describe, it, expect } from 'vitest';
import type { WallData } from '@pryzm/geometry-wall';
import { computeTakeoff, type TakeoffStores } from './QuantityTakeoff.js';
import {
  resolveTasks, scheduleStateAt, scheduleCoverage, taskFromLine,
  type ConstructionSchedule,
} from './ScheduleModel.js';
import { taskFinishDate, taskProgressAt, isoToMs, endOfDayMs } from '@pryzm/schemas/construction';

const EMPTY: TakeoffStores = {
  walls: null, rooms: null, floors: null, ceilings: null, roofs: null, slabs: null,
  columns: null, beams: null, handrails: null, stairs: null,
  plumbing: null, furniture: null, curtainWalls: null,
  wallTypeName: () => undefined, wallTypeLayers: () => null,
  roomFinishes: null, boundingWalls: null,
};

function wall(id: string, systemTypeId?: string): WallData {
  return {
    id,
    type: 'wall',
    systemTypeId,
    baseLine: [{ x: 0, y: 0, z: 0 }, { x: 5, y: 0, z: 0 }],
    height: 3,
    thickness: 0.2,
    baseOffset: 0,
    levelId: 'L0',
    childrenIds: [],
    openings: [],
  } as unknown as WallData;
}

/** Midday of `iso` - deliberately NOT a day boundary, so the boundary tests below
 *  are about a real instant rather than about floating-point luck. */
const at = (iso: string): number => isoToMs(iso)! + 43_200_000;

// ── Dates ─────────────────────────────────────────────────────────────────────

describe('a duration is inclusive calendar days', () => {
  const t = taskFromLine({
    id: 't1', lineCode: 'X', description: 'Task', chapter: 'walls',
    startDate: '2026-09-05', durationDays: 1,
  });

  it('a 1-day task starting on the 5th finishes on the 5th, not the 6th', () => {
    expect(taskFinishDate(t)).toBe('2026-09-05');
  });

  it('a 10-day task starting on the 5th finishes on the 14th', () => {
    expect(taskFinishDate({ ...t, durationDays: 10 })).toBe('2026-09-14');
  });

  it('MIDDAY of the finish day is still IN_PROGRESS; the END of it is COMPLETE', () => {
    // Both answers are correct and they are answers to DIFFERENT questions. A
    // date scrubber asks "built by the end of this day?", so it passes
    // endOfDayMs() - which is why that helper is exported rather than inlined.
    expect(taskProgressAt(t, at('2026-09-04'))).toBe('NOT_STARTED');
    expect(taskProgressAt(t, at('2026-09-05'))).toBe('IN_PROGRESS');
    expect(taskProgressAt(t, endOfDayMs('2026-09-05')!)).toBe('COMPLETE');
  });

  it('a task in the middle of a long run reads IN_PROGRESS', () => {
    const long = { ...t, durationDays: 10 };
    expect(taskProgressAt(long, at('2026-09-09'))).toBe('IN_PROGRESS');
    expect(taskProgressAt(long, endOfDayMs('2026-09-13')!)).toBe('IN_PROGRESS');
    expect(taskProgressAt(long, endOfDayMs('2026-09-14')!)).toBe('COMPLETE');
  });

  it('an unusable date is null — a state it does not have, not a state it does', () => {
    expect(taskProgressAt({ ...t, startDate: '2026-02-30' }, at('2026-09-09'))).toBeNull();
    expect(taskFinishDate({ ...t, durationDays: 0 })).toBeNull();
  });
});

// ── The four sets ─────────────────────────────────────────────────────────────

describe('UNSCHEDULED is its own answer, never folded into NOT_STARTED', () => {
  const takeoff = computeTakeoff({
    ...EMPTY,
    walls: { getAll: () => [wall('w1', 'wt-a'), wall('w2', 'wt-b')] },
    wallTypeName: (id) => (id === 'wt-a' ? 'Type A' : 'Type B'),
  });
  const codeA = takeoff.lines.find((l) => l.code.includes('wt-a'))!.code;

  const schedule: ConstructionSchedule = {
    version: 1,
    tasks: [taskFromLine({
      id: 't1', lineCode: codeA, description: 'Build type A', chapter: 'walls',
      startDate: '2026-09-01', durationDays: 5,
    })],
  };

  it('the scheduled wall completes; the unscheduled one is reported apart', () => {
    const s = scheduleStateAt(schedule, takeoff, at('2026-09-30'));
    expect(s.builtElementIds).toEqual(['w1']);
    // ⭐ w2 is NOT in notStarted. Nobody said when it is built.
    expect(s.notStartedElementIds).toEqual([]);
    expect(s.unscheduledElementIds).toEqual(['w2']);
  });

  it('before the task starts, the scheduled wall is NOT_STARTED and the other is still UNSCHEDULED', () => {
    const s = scheduleStateAt(schedule, takeoff, at('2026-08-01'));
    expect(s.notStartedElementIds).toEqual(['w1']);
    expect(s.unscheduledElementIds).toEqual(['w2']);
    expect(s.builtElementIds).toEqual([]);
  });

  it('the coverage statement says the count and refuses the inference', () => {
    const c = scheduleCoverage(schedule, takeoff);
    expect(c.scheduledElementCount).toBe(1);
    expect(c.unscheduledElementCount).toBe(1);
    expect(c.coverageStatement).toMatch(/UNSCHEDULED/);
    expect(c.coverageStatement).toMatch(/not the same as "not yet built"/);
    expect(c.coverageStatement).toMatch(/no output rates/);
    expect(c.coverageStatement).toMatch(/CALENDAR days/);
  });
});

// ── Line codes track the model ────────────────────────────────────────────────

describe('a task points at a take-off LINE CODE, so it tracks the model', () => {
  const build = (walls: WallData[]) => computeTakeoff({
    ...EMPTY, walls: { getAll: () => walls }, wallTypeName: () => 'Type A',
  });

  it('drawing another wall of a scheduled type extends the task with NO edit to the task', () => {
    const before = build([wall('w1', 'wt-a')]);
    const code = before.lines.find((l) => l.chapter === 'walls')!.code;
    const schedule: ConstructionSchedule = {
      version: 1,
      tasks: [taskFromLine({ id: 't1', lineCode: code, description: 'A', chapter: 'walls', startDate: '2026-09-01', durationDays: 5 })],
    };
    expect(resolveTasks(schedule, before)[0].elementIds).toEqual(['w1']);

    const after = build([wall('w1', 'wt-a'), wall('w2', 'wt-a')]);
    expect(resolveTasks(schedule, after)[0].elementIds.sort()).toEqual(['w1', 'w2']);
  });

  it('a line code the take-off no longer produces is REPORTED, not silently dropped', () => {
    const takeoff = build([wall('w1', 'wt-a')]);
    const schedule: ConstructionSchedule = {
      version: 1,
      tasks: [taskFromLine({ id: 't1', lineCode: 'WALL.gone.999', description: 'A', chapter: 'walls', startDate: '2026-09-01', durationDays: 5 })],
    };
    const r = resolveTasks(schedule, takeoff)[0];
    expect(r.unresolvedLineCodes).toEqual(['WALL.gone.999']);
    expect(scheduleCoverage(schedule, takeoff).coverageStatement).toMatch(/no longer exist/);
  });
});

// ── The prohibition, encoded ──────────────────────────────────────────────────

describe('a duration can only be USER_ENTERED', () => {
  it('taskFromLine stamps USER_ENTERED and offers no other source', () => {
    const t = taskFromLine({ id: 't', lineCode: 'X', description: 'd', chapter: 'walls', startDate: '2026-09-01', durationDays: 3 });
    expect(t.durationSource).toBe('USER_ENTERED');
  });

  it('a task whose duration claims another source is a NAMED defect', () => {
    const t = taskFromLine({ id: 't', lineCode: 'X', description: 'd', chapter: 'walls', startDate: '2026-09-01', durationDays: 3 });
    const bad = { ...t, durationSource: 'DERIVED_FROM_OUTPUT_RATE' as unknown as typeof t.durationSource };
    const takeoff = computeTakeoff(EMPTY);
    const r = resolveTasks({ version: 1, tasks: [bad] }, takeoff)[0];
    expect(r.defects.join(' ')).toMatch(/no output rates/);
  });

  it('a task covering nothing is a defect, not an empty success', () => {
    const t = taskFromLine({ id: 't', lineCode: 'X', description: 'd', chapter: 'walls', startDate: '2026-09-01', durationDays: 3 });
    const bare = { ...t, lineCodes: [], elementIds: [] };
    const r = resolveTasks({ version: 1, tasks: [bare] }, computeTakeoff(EMPTY))[0];
    expect(r.defects.join(' ')).toMatch(/schedules nothing/);
  });
});
