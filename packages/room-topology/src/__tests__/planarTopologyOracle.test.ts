// GE-12 / C73 §6 — THE ORACLE FIXTURE for the `planar-topology-engine` family.
//
// C73 §6 says a family exits when (a) its copies read 1, (b) C2 names the canonical
// file, and (c) THE FAMILY HAS AN ORACLE FIXTURE AT A KNOWN ANSWER. This file is (c).
//
// WHY A COUNTING GATE NEEDS THIS. `check-triangulation-canonical` is blind to
// correctness by its own admission (C73 §5.4a — "NOT PROVEN by this gate:
// correctness of any surviving body"). Collapsing four copies onto one makes the
// count read 1 whether or not the survivor is the body with the RIGHT numbers.
// The gate's own C2 text names the open question: "which of the ... drifted bodies
// carries the correct thresholds". A count cannot answer that. A known answer can.
//
// EVERY EXPECTATION BELOW IS HAND-COMPUTABLE — no golden file, no snapshot, no value
// captured from the implementation it is checking. Areas come from the shoelace
// formula on integer coordinates; the expansion offsets come from a radial unit
// vector times 0.10. That is what makes this an ORACLE and not a change-detector.
//
// EACH ARM IS DELIBERATELY THRESHOLD-SENSITIVE. Arms 3 and 4 fail if MIN_ROOM_AREA_M2
// drifts off 0.5 or MAX_OPENING_WALL_DIST_M drifts off 0.2; arm 2 fails if the
// next-half-edge rule drifts off `(uIdx - 1 + n) % n`. All four were watched failing
// against deliberately wrong sources before being committed (gates doc §2.2 — an arm
// never watched failing is UNPROVEN).

import { describe, it, expect } from 'vitest';
import { computeTopology, assignOpeningsToWalls } from '../PlanarTopologyEngine';
import type { WallGraph, WallNode } from '../WallIntersectionResolver';

// ── Fixture builder ────────────────────────────────────────────────────────────

/** Build a WallGraph from named points and node-id pairs. Pure data — no THREE. */
function graph(
  pts: Record<string, [number, number]>,
  edges: Array<[string, string]>,
): WallGraph {
  const nodes = new Map<string, WallNode>();
  for (const [id, [x, z]] of Object.entries(pts)) {
    nodes.set(id, { id, position: { x, z }, connectedWallIds: [] });
  }
  const edgeMap = new Map<string, { startNodeId: string; endNodeId: string; wallId: string }>();
  edges.forEach(([s, e], i) => {
    const wallId = `w${i}`;
    edgeMap.set(wallId, { startNodeId: s, endNodeId: e, wallId });
    nodes.get(s)?.connectedWallIds.push(wallId);
    nodes.get(e)?.connectedWallIds.push(wallId);
  });
  return { nodes, edges: edgeMap };
}

const areasOf = (rooms: Array<{ areaM2: number }>): number[] =>
  rooms.map(r => Number(r.areaM2.toFixed(6))).sort((a, b) => a - b);

