// §FIX-WALL-3RD-AT-LCORNER-IMMUTABLE (L-146, founder 2026-07-07).
//
// THE founder defect (CRITICAL): two walls meet in a clean mitred L (shared corner vertex).
// The user starts a THIRD wall whose FIRST point lands a few MILLIMETRES off that shared vertex
// (below the snap tolerance → placed free). `JunctionResolverV2` clusters the near endpoint into
// the corner node and runs a 3-way miter around the DRAGGED centroid → the TWO EXISTING walls
// deform. The founder's decisive refinement: EXACTLY on the vertex is sound (clean 3-way Y), and
// on a wall MID-POINT is sound (clean T) — ONLY the near-but-not-exact start malforms.
//
// The L-130 guard already froze an existing corner + re-seated the newcomer as a T, but it is
// keyed on a DIFFERENT systemTypeId, so a SAME-type (or the common type-less V2) newcomer slipped
// through. This is the type-INDEPENDENT generalisation, keyed on coincidence TIGHTNESS.
//
// This suite locks: (a) a few-mm-off SAME-type / type-less newcomer leaves the two existing walls'
// miter corners + footprints BYTE-IDENTICAL and seats itself as a clean butt; (b) the EXACT-vertex
// 3-way Y is unchanged (regression guard); (c) a wall MID-POINT T is unchanged (regression guard);
// (d) a collinear straight-run + tee (L-44) is unchanged; (e) flag OFF restores the drag defect.

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

// Clean mitred L (thick 0.2) at the shared corner (5,0). BOTH arms same (type-less) — the
// founder's exact scenario: a plain wall drawn against a plain-wall corner.
const A: WallInput = { id: 'A', start: { x: 0, z: 0 }, end: { x: 5, z: 0 }, thickness: 0.2 };
const B: WallInput = { id: 'B', start: { x: 5, z: 0 }, end: { x: 5, z: 5 }, thickness: 0.2 };

const flag = () => (globalThis as { __pryzmWallV2ThirdAtLCornerImmutable?: boolean });
afterEach(() => { delete flag().__pryzmWallV2ThirdAtLCornerImmutable; });

