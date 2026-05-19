// resolveMiters — convert the canonical `JoinData` (with
// `miterAngleRad`) into the `(nx, nz)` normals expected by the lifted
// PRYZM 1 prism / layered / curved builders.
//
// `miterAngleRad === 0` (or an absent end) → no miter (flat cap).

import type { JoinData } from '../../types/JoinData.js';
import { miterAngleToNormal, type MiterNormal } from './buildMiterPrism.js';

export interface MiterPrisms {
  readonly start: MiterNormal | null;
  readonly end: MiterNormal | null;
}

export function resolveMiters(
  wallDirX: number,
  wallDirZ: number,
  joinData: JoinData,
): MiterPrisms {
  const start =
    joinData.start && Math.abs(joinData.start.miterAngleRad) > 1e-9
      ? miterAngleToNormal(wallDirX, wallDirZ, joinData.start.miterAngleRad)
      : null;
  // End-cap angle is interpreted relative to the OUTGOING direction
  // (i.e. flipped 180° from the start cap), matching the PRYZM 1
  // convention used by `WallJoinResolver`.
  const end =
    joinData.end && Math.abs(joinData.end.miterAngleRad) > 1e-9
      ? miterAngleToNormal(-wallDirX, -wallDirZ, joinData.end.miterAngleRad)
      : null;
  return { start, end };
}
