/**
 * FloorFinishSeating.test.ts — §A.21.D48.
 *
 * The floor FINISH must not be COINCIDENT with the structural SLAB: it is a thin
 * layer that RESTS ON the slab top, so finish & slab volumes are DISJOINT
 * (finish strictly above slab top) — no Z-fighting, meaningful clash detection.
 */

import { describe, it, expect } from 'vitest';
import { resolveFinishSeating, DEFAULT_FINISH_THICKNESS_M } from './FloorTypes.js';

/**
 * Reproduce the FloorPanelBuilder geometry rule for a given seating result:
 *   finish top    = level.elevation + baseOffset
 *   finish bottom = finish top − thickness
 * Returns the finish Y-band in world coordinates for a given level elevation.
 */
function finishBand(seating: { thickness: number; baseOffset: number }, levelElevation: number) {
  const top = levelElevation + seating.baseOffset;
  const bottom = top - seating.thickness;
  return { bottom, top };
}

/**
 * Default PRYZM slab: top face anchored to the level datum, body extends DOWNWARD
 * by thickness. (SlabFragmentBuilder.resolveWorldY: slab top = level.elevation + baseOffset.)
 */
function slabBand(levelElevation: number, slabBaseOffset: number, slabThickness: number) {
  const top = levelElevation + slabBaseOffset;
  const bottom = top - slabThickness;
  return { bottom, top };
}

describe('§A.21.D48 — resolveFinishSeating', () => {
  it('bare finish floor → thin layer (default thickness) seated ON the slab top', () => {
    const seating = resolveFinishSeating({});
    expect(seating.thickness).toBe(DEFAULT_FINISH_THICKNESS_M);
    // baseOffset = slabTopOffset(0) + finishThickness → finish bottom == slab top (datum).
    expect(seating.baseOffset).toBeCloseTo(DEFAULT_FINISH_THICKNESS_M, 9);
  });

  it('finish bottom rests AT the slab top (>= slab top, never inside the slab)', () => {
    const levelElevation = 3.0;
    const slabThickness = 0.2;
    const slab = slabBand(levelElevation, 0, slabThickness);

    const seating = resolveFinishSeating({ slabTopOffsetM: 0 });
    const finish = finishBand(seating, levelElevation);

    expect(finish.bottom).toBeGreaterThanOrEqual(slab.top - 1e-9);
    // Disjoint volumes: finish.bottom >= slab.top means no shared interior.
    expect(finish.bottom).toBeCloseTo(slab.top, 9);
    expect(finish.top).toBeGreaterThan(slab.top); // strictly above → no Z-fighting
  });

  it('legacy coincident placement is GONE — finish never occupies the slab band', () => {
    // OLD behaviour (regression guard): thickness 0.075, baseOffset 0 → finish band
    // [datum-0.075, datum], coincident with a 0.2 slab's top 75 mm. New default must
    // NOT reproduce that.
    const levelElevation = 0;
    const slab = slabBand(levelElevation, 0, 0.2);
    const seating = resolveFinishSeating({});
    const finish = finishBand(seating, levelElevation);

    // No overlap between (finish.bottom, finish.top) and (slab.bottom, slab.top).
    const overlap = Math.min(finish.top, slab.top) - Math.max(finish.bottom, slab.bottom);
    expect(overlap).toBeLessThanOrEqual(1e-9); // touching at the top face only
  });

  it('honours an explicit baseOffset verbatim (manual / IFC-pinned floors)', () => {
    const seating = resolveFinishSeating({ baseOffset: 0.5, thickness: 0.08 });
    expect(seating.baseOffset).toBe(0.5);
    expect(seating.thickness).toBe(0.08);
  });

  it('explicit thickness (structural floor) is kept but seated on the slab top', () => {
    const seating = resolveFinishSeating({ thickness: 0.1, slabTopOffsetM: 0 });
    expect(seating.thickness).toBe(0.1);
    // bottom seated on slab top: baseOffset - thickness == slabTopOffset(0).
    expect(seating.baseOffset - seating.thickness).toBeCloseTo(0, 9);
  });

  it('layered build-up is seated on the slab top (bottom == slab top)', () => {
    const seating = resolveFinishSeating({ hasLayers: true, thickness: 0.05, slabTopOffsetM: 0 });
    expect(seating.baseOffset - seating.thickness).toBeCloseTo(0, 9);
  });

  it('seats above a RAISED slab top (slabTopOffsetM > 0)', () => {
    const seating = resolveFinishSeating({ slabTopOffsetM: 0.15 });
    // finish bottom = baseOffset - thickness == slabTopOffset.
    expect(seating.baseOffset - seating.thickness).toBeCloseTo(0.15, 9);
  });

  it('custom finish thickness flows through', () => {
    const seating = resolveFinishSeating({ finishThicknessM: 0.02 });
    expect(seating.thickness).toBe(0.02);
    expect(seating.baseOffset).toBeCloseTo(0.02, 9);
  });
});
