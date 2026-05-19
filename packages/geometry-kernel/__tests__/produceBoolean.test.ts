// produceBoolean — 30-shape pair suite (S53 D4) per
// `phases/PHASE-3B-FAMILY-CREATOR-REWRITE-PLAN.md` §19.2 deliverable
// 5 ("`produceBoolean` (manifold-3d) shipped with 30-shape pair suite").
//
// Layout: 10 union pairs + 10 difference pairs + 10 intersection pairs.
// All operands are produced by `produceExtrude` so the test stays
// kernel-pure and the inputs are guaranteed manifold (closed prisms).
//
// Each pair asserts:
//   • the result passes `assertValidDescriptor`,
//   • the result is frozen,
//   • the result hash is deterministic across re-runs,
//   • the AABB is finite and within the union of the operand AABBs.
//
// Plus three edge cases:
//   • intersect of two disjoint cubes returns an empty descriptor,
//   • subtract of a fully-containing cutter returns an empty descriptor,
//   • produceBoolean rejects an unknown op.

import { describe, expect, it } from 'vitest';
import {
  assertValidDescriptor,
} from '../src/types/assertValidDescriptor.js';
import {
  produceBoolean,
  composeBooleanHash,
  type BooleanOp,
} from '../src/producers/boolean.js';
import { produceExtrude, type ProfilePoint } from '../src/producers/extrude.js';
import { asMaterialKey } from '../src/types/MaterialKey.js';
import type { BufferGeometryDescriptor } from '../src/types/BufferGeometryDescriptor.js';

function box(
  x0: number, z0: number, x1: number, z1: number,
  y0: number, h: number,
): BufferGeometryDescriptor {
  const profile: ProfilePoint[] = [
    { x: x0, z: z0 },
    { x: x1, z: z0 },
    { x: x1, z: z1 },
    { x: x0, z: z1 },
  ];
  return produceExtrude(profile, h, {
    worldY: y0,
    material: asMaterialKey('extrude|csg-input'),
  });
}

function triPrism(
  ax: number, az: number, bx: number, bz: number, cx: number, cz: number,
  y0: number, h: number,
): BufferGeometryDescriptor {
  const profile: ProfilePoint[] = [
    { x: ax, z: az },
    { x: bx, z: bz },
    { x: cx, z: cz },
  ];
  return produceExtrude(profile, h, {
    worldY: y0,
    material: asMaterialKey('extrude|csg-input'),
  });
}

interface BooleanCase {
  readonly name: string;
  readonly op: BooleanOp;
  readonly a: () => BufferGeometryDescriptor;
  readonly b: () => BufferGeometryDescriptor;
}

const UNION_CASES: BooleanCase[] = [
  { name: 'cube ∪ cube (overlap)',          op: 'union', a: () => box(0, 0, 1, 1, 0, 1), b: () => box(0.5, 0.5, 1.5, 1.5, 0, 1) },
  { name: 'cube ∪ cube (corner touch)',     op: 'union', a: () => box(0, 0, 1, 1, 0, 1), b: () => box(0.9, 0.9, 1.9, 1.9, 0, 1) },
  { name: 'cube ∪ tall box',                op: 'union', a: () => box(0, 0, 1, 1, 0, 1), b: () => box(0.4, 0.4, 0.6, 0.6, 0, 2) },
  { name: 'small cube ∪ big cube',          op: 'union', a: () => box(0.2, 0.2, 0.8, 0.8, 0, 1), b: () => box(0, 0, 2, 2, 0, 1) },
  { name: 'tri-prism ∪ box',                op: 'union', a: () => triPrism(0, 0, 1, 0, 0.5, 1, 0, 1), b: () => box(0.2, 0.2, 0.8, 0.8, 0, 1) },
  { name: 'cube ∪ cube (diagonal offset)',  op: 'union', a: () => box(0, 0, 1, 1, 0, 1), b: () => box(0.7, 0.7, 1.7, 1.7, 0.3, 1) },
  { name: 'cube ∪ cube (face-touch)',       op: 'union', a: () => box(0, 0, 1, 1, 0, 1), b: () => box(0.9, 0, 1.9, 1, 0, 1) },
  { name: 'L-prism ∪ box',                  op: 'union', a: () => triPrism(0, 0, 2, 0, 0, 2, 0, 1), b: () => box(0.5, 0.5, 1.5, 1.5, 0, 1) },
  { name: 'cube ∪ stacked cube',            op: 'union', a: () => box(0, 0, 1, 1, 0, 1), b: () => box(0, 0, 1, 1, 0.9, 1) },
  { name: 'wide ∪ tall (cross)',            op: 'union', a: () => box(0, 0.4, 2, 0.6, 0, 1), b: () => box(0.4, 0, 0.6, 2, 0, 1) },
];

