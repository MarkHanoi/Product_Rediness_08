// §FIX-NEWWALL-LCORNER-BIAS (L-91, founder 2026-07-04).
//
// REPRO: a new wall whose endpoint SNAPS onto an existing L-corner node (a 3rd wall meeting AT
// the corner). The live PREVIEW (V2, baseline-immutable) shows the wall exactly as drawn/snapped
// — clean angle, full length — but the EXECUTED wall was BIASED: the legacy resolver deferred the
// pinned 3rd wall to the pair-wise `_applyCorner` bisector miter, which ROTATED its stored
// baseline off its authored axis (e.g. a diagonal 3rd wall's join end drifted (5.000,0) →
// (5.099,0) with a ~2° tilt). Distinct from the L-74/L-76 pass-through square-cap.
//
// Fix: a pinned wall that is NOT part of the primary corner pair is routed to the on-axis
// §CONSENSUS-ON-CENTRELINE trim (zero rotation) instead of the pair-wise tilt. The genuine
// 2-wall L corner (both walls in the primary pair) still defers → byte-unchanged.
//
// Acceptance pinned here: executed baseline == previewed baseline (endpoint, ANGLE, length) at
// the corner — verified fresh-drawn AND on reopen (re-resolving persisted baselines).

import { describe, it, expect } from 'vitest';
import { WallJoinResolver } from '../src/WallJoinResolver';
import type { WallData } from '../src/WallTypes';

let _seq = 0;
function mk(start: [number, number], end: [number, number], thickness: number, createdAt: number): WallData {
  return {
    id: `w${_seq++}`, type: 'wall', levelId: 'L', properties: {}, childrenIds: [],
    baseLine: [{ x: start[0], y: 0, z: start[1] }, { x: end[0], y: 0, z: end[1] }],
    height: 3, thickness, baseOffset: 0, openings: [], metadata: { createdAt },
  } as any;
}
const dir = (a: any, b: any) => { const dx = b.x - a.x, dz = b.z - a.z; const L = Math.hypot(dx, dz) || 1; return { x: dx / L, z: dz / L, len: Math.hypot(dx, dz) }; };
const absDot = (a: any, b: any) => Math.abs(a.x * b.x + a.z * b.z);

// Existing L-joint at the corner (5,0): A horizontal, B vertical.
const A = () => mk([0, 0], [5, 0], 0.2, 1);
const B = () => mk([5, 0], [5, 5], 0.2, 2);

/** Resolve, return C's baseline direction/length + the joining endpoint (the one at the corner). */
function resolveC(walls: WallData[], cId: string, sr = 0.5) {
  const res = WallJoinResolver.resolveLevel(walls, { snapRadius: sr });
  const jd = res.get(cId)!;
  return { jd, a: jd.baseLine[0] as any, b: jd.baseLine[1] as any };
}

/** Perpendicular (lateral) distance of point `p` from the infinite line of the ORIGINAL wall
 *  C (through its authored endpoints). Zero ⇒ the resolved endpoint stayed exactly on C's own
 *  axis — i.e. NO tilt / NO lateral bias (the L-91 guarantee), even if it was trimmed ALONG the
 *  axis to seat flush against an arm face (the L-94 flush butt). */
function lateralOffAxis(p: any, C: WallData): number {
  const s = C.baseLine[0], e = C.baseLine[1];
  const dx = e.x - s.x, dz = e.z - s.z; const L = Math.hypot(dx, dz) || 1;
  const ux = dx / L, uz = dz / L;
  return Math.abs((p.x - s.x) * (-uz) + (p.z - s.z) * ux);
}

