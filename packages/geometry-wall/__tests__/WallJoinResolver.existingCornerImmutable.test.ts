// §FIX-EXISTING-CORNER-IMMUTABLE (L-122, founder 2026-07-04).
//
// THE architectural invariant (founder, reported many times): two EXTERIOR walls meet in a
// clean mitred L (inglete). When a NEW wall — a DIFFERENT wall type (an interior partition) —
// comes to join at/near that corner, the two original exterior walls must ALWAYS remain EXACTLY
// as they were (baseline + corner mitre BYTE-IDENTICAL — ADR-0055 baseline immutability); only
// the NEW wall adapts, seating flush/pegado onto the frozen corner.
//
// The defect: the new interior wall came "straight down" — COLLINEAR with one exterior arm B —
// to the corner. The pass-through detection then paired the committed arm B with the newcomer C
// (collinear + coincident) → the whole cluster went through §PASS-THROUGH-FLUSH, so arm A teed
// onto the "B+C through-line" and BOTH exterior arms LOST their corner mitre (a notch/gap). Fix:
// a genuine pass-through is one wall (same systemTypeId); a DIFFERENT-type collinear wall abutting
// a committed corner is a distinct newcomer, not a through-segment — reject that pass-through so
// the exterior L is left untouched and the newcomer flush-butts (L-94) onto the frozen corner.

import { describe, it, expect } from 'vitest';
import * as THREE from '@pryzm/renderer-three/three';
import { WallJoinResolver } from '../src/WallJoinResolver';
import type { WallData } from '../src/WallTypes';

let _seq = 0;
function mk(s: [number, number], e: [number, number], t: number, c: number, sys: string): WallData {
  return { id: `w${_seq++}`, type: 'wall', levelId: 'L', properties: {}, childrenIds: [],
    baseLine: [{ x: s[0], y: 0, z: s[1] }, { x: e[0], y: 0, z: e[1] }],
    height: 3, thickness: t, baseOffset: 0, openings: [], systemTypeId: sys, metadata: { createdAt: c } } as any;
}
const dir = (a: any, b: any) => { const dx = b.x - a.x, dz = b.z - a.z; const L = Math.hypot(dx, dz) || 1; return { x: dx / L, z: dz / L, len: Math.hypot(dx, dz) }; };
/** Full join fingerprint of a wall: resolved baseline (μm) + miter normals — the footprint. */
function fingerprint(jd: any): string {
  if (!jd) return 'none';
  const u = (n: number) => Math.round(n * 1e6);
  const mn = (m: any) => m ? `${u(m.nx)},${u(m.nz)}` : 'null';
  const a = jd.baseLine[0], b = jd.baseLine[1];
  return `${u(a.x)},${u(a.z)}>${u(b.x)},${u(b.z)}|s${mn(jd.startMN)}|e${mn(jd.endMN)}|inv${jd.invalid ?? false}`;
}
function signedArea(poly: Array<{ x: number; z: number }>): number {
  let s = 0; for (let i = 0; i < poly.length; i++) { const p = poly[i]!, q = poly[(i + 1) % poly.length]!; s += p.x * q.z - q.x * p.z; } return s / 2;
}
function selfIntersects(poly: Array<{ x: number; z: number }>): boolean {
  const n = poly.length; if (n < 4) return false;
  const cr = (o: any, a: any, b: any) => (a.x - o.x) * (b.z - o.z) - (a.z - o.z) * (b.x - o.x);
  const seg = (p1: any, p2: any, p3: any, p4: any) => { const d1 = cr(p3, p4, p1), d2 = cr(p3, p4, p2), d3 = cr(p1, p2, p3), d4 = cr(p1, p2, p4); return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0)); };
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) { if (i === j || (i + 1) % n === j || (j + 1) % n === i) continue; if (seg(poly[i], poly[(i + 1) % n], poly[j], poly[(j + 1) % n])) return true; }
  return false;
}
function rect(a: any, b: any, t: number) { const d = dir(a, b); const nx = -d.z, nz = d.x, h = t / 2; return [{ x: a.x + nx * h, z: a.z + nz * h }, { x: b.x + nx * h, z: b.z + nz * h }, { x: b.x - nx * h, z: b.z - nz * h }, { x: a.x - nx * h, z: a.z - nz * h }]; }

// Exterior mitred L (thick 0.3) at corner (5,0). A createdAt 1, B createdAt 2, both 'ext'.
const A = () => mk([0, 0], [5, 0], 0.3, 1, 'ext');
const B = () => mk([5, 0], [5, 5], 0.3, 2, 'ext');

