// produceFurniture — multi-representation furniture producer (S27 / ADR-0024).
//
// Furniture differs from every other PRYZM 2 element family in that the
// producer's output depends on a runtime LOD selector (`dto.activeLod`).
// The five canonical LOD levels and the fallback ladder are documented
// in ADR-0024 §1 / §3.
//
// Pure-TS (no THREE).  Reads the active representation off the DTO,
// applies position + Y-rotation + uniform scale to its vertex positions,
// and emits a single-group `BufferGeometryDescriptor`.  When no
// representation is available at any LOD, returns an empty descriptor
// so the committer can hide the mesh (per ADR-0024 §3 — never throw).

import type { Furniture, FurnitureRepresentation } from '@pryzm/protocol';
import type { BufferGeometryDescriptor } from '../types/BufferGeometryDescriptor.js';
import type { JoinData } from '../types/JoinData.js';
import { concatRaw, type RawGroup } from './_internal/rawGeometry.js';
import { serializeDescriptor } from './_internal/serializeDescriptor.js';
import { asMaterialKey } from '../types/MaterialKey.js';
import {
  composeFurnitureGeometryHash,
  FURNITURE_HASH_SCHEMA_VERSION,
} from './_internal/composeFurnitureGeometryHash.js';

export type FurnitureProducer = (
  furniture: Readonly<Furniture>,
  joinData: Readonly<JoinData>,
  worldY: number,
) => BufferGeometryDescriptor;

/**
 * Fallback ladder per ADR-0024 §3 — when the requested `activeLod` has
 * no representation, walk this order.  The terminal `null` (empty
 * descriptor) is handled by the producer.
 */
const FALLBACK_LADDER: ReadonlyArray<'0' | '1' | '2' | '3' | '4'> = ['2', '3', '1', '4', '0'];

export function selectActiveRepresentation(
  furniture: Readonly<Furniture>,
): { rep: FurnitureRepresentation; lod: 0 | 1 | 2 | 3 | 4 } | undefined {
  const requested = String(furniture.activeLod) as '0' | '1' | '2' | '3' | '4';
  const reps = furniture.representations;
  // 1. Try the requested LOD first.
  const direct = reps[requested];
  if (direct && direct.positions.length > 0) {
    return { rep: direct, lod: furniture.activeLod };
  }
  // 2. Walk the fallback ladder (in declared preference order).
  for (const k of FALLBACK_LADDER) {
    if (k === requested) continue;
    const r = reps[k];
    if (r && r.positions.length > 0) {
      return { rep: r, lod: Number(k) as 0 | 1 | 2 | 3 | 4 };
    }
  }
  return undefined;
}

/**
 * Material key shape for furniture:
 *   `furniture|<catalogId>|<materialId>|lod=<n>|primary`
 *
 * The `lod` token is included so a single furniture instance shown at
 * two LODs in two viewports gets two distinct material slots in the
 * pool — useful when the dynamic editor (S58) wants to tint LOD-stepping.
 */
export function composeFurnitureMaterialKey(furniture: Readonly<Furniture>): string {
  const matId = furniture.materialSlots['primary'] ?? furniture.materialId ?? '';
  return `furniture|${furniture.catalogId}|${matId}|lod=${furniture.activeLod}|primary`;
}

/**
 * Apply the DTO's position + Y-rotation + uniform scale to a flat
 * positions array, writing into a fresh number[].  Pure: does not
 * touch the input.  Y-rotation rotates X / Z (the standard
 * floor-plan upright-Y convention used everywhere else in the kernel).
 */
function transformPositions(
  src: readonly number[],
  origin: { x: number; y: number; z: number },
  rotation: number,
  scale: number,
  worldYOffset: number,
): number[] {
  const out = new Array<number>(src.length);
  const cos = Math.cos(rotation);
  const sin = Math.sin(rotation);
  for (let i = 0; i < src.length; i += 3) {
    const sx = src[i]! * scale;
    const sy = src[i + 1]! * scale;
    const sz = src[i + 2]! * scale;
    // Rotate around Y: (x', z') = (cos·x + sin·z, -sin·x + cos·z)
    const rx = cos * sx + sin * sz;
    const rz = -sin * sx + cos * sz;
    out[i]     = rx + origin.x;
    out[i + 1] = sy + origin.y + worldYOffset;
    out[i + 2] = rz + origin.z;
  }
  return out;
}

/**
 * Apply Y-rotation to a normals array.  Translation / scale do **not**
 * affect normals (translation is irrelevant; uniform scale preserves
 * direction); only the rotation does.
 */
function transformNormals(src: readonly number[] | undefined, rotation: number): number[] | undefined {
  if (!src) return undefined;
  const out = new Array<number>(src.length);
  const cos = Math.cos(rotation);
  const sin = Math.sin(rotation);
  for (let i = 0; i < src.length; i += 3) {
    const nx = src[i]!;
    const ny = src[i + 1]!;
    const nz = src[i + 2]!;
    out[i]     = cos * nx + sin * nz;
    out[i + 1] = ny;
    out[i + 2] = -sin * nx + cos * nz;
  }
  return out;
}

