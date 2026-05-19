// ScheduleStore + ActiveScheduleStore — coverage (S41).

import { describe, it, expect } from 'vitest';
import {
  ScheduleStore,
  ActiveScheduleStore,
  ACTIVE_SCHEDULE_ID,
} from '../src/index.js';
import { ScheduleSchema, type ScheduleData } from '@pryzm/schemas/schedule';

function makeSchedule(id: string, seq: number, elementType = 'door'): ScheduleData {
  return ScheduleSchema.parse({
    id, name: id, elementType, columns: [], filter: '', seq,
  });
}

describe('ScheduleStore', () => {
  it('starts empty', () => {
    const s = new ScheduleStore();
    expect(s.list()).toEqual([]);
    expect(s.ids()).toEqual([]);
    expect(s.nextSeq()).toBe(-1);
  });

  it('list() returns schedules sorted by seq ascending', () => {
    const s = new ScheduleStore();
    s.applyPatch([
      { op: 'add', path: ['b'], value: makeSchedule('b', 5) },
      { op: 'add', path: ['a'], value: makeSchedule('a', 0) },
      { op: 'add', path: ['c'], value: makeSchedule('c', 2) },
    ]);
    expect(s.list().map((x) => x.id)).toEqual(['a', 'c', 'b']);
  });

  it('list() ties broken by id', () => {
    const s = new ScheduleStore();
    s.applyPatch([
      { op: 'add', path: ['z'], value: makeSchedule('z', 0) },
      { op: 'add', path: ['a'], value: makeSchedule('a', 0) },
    ]);
    expect(s.list().map((x) => x.id)).toEqual(['a', 'z']);
  });

  it('byElementType() filters by family', () => {
    const s = new ScheduleStore();
    s.applyPatch([
      { op: 'add', path: ['d1'], value: makeSchedule('d1', 0, 'door') },
      { op: 'add', path: ['w1'], value: makeSchedule('w1', 0, 'wall') },
      { op: 'add', path: ['d2'], value: makeSchedule('d2', 1, 'door') },
    ]);
    expect(s.byElementType('door').map((x) => x.id)).toEqual(['d1', 'd2']);
    expect(s.byElementType('wall').map((x) => x.id)).toEqual(['w1']);
  });

  it('byName() returns first match', () => {
    const s = new ScheduleStore();
    s.applyPatch([{ op: 'add', path: ['a'], value: makeSchedule('a', 0) }]);
    expect(s.byName('a')?.id).toBe('a');
    expect(s.byName('nope')).toBeUndefined();
  });

  it('nextSeq() reflects the max', () => {
    const s = new ScheduleStore();
    s.applyPatch([
      { op: 'add', path: ['a'], value: makeSchedule('a', 3) },
      { op: 'add', path: ['b'], value: makeSchedule('b', 7) },
    ]);
    expect(s.nextSeq()).toBe(7);
  });
});

describe('ActiveScheduleStore', () => {
  it('starts with null active id', () => {
    const s = new ActiveScheduleStore();
    expect(s.getActive().activeScheduleId).toBeNull();
  });
  it('setActive() updates and emits a patch', () => {
    const s = new ActiveScheduleStore();
    s.setActive('sched-x');
    expect(s.getActive().activeScheduleId).toBe('sched-x');
  });
  it('setActive(null) clears', () => {
    const s = new ActiveScheduleStore();
    s.setActive('sched-x');
    s.setActive(null);
    expect(s.getActive().activeScheduleId).toBeNull();
  });
  it('singleton key is "active"', () => {
    expect(ACTIVE_SCHEDULE_ID).toBe('active');
  });
});
