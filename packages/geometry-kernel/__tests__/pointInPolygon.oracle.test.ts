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
  pointInEdgeSetEvenOdd,
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

// ── The edge-set body: multi-loop even-odd over one flat buffer ─────────────
//
// This is the shape `pointInSilhouette` (HiddenLineRemoval.ts) actually holds:
// a flat [ax, ay, bx, by, …] quad array carrying SEVERAL closed loops at once
// — a wall outline plus the window rectangles punched through it — with no
// loop separators. Even-odd parity over that UNION is what makes an opening
// read as see-through; these fixtures pin that this is behaviour of the ONE
// canonical body, not of a private rival.
describe('pointInEdgeSetEvenOdd — multi-loop even-odd over a flat edge buffer', () => {
  /** Flat quad array: outer 10×10 wall outline + a 4..6 window rectangle. */
  const WALL_WITH_WINDOW: number[] = [
    // outer outline (0,0)→(10,0)→(10,10)→(0,10)→close
    0, 0, 10, 0,
    10, 0, 10, 10,
    10, 10, 0, 10,
    0, 10, 0, 0,
    // window rectangle (4,4)→(6,4)→(6,6)→(4,6)→close
    4, 4, 6, 4,
    6, 4, 6, 6,
    6, 6, 4, 6,
    4, 6, 4, 4,
  ];

  const inSegs = (px: number, py: number, segs: number[]): boolean =>
    pointInEdgeSetEvenOdd(
      px, py, segs.length >> 2,
      (k) => segs[k * 4]!, (k) => segs[k * 4 + 1]!,
      (k) => segs[k * 4 + 2]!, (k) => segs[k * 4 + 3]!,
    );

  it('a point inside the outline but INSIDE the window rectangle reads OUTSIDE (the opening is see-through)', () => {
    expect(inSegs(5, 5, WALL_WITH_WINDOW)).toBe(false); // in the window
    expect(inSegs(4.001, 5.999, WALL_WITH_WINDOW)).toBe(false); // window corner region
  });

  it('the solid wall between outline and window reads INSIDE; the exterior reads OUTSIDE', () => {
    expect(inSegs(2, 2, WALL_WITH_WINDOW)).toBe(true); // solid wall
    expect(inSegs(5, 3, WALL_WITH_WINDOW)).toBe(true); // solid strip below the window
    expect(inSegs(9, 5, WALL_WITH_WINDOW)).toBe(true); // solid strip beside the window
    expect(inSegs(-1, 5, WALL_WITH_WINDOW)).toBe(false); // outside everything
    expect(inSegs(11, 11, WALL_WITH_WINDOW)).toBe(false);
  });

  it('parity is invariant to edge ORDER and per-edge endpoint order', () => {
    // Reverse the edge sequence AND swap each edge's endpoints.
    const shuffled: number[] = [];
    for (let k = (WALL_WITH_WINDOW.length >> 2) - 1; k >= 0; k--) {
      shuffled.push(
        WALL_WITH_WINDOW[k * 4 + 2]!, WALL_WITH_WINDOW[k * 4 + 3]!,
        WALL_WITH_WINDOW[k * 4]!, WALL_WITH_WINDOW[k * 4 + 1]!,
      );
    }
    for (let x = -1; x <= 11; x += 0.5) {
      for (let y = -1; y <= 11; y += 0.5) {
        expect(inSegs(x, y, shuffled)).toBe(inSegs(x, y, WALL_WITH_WINDOW));
      }
    }
  });

  it('the ring wrapper and a hand-built closed edge set agree everywhere on the L-shape', () => {
    const segs: number[] = [];
    for (let i = 0; i < L_SHAPE.length; i++) {
      const a = L_SHAPE[i]!, b = L_SHAPE[(i + 1) % L_SHAPE.length]!;
      segs.push(a.x, a.z, b.x, b.z);
    }
    for (let x = -1; x <= 11; x += 0.25) {
      for (let z = -1; z <= 11; z += 0.25) {
        expect(inSegs(x, z, segs)).toBe(pointInPolygonXZ(x, z, L_SHAPE));
      }
    }
  });

  it('fewer than 3 edges cannot bound an area and reads false', () => {
    expect(pointInEdgeSetEvenOdd(0, 0, 0, () => 0, () => 0, () => 0, () => 0)).toBe(false);
    const two = [0, -5, 0, 5, -5, 0, 5, 0];
    expect(inSegs(0, 0, two)).toBe(false);
  });
});

