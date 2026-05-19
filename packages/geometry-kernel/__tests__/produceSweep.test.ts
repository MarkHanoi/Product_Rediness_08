// produceSweep — descriptor-shape, invariant, and snapshot tests (S53 D2).

import { describe, expect, it } from 'vitest';
import {
  assertValidDescriptor,
  DescriptorInvariantError,
} from '../src/types/assertValidDescriptor.js';
import {
  produceSweep,
  composeSweepHash,
  type SweepProfilePoint,
} from '../src/producers/sweep.js';
import { asMaterialKey } from '../src/types/MaterialKey.js';
import type { Point3D } from '../src/types/Point3D.js';

const SQUARE_PROFILE: SweepProfilePoint[] = [
  { u: -0.5, v: -0.5 },
  { u:  0.5, v: -0.5 },
  { u:  0.5, v:  0.5 },
  { u: -0.5, v:  0.5 },
];

const TRI_PROFILE: SweepProfilePoint[] = [
  { u: 0, v: 0 },
  { u: 1, v: 0 },
  { u: 0, v: 1 },
];

const STRAIGHT_PATH: Point3D[] = [
  { x: 0, y: 0, z: 0 },
  { x: 0, y: 1, z: 0 },
  { x: 0, y: 2, z: 0 },
];

const L_PATH: Point3D[] = [
  { x: 0, y: 0, z: 0 },
  { x: 1, y: 0, z: 0 },
  { x: 1, y: 0, z: 1 },
];

const ZIG_PATH: Point3D[] = [
  { x: 0, y: 0, z: 0 },
  { x: 0, y: 1, z: 0 },
  { x: 1, y: 1, z: 0 },
  { x: 1, y: 2, z: 0 },
];

describe('produceSweep — invariants', () => {
  it('produces a valid descriptor for a square along a straight path', () => {
    const d = produceSweep(SQUARE_PROFILE, STRAIGHT_PATH);
    expect(() => assertValidDescriptor(d)).not.toThrow();
  });

  it('produces a valid descriptor for a triangle along an L-path', () => {
    const d = produceSweep(TRI_PROFILE, L_PATH);
    expect(() => assertValidDescriptor(d)).not.toThrow();
  });

  it('produces a valid descriptor for a square along a zigzag path', () => {
    const d = produceSweep(SQUARE_PROFILE, ZIG_PATH);
    expect(() => assertValidDescriptor(d)).not.toThrow();
  });

  it('open path emits start + end caps; closed path skips caps', () => {
    const N = SQUARE_PROFILE.length;
    const M = STRAIGHT_PATH.length;
    const open = produceSweep(SQUARE_PROFILE, STRAIGHT_PATH);
    // open: side ring = N*M verts; caps = 2*N → total = N*(M+2)
    expect(open.position.length / 3).toBe(N * (M + 2));
    const closed = produceSweep(SQUARE_PROFILE, STRAIGHT_PATH, { closed: true });
    // closed: only side ring = N*M verts
    expect(closed.position.length / 3).toBe(N * M);
  });

  it('emits exactly one material group bound to the requested material', () => {
    const d = produceSweep(SQUARE_PROFILE, STRAIGHT_PATH, {
      material: asMaterialKey('sweep|brick|red'),
    });
    expect(d.materialKeys).toEqual(['sweep|brick|red']);
    expect(d.groups).toHaveLength(1);
    expect(d.groups[0]!.materialIndex).toBe(0);
    expect(d.groups[0]!.start).toBe(0);
    expect(d.groups[0]!.count).toBe(d.index.length);
  });

  it('uses the default material key when none supplied', () => {
    const d = produceSweep(SQUARE_PROFILE, STRAIGHT_PATH);
    expect(d.materialKeys).toEqual(['sweep|default']);
  });

  it('AABB encloses the swept solid (square along Y axis)', () => {
    const d = produceSweep(SQUARE_PROFILE, STRAIGHT_PATH);
    expect(d.bounds.min.x).toBeCloseTo(-0.5, 5);
    expect(d.bounds.max.x).toBeCloseTo( 0.5, 5);
    expect(d.bounds.min.y).toBeCloseTo( 0, 5);
    expect(d.bounds.max.y).toBeCloseTo( 2, 5);
    expect(d.bounds.min.z).toBeCloseTo(-0.5, 5);
    expect(d.bounds.max.z).toBeCloseTo( 0.5, 5);
  });

  it('side ring normals are unit-length', () => {
    const d = produceSweep(SQUARE_PROFILE, STRAIGHT_PATH);
    const N = SQUARE_PROFILE.length;
    const M = STRAIGHT_PATH.length;
    for (let v = 0; v < N * M; v++) {
      const nx = d.normal[3 * v + 0]!;
      const ny = d.normal[3 * v + 1]!;
      const nz = d.normal[3 * v + 2]!;
      expect(Math.hypot(nx, ny, nz)).toBeCloseTo(1, 4);
    }
  });

  it('produces a deterministic hash (identical inputs → identical hashes)', () => {
    const a = produceSweep(SQUARE_PROFILE, STRAIGHT_PATH);
    const b = produceSweep(SQUARE_PROFILE, STRAIGHT_PATH);
    expect(a.hash).toBe(b.hash);
    expect(a.hash).toBe(
      composeSweepHash(SQUARE_PROFILE, STRAIGHT_PATH, false, asMaterialKey('sweep|default')),
    );
  });

  it('produces different hashes for open vs closed sweeps', () => {
    const open = produceSweep(SQUARE_PROFILE, STRAIGHT_PATH).hash;
    const closed = produceSweep(SQUARE_PROFILE, STRAIGHT_PATH, { closed: true }).hash;
    expect(open).not.toBe(closed);
  });

  it('returns a frozen descriptor', () => {
    const d = produceSweep(SQUARE_PROFILE, STRAIGHT_PATH);
    expect(Object.isFrozen(d)).toBe(true);
  });
});

describe('produceSweep — input validation', () => {
  it('rejects profiles with fewer than 3 vertices', () => {
    expect(() => produceSweep([{ u: 0, v: 0 }, { u: 1, v: 0 }], STRAIGHT_PATH)).toThrow(
      DescriptorInvariantError,
    );
  });

  it('rejects paths with fewer than 2 vertices', () => {
    expect(() => produceSweep(SQUARE_PROFILE, [{ x: 0, y: 0, z: 0 }])).toThrow(
      DescriptorInvariantError,
    );
  });

  it('rejects non-finite path coordinates', () => {
    const bad: Point3D[] = [{ x: 0, y: 0, z: 0 }, { x: NaN, y: 0, z: 0 }];
    expect(() => produceSweep(SQUARE_PROFILE, bad)).toThrow(DescriptorInvariantError);
  });
});

describe('produceSweep — kernel purity (P1)', () => {
  it('source file imports no THREE, no DOM, and no Node primitives', async () => {
    const fs = await import('node:fs/promises');
    const path = await import('node:path');
    const url = await import('node:url');
    const here = path.dirname(url.fileURLToPath(import.meta.url));
    const src = await fs.readFile(path.join(here, '../src/producers/sweep.ts'), 'utf8');
    expect(src).not.toMatch(/from ['"]three['"]/);
    expect(src).not.toMatch(/import \* as THREE/);
    expect(src).not.toMatch(/from ['"]node:/);
    expect(src).not.toMatch(/document\.|window\.|globalThis\./);
  });
});