describe('PlanarTopologyEngine — ORACLE at a known answer (GE-12, C73 §6)', () => {
  // ── ARM 1: one rectangle, area known by shoelace ─────────────────────────────
  it('ARM 1 — a 6×4 rectangle is ONE room of exactly 24 m², and the outer face is expanded by 0.10 m', () => {
    // A(0,0) B(6,0) C(6,4) D(0,4). Shoelace: (0·0−6·0)+(6·4−6·0)+(6·4−0·4)+(0·0−0·4)
    //                                      =  0 + 24 + 24 + 0 = 48 → /2 = 24 m².
    const g = graph(
      { A: [0, 0], B: [6, 0], C: [6, 4], D: [0, 4] },
      [['A', 'B'], ['B', 'C'], ['C', 'D'], ['D', 'A']],
    );

    const t = computeTopology(g);

    expect(t.hasValidTopology).toBe(true);
    expect(t.rooms).toHaveLength(1);
    expect(areasOf(t.rooms)).toEqual([24]);

    // The room's centroid is the rectangle's centre — (3, 2), exactly.
    expect(t.rooms[0]!.centroid.x).toBeCloseTo(3, 10);
    expect(t.rooms[0]!.centroid.z).toBeCloseTo(2, 10);
    // All four walls bound it.
    expect(t.rooms[0]!.boundaryWallIds).toHaveLength(4);

    // Outer face: each vertex pushed 0.10 m radially from centroid (3,2).
    // For A(0,0): d = (−3,−2), |d| = √13 = 3.605551275…,
    //   offset = 0.10·(−3,−2)/√13 = (−0.083205029…, −0.055470020…).
    // By symmetry the expanded rectangle spans
    //   x ∈ [−0.083205029, 6.083205029],  z ∈ [−0.055470020, 4.055470020].
    const poly = t.outerFacePolygon!;
    expect(poly).toHaveLength(4);
    const xs = poly.map(p => p.x);
    const zs = poly.map(p => p.z);
    expect(Math.min(...xs)).toBeCloseTo(-0.0832050294, 9);
    expect(Math.max(...xs)).toBeCloseTo(6.0832050294, 9);
    expect(Math.min(...zs)).toBeCloseTo(-0.0554700196, 9);
    expect(Math.max(...zs)).toBeCloseTo(4.0554700196, 9);
  });

  // ── ARM 2: the traversal rule itself ─────────────────────────────────────────
  it('ARM 2 — a spine wall splits 6×4 into TWO rooms of exactly 12 m² each (pins the next-half-edge rule)', () => {
    // This is the arm that pins `(uIdx - 1 + n) % n`. The engine's own header records
    // that the PREVIOUS rule ("minimum CCW from reverse direction") "trac[ed] the
    // outermost enclosing face rather than the interior sub-room" — i.e. it would
    // return ONE room of 24 m² here, not two of 12. Degree-3 nodes M1/M2 are the
    // only place the rule is observable; a plain rectangle cannot see it.
    const g = graph(
      { A: [0, 0], M1: [3, 0], B: [6, 0], C: [6, 4], M2: [3, 4], D: [0, 4] },
      [
        ['A', 'M1'], ['M1', 'B'], ['B', 'C'],
        ['C', 'M2'], ['M2', 'D'], ['D', 'A'],
        ['M1', 'M2'], // the spine
      ],
    );

    const t = computeTopology(g);

    expect(t.rooms).toHaveLength(2);
    expect(areasOf(t.rooms)).toEqual([12, 12]);
    // The two rooms tile the whole rectangle — no area invented, none lost.
    expect(t.rooms.reduce((s, r) => s + r.areaM2, 0)).toBeCloseTo(24, 9);
  });

  // ── ARM 3: MIN_ROOM_AREA_M2 = 0.5, at the known answer ───────────────────────
  it('ARM 3 — a 0.6 m² cell is a room and a 0.4 m² cell is not (pins MIN_ROOM_AREA_M2 = 0.5)', () => {
    // Two disjoint rectangles either side of the 0.5 m² promotion threshold:
    //   KEEP: 1.0 × 0.6 = 0.60 m²  (> 0.5 → room)
    //   DROP: 1.0 × 0.4 = 0.40 m²  (< 0.5 → face kept as a face, NOT promoted)
    // Both are ≥ MIN_FACE_AREA_M2 (0.1), so this arm isolates the ROOM threshold
    // and cannot be satisfied by the face filter instead.
    const keep = graph(
      { P: [0, 0], Q: [1, 0], R: [1, 0.6], S: [0, 0.6] },
      [['P', 'Q'], ['Q', 'R'], ['R', 'S'], ['S', 'P']],
    );
    const drop = graph(
      { P: [0, 0], Q: [1, 0], R: [1, 0.4], S: [0, 0.4] },
      [['P', 'Q'], ['Q', 'R'], ['R', 'S'], ['S', 'P']],
    );

    expect(areasOf(computeTopology(keep).rooms)).toEqual([0.6]);
    expect(computeTopology(drop).rooms).toHaveLength(0);
  });

  // ── ARM 4: MAX_OPENING_WALL_DIST_M = 0.2, at the known answer ────────────────
  it('ARM 4 — an opening 0.15 m from a wall binds and one 0.25 m away does not (pins MAX_OPENING_WALL_DIST_M = 0.2)', () => {
    // One wall along z = 0 from (0,0) to (6,0). Perpendicular distance from an
    // opening centre at (3, d) is exactly d.
    const g = graph({ A: [0, 0], B: [6, 0] }, [['A', 'B']]);

    const near = assignOpeningsToWalls([{ id: 'o-near', centre: { x: 3, z: 0.15 } }], g);
    const far = assignOpeningsToWalls([{ id: 'o-far', centre: { x: 3, z: 0.25 } }], g);

    expect(near.get('o-near')).toBe('w0');
    expect(far.has('o-far')).toBe(false);
  });

  // ── ARM 5: the refusing half — an open run of walls encloses nothing ─────────
  it('ARM 5 — an open polyline yields NO rooms and a null outer face (empty ≠ failure)', () => {
    // Three walls in an open "C": no closed face exists, so there is nothing to
    // report. The engine must say so rather than inventing an enclosure.
    const g = graph(
      { A: [0, 0], B: [6, 0], C: [6, 4] },
      [['A', 'B'], ['B', 'C']],
    );

    const t = computeTopology(g);

    expect(t.rooms).toHaveLength(0);
    expect(t.outerFacePolygon).toBeNull();
    expect(t.hasValidTopology).toBe(false);
  });
});
