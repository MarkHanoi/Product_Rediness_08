// WallSystemTypeStore — unit tests (S07-T8).

import { describe, expect, it } from 'vitest';
import { WallSystemTypeStore, BUILTIN_WALL_TYPES } from '../src/system-type-store.js';

describe('WallSystemTypeStore', () => {
  it('seeds with the 8 built-in types by default', () => {
    const s = new WallSystemTypeStore();
    expect(s.size()).toBe(BUILTIN_WALL_TYPES.length);
    expect(s.size()).toBeGreaterThanOrEqual(8);
  });

  it('lookup by id returns the canonical entry', () => {
    const s = new WallSystemTypeStore();
    const t = s.get('wt-monolithic');
    expect(t).toBeDefined();
    expect(t?.name).toBe('Monolithic (Default)');
  });

  it('totalThickness equals the sum of layer thicknesses (6dp)', () => {
    for (const t of BUILTIN_WALL_TYPES) {
      const sum = t.layers.reduce((s, l) => s + l.thickness, 0);
      expect(t.totalThickness).toBeCloseTo(sum, 6);
    }
  });

  it('add() registers a project-scoped user type and rejects duplicates', () => {
    const s = new WallSystemTypeStore();
    const before = s.size();
    s.add({
      id: 'wt-user-1',
      name: 'User Custom',
      layers: [],
      totalThickness: 0,
      createdAt: 1,
      modifiedAt: 1,
    });
    expect(s.size()).toBe(before + 1);
    expect(() =>
      s.add({
        id: 'wt-user-1',
        name: 'dup',
        layers: [],
        totalThickness: 0,
        createdAt: 2,
        modifiedAt: 2,
      }),
    ).toThrow(/duplicate type id/);
  });

  it('list() returns every registered type', () => {
    const s = new WallSystemTypeStore();
    expect(s.list().map(t => t.id)).toContain('wt-monolithic');
  });
});