// ── THE RAY THROUGH A VERTEX, AND THE OTHER SEPARATING CASES ────────────────
//
// WHY THIS BLOCK EXISTS (measured 2026-08-16, not assumed).
//
// The fixtures above are strong on the axes they name, but SIX of the suite's
// broadest sweeps — winding, ring closure, collinear duplicates, edge order,
// endpoint order, ring-vs-edge-set — assert the canonical body against ITSELF
// (`toBe(pointInPolygonXZ(...))` / `toBe(inSegs(...))`). They pin RELATIONS,
// not VALUES. A change to the straddle test inside the one body flips both
// sides of every such comparison identically and they stay green. Only an
// ABSOLUTE known answer can catch a convention change in the body itself.
//
// A mutation probe proved that gap is real rather than theoretical. Replacing
// the half-open straddle `(yi > py) !== (yj > py)` with the textbook naive
// INCLUSIVE-BOTH-ENDS form — which double-counts a vertex lying exactly on the
// ray, so a PASS-THROUGH vertex contributes 2 crossings instead of 1 and the
// parity inverts — left the edge-set block at **5 of 5 PASSING**. The whole
// file caught it only incidentally, via 2 ring-shaped BOUNDARY fixtures, i.e.
// it noticed "the half-open rule moved", never "vertex parity broke".
//
// And every "vertex" fixture above queries a point COINCIDENT WITH a vertex.
// None casts a ray that PASSES THROUGH one from elsewhere, which is the case
// where naive even-odd double-counts. That case is pinned here, at known
// answers hand-traced by crossing count, on the EDGE-SET body with multi-loop
// input — the exact shape `pointInSilhouette` (HiddenLineRemoval.ts) passes.
describe('pointInEdgeSetEvenOdd — a ray passing exactly THROUGH a vertex', () => {
  const inSegs = (px: number, py: number, segs: number[]): boolean =>
    pointInEdgeSetEvenOdd(
      px, py, segs.length >> 2,
      (k) => segs[k * 4]!, (k) => segs[k * 4 + 1]!,
      (k) => segs[k * 4 + 2]!, (k) => segs[k * 4 + 3]!,
    );

  /** Closed loop from an open ring of [x, y] pairs, as a flat quad buffer. */
  const loop = (pts: ReadonlyArray<readonly [number, number]>): number[] => {
    const out: number[] = [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i]!, b = pts[(i + 1) % pts.length]!;
      out.push(a[0], a[1], b[0], b[1]);
    }
    return out;
  };

  // ── 1. PASS-THROUGH vertex: the boundary genuinely crosses the ray AT a
  //       vertex, so it must count EXACTLY ONCE. This is the assertion the
  //       double-count mutation fails: it counts the apex twice and reports
  //       the interior point as OUTSIDE.
  //
  //       Triangle (0,-4) → (6,0) → (0,4). The apex (6,0) sits exactly on the
  //       y=0 ray. Hand-traced for the interior query (1,0): edge (0,-4)→(6,0)
  //       does not straddle (both ends ≤ 0 under the half-open rule); edge
  //       (6,0)→(0,4) straddles with abscissa exactly 6 → crossing; edge
  //       (0,4)→(0,-4) straddles with abscissa 0, which is left of px → no
  //       crossing. Total 1 → odd → INSIDE.
  const APEX_TRIANGLE = loop([[0, -4], [6, 0], [0, 4]]);

  it('an interior point whose ray EXITS through a vertex counts that vertex ONCE (inside)', () => {
    expect(inSegs(1, 0, APEX_TRIANGLE)).toBe(true);
  });

  it('exterior points on the same vertex-piercing ray read outside (2 crossings left, 0 right)', () => {
    expect(inSegs(-3, 0, APEX_TRIANGLE)).toBe(false); // ray crosses apex AND the back edge
    expect(inSegs(7, 0, APEX_TRIANGLE)).toBe(false); // ray already past the apex
  });

  // ── 2. TOUCH vertex: a LOCAL EXTREMUM sitting on the ray. The boundary does
  //       NOT cross there, so parity must be preserved. The half-open rule
  //       achieves this by counting it 2× when both neighbours are ABOVE and
  //       0× when both are BELOW — different counts, same (even) parity. Both
  //       spellings are pinned because a mutation can break one and not the
  //       other.
  const V_NOTCH = loop([[-5, 5], [0, 0], [5, 5], [5, 10], [-5, 10]]); // tip up-facing, neighbours ABOVE
  const PEAK = loop([[-5, -5], [0, 0], [5, -5], [5, -10], [-5, -10]]); // peak, neighbours BELOW

  it('a touch vertex with both neighbours ABOVE the ray does not flip parity (2 crossings)', () => {
    expect(inSegs(-10, 0, V_NOTCH)).toBe(false);
    expect(inSegs(0, 7, V_NOTCH)).toBe(true); // genuine interior, above the notch
  });

  it('a touch vertex with both neighbours BELOW the ray does not flip parity (0 crossings)', () => {
    expect(inSegs(-10, 0, PEAK)).toBe(false);
    expect(inSegs(0, -7, PEAK)).toBe(true); // genuine interior, below the peak
  });

  // ── 3. THE HIDDEN-LINE CASE: a ray through a HOLE's vertices. A diamond
  //       opening whose left/right corners (3,5) and (7,5) lie exactly on the
  //       y=5 ray. The opening must still read SEE-THROUGH. Under the
  //       double-count mutation this returns true — the window would start
  //       occluding, which is the defect the multi-loop body exists to avoid.
  const WALL_WITH_DIAMOND_WINDOW: number[] = [
    ...loop([[0, 0], [10, 0], [10, 10], [0, 10]]), // outer wall outline
    ...loop([[5, 3], [7, 5], [5, 7], [3, 5]]), // diamond opening
  ];

  it('a ray piercing the OPENING\'s vertices keeps the opening see-through', () => {
    expect(inSegs(5, 5, WALL_WITH_DIAMOND_WINDOW)).toBe(false); // centre of the opening (2 crossings)
    expect(inSegs(1, 5, WALL_WITH_DIAMOND_WINDOW)).toBe(true); // solid wall left of it (3 crossings)
    expect(inSegs(8, 5, WALL_WITH_DIAMOND_WINDOW)).toBe(true); // solid wall right of it (1 crossing)
  });

  // ── 4. ON AN EDGE / ON A VERTEX of a MULTI-LOOP buffer, at known answers.
  //       The ring block pins this for a lone square; nothing pinned it for a
  //       buffer with a hole, where the answer INVERTS on the inner loop —
  //       the outer loop's min-x edge reads INSIDE while the HOLE's min-x edge
  //       reads OUTSIDE. That inversion is a property of even-odd over the
  //       union and is precisely what a ring predicate cannot express.
  const WALL_WITH_WINDOW: number[] = [
    ...loop([[0, 0], [10, 0], [10, 10], [0, 10]]),
    ...loop([[4, 4], [6, 4], [6, 6], [4, 6]]),
  ];

  it('outer-loop boundary: min-x edge reads inside, max-x edge reads outside', () => {
    expect(inSegs(0, 5, WALL_WITH_WINDOW)).toBe(true); // on the outer min-x edge
    expect(inSegs(10, 5, WALL_WITH_WINDOW)).toBe(false); // on the outer max-x edge
  });

  it('HOLE boundary inverts the same rule: the opening\'s min-x edge reads OUTSIDE', () => {
    expect(inSegs(4, 5, WALL_WITH_WINDOW)).toBe(false); // on the opening's min-x edge
    expect(inSegs(6, 5, WALL_WITH_WINDOW)).toBe(true); // on the opening's max-x edge → solid
  });

  it('exactly ON a hole VERTEX: min corner reads outside, max corner reads inside', () => {
    expect(inSegs(4, 4, WALL_WITH_WINDOW)).toBe(false); // opening's min corner
    expect(inSegs(6, 6, WALL_WITH_WINDOW)).toBe(true); // opening's max corner
  });

  // ── 5. DEGENERATE ZERO-LENGTH EDGES are inert. The ring block reaches this
  //       only through the closure wrapper (a repeated first vertex); nothing
  //       pinned it for a degenerate edge sitting loose in a multi-loop buffer,
  //       which is what a collapsed wall segment produces upstream. `yi === yj`
  //       can never satisfy the straddle test, so such an edge contributes
  //       nothing — including when it lies exactly ON the ray, or exactly ON
  //       the query point.
  it('zero-length edges anywhere in the buffer change no answer', () => {
    const withDegenerate: number[] = [
      ...WALL_WITH_WINDOW,
      5, 5, 5, 5, // exactly at a query point, inside the opening
      2, 5, 2, 5, // exactly on the y=5 ray, in the solid wall
      0, 0, 0, 0, // exactly on an outer vertex
      -7, 5, -7, 5, // exactly on the ray, outside the shape
    ];
    for (let x = -1; x <= 11; x += 0.25) {
      for (let y = -1; y <= 11; y += 0.25) {
        expect(inSegs(x, y, withDegenerate)).toBe(inSegs(x, y, WALL_WITH_WINDOW));
      }
    }
    // …and the same absolute answers still hold, so the sweep above cannot be
    // satisfied by BOTH sides degrading together.
    expect(inSegs(5, 5, withDegenerate)).toBe(false); // opening still see-through
    expect(inSegs(2, 2, withDegenerate)).toBe(true); // solid wall still solid
    expect(inSegs(0, 5, withDegenerate)).toBe(true); // outer min-x edge unchanged
    expect(inSegs(4, 5, withDegenerate)).toBe(false); // hole min-x edge unchanged
  });
});
