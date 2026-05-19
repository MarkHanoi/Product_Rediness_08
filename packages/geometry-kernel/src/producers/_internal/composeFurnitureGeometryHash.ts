// composeFurnitureGeometryHash — deterministic cache key for furniture
// instances.  Multi-representation: the hash carries `activeLod` and a
// cheap content fingerprint of the selected representation so that LOD
// swaps and catalog edits both invalidate the chunk cache.
//
// S27 / ADR-0024.

import type { Furniture } from '@pryzm/protocol';

export const FURNITURE_HASH_SCHEMA_VERSION = 1;

function f(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return '_';
  return n.toFixed(4);
}

/**
 * Cheap content fingerprint for one representation: positions length +
 * first vertex + last vertex.  Three numbers fit any 32-bit float so
 * the fingerprint stays stable under JSON round-trip.
 */
function repFingerprint(rep: { positions: readonly number[] } | undefined): string {
  if (!rep || rep.positions.length === 0) return 'empty';
  const n = rep.positions.length;
  return [
    n.toString(),
    f(rep.positions[0]),
    f(rep.positions[n - 3]),
    f(rep.positions[n - 1]),
  ].join(',');
}

export function composeFurnitureGeometryHash(furniture: Furniture, worldY: number): string {
  const lodKey = String(furniture.activeLod) as '0' | '1' | '2' | '3' | '4';
  const activeRep = furniture.representations[lodKey];
  return [
    `furniture:v${FURNITURE_HASH_SCHEMA_VERSION}`,
    furniture.id,
    furniture.catalogId,
    `lod=${furniture.activeLod}`,
    `rep=${repFingerprint(activeRep)}`,
    f(furniture.origin.x), f(furniture.origin.y), f(furniture.origin.z),
    f(furniture.rotation),
    f(furniture.scale),
    furniture.materialSlots['primary'] ?? furniture.materialId ?? '_',
    furniture.levelId,
    f(worldY),
  ].join('|');
}
