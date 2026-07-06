// §FIX-WALL-V2-EXISTING-CORNER-IMMUTABLE (L-130, founder 2026-07-06).
//
// The V2 residual of L-122. §FIX-EXISTING-CORNER-IMMUTABLE froze an existing exterior L-corner
// when a DIFFERENT-type interior wall joins it — but ONLY on the legacy MiterPrism render path
// (walls with openings/layers). PLAIN, opening-free exterior walls render their 3D body via the
// DEFAULT-ON V2 pipeline (`JunctionResolverV2`), whose `WallInput` carried NO systemTypeId — so
// the legacy guard never engaged in V2. The founder's test uses PLAIN walls → the V2 path
// RE-MITRED the existing corner when the third (interior) wall joined.
//
// This suite is the V2 mirror of `WallJoinResolver.existingCornerImmutable.test.ts`: two exterior
// walls form a mitred L, a third DIFFERENT-type wall joins at the corner → the two exterior walls'
// miter corners + footprints are BYTE-IDENTICAL before vs after (collinear/straight-down,
// perpendicular, and diagonal newcomer snaps), the newcomer seats clean (on-axis, positive area,
// non-self-intersecting), fresh AND on reopen; plus a SAME-type continuation still resolves as the
// pre-fix Y (guard is a strict no-op), and flag-OFF restores the exact current V2 behaviour.

import { describe, it, expect, afterEach } from 'vitest';
import { resolveJunctions, type WallInput, type Pt2, type WallMiter } from '../src/JunctionResolverV2';
import { buildWallFootprint, buildAllFootprints, type WallFootprint } from '../src/WallFootprint2D';

const sub = (a: Pt2, b: Pt2): Pt2 => ({ x: a.x - b.x, z: a.z - b.z });
const len = (a: Pt2): number => Math.hypot(a.x, a.z);
const close = (p: Pt2, q: Pt2, eps = 1e-9): boolean => Math.abs(p.x - q.x) < eps && Math.abs(p.z - q.z) < eps;

function signedArea(poly: readonly Pt2[]): number {
  let s = 0;
  for (let i = 0; i < poly.length; i++) { const a = poly[i]!, b = poly[(i + 1) % poly.length]!; s += a.x * b.z - b.x * a.z; }
  return s / 2;
}
function selfIntersects(poly: readonly Pt2[]): boolean {
  const n = poly.length; if (n < 4) return false;
  const cr = (o: Pt2, a: Pt2, b: Pt2) => (a.x - o.x) * (b.z - o.z) - (a.z - o.z) * (b.x - o.x);
  const seg = (p1: Pt2, p2: Pt2, p3: Pt2, p4: Pt2) => {
    const d1 = cr(p3, p4, p1), d2 = cr(p3, p4, p2), d3 = cr(p1, p2, p3), d4 = cr(p1, p2, p4);
    return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
  };
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
    if (i === j || (i + 1) % n === j || (j + 1) % n === i) continue;
    if (seg(poly[i]!, poly[(i + 1) % n]!, poly[j]!, poly[(j + 1) % n]!)) return true;
  }
  return false;
}
/** Full miter fingerprint of a wall-end at a corner: its 3 corner points (nm precision). */
function endFingerprint(m: WallMiter, which: 'start' | 'end'): string {
  const nm = (p?: Pt2) => p ? `${Math.round(p.x * 1e9)},${Math.round(p.z * 1e9)}` : 'none';
  if (which === 'start') return `L${nm(m.startLeft)}|R${nm(m.startRight)}|P${nm(m.startPivot)}`;
  return `L${nm(m.endLeft)}|R${nm(m.endRight)}|P${nm(m.endPivot)}`;
}
function fpFingerprint(fp: WallFootprint): string {
  return fp.polygon.map(p => `${Math.round(p.x * 1e9)},${Math.round(p.z * 1e9)}`).join(';');
}
const dir = (a: Pt2, b: Pt2): Pt2 => { const d = sub(b, a); const L = len(d) || 1; return { x: d.x / L, z: d.z / L }; };

// Exterior mitred L (thick 0.3) at corner (5,0). Both type 'ext'.
const A: WallInput = { id: 'A', start: { x: 0, z: 0 }, end: { x: 5, z: 0 }, thickness: 0.3, systemTypeId: 'ext' };
const B: WallInput = { id: 'B', start: { x: 5, z: 0 }, end: { x: 5, z: 5 }, thickness: 0.3, systemTypeId: 'ext' };

const flag = () => (globalThis as { __pryzmWallV2ExistingCornerImmutable?: boolean });
afterEach(() => { delete flag().__pryzmWallV2ExistingCornerImmutable; });

