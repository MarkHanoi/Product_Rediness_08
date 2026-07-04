// §MITER-SEGMENT-CLAMP (L-93, founder 2026-07-04).
//
// REPRO: at an L-corner where one arm carries a DOOR opening NEAR the corner, the plan
// footprint showed a spike/notch/messy join instead of a clean mitre. Opening-bearing walls
// render via the segments path (`buildMiterPrism` per body segment), NOT the plain-wall V2
// footprint. The tiny wall sliver between the door jamb and the corner is shorter than the 45°
// miter reach (~half-thickness), so the miter's inner cap vertex slid BACKWARD past the jamb
// into the door void → a self-intersecting triangular spike/notch in plan.
//
// Fix (`MiterPrismBuilder` §MITER-SEGMENT-CLAMP): a projected cap vertex may extend PAST its
// own end (the legitimate outer overhang that meets the neighbour's face) but must NEVER
// retreat past the OPPOSITE miter plane — so the near-corner sliver is a clean, positive-area,
// non-self-intersecting prism (outer face mitres to the corner; inner face stops at the jamb).

import { describe, it, expect } from 'vitest';
import * as THREE from '@pryzm/renderer-three/three';
import { buildMiterPrism } from '../src/MiterPrismBuilder';

/** Bottom-face (y≈baseOffset) XZ footprint outline of a miter-prism geometry (unique verts). */
function bottomFootprint(geo: THREE.BufferGeometry, baseOffset = 0): Array<{ x: number; z: number }> {
  const pos = geo.getAttribute('position') as THREE.BufferAttribute;
  const pts: Array<{ x: number; z: number }> = [];
  const seen = new Set<string>();
  for (let i = 0; i < pos.count; i++) {
    if (Math.abs(pos.getY(i) - baseOffset) > 1e-4) continue;
    const x = pos.getX(i), z = pos.getZ(i);
    const k = `${x.toFixed(4)},${z.toFixed(4)}`;
    if (!seen.has(k)) { seen.add(k); pts.push({ x, z }); }
  }
  return pts;
}
function signedArea(poly: Array<{ x: number; z: number }>): number {
  let s = 0;
  for (let i = 0; i < poly.length; i++) { const a = poly[i]!, b = poly[(i + 1) % poly.length]!; s += a.x * b.z - b.x * a.z; }
  return s / 2;
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
/** Convex-hull order the (≤4) footprint points so the shoelace/self-intersection tests are
 *  order-independent (buildMiterPrism emits verts face-by-face, not in ring order). */
function hullOrder(pts: Array<{ x: number; z: number }>): Array<{ x: number; z: number }> {
  if (pts.length < 3) return pts;
  const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length;
  const cz = pts.reduce((s, p) => s + p.z, 0) / pts.length;
  return [...pts].sort((a, b) => Math.atan2(a.z - cz, a.x - cx) - Math.atan2(b.z - cz, b.x - cx));
}

const halfT = 0.1, H = 3, BO = 0;
// 45° L-corner miter normal (matches the V2 corner for a 0.2 m × 0.2 m L at (5,0)).
const endMN45 = { nx: Math.SQRT1_2, nz: Math.SQRT1_2 };

/** Build the corner sliver [jambX → 5.0] along +x, mitred at the corner (x=5), square at jamb. */
function cornerSliver(jambX: number) {
  const segStart = new THREE.Vector3(jambX, 0, 0);
  const segEnd = new THREE.Vector3(5.0, 0, 0);
  return buildMiterPrism(segStart, segEnd, segStart.clone(), segEnd.clone(), halfT, H, BO, null, endMN45);
}

describe('MiterPrismBuilder — §MITER-SEGMENT-CLAMP near-corner opening (L-93)', () => {
  for (const jambX of [4.95, 4.98, 4.99]) {
    it(`door ${(5 - jambX) * 1000}mm from the corner → NO spike into the void, clean footprint`, () => {
      const fp = bottomFootprint(cornerSliver(jambX));
      // (1) No vertex retreats BEHIND the door jamb (the spike into the opening).
      const minX = Math.min(...fp.map(p => p.x));
      expect(minX).toBeGreaterThanOrEqual(jambX - 1e-4);
      // (2) The outer miter overhang to the corner IS preserved (meets the neighbour's face).
      const maxX = Math.max(...fp.map(p => p.x));
      expect(maxX).toBeGreaterThan(5.0 - 1e-4);
      // (3) Positive-area, non-self-intersecting footprint (no bow-tie / negative-area prism).
      const ring = hullOrder(fp);
      expect(Math.abs(signedArea(ring))).toBeGreaterThan(1e-4);
      expect(selfIntersects(ring)).toBe(false);
    });
  }

  it('a door FAR from the corner keeps the FULL clean mitre (outer + inner corners intact)', () => {
    const fp = bottomFootprint(cornerSliver(4.5)); // 0.5 m sliver — miter fits fully
    // Inner corner retreats to x=4.9 (halfT behind the corner) — the true 45° mitre, unclamped.
    const minX = Math.min(...fp.map(p => p.x));
    expect(minX).toBeLessThan(4.5 + 1e-4);            // includes the jamb square start at 4.5
    const hasInner = fp.some(p => Math.abs(p.x - 4.9) < 1e-3 && Math.abs(p.z - 0.1) < 1e-3);
    const hasOuter = fp.some(p => Math.abs(p.x - 5.1) < 1e-3 && Math.abs(p.z + 0.1) < 1e-3);
    expect(hasInner).toBe(true);
    expect(hasOuter).toBe(true);
    expect(selfIntersects(hullOrder(fp))).toBe(false);
  });

  it('ON REOPEN: deterministic — rebuilding the same near-corner sliver is byte-identical (no drift)', () => {
    const a = bottomFootprint(cornerSliver(4.96)).map(p => `${p.x.toFixed(5)},${p.z.toFixed(5)}`).sort();
    const b = bottomFootprint(cornerSliver(4.96)).map(p => `${p.x.toFixed(5)},${p.z.toFixed(5)}`).sort();
    expect(a).toEqual(b);
    // And still clean.
    expect(Math.min(...bottomFootprint(cornerSliver(4.96)).map(p => p.x))).toBeGreaterThanOrEqual(4.96 - 1e-4);
  });
});
