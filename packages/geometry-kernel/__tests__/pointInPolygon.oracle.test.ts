// §C73-PIP-CANONICAL — ORACLE FIXTURES at known answers (C73 §5.4a / §6).
//
// `check-predicate-canonical.ts` counts implementations; it is deliberately
// blind to whether the surviving body is CORRECT. This file is the other half
// of the family's exit condition: known-answer cases pinned hard, the way
// polygon offset is pinned at the 300 mm eave. Every axis the 51 rival bodies
// disagreed on (boundary rule, guard behaviour on horizontal edges, winding,
// ring closure, degenerate rings) has a fixture here, so a regression in the
// one canonical body is caught by a NAMED case, not a downstream layout test.

import { describe, expect, it } from 'vitest';
import {
  pointInPolygonXY,
  pointInPolygonXZ,
  pointInRingEvenOdd,
} from '../src/pure/pointInPolygon.js';

/** Unit-square scaled ×10, CCW, open form: (0,0) → (10,0) → (10,10) → (0,10). */
const SQUARE = [
  { x: 0, z: 0 },
  { x: 10, z: 0 },
  { x: 10, z: 10 },
  { x: 0, z: 10 },
] as const;

/**
 * L-shape (concave), CCW, open form — a 10×10 square with the top-right
 * 5×5 quadrant removed.
 */
const L_SHAPE = [
  { x: 0, z: 0 },
  { x: 10, z: 0 },
  { x: 10, z: 5 },
  { x: 5, z: 5 },
  { x: 5, z: 10 },
  { x: 0, z: 10 },
] as const;

