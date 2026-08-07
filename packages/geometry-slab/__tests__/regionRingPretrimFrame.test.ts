import { describe, it, expect } from 'vitest';
import { findRingSelfIntersection } from '@pryzm/core-app-model/ring-simplicity';
import {
  wallPlanCenterline,
  findRegionAtPoint,
  polygonArea,
  type RegionPoint2D,
  type RegionWallLike,
} from '../src/SlabRegionTracer';

/**
 * §FIX-REGION-RING-PRETRIM-FRAME (founder, 2026-08-07)
 *
 *   "YOU FIXED THE ISSUE — NOW THE ROOF BY REGION COVERED ALL THE AREA. HOWEVER,
 *    AS YOU CAN SEE, THE GEOMETRY DOESN'T LOOK ORGANIC AND RIGHT."
 *
 * Element SB002, slab, 77 polygon vertices: in 3D the top surface is faceted into
 * huge flat panels with dark wedge-shaped notches punched through it.
 *
 * THREE CAUSES WERE ON THE TABLE. This file settled which, with numbers, and now
 * also holds the fix.
 *
 *   (1) FAN TRIANGULATION OF A CONCAVE POLYGON — REFUTED by inspection AND by the
 *       concavity test below. `SlabFragmentBuilder` uses
 *       `THREE.ShapeUtils.triangulateShape`, which is earcut, not a fan, and earcut
 *       handles concave rings correctly.
 *   (2) A DEGENERATE / SELF-INTERSECTING BOUNDARY GOING IN — CONFIRMED, below.
 *       Earcut's contract REQUIRES a simple ring; given a self-intersecting one it
 *       emits triangles that fall OUTSIDE the polygon, which is precisely what a
 *       dark wedge punched through a surface looks like.
 *   (3) WINDING / NORMALS — not needed to explain the artefacts once (2) holds, and
 *       (2) also explains the faceting, which a normals bug would not.
 *
 * ROOT CAUSE — the SAME defect already fixed once, in a second consumer that was
 * never migrated. `SlabRegionTracer.wallPlanCenterline` tessellated a curved wall
 * as a quadratic Bézier `baseLine[0] → curve.control → baseLine[1]`, where
 * `baseLine` is POST-trim (the join resolver shortened it) and `curve.control` is
 * PRE-trim. That mixed frame is a DIFFERENT CURVE from the authored arc — exactly
 * §FIX-CURVED-WALL-PRETRIM-FRAME, which was fixed in `RoomDetectionEngine`
 * (ba7ee582) while this tracer kept the old maths. The mis-fitted arc bulges past
 * its neighbours, the traced ring crosses itself, and earcut then produces wedges.
 *
 * THE FIX (this commit): `wallPlanCenterline` now takes the archived PRE-trim
 * baseline (`WallData._sourceBaseLine`, which the callers were already carrying and
 * only the TYPE omitted) and routes through the shared
 * `tessellateCurvedWallForTopology` — sample the arc in the frame it was authored
 * in, then CLIP to the post-trim span. The trim is still honoured exactly; only the
 * SHAPE between the ends is restored.
 *
 * ── HOW THIS FILE IS STRUCTURED, AND WHY ─────────────────────────────────────
 * The REGRESSION block below reproduces the OLD maths by calling the tracer WITHOUT
 * a `_sourceBaseLine` — which is not a contrivance, it is the genuine fallback path
 * (no archived pre-trim baseline ⇒ pre-trim ≡ post-trim) and therefore exactly the
 * pre-fix computation. It asserts the defect is real and large (>200 mm, and an
 * OVERSHOOT). The FIX block then feeds the same wall WITH its pre-trim baseline and
 * asserts closeness. Same inputs, same measure, opposite verdicts: that is what
 * makes these assertions evidence rather than decoration.
 *
 * NOTE ON CONVENTIONS, which cost this file a debugging round: the tracer takes
 * wall baselines as `{x, z}` but RETURNS `RegionPoint2D` as `{x, y}` where `y`
 * carries world Z. Both appear below, deliberately, and are commented at each use.
 */

