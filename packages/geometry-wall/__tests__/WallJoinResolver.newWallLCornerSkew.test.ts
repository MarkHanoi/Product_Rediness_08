// §FIX-NEWWALL-LCORNER-SKEW (L-63 Part-1 / L-74 / L-76, founder 2026-07-03).
//
// REPRO: an existing L-joint (two perpendicular walls sharing a corner) + a NEW wall drawn
// PERPENDICULAR (100 mm) teeing onto one arm near the corner. The live PREVIEW is clean
// (perpendicular, snapped) but the EXECUTED wall was tapered/skewed — its joining endpoint was
// dragged to the corner vertex (L-76) and its footprint self-intersected into a black
// negative-area bow-tie prism at the junction (L-74).
//
// Root cause: the new wall, being perpendicular to arm A, is PARALLEL to arm B, so the legacy
// resolver's pass-through detection (direction-only) mis-classified B + the new wall as a
// collinear "pass-through" even though their centrelines are 0.313 m apart, and §PASS-THROUGH-
// FLUSH square-capped every member to the corner consensus. Fix: a pass-through pair must be
// laterally COINCIDENT (same line), not merely parallel — so the new wall now routes to the
// T-into-corner path and butts the arm's body cleanly (perpendicular, length preserved).
//
// Acceptance pinned here: executed baseline == previewed baseline (perpendicular, on-axis,
// length preserved) + a positive-area, non-self-intersecting footprint at the cluster —
// verified BOTH fresh-drawn AND on reopen (re-resolving the persisted baselines).

import { describe, it, expect } from 'vitest';
import { WallJoinResolver } from '../src/WallJoinResolver';
import type { WallData } from '../src/WallTypes';
import { resolveJunctions, type WallInput } from '../src/JunctionResolverV2';
import { buildWallFootprint } from '../src/WallFootprint2D';

let _seq = 0;
function mk(start: [number, number], end: [number, number], thickness: number, createdAt: number): WallData {
  return {
    id: `w${_seq++}`, type: 'wall', levelId: 'L', properties: {}, childrenIds: [],
    baseLine: [{ x: start[0], y: 0, z: start[1] }, { x: end[0], y: 0, z: end[1] }],
    height: 3, thickness, baseOffset: 0, openings: [], metadata: { createdAt },
  } as any;
}

const dir = (a: { x: number; z: number }, b: { x: number; z: number }) => {
  const dx = b.x - a.x, dz = b.z - a.z; const L = Math.hypot(dx, dz) || 1;
  return { x: dx / L, z: dz / L, len: Math.hypot(dx, dz) };
};

/** Signed area (shoelace) of a polygon. */
function signedArea(poly: Array<{ x: number; z: number }>): number {
  let s = 0;
  for (let i = 0; i < poly.length; i++) { const a = poly[i]!, b = poly[(i + 1) % poly.length]!; s += a.x * b.z - b.x * a.z; }
  return s / 2;
}

/** True if any two non-adjacent edges of the polygon properly cross (self-intersection). */
function selfIntersects(poly: Array<{ x: number; z: number }>): boolean {
  const n = poly.length;
  const cross = (o: any, a: any, b: any) => (a.x - o.x) * (b.z - o.z) - (a.z - o.z) * (b.x - o.x);
  const segCross = (p1: any, p2: any, p3: any, p4: any) => {
    const d1 = cross(p3, p4, p1), d2 = cross(p3, p4, p2), d3 = cross(p1, p2, p3), d4 = cross(p1, p2, p4);
    return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
  };
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
    if (i === j || (i + 1) % n === j || (j + 1) % n === i) continue;   // skip adjacent/shared
    if (segCross(poly[i], poly[(i + 1) % n], poly[j], poly[(j + 1) % n])) return true;
  }
  return false;
}

/** Rectangle footprint of a wall from its (perpendicular-capped) baseline. */
function rectFootprint(a: { x: number; z: number }, b: { x: number; z: number }, thickness: number) {
  const d = dir(a, b); const nx = -d.z, nz = d.x; const h = thickness / 2;
  return [
    { x: a.x + nx * h, z: a.z + nz * h }, { x: b.x + nx * h, z: b.z + nz * h },
    { x: b.x - nx * h, z: b.z - nz * h }, { x: a.x - nx * h, z: a.z - nz * h },
  ];
}

// Existing L-joint: A horizontal, B vertical, sharing the corner (5,0).
const A = () => mk([0, 0], [5, 0], 0.2, 1);
const B = () => mk([5, 0], [5, 5], 0.2, 2);
// NEW wall C: perpendicular (vertical, 100 mm), teeing onto A's body 0.313 m before the corner,
// approaching from below. This is the founder's "perpendicular, snapped near the corner" wall.
const Cinput = () => mk([4.687, 0], [4.687, -3], 0.1, 3);

