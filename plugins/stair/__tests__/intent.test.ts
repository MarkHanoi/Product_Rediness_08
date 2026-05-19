// Stair intent helpers (S14-T3).

import { describe, expect, it } from 'vitest';
import { isFiniteVec3, totalStairHeight } from '../src/intent.js';

describe('isFiniteVec3', () => {
  it('accepts finite vec3', () => {
    expect(isFiniteVec3({ x: 0, y: 1, z: 2 })).toBe(true);
  });
  it('rejects NaN / null / wrong shape', () => {
    expect(isFiniteVec3({ x: NaN, y: 0, z: 0 })).toBe(false);
    expect(isFiniteVec3(null)).toBe(false);
    expect(isFiniteVec3({ x: 0 })).toBe(false);
  });
});

describe('totalStairHeight', () => {
  it('multiplies risers × riserHeight', () => {
    expect(totalStairHeight({ numRisers: 15, riserHeight: 0.18 })).toBeCloseTo(2.7);
    expect(totalStairHeight({ numRisers: 18, riserHeight: 0.17 })).toBeCloseTo(3.06);
  });
});
