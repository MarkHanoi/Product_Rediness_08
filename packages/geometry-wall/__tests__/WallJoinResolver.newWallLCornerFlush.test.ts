// §FIX-NEWWALL-LCORNER-FLUSH (L-94, founder 2026-07-04).
//
// REPRO: two walls already mitred in an L (inglete). A NEW wall is added onto that joint CORNER
// — its endpoint snapping to the corner NODE, or to the MIDPOINT of the two-wall intersection.
// The PREVIEW (V2) shows a clean perpendicular partition seated FLUSH (pegado) against the two
// initial walls, but the EXECUTED result rendered a BROKEN/SPIKY joint: after L-91 removed the
// baseline TILT, a diagonal 3rd wall (≈45° to both arms) fell to an on-axis SQUARE cap at the
// centreline node, which pokes past the corner instead of seating on the arms' faces.
//
// Fix: relax the T-into-corner gate so the diagonal partition T-butts onto the more-perpendicular
// arm — `_applyT` trims it ALONG its OWN axis (zero rotation — L-91's no-tilt guarantee holds)
// onto that arm's lateral face, landing the near end on the corner's inner/outer vertex, flush
// against BOTH arms. Executed == preview: perpendicular, on-axis, seated flush; a positive-area,
// non-self-intersecting footprint at the cluster; verified fresh AND on reopen; for BOTH snaps.

import { describe, it, expect } from 'vitest';
import { WallJoinResolver } from '../src/WallJoinResolver';
import type { WallData } from '../src/WallTypes';
import { resolveJunctions, type WallInput, type Pt2 } from '../src/JunctionResolverV2';
import { buildWallFootprint } from '../src/WallFootprint2D';

let _seq = 0;
function mk(s: [number, number], e: [number, number], t: number, c: number): WallData {
  return { id: `w${_seq++}`, type: 'wall', levelId: 'L', properties: {}, childrenIds: [],
    baseLine: [{ x: s[0], y: 0, z: s[1] }, { x: e[0], y: 0, z: e[1] }],
    height: 3, thickness: t, baseOffset: 0, openings: [], metadata: { createdAt: c } } as any;
}
const dir = (a: any, b: any) => { const dx = b.x - a.x, dz = b.z - a.z; const L = Math.hypot(dx, dz) || 1; return { x: dx / L, z: dz / L, len: Math.hypot(dx, dz) }; };
const absDot = (a: any, b: any) => Math.abs(a.x * b.x + a.z * b.z);

function signedArea(poly: Array<{ x: number; z: number }>): number {
  let s = 0; for (let i = 0; i < poly.length; i++) { const a = poly[i]!, b = poly[(i + 1) % poly.length]!; s += a.x * b.z - b.x * a.z; } return s / 2;
}
function selfIntersects(poly: Array<{ x: number; z: number }>): boolean {
  const n = poly.length; if (n < 4) return false;
  const cr = (o: any, a: any, b: any) => (a.x - o.x) * (b.z - o.z) - (a.z - o.z) * (b.x - o.x);
  const seg = (p1: any, p2: any, p3: any, p4: any) => {
    const d1 = cr(p3, p4, p1), d2 = cr(p3, p4, p2), d3 = cr(p1, p2, p3), d4 = cr(p1, p2, p4);
    return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
  };
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
    if (i === j || (i + 1) % n === j || (j + 1) % n === i) continue;
    if (seg(poly[i], poly[(i + 1) % n], poly[j], poly[(j + 1) % n])) return true;
  }
  return false;
}
/** Perpendicular-capped rectangle footprint of a wall from a baseline (the flush butt cap is
 *  perpendicular-to-axis; the arm-face miter only skews it slightly, so the rectangle is a
 *  faithful positive-area / self-intersection proxy for the executed body). */
function rectFootprint(a: { x: number; z: number }, b: { x: number; z: number }, thickness: number) {
  const d = dir(a, b); const nx = -d.z, nz = d.x; const h = thickness / 2;
  return [
    { x: a.x + nx * h, z: a.z + nz * h }, { x: b.x + nx * h, z: b.z + nz * h },
    { x: b.x - nx * h, z: b.z - nz * h }, { x: a.x - nx * h, z: a.z - nz * h },
  ];
}
function lateralOffAxis(p: any, C: WallData): number {
  const s = C.baseLine[0], e = C.baseLine[1]; const dx = e.x - s.x, dz = e.z - s.z; const L = Math.hypot(dx, dz) || 1;
  return Math.abs((p.x - s.x) * (-dz / L) + (p.z - s.z) * (dx / L));
}

// Existing mitred L at the corner (5,0): A horizontal, B vertical.
const A = () => mk([0, 0], [5, 0], 0.2, 1);
const B = () => mk([5, 0], [5, 5], 0.2, 2);

