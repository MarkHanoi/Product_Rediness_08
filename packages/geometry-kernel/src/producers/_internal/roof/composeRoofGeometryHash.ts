// composeRoofGeometryHash — deterministic cache key for a roof.
//
// Mirrors `composeWallGeometryHash` (S08-T1).  Folds every input that
// affects vertex output into a single ASCII string suitable as an
// IndexedDB key.  Used by the producer as `BufferGeometryDescriptor.hash`
// and by the committer for cross-session geometry caching.
//
// FLOAT PRECISION: 4 decimal places (matches PRYZM 1's `_composeCacheKey`
// + the wall hash format).
//
// SCHEMA VERSION: bumped here.  Any roof-DTO schema change that
// affects geometry output MUST bump `ROOF_HASH_SCHEMA_VERSION`.

import type { Roof } from '@pryzm/protocol';

export const ROOF_HASH_SCHEMA_VERSION = 1;

function f(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return '_';
  return n.toFixed(4);
}

export function composeRoofGeometryHash(roof: Roof, worldY: number): string {
  const boundary = roof.boundary
    .map((p) => `${f(p.x)},${f(p.y)},${f(p.z)}`)
    .join(';');
  const dims = `${f(roof.thickness)}|${f(roof.overhang)}|${f(roof.pitch)}|${roof.shape}`;
  const sys = `${roof.materialId ?? '_'}|${roof.materialColor ?? '_'}`;
  return [
    `v${ROOF_HASH_SCHEMA_VERSION}`,
    boundary,
    dims,
    roof.levelId,
    sys,
    f(worldY),
  ].join('|');
}
