// composeHandrailGeometryHash — content hash for handrail descriptors.

import type { Handrail as HandrailData } from '@pryzm/protocol';

export const HANDRAIL_HASH_SCHEMA_VERSION = 1;

function fnv1a(str: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return ('0000000' + (h >>> 0).toString(16)).slice(-8);
}

export function composeHandrailGeometryHash(h: HandrailData): string {
  const pathStr = h.path
    .map((p) => `${p.x.toFixed(6)},${p.y.toFixed(6)},${p.z.toFixed(6)}`)
    .join(';');
  const parts = [
    `v${HANDRAIL_HASH_SCHEMA_VERSION}`,
    `shape=${h.shape}`,
    `ht=${h.height.toFixed(6)}`,
    `d=${h.diameter.toFixed(6)}`,
    `host=${h.hostId ?? ''}`,
    `mat=${h.materialId ?? ''}`,
    `path=${pathStr}`,
  ];
  return fnv1a(parts.join('|'));
}
