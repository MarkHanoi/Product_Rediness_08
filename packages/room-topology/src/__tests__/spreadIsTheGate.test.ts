/**
 * §W2A-SPREAD-IS-THE-GATE (W2-A defect 6) — proof that the promoted gate
 * DISCRIMINATES, and that the gate it replaced did not.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE CLAIM UNDER TEST
 * ─────────────────────────────────────────────────────────────────────────────
 * `deriveRoomFinishBoundary` used to accept an inset on `innerArea >= 0.5 *
 * baseArea` — an AREA RATIO, which is blind to SHAPE. The spread of the
 * per-edge pullback was computed on the very next line and only PRINTED.
 *
 * §FIX-FLOOR-FINISH-CURVED-COVERAGE recorded exactly what that cost: the
 * centroid-shrink fall-back it deleted lost 5.9% of area — the same few percent
 * a CORRECT inset loses, so the 50% area gate waved it through — while gapping
 * 540 mm at one end of the room and overshooting 40 mm in the middle. It was
 * logged as `inner-face ✓`.
 *
 * This file demonstrates the two rings side by side:
 *   • a TRUE inset          — constant perpendicular pullback
 *   • a CENTROID SCALE      — pullback proportional to distance from the centre
 * chosen to have THE SAME AREA, so the area gate cannot tell them apart. The
 * spread gate must, and by a wide margin.
 *
 * It also pins the failure mode discovered while building the gate: measuring
 * the spread at VERTICES rather than EDGE MIDPOINTS rejects a CORRECT inset,
 * because a 90° corner inset by t legitimately sits t·√2 from the source
 * boundary. Right invariant, wrong object.
 */

import { describe, it, expect } from 'vitest';
import {
  deriveRoomFinishBoundary,
  polygonAreaM2,
  type RoomVertex,
  type RoomFinishWall,
} from '../RoomPolygonUtils';

/** An elongated room — where a centroid scale is loudest. */
const ROOM: RoomVertex[] = [
  { x: 0, z: 0 }, { x: 12, z: 0 }, { x: 12, z: 3 }, { x: 0, z: 3 },
];
const T = 0.2; // wall thickness ⇒ 100 mm inset
const WALLS: RoomFinishWall[] = [
  { baseLine: [{ x: 0, z: 0 }, { x: 12, z: 0 }], thickness: T },
  { baseLine: [{ x: 12, z: 0 }, { x: 12, z: 3 }], thickness: T },
  { baseLine: [{ x: 12, z: 3 }, { x: 0, z: 3 }], thickness: T },
  { baseLine: [{ x: 0, z: 3 }, { x: 0, z: 0 }], thickness: T },
];

// ── the oracle, written here and importing nothing from the subject ─────────

function distPtSeg(p: RoomVertex, a: RoomVertex, b: RoomVertex): number {
  const dx = b.x - a.x, dz = b.z - a.z;
  const l2 = dx * dx + dz * dz;
  if (l2 < 1e-20) return Math.hypot(p.x - a.x, p.z - a.z);
  let t = ((p.x - a.x) * dx + (p.z - a.z) * dz) / l2;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  return Math.hypot(p.x - (a.x + t * dx), p.z - (a.z + t * dz));
}

/** Perpendicular pullback measured at EDGE MIDPOINTS — the gate's own object. */
function midpointPullback(src: RoomVertex[], derived: RoomVertex[]): { min: number; max: number } {
  const ds: number[] = [];
  for (let i = 0; i < derived.length; i++) {
    const a = derived[i]!, b = derived[(i + 1) % derived.length]!;
    const m = { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 };
    let best = Infinity;
    for (let j = 0; j < src.length; j++) {
      const d = distPtSeg(m, src[j]!, src[(j + 1) % src.length]!);
      if (d < best) best = d;
    }
    ds.push(best);
  }
  return { min: Math.min(...ds), max: Math.max(...ds) };
}

/** Same measurement taken at VERTICES — the object the first cut got wrong. */
function vertexPullback(src: RoomVertex[], derived: RoomVertex[]): { min: number; max: number } {
  const ds = derived.map((p) => {
    let best = Infinity;
    for (let j = 0; j < src.length; j++) {
      const d = distPtSeg(p, src[j]!, src[(j + 1) % src.length]!);
      if (d < best) best = d;
    }
    return best;
  });
  return { min: Math.min(...ds), max: Math.max(...ds) };
}

