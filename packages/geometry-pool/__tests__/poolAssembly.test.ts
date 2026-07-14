// §FEAT-SWIMMING-POOL-ELEMENT (L-292) — the pool ASSEMBLY guards.
//
// ═══════════════════════════════════════════════════════════════════════════════
// A NOTE ON HOW THESE ASSERTIONS WERE WRITTEN, BECAUSE IT IS THE POINT.
// ═══════════════════════════════════════════════════════════════════════════════
// The founder's warning, from his own mistake the same week: he wrote a guard for a
// circular column drawn as a SQUARE, asserting "a circle has every point at the same
// radius" — and a square's four CORNERS are also equidistant from its centre, so the
// bug scored a perfect 1.000 and would have PASSED.
//
// **FOR EACH ASSERTION BELOW, ASK WHAT THE BUG WOULD SCORE.** Each one names the
// specific defect it would catch, and each was made to go RED before being made to
// go green (see the report). An assertion the bug passes is not a guard.

import { describe, it, expect } from 'vitest';
import { Pool, Water } from '@pryzm/schemas';
import {
  buildPoolAssembly,
  waterVolumeOf,
  planAreaOf,
  POOL_DIMENSION_DEFAULTS,
  type PoolPartIds,
} from '../src/index.js';

/** A 4 × 2 m pool on a level whose datum is y = 0. Area = 8 m². */
function makePool(overrides: Partial<Pool> = {}): Pool {
  return Pool.parse({
    levelId: 'level-1',
    hostSlabId: 'slab_01ARZ3NDEKTSV4RRFFQ69G5FAV',
    boundary: [
      { x: 0, y: 0, z: 0 },
      { x: 4, y: 0, z: 0 },
      { x: 4, y: 0, z: 2 },
      { x: 0, y: 0, z: 2 },
    ],
    ...overrides,
  });
}

const IDS: PoolPartIds = {
  wallIds: ['wall-a', 'wall-b', 'wall-c', 'wall-d'],
  floorSlabId: 'slab-floor',
  waterId: 'water-1',
};

