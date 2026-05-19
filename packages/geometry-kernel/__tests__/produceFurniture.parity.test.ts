// produceFurniture — analytic parity (S27-T6 / ADR-0024).
//
// Exercises the producer's shape contract without a PRYZM 1 byte
// fixture import (those land in S30): every assertion is derivable
// from the input DTO + chosen catalogue stub geometry.

import { describe, expect, it } from 'vitest';
import { Furniture, createId } from '@pryzm/schemas';
import {
  produceFurniture,
  composeFurnitureGeometryHash,
  selectActiveRepresentation,
  composeFurnitureMaterialKey,
  NO_JOINS,
  assertValidDescriptor,
  FURNITURE_HASH_SCHEMA_VERSION,
} from '../src/index.js';

// ─── Fixture geometry ────────────────────────────────────────────────
//
// Triangle counts intentionally distinct per LOD so parity assertions
// can prove the producer pulled from the right slot.
//
// L0 = single triangle (1 tri = 3 indices)
// L1 = quad (2 tris)
// L2 = box bottom (2 tris on -Y)
// L3 = box (12 tris)
// L4 = box + lid (24 tris)

function tri(): { positions: number[]; indices: number[] } {
  return {
    positions: [
      -0.5, 0, -0.5,
       0.5, 0, -0.5,
       0.0, 0,  0.5,
    ],
    indices: [0, 1, 2],
  };
}

function quad(): { positions: number[]; indices: number[] } {
  return {
    positions: [
      -0.5, 0, -0.5,
       0.5, 0, -0.5,
       0.5, 0,  0.5,
      -0.5, 0,  0.5,
    ],
    indices: [0, 1, 2, 0, 2, 3],
  };
}

function bottom(): { positions: number[]; indices: number[] } {
  // Two-triangle floor, identical to quad.
  return quad();
}

function box(w: number, h: number, d: number): {
  positions: number[]; indices: number[];
} {
  const x = w / 2, y = h / 2, z = d / 2;
  const positions = [
    -x, -y, -z,  x, -y, -z,  x,  y, -z, -x,  y, -z,
    -x, -y,  z,  x, -y,  z,  x,  y,  z, -x,  y,  z,
  ];
  const indices = [
    0, 2, 1,  0, 3, 2,
    4, 5, 6,  4, 6, 7,
    0, 4, 7,  0, 7, 3,
    1, 2, 6,  1, 6, 5,
    0, 1, 5,  0, 5, 4,
    3, 7, 6,  3, 6, 2,
  ];
  return { positions, indices };
}

function boxAndLid(w: number, h: number, d: number): {
  positions: number[]; indices: number[];
} {
  const a = box(w, h, d);
  const b = box(w * 0.5, h * 0.1, d * 0.5);
  const offset = a.positions.length / 3;
  return {
    positions: [...a.positions, ...b.positions],
    indices: [...a.indices, ...b.indices.map((i) => i + offset)],
  };
}

const FIXTURE_REPS = {
  '0': tri(),
  '1': quad(),
  '2': bottom(),
  '3': box(1, 1, 1),
  '4': boxAndLid(1, 1, 1),
} as const;

function make(partial: Partial<Furniture>): Furniture {
  return Furniture.parse({
    id: createId('furniture'),
    levelId: 'L1',
    catalogId: 'pryzm/sofa-3s',
    representations: FIXTURE_REPS,
    ...partial,
  });
}

const POS_TOL = 1e-5;

