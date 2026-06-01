// composeDimensionGeometryHash — deterministic cache key for dimension
// annotations.
//
// S29 / `code-level ADR docs/02-decisions/adrs/0028-plan-view-canvas-architecture.md`.
//
// Every input that the producer reads (kind, every reference point,
// offset, unit, precision, style, override text) is folded into the
// hash string.  Identical inputs MUST yield identical hashes across
// browser worker, Node `worker_thread`, and the bake service.

import type { Dimension } from '@pryzm/protocol';

export const DIMENSION_HASH_SCHEMA_VERSION = 1;

function f(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return '_';
  return n.toFixed(4);
}

export function composeDimensionGeometryHash(d: Dimension, worldY: number): string {
  const pts = d.points
    .map((p) => `${f(p.x)},${f(p.y)},${f(p.z)}`)
    .join(';');
  return [
    `dimension:v${DIMENSION_HASH_SCHEMA_VERSION}`,
    d.id,
    d.kind,
    d.style,
    d.units,
    `prec:${d.precision}`,
    `off:${f(d.offsetMm)}`,
    `pts:${pts}`,
    d.overridden ? `txt:${d.overrideText ?? ''}` : 'txt:_',
    d.levelId,
    f(worldY),
  ].join('|');
}
