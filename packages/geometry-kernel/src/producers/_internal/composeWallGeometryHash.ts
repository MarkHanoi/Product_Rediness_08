// composeWallGeometryHash — lifted from
// `src/elements/walls/composeWallGeometryHash.ts` (155 LOC, already
// THREE-free) per S08-T1 (`phases/PHASE-1B-Q2-M4-M6-WALL-END-TO-END.md`
// line 507).
//
// The function folds every input that affects vertex output into a
// single deterministic ASCII string suitable as an IndexedDB key.
// Used by the producer as `BufferGeometryDescriptor.hash` and by the
// committer for cross-session geometry caching.
//
// FLOAT PRECISION: floats are pinned to four decimal places (matches
// PRYZM 1's `_composeCacheKey` precision).
//
// SCHEMA VERSION: bumped here (NOT inherited from the runtime
// persistence layer) to keep the kernel decoupled from `@pryzm/
// persistence-client`.  Any wall-DTO schema change that affects
// geometry output MUST bump `WALL_HASH_SCHEMA_VERSION`.

import type { Wall } from '@pryzm/protocol';
import type { JoinData } from '../../types/JoinData.js';

export const WALL_HASH_SCHEMA_VERSION = 1;

function f(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return '_';
  return n.toFixed(4);
}

function hashOpening(o: Wall['openings'][number]): string {
  const t = o.type === 'door' ? `d${o.doorType ?? ''}` : `w${o.windowType ?? ''}`;
  return `${o.id}:${t}:${f(o.offset)}:${f(o.width)}:${f(o.height)}:${f(o.sillHeight)}`;
}

function hashJoin(jd: JoinData): string {
  const sm = jd.start
    ? `${f(jd.start.miterAngleRad)}@${jd.start.neighbourId}`
    : 'sq';
  const em = jd.end
    ? `${f(jd.end.miterAngleRad)}@${jd.end.neighbourId}`
    : 'sq';
  return `${sm}|${em}`;
}

/**
 * Composes the cross-session-safe geometry-cache key for a wall.
 *
 * @param wall      The wall whose geometry will be cached.
 * @param joinData  Resolved joins from the wall handler.
 * @param worldY    Level-floor world Y (the producer's third arg).
 */
export function composeWallGeometryHash(
  wall: Wall,
  joinData: JoinData,
  worldY: number,
): string {
  const a = wall.baseLine[0];
  const b = wall.baseLine[1];
  const base = `${f(a.x)},${f(a.y)},${f(a.z)}|${f(b.x)},${f(b.y)},${f(b.z)}`;
  const dims = `${f(wall.height)}|${f(wall.thickness)}|${f(wall.baseOffset)}`;
  const curveStr = wall.curve
    ? `c:${f(wall.curve.control.x)},${f(wall.curve.control.y)},${f(wall.curve.control.z)}:${wall.curve.segments}`
    : 'straight';
  const sortedOpenings = [...wall.openings].sort((x, y) =>
    x.id < y.id ? -1 : x.id > y.id ? 1 : 0,
  );
  const openingsStr =
    sortedOpenings.length === 0 ? 'no-op' : sortedOpenings.map(hashOpening).join(';');
  const sys = `${wall.systemTypeId ?? '_'}|${wall.materialId ?? '_'}|${wall.materialColor ?? '_'}`;
  const layersStr =
    wall.layers && wall.layers.length > 0
      ? wall.layers.map((l) => `${f(l.thickness)}:${l.materialId ?? '_'}:${l.function}`).join(',')
      : 'no-layers';
  const join = hashJoin(joinData);
  const worldYStr = f(worldY);

  return [
    `v${WALL_HASH_SCHEMA_VERSION}`,
    base,
    dims,
    wall.levelId,
    curveStr,
    openingsStr,
    sys,
    layersStr,
    join,
    worldYStr,
  ].join('|');
}
