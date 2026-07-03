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
});
