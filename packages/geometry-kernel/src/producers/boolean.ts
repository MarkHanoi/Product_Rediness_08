// produceBoolean — pure function that combines two `BufferGeometryDescriptor`
// operands using a 3D Boolean op (union / subtract / intersect),
// landing the contract surface for S53 D4 (per
// `phases/PHASE-3B-FAMILY-CREATOR-REWRITE-PLAN.md` §7.3 + §7.4).
//
// FROZEN signature: `produceBoolean(op, a, b, opts) => Promise<Descriptor>`.
// L4 PURE — no THREE, no DOM, no Node primitives.
//
// IMPLEMENTATION
//   Backed by `KernelCSG` (`csg/KernelCSG.ts`), which lazy-loads
//   `manifold-3d` (WASM, THREE-free).  The Manifold solver returns
//   triangle soup; this producer EXPLODES that soup into per-triangle
//   vertices and assigns each tri a flat per-face normal (Booleans
//   commonly create new sharp seams; flat shading is the correct
//   default).  UVs default to zero.
//
// HASHING
//   `composeBooleanHash` is deterministic across both operands and
//   the op kind, so downstream cache / dedupe layers can plumb against
//   the hash without depending on the WASM payload contents.
//
// EMPTY RESULTS
//   When the op produces an empty mesh (e.g. `intersect` of two
//   disjoint shapes), this producer returns a descriptor with
//   zero-length buffers and a single zero-area material group so
//   downstream consumers can detect "nothing to draw" without
//   special-casing.

import type { BufferGeometryDescriptor } from '../types/BufferGeometryDescriptor.js';
import { DescriptorInvariantError } from '../types/assertValidDescriptor.js';
import type { MaterialKey } from '../types/MaterialKey.js';
import { asMaterialKey } from '../types/MaterialKey.js';
import { KernelCSG, descriptorToOperand, type CSGOperand } from '../csg/KernelCSG.js';

const HASH_SCHEMA_VERSION = 'boolean:1' as const;

export type BooleanOp = 'union' | 'subtract' | 'intersect';

export interface BooleanOptions {
  readonly material?: MaterialKey;
}

export type BooleanProducer = (
  op: BooleanOp,
  a: BufferGeometryDescriptor,
  b: BufferGeometryDescriptor,
  options?: BooleanOptions,
) => Promise<BufferGeometryDescriptor>;

export const produceBoolean: BooleanProducer = async (op, a, b, options = {}) => {
  if (op !== 'union' && op !== 'subtract' && op !== 'intersect') {
    throw new DescriptorInvariantError(`produceBoolean: unknown op "${String(op)}".`);
  }
  if (!a || !b) {
    throw new DescriptorInvariantError('produceBoolean: both operands required.');
  }
  const csg = await KernelCSG.create();
  const subjectOperand = descriptorToOperand(a);
  const cutterOperand = descriptorToOperand(b);
  let merged: CSGOperand;
  if (op === 'union') merged = csg.union(subjectOperand, cutterOperand);
  else if (op === 'subtract') merged = csg.subtract(subjectOperand, cutterOperand);
  else merged = csg.intersect(subjectOperand, cutterOperand);
  const material = options.material ?? asMaterialKey('boolean|default');
  return materializeOperand(merged, material, op, a, b);
};

export function composeBooleanHash(
  op: BooleanOp,
  a: BufferGeometryDescriptor,
  b: BufferGeometryDescriptor,
  material: MaterialKey,
): string {
  return `${HASH_SCHEMA_VERSION}|op=${op}|m=${material}|a=${a.hash}|b=${b.hash}`;
}

function materializeOperand(
  merged: CSGOperand,
  material: MaterialKey,
  op: BooleanOp,
  a: BufferGeometryDescriptor,
  b: BufferGeometryDescriptor,
): BufferGeometryDescriptor {
  const numTri = merged.index.length / 3;
  if (numTri === 0) {
    return Object.freeze({
      position: new Float32Array(0),
      normal: new Float32Array(0),
      uv: new Float32Array(0),
      index: new Uint32Array(0),
      bounds: { min: { x: 0, y: 0, z: 0 }, max: { x: 0, y: 0, z: 0 } },
      groups: [{ start: 0, count: 0, materialIndex: 0 }],
      materialKeys: [material],
      hash: composeBooleanHash(op, a, b, material),
    });
  }
  // Explode triangle soup → per-triangle vertices with flat
  // per-face normals so cuts / unions stay crisp at new seams.
  const position = new Float32Array(numTri * 9);
  const normal = new Float32Array(numTri * 9);
  const uv = new Float32Array(numTri * 6);
  const index = new Uint32Array(numTri * 3);

  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;

  for (let t = 0; t < numTri; t++) {
    const i0 = merged.index[3 * t + 0]!;
    const i1 = merged.index[3 * t + 1]!;
    const i2 = merged.index[3 * t + 2]!;
    const ax = merged.position[3 * i0 + 0]!;
    const ay = merged.position[3 * i0 + 1]!;
    const az = merged.position[3 * i0 + 2]!;
    const bx = merged.position[3 * i1 + 0]!;
    const by = merged.position[3 * i1 + 1]!;
    const bz = merged.position[3 * i1 + 2]!;
    const cx = merged.position[3 * i2 + 0]!;
    const cy = merged.position[3 * i2 + 1]!;
    const cz = merged.position[3 * i2 + 2]!;

    const ux = bx - ax, uy = by - ay, uz = bz - az;
    const vx = cx - ax, vy = cy - ay, vz = cz - az;
    let nx = uy * vz - uz * vy;
    let ny = uz * vx - ux * vz;
    let nz = ux * vy - uy * vx;
    const len = Math.hypot(nx, ny, nz);
    if (len > 0) { nx /= len; ny /= len; nz /= len; } else { nx = 0; ny = 1; nz = 0; }

    const pBase = 9 * t;
    position[pBase + 0] = ax; position[pBase + 1] = ay; position[pBase + 2] = az;
    position[pBase + 3] = bx; position[pBase + 4] = by; position[pBase + 5] = bz;
    position[pBase + 6] = cx; position[pBase + 7] = cy; position[pBase + 8] = cz;
    for (let k = 0; k < 3; k++) {
      normal[pBase + 3 * k + 0] = nx;
      normal[pBase + 3 * k + 1] = ny;
      normal[pBase + 3 * k + 2] = nz;
    }
    const iBase = 3 * t;
    index[iBase + 0] = iBase + 0;
    index[iBase + 1] = iBase + 1;
    index[iBase + 2] = iBase + 2;

    if (ax < minX) minX = ax; if (ax > maxX) maxX = ax;
    if (ay < minY) minY = ay; if (ay > maxY) maxY = ay;
    if (az < minZ) minZ = az; if (az > maxZ) maxZ = az;
    if (bx < minX) minX = bx; if (bx > maxX) maxX = bx;
    if (by < minY) minY = by; if (by > maxY) maxY = by;
    if (bz < minZ) minZ = bz; if (bz > maxZ) maxZ = bz;
    if (cx < minX) minX = cx; if (cx > maxX) maxX = cx;
    if (cy < minY) minY = cy; if (cy > maxY) maxY = cy;
    if (cz < minZ) minZ = cz; if (cz > maxZ) maxZ = cz;
  }

  return Object.freeze({
    position,
    normal,
    uv,
    index,
    bounds: {
      min: { x: minX, y: minY, z: minZ },
      max: { x: maxX, y: maxY, z: maxZ },
    },
    groups: [{ start: 0, count: index.length, materialIndex: 0 }],
    materialKeys: [material],
    hash: composeBooleanHash(op, a, b, material),
  });
}