describe('§FEAT-SWIMMING-POOL-ELEMENT — the assembly', () => {
  it('A-1: ONE gesture produces EXACTLY ONE hole, N walls, ONE floor slab and ONE water body', () => {
    const asm = buildPoolAssembly(makePool(), IDS);

    // The ticket says "exactly four elements". That is the four PART KINDS, not four
    // records — a rectangular pool has FOUR WALLS on its own. The real invariant is
    // one hole, one wall per boundary edge, one floor, one water.
    expect(asm.hostHole).toHaveLength(4);          // the loop, not the count of holes
    expect(asm.walls).toHaveLength(4);             // one per boundary EDGE
    expect(asm.floorSlab).toBeDefined();
    expect(asm.water).toBeDefined();

    // WHAT WOULD THE BUG SCORE? A pool that punched its hole twice, or built a wall
    // per VERTEX PAIR (5 walls for 4 vertices — the classic off-by-one on a closed
    // loop), fails here. A hard-coded "4" in the builder would pass this case, so:
    const pentagon = buildPoolAssembly(
      makePool({
        boundary: [
          { x: 0, y: 0, z: 0 }, { x: 4, y: 0, z: 0 }, { x: 5, y: 0, z: 2 },
          { x: 2, y: 0, z: 4 }, { x: -1, y: 0, z: 2 },
        ],
      }),
      { ...IDS, wallIds: ['w1', 'w2', 'w3', 'w4', 'w5'] },
    );
    expect(pentagon.walls).toHaveLength(5);        // ← a hard-coded 4 dies here
    expect(pentagon.hostHole).toHaveLength(5);
  });

  it('A-2: the hole, the walls, the floor and the water all derive from ONE polygon — they cannot drift', () => {
    const pool = makePool();
    const asm = buildPoolAssembly(pool, IDS);

    const xz = (p: { x: number; z: number }) => `${p.x},${p.z}`;
    const outline = pool.boundary.map(xz);

    expect(asm.hostHole.map(xz)).toEqual(outline);
    expect(asm.floorSlab.boundary.map(xz)).toEqual(outline);
    expect(asm.water.boundary.map(xz)).toEqual(outline);
    // Every wall baseline endpoint must be a boundary vertex.
    for (const w of asm.walls) {
      expect(outline).toContain(xz(w.baseLine[0]));
      expect(outline).toContain(xz(w.baseLine[1]));
    }
    // WHAT WOULD THE BUG SCORE? A builder that (say) insets the floor slab by the
    // wall thickness, or outsets the hole, drifts the parts apart and fails here.
  });

  it('A-3: the pool walls sit UNDER the level — a NEGATIVE baseOffset, height = the depth', () => {
    const asm = buildPoolAssembly(makePool(), IDS);
    const d = POOL_DIMENSION_DEFAULTS.depth;

    for (const w of asm.walls) {
      expect(w.baseOffset).toBe(-d);      // ← negative. The whole trick of the ticket.
      expect(w.baseOffset).toBeLessThan(0);
      expect(w.height).toBe(d);
      expect(w.thickness).toBe(POOL_DIMENSION_DEFAULTS.wallThickness);
    }

    // WHAT WOULD THE BUG SCORE? A wall built ABOVE the slab (baseOffset 0, the default)
    // would give a pool standing proud of the floor like a planter — the single most
    // likely way to get this wrong. `toBeLessThan(0)` is what kills it; `toBe(-d)` alone
    // would also pass a builder that hard-coded -1.2, which is why A-5 exists.
  });

  it('A-4: the pool FLOOR closes the bottom of the walls — its top face is the wall base', () => {
    const asm = buildPoolAssembly(makePool(), IDS);
    const d = POOL_DIMENSION_DEFAULTS.depth;

    // The slab's baseOffset positions its TOP face (topReference: 'LEVEL'), and the
    // walls' base is at -depth. They must be the SAME plane, or the pool leaks.
    expect(asm.floorSlab.baseOffset).toBe(-d);
    expect(asm.floorSlab.baseOffset).toBe(asm.walls[0]!.baseOffset);
    expect(asm.floorSlab.thickness).toBe(POOL_DIMENSION_DEFAULTS.floorThickness);

    // WHAT WOULD THE BUG SCORE? A floor placed at -(depth + floorThickness) — a very
    // natural mistake, since that IS its underside — leaves a `floorThickness` gap
    // between the bottom of the walls and the top of the floor. This fails it.
  });

  it('A-5: EVERY dimension follows the record — halve the depth and the whole assembly follows', () => {
    const shallow = buildPoolAssembly(makePool({ depth: 0.6 }), IDS);

    expect(shallow.dims.depth).toBe(0.6);
    for (const w of shallow.walls) {
      expect(w.height).toBe(0.6);
      expect(w.baseOffset).toBe(-0.6);
    }
    expect(shallow.floorSlab.baseOffset).toBe(-0.6);
    expect(shallow.water.bottomElevation).toBe(-0.6);

    // WHAT WOULD THE BUG SCORE? THIS is the assertion that kills a hard-coded 1.2 m
    // anywhere in the assembly. A builder with `height: 1.2` scores 0 here. The
    // founder's "1.2 m is a DEFAULT, not a CONSTANT" is exactly this test.
  });

  it('A-6: the system type is tier 2 — the record still wins over it, and both win over the default', () => {
    const sys = { id: 'pool-competition', depth: 2.0, wallThickness: 0.4 };

    // tier 3 — nothing set anywhere
    expect(buildPoolAssembly(makePool(), IDS).dims.depth).toBe(POOL_DIMENSION_DEFAULTS.depth);
    // tier 2 — the system type answers
    expect(buildPoolAssembly(makePool(), IDS, sys).dims.depth).toBe(2.0);
    // tier 1 — the record OVERRIDES the system type
    expect(buildPoolAssembly(makePool({ depth: 0.9 }), IDS, sys).dims.depth).toBe(0.9);
    // and an unset field still falls through the type to the default
    expect(buildPoolAssembly(makePool({ depth: 0.9 }), IDS, sys).dims.freeboard)
      .toBe(POOL_DIMENSION_DEFAULTS.freeboard);
    expect(buildPoolAssembly(makePool({ depth: 0.9 }), IDS, sys).dims.wallThickness).toBe(0.4);

    // WHAT WOULD THE BUG SCORE? A resolver that read the systemType FIRST (a plausible
    // inversion) would return 2.0 on the tier-1 case and fail.
  });

  it('A-7: every part carries parentId = the pool — one thing to select, edit and delete (ADR-0124 §3)', () => {
    const pool = makePool();
    const asm = buildPoolAssembly(pool, IDS);

    for (const w of asm.walls) expect(w.parentId).toBe(pool.id);
    expect(asm.floorSlab.parentId).toBe(pool.id);
    expect(asm.water.parentId).toBe(pool.id);
    expect(asm.water.poolId).toBe(pool.id);

    // WHAT WOULD THE BUG SCORE? Parts with parentId = null are ORPHANS: clicking one
    // selects a bare wall, deleting the pool leaves them behind, and the pool is four
    // things to delete instead of one. That is the defect the ticket exists to prevent.
  });

  it('A-8: a pool wall id set of the wrong length is a PROGRAMMER error and throws (CA-2 stable ids)', () => {
    expect(() => buildPoolAssembly(makePool(), { ...IDS, wallIds: ['only-one'] }))
      .toThrow(/expected 4 wall ids/);
    // Ids are pre-minted by the command so redo reuses them. Minting them in here would
    // give a DIFFERENT pool on redo — silently. Better to throw.
  });
});