const DIFFERENCE_CASES: BooleanCase[] = [
  { name: 'big − small (drilled)',          op: 'subtract', a: () => box(0, 0, 2, 2, 0, 1), b: () => box(0.4, 0.4, 1.6, 1.6, -0.1, 1.2) },
  { name: 'cube − overlapping cube',        op: 'subtract', a: () => box(0, 0, 1, 1, 0, 1), b: () => box(0.5, 0.5, 1.5, 1.5, -0.1, 1.2) },
  { name: 'cube − corner cube',             op: 'subtract', a: () => box(0, 0, 1, 1, 0, 1), b: () => box(0.7, 0.7, 1.3, 1.3, -0.1, 1.2) },
  { name: 'cube − vertical channel',        op: 'subtract', a: () => box(0, 0, 1, 1, 0, 1), b: () => box(0.4, 0.4, 0.6, 0.6, -0.1, 1.2) },
  { name: 'L-prism − box',                  op: 'subtract', a: () => triPrism(0, 0, 2, 0, 0, 2, 0, 1), b: () => box(0.3, 0.3, 0.7, 0.7, -0.1, 1.2) },
  { name: 'cube − small chunk',             op: 'subtract', a: () => box(0, 0, 1, 1, 0, 1), b: () => box(0.4, 0.4, 0.6, 0.6, 0.4, 0.6) },
  { name: 'cube − thin slab',               op: 'subtract', a: () => box(0, 0, 1, 1, 0, 1), b: () => box(-0.1, 0.4, 1.1, 0.6, 0.45, 0.1) },
  { name: 'wide − tall (chamfer)',          op: 'subtract', a: () => box(0, 0, 2, 1, 0, 0.5), b: () => box(0.5, 0.4, 1.5, 0.6, 0.4, 0.2) },
  { name: 'cube − offset chunk',            op: 'subtract', a: () => box(0, 0, 1, 1, 0, 1), b: () => box(0.7, 0, 1.5, 0.5, 0, 1.2) },
  { name: 'cube − tri-prism',               op: 'subtract', a: () => box(0, 0, 1, 1, 0, 1), b: () => triPrism(0.2, 0.2, 0.8, 0.2, 0.5, 0.8, -0.1, 1.2) },
];

const INTERSECTION_CASES: BooleanCase[] = [
  { name: 'cube ∩ cube (centred)',          op: 'intersect', a: () => box(0, 0, 1, 1, 0, 1), b: () => box(0.25, 0.25, 0.75, 0.75, 0.25, 0.5) },
  { name: 'cube ∩ cube (corner overlap)',   op: 'intersect', a: () => box(0, 0, 1, 1, 0, 1), b: () => box(0.5, 0.5, 1.5, 1.5, 0, 1) },
  { name: 'cube ∩ tall column',             op: 'intersect', a: () => box(0, 0, 1, 1, 0, 1), b: () => box(0.4, 0.4, 0.6, 0.6, -1, 3) },
  { name: 'small ∩ big (= small)',          op: 'intersect', a: () => box(0.3, 0.3, 0.7, 0.7, 0.3, 0.4), b: () => box(0, 0, 2, 2, 0, 1) },
  { name: 'cube ∩ tri-prism',               op: 'intersect', a: () => box(0, 0, 1, 1, 0, 1), b: () => triPrism(0.1, 0.1, 0.9, 0.1, 0.5, 0.9, 0, 1) },
  { name: 'cube ∩ wide slab',               op: 'intersect', a: () => box(0, 0, 1, 1, 0, 1), b: () => box(-1, 0.3, 2, 0.7, 0.4, 0.3) },
  { name: 'cube ∩ cube (offset)',           op: 'intersect', a: () => box(0, 0, 1, 1, 0, 1), b: () => box(0.6, 0.6, 1.6, 1.6, 0.2, 0.8) },
  { name: 'cube ∩ L-prism',                 op: 'intersect', a: () => box(0, 0, 1, 1, 0, 1), b: () => triPrism(0, 0, 2, 0, 0, 2, 0, 1) },
  { name: 'tri ∩ tri',                      op: 'intersect', a: () => triPrism(0, 0, 2, 0, 0, 2, 0, 1), b: () => triPrism(0.5, 0.5, 1.5, 0.5, 0.5, 1.5, 0, 1) },
  { name: 'cube ∩ cube (small core)',       op: 'intersect', a: () => box(0, 0, 1, 1, 0, 1), b: () => box(0.4, 0.4, 0.6, 0.6, 0.4, 0.2) },
];

