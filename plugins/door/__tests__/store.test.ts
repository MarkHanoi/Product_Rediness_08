// DoorStore unit tests (S11-T1).

import { describe, expect, it } from 'vitest';
import { DoorStore, type DoorData } from '../src/store.js';
import { Door, createId } from '@pryzm/plugin-sdk';

function mkDoor(overrides: Partial<DoorData> = {}): DoorData {
  return Door.parse({
    id: createId('door'),
    wallId: createId('wall'),
    openingId: 'op_1',
    width: 0.9,
    height: 2.1,
    sillHeight: 0,
    offset: 1.0,
    frameThickness: 0.05,
    frameWidth: 0.05,
    ...overrides,
  });
}

describe('DoorStore', () => {
  it('starts empty', () => {
    const s = new DoorStore();
    expect(s.size()).toBe(0);
    expect(s.ids()).toEqual([]);
  });

  it('round-trips a door via insert / get / delete patches', () => {
    const s = new DoorStore();
    const door = mkDoor();
    s.applyPatch([{ op: 'add', path: [door.id], value: door }]);
    expect(s.size()).toBe(1);
    expect(s.get(door.id)?.width).toBe(0.9);
    s.applyPatch([{ op: 'remove', path: [door.id] }]);
    expect(s.size()).toBe(0);
    expect(s.get(door.id)).toBeUndefined();
  });

  it('byWall filters by wallId', () => {
    const s = new DoorStore();
    const w1 = createId('wall');
    const w2 = createId('wall');
    const a = mkDoor({ wallId: w1 });
    const b = mkDoor({ wallId: w1 });
    const c = mkDoor({ wallId: w2 });
    for (const d of [a, b, c]) s.applyPatch([{ op: 'add', path: [d.id], value: d }]);
    expect(s.byWall(w1)).toHaveLength(2);
    expect(s.byWall(w2)).toHaveLength(1);
  });
});