// ── Helpers. `RegionPoint2D` is {x, y=worldZ}. ────────────────────────────────

/** Do segments a→b and c→d properly cross (endpoints excluded)? */
function segsCross(a: RegionPoint2D, b: RegionPoint2D, c: RegionPoint2D, d: RegionPoint2D): boolean {
  const o = (p: RegionPoint2D, q: RegionPoint2D, r: RegionPoint2D) =>
    Math.sign((q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x));
  const o1 = o(a, b, c), o2 = o(a, b, d), o3 = o(c, d, a), o4 = o(c, d, b);
  return o1 !== 0 && o2 !== 0 && o3 !== 0 && o4 !== 0 && o1 !== o2 && o3 !== o4;
}

/** How many times the closed ring crosses itself. 0 ⇒ earcut's precondition holds. */
function countSelfIntersections(ring: ReadonlyArray<RegionPoint2D>): number {
  const n = ring.length;
  let hits = 0;
  for (let i = 0; i < n; i++) {
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue;   // adjacent across the closing edge
      if (segsCross(ring[i]!, ring[(i + 1) % n]!, ring[j]!, ring[(j + 1) % n]!)) hits++;
    }
  }
  return hits;
}

/** Sample a quadratic Bézier in {x, y=worldZ}. */
function sampleArc(s: RegionPoint2D, c: RegionPoint2D, e: RegionPoint2D, n: number): RegionPoint2D[] {
  const out: RegionPoint2D[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, a = (1 - t) * (1 - t), b = 2 * (1 - t) * t, d = t * t;
    out.push({ x: a * s.x + b * c.x + d * e.x, y: a * s.y + b * c.y + d * e.y });
  }
  return out;
}

/** Max distance from each point of `poly` to the reference polyline. */
function maxDeviation(poly: ReadonlyArray<RegionPoint2D>, ref: ReadonlyArray<RegionPoint2D>): number {
  let worst = 0;
  for (const p of poly) {
    let best = Infinity;
    for (const q of ref) best = Math.min(best, Math.hypot(p.x - q.x, p.y - q.y));
    worst = Math.max(worst, best);
  }
  return worst;
}

// ── The founder's case: a strongly curved wall whose ends the resolver trimmed ──
const PRE_START = { x: 0, y: 0 };
const PRE_END = { x: 10, y: 0 };
const CONTROL = { x: 5, y: 9 };
const TRUE_ARC = sampleArc(PRE_START, CONTROL, PRE_END, 400);
const POST_START = TRUE_ARC[Math.round(400 * 0.06)]!;
const POST_END = TRUE_ARC[Math.round(400 * 0.94)]!;

/** The tracer's INPUT convention is {x, z}. */
const asBaseline = (p: RegionPoint2D) => ({ x: p.x, z: p.y });

/** The trimmed wall, as the tracer now receives it. */
const POST_BASELINE = [asBaseline(POST_START), asBaseline(POST_END)];
const PRE_BASELINE = [asBaseline(PRE_START), asBaseline(PRE_END)];
const CURVE = { control: asBaseline(CONTROL), segments: 24 };

/**
 * A region bounded by the curved wall plus three straight ones. The straight
 * neighbour runs at y = 4.75 — ABOVE the authored arc's apex (4.5) and BELOW the
 * mixed-frame arc's apex (≈5.01). That 0.25 m band is the whole defect made
 * geometric: the correct arc clears the neighbour, the overshooting one does not.
 */
function regionRingFrom(arc: ReadonlyArray<RegionPoint2D>): RegionPoint2D[] {
  return [
    ...arc,
    { x: 11, y: POST_END.y },
    { x: 11, y: 4.75 },
    { x: -1, y: 4.75 },
    { x: -1, y: POST_START.y },
  ];
}

