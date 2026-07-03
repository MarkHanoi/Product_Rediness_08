// §FIX-WALL-LCORNER-T-CLEAN (L-61, founder 2026-07-03) — an L-corner (two walls sharing an
// endpoint) that ALSO receives a THIRD wall teeing onto one arm near the corner must render
// COMPLETELY clean: the L-arms keep their mitre, the tee butts flat on the arm's face, and
// NO footprint carries a centreline spike / tongue nor a doubled (near-coincident parallel,
// same-direction) edge overlapping a neighbour.
//
// THE bug: when the tee wall's endpoint lands inside the 0.20 m §RESI-L0 cluster band of the
// corner node, `clusterEndpoints` fused it into the A+B corner cluster; §FIX-WALL-TJUNCTION-
// BUTT then reclassified the hit arm A → passthrough, DISSOLVING the A–B mitre — A square-
// capped straight through the corner (spike) and its outer face overlapped B (doubled edge).
// The fix SPLITS the tee-attacher into its own T-junction on A's body while A+B resolve as
// the clean L they are.

import { describe, it, expect } from 'vitest';
import { resolveJunctions, type WallInput, type Pt2, type WallMiter } from '../src/JunctionResolverV2';
import { buildWallFootprint, buildAllFootprints, type WallFootprint } from '../src/WallFootprint2D';

const sub = (a: Pt2, b: Pt2): Pt2 => ({ x: a.x - b.x, z: a.z - b.z });
const len = (a: Pt2): number => Math.hypot(a.x, a.z);
const cross = (a: Pt2, b: Pt2): number => a.x * b.z - a.z * b.x;
const close = (p: Pt2, q: Pt2, eps = 1e-6): boolean => Math.abs(p.x - q.x) < eps && Math.abs(p.z - q.z) < eps;

function signedArea(poly: readonly Pt2[]): number {
  let s = 0;
  for (let i = 0; i < poly.length; i++) { const a = poly[i]!, b = poly[(i + 1) % poly.length]!; s += a.x * b.z - b.x * a.z; }
  return s / 2;
}

/** A polygon has NO repeated (degenerate zero-length) edge. */
function hasNoRepeatedVertex(poly: readonly Pt2[]): boolean {
  for (let i = 0; i < poly.length; i++) if (close(poly[i]!, poly[(i + 1) % poly.length]!)) return false;
  return true;
}

/** Genuine DOUBLING across walls: two parallel edges from DIFFERENT walls, traversed the SAME
 *  way (material on the same side → two coincident lines where there should be one). Shared
 *  mitre seams run OPPOSITE ways and are excluded. Returns the offending edge pairs. */
function doubledEdges(fps: WallFootprint[]): string[] {
  const edges: { id: string; a: Pt2; b: Pt2 }[] = [];
  for (const fp of fps) { const p = fp.polygon; for (let i = 0; i < p.length; i++) edges.push({ id: fp.id, a: p[i]!, b: p[(i + 1) % p.length]! }); }
  const out: string[] = [];
  for (let i = 0; i < edges.length; i++) for (let j = i + 1; j < edges.length; j++) {
    const e1 = edges[i]!, e2 = edges[j]!;
    if (e1.id === e2.id) continue;
    const d1 = sub(e1.b, e1.a), d2 = sub(e2.b, e2.a);
    const L1 = len(d1), L2 = len(d2);
    if (L1 < 0.05 || L2 < 0.05) continue;
    const u1 = { x: d1.x / L1, z: d1.z / L1 }, u2 = { x: d2.x / L2, z: d2.z / L2 };
    if (u1.x * u2.x + u1.z * u2.z < 0.97) continue;               // same direction only
    const nrm = { x: -u1.z, z: u1.x };
    const perp = Math.abs(sub(e2.a, e1.a).x * nrm.x + sub(e2.a, e1.a).z * nrm.z);
    const t2a = sub(e2.a, e1.a).x * u1.x + sub(e2.a, e1.a).z * u1.z;
    const t2b = sub(e2.b, e1.a).x * u1.x + sub(e2.b, e1.a).z * u1.z;
    const overlap = Math.min(L1, Math.max(t2a, t2b)) - Math.max(0, Math.min(t2a, t2b));
    if (perp < 0.02 && overlap > 0.05) out.push(`${e1.id}||${e2.id} perp=${perp.toFixed(4)} ovl=${overlap.toFixed(3)}`);
  }
  return out;
}

/** A "tongue" vertex: a footprint vertex that protrudes markedly off the chord between its two
 *  neighbours while BOTH neighbour edges are short (a thin triangular spike into the junction). */
function tongueVertices(poly: readonly Pt2[]): Pt2[] {
  const out: Pt2[] = [];
  const n = poly.length;
  for (let i = 0; i < n; i++) {
    const p0 = poly[(i - 1 + n) % n]!, p1 = poly[i]!, p2 = poly[(i + 1) % n]!;
    const chord = sub(p2, p0); const L = len(chord); if (L < 1e-6) continue;
    const nrm = { x: -chord.z / L, z: chord.x / L };
    const h = Math.abs(sub(p1, p0).x * nrm.x + sub(p1, p0).z * nrm.z);
    const e0 = len(sub(p1, p0)), e1 = len(sub(p2, p1));
    if (h > 0.04 && e0 < 0.16 && e1 < 0.16) out.push(p1);   // both neighbour edges < a wall thickness
  }
  return out;
}

// L-corner: A horizontal (0,0)→(5,0), B vertical (5,0)→(5,5) sharing the corner (5,0).
const A: WallInput = { id: 'A', start: { x: 0, z: 0 }, end: { x: 5, z: 0 }, thickness: 0.2 };
const B: WallInput = { id: 'B', start: { x: 5, z: 0 }, end: { x: 5, z: 5 }, thickness: 0.2 };

