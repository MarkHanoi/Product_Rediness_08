// composeCurtainWallGeometryHash — deterministic cache key for a
// curtain wall (S12).  Folds every panel + grid + system input into
// an ASCII string suitable as an IndexedDB key.

import type { CurtainWall } from '@pryzm/protocol';

export const CURTAIN_WALL_HASH_SCHEMA_VERSION = 1;

function f(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return '_';
  return n.toFixed(4);
}

export function composeCurtainWallGeometryHash(cw: CurtainWall, worldY: number): string {
  const [s, e] = cw.baseLine;
  const panels = cw.panels
    .map((p) => `${p.id}:${p.row}:${p.col}:${p.kind}:${p.materialId ?? '_'}`)
    .join('|');
  return [
    `cw:v${CURTAIN_WALL_HASH_SCHEMA_VERSION}`,
    cw.id,
    `${f(s.x)},${f(s.y)},${f(s.z)}|${f(e.x)},${f(e.y)},${f(e.z)}`,
    f(cw.height),
    f(cw.mullionThickness),
    f(cw.bayWidth),
    f(cw.bayHeight),
    panels,
    cw.materialId ?? '_',
    cw.levelId,
    f(worldY),
  ].join('|');
}