describe('JunctionResolverV2 — §FIX-WALL-V2-EXISTING-CORNER-IMMUTABLE (L-130)', () => {
  // Different-type interior wall (thin 0.1, type 'int') joining the corner (5,0).
  const CASES: Array<[string, Pt2, Pt2]> = [
    ['interior comes STRAIGHT DOWN (collinear with exterior arm B)', { x: 5, z: 0 }, { x: 5, z: -3 }],
    ['interior into the room (diagonal)',                            { x: 5, z: 0 }, { x: 3, z: 2 }],
    ['interior perpendicular back along A (into the room)',          { x: 5, z: 0 }, { x: 5, z: 3 }],
    ['interior snapped NEAR the corner (within the 0.2m band)',      { x: 4.9, z: 0.05 }, { x: 2.5, z: 2.5 }],
  ];

  for (const [label, cs, ce] of CASES) {
    it(`the two exterior walls stay BYTE-IDENTICAL + interior seats clean — ${label}`, () => {
      // (baseline) resolve the exterior L ALONE.
      const bare = resolveJunctions([A, B]);
      const bareFps = buildAllFootprints([A, B], bare);
      const fpA_end = endFingerprint(bare[0]!, 'end'), fpB_start = endFingerprint(bare[1]!, 'start');
      const fpA_poly = fpFingerprint(bareFps[0]!), fpB_poly = fpFingerprint(bareFps[1]!);

      // add the interior wall C (DIFFERENT type).
      const C: WallInput = { id: 'C', start: cs, end: ce, thickness: 0.1, systemTypeId: 'int' };
      const after = resolveJunctions([A, B, C]);
      const afterFps = buildAllFootprints([A, B, C], after);

      // (a) the EXISTING exterior walls are byte-identical — miter corners AND footprint.
      expect(endFingerprint(after[0]!, 'end')).toBe(fpA_end);
      expect(endFingerprint(after[1]!, 'start')).toBe(fpB_start);
      expect(fpFingerprint(afterFps[0]!)).toBe(fpA_poly);
      expect(fpFingerprint(afterFps[1]!)).toBe(fpB_poly);
      // The exterior corner is still a real mitre (arms carry both side corners + shared pivot).
      expect(after[0]!.endLeft && after[0]!.endRight && after[0]!.endPivot).toBeTruthy();
      expect(after[1]!.startLeft && after[1]!.startRight && after[1]!.startPivot).toBeTruthy();
      expect(close(after[0]!.endPivot!, { x: 5, z: 0 })).toBe(true);

      // (b) the interior wall seats clean: not invalid, a 4-gon, positive area, non-self-intersecting.
      expect(after[2]!.invalid).toBeFalsy();
      const fpC = afterFps[2]!;
      expect(fpC.polygon.length).toBe(4);
      expect(Math.abs(signedArea(fpC.polygon))).toBeGreaterThan(0.01);
      expect(selfIntersects(fpC.polygon)).toBe(false);
      // C is a T-attacher onto the frozen corner → NO centreline pivot (no arrow tongue).
      expect(after[2]!.startPivot ?? after[2]!.endPivot).toBeUndefined();

      // (c) ON REOPEN — corners persisted, re-resolve: exterior arms STILL byte-identical.
      const reopen = resolveJunctions([A, B, C]);
      expect(endFingerprint(reopen[0]!, 'end')).toBe(fpA_end);
      expect(endFingerprint(reopen[1]!, 'start')).toBe(fpB_start);
    });
  }

  it('a SAME-type third wall at the corner is UNCHANGED (guard is a no-op — genuine continuation)', () => {
    // All 'ext' → one type → no different-type newcomer → the 3-way Y resolves exactly as
    // it did pre-fix (flag ON == flag OFF for a same-type cluster).
    const C: WallInput = { id: 'C', start: { x: 5, z: 0 }, end: { x: 2, z: 4 }, thickness: 0.3, systemTypeId: 'ext' };
    flag().__pryzmWallV2ExistingCornerImmutable = true;
    const on = resolveJunctions([A, B, C]);
    flag().__pryzmWallV2ExistingCornerImmutable = false;
    const off = resolveJunctions([A, B, C]);
    for (let i = 0; i < 3; i++) {
      expect(endFingerprint(on[i]!, 'start')).toBe(endFingerprint(off[i]!, 'start'));
      expect(endFingerprint(on[i]!, 'end')).toBe(endFingerprint(off[i]!, 'end'));
    }
  });

  it('type-less walls (no systemTypeId) are byte-unchanged — the guard never fires', () => {
    // Every pre-L-130 V2 caller omits systemTypeId; a 3-way corner must resolve as before.
    const a: WallInput = { id: 'A', start: { x: 0, z: 0 }, end: { x: 5, z: 0 }, thickness: 0.2 };
    const b: WallInput = { id: 'B', start: { x: 5, z: 0 }, end: { x: 5, z: 5 }, thickness: 0.2 };
    const c: WallInput = { id: 'C', start: { x: 5, z: 0 }, end: { x: 2, z: 4 }, thickness: 0.2 };
    flag().__pryzmWallV2ExistingCornerImmutable = true;
    const on = resolveJunctions([a, b, c]);
    flag().__pryzmWallV2ExistingCornerImmutable = false;
    const off = resolveJunctions([a, b, c]);
    for (let i = 0; i < 3; i++) {
      expect(endFingerprint(on[i]!, 'start')).toBe(endFingerprint(off[i]!, 'start'));
      expect(endFingerprint(on[i]!, 'end')).toBe(endFingerprint(off[i]!, 'end'));
    }
  });

  it('flag OFF restores the pre-fix V2 behaviour — the different-type newcomer RE-MITRES the corner', () => {
    // This documents the defect: with the guard OFF, arm A\'s end corner is NOT byte-identical to
    // the bare L (the interior wall distorts it). Flag ON (default) is the fix, proven above.
    const C: WallInput = { id: 'C', start: { x: 5, z: 0 }, end: { x: 5, z: -3 }, thickness: 0.1, systemTypeId: 'int' };
    const bare = resolveJunctions([A, B]);
    flag().__pryzmWallV2ExistingCornerImmutable = false;
    const off = resolveJunctions([A, B, C]);
    // At least one exterior arm corner differs when the guard is disabled (the re-mitre defect).
    const changed =
      endFingerprint(off[0]!, 'end') !== endFingerprint(bare[0]!, 'end') ||
      endFingerprint(off[1]!, 'start') !== endFingerprint(bare[1]!, 'start');
    expect(changed).toBe(true);
  });
});