describe('WallJoinResolver — §FIX-EXISTING-CORNER-IMMUTABLE: existing exterior L frozen when interior wall joins (L-122)', () => {
  // interior wall (thin 0.1, type 'int', createdAt 3) joining the corner.
  const CASES: Array<[string, [number, number], [number, number]]> = [
    ['interior comes STRAIGHT DOWN (collinear with exterior arm B)', [5, 0], [5, -3]],
    ['interior snapped to corner, into the room (diagonal)', [5, 0], [3, 2]],
    ['interior snapped to the intersection midpoint', [4.95, 0.05], [3, 2]],
  ];
  for (const [label, cs, ce] of CASES) {
    it(`the two exterior walls stay BYTE-IDENTICAL + interior seats clean — ${label}`, () => {
      // (baseline) resolve the exterior L ALONE.
      _seq = 0;
      const A0 = A(), B0 = B();
      const before = WallJoinResolver.resolveLevel([A0, B0], { snapRadius: 0.5 });
      const fpA_before = fingerprint(before.get(A0.id)), fpB_before = fingerprint(before.get(B0.id));

      // add the interior wall C (different type).
      _seq = 0;
      const A1 = A(), B1 = B(), C1 = mk(cs, ce, 0.1, 3, 'int');
      const after = WallJoinResolver.resolveLevel([A1, B1, C1], { snapRadius: 0.5 });
      const fpA_after = fingerprint(after.get(A1.id)), fpB_after = fingerprint(after.get(B1.id));

      // (a) EXISTING exterior walls unchanged — baseline + mitre byte-identical.
      expect(fpA_after).toBe(fpA_before);
      expect(fpB_after).toBe(fpB_before);
      // The exterior corner is still a real mitre (not squared to null by a pass-through).
      expect(after.get(A1.id)!.endMN).toBeTruthy();
      expect(after.get(B1.id)!.startMN).toBeTruthy();

      // (b) the interior wall seats clean: on-axis (no tilt), positive-area, non-self-intersecting.
      const jc = after.get(C1.id)!;
      expect(jc.invalid).toBeFalsy();
      const inD = dir(C1.baseLine[0], C1.baseLine[1]);
      const a = jc.baseLine[0] as any, b = jc.baseLine[1] as any;
      expect(Math.abs(inD.x * dir(a, b).x + inD.z * dir(a, b).z)).toBeGreaterThan(0.9999);
      const fp = rect(a, b, C1.thickness);
      expect(Math.abs(signedArea(fp))).toBeGreaterThan(0.05);
      expect(selfIntersects(fp)).toBe(false);

      // (c) ON REOPEN: persist the resolved baselines and re-resolve — exterior walls STILL frozen.
      _seq = 0;
      const persist = (w: WallData, id: string): WallData => { const j = after.get(id)!; return { ...w, baseLine: [{ x: (j.baseLine[0] as any).x, y: 0, z: (j.baseLine[0] as any).z }, { x: (j.baseLine[1] as any).x, y: 0, z: (j.baseLine[1] as any).z }] } as any; };
      const A2 = persist(A1, A1.id), B2 = persist(B1, B1.id), C2 = persist(C1, C1.id);
      const reopen = WallJoinResolver.resolveLevel([A2, B2, C2], { snapRadius: 0.5 });
      expect(fingerprint(reopen.get(A2.id))).toBe(fpA_after);
      expect(fingerprint(reopen.get(B2.id))).toBe(fpB_after);
    });
  }

  it('a SAME-type collinear through-wall is UNCHANGED (a genuine pass-through still square-caps — no regression)', () => {
    // Two collinear same-type segments + a perpendicular stem = the classic T-junction. The
    // through-pair must NOT be frozen-as-corner (that is a real pass-through, square caps).
    _seq = 0;
    const a = mk([0, 0], [4, 0], 0.2, 1, 'ext');   // through-left
    const b = mk([4, 0], [4, 3], 0.2, 2, 'ext');   // stem
    const c = mk([4, 0], [7, 0], 0.2, 3, 'ext');   // through-right (SAME type as a)
    const res = WallJoinResolver.resolveLevel([a, b, c]);
    // Through-walls keep SQUARE caps (pass-through), NOT frozen bisector miters.
    expect(res.get(a.id)!.endMN).toBeNull();
    expect(res.get(c.id)!.startMN).toBeNull();
    expect(res.get(b.id)!.startMN).toBeNull();
    const aEnd = res.get(a.id)!.baseLine[1] as THREE.Vector3, cStart = res.get(c.id)!.baseLine[0] as THREE.Vector3;
    expect(Math.hypot(aEnd.x - 4, aEnd.z) + Math.hypot(cStart.x - 4, cStart.z)).toBeLessThan(0.01);
  });
});
