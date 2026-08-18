// §FIX-PLAN-LAYERED-WALL-SYMBOL (L-62) — the PLAN view of a LAYERED wall must show the
// internal layer-boundary lines (core + finishes), not just the plain single-volume outline.
// This suite pins the pure geometry: the N−1 internal boundary lines match the 3D
// WallFragmentBuilder layer offsets, are clipped at openings that cross the cut plane, and a
// plain (single-layer) wall emits nothing.

import { describe, it, expect } from 'vitest';
import { computeWallLayerLines, type LayerLineWall } from '../src/WallLayerPlanLines';

const CUT = 1.2;

/** A 3-layer interior partition (10/80/10 mm-ish, exaggerated) along +x at z=0. */
function threeLayerWall(overrides: Partial<LayerLineWall> = {}): LayerLineWall {
  return {
    baseLine: [{ x: 0, y: 0, z: 0 }, { x: 5, y: 0, z: 0 }],
    layers: [{ thickness: 0.02 }, { thickness: 0.16 }, { thickness: 0.02 }],
    openings: [],
    ...overrides,
  };
}

describe('computeWallLayerLines (L-62)', () => {
  it('a plain (single-layer) wall emits NO layer lines', () => {
    expect(computeWallLayerLines({ baseLine: [{ x: 0, z: 0 }, { x: 5, z: 0 }], layers: [{ thickness: 0.2 }] }, CUT)).toEqual([]);
    expect(computeWallLayerLines({ baseLine: [{ x: 0, z: 0 }, { x: 5, z: 0 }] }, CUT)).toEqual([]);
  });

  it('a curved layered wall is skipped (separate path)', () => {
    expect(computeWallLayerLines(threeLayerWall({ curve: {} }), CUT)).toEqual([]);
  });

  it('N layers → N−1 internal boundary lines at the exact 3D offsets (centred on the baseline)', () => {
    const segs = computeWallLayerLines(threeLayerWall(), CUT);
    // 3 layers → 2 internal boundaries. total = 0.20, centred → boundaries at
    // −0.10+0.02 = −0.08 and −0.08+0.16 = +0.08 (the two outer faces ±0.10 are NOT emitted).
    const offsets = [...new Set(segs.map(s => Number(s.offset.toFixed(4))))].sort((a, b) => a - b);
    expect(offsets).toEqual([-0.08, 0.08]);
    // Each boundary line runs the full baseline length along +x, offset perpendicular (±z).
    for (const s of segs) {
      expect(Math.abs(s.az - s.offset)).toBeLessThan(1e-9);   // outward normal of +x is +z
      expect(Math.abs(s.bz - s.offset)).toBeLessThan(1e-9);
      expect(Math.min(s.ax, s.bx)).toBeCloseTo(0, 6);
      expect(Math.max(s.ax, s.bx)).toBeCloseTo(5, 6);
    }
  });

  it('a door opening that crosses the cut plane BREAKS the layer lines at the void', () => {
    // Door: offset 2.0, width 1.0 → void span [2.0, 3.0]; sill 0, height 2.1 → crosses cut 1.2.
    const segs = computeWallLayerLines(
      threeLayerWall({ openings: [{ offset: 2.0, width: 1.0, sillHeight: 0, height: 2.1 }] }),
      CUT,
    );
    // 2 boundaries × 2 kept intervals ([0,2] and [3,5]) = 4 segments.
    expect(segs.length).toBe(4);
    // No segment spans the void [2,3].
    for (const s of segs) {
      const lo = Math.min(s.ax, s.bx), hi = Math.max(s.ax, s.bx);
      expect(hi <= 2.0 + 1e-6 || lo >= 3.0 - 1e-6).toBe(true);
    }
    // The kept intervals terminate exactly at the void edges (2.0 and 3.0).
    const xs = segs.flatMap(s => [Number(s.ax.toFixed(4)), Number(s.bx.toFixed(4))]);
    expect(xs).toContain(2.0);
    expect(xs).toContain(3.0);
  });

  it('a HIGH window whose void does NOT cross the cut plane leaves the layer lines intact', () => {
    // Clerestory: sill 1.8, height 0.4 → void [1.8, 2.2], cut 1.2 is BELOW it → no break.
    const segs = computeWallLayerLines(
      threeLayerWall({ openings: [{ offset: 2.0, width: 1.0, sillHeight: 1.8, height: 0.4 }] }),
      CUT,
    );
    expect(segs.length).toBe(2); // 2 boundaries, uninterrupted full-length
    for (const s of segs) {
      expect(Math.min(s.ax, s.bx)).toBeCloseTo(0, 6);
      expect(Math.max(s.ax, s.bx)).toBeCloseTo(5, 6);
    }
  });

  it('offsets follow the wall direction: a wall along +z puts the boundaries on ±x', () => {
    const segs = computeWallLayerLines(
      { baseLine: [{ x: 3, y: 0, z: 0 }, { x: 3, y: 0, z: 5 }], layers: [{ thickness: 0.05 }, { thickness: 0.05 }] },
      CUT,
    );
    // 2 layers → 1 boundary at 0 (centre). outward of +z dir = (−1, 0) → line at x = 3 + (−1)*0 = 3.
    expect(segs.length).toBe(1);
    expect(segs[0]!.offset).toBeCloseTo(0, 9);
    expect(segs[0]!.ax).toBeCloseTo(3, 6);
    expect(segs[0]!.bx).toBeCloseTo(3, 6);
  });

  // ─── §FEAT-RAKE-LAYERED (founder 2026-08-18) ────────────────────────────────────────
  // A plan IS a horizontal section at `cutRelToBase`. Once the wall leans, the section
  // through it both MOVES and the bands WIDEN. Both corrections, or plan and 3D disagree —
  // and the whole point of L-62 was that plan and 3D must show the same wall.

  it('a RAKED layered wall: bands widen to t / sin θ AND the section slides by cut · cot θ', () => {
    const RAKE = 80;
    const sin = Math.sin((RAKE * Math.PI) / 180);
    const cot = Math.cos((RAKE * Math.PI) / 180) / sin;
    const segs = computeWallLayerLines(threeLayerWall({ rakeAngleDeg: RAKE }), CUT);

    const total = 0.2 / sin;
    const shear = CUT * cot;
    const expected = [
      -total / 2 + shear + 0.02 / sin,
      -total / 2 + shear + 0.02 / sin + 0.16 / sin,
    ];
    const offsets = [...new Set(segs.map(s => s.offset))].sort((a, b) => a - b);
    expect(offsets).toHaveLength(2);
    expect(offsets[0]).toBeCloseTo(expected[0]!, 12);
    expect(offsets[1]).toBeCloseTo(expected[1]!, 12);

    // The two corrections are INDEPENDENT and both present: the SPACING between the
    // boundaries is the middle layer's widened plan thickness…
    expect(offsets[1]! - offsets[0]!).toBeCloseTo(0.16 / sin, 12);
    expect(offsets[1]! - offsets[0]!).toBeGreaterThan(0.16);      // strictly wider than authored
    // …and their MIDPOINT is the SHEARED centreline, not the un-sheared one.
    expect((offsets[0]! + offsets[1]!) / 2).toBeCloseTo(shear, 12);
    expect(shear).toBeCloseTo(0.211592, 6);
  });

  it('the plan section is CUT-HEIGHT dependent under a rake, and only under a rake', () => {
    const at = (cut: number, rake?: number): number[] =>
      [...new Set(computeWallLayerLines(threeLayerWall({ rakeAngleDeg: rake }), cut).map(s => s.offset))]
        .sort((a, b) => a - b);
    // Vertical: the same two lines at any cut height — today's drawing, unmoved.
    expect(at(0.5)).toEqual(at(2.5));
    // Rounded to 4 dp for the same reason the L-62 case above rounds: the cursor walk
    // accumulates in binary, so −0.1 + 0.02 has always been −0.07999999999999999 here.
    // That is pre-existing arithmetic, not something this feature introduced — the
    // identity test below compares raw values against the un-raked output and passes.
    expect(at(1.2).map(v => Number(v.toFixed(4)))).toEqual([-0.08, 0.08]);
    // Raked: a higher cut sits further along the outward normal, by exactly Δcut · cot θ.
    const cot80 = Math.cos((80 * Math.PI) / 180) / Math.sin((80 * Math.PI) / 180);
    expect(at(2.5, 80)[0]! - at(0.5, 80)[0]!).toBeCloseTo(2.0 * cot80, 12);
  });

  it('a 90° / absent rake is the IDENTITY — the pre-feature drawing, to the last bit', () => {
    const plain = computeWallLayerLines(threeLayerWall(), CUT);
    for (const r of [90, undefined]) {
      expect(computeWallLayerLines(threeLayerWall({ rakeAngleDeg: r }), CUT)).toEqual(plain);
    }
  });
});
