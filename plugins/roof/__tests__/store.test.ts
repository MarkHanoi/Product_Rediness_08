// RoofStore unit tests (S11-T3).

import { describe, expect, it } from 'vitest';
import { RoofStore, type RoofData } from '../src/store.js';
import { Roof, createId } from '@pryzm/plugin-sdk';

function mkRoof(overrides: Partial<RoofData> = {}): RoofData {
  return Roof.parse({
    id: createId('roof'),
    levelId: 'lvl_1',
    boundary: [
      { x: 0, y: 0, z: 0 },
      { x: 5, y: 0, z: 0 },
      { x: 5, y: 0, z: 5 },
      { x: 0, y: 0, z: 5 },
    ],
    shape: 'flat',
    pitch: 0,
    thickness: 0.2,
    overhang: 0.2,
    ...overrides,
  });
}

describe('RoofStore', () => {
  it('starts empty', () => {
    const s = new RoofStore();
    expect(s.size()).toBe(0);
    expect(s.ids()).toEqual([]);
  });

  it('round-trips a roof via insert / get / delete patches', () => {
    const s = new RoofStore();
    const roof = mkRoof();
    s.applyPatch([{ op: 'add', path: [roof.id], value: roof }]);
    expect(s.size()).toBe(1);
    expect(s.get(roof.id)?.shape).toBe('flat');
    s.applyPatch([{ op: 'remove', path: [roof.id] }]);
    expect(s.size()).toBe(0);
  });

  it('byLevel filters by levelId', () => {
    const s = new RoofStore();
    const a = mkRoof({ levelId: 'lvl_1' });
    const b = mkRoof({ levelId: 'lvl_1' });
    const c = mkRoof({ levelId: 'lvl_2' });
    for (const r of [a, b, c]) s.applyPatch([{ op: 'add', path: [r.id], value: r }]);
    expect(s.byLevel('lvl_1')).toHaveLength(2);
    expect(s.byLevel('lvl_2')).toHaveLength(1);
  });

  it('rejects flat shape with non-zero pitch at the schema layer', () => {
    expect(() => mkRoof({ shape: 'flat', pitch: 0.5 })).toThrow();
  });
});
