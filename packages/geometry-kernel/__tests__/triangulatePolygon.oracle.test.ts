// §C73-TRIANGULATION-CANONICAL — ORACLE fixture at a KNOWN ANSWER (GE-12).
//
// The counting gate (`tools/ga-gate/check-triangulation-canonical.ts`) is
// blind to correctness by design (C73 §5.4a); THIS file is the family's
// correctness anchor. The concave L-polygon is the exact shape the two
// retired fan families were silently wrong on: a centroid fan over this ring
// emits triangles that leak outside the boundary (the centroid "sees" the
// notch), yet its area-sum still LOOKS plausible — which is why the oracle
// pins area-sum, triangle count, orientation AND notch coverage together.

import { describe, expect, it } from 'vitest';
import {
  earcut,
  triangulateRingOrdinates,
  triangulationAreaDeviation,
} from '../src/pure/triangulatePolygon.js';
import { polygonSignedAreaOrdinates } from '../src/pure/polygonOffset.js';

interface P { readonly x: number; readonly y: number }

/** Concave L: 4×4 square minus the 2×2 top-right notch. Area = 12. */
const L_CCW: readonly P[] = [
  { x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 2 },
  { x: 2, y: 2 }, { x: 2, y: 4 }, { x: 0, y: 4 },
];
const L_AREA = 12;

function triAreasSigned(pts: readonly P[], tris: readonly number[]): number[] {
  const out: number[] = [];
  for (let t = 0; t < tris.length; t += 3) {
    const a = pts[tris[t]!]!, b = pts[tris[t + 1]!]!, c = pts[tris[t + 2]!]!;
    out.push(((b.x - a.x) * (c.y - a.y) - (c.x - a.x) * (b.y - a.y)) / 2);
  }
  return out;
}

function pointInTri(p: P, a: P, b: P, c: P): boolean {
  const s = (u: P, v: P): number => (p.x - v.x) * (u.y - v.y) - (u.x - v.x) * (p.y - v.y);
  const d1 = s(a, b), d2 = s(b, c), d3 = s(c, a);
  return !((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0));
}

describe('triangulatePolygon — oracle at a known answer (concave L)', () => {
  it('CCW L-polygon: n−2 triangles, area-sum = 12 to 1e-9, all positively oriented, notch uncovered', () => {
    const tris = triangulateRingOrdinates(L_CCW.length, (i) => L_CCW[i]!.x, (i) => L_CCW[i]!.y);
    expect(tris.length).toBe((L_CCW.length - 2) * 3); // 4 triangles

    const areas = triAreasSigned(L_CCW, tris);
    // Orientation contract: positively oriented in the input ordinate plane.
    for (const a of areas) expect(a).toBeGreaterThan(0);
    const sum = areas.reduce((s, a) => s + a, 0);
    expect(Math.abs(sum - L_AREA)).toBeLessThan(1e-9);

    // Concavity: the notch centre (3, 3) lies OUTSIDE the polygon and must be
    // covered by NO triangle. A centroid fan fails exactly this assertion.
    const notch: P = { x: 3, y: 3 };
    for (let t = 0; t < tris.length; t += 3) {
      expect(
        pointInTri(notch, L_CCW[tris[t]!]!, L_CCW[tris[t + 1]!]!, L_CCW[tris[t + 2]!]!),
      ).toBe(false);
    }

    // Every index in range.
    for (const i of tris) {
      expect(Number.isInteger(i)).toBe(true);
      expect(i).toBeGreaterThanOrEqual(0);
      expect(i).toBeLessThan(L_CCW.length);
    }
  });

  it('CW input: output is orientation-normalised (still positive) with the same area-sum', () => {
    const cw = [...L_CCW].reverse();
    expect(polygonSignedAreaOrdinates(cw.length, (i) => cw[i]!.x, (i) => cw[i]!.y)).toBeLessThan(0);
    const tris = triangulateRingOrdinates(cw.length, (i) => cw[i]!.x, (i) => cw[i]!.y);
    const areas = triAreasSigned(cw, tris);
    for (const a of areas) expect(a).toBeGreaterThan(0);
    expect(Math.abs(areas.reduce((s, a) => s + a, 0) - L_AREA)).toBeLessThan(1e-9);
  });

  it('holes API: 4×4 ring with 2×2 hole covers area 12 to 1e-9', () => {
    // Outer CCW, hole CW (earcut convention, same as produceSlab feeds it).
    const flat = [
      0, 0, 4, 0, 4, 4, 0, 4,      // outer
      1, 1, 1, 3, 3, 3, 3, 1,      // hole (CW)
    ];
    const tris = earcut(flat, [4]);
    expect(tris.length % 3).toBe(0);
    let sum = 0;
    for (let t = 0; t < tris.length; t += 3) {
      const ax = flat[2 * tris[t]!]!, ay = flat[2 * tris[t]! + 1]!;
      const bx = flat[2 * tris[t + 1]!]!, by = flat[2 * tris[t + 1]! + 1]!;
      const cx = flat[2 * tris[t + 2]!]!, cy = flat[2 * tris[t + 2]! + 1]!;
      sum += Math.abs((bx - ax) * (cy - ay) - (cx - ax) * (by - ay)) / 2;
    }
    expect(Math.abs(sum - 12)).toBeLessThan(1e-9);
  });

  it('area deviation: ≈0 for the faithful L triangulation; large for a self-intersecting bowtie', () => {
    const xAt = (i: number): number => L_CCW[i]!.x;
    const yAt = (i: number): number => L_CCW[i]!.y;
    const good = triangulateRingOrdinates(L_CCW.length, xAt, yAt);
    expect(triangulationAreaDeviation(L_CCW.length, xAt, yAt, good)).toBeLessThan(1e-12);

    // Bowtie: shoelace area ≈ 0, best-effort triangles cover real area.
    const bow: readonly P[] = [
      { x: 0, y: 0 }, { x: 2, y: 2 }, { x: 2, y: 0 }, { x: 0, y: 2 },
    ];
    const bx = (i: number): number => bow[i]!.x;
    const by = (i: number): number => bow[i]!.y;
    const tris = triangulateRingOrdinates(bow.length, bx, by);
    expect(triangulationAreaDeviation(bow.length, bx, by, tris)).toBeGreaterThan(1e-3);
  });

  it('degenerate rings: <3 vertices → [] and deviation 0', () => {
    expect(triangulateRingOrdinates(2, () => 0, () => 0)).toEqual([]);
    expect(triangulationAreaDeviation(2, () => 0, () => 0, [])).toBe(0);
  });
});
