// composeStructuralGeometryHash — deterministic cache key for second-tier
// structural elements (brace / footing / foundation-slab / connection).
//
// S26 / ADR-0023.  Hash schema v1 — bump if the producer's output
// vertex layout changes for fixed input.

import type { Structural } from '@pryzm/protocol';

export const STRUCTURAL_HASH_SCHEMA_VERSION = 1;

function f(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return '_';
  return n.toFixed(4);
}

export function composeStructuralGeometryHash(s: Structural, worldY: number): string {
  return [
    `structural:v${STRUCTURAL_HASH_SCHEMA_VERSION}`,
    s.id,
    s.kind,
    f(s.origin.x), f(s.origin.y), f(s.origin.z),
    f(s.endOffset.x), f(s.endOffset.y), f(s.endOffset.z),
    f(s.width), f(s.depth), f(s.thickness), f(s.radius),
    f(s.rotation), f(s.baseOffset),
    s.materialId ?? '_',
    s.levelId,
    f(worldY),
  ].join('|');
}
