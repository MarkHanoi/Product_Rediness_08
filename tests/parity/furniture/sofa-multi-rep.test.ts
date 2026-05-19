// sofa-multi-rep — the canonical "sofa renders correctly at all 5 LODs"
// parity test (S27 exit criterion / ADR-0024).
//
// Drives produceFurniture against the seeded `pryzm/sofa-3s` catalogue
// entry and asserts that swapping `activeLod` produces a different
// descriptor every time, with monotonically-non-decreasing triangle
// counts in the L0..L4 direction (the carousel preview thumbnails
// depend on this property to render correctly).

import { describe, expect, it } from 'vitest';
import { Furniture, createId } from '@pryzm/schemas';
import {
  produceFurniture,
  composeFurnitureGeometryHash,
  selectActiveRepresentation,
  assertValidDescriptor,
} from '../../../packages/geometry-kernel/src/index.js';
import type { JoinData } from '../../../packages/geometry-kernel/src/types/JoinData.js';
import { SEED_FURNITURE_CATALOGUE } from '../../../plugins/furniture/src/catalogue/seed.js';

const NO_JOINS: JoinData = { start: null, end: null };

const SOFA = SEED_FURNITURE_CATALOGUE.find((e) => e.id === 'pryzm/sofa-3s');
if (!SOFA) throw new Error('seed catalogue is missing pryzm/sofa-3s');

function makeSofa(activeLod: 0 | 1 | 2 | 3 | 4): Furniture {
  return Furniture.parse({
    id: createId('furniture'),
    levelId: 'L1',
    catalogId: SOFA!.id,
    origin: { x: 1.5, y: 0, z: 2.5 },
    rotation: 0,
    scale: 1,
    activeLod,
    representations: SOFA!.representations,
    materialSlots: SOFA!.materialSlots ?? {},
    materialId: SOFA!.materialId,
  });
}

describe('sofa-multi-rep — produceFurniture across all 5 LODs', () => {
  for (const lod of [0, 1, 2, 3, 4] as const) {
    it(`LOD ${lod}: produces a valid descriptor with non-zero geometry`, () => {
      const f = makeSofa(lod);
      const d = produceFurniture(f, NO_JOINS, 0);
      assertValidDescriptor(d);
      expect(d.position.length).toBeGreaterThan(0);
      expect(d.index.length).toBeGreaterThan(0);
      expect(d.materialKeys.length).toBe(1);
      // Material key must encode the LOD that was rendered.
      expect(d.materialKeys[0]).toContain(`lod=${lod}`);
    });
  }

  it('descriptor hashes differ between every pair of LODs', () => {
    const hashes = ([0, 1, 2, 3, 4] as const).map((lod) =>
      composeFurnitureGeometryHash(makeSofa(lod), 0),
    );
    const set = new Set(hashes);
    expect(set.size).toBe(5);
  });

  it('triangle counts are monotonically non-decreasing from L0..L4', () => {
    const counts = ([0, 1, 2, 3, 4] as const).map((lod) => {
      const d = produceFurniture(makeSofa(lod), NO_JOINS, 0);
      return d.index.length / 3;
    });
    for (let i = 1; i < counts.length; i++) {
      expect(counts[i]).toBeGreaterThanOrEqual(counts[i - 1]!);
    }
    // L4 must be strictly richer than L0 (the carousel preview relies on this).
    expect(counts[4]).toBeGreaterThan(counts[0]!);
  });

  it('selectActiveRepresentation returns the requested level when populated', () => {
    for (const lod of [0, 1, 2, 3, 4] as const) {
      const picked = selectActiveRepresentation(makeSofa(lod));
      expect(picked, `lod ${lod} should resolve`).toBeDefined();
      expect(picked!.lod).toBe(lod);
    }
  });

  it('AABB is centred around the placement origin in the X/Z plane', () => {
    for (const lod of [0, 1, 2, 3, 4] as const) {
      const d = produceFurniture(makeSofa(lod), NO_JOINS, 0);
      const cx = (d.bounds.min.x + d.bounds.max.x) / 2;
      const cz = (d.bounds.min.z + d.bounds.max.z) / 2;
      expect(cx).toBeCloseTo(1.5, 5);
      expect(cz).toBeCloseTo(2.5, 5);
    }
  });
});
