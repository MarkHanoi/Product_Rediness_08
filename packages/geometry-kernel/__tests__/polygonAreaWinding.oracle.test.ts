// §C73-AREA-CANONICAL — ORACLE FIXTURES at known answers (C73 §5.4a / §6) for
// the polygon-area-and-winding family.
//
// `polygonSignedArea2D` (pure/polygonOffset.ts `signedArea`) is the family's
// canonical body; `polygonSignedAreaOrdinates` is the same body behind
// accessors, so every vertex shape in the estate ({x,z}, {x,y}, [x,z] tuples,
// ProfilePoint) reads area and winding from ONE accumulation instead of a
// per-shape copy — the same architecture the point-in-polygon canonical uses.
//
// WINDING IS THE SIGN OF THE SAME COMPUTATION. There is deliberately no
// separate `isCCW` body: a second implementation of orientation would be a
// second definition of area. The fixtures below pin that contract — positive
// = CCW in the (first, second) ordinate plane, negative = CW — so an
// ensureCCW-style caller reads `signedArea(...) >= 0` and never mints a rival.

import { describe, expect, it } from 'vitest';
import { signedArea, polygonSignedAreaOrdinates, type Pt2 } from '../src/pure/polygonOffset.js';

const SQUARE_CCW: Pt2[] = [[0, 0], [10, 0], [10, 10], [0, 10]];
const SQUARE_CW: Pt2[] = [...SQUARE_CCW].reverse();

describe('polygonSignedArea2D — oracle at known answers', () => {
  it('CCW 10×10 square: exactly +100 (area), sign = winding', () => {
    expect(signedArea(SQUARE_CCW)).toBe(100);
    expect(signedArea(SQUARE_CW)).toBe(-100);
  });

  it('L-shape (10×10 minus the 5×5 top-right quadrant), CCW: exactly +75', () => {
    const L: Pt2[] = [[0, 0], [10, 0], [10, 5], [5, 5], [5, 10], [0, 10]];
    expect(signedArea(L)).toBe(75);
  });

  it('triangle at known answer: (0,0)(4,0)(0,3) = +6; reversed = −6', () => {
    expect(signedArea([[0, 0], [4, 0], [0, 3]])).toBe(6);
    expect(signedArea([[0, 3], [4, 0], [0, 0]])).toBe(-6);
  });

  it('explicitly closed ring (first vertex repeated): identical answer — the closing duplicate contributes zero', () => {
    const closed: Pt2[] = [...SQUARE_CCW, [0, 0]];
    expect(signedArea(closed)).toBe(100);
  });

  it('degenerate inputs: fewer than 3 vertices and collinear slivers read 0', () => {
    expect(signedArea([])).toBe(0);
    expect(signedArea([[1, 1]])).toBe(0);
    expect(signedArea([[0, 0], [5, 5]])).toBe(0);
    expect(signedArea([[0, 0], [4, 4], [8, 8]])).toBe(0); // collinear
  });
});

describe('polygonSignedAreaOrdinates — the same body behind accessors', () => {
  it('tuple ring via accessors ≡ signedArea on the tuple ring, bit for bit', () => {
    for (const ring of [SQUARE_CCW, SQUARE_CW]) {
      expect(
        polygonSignedAreaOrdinates(ring.length, (i) => ring[i]![0], (i) => ring[i]![1]),
      ).toBe(signedArea(ring));
    }
  });

  it('an {x,z} object ring reads the same area with no adapter array', () => {
    const ring = [{ x: 0, z: 0 }, { x: 10, z: 0 }, { x: 10, z: 10 }, { x: 0, z: 10 }];
    expect(
      polygonSignedAreaOrdinates(ring.length, (i) => ring[i]!.x, (i) => ring[i]!.z),
    ).toBe(100);
  });

  it('irrational coordinates: accessor and tuple paths are BIT-identical (one accumulation order, not two)', () => {
    const ring: Pt2[] = [
      [Math.SQRT2, Math.E], [7.1234567891, 0.30000000004],
      [Math.PI * 3, Math.LN10], [-Math.SQRT1_2, 5.5555555555],
    ];
    const viaAccessors = polygonSignedAreaOrdinates(ring.length, (i) => ring[i]![0], (i) => ring[i]![1]);
    expect(viaAccessors).toBe(signedArea(ring));
  });
});
