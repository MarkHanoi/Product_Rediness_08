// composeSlabGeometryHash — deterministic cache key for a slab.
//
// Mirrors `composeRoofGeometryHash`.  Folds every input that affects
// vertex output into a single ASCII string suitable as an IndexedDB key.

import type { Slab } from '@pryzm/protocol';

export const SLAB_HASH_SCHEMA_VERSION = 1;

function f(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return '_';
  return n.toFixed(4);
}

export function composeSlabGeometryHash(slab: Slab, worldY: number): string {
  const boundary = slab.boundary
    .map((p) => `${f(p.x)},${f(p.y)},${f(p.z)}`)
    .join(';');
  const holes = slab.holes
    .map((loop) =>
      loop.map((p) => `${f(p.x)},${f(p.y)},${f(p.z)}`).join(';'),
    )
    .join('|');
  const dims = `${f(slab.thickness)}|${f(slab.baseOffset)}`;
  const sys = `${slab.systemTypeId ?? '_'}|${slab.materialId ?? '_'}|${slab.materialColor ?? '_'}`;
  return [
    `slab:v${SLAB_HASH_SCHEMA_VERSION}`,
    boundary,
    holes,
    dims,
    slab.levelId,
    sys,
    f(worldY),
  ].join('|');
}