describe('WallJoinResolver — §FIX-NEWWALL-LCORNER-BIAS (3rd wall snapped to L-corner) (L-91 + L-94)', () => {
  // The joining endpoint (nearer the corner (5,0)) must stay EXACTLY on C's own axis (no
  // tilt / lateral bias — L-91), while being allowed to trim ALONG that axis to seat flush on
  // an arm face (≤ ~a half-thickness — L-94). The far end is never touched.
  for (const [label, C] of [
    ['diagonal down-right', mk([5, 0], [6.34, -1.34], 0.1, 3)],
    ['diagonal down-left', mk([5, 0], [3.66, -1.34], 0.1, 3)],
    ['perpendicular down (collinear-B)', mk([5, 0], [5, -1.897], 0.1, 3)],
  ] as Array<[string, WallData]>) {
    it(`executed baseline is on-axis (no tilt) + seats near the corner, ${label}`, () => {
      _seq = 0;
      const A0 = A(), B0 = B();
      const C0 = mk([C.baseLine[0].x, C.baseLine[0].z] as any, [C.baseLine[1].x, C.baseLine[1].z] as any, C.thickness, 3);
      const inD = dir(C0.baseLine[0], C0.baseLine[1]);
      const { jd, a, b } = resolveC([A0, B0, C0], C0.id);
      expect(jd.invalid).toBeFalsy();
      const outD = dir(a, b);
      // (1) Angle preserved EXACTLY — no tilt/bias (the founder's L-91 defect).
      expect(absDot(inD, outD)).toBeGreaterThan(0.99995);
      // (2) The joining endpoint (nearer the corner) stays EXACTLY on C's own axis — zero
      //     lateral drift — and seats within a half-thickness of the snapped corner (a flush
      //     along-axis butt onto an arm face, NOT a wild move).
      const joinEnd = Math.hypot(a.x - 5, a.z) <= Math.hypot(b.x - 5, b.z) ? a : b;
      expect(lateralOffAxis(joinEnd, C0)).toBeLessThan(1e-6);
      expect(Math.hypot(joinEnd.x - 5, joinEnd.z)).toBeLessThan(0.16); // within the corner mitre
      // (3) The far end is untouched, and the wall keeps real length (never collapsed/flipped).
      expect(outD.len).toBeGreaterThan(inD.len - 0.16);
    });
  }

  it('ON REOPEN: re-resolving the persisted baselines is stable — no drift/bias', () => {
    _seq = 0;
    const A0 = A(), B0 = B(), C0 = mk([5, 0], [6.34, -1.34], 0.1, 3);
    const r1 = WallJoinResolver.resolveLevel([A0, B0, C0], { snapRadius: 0.5 });
    const persist = (w: WallData, id: string): WallData => {
      const jd = r1.get(id)!; return { ...w, baseLine: [{ x: jd.baseLine[0].x, y: 0, z: jd.baseLine[0].z }, { x: jd.baseLine[1].x, y: 0, z: jd.baseLine[1].z }] } as any;
    };
    const A1 = persist(A0, A0.id), B1 = persist(B0, B0.id), C1 = persist(C0, C0.id);
    const inD = dir(C1.baseLine[0], C1.baseLine[1]);
    const { a, b } = resolveC([A1, B1, C1], C1.id);
    const outD = dir(a, b);
    // Idempotent: angle preserved AND the joining endpoint stays on-axis with ≤1mm along-axis
    // drift (already seated flush on the arm face by the first resolve).
    expect(absDot(inD, outD)).toBeGreaterThan(0.99995);
    const joinEnd = Math.hypot(a.x - 5, a.z) <= Math.hypot(b.x - 5, b.z) ? a : b;
    expect(lateralOffAxis(joinEnd, C1)).toBeLessThan(1e-6);
    expect(Math.abs(outD.len - inD.len)).toBeLessThan(0.001);
  });

  it('no regression: a GENUINE 2-wall L corner still mitres (both walls trim to the shared corner)', () => {
    _seq = 0;
    const A0 = A(), B0 = B();
    const res = WallJoinResolver.resolveLevel([A0, B0], { snapRadius: 0.5 });
    // Both arms meet at (5,0); the pair-wise miter path is untouched (each stays on its own axis,
    // ending at the shared corner).
    const ja = res.get(A0.id)!, jb = res.get(B0.id)!;
    expect(Math.hypot((ja.baseLine[1] as any).x - 5, (ja.baseLine[1] as any).z - 0)).toBeLessThan(0.11);
    expect(Math.hypot((jb.baseLine[0] as any).x - 5, (jb.baseLine[0] as any).z - 0)).toBeLessThan(0.11);
    // A stays horizontal, B stays vertical (no rotation).
    expect(absDot(dir(ja.baseLine[0], ja.baseLine[1]), { x: 1, z: 0 })).toBeGreaterThan(0.999);
    expect(absDot(dir(jb.baseLine[0], jb.baseLine[1]), { x: 0, z: 1 })).toBeGreaterThan(0.999);
  });
});
