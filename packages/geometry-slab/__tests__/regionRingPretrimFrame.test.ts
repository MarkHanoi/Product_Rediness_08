import { describe, it, expect } from 'vitest';
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
 * THREE CAUSES WERE ON THE TABLE. This file settles which, with numbers.
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
 * ROOT CAUSE — the SAME defect I already fixed once, in a second consumer that was
 * never migrated. `SlabRegionTracer.wallPlanCenterline` tessellates a curved wall
 * as a quadratic Bézier `baseLine[0] → curve.control → baseLine[1]`, where
 * `baseLine` is POST-trim (the join resolver shortened it) and `curve.control` is
 * PRE-trim. That mixed frame is a DIFFERENT CURVE from the authored arc — exactly
 * §FIX-CURVED-WALL-PRETRIM-FRAME, which was fixed in `RoomDetectionEngine`
 * (ba7ee582) while this tracer kept the old maths. The mis-fitted arc bulges past
 * its neighbours, the traced ring crosses itself, and earcut then produces wedges.
 *
 * The founder's log corroborates: `unresolvedLoopBreaks=6` with 847 mm / 952 mm /
 * 923 mm gaps between sub-segments of SINGLE walls — impossible by construction,
 * and the same signature as the 599 mm tear behind the floor-finish chord.
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

describe('§FIX-REGION-RING-PRETRIM-FRAME — cause (2): is the region ring simple?', () => {

  describe('CONFIRMED — the mixed-frame arc is not the authored arc', () => {
    it('the traced centreline departs from the true arc by hundreds of mm', () => {
      const traced = wallPlanCenterline(
        [asBaseline(POST_START), asBaseline(POST_END)],
        { control: asBaseline(CONTROL), segments: 24 },
      );
      expect(traced.length).toBeGreaterThan(2);
      const devMm = maxDeviation(traced, TRUE_ARC) * 1000;
      // The same order as the 847/952/923 mm loop-break gaps in the founder's log,
      // and far beyond any junction snap radius.
      expect(devMm).toBeGreaterThan(200);
    });

    it('the departure is an OVERSHOOT — the arc bulges past where neighbours expect it', () => {
      const traced = wallPlanCenterline(
        [asBaseline(POST_START), asBaseline(POST_END)],
        { control: asBaseline(CONTROL), segments: 24 },
      );
      expect(Math.max(...traced.map(p => p.y)))
        .toBeGreaterThan(Math.max(...TRUE_ARC.map(p => p.y)));
    });
  });

  describe('the consequence — earcut\'s precondition is violated', () => {
    it('a correctly traced region is SIMPLE (0 crossings) — the precondition, stated', () => {
      const good: RegionPoint2D[] = [
        ...sampleArc(POST_START, { x: 5, y: 7.4 }, POST_END, 24),
        { x: POST_END.x, y: -4 },
        { x: POST_START.x, y: -4 },
      ];
      expect(countSelfIntersections(good)).toBe(0);
      expect(Math.abs(polygonArea(good))).toBeGreaterThan(0);
    });

    it('MEASURED: a mixed-frame ring self-intersects once the bulge sweeps a neighbour', () => {
      const bulged = wallPlanCenterline(
        [asBaseline(POST_START), asBaseline(POST_END)],
        { control: asBaseline({ x: 5, y: 26 }), segments: 24 },
      );
      const ring: RegionPoint2D[] = [
        ...bulged,
        { x: POST_END.x + 6, y: 8 },
        { x: POST_START.x - 6, y: 8 },
      ];
      // Crossings here are what make earcut emit triangles OUTSIDE the polygon —
      // the dark wedges punched through the founder's roof surface.
      expect(countSelfIntersections(ring)).toBeGreaterThan(0);
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
      expect(Math.abs(polygonArea(L))).toBeCloseTo(27, 6);
    });
  });

  describe('an UNTRIMMED curved wall is unaffected — the defect requires a trim', () => {
    it('tracing the authored endpoints reproduces the authored arc', () => {
      const traced = wallPlanCenterline(
        [asBaseline(PRE_START), asBaseline(PRE_END)],
        { control: asBaseline(CONTROL), segments: 24 },
      );
      expect(maxDeviation(traced, TRUE_ARC) * 1000).toBeLessThan(30);
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
});
