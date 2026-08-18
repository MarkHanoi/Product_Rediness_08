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

// ── GE-12 / C73 §3.7 — ARMS 6-9 WERE ADDED WITH THE EXTRACTION ─────────────────
// The walk now lives at `@pryzm/geometry-kernel/pure/planarFaceWalk`. Arms 1-5 above
// still drive `computeTopology`, so they prove the ADAPTER still lands on the known
// answer; arms 6-9 drive the EXTRACTED function directly and pin the four axes the
// collapse had to SETTLE rather than inherit (§PTE-FILTERED, §PTE-TIEBREAK,
// §PTE-OUTER-FACE). The same hand-computed geometry is asserted from the auto-dimension
// side in `packages/auto-dimension/__tests__/planarFaceWalkOracle.test.ts` — that is what
// "both callers agree" means here: both agree WITH THE KNOWN ANSWER, which is a stronger
// claim than agreeing with each other.

import { describe, it, expect } from 'vitest';
import {
  tracePlanarFacesXZ,
  selectOuterFaceXZ,
  selectOuterFacePerComponentXZ,
  planarComponentsXZ,
  type PlanarGraphXZ,
} from '@pryzm/geometry-kernel/pure/planarFaceWalk';
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

// ═══════════════════════════════════════════════════════════════════════════════
// THE EXTRACTED WALK — GE-12 / C73 §3.7
// ═══════════════════════════════════════════════════════════════════════════════

/** Build the kernel's `PlanarGraphXZ` from the same named points and node-id pairs. */
function planar(
  pts: Record<string, [number, number]>,
  edges: Array<[string, string]>,
  edgeIds?: string[],
): PlanarGraphXZ {
  const positions = new Map(Object.entries(pts).map(([id, [x, z]]) => [id, { x, z }]));
  return {
    positions,
    edges: edges.map(([s, e], i) => ({ id: edgeIds?.[i] ?? `w${i}`, startNodeId: s, endNodeId: e })),
  };
}

const sortedAreas = (fs: Array<{ signedAreaM2: number }>): number[] =>
  fs.map((f) => Number(f.signedAreaM2.toFixed(6))).sort((a, b) => a - b);