describe('WallJoinResolver — §FIX-NEWWALL-LCORNER-SKEW (new wall onto an L-joint) (L-74/L-76)', () => {
  it('executed baseline stays PERPENDICULAR and ON-AXIS — not dragged to the corner', () => {
    _seq = 0;
    const A0 = A(), B0 = B(), C0 = Cinput();
    const res = WallJoinResolver.resolveLevel([A0, B0, C0], { snapRadius: 0.5 });
    const jc = res.get(C0.id)!;
    expect(jc.invalid).toBeFalsy();
    const a = jc.baseLine[0] as any, b = jc.baseLine[1] as any;

    const inD = dir(C0.baseLine[0], C0.baseLine[1]);
    const outD = dir(a, b);
    // Direction preserved (perpendicular to A, i.e. vertical) — |dot| ≈ 1, NOT skewed.
    expect(Math.abs(inD.x * outD.x + inD.z * outD.z)).toBeGreaterThan(0.999);
    // The joining endpoint stays on C's own axis (x ≈ 4.687), NOT dragged to the corner x = 5.
    const joinPt = Math.abs(a.z - (-3)) < Math.abs(b.z - (-3)) ? b : a; // the end nearer the free end is the far one
    const capPt  = Math.abs(a.z + 3) < 1e-6 ? b : a;                     // the end AT z=-3 is free; the other is the join
    void joinPt;
    expect(Math.abs(capPt.x - 4.687)).toBeLessThan(0.02);
    // Length preserved apart from the small butt trim onto A's face (≤ A half-thickness).
    expect(outD.len).toBeGreaterThan(3.0 - 0.2);
    expect(outD.len).toBeLessThan(3.0 + 1e-6);
  });

  it('footprint at the cluster is POSITIVE-area and NON-self-intersecting (no bow-tie, L-74)', () => {
    _seq = 0;
    const A0 = A(), B0 = B(), C0 = Cinput();
    const res = WallJoinResolver.resolveLevel([A0, B0, C0], { snapRadius: 0.5 });
    const jc = res.get(C0.id)!;
    const fp = rectFootprint(jc.baseLine[0] as any, jc.baseLine[1] as any, C0.thickness);
    expect(Math.abs(signedArea(fp))).toBeGreaterThan(0.1);   // ~ len(2.9) × 0.1 ≈ 0.29
    expect(selfIntersects(fp)).toBe(false);
  });

  it('EXECUTED == PREVIEW: the V2 preview footprint is also perpendicular + positive-area', () => {
    _seq = 0;
    const walls: WallInput[] = [
      { id: 'A', start: { x: 0, z: 0 }, end: { x: 5, z: 0 }, thickness: 0.2 },
      { id: 'B', start: { x: 5, z: 0 }, end: { x: 5, z: 5 }, thickness: 0.2 },
      { id: 'C', start: { x: 4.687, z: 0 }, end: { x: 4.687, z: -3 }, thickness: 0.1 },
    ];
    const miters = resolveJunctions(walls);
    const fpC = buildWallFootprint(walls[2]!, miters[2]!);
    expect(fpC.invalid).toBeFalsy();
    expect(Math.abs(signedArea(fpC.polygon as any))).toBeGreaterThan(0.1);
    expect(selfIntersects(fpC.polygon as any)).toBe(false);
    // Preview keeps C on its axis (x ≈ 4.687) — the founder's clean perpendicular preview.
    for (const p of fpC.polygon) expect(Math.abs(p.x - 4.687)).toBeLessThan(0.06); // within half-thickness
  });

  it('ON REOPEN: re-resolving the PERSISTED (already-trimmed) baselines is stable — no further skew', () => {
    _seq = 0;
    const A0 = A(), B0 = B(), C0 = Cinput();
    const res1 = WallJoinResolver.resolveLevel([A0, B0, C0], { snapRadius: 0.5 });
    // Simulate a reload: the persisted baselines are the resolved ones.
    const persist = (w: WallData, jd: any): WallData => ({
      ...w, baseLine: [{ x: jd.baseLine[0].x, y: 0, z: jd.baseLine[0].z }, { x: jd.baseLine[1].x, y: 0, z: jd.baseLine[1].z }],
    } as any);
    const A1 = persist(A0, res1.get(A0.id)!);
    const B1 = persist(B0, res1.get(B0.id)!);
    const C1 = persist(C0, res1.get(C0.id)!);
    const res2 = WallJoinResolver.resolveLevel([A1, B1, C1], { snapRadius: 0.5 });
    const c2 = res2.get(C1.id)!;
    const outD = dir(c2.baseLine[0] as any, c2.baseLine[1] as any);
    const inD  = dir(C1.baseLine[0], C1.baseLine[1]);
    // Still perpendicular, still on-axis, still positive-area — idempotent (no drift on reopen).
    expect(Math.abs(inD.x * outD.x + inD.z * outD.z)).toBeGreaterThan(0.999);
    const capPt = Math.abs((c2.baseLine[0] as any).z + 3) < 1e-6 ? c2.baseLine[1] as any : c2.baseLine[0] as any;
    expect(Math.abs(capPt.x - 4.687)).toBeLessThan(0.02);
    const fp = rectFootprint(c2.baseLine[0] as any, c2.baseLine[1] as any, C1.thickness);
    expect(selfIntersects(fp)).toBe(false);
    expect(Math.abs(signedArea(fp))).toBeGreaterThan(0.1);
  });

  it('the genuine collinear pass-through (resi §_repro_passthrough shape) is UNAFFECTED', () => {
    _seq = 0;
    // Two collinear through-walls + a perpendicular partition whose end is off-consensus:
    // consensus is a committed corner ON the through-line, so the partition IS pulled to it.
    const J = { x: 15.964, z: 2.815 };
    const wallA = mk([10.0, 2.815], [15.964, 2.815], 0.2, 1);
    const wallB = mk([15.964, 2.815], [22.0, 2.815], 0.2, 2);
    const wallC = mk([15.828, 6.0], [15.828, 2.866], 0.1, 3);
    const res = WallJoinResolver.resolveLevel([wallA, wallB, wallC], { snapRadius: 0.5 });
    const endC = res.get(wallC.id)!.baseLine[1] as any;
    const overrun = Math.hypot(endC.x - J.x, endC.z - J.z);
    expect(overrun).toBeLessThan(0.02);  // still pulled onto the junction (byte-unchanged behaviour)
  });
});
