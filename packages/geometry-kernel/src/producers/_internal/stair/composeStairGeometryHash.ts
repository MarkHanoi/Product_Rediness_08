// composeStairGeometryHash — content hash for stair descriptors.
//
// Mirrors `composeSlabGeometryHash`.  Used by the committer's
// onUpdate fast path: if the new descriptor hash matches the entry's
// previous hash, skip the GPU rebuild.

import type { Stair as StairData } from '@pryzm/protocol';

export const STAIR_HASH_SCHEMA_VERSION = 1;

function fnv1a(str: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return ('0000000' + (h >>> 0).toString(16)).slice(-8);
}

export function composeStairGeometryHash(s: StairData): string {
  const parts = [
    `v${STAIR_HASH_SCHEMA_VERSION}`,
    `shape=${s.shape}`,
    `n=${s.numRisers}`,
    `td=${s.treadDepth.toFixed(6)}`,
    `rh=${s.riserHeight.toFixed(6)}`,
    `w=${s.width.toFixed(6)}`,
    `ox=${s.origin.x.toFixed(6)}`,
    `oy=${s.origin.y.toFixed(6)}`,
    `oz=${s.origin.z.toFixed(6)}`,
    `rot=${s.rotation.toFixed(6)}`,
    `mat=${s.materialId ?? ''}`,
  ];
  return fnv1a(parts.join('|'));
}
