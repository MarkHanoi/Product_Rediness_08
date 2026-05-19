// CubeStore unit smoke (S05-T2).
//
// CubeStore is ~30 LOC of `Store<CubeDto>`; this file proves it
// inherits the base contract correctly and serves as the import-shape
// fixture downstream sprints rely on.

import { describe, expect, it } from 'vitest';
import type { Patch } from 'immer';
import { CubeStore, type CubeDto } from '../src/CubeStore.js';

const ADD = (id: string, dto: CubeDto): Patch => ({ op: 'add', path: [id], value: dto });

describe('CubeStore', () => {
  it('reports its storeKey as "cube"', () => {
    const s = new CubeStore();
    expect(s.storeKey).toBe('cube');
  });

  it('accepts CubeDto adds and exposes them via getState()', () => {
    const s = new CubeStore();
    s.applyPatch([
      ADD('c1', { x: 1, y: 2, z: 3 }),
      ADD('c2', { x: -4, y: 0, z: 5 }),
    ]);
    expect(s.size()).toBe(2);
    expect(s.getState().get('c1')).toEqual({ x: 1, y: 2, z: 3 });
    expect(s.getState().get('c2')).toEqual({ x: -4, y: 0, z: 5 });
  });
});
