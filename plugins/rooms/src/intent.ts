// Room intent helpers — S25.
//
// `code-level ADR docs/architecture/adr/0013-intent-resolver.md`
//
// Like the slab intent module, room intent is a thin wrapper around
// the producer's pure helpers.  `recomputeRoomAnalytic` is the
// canonical place handlers call to refresh `room.area`,
// `room.boundingElementIds`, etc., after a boundary input changes.

import type { Room, Wall } from '@pryzm/plugin-sdk';
import { analyseRoom, type RoomBoundaryContext } from '@pryzm/plugin-sdk';
import { RoomSeedError } from './errors.js';

interface Vec3Like {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export function validateRoomSeed(seed: Vec3Like | null | undefined):
  | { ok: true }
  | { ok: false; reason: string } {
  if (seed === null || seed === undefined) {
    return { ok: false, reason: 'seedPoint is required for wallBound rooms' };
  }
  if (
    !Number.isFinite(seed.x) ||
    !Number.isFinite(seed.y) ||
    !Number.isFinite(seed.z)
  ) {
    return { ok: false, reason: 'seedPoint components must be finite' };
  }
  return { ok: true };
}

export interface RoomAnalyticUpdate {
  readonly area: number;
  readonly perimeter: number;
  readonly boundingElementIds: readonly string[];
  readonly boundingWallIds: readonly string[];
}

/** Run the producer's analyse step and return the fields handlers
 *  patch back onto the room DTO.  Returns `undefined` when the
 *  recompute is impossible (no seed, no walls, etc.) — handlers
 *  should leave the cached values untouched in that case rather
 *  than zero them, so the UI keeps showing the last known state
 *  (PRYZM 1's UX precedent for "in-progress un-enclosed rooms"). */
export function recomputeRoomAnalytic(
  room: Readonly<Room>,
  walls: readonly Readonly<Wall>[],
): RoomAnalyticUpdate | undefined {
  if (room.boundaryMode === 'wallBound') {
    const v = validateRoomSeed(room.seedPoint);
    if (!v.ok) throw new RoomSeedError(v.reason);
  }
  const ctx: RoomBoundaryContext = { walls };
  try {
    const a = analyseRoom(room, ctx);
    return {
      area: a.area,
      perimeter: a.perimeter,
      boundingElementIds: a.boundingWallIds,
      boundingWallIds: a.boundingWallIds,
    };
  } catch {
    return undefined;
  }
}
