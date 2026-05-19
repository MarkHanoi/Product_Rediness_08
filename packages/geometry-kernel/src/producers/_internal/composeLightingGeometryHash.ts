// composeLightingGeometryHash — deterministic cache key for lighting
// fixtures (downlight / pendant / strip / wall-sconce / emergency).
//
// S26 / ADR-0023.

import type { Lighting } from '@pryzm/protocol';

export const LIGHTING_HASH_SCHEMA_VERSION = 1;

function f(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return '_';
  return n.toFixed(4);
}

export function composeLightingGeometryHash(l: Lighting, worldY: number): string {
  return [
    `lighting:v${LIGHTING_HASH_SCHEMA_VERSION}`,
    l.id,
    l.kind,
    f(l.origin.x), f(l.origin.y), f(l.origin.z),
    f(l.width), f(l.depth), f(l.thickness),
    f(l.dropLength),
    f(l.range), f(l.intensity),
    f(l.color[0]), f(l.color[1]), f(l.color[2]),
    l.isEmergency ? '1' : '0',
    f(l.rotation),
    l.materialId ?? '_',
    l.levelId,
    f(worldY),
  ].join('|');
}
