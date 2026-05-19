// Roof intent helpers tests (S11-T3).

import { describe, expect, it } from 'vitest';
import { centroid, signedArea, validatePolygon } from '../src/intent.js';

const SQUARE = [
  { x: 0, y: 0, z: 0 },
  { x: 4, y: 0, z: 0 },
  { x: 4, y: 0, z: 4 },
  { x: 0, y: 0, z: 4 },
];

describe('signedArea', () => {
  it('returns positive area for a CCW polygon', () => {
    expect(signedArea(SQUARE)).toBeCloseTo(16);
  });

  it('returns negative area for a CW polygon', () => {
    const reversed = [...SQUARE].reverse();
    expect(signedArea(reversed)).toBeCloseTo(-16);
  });
});

describe('centroid', () => {
  it('returns the average vertex for a square', () => {
    const c = centroid(SQUARE);
    expect(c.x).toBeCloseTo(2);
    expect(c.z).toBeCloseTo(2);
  });
});

describe('validatePolygon', () => {
  it('accepts a non-degenerate polygon', () => {
    const v = validatePolygon(SQUARE);
    expect(v.valid).toBe(true);
    expect(v.area).toBeCloseTo(16);
  });

  it('rejects fewer than 3 points', () => {
    const v = validatePolygon([{ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }]);
    expect(v.valid).toBe(false);
  });

  it('rejects a degenerate (collinear) polygon', () => {
    const v = validatePolygon([
      { x: 0, y: 0, z: 0 },
      { x: 1, y: 0, z: 0 },
      { x: 2, y: 0, z: 0 },
    ]);
    expect(v.valid).toBe(false);
  });
});