describe('JunctionResolverV2 — L-corner + 3rd-wall-T (L-61)', () => {
  it('C tees mid-span on arm A NEAR the corner: A+B keep their L-mitre, C butts flat, no spike, no doubling', () => {
    const C: WallInput = { id: 'C', start: { x: 4.85, z: 0 }, end: { x: 4.85, z: 4 }, thickness: 0.2 };
    const walls = [A, B, C];
    const miters = resolveJunctions(walls);
    const fps = buildAllFootprints(walls, miters);
    const [mA, mB, mC] = miters;
    const [fpA, fpB, fpC] = fps;

    // (1) The A–B L-mitre is PRESERVED (not dissolved): A's end and B's start carry mitre
    //     corners and both share the centreline pivot at the corner (5,0).
    expect(mA!.endLeft).toBeDefined();
    expect(mA!.endRight).toBeDefined();
    expect(mB!.startLeft).toBeDefined();
    expect(mB!.startRight).toBeDefined();
    expect(mA!.endPivot && close(mA!.endPivot, { x: 5, z: 0 })).toBe(true);
    expect(mB!.startPivot && close(mB!.startPivot, { x: 5, z: 0 })).toBe(true);
    // Byte-identical to the L with NO third wall present (C never perturbs A or B).
    const bare = resolveJunctions([A, B]);
    for (const k of ['endLeft', 'endRight', 'endPivot'] as const) expect(close(mA![k]!, bare[0]![k]!)).toBe(true);
    for (const k of ['startLeft', 'startRight', 'startPivot'] as const) expect(close(mB![k]!, bare[1]![k]!)).toBe(true);

    // (2) C is a clean flat butt on A's near face (z = +halfThickness = 0.1): a 4-vertex quad,
    //     positive area, no repeated vertex, no centreline pivot / tongue.
    expect(mC!.startPivot).toBeUndefined();
    expect(fpC!.polygon.length).toBe(4);
    expect(Math.abs(signedArea(fpC!.polygon))).toBeGreaterThan(0.5);
    expect(hasNoRepeatedVertex(fpC!.polygon)).toBe(true);
    for (const v of fpC!.polygon) expect(Math.abs(v.z) < 4.001 && v.z >= 0.0999).toBe(true); // butts at z≥0.1

    // (3) NO tongue vertices in any footprint, and NO doubled edges across walls.
    for (const fp of fps) expect(tongueVertices(fp!.polygon)).toEqual([]);
    expect(doubledEdges(fps)).toEqual([]);
  });

  it('C meets the shared corner vertex exactly (a genuine 3-way Y): clean fan, no doubling', () => {
    const C: WallInput = { id: 'C', start: { x: 5, z: 0 }, end: { x: 2, z: 4 }, thickness: 0.2 };
    const walls = [A, B, C];
    const miters = resolveJunctions(walls);
    const fps = buildAllFootprints(walls, miters);
    // All three co-terminate → each gets real mitre corners and the shared centreline pivot;
    // every footprint has real (non-degenerate) area and no doubled edge across walls.
    for (let i = 0; i < 3; i++) {
      expect(miters[i]!.invalid).toBeFalsy();
      expect(Math.abs(signedArea(fps[i]!.polygon))).toBeGreaterThan(0.5);
      expect(hasNoRepeatedVertex(fps[i]!.polygon)).toBe(true);
    }
    expect(doubledEdges(fps)).toEqual([]);
  });

  it('C tees mid-span FAR from the corner (unchanged clean T): A passes straight, C butts', () => {
    const C: WallInput = { id: 'C', start: { x: 2.5, z: 0 }, end: { x: 2.5, z: 4 }, thickness: 0.2 };
    const walls = [A, B, C];
    const miters = resolveJunctions(walls);
    const fps = buildAllFootprints(walls, miters);
    // A still mitres with B at the corner; C is a clean 4-gon butt; no doubling.
    expect(miters[0]!.endPivot && close(miters[0]!.endPivot, { x: 5, z: 0 })).toBe(true);
    expect(fps[2]!.polygon.length).toBe(4);
    expect(doubledEdges(fps)).toEqual([]);
    for (const fp of fps) expect(tongueVertices(fp!.polygon)).toEqual([]);
  });

  it('the simple near-end T of L-27 (host + guest, no corner) is byte-unchanged', () => {
    // Host H full wall; guest G butts H's body near H\'s end. No co-terminating corner exists,
    // so the split pass is a no-op and the existing reclassification still applies.
    const H: WallInput = { id: 'H', start: { x: 0, z: 0 }, end: { x: 5, z: 0 }, thickness: 0.2 };
    const G: WallInput = { id: 'G', start: { x: 4.85, z: 0 }, end: { x: 4.85, z: 3 }, thickness: 0.2 };
    const m = resolveJunctions([H, G]);
    // H is the passthrough (free square cap at its end); G butts flat with real start corners.
    expect(m[0]!.endLeft).toBeUndefined();
    expect(m[0]!.endRight).toBeUndefined();
    expect(m[1]!.startLeft).toBeDefined();
    expect(m[1]!.startRight).toBeDefined();
    expect(m[1]!.startPivot).toBeUndefined();               // T-attacher carries no centreline pivot
    const fpG = buildWallFootprint(G, m[1]!);
    expect(fpG.polygon.length).toBe(4);
    expect(hasNoRepeatedVertex(fpG.polygon)).toBe(true);
  });
});