/** A centroid scale that reproduces a given target area — the deleted fallback. */
function centroidScaleToArea(ring: RoomVertex[], targetArea: number): RoomVertex[] {
  const cx = ring.reduce((s, p) => s + p.x, 0) / ring.length;
  const cz = ring.reduce((s, p) => s + p.z, 0) / ring.length;
  const k = Math.sqrt(targetArea / polygonAreaM2(ring)); // area scales as k²
  return ring.map((p) => ({ x: cx + (p.x - cx) * k, z: cz + (p.z - cz) * k }));
}

describe('§W2A-SPREAD-IS-THE-GATE — the promoted discriminator', () => {
  it('a true inset holds its pullback at the wall half-thickness EVERYWHERE', () => {
    const inner = deriveRoomFinishBoundary(ROOM, WALLS);
    const pb = midpointPullback(ROOM, inner);
    expect(pb.max - pb.min).toBeLessThanOrEqual(0.0001); // 0.1 mm
    expect(pb.min).toBeCloseTo(T / 2, 6);
  });

  it('THE POINT: an area-identical centroid scale is INDISTINGUISHABLE by area and OBVIOUS by spread', () => {
    const truth = deriveRoomFinishBoundary(ROOM, WALLS);
    const fake = centroidScaleToArea(ROOM, polygonAreaM2(truth));

    // 1. The area gate cannot tell them apart — that is the defect.
    expect(polygonAreaM2(fake)).toBeCloseTo(polygonAreaM2(truth), 9);
    const base = polygonAreaM2(ROOM);
    expect(polygonAreaM2(fake)).toBeGreaterThan(0.5 * base);   // old gate: PASS
    expect(polygonAreaM2(truth)).toBeGreaterThan(0.5 * base);  // old gate: PASS

    // 2. The spread gate separates them by more than two orders of magnitude.
    const spreadTruth = (() => { const p = midpointPullback(ROOM, truth); return p.max - p.min; })();
    const spreadFake = (() => { const p = midpointPullback(ROOM, fake); return p.max - p.min; })();
    expect(spreadTruth).toBeLessThanOrEqual(0.0001);
    expect(spreadFake).toBeGreaterThan(0.05); // > 50 mm on this room
    expect(spreadFake / Math.max(spreadTruth, 1e-9)).toBeGreaterThan(100);

    // 3. And the gate's actual predicate rejects it: no edge asked for more than
    //    the wall half-thickness, so a pullback beyond that is an excursion.
    const maxInset = T / 2;
    const TOL = 0.005;
    expect(midpointPullback(ROOM, fake).max).toBeGreaterThan(maxInset + TOL);
    expect(midpointPullback(ROOM, truth).max).toBeLessThanOrEqual(maxInset + TOL);
  });

  it('RIGHT INVARIANT, WRONG OBJECT — vertices reject a CORRECT L-shaped inset', () => {
    // A 90° corner inset by t sits t·√2 from the source boundary. That is exact,
    // not a defect. Gating on the vertex measurement therefore rejected a plain
    // L-shaped room and fell it back to its centreline — reintroducing the very
    // L-240 overshoot the gate exists to prevent. Pinned so it cannot recur.
    const L: RoomVertex[] = [
      { x: 0, z: 0 }, { x: 6, z: 0 }, { x: 6, z: 2 },
      { x: 3, z: 2 }, { x: 3, z: 5 }, { x: 0, z: 5 },
    ];
    const lw: RoomFinishWall[] = L.map((a, i) => ({
      baseLine: [a, L[(i + 1) % L.length]!],
      thickness: T,
    }));
    const inner = deriveRoomFinishBoundary(L, lw);

    // The inset was ACCEPTED (not fallen back to the centreline).
    expect(polygonAreaM2(inner)).toBeLessThan(polygonAreaM2(L));
    expect(inner).not.toEqual(L);

    // Vertices legitimately spread by ~41 mm on a 100 mm inset …
    const v = vertexPullback(L, inner);
    expect(v.max - v.min).toBeGreaterThan(0.03);
    // … while midpoints, the object the gate measures, are flat.
    const m = midpointPullback(L, inner);
    expect(m.max - m.min).toBeLessThanOrEqual(0.0001);
  });
});
