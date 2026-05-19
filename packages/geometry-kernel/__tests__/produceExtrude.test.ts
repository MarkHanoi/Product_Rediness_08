// produceExtrude — descriptor-shape, invariant, and snapshot tests (S52 D1).

import { describe, expect, it } from 'vitest';
import {
  assertValidDescriptor,
  DescriptorInvariantError,
} from '../src/types/assertValidDescriptor.js';
import {
  produceExtrude,
  composeExtrudeHash,
  type ProfilePoint,
} from '../src/producers/extrude.js';
import { asMaterialKey } from '../src/types/MaterialKey.js';

const TRIANGLE: ProfilePoint[] = [
  { x: 0, z: 0 },
  { x: 1, z: 0 },
  { x: 0, z: 1 },
];

const RECTANGLE: ProfilePoint[] = [
  { x: 0, z: 0 },
  { x: 2, z: 0 },
  { x: 2, z: 1 },
  { x: 0, z: 1 },
];

// L-shape — concave; exercises ear-clipping.
const L_SHAPE: ProfilePoint[] = [
  { x: 0, z: 0 },
  { x: 2, z: 0 },
  { x: 2, z: 1 },
  { x: 1, z: 1 },
  { x: 1, z: 2 },
  { x: 0, z: 2 },
];

describe('produceExtrude — invariants', () => {
  it('produces a descriptor that passes assertValidDescriptor (triangle)', () => {
    const desc = produceExtrude(TRIANGLE, 1);
    expect(() => assertValidDescriptor(desc)).not.toThrow();
  });

  it('produces a descriptor that passes assertValidDescriptor (rectangle)', () => {
    const desc = produceExtrude(RECTANGLE, 2);
    expect(() => assertValidDescriptor(desc)).not.toThrow();
  });

  it('produces a descriptor that passes assertValidDescriptor (concave L-shape)', () => {
    const desc = produceExtrude(L_SHAPE, 1.5);
    expect(() => assertValidDescriptor(desc)).not.toThrow();
  });

  it('emits 6n vertices and (4n - 4) triangles for a convex n-gon', () => {
    const desc3 = produceExtrude(TRIANGLE, 1);
    expect(desc3.position.length / 3).toBe(6 * 3); // 18 verts
    expect(desc3.index.length / 3).toBe(4 * 3 - 4); // 8 triangles

    const desc4 = produceExtrude(RECTANGLE, 1);
    expect(desc4.position.length / 3).toBe(6 * 4); // 24 verts
    expect(desc4.index.length / 3).toBe(4 * 4 - 4); // 12 triangles
  });

  it('emits a single material group bound to the requested material', () => {
    const desc = produceExtrude(RECTANGLE, 1, {
      material: asMaterialKey('extrude|brick|red'),
    });
    expect(desc.materialKeys).toEqual(['extrude|brick|red']);
    expect(desc.groups).toHaveLength(1);
    expect(desc.groups[0]!.materialIndex).toBe(0);
    expect(desc.groups[0]!.start).toBe(0);
    expect(desc.groups[0]!.count).toBe(desc.index.length);
  });

  it('uses the default material key when none supplied', () => {
    const desc = produceExtrude(RECTANGLE, 1);
    expect(desc.materialKeys).toEqual(['extrude|default']);
  });

  it('computes correct AABB for an axis-aligned rectangle', () => {
    const desc = produceExtrude(RECTANGLE, 3, { worldY: 5 });
    expect(desc.bounds.min).toEqual({ x: 0, y: 5, z: 0 });
    expect(desc.bounds.max).toEqual({ x: 2, y: 8, z: 1 });
  });

  it('caps lie on Y = worldY (bottom) and Y = worldY + height (top)', () => {
    const desc = produceExtrude(RECTANGLE, 2.5, { worldY: 1 });
    const n = 4;
    for (let i = 0; i < n; i++) {
      expect(desc.position[3 * i + 1]).toBeCloseTo(1, 6); // bottom cap
      expect(desc.position[3 * (n + i) + 1]).toBeCloseTo(3.5, 6); // top cap
    }
  });

  it('top cap normals point +Y and bottom cap normals point -Y', () => {
    const desc = produceExtrude(RECTANGLE, 1);
    const n = 4;
    for (let i = 0; i < n; i++) {
      expect(desc.normal[3 * i + 0]).toBeCloseTo(0, 6);
      expect(desc.normal[3 * i + 1]).toBeCloseTo(-1, 6);
      expect(desc.normal[3 * i + 2]).toBeCloseTo(0, 6);
      expect(desc.normal[3 * (n + i) + 0]).toBeCloseTo(0, 6);
      expect(desc.normal[3 * (n + i) + 1]).toBeCloseTo(1, 6);
      expect(desc.normal[3 * (n + i) + 2]).toBeCloseTo(0, 6);
    }
  });

  it('side normals are unit-length and lie in the XZ plane', () => {
    const desc = produceExtrude(RECTANGLE, 1);
    const n = 4;
    for (let i = 0; i < 4 * n; i++) {
      const base = 2 * n + i;
      const nx = desc.normal[3 * base + 0]!;
      const ny = desc.normal[3 * base + 1]!;
      const nz = desc.normal[3 * base + 2]!;
      expect(ny).toBeCloseTo(0, 6);
      expect(Math.hypot(nx, nz)).toBeCloseTo(1, 5);
    }
  });

  it('reverses CW input automatically and reports it', () => {
    const cw = [...RECTANGLE].reverse();
    const desc = produceExtrude(cw, 1);
    expect(desc.appliedReversal).toBe(true);
    expect(() => assertValidDescriptor(desc)).not.toThrow();
    // Bounds remain the same regardless of input winding.
    expect(desc.bounds.min).toEqual({ x: 0, y: 0, z: 0 });
    expect(desc.bounds.max).toEqual({ x: 2, y: 1, z: 1 });
  });

  it('produces a deterministic hash (identical inputs → identical hashes)', () => {
    const a = produceExtrude(RECTANGLE, 1.5);
    const b = produceExtrude(RECTANGLE, 1.5);
    expect(a.hash).toBe(b.hash);
    // Hash matches the public composer.
    expect(a.hash).toBe(composeExtrudeHash(RECTANGLE, 1.5, 0, asMaterialKey('extrude|default')));
  });

  it('produces different hashes for different heights', () => {
    const h1 = produceExtrude(RECTANGLE, 1).hash;
    const h2 = produceExtrude(RECTANGLE, 2).hash;
    expect(h1).not.toBe(h2);
  });

  it('returns a frozen descriptor', () => {
    const desc = produceExtrude(TRIANGLE, 1);
    expect(Object.isFrozen(desc)).toBe(true);
  });
});

