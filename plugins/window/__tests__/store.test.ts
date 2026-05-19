// WindowStore unit tests (S11-T2).

import { describe, expect, it } from 'vitest';
import { WindowStore, type WindowData } from '../src/store.js';
import { Window, createId } from '@pryzm/plugin-sdk';

function mkWindow(overrides: Partial<WindowData> = {}): WindowData {
  return Window.parse({
    id: createId('window'),
    wallId: createId('wall'),
    openingId: 'op_1',
    width: 1.2,
    height: 1.2,
    sillHeight: 0.9,
    offset: 1.0,
    frameThickness: 0.05,
    frameWidth: 0.05,
    ...overrides,
  });
}

describe('WindowStore', () => {
  it('starts empty', () => {
    const s = new WindowStore();
    expect(s.size()).toBe(0);
    expect(s.ids()).toEqual([]);
  });

  it('round-trips a window via insert / get / delete patches', () => {
    const s = new WindowStore();
    const w = mkWindow();
    s.applyPatch([{ op: 'add', path: [w.id], value: w }]);
    expect(s.size()).toBe(1);
    expect(s.get(w.id)?.width).toBe(1.2);
    s.applyPatch([{ op: 'remove', path: [w.id] }]);
    expect(s.size()).toBe(0);
    expect(s.get(w.id)).toBeUndefined();
  });

  it('byWall filters by wallId', () => {
    const s = new WindowStore();
    const wall1 = createId('wall');
    const wall2 = createId('wall');
    const a = mkWindow({ wallId: wall1 });
    const b = mkWindow({ wallId: wall1 });
    const c = mkWindow({ wallId: wall2 });
    for (const w of [a, b, c]) s.applyPatch([{ op: 'add', path: [w.id], value: w }]);
    expect(s.byWall(wall1)).toHaveLength(2);
    expect(s.byWall(wall2)).toHaveLength(1);
  });

  it('rejects width <= 2 * frameWidth at the schema layer', () => {
    expect(() =>
      mkWindow({ width: 0.05, frameWidth: 0.1 }),
    ).toThrow();
  });
});