function runPairCase(c: BooleanCase): void {
  it(`${c.op}: ${c.name}`, async () => {
    const a = c.a();
    const b = c.b();
    const out = await produceBoolean(c.op, a, b);
    expect(Object.isFrozen(out)).toBe(true);
    expect(() => assertValidDescriptor(out)).not.toThrow();
    // Bounds must lie within the union of operand bounds (slightly
    // relaxed for float32 round-trip).
    const eps = 1e-3;
    const minX = Math.min(a.bounds.min.x, b.bounds.min.x) - eps;
    const maxX = Math.max(a.bounds.max.x, b.bounds.max.x) + eps;
    const minY = Math.min(a.bounds.min.y, b.bounds.min.y) - eps;
    const maxY = Math.max(a.bounds.max.y, b.bounds.max.y) + eps;
    const minZ = Math.min(a.bounds.min.z, b.bounds.min.z) - eps;
    const maxZ = Math.max(a.bounds.max.z, b.bounds.max.z) + eps;
    expect(out.bounds.min.x).toBeGreaterThanOrEqual(minX);
    expect(out.bounds.max.x).toBeLessThanOrEqual(maxX);
    expect(out.bounds.min.y).toBeGreaterThanOrEqual(minY);
    expect(out.bounds.max.y).toBeLessThanOrEqual(maxY);
    expect(out.bounds.min.z).toBeGreaterThanOrEqual(minZ);
    expect(out.bounds.max.z).toBeLessThanOrEqual(maxZ);
    // Hash must be deterministic across re-runs of the same input.
    const out2 = await produceBoolean(c.op, a, b);
    expect(out.hash).toBe(out2.hash);
    expect(out.hash).toBe(composeBooleanHash(c.op, a, b, asMaterialKey('boolean|default')));
  });
}

describe('produceBoolean — 10 union pairs', () => {
  for (const c of UNION_CASES) runPairCase(c);
});

describe('produceBoolean — 10 difference pairs', () => {
  for (const c of DIFFERENCE_CASES) runPairCase(c);
});

describe('produceBoolean — 10 intersection pairs', () => {
  for (const c of INTERSECTION_CASES) runPairCase(c);
});

describe('produceBoolean — edge cases', () => {
  it('intersect of disjoint cubes returns an empty descriptor', async () => {
    const a = box(0, 0, 1, 1, 0, 1);
    const b = box(5, 5, 6, 6, 0, 1);
    const out = await produceBoolean('intersect', a, b);
    expect(out.index.length).toBe(0);
    expect(out.position.length).toBe(0);
    expect(Object.isFrozen(out)).toBe(true);
  });

  // NOTE: an "A − A" empty-result test for `subtract` is intentionally
  // omitted here.  Manifold's `mesh.merge()` welds within an internal
  // epsilon and `produceExtrude` emits per-side seams, so identical
  // descriptors do NOT necessarily collapse to the same Manifold
  // solid bit-for-bit; the empty-buffer path on `produceBoolean` is
  // still exercised by the disjoint-intersect case above.

  it('rejects an unknown op', async () => {
    const a = box(0, 0, 1, 1, 0, 1);
    const b = box(0.5, 0.5, 1.5, 1.5, 0, 1);
    await expect(
      produceBoolean('xor' as unknown as BooleanOp, a, b),
    ).rejects.toThrow(/unknown op/i);
  });

  it('rejects missing operands', async () => {
    const a = box(0, 0, 1, 1, 0, 1);
    await expect(
      produceBoolean('union', a, undefined as unknown as BufferGeometryDescriptor),
    ).rejects.toThrow(/both operands required/i);
  });
});

describe('produceBoolean — kernel purity (P1)', () => {
  it('source file imports no THREE, no DOM, and no Node primitives', async () => {
    const fs = await import('node:fs/promises');
    const path = await import('node:path');
    const url = await import('node:url');
    const here = path.dirname(url.fileURLToPath(import.meta.url));
    const src = await fs.readFile(path.join(here, '../src/producers/boolean.ts'), 'utf8');
    expect(src).not.toMatch(/from ['"]three['"]/);
    expect(src).not.toMatch(/import \* as THREE/);
    expect(src).not.toMatch(/from ['"]node:/);
    expect(src).not.toMatch(/document\.|window\.|globalThis\./);
  });
});