describe('produceFurniture — analytic parity (S27)', () => {
  it('case 1: an empty representations record produces a 0-vertex descriptor (committer hides mesh per ADR-0024 §3)', () => {
    const f = Furniture.parse({
      id: createId('furniture'),
      levelId: 'L1',
      catalogId: 'pryzm/empty',
      representations: {},
    });
    const d = produceFurniture(f, NO_JOINS, 0);
    // Empty descriptor — `assertValidDescriptor` deliberately rejects
    // these (the kernel invariant requires at least one triangle), so
    // we only assert the shape contract that the committer relies on.
    expect(d.position.length).toBe(0);
    expect(d.index.length).toBe(0);
    expect(d.groups.length).toBe(0);
    expect(typeof d.hash).toBe('string');
    expect(d.hash.length).toBeGreaterThan(0);
  });

  it('case 2: activeLod=2 → producer reads L2 (2 tris)', () => {
    const f = make({ activeLod: 2 });
    const d = produceFurniture(f, NO_JOINS, 0);
    assertValidDescriptor(d);
    // 2 triangles × 3 vertices (non-indexed after detriangulation)
    expect(d.position.length / 3).toBe(6);
    expect(d.index.length).toBe(6);
  });

  it('case 3: activeLod=3 → producer reads L3 (12 tris)', () => {
    const f = make({ activeLod: 3 });
    const d = produceFurniture(f, NO_JOINS, 0);
    assertValidDescriptor(d);
    expect(d.position.length / 3).toBe(36);
    expect(d.index.length).toBe(36);
  });

  it('case 4: activeLod=4 → producer reads L4 (24 tris)', () => {
    const f = make({ activeLod: 4 });
    const d = produceFurniture(f, NO_JOINS, 0);
    assertValidDescriptor(d);
    expect(d.position.length / 3).toBe(72);
    expect(d.index.length).toBe(72);
  });

  it('case 5: missing activeLod walks the fallback ladder R2 → R3 → R1 → R4 → R0', () => {
    // Provide only L1 and L4; activeLod=2 (missing) and the ladder is
    // [2,3,1,4,0]; should land on L1 (not L4).
    const f = Furniture.parse({
      id: createId('furniture'),
      levelId: 'L1',
      catalogId: 'pryzm/partial',
      activeLod: 2,
      representations: { '1': quad(), '4': boxAndLid(1, 1, 1) },
    });
    const picked = selectActiveRepresentation(f);
    expect(picked).toBeDefined();
    expect(picked!.lod).toBe(1);
    const d = produceFurniture(f, NO_JOINS, 0);
    assertValidDescriptor(d);
    expect(d.position.length / 3).toBe(6); // 2 tris × 3 verts
  });

  it('case 6: origin translates the AABB by the same amount', () => {
    const f = make({ activeLod: 3, origin: { x: 10, y: 0, z: 5 } });
    const d = produceFurniture(f, NO_JOINS, 0);
    expect(d.bounds.min.x).toBeCloseTo(9.5, 5);
    expect(d.bounds.max.x).toBeCloseTo(10.5, 5);
    expect(d.bounds.min.z).toBeCloseTo(4.5, 5);
    expect(d.bounds.max.z).toBeCloseTo(5.5, 5);
  });

  it('case 7: scale=2 doubles the bounding-box extent', () => {
    const a = make({ activeLod: 3, scale: 1 });
    const b = make({ activeLod: 3, scale: 2 });
    const da = produceFurniture(a, NO_JOINS, 0);
    const db = produceFurniture(b, NO_JOINS, 0);
    expect(db.bounds.max.x - db.bounds.min.x).toBeCloseTo(2 * (da.bounds.max.x - da.bounds.min.x), 5);
    expect(db.bounds.max.y - db.bounds.min.y).toBeCloseTo(2 * (da.bounds.max.y - da.bounds.min.y), 5);
    expect(db.bounds.max.z - db.bounds.min.z).toBeCloseTo(2 * (da.bounds.max.z - da.bounds.min.z), 5);
  });

  it('case 8: rotation=π/2 swaps X/Z extents', () => {
    // Make the L3 box anisotropic so a 90° turn is detectable.
    const reps = { ...FIXTURE_REPS, '3': box(2, 1, 4) };
    const f0 = Furniture.parse({
      id: createId('furniture'), levelId: 'L1', catalogId: 'c', representations: reps,
      activeLod: 3, rotation: 0,
    });
    const f1 = Furniture.parse({
      id: createId('furniture'), levelId: 'L1', catalogId: 'c', representations: reps,
      activeLod: 3, rotation: Math.PI / 2,
    });
    const d0 = produceFurniture(f0, NO_JOINS, 0);
    const d1 = produceFurniture(f1, NO_JOINS, 0);
    const w0 = d0.bounds.max.x - d0.bounds.min.x;
    const d0z = d0.bounds.max.z - d0.bounds.min.z;
    const w1 = d1.bounds.max.x - d1.bounds.min.x;
    const d1z = d1.bounds.max.z - d1.bounds.min.z;
    expect(w1).toBeCloseTo(d0z, 5);
    expect(d1z).toBeCloseTo(w0, 5);
  });

  it('case 9: hash schema version is stamped in the prefix', () => {
    const f = make({ activeLod: 2 });
    const h = composeFurnitureGeometryHash(f, 0);
    expect(h.startsWith(`furniture:v${FURNITURE_HASH_SCHEMA_VERSION}|`)).toBe(true);
  });

  it('case 10: identical inputs ⇒ identical hash (cache key stability)', () => {
    const a = make({ id: 'furniture_01HZZZZZZZZZZZZZZZZZZZZZZZ', activeLod: 2 });
    const b = make({ id: 'furniture_01HZZZZZZZZZZZZZZZZZZZZZZZ', activeLod: 2 });
    expect(composeFurnitureGeometryHash(a, 0)).toBe(composeFurnitureGeometryHash(b, 0));
  });

  it('case 11: changing activeLod changes the hash', () => {
    const a = make({ id: 'furniture_01HZZZZZZZZZZZZZZZZZZZZZZZ', activeLod: 2 });
    const b = make({ id: 'furniture_01HZZZZZZZZZZZZZZZZZZZZZZZ', activeLod: 3 });
    expect(composeFurnitureGeometryHash(a, 0)).not.toBe(composeFurnitureGeometryHash(b, 0));
  });

  it('case 12: material key embeds catalogId, primary slot, and lod token', () => {
    const f = make({
      activeLod: 4,
      materialSlots: { primary: 'fabric-grey' },
      materialId: 'legacy',
    });
    const k = composeFurnitureMaterialKey(f);
    expect(k).toContain('furniture|');
    expect(k).toContain(f.catalogId);
    expect(k).toContain('fabric-grey');
    expect(k).toContain('lod=4');
    // material key must end with the slot tag
    expect(k.endsWith('|primary')).toBe(true);
  });

  it('case 13: worldY parameter offsets all Y positions', () => {
    const f = make({ activeLod: 3 });
    const d0 = produceFurniture(f, NO_JOINS, 0);
    const d5 = produceFurniture(f, NO_JOINS, 5);
    expect(d5.bounds.min.y - d0.bounds.min.y).toBeCloseTo(5, 5);
    expect(d5.bounds.max.y - d0.bounds.max.y).toBeCloseTo(5, 5);
  });

  it('case 14: positions agree exactly with the analytic L0 single triangle (rotation=0, scale=1, origin=0)', () => {
    const f = Furniture.parse({
      id: createId('furniture'), levelId: 'L1', catalogId: 'c',
      representations: { '0': tri() },
      activeLod: 0,
    });
    const d = produceFurniture(f, NO_JOINS, 0);
    assertValidDescriptor(d);
    // 1 triangle, 3 vertices, exactly the L0 positions back.
    expect(d.position.length).toBe(9);
    expect(Array.from(d.position)).toEqual([
      -0.5, 0, -0.5,
       0.5, 0, -0.5,
       0.0, 0,  0.5,
    ]);
  });
});
