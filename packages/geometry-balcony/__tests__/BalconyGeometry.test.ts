// §FEAT-BALCONY-COMPOUND (L-5600) — the free-edge rule and the host rectangle.
//
// ⭐ THE PROPERTY UNDER TEST IS THE ONE THE FOUNDER ASKED FOR IN HIS LAST SENTENCE:
// *"the user could after change the shape, and the floor finish and railings should
//  adapt."* The railing "adapting" is exactly this file: which edges are FREE after
// an arbitrary reshape. The two silently-wrong outcomes are (a) all edges railed,
// which seals the balcony off from its own doorway, and (b) no edges railed, which
// leaves an unguarded drop. Both are pinned below.

import { describe, expect, it } from 'vitest';
import {
  HOST_EDGE_TOLERANCE_M,
  balconyEdges,
  balconyPlanArea,
  balconyRectangle,
  distanceToSegment,
  resolveFreeEdges,
  type BalconyVertex,
  type HostWallSegment,
} from '../src/index.js';

/** A 6 m wall running along the X axis at z = 0. */
const HOST: HostWallSegment = { a: { x: 0, z: 0 }, b: { x: 6, z: 0 } };

/** The founder's default: 1.0 m along the wall x 0.5 m out, starting 2 m along. */
const DEFAULT_RING = balconyRectangle(HOST, 2, 1.0, 0.5, { x: 3, z: 5 });

describe('balconyRectangle — the default outline', () => {
  it('G-1: places a 1.0 x 0.5 rectangle at the requested offset, host edge FIRST', () => {
    expect(DEFAULT_RING).toHaveLength(4);
    // innerLeft, innerRight — on the wall centreline, 1.0 m apart.
    expect(DEFAULT_RING[0]).toMatchObject({ x: 2, z: 0 });
    expect(DEFAULT_RING[1]).toMatchObject({ x: 3, z: 0 });
    // outerRight, outerLeft — 0.5 m out, on the cursor's side.
    expect(DEFAULT_RING[2]!.z).toBeCloseTo(0.5, 9);
    expect(DEFAULT_RING[3]!.z).toBeCloseTo(0.5, 9);
    expect(balconyPlanArea(DEFAULT_RING)).toBeCloseTo(0.5, 9);
  });

  it('G-2: projects TOWARDS the reference point, on EITHER side of the wall', () => {
    // The residential generator names this the spike risk verbatim: "a backwards
    // normal puts the balcony INSIDE the building". Both sides, one function.
    const north = balconyRectangle(HOST, 2, 1, 0.5, { x: 3, z: 5 });
    const south = balconyRectangle(HOST, 2, 1, 0.5, { x: 3, z: -5 });
    expect(north[2]!.z).toBeGreaterThan(0);
    expect(south[2]!.z).toBeLessThan(0);
    // ...and both are the same 0.5 m2 balcony, just mirrored.
    expect(balconyPlanArea(north)).toBeCloseTo(balconyPlanArea(south), 9);
  });

  it('G-3: works on a wall at any angle, not just the axes', () => {
    const diagonal: HostWallSegment = { a: { x: 0, z: 0 }, b: { x: 4, z: 4 } };
    const ring = balconyRectangle(diagonal, 1, 1, 0.5, { x: -5, z: 5 });
    expect(balconyPlanArea(ring)).toBeCloseTo(0.5, 6);
    // The inner edge still lies ON the wall centreline.
    expect(distanceToSegment(ring[0]!, diagonal.a, diagonal.b)).toBeLessThan(1e-9);
    expect(distanceToSegment(ring[1]!, diagonal.a, diagonal.b)).toBeLessThan(1e-9);
  });

  it('G-4: REFUSES a degenerate host rather than emitting a zero-width balcony', () => {
    // A zero-length wall has no direction, so "1 m along it" is not a location.
    // Silently producing a collapsed rectangle would be the silently-wrong element
    // this repo forbids by name.
    expect(() =>
      balconyRectangle({ a: { x: 1, z: 1 }, b: { x: 1, z: 1 } }, 0, 1, 0.5, { x: 2, z: 2 }),
    ).toThrow(/degenerate/i);
  });
});