describe('JunctionResolverV2 — §FIX-WALL-3RD-AT-LCORNER-IMMUTABLE (L-146)', () => {
  // A few-mm-off third wall started near the corner (5,0), pointing several ways.
  const CASES: Array<[string, Pt2, Pt2]> = [
    ['3rd wall a few mm off, into the room (diagonal)',       { x: 5.003, z: 0.004 }, { x: 2, z: 3 }],
    ['3rd wall a few mm off, straight down (collinear w/ B)', { x: 5.002, z: -0.003 }, { x: 5, z: -3 }],
    ['3rd wall a few mm off, back along A (perpendicular)',   { x: 4.996, z: 0.003 }, { x: 5, z: 3 }],
    ['3rd wall ~a cm off, within the loose band',             { x: 4.99, z: 0.008 }, { x: 2.5, z: 2.5 }],
  ];

  for (const [label, cs, ce] of CASES) {
    it(`the two existing walls stay BYTE-IDENTICAL + the 3rd wall seats clean — ${label}`, () => {
      // (baseline) resolve the clean L ALONE — the immutable reference.
      const bare = resolveJunctions([A, B]);
      const bareFps = buildAllFootprints([A, B], bare);
      const fpA_end = endFingerprint(bare[0]!, 'end'), fpB_start = endFingerprint(bare[1]!, 'start');
      const fpA_poly = fpFingerprint(bareFps[0]!), fpB_poly = fpFingerprint(bareFps[1]!);

      // add the near-corner third wall C (SAME / type-less — no L-130 systemTypeId help).
      const C: WallInput = { id: 'C', start: cs, end: ce, thickness: 0.2 };
      const after = resolveJunctions([A, B, C]);
      const afterFps = buildAllFootprints([A, B, C], after);

      // (a) the EXISTING walls are byte-identical — miter corners AND footprint (truly immutable).
      expect(endFingerprint(after[0]!, 'end')).toBe(fpA_end);
      expect(endFingerprint(after[1]!, 'start')).toBe(fpB_start);
      expect(fpFingerprint(afterFps[0]!)).toBe(fpA_poly);
      expect(fpFingerprint(afterFps[1]!)).toBe(fpB_poly);
      // The existing corner is still a real mitre pivoting on the shared vertex (5,0).
      expect(after[0]!.endLeft && after[0]!.endRight && after[0]!.endPivot).toBeTruthy();
      expect(after[1]!.startLeft && after[1]!.startRight && after[1]!.startPivot).toBeTruthy();
      expect(close(after[0]!.endPivot!, { x: 5, z: 0 })).toBe(true);

      // (b) the 3rd wall seats clean: not invalid, a 4-gon, positive area, non-self-intersecting,
      //     and — as a T-attacher onto the frozen corner — carries NO centreline pivot (no spike).
      expect(after[2]!.invalid).toBeFalsy();
      const fpC = afterFps[2]!;
      expect(fpC.polygon.length).toBe(4);
      expect(Math.abs(signedArea(fpC.polygon))).toBeGreaterThan(0.01);
      expect(selfIntersects(fpC.polygon)).toBe(false);
      expect(after[2]!.startPivot ?? after[2]!.endPivot).toBeUndefined();
    });
  }

  it('EXACT-vertex 3-way Y is UNCHANGED (regression guard: sound case stays sound)', () => {
    // All three co-terminate exactly at (5,0). All tight together ⇒ NO outsider ⇒ guard no-op ⇒
    // the clean 3-way Y resolves exactly as it did pre-fix (flag ON == flag OFF).
    const C: WallInput = { id: 'C', start: { x: 5, z: 0 }, end: { x: 2, z: 4 }, thickness: 0.2 };
    flag().__pryzmWallV2ThirdAtLCornerImmutable = true;
    const on = resolveJunctions([A, B, C]);
    flag().__pryzmWallV2ThirdAtLCornerImmutable = false;
    const off = resolveJunctions([A, B, C]);
    for (let i = 0; i < 3; i++) {
      expect(endFingerprint(on[i]!, 'start')).toBe(endFingerprint(off[i]!, 'start'));
      expect(endFingerprint(on[i]!, 'end')).toBe(endFingerprint(off[i]!, 'end'));
    }
    // And every arm co-terminates with a real, non-degenerate footprint (a genuine Y, not a spike).
    const fps = buildAllFootprints([A, B, C], on);
    for (let i = 0; i < 3; i++) expect(Math.abs(signedArea(fps[i]!.polygon))).toBeGreaterThan(0.1);
  });

  it('a wall MID-POINT T (the founder\'s "perfect on midpoint") is UNCHANGED', () => {
    // C tees onto arm A's BODY well inside its span (a natural mid-span T) — A still mitres with B,
    // C butts flat. Flag ON must equal flag OFF (this path is not co-terminating at the corner).
    const C: WallInput = { id: 'C', start: { x: 2.5, z: 0 }, end: { x: 2.5, z: 4 }, thickness: 0.2 };
    flag().__pryzmWallV2ThirdAtLCornerImmutable = true;
    const on = resolveJunctions([A, B, C]);
    flag().__pryzmWallV2ThirdAtLCornerImmutable = false;
    const off = resolveJunctions([A, B, C]);
    for (let i = 0; i < 3; i++) {
      expect(endFingerprint(on[i]!, 'start')).toBe(endFingerprint(off[i]!, 'start'));
      expect(endFingerprint(on[i]!, 'end')).toBe(endFingerprint(off[i]!, 'end'));
    }
    // A still mitres with B at the corner (5,0); C is a clean 4-gon butt with no centreline pivot.
    expect(on[0]!.endPivot && close(on[0]!.endPivot, { x: 5, z: 0 })).toBe(true);
    const fpC = buildWallFootprint(C, on[2]!);
    expect(fpC.polygon.length).toBe(4);
    expect(on[2]!.startPivot).toBeUndefined();
  });

  it('a collinear straight-run + perpendicular tee (L-44) is UNCHANGED (not a corner)', () => {
    // Two COLLINEAR bar walls co-terminate at (4,0) + a perpendicular stem a few mm off. The bars
    // form a straight run (NOT a corner) → formsCorner=false → guard no-op → pre-fix behaviour.
    const barL: WallInput = { id: 'barL', start: { x: 0, z: 0 }, end: { x: 4, z: 0 }, thickness: 0.2 };
    const barR: WallInput = { id: 'barR', start: { x: 4, z: 0 }, end: { x: 8, z: 0 }, thickness: 0.16 };
    const stem: WallInput = { id: 'stem', start: { x: 4, z: 0.004 }, end: { x: 4, z: 4 }, thickness: 0.1 };
    flag().__pryzmWallV2ThirdAtLCornerImmutable = true;
    const on = resolveJunctions([barL, barR, stem]);
    flag().__pryzmWallV2ThirdAtLCornerImmutable = false;
    const off = resolveJunctions([barL, barR, stem]);
    for (let i = 0; i < 3; i++) {
      expect(endFingerprint(on[i]!, 'start')).toBe(endFingerprint(off[i]!, 'start'));
      expect(endFingerprint(on[i]!, 'end')).toBe(endFingerprint(off[i]!, 'end'));
    }
    // The stem still PARTICIPATES (real start corners, not a free square cap) — pre-fix invariant.
    const stemM = on.find(m => m.id === 'stem')!;
    expect(stemM.startLeft).toBeDefined();
    expect(stemM.startRight).toBeDefined();
  });

  it('flag OFF restores the pre-fix DRAG defect (documents the bug)', () => {
    // With the guard OFF, the near-corner newcomer drags the 3-way centroid off the vertex →
    // at least one existing arm corner is NO LONGER byte-identical to the bare L.
    const C: WallInput = { id: 'C', start: { x: 5.003, z: 0.004 }, end: { x: 2, z: 3 }, thickness: 0.2 };
    const bare = resolveJunctions([A, B]);
    flag().__pryzmWallV2ThirdAtLCornerImmutable = false;
    const off = resolveJunctions([A, B, C]);
    const changed =
      endFingerprint(off[0]!, 'end') !== endFingerprint(bare[0]!, 'end') ||
      endFingerprint(off[1]!, 'start') !== endFingerprint(bare[1]!, 'start');
    expect(changed).toBe(true);
  });
});