/**
 * Detriangulate `representations[lod].indices + .positions` into a
 * non-indexed triangle stream so the standard `concatRaw` →
 * `serializeDescriptor` pipeline can emit hard-edge per-face normals
 * exactly like the other lifted helpers.
 */
function detriangulate(
  positions: readonly number[],
  indices: readonly number[],
  normals: readonly number[] | undefined,
  uvs: readonly number[] | undefined,
): { positions: number[]; normals: number[]; uvs?: number[] | undefined } {
  const triCount = indices.length / 3;
  const outPos = new Array<number>(triCount * 9);
  const outNorm = new Array<number>(triCount * 9);
  const outUv = uvs ? new Array<number>(triCount * 6) : undefined;
  for (let t = 0; t < triCount; t++) {
    const a = indices[t * 3]!;
    const b = indices[t * 3 + 1]!;
    const c = indices[t * 3 + 2]!;
    // Positions
    for (let v = 0; v < 3; v++) {
      const idx = [a, b, c][v]!;
      outPos[t * 9 + v * 3]     = positions[idx * 3]!;
      outPos[t * 9 + v * 3 + 1] = positions[idx * 3 + 1]!;
      outPos[t * 9 + v * 3 + 2] = positions[idx * 3 + 2]!;
    }
    if (normals) {
      for (let v = 0; v < 3; v++) {
        const idx = [a, b, c][v]!;
        outNorm[t * 9 + v * 3]     = normals[idx * 3]!;
        outNorm[t * 9 + v * 3 + 1] = normals[idx * 3 + 1]!;
        outNorm[t * 9 + v * 3 + 2] = normals[idx * 3 + 2]!;
      }
    } else {
      // Compute a per-face normal (cross product, normalised).
      const ax = positions[a * 3]!, ay = positions[a * 3 + 1]!, az = positions[a * 3 + 2]!;
      const bx = positions[b * 3]!, by = positions[b * 3 + 1]!, bz = positions[b * 3 + 2]!;
      const cx = positions[c * 3]!, cy = positions[c * 3 + 1]!, cz = positions[c * 3 + 2]!;
      const ux = bx - ax, uy = by - ay, uz = bz - az;
      const vx = cx - ax, vy = cy - ay, vz = cz - az;
      let nx = uy * vz - uz * vy;
      let ny = uz * vx - ux * vz;
      let nz = ux * vy - uy * vx;
      const len = Math.hypot(nx, ny, nz);
      if (len > 0) { nx /= len; ny /= len; nz /= len; }
      for (let v = 0; v < 3; v++) {
        outNorm[t * 9 + v * 3]     = nx;
        outNorm[t * 9 + v * 3 + 1] = ny;
        outNorm[t * 9 + v * 3 + 2] = nz;
      }
    }
    if (outUv && uvs) {
      for (let v = 0; v < 3; v++) {
        const idx = [a, b, c][v]!;
        outUv[t * 6 + v * 2]     = uvs[idx * 2]!;
        outUv[t * 6 + v * 2 + 1] = uvs[idx * 2 + 1]!;
      }
    }
  }
  return { positions: outPos, normals: outNorm, uvs: outUv };
}

export const produceFurniture: FurnitureProducer = (furniture, _joinData, worldY) => {
  const hash = composeFurnitureGeometryHash(furniture, worldY);
  const matKey = asMaterialKey(composeFurnitureMaterialKey(furniture));

  const picked = selectActiveRepresentation(furniture);
  if (!picked) {
    // Empty descriptor — committer hides the mesh.  ADR-0024 §3.
    return serializeDescriptor(concatRaw([] as readonly RawGroup[]), hash);
  }

  const { rep } = picked;
  if (rep.indices.length === 0) {
    // Vertices but no triangles — also empty.
    return serializeDescriptor(concatRaw([] as readonly RawGroup[]), hash);
  }

  // Detriangulate first so per-face normals come out right when the
  // representation didn't ship its own normals.
  const flat = detriangulate(rep.positions, rep.indices, rep.normals, rep.uvs);

  // Apply DTO transform.
  const transformedPositions = transformPositions(flat.positions, furniture.origin, furniture.rotation, furniture.scale, worldY);
  const transformedNormals = transformNormals(flat.normals, furniture.rotation) ?? new Array(transformedPositions.length).fill(0);

  const part: RawGroup = {
    geometry: {
      positions: transformedPositions,
      normals: transformedNormals,
      uvs: flat.uvs,
    },
    materialKey: matKey,
  };
  return serializeDescriptor(concatRaw([part]), hash);
};

export { FURNITURE_HASH_SCHEMA_VERSION };
