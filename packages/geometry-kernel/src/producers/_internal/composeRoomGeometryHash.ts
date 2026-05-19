// composeRoomGeometryHash — deterministic descriptor hash for the
// room producer.  Mirrors `composeSlabGeometryHash` in shape.
//
// The hash MUST change when *any* input that affects produced
// geometry changes (the boundary polygon, the height offset, the
// material key, the contributing wall set, the boundary mode, the
// seed point).  It MUST NOT change when irrelevant fields wiggle
// (room name, occupancy, schedule cache).  This rule is what lets
// the room committer's `desc.hash === entry.descriptorHash` short-
// circuit work.

import type { MaterialKey } from '../../types/MaterialKey.js';

export const ROOM_HASH_SCHEMA_VERSION = 1;

interface ComposeArgs {
  readonly id: string;
  readonly levelId: string;
  readonly boundaryMode: 'wallBound' | 'sketched';
  readonly seedPoint: { x: number; y: number; z: number } | null;
  readonly polygon: readonly { x: number; z: number }[];
  readonly materialKey: MaterialKey;
  readonly fillY: number;
  readonly boundingWallIds: readonly string[];
}

function fmt(n: number): string {
  // 6 decimal places — well below the < 0.1% area accuracy budget,
  // tighter than any user-visible polygon edit.
  return n.toFixed(6);
}

export function composeRoomGeometryHash(a: ComposeArgs): string {
  const polyStr = a.polygon
    .map((p) => `${fmt(p.x)},${fmt(p.z)}`)
    .join(';');
  const seedStr =
    a.seedPoint === null
      ? '_'
      : `${fmt(a.seedPoint.x)},${fmt(a.seedPoint.y)},${fmt(a.seedPoint.z)}`;
  const wallStr = [...a.boundingWallIds].sort().join(',');
  return [
    `v${ROOM_HASH_SCHEMA_VERSION}`,
    a.id,
    a.levelId,
    a.boundaryMode,
    seedStr,
    polyStr,
    a.materialKey,
    fmt(a.fillY),
    wallStr,
  ].join('|');
}