describe('planarFaceWalk — THE EXTRACTED walk, at the same known answers (GE-12, C73 §3.7)', () => {
  // ── ARM 6: the walk itself, at ARM 1's and ARM 2's hand-computed areas ───────
  it('ARM 6 — 6×4 traces exactly two faces, +24 inside and −24 outside; the spine splits it into +12/+12/−24', () => {
    // Same shoelace as ARM 1. Interior faces come back CCW (positive), the enclosing
    // face CW (negative), and they must sum to zero — no area invented, none lost.
    const oneRoom = tracePlanarFacesXZ(
      planar({ A: [0, 0], B: [6, 0], C: [6, 4], D: [0, 4] },
             [['A', 'B'], ['B', 'C'], ['C', 'D'], ['D', 'A']]),
    );
    expect(sortedAreas(oneRoom)).toEqual([-24, 24]);
    expect(oneRoom.reduce((s, f) => s + f.signedAreaM2, 0)).toBeCloseTo(0, 9);

    // Same fixture as ARM 2 — degree-3 nodes are the only place the next-half-edge
    // rule `(uIdx - 1 + n) % n` is observable. A rectangle cannot see it.
    const twoRooms = tracePlanarFacesXZ(
      planar(
        { A: [0, 0], M1: [3, 0], B: [6, 0], C: [6, 4], M2: [3, 4], D: [0, 4] },
        [['A', 'M1'], ['M1', 'B'], ['B', 'C'], ['C', 'M2'], ['M2', 'D'], ['D', 'A'], ['M1', 'M2']],
      ),
    );
    expect(sortedAreas(twoRooms)).toEqual([-24, 12, 12]);
  });

  // ── ARM 7: §PTE-FILTERED — the face-area filter is the CALLER's, and it bites ──
  it('ARM 7 — a 0.36 m² face survives the default (no filter) and is dropped at minAbsFaceAreaM2 = 0.5', () => {
    // 0.6 × 0.6 = 0.36 m² exactly. THE DRIFT AXIS: room-topology filtered faces at 0.1;
    // auto-dimension filtered nothing. The extraction refused to pick a silent winner —
    // the default is NO FILTER and each caller states its own number at the call site.
    const g = planar({ P: [0, 0], Q: [0.6, 0], R: [0.6, 0.6], S: [0, 0.6] },
                     [['P', 'Q'], ['Q', 'R'], ['R', 'S'], ['S', 'P']]);

    expect(sortedAreas(tracePlanarFacesXZ(g))).toEqual([-0.36, 0.36]);          // default: 0
    expect(sortedAreas(tracePlanarFacesXZ(g, { minAbsFaceAreaM2: 0.1 }))).toEqual([-0.36, 0.36]);
    expect(tracePlanarFacesXZ(g, { minAbsFaceAreaM2: 0.5 })).toHaveLength(0);   // both faces gone
  });

  // ── ARM 8: §PTE-TIEBREAK (T2) — seed order changes NOTHING about the answer ───
  it('ARM 8 — shuffling the edges leaves the face SET identical (seed order is settled, not incidental)', () => {
    // room-topology used to seed in `Map` insertion order over a uuid-keyed map, so the
    // output rotated with the input. The kernel sorts seeds by (id, start, end). The
    // next-half-edge map is a bijection, so faces are its ORBITS: the SET, the areas and
    // the membership cannot depend on where the walk started. This arm asserts that as a
    // property, at a known answer, rather than trusting the argument.
    const pts: Record<string, [number, number]> = {
      A: [0, 0], M1: [3, 0], B: [6, 0], C: [6, 4], M2: [3, 4], D: [0, 4],
    };
    const forward: Array<[string, string]> = [
      ['A', 'M1'], ['M1', 'B'], ['B', 'C'], ['C', 'M2'], ['M2', 'D'], ['D', 'A'], ['M1', 'M2'],
    ];
    // Same seven edges, presented back-to-front and with their ids permuted with them.
    const ids = forward.map((_, i) => `w${i}`);
    const shuffled = [...forward].reverse();
    const shuffledIds = [...ids].reverse();

    const a = tracePlanarFacesXZ(planar(pts, forward, ids));
    const b = tracePlanarFacesXZ(planar(pts, shuffled, shuffledIds));

    expect(sortedAreas(a)).toEqual([-24, 12, 12]);
    expect(sortedAreas(b)).toEqual(sortedAreas(a));
    // Membership too, not just areas: each face's node SET, canonicalised.
    const memberships = (fs: typeof a): string[] =>
      fs.map((f) => [...f.nodeIds].sort().join(',')).sort();
    expect(memberships(b)).toEqual(memberships(a));
  });

  // ── ARM 9: §PTE-OUTER-FACE — the two policies give DIFFERENT answers, on purpose ──
  it('ARM 9 — on two disjoint 6×4 footprints POLICY A keeps ONE and POLICY B keeps BOTH', () => {
    // THE AXIS THE COLLAPSE REFUSED TO UNIFY. Both rectangles are 6×4 = 24 m², so their
    // outer faces are −24 EACH: the singular policy must discard one (L-268 in miniature,
    // and the exact tie that makes §PTE-TIEBREAK T4 reachable), the per-component policy
    // must keep both. If a future edit makes these two agree, one of the two shipping
    // callers has silently changed answer.
    const g = planar(
      { A: [0, 0], B: [6, 0], C: [6, 4], D: [0, 4], P: [20, 0], Q: [26, 0], R: [26, 4], S: [20, 4] },
      [['A', 'B'], ['B', 'C'], ['C', 'D'], ['D', 'A'], ['P', 'Q'], ['Q', 'R'], ['R', 'S'], ['S', 'P']],
    );
    const faces = tracePlanarFacesXZ(g);
    expect(sortedAreas(faces)).toEqual([-24, -24, 24, 24]);

    // POLICY A — one outer face for the whole graph. Exactly one, and the tie is broken
    // by the smallest node id, so it is the 'A'-cornered rectangle and never the 'P' one.
    const single = selectOuterFaceXZ(faces)!;
    expect(single.signedAreaM2).toBeCloseTo(-24, 9);
    expect([...single.nodeIds].sort()).toEqual(['A', 'B', 'C', 'D']);

    // POLICY B — one per connected component. Two components, two outer faces, in
    // ascending component-key order ('A' before 'P').
    const perComponent = selectOuterFacePerComponentXZ(g, faces);
    expect(perComponent).toHaveLength(2);
    expect(perComponent.map((f) => Number(f.signedAreaM2.toFixed(6)))).toEqual([-24, -24]);
    expect(perComponent.map((f) => [...f.nodeIds].sort().join(''))).toEqual(['ABCD', 'PQRS']);

    // The component key IS the lexicographically smallest node id — `buildings.ts` uses
    // it as the building id, so this is a contract, not an implementation detail.
    const comps = planarComponentsXZ(g);
    expect(comps.get('C')).toBe('A');
    expect(comps.get('S')).toBe('P');
  });
});