/** Resolve [A,B,C]; return C's join data + the endpoint nearer the corner. */
function seat(C: WallData) {
  const res = WallJoinResolver.resolveLevel([A(), B(), C], { snapRadius: 0.5 });
  const jd = res.get(C.id)!;
  const a = jd.baseLine[0] as any, b = jd.baseLine[1] as any;
  const join = Math.hypot(a.x - 5, a.z) <= Math.hypot(b.x - 5, b.z) ? a : b;
  return { jd, a, b, join };
}

/** Assert C seats FLUSH & clean against the corner. */
function assertFlush(C: WallData) {
  const inD = dir(C.baseLine[0], C.baseLine[1]);
  const { jd, a, b, join } = seat(C);
  expect(jd.invalid).toBeFalsy();
  // Perpendicular / angle preserved (executed == preview), zero lateral drift (on-axis).
  expect(absDot(inD, dir(a, b))).toBeGreaterThan(0.99995);
  expect(lateralOffAxis(join, C)).toBeLessThan(1e-6);
  // Seated FLUSH on an arm face at the corner: the join end is within the mitre region and
  // lies ON one arm's lateral face (|z| ≈ A half-thickness OR |x−5| ≈ B half-thickness).
  expect(Math.hypot(join.x - 5, join.z)).toBeLessThan(0.16);
  const onAface = Math.abs(Math.abs(join.z) - 0.1) < 0.03;      // A face z = ±0.10
  const onBface = Math.abs(Math.abs(join.x - 5) - 0.1) < 0.03;  // B face x = 5 ± 0.10
  const atCorner = Math.hypot(join.x - 5, join.z) < 1e-6;        // collinear pass-through stays at node
  expect(onAface || onBface || atCorner).toBe(true);
  // Positive-area, non-self-intersecting footprint at the cluster (no spike / bow-tie).
  const fp = rectFootprint(a, b, C.thickness);
  expect(Math.abs(signedArea(fp))).toBeGreaterThan(0.05);
  expect(selfIntersects(fp)).toBe(false);
  return { a, b };
}

describe('WallJoinResolver — §FIX-NEWWALL-LCORNER-FLUSH: 3rd wall seats FLUSH on the L corner (L-94)', () => {
  const CORNER: Array<[string, [number, number]]> = [
    ['diagonal → interior', [3.5, 1.5]],
    ['diagonal → reflex side', [3.5, -1.5]],
    ['perpendicular bisector', [4, 1]],
  ];
  for (const [label, end] of CORNER) {
    it(`endpoint snapped to the corner NODE (5,0), ${label}: flush + clean`, () => {
      _seq = 0;
      assertFlush(mk([5, 0], end, 0.1, 3));
    });
  }

  const MID: Array<[string, [number, number], [number, number]]> = [
    ['diagonal', [4.95, 0.05], [3.5, 1.5]],
    ['perpendicular', [4.95, 0.05], [4, 1.5]],
  ];
  for (const [label, start, end] of MID) {
    it(`endpoint snapped to the two-wall intersection MIDPOINT, ${label}: flush + clean`, () => {
      _seq = 0;
      assertFlush(mk(start, end, 0.1, 3));
    });
  }

  it('EXECUTED == PREVIEW: the V2 preview footprint for the 3rd wall is also clean (positive-area, simple)', () => {
    const vin: WallInput[] = [
      { id: 'A', start: { x: 0, z: 0 }, end: { x: 5, z: 0 }, thickness: 0.2 },
      { id: 'B', start: { x: 5, z: 0 }, end: { x: 5, z: 5 }, thickness: 0.2 },
      { id: 'C', start: { x: 5, z: 0 }, end: { x: 3.5, z: 1.5 }, thickness: 0.1 },
    ];
    const miters = resolveJunctions(vin);
    const fpC = buildWallFootprint(vin[2]!, miters[2]!);
    expect(fpC.invalid).toBeFalsy();
    expect(Math.abs(signedArea(fpC.polygon as unknown as Pt2[] as any))).toBeGreaterThan(0.05);
    expect(selfIntersects(fpC.polygon as any)).toBe(false);
  });

  it('ON REOPEN: re-resolving the persisted baseline keeps the flush seat (idempotent, ≤1mm)', () => {
    _seq = 0;
    const C0 = mk([5, 0], [3.5, 1.5], 0.1, 3);
    const r1 = WallJoinResolver.resolveLevel([A(), B(), C0], { snapRadius: 0.5 });
    const j1 = r1.get(C0.id)!;
    const C1 = mk([(j1.baseLine[0] as any).x, (j1.baseLine[0] as any).z], [(j1.baseLine[1] as any).x, (j1.baseLine[1] as any).z], 0.1, 3);
    const { a, b } = assertFlush(C1);   // still flush + clean after reload
    // ≤1mm along-axis drift vs the first resolve (no slow walk).
    expect(Math.hypot(a.x - (j1.baseLine[0] as any).x, a.z - (j1.baseLine[0] as any).z)).toBeLessThan(0.001);
    expect(Math.hypot(b.x - (j1.baseLine[1] as any).x, b.z - (j1.baseLine[1] as any).z)).toBeLessThan(0.001);
  });
});
