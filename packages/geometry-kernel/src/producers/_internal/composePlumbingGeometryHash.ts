// composePlumbingGeometryHash — deterministic cache key for plumbing
// run primitives (straight / elbow / tee).
//
// S26 / ADR-0023.

import type { Plumbing } from '@pryzm/protocol';

export const PLUMBING_HASH_SCHEMA_VERSION = 1;

function f(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return '_';
  return n.toFixed(4);
}

export function composePlumbingGeometryHash(p: Plumbing, worldY: number): string {
  return [
    `plumbing:v${PLUMBING_HASH_SCHEMA_VERSION}`,
    p.id,
    p.kind,
    f(p.origin.x), f(p.origin.y), f(p.origin.z),
    f(p.diameter), f(p.wallThickness),
    f(p.length), f(p.bendRadius),
    f(p.rotation), f(p.baseOffset),
    p.systemTag,
    p.materialId ?? '_',
    p.levelId,
    f(worldY),
  ].join('|');
}