describe('produceExtrude — input validation', () => {
  it('rejects profiles with fewer than 3 vertices', () => {
    expect(() => produceExtrude([{ x: 0, z: 0 }, { x: 1, z: 1 }], 1)).toThrow(
      DescriptorInvariantError,
    );
  });

  it('rejects non-positive height', () => {
    expect(() => produceExtrude(RECTANGLE, 0)).toThrow(DescriptorInvariantError);
    expect(() => produceExtrude(RECTANGLE, -1)).toThrow(DescriptorInvariantError);
  });

  it('rejects non-finite height', () => {
    expect(() => produceExtrude(RECTANGLE, NaN)).toThrow(DescriptorInvariantError);
    expect(() => produceExtrude(RECTANGLE, Infinity)).toThrow(DescriptorInvariantError);
  });

  it('rejects non-finite profile coordinates', () => {
    expect(() => produceExtrude([{ x: 0, z: 0 }, { x: NaN, z: 0 }, { x: 0, z: 1 }], 1)).toThrow(
      DescriptorInvariantError,
    );
  });

  it('rejects degenerate (zero-area) profiles', () => {
    const collinear: ProfilePoint[] = [
      { x: 0, z: 0 },
      { x: 1, z: 0 },
      { x: 2, z: 0 },
    ];
    expect(() => produceExtrude(collinear, 1)).toThrow(DescriptorInvariantError);
  });
});

describe('produceExtrude — concave handling', () => {
  it('triangulates an L-shape with the right triangle count', () => {
    const desc = produceExtrude(L_SHAPE, 1);
    const n = L_SHAPE.length;
    // n-2 cap triangles per face × 2 faces + 2 side triangles per edge × n edges
    expect(desc.index.length / 3).toBe(2 * (n - 2) + 2 * n);
  });

  it('encloses the L-shape within its expected AABB', () => {
    const desc = produceExtrude(L_SHAPE, 0.5);
    expect(desc.bounds.min).toEqual({ x: 0, y: 0, z: 0 });
    expect(desc.bounds.max).toEqual({ x: 2, y: 0.5, z: 2 });
  });
});

describe('produceExtrude — kernel purity (P1)', () => {
  it('source file imports no THREE, no DOM, and no Node primitives', async () => {
    const fs = await import('node:fs/promises');
    const path = await import('node:path');
    const url = await import('node:url');
    const here = path.dirname(url.fileURLToPath(import.meta.url));
    const src = await fs.readFile(path.join(here, '../src/producers/extrude.ts'), 'utf8');
    expect(src).not.toMatch(/from ['"]three['"]/);
    expect(src).not.toMatch(/import \* as THREE/);
    expect(src).not.toMatch(/from ['"]node:/);
    expect(src).not.toMatch(/document\.|window\.|globalThis\./);
  });
});
