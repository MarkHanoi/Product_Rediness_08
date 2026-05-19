// Window intent resolver — S11-T2.
//
// Mirror of `plugins/door/src/intent.ts`: delegates wall hit-testing
// to `WallIntent.resolveHitToAnchor` and clamps the offset so the
// window fits between start and end.

import { WallIntent } from '@pryzm/plugin-wall';
import type { WallsState } from '@pryzm/plugin-wall';

interface Vec3Like {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface WindowPlacementResult {
  readonly wallId: string;
  readonly offset: number;
  readonly sillHeight: number;
  readonly fits: boolean;
}

export function wallLength(wall: { readonly baseLine: readonly [Vec3Like, Vec3Like] }): number {
  const [a, b] = wall.baseLine;
  return Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
}

export function resolveWindowPlacement(
  click: Vec3Like,
  walls: WallsState,
  windowWidth: number,
  windowSillHeight = 0.9,
  proximityRadius = 0.3,
): WindowPlacementResult | undefined {
  const anchor = WallIntent.resolveHitToAnchor(walls, click, proximityRadius);
  if (!anchor) return undefined;
  const w = walls[anchor.wallId];
  if (!w) return undefined;
  const length = wallLength(w);
  const half = windowWidth / 2;
  const desired = anchor.t * length;
  const offset = Math.max(half, Math.min(length - half, desired));
  const fits = windowWidth <= length;
  return { wallId: anchor.wallId, offset, sillHeight: windowSillHeight, fits };
}