describe('pointInRingEvenOdd — oracle at known answers', () => {
  it('square: strict interior in, strict exterior out', () => {
    expect(pointInPolygonXZ(5, 5, SQUARE)).toBe(true);
    expect(pointInPolygonXZ(0.001, 9.999, SQUARE)).toBe(true);
    expect(pointInPolygonXZ(-0.001, 5, SQUARE)).toBe(false);
    expect(pointInPolygonXZ(10.001, 5, SQUARE)).toBe(false);
    expect(pointInPolygonXZ(5, -0.001, SQUARE)).toBe(false);
    expect(pointInPolygonXZ(5, 10.001, SQUARE)).toBe(false);
    expect(pointInPolygonXZ(1e6, 1e6, SQUARE)).toBe(false);
  });

  it('L-shape: the removed quadrant is OUTSIDE, the remaining arms are INSIDE', () => {
    expect(pointInPolygonXZ(7.5, 7.5, L_SHAPE)).toBe(false); // the notch
    expect(pointInPolygonXZ(2.5, 7.5, L_SHAPE)).toBe(true); // vertical arm
    expect(pointInPolygonXZ(7.5, 2.5, L_SHAPE)).toBe(true); // horizontal arm
    expect(pointInPolygonXZ(2.5, 2.5, L_SHAPE)).toBe(true); // corner block
  });

  // ── Boundary: the decided HALF-OPEN rule, pinned exactly (§3.7 axis 2) ────
  // A point ON the boundary is deterministic but edge-dependent: for this
  // square the min-x and min-z edges read inside, the max-x and max-z edges
  // read outside. These eight assertions ARE the decision — if any flips, the
  // canonical boundary semantics changed and every composed band/exclusive
  // call site inherited it silently.
  it('boundary (half-open): min-x/min-z edges in, max-x/max-z edges out', () => {
    expect(pointInPolygonXZ(0, 5, SQUARE)).toBe(true); // on min-x edge
    expect(pointInPolygonXZ(5, 0, SQUARE)).toBe(true); // on min-z edge
    expect(pointInPolygonXZ(10, 5, SQUARE)).toBe(false); // on max-x edge
    expect(pointInPolygonXZ(5, 10, SQUARE)).toBe(false); // on max-z edge
  });

  it('boundary (half-open): min corner in, max corner out', () => {
    expect(pointInPolygonXZ(0, 0, SQUARE)).toBe(true); // min vertex
    expect(pointInPolygonXZ(10, 10, SQUARE)).toBe(false); // max vertex
  });

  // ── Horizontal edges: the CesiumViewport motivator (§3.7 axis 1) ──────────
  // Query exactly AT a horizontal edge's ordinate. Under the rival `+ eps`
  // guards this perturbed every crossing; under the bare-divide rivals a
  // horizontal edge would divide by zero IF the straddle did not gate it.
  // Canonical: finite, deterministic, no NaN, exact interpolation.
  it('query at a horizontal edge ordinate: finite and correct, no divide-by-zero', () => {
    expect(pointInPolygonXZ(5, 5, L_SHAPE)).toBe(false); // the REENTRANT corner vertex: half-open reads it out (hand-traced)
    expect(pointInPolygonXZ(2.5, 5, L_SHAPE)).toBe(true); // interior at shelf ordinate
    expect(pointInPolygonXZ(12, 5, L_SHAPE)).toBe(false); // exterior at shelf ordinate
    expect(pointInPolygonXZ(7.5, 5.000001, L_SHAPE)).toBe(false); // a hair above the shelf → notch
    expect(pointInPolygonXZ(7.5, 4.999999, L_SHAPE)).toBe(true); // a hair below → arm
  });

  // ── Winding independence (§3.7 axis 4) ────────────────────────────────────
  it('CW and CCW rings give identical answers everywhere sampled', () => {
    const cw = [...SQUARE].reverse();
    const lCw = [...L_SHAPE].reverse();
    for (let x = -2; x <= 12; x += 0.5) {
      for (let z = -2; z <= 12; z += 0.5) {
        expect(pointInPolygonXZ(x, z, cw)).toBe(pointInPolygonXZ(x, z, SQUARE));
        expect(pointInPolygonXZ(x, z, lCw)).toBe(pointInPolygonXZ(x, z, L_SHAPE));
      }
    }
  });

  // ── Ring-closure independence (§3.7 axis 5) ───────────────────────────────
  it('an explicitly closed ring (first vertex repeated) gives identical answers', () => {
    const closed = [...SQUARE, SQUARE[0]!];
    for (let x = -2; x <= 12; x += 0.5) {
      for (let z = -2; z <= 12; z += 0.5) {
        expect(pointInPolygonXZ(x, z, closed)).toBe(pointInPolygonXZ(x, z, SQUARE));
      }
    }
  });

  // ── Degenerate rings (§3.7 axis 3) ────────────────────────────────────────
  it('rings with fewer than 3 vertices have no interior: false, never a throw', () => {
    expect(pointInPolygonXZ(0, 0, [])).toBe(false);
    expect(pointInPolygonXZ(0, 0, [{ x: 0, z: 0 }])).toBe(false);
    expect(pointInPolygonXZ(0, 0, [{ x: 0, z: 0 }, { x: 10, z: 10 }])).toBe(false);
    expect(pointInPolygonXZ(5, 5, [{ x: 0, z: 0 }, { x: 10, z: 10 }])).toBe(false);
  });

  it('a collapsed ring (all vertices coincident) contains nothing', () => {
    const dot = [{ x: 3, z: 3 }, { x: 3, z: 3 }, { x: 3, z: 3 }];
    expect(pointInPolygonXZ(3, 3, dot)).toBe(false);
    expect(pointInPolygonXZ(0, 0, dot)).toBe(false);
  });

  it('collinear duplicate vertices on an edge do not change any answer', () => {
    const withCollinear = [
      { x: 0, z: 0 },
      { x: 5, z: 0 }, // collinear midpoint on the bottom edge
      { x: 10, z: 0 },
      { x: 10, z: 10 },
      { x: 0, z: 10 },
    ];
    for (let x = -2; x <= 12; x += 0.5) {
      for (let z = -2; z <= 12; z += 0.5) {
        expect(pointInPolygonXZ(x, z, withCollinear)).toBe(pointInPolygonXZ(x, z, SQUARE));
      }
    }
  });

  // ── Holes via multi-ring XOR (§3.7 axis 7) — the documented composition ───
  it('even-odd over outer + hole ring (XOR) excludes the hole, no second body needed', () => {
    const outer = SQUARE;
    const hole = [
      { x: 4, z: 4 },
      { x: 6, z: 4 },
      { x: 6, z: 6 },
      { x: 4, z: 6 },
    ];
    const inRings = (px: number, pz: number): boolean =>
      [outer, hole].reduce((acc, ring) => acc !== pointInPolygonXZ(px, pz, ring), false);
    expect(inRings(5, 5)).toBe(false); // inside the hole → outside the region
    expect(inRings(2, 2)).toBe(true); // in the outer, outside the hole
    expect(inRings(11, 5)).toBe(false); // outside everything
  });

  // ── Wrapper/accessor equivalence — one body, many shapes ──────────────────
  it('XZ wrapper, XY wrapper, tuple accessor and {e,n} accessor all agree with the core', () => {
    const xy = SQUARE.map((p) => ({ x: p.x, y: p.z }));
    const tuples = SQUARE.map((p) => [p.x, p.z] as const);
    const en = SQUARE.map((p) => ({ e: p.x, n: p.z }));
    for (let x = -2; x <= 12; x += 0.5) {
      for (let z = -2; z <= 12; z += 0.5) {
        const want = pointInPolygonXZ(x, z, SQUARE);
        expect(pointInPolygonXY(x, z, xy)).toBe(want);
        expect(
          pointInRingEvenOdd(x, z, tuples.length, (i) => tuples[i]![0], (i) => tuples[i]![1]),
        ).toBe(want);
        expect(
          pointInRingEvenOdd(x, z, en.length, (i) => en[i]!.e, (i) => en[i]!.n),
        ).toBe(want);
      }
    }
  });

  // ── Determinism: same inputs, same answer, every call ─────────────────────
  it('repeat calls are identical, including exactly-on-boundary queries', () => {
    const probes: Array<[number, number]> = [
      [0, 5], [10, 5], [5, 0], [5, 10], [0, 0], [10, 10], [5, 5],
    ];
    for (const [x, z] of probes) {
      const first = pointInPolygonXZ(x, z, SQUARE);
      for (let k = 0; k < 5; k++) expect(pointInPolygonXZ(x, z, SQUARE)).toBe(first);
    }
  });
});