describe('resolveFreeEdges — which edges carry a railing', () => {
  it('F-1: the default rectangle rails THREE edges — the outer U, host edge open', () => {
    // This is `ResidentialBuildingExecutor._createBalconies`'s shipped rule, stated
    // as a measurement rather than as an index: "the wall-facing edge stays OPEN as
    // the access from the room".
    const free = resolveFreeEdges(DEFAULT_RING, HOST);
    expect(free).toHaveLength(3);
    expect(free.map((e) => e.index)).toEqual([1, 2, 3]);
    // ...and the one edge NOT railed is the one on the wall.
    const all = balconyEdges(DEFAULT_RING);
    const omitted = all.find((e) => !free.some((f) => f.index === e.index))!;
    expect(distanceToSegment(omitted.a, HOST.a, HOST.b)).toBeLessThan(1e-9);
    expect(distanceToSegment(omitted.b, HOST.a, HOST.b)).toBeLessThan(1e-9);
  });

  it('F-2: ⭐ a RESHAPED balcony re-measures — the index-based rule would fail here', () => {
    // The user drags the outer edge into an L: five vertices, and the host edge is
    // NO LONGER edge 0 after the re-ordering a real editor can produce. An index
    // recorded at creation would now name the wrong edge and draw a rail across the
    // doorway. Measuring finds the wall wherever it is.
    const reshaped: BalconyVertex[] = [
      { x: 3, y: 0, z: 0.5 }, //   v0 outer-right
      { x: 3.6, y: 0, z: 1.2 }, // v1 pulled out
      { x: 2, y: 0, z: 1.2 }, //   v2
      { x: 2, y: 0, z: 0 }, //     v3 ON THE WALL
      { x: 3, y: 0, z: 0 }, //     v4 ON THE WALL
    ];
    const free = resolveFreeEdges(reshaped, HOST);
    // e3 (v3→v4) is the only edge with BOTH endpoints on the wall. e2 and e4 each
    // touch it at ONE end and are still free.
    expect(free).toHaveLength(4);
    // ⭐ The host edge is index 3 here, NOT 0. A `hostEdgeIndex: 0` recorded at
    // creation would have named e0 — an outer edge — and the railing would have been
    // omitted from the drop and drawn across the doorway instead.
    expect(free.map((e) => e.index)).toEqual([0, 1, 2, 4]);
  });

  it('F-3: an edge with only ONE endpoint on the wall is still railed', () => {
    // The two SIDE edges of the default rectangle each touch the wall at one corner.
    // A midpoint-only test would drop them and leave two unguarded sides.
    const free = resolveFreeEdges(DEFAULT_RING, HOST);
    const sideEdges = free.filter(
      (e) =>
        distanceToSegment(e.a, HOST.a, HOST.b) < 1e-9 || distanceToSegment(e.b, HOST.a, HOST.b) < 1e-9,
    );
    expect(sideEdges).toHaveLength(2);
  });

  it('F-4: NO host = railed all round — the safe answer, not the convenient one', () => {
    const free = resolveFreeEdges(DEFAULT_RING, undefined);
    expect(free).toHaveLength(4);
  });

  it('F-5: never returns ZERO free edges for a real balcony against a real wall', () => {
    // "no edges railed" is the outcome that leaves an unguarded drop. There is no
    // input shape below that can produce it.
    for (const offset of [0, 1, 2.5, 5]) {
      for (const proj of [0.3, 0.5, 1.4, 3]) {
        const ring = balconyRectangle(HOST, offset, 1, proj, { x: 3, z: 9 });
        expect(resolveFreeEdges(ring, HOST).length).toBeGreaterThan(0);
      }
    }
  });

  it('F-6: never returns EVERY edge when a host really is under one of them', () => {
    // "all edges railed" seals the balcony off from its own doorway.
    for (const offset of [0, 1, 2.5, 5]) {
      const ring = balconyRectangle(HOST, offset, 1, 0.5, { x: 3, z: 9 });
      expect(resolveFreeEdges(ring, HOST).length).toBeLessThan(balconyEdges(ring).length);
    }
  });

  it('F-7: the tolerance swallows half a thick wall but not a deliberate pull-away', () => {
    // Inner edge nudged 0.1 m off the centreline — still inside a 0.4 m wall, so
    // still the host edge.
    const nudged = DEFAULT_RING.map((p) => ({ ...p, z: p.z + 0.1 }));
    expect(resolveFreeEdges(nudged, HOST)).toHaveLength(3);
    // Pulled a clear metre away — the balcony is no longer against the wall there,
    // so that edge genuinely IS free and must be guarded.
    const pulled = DEFAULT_RING.map((p) => ({ ...p, z: p.z + 1 }));
    expect(HOST_EDGE_TOLERANCE_M).toBeLessThan(1);
    expect(resolveFreeEdges(pulled, HOST)).toHaveLength(4);
  });
});
