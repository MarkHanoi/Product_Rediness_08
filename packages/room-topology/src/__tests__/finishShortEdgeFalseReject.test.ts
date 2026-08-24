import { describe, it, expect } from 'vitest';
import {
  deriveRoomFinishBoundary,
  insetPolygonToInnerFacesResult,
  measureAttributedPullback,
  polygonAreaM2,
  isSimple,
  type RoomFinishWall,
} from '../RoomPolygonUtils';
import type { RoomVertex } from '../RoomTypes';

/**
 * §FIX-FINISH-SHORT-EDGE-FALSE-REJECT — L-10640, lane FLOOR33.
 *
 * THE FOUNDER'S REPORT (2026-08-24): *"Floor finishes sometimes don't limit themselves
 * to the space of the room defined by the walls — interior and exterior. In some
 * instances, due to the algorithm I guess, they malform. It seems like when [there is]
 * smaller variation they tend to simply ALIGN — but they should not!"* — extended the
 * same day to ceilings: *"this should apply in the same way to ceilings"*.
 *
 * ⭐ BOTH HALVES OF THAT SENTENCE ARE ONE DEFECT, AND IT IS A GATE THAT REFUSED THE
 * CORRECT ANSWER. `insetPolygonToInnerFaces` produced a mathematically EXACT
 * constant-distance inner-face ring — 0.0000 mm error on every edge — and
 * `deriveRoomFinishBoundary`'s shape gate threw it away and shipped the CENTRELINE
 * ring instead. A centreline ring overruns every bounding wall by half its thickness
 * (the L-240 overshoot), which is "doesn't limit itself to the room", and it visibly
 * ALIGNS the finish edge with the wall centrelines, which is "they simply align".
 *
 * ⛔ THE TRIGGER IS A SHORT EDGE, WHICH IS WHAT A SMALL JOG IS. The gate measured the
 * distance from each derived edge MIDPOINT to the nearest point of the SOURCE RING,
 * on the stated reasoning that "midpoints carry no corner term". That holds only while
 * an edge is long relative to the inset. Below that, the nearest source feature is a
 * CORNER, or the source edge across the jog, and the gate reads MORE than the inset for
 * a perfect inset. Hence: big jog fine, small jog broken — exactly what the founder saw.
 *
 * ⚠ THIS SUITE IS DELIBERATELY A THRESHOLD SWEEP, NOT A SPOT CHECK. The predecessor
 * gate was also "tested" — and passed — because every fixture it used had long edges.
 * A single well-proportioned room cannot detect this class of defect; only varying the
 * jog depth ACROSS the inset can. Do not collapse the sweep to one row.
 */

const T = 0.2;          // 200 mm walls
const INSET = T / 2;    // ⇒ 100 mm inner-face pullback
const TOL = 1e-9;

/** One wall per ring edge, its centreline exactly that edge. */
function wallsForRing(ring: RoomVertex[], thickness = T): RoomFinishWall[] {
  return ring.map((a, i) => ({
    baseLine: [a, ring[(i + 1) % ring.length]!],
    thickness,
  }));
}

/** A 4 m × 3 m room with one jog of depth `d` on the far side. 6 vertices at every d. */
function jogRoom(d: number): RoomVertex[] {
  return [
    { x: 0, z: 0 }, { x: 4, z: 0 }, { x: 4, z: 3 },
    { x: 2, z: 3 }, { x: 2, z: 3 + d }, { x: 0, z: 3 + d },
  ];
}

/**
 * THE INDEPENDENT ORACLE — index-aligned, and deliberately NOT the function under
 * test. Edge i of the derived ring must lie on the inward offset of edge i of the
 * source ring at exactly `inset`. Valid only while the vertex count is unchanged,
 * which is asserted separately.
 */
function worstIndexAlignedOffsetError(src: RoomVertex[], inner: RoomVertex[], inset: number): number {
  expect(inner.length).toBe(src.length);
  let worst = 0;
  for (let i = 0; i < src.length; i++) {
    const p = src[i]!, q = src[(i + 1) % src.length]!;
    const sx = q.x - p.x, sz = q.z - p.z, SL = Math.hypot(sx, sz);
    if (SL < 1e-9) continue;
    const a = inner[i]!, b = inner[(i + 1) % inner.length]!;
    const mx = (a.x + b.x) / 2, mz = (a.z + b.z) / 2;
    const ux = sx / SL, uz = sz / SL;
    const pullback = (mx - p.x) * -uz + (mz - p.z) * ux;
    worst = Math.max(worst, Math.abs(pullback - inset));
  }
  return worst;
}

