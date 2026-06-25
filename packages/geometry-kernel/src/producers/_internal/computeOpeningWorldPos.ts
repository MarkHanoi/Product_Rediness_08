// computeOpeningWorldPos — lifted from
// `src/elements/walls/WallOpeningPositionResolver.ts` (88 LOC),
// adapted to use `Point3D` instead of `THREE.Vector3`.
//
// CONTRACT §06-WALL-INTEGRATION-CONTRACT §8.6 (PRYZM 1) — same
// formula, different type layer.
//
//   worldCenter = baseLine[0] + normalize(baseLine[1] − baseLine[0]) × offset
//   Y           = levelElevation + sillHeight + height / 2
//   wallAngle   = atan2(dir.z, dir.x)

import type { Point3D } from '../../types/Point3D.js';

export interface OpeningPositionInput {
  // §OPENING-OFFSET-LEFTEDGE-UNIFY (2026-06-24): offset is the LEFT EDGE of the span
  // [offset, offset+width]; the opening CENTRE = offset + width/2.
  readonly offset: number;     // Distance from baseLine[0] to opening LEFT EDGE (m).
  readonly width: number;      // Opening width along the wall (m).
  readonly height: number;     // Total opening height (m).
  readonly sillHeight: number; // Floor → bottom-of-opening (m).
}

export interface OpeningPositionResult {
  readonly worldCenter: Point3D;
  readonly wallAngle: number;       // Radians around Y.
  readonly wallDir: Point3D;        // Unit XZ direction (Y = 0).
}

export function computeOpeningWorldPos(
  baseLine: readonly [Point3D, Point3D],
  opening: OpeningPositionInput,
  levelElevation: number,
): OpeningPositionResult {
  const start = baseLine[0];
  const end = baseLine[1];

  const dx = end.x - start.x;
  const dz = end.z - start.z;
  const len = Math.sqrt(dx * dx + dz * dz) || 1;
  const dirX = dx / len;
  const dirZ = dz / len;

  const wallAngle = Math.atan2(dirZ, dirX);

  // §OPENING-OFFSET-LEFTEDGE-UNIFY: centre along the wall = left edge + width/2.
  const centreAlong = opening.offset + opening.width / 2;
  const worldCenter: Point3D = {
    x: start.x + dirX * centreAlong,
    y: levelElevation + opening.sillHeight + opening.height / 2,
    z: start.z + dirZ * centreAlong,
  };

  return {
    worldCenter,
    wallAngle,
    wallDir: { x: dirX, y: 0, z: dirZ },
  };
}
