import { describe, it, expect } from 'vitest';
import { insetPolygonToInnerFaces, polygonAreaM2, isSimple } from '../RoomPolygonUtils';
import type { RoomVertex } from '../RoomTypes';

/**
 * §FLOOR-INNER-FACE — the floor finish must stop at the room's INNER wall faces,
 * not span to the wall centrelines (which overlaps the neighbour under the
 * partition). insetPolygonToInnerFaces offsets each edge inward by the bounding
 * wall's half-thickness, mitering at corners.
 */
describe('insetPolygonToInnerFaces', () => {
  // A 4 m × 3 m room (centreline rect), CCW in world X-Z.
  const rect: RoomVertex[] = [
    { x: 0, z: 0 },
    { x: 4, z: 0 },
    { x: 4, z: 3 },
    { x: 0, z: 3 },
  ];

  it('insets all edges by half-thickness → inner rect shrinks by 2×inset on each axis', () => {
    // 0.10 m walls all round → inset 0.05 m per edge.
    const inner = insetPolygonToInnerFaces(rect, [0.05, 0.05, 0.05, 0.05]);
    // Expect a 3.9 × 2.9 rect: x ∈ [0.05, 3.95], z ∈ [0.05, 2.95].
    const xs = inner.map(v => v.x).sort((a, b) => a - b);
    const zs = inner.map(v => v.z).sort((a, b) => a - b);
    expect(xs[0]!).toBeCloseTo(0.05, 6);
    expect(xs[3]!).toBeCloseTo(3.95, 6);
    expect(zs[0]!).toBeCloseTo(0.05, 6);
    expect(zs[3]!).toBeCloseTo(2.95, 6);
    expect(polygonAreaM2(inner)).toBeCloseTo(3.9 * 2.9, 4);
  });

  it('keeps an edge on the centreline where its inset is 0 (door-gap → floors meet)', () => {
    // Edge 0 (z=0, the bottom wall) carries a door → inset 0; others inset 0.05.
    const inner = insetPolygonToInnerFaces(rect, [0, 0.05, 0.05, 0.05]);
    // The bottom edge must remain at z = 0 (reaches the centreline / threshold).
    const minZ = Math.min(...inner.map(v => v.z));
    expect(minZ).toBeCloseTo(0, 6);
    // The opposite (top) edge is still pulled in to z = 2.95.
    const maxZ = Math.max(...inner.map(v => v.z));
    expect(maxZ).toBeCloseTo(2.95, 6);
  });

  it('mixes per-edge thicknesses (thicker wall → larger inset on that edge)', () => {
    // Bottom edge backs a 0.30 m wall (inset 0.15); others 0.10 m (inset 0.05).
    const inner = insetPolygonToInnerFaces(rect, [0.15, 0.05, 0.05, 0.05]);
    const minZ = Math.min(...inner.map(v => v.z));
    expect(minZ).toBeCloseTo(0.15, 6);
  });

  it('fail-safe: a too-large inset that collapses the polygon returns the original', () => {
    // Inset 5 m on a 3 m-deep room → would invert; util returns the input ref.
    const inner = insetPolygonToInnerFaces(rect, [5, 5, 5, 5]);
    expect(inner).toBe(rect);
  });

  it('returns the input unchanged for a degenerate (<3 vertex) polygon', () => {
    const two: RoomVertex[] = [{ x: 0, z: 0 }, { x: 1, z: 0 }];
    expect(insetPolygonToInnerFaces(two, [0.05, 0.05])).toBe(two);
  });

  it('treats missing / NaN edge insets as 0', () => {
    const inner = insetPolygonToInnerFaces(rect, [0.05, NaN, 0.05, 0.05]);
    // Edge 1 (x = 4) had NaN → inset 0, so the right edge stays at x = 4.
    const maxX = Math.max(...inner.map(v => v.x));
    expect(maxX).toBeCloseTo(4, 6);
  });

  // ── §DIAG-FLOOR-INSET regression guards (2026-06-10) ─────────────────────────
  // The §FLOOR-INNER-FACE inset mitered each corner as the intersection of two
  // adjacent inward-offset edge lines. On a NON-orthogonal / shallow-angle corner
  // those two lines are near-parallel → their intersection shoots toward infinity
  // → one floor vertex lands hundreds of metres away (the founder's "spike"). The
  // fix clamps the miter (near-parallel OR implausibly-far) to a local bevel, and
  // a per-vertex sanity gate falls back to the centreline polygon if any vertex
  // still escapes — a slightly-too-large floor beats a spike.

  it('orthogonal rectangle is byte-identical to the pre-fix miter (regression guard)', () => {
    // 90° corners: |cross| = 1 ≫ the clamp eps, inner corner is inset·√2 ≈ 0.07 m
    // from the source corner — well inside the distance bound, so the EXACT miter
    // intersection is used (no bevel, no fall-back). The numbers below are the
    // analytic inner rect, so this pins the unchanged orthogonal behaviour.
    const inner = insetPolygonToInnerFaces(rect, [0.05, 0.05, 0.05, 0.05]);
    const byX = [...inner].sort((p, q) => p.x - q.x || p.z - q.z);
    // Two left verts at x=0.05, two right at x=3.95; z ∈ {0.05, 2.95}. These are
    // the EXACT miter intersection — the 90° corner takes the same branch pre/post
    // fix (|cross|=1 ≫ eps, corner ≈0.07 m from source ≪ bound), so the result is
    // identical to the pre-fix util (to float precision).
    expect(byX[0]!.x).toBeCloseTo(0.05, 10);
    expect(byX[1]!.x).toBeCloseTo(0.05, 10);
    expect(byX[2]!.x).toBeCloseTo(3.95, 10);
    expect(byX[3]!.x).toBeCloseTo(3.95, 10);
    const zs = inner.map(v => v.z).sort((a, b) => a - b);
    expect(zs[0]!).toBeCloseTo(0.05, 10);
    expect(zs[3]!).toBeCloseTo(2.95, 10);
  });

  it('shallow-angle parallelogram corner: inset stays FINITE & local (no spike)', () => {
    // A long, very flat parallelogram (rotated + sheared) — its acute corners have
    // near-parallel adjacent edges, the exact condition that produced the runaway
    // miter. CCW in world X-Z.
    const para: RoomVertex[] = [
      { x: 0, z: 0 },
      { x: 10, z: 0.3 },     // near-horizontal long edge
      { x: 10.3, z: 2 },
      { x: 0.3, z: 1.7 },
    ];
    const inset = 0.1;
    let diag = '';
    const inner = insetPolygonToInnerFaces(para, [inset, inset, inset, inset], (l) => { diag += l + '\n'; });
    // Every output vertex must be finite and within a sane bound of ITS source
    // corner — no vertex flung off into a spike.
    expect(inner.length).toBeGreaterThanOrEqual(3);
    const bound = Math.max(0.5, inset * 8) + 1e-6;
    for (let i = 0; i < inner.length; i++) {
      expect(Number.isFinite(inner[i]!.x)).toBe(true);
      expect(Number.isFinite(inner[i]!.z)).toBe(true);
      // inner[i] corresponds to para[i] (same corner count, no subdivision here).
      if (inner.length === para.length) {
        const d = Math.hypot(inner[i]!.x - para[i]!.x, inner[i]!.z - para[i]!.z);
        expect(d).toBeLessThanOrEqual(bound);
      }
    }
    // The result must NOT be larger than the source (it's an inset).
    expect(polygonAreaM2(inner)).toBeLessThanOrEqual(polygonAreaM2(para) + 1e-6);
  });

  it('extreme near-collinear spike corner: never NaN/Inf, floor still produced', () => {
    // A near-degenerate corner: vertex 1 is almost on the line 0→2, so its two
    // adjacent edges are ~collinear (|cross| ≈ 0). Pre-fix this divided by ~0 and
    // flung the corner far away. Must clamp/fall-back, never emit NaN/Inf, and
    // still return a usable (≥3 vert) polygon.
    const spikey: RoomVertex[] = [
      { x: 0, z: 0 },
      { x: 5, z: 0.001 },   // almost collinear with 0→2
      { x: 10, z: 0 },
      { x: 10, z: 4 },
      { x: 0, z: 4 },
    ];
    let fired = false;
    const inner = insetPolygonToInnerFaces(spikey, [0.05, 0.05, 0.05, 0.05, 0.05], (l) => {
      if (l.includes('§DIAG-FLOOR-INSET')) fired = true;
    });
    expect(fired).toBe(true);
    expect(inner.length).toBeGreaterThanOrEqual(3);
    for (const v of inner) {
      expect(Number.isFinite(v.x)).toBe(true);
      expect(Number.isFinite(v.z)).toBe(true);
      // No vertex hundreds of metres out.
      expect(Math.abs(v.x)).toBeLessThan(50);
      expect(Math.abs(v.z)).toBeLessThan(50);
    }
  });

  it('rotated axis-aligned rect (45°) insets without a spike', () => {
    // A square rotated 45° about the origin — every corner is still 90° so the
    // miter is well-conditioned, but the coordinates are non-axis-aligned (the
    // real generated-house case). Result must be a clean inset, no spike.
    const s = 3;
    const rot: RoomVertex[] = [
      { x: 0, z: -s },
      { x: s, z: 0 },
      { x: 0, z: s },
      { x: -s, z: 0 },
    ];
    const inner = insetPolygonToInnerFaces(rot, [0.05, 0.05, 0.05, 0.05]);
    expect(inner.length).toBe(4);
    for (const v of inner) {
      expect(Number.isFinite(v.x)).toBe(true);
      expect(Math.hypot(v.x, v.z)).toBeLessThan(s + 1); // stays near the square
    }
    expect(polygonAreaM2(inner)).toBeLessThan(polygonAreaM2(rot));
    expect(polygonAreaM2(inner)).toBeGreaterThan(0);
  });

  // ── §FLOOR-INSET-SIMPLE (2026-06-16) — the output must NEVER self-intersect ──────
  // A bevel fall-back on a near-collinear / heavily-subdivided ring (a rotated room
  // with several door gaps — the founder's Kitchen floor) can cross adjacent offset
  // edges into a BOW-TIE that keeps its winding sign and area-below-source, so it
  // passes every prior guard and ships as a diagonal triangular WEDGE. The util now
  // rejects a self-intersecting result → centreline fall-back. Invariant: for ANY
  // input + insets the returned polygon is SIMPLE (a valid inset OR the simple input).
  it('§FLOOR-INSET-SIMPLE: output is never self-intersecting (bow-tie → centreline)', () => {
    const cases: { poly: RoomVertex[]; insets: number[] }[] = [
      // Thin room: both long edges inset past each other → would fold.
      { poly: [{ x: 0, z: 0 }, { x: 6, z: 0 }, { x: 6, z: 0.5 }, { x: 0, z: 0.5 }], insets: [0.4, 0.4, 0.4, 0.4] },
      // Rotated rect with mixed large/zero insets (door gaps) — bevel-prone.
      { poly: [{ x: 0, z: 0 }, { x: 5, z: 1.8 }, { x: 3.2, z: 6.8 }, { x: -1.8, z: 5 }], insets: [0.15, 0, 0.15, 0] },
      // L-ish ring with a near-collinear vertex + door gaps.
      { poly: [{ x: 0, z: 0 }, { x: 4, z: 0.02 }, { x: 8, z: 0 }, { x: 8, z: 3 }, { x: 0, z: 3 }], insets: [0.1, 0.1, 0, 0.1, 0.1] },
    ];
    for (const { poly, insets } of cases) {
      const r = insetPolygonToInnerFaces(poly, insets);
      expect(isSimple(r)).toBe(true);                 // never ships a bow-tie
      expect(polygonAreaM2(r)).toBeGreaterThan(0);
    }
  });

  // ── §FLOOR-INSET-COLLAPSE (2026-06-16) — door-gap bow-tie → INNER-FACE inset ────
  // The live defect: a ROTATED room whose centreline boundary was subdivided at a
  // DOOR GAP. `CreateFloorsByRoomTypeCommand._innerFacePolygon` splits a straight
  // wall edge at the opening, inserting COLLINEAR intermediate vertices whose two
  // adjacent edges are exactly collinear but carry DIFFERENT insets (wall
  // half-thickness on the solid run, 0 across the door gap). On a rotated/irregular
  // room the per-corner bevel fall-back at those inset-transition vertices folds the
  // offset edges into a self-intersecting BOW-TIE, which §FLOOR-INSET-SIMPLE
  // correctly rejects → the OVERSIZED CENTRELINE floor shipped (overlapping the
  // neighbour under the partition). The live log was:
  //   room "Kitchen" §DIAG-FLOOR-INSET self-intersecting (bow-tie) → centreline fall-back
  //   room "Kitchen" boundary=centreline ⚠ (inset collapsed) edges=…/7 door-gaps=1
  //
  // These three rings are FAITHFUL synthetic reproductions of that shape, captured by
  // a probe over rotated (20–45°) irregular rooms subdivided at one forward door gap
  // (collinear inset-transition verts, exactly as the command builds). On the PRE-FIX
  // util every one of these fell back to the centreline source (verified: the util
  // returned the input polygon reference, area == source). The fix retries on a
  // collinear-collapsed ring (collinear runs merged to one edge carrying the wall's
  // MAX inset), so the floor now insets to the inner face (area STRICTLY < centreline).

  // Live-like Kitchen: ~19 m² room, 5-corner irregular base, rotated ≈28.5°, ONE
  // door gap on a wall (inset 0 between two half-thickness solid runs) → 7 ring edges.
  const liveKitchenRing: RoomVertex[] = [
    { x: 0, z: 0 },
    { x: 5.8154, z: 2.9283 },
    { x: 0.5833, z: 4.459 },
    { x: 3.7579, z: 6.8688 },
    { x: 2.9181, z: 6.413 },   // ── door run: this + next form the inset-0 gap
    { x: 0.964, z: 5.3524 },
    { x: -1.9304, z: 3.7815 },
  ];
  const liveKitchenInsets = [0.15, 0.15, 0.15, 0.15, 0, 0.15, 0.15];

  it('§FLOOR-INSET-COLLAPSE: door-gap bow-tie on a rotated room INSETS (not centreline)', () => {
    const centreArea = polygonAreaM2(liveKitchenRing);
    let diag = '';
    const inner = insetPolygonToInnerFaces(liveKitchenRing, liveKitchenInsets, (l) => { diag += l + '\n'; });

    // §FIX-FLOOR-FINISH-CURVED-COVERAGE (2026-08-10) — these two lines USED to assert the
    // internal ROUTE: "bow-tie guard fires, collinear-collapse retry rescues it". They no
    // longer hold, and that is the fix, not a regression: the miter clamp now emits a
    // two-point CHAMFER (each point exactly on its own offset line) instead of a one-point
    // bevel (on neither), so the adjacent joins no longer cross and the DIRECT pass returns
    // a clean inner-face inset — the retry is never needed. Asserting a fall-back route is
    // asserting that the primary path is broken; the invariant worth pinning is the RESULT
    // below, which is unchanged and now reached one step earlier.
    expect(diag).not.toMatch(/centreline fall-back/);

    // The result is a genuine INNER-FACE inset — NOT the centreline fall-back.
    expect(inner).not.toBe(liveKitchenRing);          // not the same-ref fail-safe
    expect(isSimple(inner)).toBe(true);               // simple ring, no wedge
    const innerArea = polygonAreaM2(inner);
    expect(innerArea).toBeGreaterThan(0);
    expect(innerArea).toBeLessThan(centreArea);        // an inset shrinks the floor
    // A ~0.15 m half-thickness inset trims only a modest slice — the floor must NOT
    // collapse to a sliver (that would be a different, also-wrong, failure).
    expect(innerArea).toBeGreaterThan(0.5 * centreArea);
  });

  it('§FLOOR-INSET-COLLAPSE: more rotated door-gap repros all inset below centreline', () => {
    const repros: { ring: RoomVertex[]; insets: number[] }[] = [
      {
        // ≈44°, ~4.45 m², 0.10 m walls, one door gap (edge 3 inset 0).
        ring: [
          { x: 0, z: 0 }, { x: 3.1536, z: 3.3914 }, { x: 0.5721, z: 2.1749 },
          { x: 1.3861, z: 3.1185 }, { x: 1.8163, z: 3.6171 }, { x: 2.4592, z: 4.3623 },
          { x: -0.9761, z: 1.0441 },
        ],
        insets: [0.1, 0.1, 0.1, 0, 0.1, 0.1, 0.1],
      },
      {
        // ≈20.6°, ~8.92 m², 0.15 m walls, one door gap (edge 3 inset 0).
        ring: [
          { x: 0, z: 0 }, { x: 4.6045, z: 1.9757 }, { x: 1.4432, z: 2.8619 },
          { x: 2.3102, z: 3.352 }, { x: 2.6789, z: 3.5603 }, { x: 3.6195, z: 4.092 },
          { x: -0.7614, z: 2.4458 },
        ],
        insets: [0.15, 0.15, 0.15, 0, 0.15, 0.15, 0.15],
      },
    ];
    for (const { ring, insets } of repros) {
      const centreArea = polygonAreaM2(ring);
      let diag = '';
      const inner = insetPolygonToInnerFaces(ring, insets, (l) => { diag += l + '\n'; });
      // See the note above: the chamfer join resolves these on the DIRECT pass, so the
      // bow-tie route is no longer taken. Pin the outcome, not the route.
      expect(diag).not.toMatch(/centreline fall-back/);
      expect(inner).not.toBe(ring);                    // genuinely inset
      expect(isSimple(inner)).toBe(true);
      expect(polygonAreaM2(inner)).toBeLessThan(centreArea);
      expect(polygonAreaM2(inner)).toBeGreaterThan(0);
    }
  });

  it('§FLOOR-INSET-COLLAPSE: still falls back to centreline when no clean inset exists', () => {
    // A genuinely fold-prone sliver (the 6 m × 0.5 m thin room with a 0.4 m inset):
    // even after collinear collapse there is no simple smaller inset, so the util
    // MUST keep the centreline ring (a floor is ALWAYS produced — never lost).
    const thin: RoomVertex[] = [
      { x: 0, z: 0 }, { x: 6, z: 0 }, { x: 6, z: 0.5 }, { x: 0, z: 0.5 },
    ];
    const r = insetPolygonToInnerFaces(thin, [0.4, 0.4, 0.4, 0.4]);
    expect(r).toBe(thin);                              // centreline fail-safe ref
    expect(isSimple(r)).toBe(true);
  });
});