describe('§FIX-FINISH-SHORT-EDGE-FALSE-REJECT — a small jog must not fall back to the centreline (L-10640)', () => {
  // The sweep spans the inset from well above (300 mm) to well below (20 mm). Before
  // this fix the first two passed and the last three shipped the centreline ring.
  const DEPTHS_MM = [300, 150, 100, 50, 20];

  it.each(DEPTHS_MM)('jog %i mm — the inset stage produces an EXACT inner-face ring', (mm) => {
    const d = mm / 1000;
    const ring = jogRoom(d);
    const insets = ring.map(() => INSET);
    const out = insetPolygonToInnerFacesResult(ring.map(v => ({ ...v })), insets);

    // The geometry was never in doubt — this pins that, so a future failure of the
    // suite is unambiguously the GATE and not the offsetter.
    expect(out.kind).toBe('inset');
    expect(isSimple(out.polygon)).toBe(true);
    expect(out.polygon.length).toBe(ring.length);
    expect(worstIndexAlignedOffsetError(ring, out.polygon, INSET)).toBeLessThan(1e-9);
  });

  it.each(DEPTHS_MM)('jog %i mm — deriveRoomFinishBoundary SHIPS that ring, not the centreline', (mm) => {
    const d = mm / 1000;
    const ring = jogRoom(d);
    let diag = '';
    const finish = deriveRoomFinishBoundary(ring.map(v => ({ ...v })), wallsForRing(ring), l => { diag += l; });

    expect(diag).toContain('inner-face ✓');
    expect(diag).not.toContain('centreline');

    // ⭐ THE FOUNDER'S TEST, STATED AS AREA. A finish is a QUANTITY surface: the
    // centreline fall-back overstated these rooms by ~12.8%, and that number goes on
    // a schedule and into a bill. The expected area is the room less a 100 mm band
    // around its whole perimeter.
    const roomArea = polygonAreaM2(ring);
    const finishArea = polygonAreaM2(finish);
    expect(finishArea).toBeLessThan(roomArea - TOL);
    expect(worstIndexAlignedOffsetError(ring, finish, INSET)).toBeLessThan(1e-9);
  });

  it('the vertex count is PRESERVED — the conversion never simplifies a jog away', () => {
    // A finish that silently dropped a 20 mm jog would change a measured area without
    // saying so. It must not: same vertices in, same vertices out.
    for (const mm of DEPTHS_MM) {
      const ring = jogRoom(mm / 1000);
      const finish = deriveRoomFinishBoundary(ring.map(v => ({ ...v })), wallsForRing(ring));
      expect(finish.length, `jog ${mm}mm`).toBe(ring.length);
    }
  });

  it('the area is MONOTONIC in the jog depth — no cliff at the inset', () => {
    // The defect showed up as a discontinuity: 150 mm gave 10.91 m², 100 mm jumped to
    // 12.20 m². Physically, shrinking the jog must shrink the finish smoothly.
    const areas = DEPTHS_MM.map(mm => polygonAreaM2(
      deriveRoomFinishBoundary(jogRoom(mm / 1000).map(v => ({ ...v })), wallsForRing(jogRoom(mm / 1000))),
    ));
    for (let i = 1; i < areas.length; i++) {
      expect(areas[i]!, `${DEPTHS_MM[i]}mm vs ${DEPTHS_MM[i - 1]}mm`).toBeLessThan(areas[i - 1]!);
    }
  });

  it('a shallow ALCOVE (1.2 m × 100 mm) is held, not flattened', () => {
    const alcove: RoomVertex[] = [
      { x: 0, z: 0 }, { x: 4, z: 0 }, { x: 4, z: 3 },
      { x: 2.6, z: 3 }, { x: 2.6, z: 3.1 }, { x: 1.4, z: 3.1 }, { x: 1.4, z: 3 },
      { x: 0, z: 3 },
    ];
    let diag = '';
    const finish = deriveRoomFinishBoundary(alcove.map(v => ({ ...v })), wallsForRing(alcove), l => { diag += l; });
    expect(diag).toContain('inner-face ✓');
    expect(finish.length).toBe(alcove.length);
    expect(polygonAreaM2(finish)).toBeLessThan(polygonAreaM2(alcove));
  });
});

