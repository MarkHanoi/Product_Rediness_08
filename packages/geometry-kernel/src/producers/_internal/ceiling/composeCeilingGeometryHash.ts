// composeCeilingGeometryHash — content hash for ceiling descriptors.

import type { Ceiling as CeilingData } from '@pryzm/protocol';

export const CEILING_HASH_SCHEMA_VERSION = 1;

function fnv1a(str: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return ('0000000' + (h >>> 0).toString(16)).slice(-8);
}

export function composeCeilingGeometryHash(c: CeilingData): string {
  const boundaryStr = c.boundary
    .map((p) => `${p.x.toFixed(6)},${p.y.toFixed(6)},${p.z.toFixed(6)}`)
    .join(';');
  const parts = [
    `v${CEILING_HASH_SCHEMA_VERSION}`,
    `h=${c.ceilingHeight.toFixed(6)}`,
    `t=${c.thickness.toFixed(6)}`,
    `mat=${c.materialId ?? ''}`,
    `col=${c.materialColor ?? ''}`,
    `b=${boundaryStr}`,
  ];
  return fnv1a(parts.join('|'));
}
