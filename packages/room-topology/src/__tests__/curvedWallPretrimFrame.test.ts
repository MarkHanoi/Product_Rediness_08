import { describe, it, expect } from 'vitest';
import {
  clipPolylineToSpan,
  tessellateCurvedWallForTopology,
  baseWallId,
  type TessPoint,
} from '../curvedWallTessellation';

/**
 * §FIX-CURVED-WALL-PRETRIM-FRAME (founder, 2026-08-07 — reported THREE times)
 *
 * "Using FLOOR FINISH AUTO in areas where one or multiple walls are CURVED — a thin
 *  STRAIGHT line cuts diagonally across the corner, inside the arc."
 *
 * The defect is NOT in the floor tool. `RoomDetectionEngine` tessellated a curved
 * wall by fitting a quadratic Bézier through the wall's POST-TRIM endpoints while
 * still using the PRE-TRIM control point — a different curve from the authored arc,
 * diverging most near the ends. The mis-fitted tail then read as a dangling
 * partition end and `§DIAG-PARTITION-REACH` "recovered" it onto its own parent's
 * previous sub-segment, writing the straight chord into the room ring.
 *
 * `PRE_TRIM_IS_THE_BUG` below is the regression: it computes the ring the OLD way
 * and asserts the defect is present, so the test suite demonstrates the failure it
 * is protecting against rather than merely blessing the new behaviour.
 */

// ── The quadratic-Bézier sampler, matching PathResolver.toPolyline ──────────────
function sampleArc(start: TessPoint, end: TessPoint, control: TessPoint, segments: number): TessPoint[] {
  const n = Math.max(2, Math.floor(segments));
  const out: TessPoint[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const a = (1 - t) * (1 - t), b = 2 * (1 - t) * t, c = t * t;
    out.push({
      x: a * start.x + b * control.x + c * end.x,
      z: a * start.z + b * control.z + c * end.z,
    });
  }
  return out;
}

/** Max XZ distance from each point of `poly` to the true arc (densely sampled). */
function maxDeviationFromArc(poly: readonly TessPoint[], arc: readonly TessPoint[]): number {
  let worst = 0;
  for (const p of poly) {
    let best = Infinity;
    for (let i = 0; i < arc.length - 1; i++) {
      const a = arc[i]!, b = arc[i + 1]!;
      const abx = b.x - a.x, abz = b.z - a.z;
      const len2 = abx * abx + abz * abz;
      let t = len2 < 1e-18 ? 0 : ((p.x - a.x) * abx + (p.z - a.z) * abz) / len2;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const dx = p.x - (a.x + abx * t), dz = p.z - (a.z + abz * t);
      const d = Math.hypot(dx, dz);
      if (d < best) best = d;
    }
    if (best > worst) worst = best;
  }
  return worst;
}

/**
 * THE FOUNDER'S WALL, reconstructed to the numbers in the log.
 *
 * A 24-segment curved wall (the log's highest sub-segment was `_c23`) whose ends
 * were shortened by the join resolver — the ordinary `hostThickness/2` trim where
 * it meets its neighbours.
 */
const SEGMENTS = 24;
const PRE_START: TessPoint = { x: 0, z: 0 };
const PRE_END: TessPoint = { x: 12, z: 0 };
const CONTROL: TessPoint = { x: 6, z: 8 };   // a pronounced bow, as in the screenshot

/** The authored arc, at high density — ground truth for deviation. */
const TRUE_ARC = sampleArc(PRE_START, PRE_END, CONTROL, 2000);

/** Post-trim endpoints: pulled along the arc by a resolver trim at each end. */
const POST_START = TRUE_ARC[Math.round(TRUE_ARC.length * 0.03)]!;  // ~3% in
const POST_END = TRUE_ARC[Math.round(TRUE_ARC.length * 0.97)]!;    // ~3% from the end