describe('§FEAT-SWIMMING-POOL-ELEMENT — the water', () => {
  it('W-1: the water surface sits at the RECORD-resolved level, not at a literal', () => {
    // Datum (coping) is y = 0; freeboard is the distance BELOW it.
    const asm = buildPoolAssembly(makePool(), IDS);
    expect(asm.water.surfaceElevation).toBe(-POOL_DIMENSION_DEFAULTS.freeboard);

    // HALVE THE RECORD → THE WATER MOVES. The founder's stated guard, verbatim.
    const half = buildPoolAssembly(makePool({ freeboard: POOL_DIMENSION_DEFAULTS.freeboard / 2 }), IDS);
    expect(half.water.surfaceElevation).toBe(-POOL_DIMENSION_DEFAULTS.freeboard / 2);
    expect(half.water.surfaceElevation).not.toBe(asm.water.surfaceElevation);

    // ── AND THE PART THAT MAKES WATER ITS OWN FAMILY (ADR-0124 §4) ──────────────
    // The water level moved and the pool FLOOR DID NOT BUDGE. A "slab with a blue
    // material" CANNOT do this: a slab's thickness grows down from its top, so moving
    // the water surface would drag the pool floor up with it. THIS assertion is the
    // evidence for the design decision — if it can be made to pass with a blue slab,
    // the decision was wrong.
    expect(half.water.bottomElevation).toBe(asm.water.bottomElevation);
    expect(half.floorSlab.baseOffset).toBe(asm.floorSlab.baseOffset);
  });

  it('W-2: the water is BELOW the coping and ABOVE the pool floor — it is IN the pool', () => {
    const asm = buildPoolAssembly(makePool(), IDS);
    const datumY = 0;

    expect(asm.water.surfaceElevation).toBeLessThan(datumY);                  // below the coping
    expect(asm.water.surfaceElevation).toBeGreaterThan(asm.water.bottomElevation); // has depth
    expect(asm.water.bottomElevation).toBe(-POOL_DIMENSION_DEFAULTS.depth);   // sits on the floor

    // WHAT WOULD THE BUG SCORE? Water at the datum (a builder that forgot freeboard)
    // reads as a pool filled to the brim and overflowing — and would pass a naive
    // "the water exists" assertion. The `toBeLessThan(datumY)` is what catches it.
  });

  it('W-3: the water has a VOLUME, and that is why it is not a slab (C28 — schedulable)', () => {
    const asm = buildPoolAssembly(makePool(), IDS);

    // 4 × 2 m pool = 8 m² plan area.
    expect(planAreaOf(asm.water.boundary)).toBeCloseTo(8, 6);

    // Depth of WATER (not of the pool): depth − freeboard = 1.2 − 0.1 = 1.1 m.
    const waterDepth = POOL_DIMENSION_DEFAULTS.depth - POOL_DIMENSION_DEFAULTS.freeboard;
    expect(waterVolumeOf(asm.water)).toBeCloseTo(8 * waterDepth, 6);          // 8.8 m³

    // WHAT WOULD THE BUG SCORE? A volume computed from the POOL depth (1.2) rather than
    // the WATER depth (1.1) gives 9.6 m³ — 9% too much, and wrong in the direction that
    // matters (you'd overfill). The distinction only EXISTS because water is its own
    // family with its own surface level. A blue slab has one thickness and cannot tell
    // these apart. `toBeCloseTo(8 * 1.1)` fails on 9.6.
  });

  it('W-4: an empty pool has NO water element — zero-depth water is rejected by the schema', () => {
    // A guard on the schema itself: water with its surface at or below its bottom is
    // not "water with no water", it is a schema violation.
    expect(() => Water.parse({
      poolId: 'pool_01ARZ3NDEKTSV4RRFFQ69G5FAV',
      boundary: [{ x: 0, y: 0, z: 0 }, { x: 4, y: 0, z: 0 }, { x: 4, y: 0, z: 2 }, { x: 0, y: 0, z: 2 }],
      surfaceElevation: -1.2,
      bottomElevation: -1.2,
    })).toThrow();

    // ...and a builder that swapped surface/bottom (the classic sign error) is caught:
    expect(() => Water.parse({
      poolId: 'pool_01ARZ3NDEKTSV4RRFFQ69G5FAV',
      boundary: [{ x: 0, y: 0, z: 0 }, { x: 4, y: 0, z: 0 }, { x: 4, y: 0, z: 2 }, { x: 0, y: 0, z: 2 }],
      surfaceElevation: -1.2,
      bottomElevation: -0.1,
    })).toThrow();
  });
});
