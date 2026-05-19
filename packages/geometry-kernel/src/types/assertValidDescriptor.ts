// assertValidDescriptor — runtime guard for `BufferGeometryDescriptor`.
//
// Per S08-T5 (`phases/PHASE-1B-Q2-M4-M6-WALL-END-TO-END.md` line 523).
// Every producer test calls this before snapshot compare so that a
// malformed descriptor produces a precise error instead of an opaque
// snapshot diff.

import type { BufferGeometryDescriptor } from './BufferGeometryDescriptor.js';

export class DescriptorInvariantError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DescriptorInvariantError';
  }
}

const EPS_NORMAL_LEN = 1e-4; // Lenient enough for float32 round-trip noise.

function ensureFinite(label: string, arr: ArrayLike<number>): void {
  for (let i = 0; i < arr.length; i++) {
    const v = arr[i]!;
    if (!Number.isFinite(v)) {
      throw new DescriptorInvariantError(
        `${label}[${i}] is non-finite (${String(v)}); descriptor must contain only finite numbers.`,
      );
    }
  }
}

export function assertValidDescriptor(d: BufferGeometryDescriptor): void {
  if (typeof d !== 'object' || d === null) {
    throw new DescriptorInvariantError('descriptor must be a non-null object');
  }
  if (typeof d.hash !== 'string' || d.hash.length === 0) {
    throw new DescriptorInvariantError('descriptor.hash must be a non-empty string');
  }

  // ── Vertex attributes ──────────────────────────────────────────────
  if (!(d.position instanceof Float32Array)) {
    throw new DescriptorInvariantError('descriptor.position must be a Float32Array');
  }
  if (!(d.normal instanceof Float32Array)) {
    throw new DescriptorInvariantError('descriptor.normal must be a Float32Array');
  }
  if (!(d.uv instanceof Float32Array)) {
    throw new DescriptorInvariantError('descriptor.uv must be a Float32Array');
  }

  if (d.position.length % 3 !== 0) {
    throw new DescriptorInvariantError(
      `descriptor.position.length (${d.position.length}) must be divisible by 3`,
    );
  }
  const vertexCount = d.position.length / 3;

  if (d.normal.length !== vertexCount * 3) {
    throw new DescriptorInvariantError(
      `descriptor.normal.length (${d.normal.length}) must equal 3 * vertexCount (${vertexCount * 3})`,
    );
  }
  if (d.uv.length !== vertexCount * 2) {
    throw new DescriptorInvariantError(
      `descriptor.uv.length (${d.uv.length}) must equal 2 * vertexCount (${vertexCount * 2})`,
    );
  }

  ensureFinite('position', d.position);
  ensureFinite('normal', d.normal);
  ensureFinite('uv', d.uv);

  // ── Normal unit-length check ───────────────────────────────────────
  for (let i = 0; i < vertexCount; i++) {
    const x = d.normal[i * 3]!;
    const y = d.normal[i * 3 + 1]!;
    const z = d.normal[i * 3 + 2]!;
    const lenSq = x * x + y * y + z * z;
    if (lenSq === 0) {
      throw new DescriptorInvariantError(
        `descriptor.normal[${i}] is zero-length; every vertex must carry a unit normal`,
      );
    }
    const len = Math.sqrt(lenSq);
    if (Math.abs(len - 1) > EPS_NORMAL_LEN) {
      throw new DescriptorInvariantError(
        `descriptor.normal[${i}] has length ${len} (deviation ${Math.abs(len - 1)} > ${EPS_NORMAL_LEN}); normals must be unit-length`,
      );
    }
  }

  // ── Index buffer ───────────────────────────────────────────────────
  if (!(d.index instanceof Uint16Array) && !(d.index instanceof Uint32Array)) {
    throw new DescriptorInvariantError(
      'descriptor.index must be a Uint16Array or Uint32Array',
    );
  }
  if (d.index.length === 0) {
    throw new DescriptorInvariantError('descriptor.index must contain at least one triangle');
  }
  if (d.index.length % 3 !== 0) {
    throw new DescriptorInvariantError(
      `descriptor.index.length (${d.index.length}) must be divisible by 3 (triangle list)`,
    );
  }
  for (let i = 0; i < d.index.length; i++) {
    const idx = d.index[i]!;
    if (idx < 0 || idx >= vertexCount) {
      throw new DescriptorInvariantError(
        `descriptor.index[${i}] = ${idx} is out of range [0, ${vertexCount})`,
      );
    }
  }

  // ── Bounds ─────────────────────────────────────────────────────────
  if (typeof d.bounds !== 'object' || d.bounds === null) {
    throw new DescriptorInvariantError('descriptor.bounds must be an object');
  }
  const { min, max } = d.bounds;
  for (const k of ['x', 'y', 'z'] as const) {
    if (!Number.isFinite(min[k]) || !Number.isFinite(max[k])) {
      throw new DescriptorInvariantError(`descriptor.bounds.${k} contains non-finite values`);
    }
    if (min[k] > max[k]) {
      throw new DescriptorInvariantError(
        `descriptor.bounds.min.${k} (${min[k]}) must be ≤ max.${k} (${max[k]})`,
      );
    }
  }

  // ── Groups ─────────────────────────────────────────────────────────
  if (!Array.isArray(d.groups) || d.groups.length === 0) {
    throw new DescriptorInvariantError('descriptor.groups must be a non-empty array');
  }
  let totalCount = 0;
  for (let i = 0; i < d.groups.length; i++) {
    const g = d.groups[i]!;
    if (!Number.isInteger(g.start) || g.start < 0) {
      throw new DescriptorInvariantError(`descriptor.groups[${i}].start must be a non-negative integer`);
    }
    if (!Number.isInteger(g.count) || g.count <= 0) {
      throw new DescriptorInvariantError(`descriptor.groups[${i}].count must be a positive integer`);
    }
    if (g.count % 3 !== 0) {
      throw new DescriptorInvariantError(`descriptor.groups[${i}].count (${g.count}) must be divisible by 3`);
    }
    if (!Number.isInteger(g.materialIndex) || g.materialIndex < 0) {
      throw new DescriptorInvariantError(
        `descriptor.groups[${i}].materialIndex must be a non-negative integer`,
      );
    }
    if (g.materialIndex >= d.materialKeys.length) {
      throw new DescriptorInvariantError(
        `descriptor.groups[${i}].materialIndex (${g.materialIndex}) is out of range; materialKeys.length = ${d.materialKeys.length}`,
      );
    }
    if (g.start + g.count > d.index.length) {
      throw new DescriptorInvariantError(
        `descriptor.groups[${i}] (start=${g.start}, count=${g.count}) overruns index.length (${d.index.length})`,
      );
    }
    totalCount += g.count;
  }
  if (totalCount !== d.index.length) {
    throw new DescriptorInvariantError(
      `Σ groups[i].count (${totalCount}) must equal index.length (${d.index.length})`,
    );
  }
}
