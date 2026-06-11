// FORMA.6 — pure building-fidelity helper tests (node env, no DOM/Cesium/THREE).
//
// Validates the small pure decisions behind rendering the REAL full-fidelity PRYZM
// building on the Forma flat-ground study view:
//   - the floor-filter "show the monolithic real model vs. fall back to the
//     sliceable per-storey massing" decision
//   - the geometry signature that gates GLB re-export (perf cache)

import { describe, it, expect } from 'vitest';
import {
  realModelStaysVisible,
  buildingGeometrySignature,
  DEFAULT_FORMA_BUILDING_FIDELITY,
} from '../src/ui/geospatial/formaBuildingFidelity';

describe('FORMA.6 default fidelity', () => {
  it("defaults to 'real' (the founder's explicit ask — full element fidelity)", () => {
    expect(DEFAULT_FORMA_BUILDING_FIDELITY).toBe('real');
  });
});

describe('FORMA.6 realModelStaysVisible (floor filter)', () => {
  it('shows the real model when no filter is set (null/undefined/empty = show all)', () => {
    expect(realModelStaysVisible(null, 3)).toBe(true);
    expect(realModelStaysVisible(undefined, 3)).toBe(true);
    expect(realModelStaysVisible([], 3)).toBe(true);
  });

  it('shows the real model when the filter covers every storey', () => {
    expect(realModelStaysVisible([0, 1, 2], 3)).toBe(true);
    // A filter naming more indices than storeys is still "show all".
    expect(realModelStaysVisible([0, 1, 2, 3], 3)).toBe(true);
  });

  it('hides the real model for a PARTIAL filter (falls back to sliceable massing)', () => {
    expect(realModelStaysVisible([0], 3)).toBe(false);
    expect(realModelStaysVisible([1], 3)).toBe(false);
    expect(realModelStaysVisible([0, 1], 3)).toBe(false);
  });

  it('shows the real model on a single-storey building (a 1-storey filter = all)', () => {
    expect(realModelStaysVisible([0], 1)).toBe(true);
  });
});

describe('FORMA.6 buildingGeometrySignature (re-export cache key)', () => {
  const base = {
    walls: [
      { a: { x: 0, z: 0 }, b: { x: 5, z: 0 }, height: 3, thickness: 0.2 },
      { a: { x: 5, z: 0 }, b: { x: 5, z: 4 }, height: 3, thickness: 0.2 },
    ],
    openings: [{ a: { x: 1, z: 0 }, height: 1.2 }],
    slabCount: 1,
    roofCount: 1,
    stairCount: 0,
    furnitureCount: 4,
  };

  it('is deterministic for identical geometry (cache hit → no re-export)', () => {
    expect(buildingGeometrySignature(base)).toBe(buildingGeometrySignature({ ...base }));
  });

  it('changes when a wall moves (an edit forces a re-export)', () => {
    const moved = {
      ...base,
      walls: [{ ...base.walls[0]!, b: { x: 6, z: 0 } }, base.walls[1]!],
    };
    expect(buildingGeometrySignature(moved)).not.toBe(buildingGeometrySignature(base));
  });

  it('changes when an opening (window/door) is added', () => {
    const added = {
      ...base,
      openings: [...base.openings, { a: { x: 5, z: 2 }, height: 1.0 }],
    };
    expect(buildingGeometrySignature(added)).not.toBe(buildingGeometrySignature(base));
  });

  it('changes when furniture / slab / roof / stair counts change', () => {
    expect(buildingGeometrySignature({ ...base, furnitureCount: 5 })).not.toBe(
      buildingGeometrySignature(base),
    );
    expect(buildingGeometrySignature({ ...base, slabCount: 2 })).not.toBe(
      buildingGeometrySignature(base),
    );
    expect(buildingGeometrySignature({ ...base, roofCount: 0 })).not.toBe(
      buildingGeometrySignature(base),
    );
    expect(buildingGeometrySignature({ ...base, stairCount: 1 })).not.toBe(
      buildingGeometrySignature(base),
    );
  });

  it('is stable across element ADD even when counts overlap (hash distinguishes positions)', () => {
    const a = { ...base, walls: [base.walls[0]!] };
    const b = { ...base, walls: [base.walls[1]!] };
    // Same wall count (1) but different endpoints → different signature.
    expect(buildingGeometrySignature(a)).not.toBe(buildingGeometrySignature(b));
  });
});