describe('§FIX-CURVED-WALL-PRETRIM-FRAME — the room ring must follow the authored arc', () => {

  describe('REGRESSION — the OLD tessellation is demonstrably wrong', () => {
    /**
     * The pre-fix code, verbatim in shape: Bézier through POST-trim endpoints with
     * the PRE-trim control point.
     */
    const oldWay = sampleArc(POST_START, POST_END, CONTROL, SEGMENTS);

    it('produces a curve that departs from the authored arc by a LARGE margin', () => {
      const dev = maxDeviationFromArc(oldWay, TRUE_ARC);
      // Not a rounding error — this is the visible defect, hundreds of mm.
      expect(dev).toBeGreaterThan(0.15);
    });

    it('its endpoints are right but its BODY is wrong — why the founder sees one bad corner', () => {
      // The ends coincide (they ARE the trimmed endpoints)…
      expect(Math.hypot(oldWay[0]!.x - POST_START.x, oldWay[0]!.z - POST_START.z)).toBeLessThan(1e-9);
      // …but the interior bows away from the true arc.
      const mid = oldWay[Math.floor(oldWay.length / 2)]!;
      const midDev = maxDeviationFromArc([mid], TRUE_ARC);
      expect(midDev).toBeGreaterThan(0.1);
    });

    it('displaces the wall FAR beyond the junction snap radii — so loops stop closing', () => {
      // The error profile is pinned at the ends and WORST MID-SPAN (previous test),
      // so the displacement that matters is the maximum, not the tail. At this trim
      // it is >150 mm — already double the 80 mm T-junction SNAP and of the same
      // order as the 200 mm hostSnap the log cites in
      //   "§DIAG-ROOM-LOOP BREAK … EXCEEDS hostSnap 200mm → loop will NOT close".
      // That is the mechanism by which a mis-fitted arc becomes unresolvedLoopBreaks
      // and then a §DIAG-PARTITION-REACH "recovery" chord.
      const devMm = maxDeviationFromArc(oldWay, TRUE_ARC) * 1000;
      expect(devMm).toBeGreaterThan(150);
    });
  });

  describe('THE FIX — tessellate pre-trim, then clip to the post-trim span', () => {
    const fixed = tessellateCurvedWallForTopology(
      {
        baseLine: [POST_START, POST_END],
        sourceBaseLine: [PRE_START, PRE_END],
        control: CONTROL,
        segments: SEGMENTS,
      },
      sampleArc,
    );

    it('follows the authored arc to within tessellation error — the defect is gone', () => {
      const dev = maxDeviationFromArc(fixed, TRUE_ARC);
      // Every vertex is sampled FROM the true arc, so the only residual is the
      // reference polyline's own 2000-chord discretisation (~1e-6 m ≈ 0.001 mm).
      // Five orders of magnitude below the >150 mm defect above.
      expect(dev).toBeLessThan(1e-5);
    });

    it('is dramatically better than the old way (the numeric before/after)', () => {
      const oldDev = maxDeviationFromArc(sampleArc(POST_START, POST_END, CONTROL, SEGMENTS), TRUE_ARC);
      const newDev = maxDeviationFromArc(fixed, TRUE_ARC);
      expect(newDev).toBeLessThan(oldDev / 1000);
    });

    it('still HONOURS the trim — it starts and ends exactly on the resolver endpoints', () => {
      // The trim is not undone: the wall must still meet its neighbours where the
      // join resolver put it. Only the SHAPE between the ends is restored.
      expect(Math.hypot(fixed[0]!.x - POST_START.x, fixed[0]!.z - POST_START.z)).toBeLessThan(1e-12);
      const last = fixed[fixed.length - 1]!;
      expect(Math.hypot(last.x - POST_END.x, last.z - POST_END.z)).toBeLessThan(1e-12);
    });

    it('keeps the interior vertices — the ring is a curve, not a chord', () => {
      expect(fixed.length).toBeGreaterThan(10);
      // A chord would be 2 points; a real arc keeps most of its subdivision.
      expect(fixed.length).toBeGreaterThanOrEqual(SEGMENTS - 4);
    });

    it('has NO adjacent-vertex gap — the 599 mm tear cannot recur', () => {
      // Adjacent tessellation vertices are consecutive samples of one polyline, so
      // consecutive segments share an endpoint exactly. This is the invariant whose
      // violation produced `_c22`/`_c23` 599 mm apart.
      for (let i = 0; i < fixed.length - 1; i++) {
        const gap = Math.hypot(fixed[i + 1]!.x - fixed[i]!.x, fixed[i + 1]!.z - fixed[i]!.z);
        expect(gap).toBeLessThan(2.0);   // no wild jump
        expect(gap).toBeGreaterThan(0);  // and no degenerate zero-length segment
      }
    });
  });

  describe('an UNTRIMMED wall is bit-identical to the old behaviour', () => {
    it('returns the plain tessellation when no source baseline exists', () => {
      const out = tessellateCurvedWallForTopology(
        { baseLine: [PRE_START, PRE_END], sourceBaseLine: null, control: CONTROL, segments: SEGMENTS },
        sampleArc,
      );
      expect(out).toEqual(sampleArc(PRE_START, PRE_END, CONTROL, SEGMENTS));
    });

    it('returns the plain tessellation when pre-trim ≡ post-trim', () => {
      const out = tessellateCurvedWallForTopology(
        {
          baseLine: [PRE_START, PRE_END],
          sourceBaseLine: [PRE_START, PRE_END],
          control: CONTROL,
          segments: SEGMENTS,
        },
        sampleArc,
      );
      expect(out).toEqual(sampleArc(PRE_START, PRE_END, CONTROL, SEGMENTS));
    });
  });

  describe('clipPolylineToSpan', () => {
    const poly: TessPoint[] = [
      { x: 0, z: 0 }, { x: 1, z: 1 }, { x: 2, z: 1 }, { x: 3, z: 0 }, { x: 4, z: 0 },
    ];

    it('starts and ends exactly at the requested points', () => {
      const out = clipPolylineToSpan(poly, { x: 0.5, z: 0.5 }, { x: 3.5, z: 0 });
      expect(out[0]).toMatchObject({ x: 0.5, z: 0.5 });
      expect(out[out.length - 1]).toMatchObject({ x: 3.5, z: 0 });
    });

    it('keeps the interior vertices between the two projections', () => {
      const out = clipPolylineToSpan(poly, { x: 0.5, z: 0.5 }, { x: 3.5, z: 0 });
      // (1,1), (2,1) and (3,0) all lie strictly inside the span.
      expect(out).toEqual(expect.arrayContaining([
        expect.objectContaining({ x: 1, z: 1 }),
        expect.objectContaining({ x: 2, z: 1 }),
      ]));
    });

    it('falls back to a straight span rather than inventing geometry on degenerate input', () => {
      expect(clipPolylineToSpan([{ x: 0, z: 0 }], { x: 0, z: 0 }, { x: 1, z: 0 })).toHaveLength(2);
      // Reversed projections (to BEFORE from) must not produce a backwards ring.
      const rev = clipPolylineToSpan(poly, { x: 3.5, z: 0 }, { x: 0.5, z: 0.5 });
      expect(rev).toHaveLength(2);
    });

    it('never emits a zero-length segment', () => {
      const out = clipPolylineToSpan(poly, { x: 1, z: 1 }, { x: 3, z: 0 });
      for (let i = 0; i < out.length - 1; i++) {
        expect(Math.hypot(out[i + 1]!.x - out[i]!.x, out[i + 1]!.z - out[i]!.z)).toBeGreaterThan(0);
      }
    });
  });

  describe('baseWallId — the same-parent guard\'s identity function', () => {
    it('strips curve/crossing and T-junction suffixes back to the WallStore id', () => {
      expect(baseWallId('wall_ABC')).toBe('wall_ABC');
      expect(baseWallId('wall_ABC_c23')).toBe('wall_ABC');
      expect(baseWallId('wall_ABC_c22')).toBe('wall_ABC');
      expect(baseWallId('wall_ABC_c5_s2')).toBe('wall_ABC');
    });

    it('proves the founder\'s log line was a SAME-PARENT reach — always a bug', () => {
      // guest=wall_01KZ..._c23  onto  host=wall_01KZ..._c22
      const guest = 'wall_01KZCC41VX01G4NNNZ4YPN7YXK_c23';
      const host = 'wall_01KZCC41VX01G4NNNZ4YPN7YXK_c22';
      expect(baseWallId(guest)).toBe(baseWallId(host));
    });
  });
});
