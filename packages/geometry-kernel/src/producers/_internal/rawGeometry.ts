// RawGeometry — intermediate shape used between lifted helpers and
// the final `BufferGeometryDescriptor` serialisation step.
//
// Always non-indexed (each triangle has its own vertices) so that
// face-aligned hard-edge normals from the PRYZM 1 lifts don't get
// blended on a vertex-shared boundary.  The serialiser converts to
// `Float32Array` + a sequential `Uint32Array` index in one pass at
// the end.

import type { MaterialKey } from '../../types/MaterialKey.js';

export interface RawGeometry {
  readonly positions: number[];
  readonly normals: number[];
  /** Optional UVs.  When omitted the serialiser fills with zeros. */
  readonly uvs?: number[] | undefined;
}

export interface RawGroup {
  readonly geometry: RawGeometry;
  readonly materialKey: MaterialKey;
}

/**
 * Concatenate raw geometries into a single non-indexed buffer
 * keeping per-group ranges so the serialiser can emit
 * `BufferGeometryDescriptor.groups[]`.
 */
export interface ConcatenatedRaw {
  readonly positions: number[];
  readonly normals: number[];
  readonly uvs: number[];
  readonly ranges: readonly { readonly start: number; readonly count: number; readonly materialKey: MaterialKey }[];
}

export function concatRaw(parts: readonly RawGroup[]): ConcatenatedRaw {
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const ranges: { start: number; count: number; materialKey: MaterialKey }[] = [];

  for (const { geometry, materialKey } of parts) {
    const startVertex = positions.length / 3;
    positions.push(...geometry.positions);
    normals.push(...geometry.normals);

    const vCount = geometry.positions.length / 3;
    if (geometry.uvs && geometry.uvs.length === vCount * 2) {
      uvs.push(...geometry.uvs);
    } else {
      // Fill with planar UVs derived from XZ position so the descriptor
      // invariant `uv.length === 2 * vertexCount` holds without
      // requiring every lift to compute UVs.
      for (let i = 0; i < vCount; i++) {
        uvs.push(geometry.positions[i * 3]!, geometry.positions[i * 3 + 2]!);
      }
    }

    const triCount = vCount;
    ranges.push({
      start: startVertex,
      count: triCount,
      materialKey,
    });
  }
  return { positions, normals, uvs, ranges };
}