describe('§FIX-REGION-RING-PRETRIM-FRAME — cause (2): is the region ring simple?', () => {

  describe('REGRESSION — the OLD maths (mixed pre/post-trim frame) is not the authored arc', () => {
    // No `_sourceBaseLine` ⇒ the tracer samples in the post-trim frame with the
    // pre-trim control point. That IS the pre-fix computation.
    const old = wallPlanCenterline(POST_BASELINE, CURVE);

    it('the traced centreline departs from the true arc by hundreds of mm', () => {
      expect(old.length).toBeGreaterThan(2);
      const devMm = maxDeviation(old, TRUE_ARC) * 1000;
      // The same order as the 847/952/923 mm loop-break gaps in the founder's log,
      // and far beyond any junction snap radius.
      expect(devMm).toBeGreaterThan(200);
    });

    it('the departure is an OVERSHOOT — the arc bulges past where neighbours expect it', () => {
      expect(Math.max(...old.map(p => p.y)))
        .toBeGreaterThan(Math.max(...TRUE_ARC.map(p => p.y)));
    });

    it('MEASURED: the ring built on that overshoot SELF-INTERSECTS', () => {
      // Crossings here are what make earcut emit triangles OUTSIDE the polygon —
      // the dark wedges punched through the founder's roof surface.
      expect(countSelfIntersections(regionRingFrom(old))).toBeGreaterThan(0);
    });
  });

  describe('FIXED — sampled in the PRE-TRIM frame and clipped to the post-trim span', () => {
    const fixed = wallPlanCenterline(POST_BASELINE, CURVE, PRE_BASELINE);

    it('the traced centreline now FOLLOWS the authored arc (tessellation error only)', () => {
      expect(fixed.length).toBeGreaterThan(2);
      const devMm = maxDeviation(fixed, TRUE_ARC) * 1000;
      // Floored by the 400-sample reference polyline's own discretisation, not by
      // the tracer. Compare with >200 mm for the same wall in the REGRESSION block.
      expect(devMm).toBeLessThan(30);
    });

    it('no overshoot — the arc no longer bulges past the authored one', () => {
      expect(Math.max(...fixed.map(p => p.y)))
        .toBeLessThanOrEqual(Math.max(...TRUE_ARC.map(p => p.y)) + 1e-9);
    });

    it('the TRIM is still honoured exactly — the ring starts and ends on the resolver\'s endpoints', () => {
      // Only the SHAPE between the ends is restored; the junction points are the
      // resolver's, so the wall still meets its neighbours where it is joined.
      expect(fixed[0]!.x).toBeCloseTo(POST_START.x, 12);
      expect(fixed[0]!.y).toBeCloseTo(POST_START.y, 12);
      expect(fixed[fixed.length - 1]!.x).toBeCloseTo(POST_END.x, 12);
      expect(fixed[fixed.length - 1]!.y).toBeCloseTo(POST_END.y, 12);
    });

    it('earcut\'s precondition now HOLDS — the same region ring is SIMPLE', () => {
      const ring = regionRingFrom(fixed);
      expect(countSelfIntersections(ring)).toBe(0);
      expect(findRingSelfIntersection(ring)).toBeNull();
      expect(Math.abs(polygonArea(ring))).toBeGreaterThan(0);
    });

    it('the whole wall traces end to end through wallsToSegments / findRegionAtPoint', () => {
      // The real entry point, with a real wall record — proving the pre-trim
      // baseline actually reaches the tessellation and is not just parameter-passed.
      const walls: RegionWallLike[] = [
        { baseLine: POST_BASELINE, _sourceBaseLine: PRE_BASELINE, curve: CURVE },
        { baseLine: [asBaseline(POST_END), { x: 11, z: POST_END.y }] },
        { baseLine: [{ x: 11, z: POST_END.y }, { x: 11, z: 4.75 }] },
        { baseLine: [{ x: 11, z: 4.75 }, { x: -1, z: 4.75 }] },
        { baseLine: [{ x: -1, z: 4.75 }, { x: -1, z: POST_START.y }] },
        { baseLine: [{ x: -1, z: POST_START.y }, asBaseline(POST_START)] },
      ];
      // Inside the band the ring encloses — ABOVE the arc, below the y=4.75
      // neighbour. (5, 3) would be UNDER the arc, i.e. outside this region.
      const ring = findRegionAtPoint(walls, 10.5, 3);
      expect(ring).not.toBeNull();
      expect(countSelfIntersections(ring!)).toBe(0);
    });
  });

  describe('CAUSE (1) REFUTED — concavity alone is not the fault', () => {
    it('a concave, re-entrant L is SIMPLE, so earcut triangulates it correctly', () => {
      // The exact shape a naive FAN from one hub would break on.
      const L: RegionPoint2D[] = [
        { x: 0, y: 0 }, { x: 6, y: 0 }, { x: 6, y: 3 },
        { x: 3, y: 3 }, { x: 3, y: 6 }, { x: 0, y: 6 },
      ];
      expect(countSelfIntersections(L)).toBe(0);
      expect(findRingSelfIntersection(L)).toBeNull();
      expect(Math.abs(polygonArea(L))).toBeCloseTo(27, 6);
    });
  });

  describe('an UNTRIMMED curved wall is unaffected — the defect requires a trim', () => {
    it('tracing the authored endpoints reproduces the authored arc', () => {
      const traced = wallPlanCenterline(PRE_BASELINE, CURVE);
      expect(maxDeviation(traced, TRUE_ARC) * 1000).toBeLessThan(30);
    });

    it('a pre-trim baseline EQUAL to the post-trim one is bit-identical to omitting it', () => {
      // The provable no-change guarantee for every wall the resolver never touched.
      const without = wallPlanCenterline(PRE_BASELINE, CURVE);
      const with_ = wallPlanCenterline(PRE_BASELINE, CURVE, PRE_BASELINE);
      expect(with_).toEqual(without);
    });
  });

  describe('no regression on straight-walled regions', () => {
    it('traces a simple ring of the right area', () => {
      const walls: RegionWallLike[] = [
        { baseLine: [{ x: 0, z: 0 }, { x: 8, z: 0 }] },
        { baseLine: [{ x: 8, z: 0 }, { x: 8, z: 5 }] },
        { baseLine: [{ x: 8, z: 5 }, { x: 0, z: 5 }] },
        { baseLine: [{ x: 0, z: 5 }, { x: 0, z: 0 }] },
      ];
      const ring = findRegionAtPoint(walls, 4, 2.5);
      expect(ring).not.toBeNull();
      expect(countSelfIntersections(ring!)).toBe(0);
      expect(Math.abs(polygonArea(ring!))).toBeCloseTo(40, 6);
    });
  });

  /**
   * §REFUSE-NONSIMPLE-SLAB-RING (ADR-0299 §RECOVERY-MUST-REFUSE) — the guard the
   * fix above is supposed to make unnecessary, and which ships anyway because
   * "should now be simple" is not a guarantee. `SlabFragmentBuilder` calls
   * `findRingSelfIntersection` before `THREE.ShapeUtils.triangulateShape` and
   * refuses (loud `console.error`, degraded box, `userData.degraded`) rather than
   * emitting triangles outside the polygon.
   */
  describe('the downstream guard reports WHICH edges cross, not just that some do', () => {
    it('names the offending edge pair on a bow-tie', () => {
      const bowTie: RegionPoint2D[] = [
        { x: 0, y: 0 }, { x: 4, y: 4 }, { x: 4, y: 0 }, { x: 0, y: 4 },
      ];
      const hit = findRingSelfIntersection(bowTie);
      expect(hit).not.toBeNull();
      // Edge 0→1 crosses edge 2→3. A refusal that can name this is actionable;
      // "the ring is bad" is not.
      expect(hit).toEqual({ i: 0, j: 2 });
    });
  });
});