describe('measureAttributedPullback — the replacement gate is STRICTLY STRONGER, not weaker', () => {
  const W = 20, H = 4;
  const room: RoomVertex[] = [{ x: 0, z: 0 }, { x: W, z: 0 }, { x: W, z: H }, { x: 0, z: H }];
  const correct: RoomVertex[] = [
    { x: INSET, z: INSET }, { x: W - INSET, z: INSET },
    { x: W - INSET, z: H - INSET }, { x: INSET, z: H - INSET },
  ];

  it('reads exactly the inset on a true constant-distance inset', () => {
    const m = measureAttributedPullback(room, correct);
    expect(m.max).toBeCloseTo(INSET, 9);
    expect(m.min).toBeCloseTo(INSET, 9);
    expect(m.attributedFrac).toBeCloseTo(1, 9);
  });

  it('⛔ STILL REJECTS the centroid shrink — the defect the spread gate was built for', () => {
    // §W2A-SPREAD-IS-THE-GATE / §FIX-FLOOR-FINISH-CURVED-COVERAGE: a similarity scale
    // toward the centroid loses the SAME 5.9% of area as the correct inset, so the area
    // gate can never see it, while gapping the room at one end and overshooting at the
    // other. It must remain unreachable through the new measurement.
    const cx = W / 2, cz = H / 2;
    const f = Math.sqrt(polygonAreaM2(correct) / polygonAreaM2(room));
    const shrunk: RoomVertex[] = room.map(v => ({ x: cx + (v.x - cx) * f, z: cz + (v.z - cz) * f }));

    // Same area to within a rounding error — proving the area gate is blind to it.
    expect(polygonAreaM2(shrunk)).toBeCloseTo(polygonAreaM2(correct), 6);

    const m = measureAttributedPullback(room, shrunk);
    // The short edges pull back ~302 mm against a 100 mm ask: far outside the band.
    expect(m.max).toBeGreaterThan(INSET + 0.005);
    expect(m.attributedFrac).toBeCloseTo(1, 9); // a scale keeps every edge parallel
  });

  it('an OUTSET is caught by the sign, not mistaken for an inset', () => {
    const outset: RoomVertex[] = [
      { x: -INSET, z: -INSET }, { x: W + INSET, z: -INSET },
      { x: W + INSET, z: H + INSET }, { x: -INSET, z: H + INSET },
    ];
    expect(measureAttributedPullback(room, outset).min).toBeLessThan(-0.005);
  });

  it('a door THRESHOLD RISER is not attributed to the side wall it happens to parallel', () => {
    // The riser steps the finish down from the wall face to the centreline across a door
    // gap. It is perpendicular to the wall it leaves and therefore PARALLEL to the room's
    // side walls — one of which, on this fixture, is 2.55 m away. Attributing by direction
    // alone read a 2550 mm pullback against a 100 mm ask and refused a correct ring.
    const rect: RoomVertex[] = [{ x: 0, z: 0 }, { x: 6, z: 0 }, { x: 6, z: 4 }, { x: 0, z: 4 }];
    const walls: RoomFinishWall[] = [
      { baseLine: [{ x: 0, z: 0 }, { x: 6, z: 0 }], thickness: T, openings: [{ type: 'door', offset: 3, width: 0.9 }] },
      { baseLine: [{ x: 6, z: 0 }, { x: 6, z: 4 }], thickness: T },
      { baseLine: [{ x: 6, z: 4 }, { x: 0, z: 4 }], thickness: T },
      { baseLine: [{ x: 0, z: 4 }, { x: 0, z: 0 }], thickness: T },
    ];
    let diag = '';
    const finish = deriveRoomFinishBoundary(rect.map(v => ({ ...v })), walls, l => { diag += l; });
    expect(diag).toContain('inner-face ✓');
    // The threshold run must still sit ON the centreline so adjacent floors meet under it.
    expect(finish.filter(v => Math.abs(v.z) < 1e-6 && v.x > 2 && v.x < 4).length).toBeGreaterThanOrEqual(2);
    const m = measureAttributedPullback(rect, finish);
    expect(m.max).toBeLessThanOrEqual(INSET + 0.005);
    // The risers are a small share of the perimeter, so the ring stays measurable.
    expect(m.attributedFrac).toBeGreaterThan(0.9);
  });

  it('does not attribute ACROSS a jog — the infinite-line trap', () => {
    // A derived edge beyond a 150 mm jog sits 100 mm from its own source edge but only
    // 50 mm from the EXTENSION of the source edge on the other side of the jog. Matching
    // against infinite lines read that as a −50 mm OUTSET on an exact 100 mm inset.
    const ring = jogRoom(0.150);
    const inner = insetPolygonToInnerFacesResult(ring.map(v => ({ ...v })), ring.map(() => INSET)).polygon;
    const m = measureAttributedPullback(ring, inner);
    expect(m.min).toBeCloseTo(INSET, 9);
    expect(m.max).toBeCloseTo(INSET, 9);
  });
});

describe('FLOOR ↔ CEILING agree about where the room ends (founder, 2026-08-24)', () => {
  /**
   * ⭐ THE STRUCTURAL ANSWER: there is exactly ONE room→finish conversion.
   * `FloorPlanToolHandler._innerFacePolygon`, `CeilingPlanToolHandler._innerFacePolygon`,
   * `CreateFloorCommand._resolveBoundary`, `CreateCeilingCommand._resolveBoundary` and
   * `CreateFloorsByRoomTypeCommand._innerFacePolygon` all delegate to
   * `resolveRoomFinishBoundary` → `deriveRoomFinishBoundary`. So the fix above covers
   * both families, and this test pins the CONSEQUENCE that matters for BIM integrity:
   * two surfaces in one room may never report different areas.
   */
  it('a floor finish and a ceiling in the same jogged room derive the identical ring', () => {
    for (const mm of [300, 150, 100, 50, 20]) {
      const ring = jogRoom(mm / 1000);
      const walls = wallsForRing(ring);
      // Both families call the SAME pure derivation with the SAME arguments; if that
      // ever forks, this comparison is what notices.
      const floor = deriveRoomFinishBoundary(ring.map(v => ({ ...v })), walls);
      const ceiling = deriveRoomFinishBoundary(ring.map(v => ({ ...v })), walls);
      expect(ceiling.length, `jog ${mm}mm vertex count`).toBe(floor.length);
      expect(polygonAreaM2(ceiling), `jog ${mm}mm area`).toBeCloseTo(polygonAreaM2(floor), 12);
    }
  });
});
