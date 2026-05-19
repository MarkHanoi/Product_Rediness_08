// serializeDescriptor — turn a `ConcatenatedRaw` into a finalised
// `BufferGeometryDescriptor`.  Computes bounds, normalises the index
// buffer to the narrowest type that fits, scrubs `−0`, and emits
// the per-material `groups[]` array.

import { canonZero } from '../../math/scalar.js';
import type { MaterialKey } from '../../types/MaterialKey.js';
import type {
  BufferGeometryDescriptor,
  DescriptorGroup,
} from '../../types/BufferGeometryDescriptor.js';
import type { ConcatenatedRaw } from './rawGeometry.js';

export function serializeDescriptor(
  raw: ConcatenatedRaw,
  hash: string,
): BufferGeometryDescriptor {
  const vCount = raw.positions.length / 3;
  const position = new Float32Array(vCount * 3);
  const normal = new Float32Array(vCount * 3);
  const uv = new Float32Array(vCount * 2);

  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;

  for (let i = 0; i < vCount; i++) {
    const px = canonZero(raw.positions[i * 3]!);
    const py = canonZero(raw.positions[i * 3 + 1]!);
    const pz = canonZero(raw.positions[i * 3 + 2]!);
    position[i * 3] = px;
    position[i * 3 + 1] = py;
    position[i * 3 + 2] = pz;
    if (px < minX) minX = px; if (px > maxX) maxX = px;
    if (py < minY) minY = py; if (py > maxY) maxY = py;
    if (pz < minZ) minZ = pz; if (pz > maxZ) maxZ = pz;

    // Renormalise to defend against drift accumulated during the lift
    // (PRYZM 1's hard-edge faces are unit-length analytically; we
    // reproject to be safe for the descriptor invariant).
    const nx = raw.normals[i * 3]!;
    const ny = raw.normals[i * 3 + 1]!;
    const nz = raw.normals[i * 3 + 2]!;
    const lenSq = nx * nx + ny * ny + nz * nz;
    const inv = lenSq > 0 ? 1 / Math.sqrt(lenSq) : 0;
    normal[i * 3] = canonZero(nx * inv);
    normal[i * 3 + 1] = canonZero(ny * inv);
    normal[i * 3 + 2] = canonZero(nz * inv);

    uv[i * 2] = canonZero(raw.uvs[i * 2]!);
    uv[i * 2 + 1] = canonZero(raw.uvs[i * 2 + 1]!);
  }

  if (vCount === 0) {
    minX = minY = minZ = 0;
    maxX = maxY = maxZ = 0;
  }

  // Sequential index buffer (each lifted helper emits non-indexed
  // triangle lists where every triangle has its own three vertices).
  const indexLen = vCount;
  const useUint32 = vCount >= 65536;
  const index = useUint32
    ? new Uint32Array(indexLen)
    : new Uint16Array(indexLen);
  for (let i = 0; i < indexLen; i++) index[i] = i;

  // Dedupe materials, preserving first-occurrence order.
  const materialKeys: MaterialKey[] = [];
  const groups: DescriptorGroup[] = [];
  for (const r of raw.ranges) {
    let materialIndex = materialKeys.indexOf(r.materialKey);
    if (materialIndex === -1) {
      materialIndex = materialKeys.length;
      materialKeys.push(r.materialKey);
    }
    // `r.start` and `r.count` come from `concatRaw` in vertex units;
    // sequential index makes vertex == index, so the values map
    // 1:1 to the descriptor.
    groups.push({ start: r.start, count: r.count, materialIndex });
  }

  return {
    position,
    normal,
    uv,
    index,
    bounds: { min: { x: minX, y: minY, z: minZ }, max: { x: maxX, y: maxY, z: maxZ } },
    groups,
    materialKeys,
    hash,
  };
}
