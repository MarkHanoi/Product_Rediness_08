// Door intent resolver — S11-T1.
//
// `code-level ADR docs/02-decisions/adrs/0013-intent-resolver.md`
//
// Door placement on a wall delegates to `plugins/wall/intent.ts`'s
// `WallIntent.resolveHitToAnchor` so the entire wall family (straight +
// arc + future polyline) is handled by ONE resolver.  This file is a
// thin wrapper plus door-specific helpers (offset clamping, fit-check
// against host wall length).

import { WallIntent } from '@pryzm/plugin-wall';
import type { WallsState } from '@pryzm/plugin-wall';

interface Vec3Like {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface DoorPlacementResult {
  readonly wallId: string;
  /** Offset along the wall baseline, in metres, clamped so the door
   *  fits entirely between start and end. */
  readonly offset: number;
  /** Sill height (m) — defaulted to 0 for ground-level doors. */
  readonly sillHeight: number;
  /** True when the door fits within the wall length.  Wall-side
   *  occupancy overlap is the wall plugin's concern (occupancyStore). */
  readonly fits: boolean;
}

/** Length of a wall's straight baseline (chord length for curved). */
export function wallLength(wall: { readonly baseLine: readonly [Vec3Like, Vec3Like] }): number {
  const [a, b] = wall.baseLine;
  return Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
}

/** Resolve a click point on the level plane to a door placement.
 *  Returns `undefined` when no wall is within the proximity radius. */
export function resolveDoorPlacement(
  click: Vec3Like,
  walls: WallsState,
  doorWidth: number,
  proximityRadius = 0.3,
): DoorPlacementResult | undefined {
  const anchor = WallIntent.resolveHitToAnchor(walls, click, proximityRadius);
  if (!anchor) return undefined;

  const w = walls[anchor.wallId];
  if (!w) return undefined;

  const length = wallLength(w);
  const half = doorWidth / 2;
  const desired = anchor.t * length;
  const offset = Math.max(half, Math.min(length - half, desired));
  const fits = doorWidth <= length;

  return {
    wallId: anchor.wallId,
    offset,
    sillHeight: 0,
    fits,
  };
}
