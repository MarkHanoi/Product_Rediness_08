/**
 * RoomFinishResolver
 *
 * Resolves finish information for a room by reading actual BIM element data
 * from the linked stores — walls, floors, slabs, ceilings, doors, windows.
 *
 * Resolution strategy (no dummy/string fallbacks — all values are live element data):
 *
 *   FLOOR
 *     1. FloorStore: floors whose coveredRoomIds contains roomId, OR hostRoomId === roomId
 *     2. FloorStore (spatial): floors on the same level whose polygon contains the room centroid
 *     3. SlabStore (level): slabs on the same level with a 'finish-surface' layer
 *
 *   WALLS
 *     WallStore: walls in room.boundingWallIds with a 'finish-interior' layer
 *     → Returns comma-separated list of unique finish names
 *
 *   CEILING
 *     1. CeilingStore: ceilings whose coveredRoomIds contains roomId, OR hostRoomId === roomId
 *     2. CeilingStore (spatial): ceilings on the same level whose polygon contains the room centroid
 *
 *   DOORS
 *     DoorStore: doors whose wallId is in room.boundingWallIds with a finishMaterial set
 *     → Returns comma-separated list of unique values
 *
 *   WINDOWS
 *     WindowStore: windows whose wallId is in room.boundingWallIds with a finishMaterial set
 *     → Returns comma-separated list of unique values
 *
 * Used by:
 *   - RoomPropertySection.ts  (properties panel display, reactive)
 *   - ScheduleExtractor.ts    (room schedule rows)
 */

import {
  determineBoundingWalls,
  type BoundingWallUndeterminedReason,
} from './boundingWallDetermination.js';

/**
 * §FIX-BOUNDING-WALLS-UNDETERMINED (C78 §1.4 · C71 §4.4 · C79 §5.2.0) — the
 * sentinel the three bounding-wall-derived surfaces show when the bounding-wall
 * relationship could NOT BE READ, as distinct from `'—'`, which means it WAS
 * read and no finish was found.
 *
 * Before this, `room.boundingWallIds ?? []` made those two facts the same
 * value: a room examined and found to bound zero finished walls, and a room
 * whose bounding walls nobody ever recorded, both printed `'—'`. C71 §4.4:
 * `[]` may only ever mean *zero results*.
 */
export const FINISH_UNDETERMINED = '⚠ cannot determine';

export interface ResolvedRoomFinishes {
  floor:   string;
  walls:   string;
  ceiling: string;
  doors:   string;
  windows: string;
  /**
   * The typed reason the wall / door / window surfaces are
   * {@link FINISH_UNDETERMINED}, or `null` when the bounding-wall relationship
   * WAS determined (including determined-as-empty). A C78 §8.1 member — this
   * resolver mints no vocabulary of its own.
   */
  boundingWallsUndeterminedReason: BoundingWallUndeterminedReason | null;
}

// ── Geometry helpers ──────────────────────────────────────────────────────────

/**
 * Ray-casting point-in-polygon test (XZ plane, ignoring Y/elevation).
 * Returns true when (px, pz) is inside the polygon defined by vertices [{x, z}].
 */
function pointInPolygon(px: number, pz: number, polygon: Array<{ x: number; z: number }>): boolean {
  if (!polygon || polygon.length < 3) return false;
  let inside = false;
  const n = polygon.length;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = polygon[i].x, zi = polygon[i].z;
    const xj = polygon[j].x, zj = polygon[j].z;
    if (((zi > pz) !== (zj > pz)) && (px < ((xj - xi) * (pz - zi)) / (zj - zi) + xi)) {
      inside = !inside;
    }
  }
  return inside;
}

// ── Main resolver ─────────────────────────────────────────────────────────────

/**
 * Resolves finish data for a single room from actual element stores.
 * Returns '—' for any finish surface that has no linked finish layer/material.
 */
export function resolveRoomFinishes(room: any): ResolvedRoomFinishes {
  const wallStore    = window.wallStore; // TODO(TASK-08)
  const floorStore   = window.floorStore; // TODO(TASK-08)
  const ceilingStore = window.ceilingStore; // TODO(TASK-08)
  const slabStore    = window.slabStore; // TODO(TASK-08)
  const doorStore    = window.doorStore; // TODO(TASK-08)
  const windowStore  = window.windowStore; // TODO(TASK-08)

  // §FIX-BOUNDING-WALLS-UNDETERMINED — layer (c) of the three-layer defect.
  // This line was `room.boundingWallIds ?? []`, which made "this room bounds
  // zero walls" and "nobody recorded this room's bounding walls" the SAME
  // value — C78 §1.4's most-violated clause, and C71 §4.4's `[]`-means-zero
  // rule. The determination is now typed, and the three surfaces DERIVED from
  // bounding walls (walls / doors / windows) report FINISH_UNDETERMINED rather
  // than the `'—'` that means "read, and nothing found".
  const boundingWalls = determineBoundingWalls(room, `wall/door/window finishes of room ${room?.id ?? '?'}`);
  const boundingWallIds: readonly string[] =
    boundingWalls.kind === 'determined' ? boundingWalls.elements : [];
  const boundingWallsUndeterminedReason: BoundingWallUndeterminedReason | null =
    boundingWalls.kind === 'undetermined' ? boundingWalls.reason : null;
  const roomId:   string  = room.id;
  const levelId:  string  = room.levelId;
  // centroid lives inside room.computed, not directly on room
  const centroid: { x: number; z: number } | undefined = room.computed?.centroid ?? room.centroid;

  // ── Floor finish ─────────────────────────────────────────────────────────
  let floorFinish = '—';

  if (floorStore) {
    const allFloors: any[] = floorStore.getAll?.() ?? [];

    // Pass 1: explicit room linkage
    for (const floor of allFloors) {
      if (floor.hostRoomId === roomId || floor.coveredRoomIds?.includes(roomId)) {
        const layer = floor.layers?.find((l: any) => l.function === 'finish');
        if (layer?.name) { floorFinish = layer.name; break; }
        if (floor.finishSpec?.materialName) { floorFinish = floor.finishSpec.materialName; break; }
      }
    }

    // Pass 2: spatial fallback — same level, room centroid inside floor polygon
    if (floorFinish === '—' && centroid) {
      for (const floor of allFloors) {
        if (floor.levelId !== levelId) continue;
        const poly: Array<{ x: number; z: number }> = floor.boundary?.polygon ?? [];
        if (pointInPolygon(centroid.x, centroid.z, poly)) {
          const layer = floor.layers?.find((l: any) => l.function === 'finish');
          if (layer?.name) { floorFinish = layer.name; break; }
          if (floor.finishSpec?.materialName) { floorFinish = floor.finishSpec.materialName; break; }
        }
      }
    }
  }

  // Pass 3: slab fallback — look for slabs on same level with a finish-surface layer
  if (floorFinish === '—' && slabStore) {
    const allSlabs: any[] = slabStore.getAll?.() ?? [];
    for (const slab of allSlabs) {
      if (slab.levelId !== levelId) continue;
      const layer = slab.layers?.find((l: any) => l.function === 'finish-surface');
      if (layer?.name) { floorFinish = layer.name; break; }
    }
  }
  // §RESI-WALL-CEILING-FINISH (2026-06-24) — final fallback to the ROOM's authored floor finish.
  if (floorFinish === '—' && room.finishes?.floor?.materialName) {
    floorFinish = room.finishes.floor.materialName;
  }

  // ── Wall finish ───────────────────────────────────────────────────────────
  const wallFinishNames = new Set<string>();
  for (const wid of boundingWallIds) {
    const w = wallStore?.getById?.(wid);
    if (!w?.layers) continue;
    const layer = w.layers.find((l: any) => l.function === 'finish-interior');
    if (layer?.name) wallFinishNames.add(layer.name);
  }
  // §RESI-WALL-CEILING-FINISH (2026-06-24) — fall back to the ROOM's authored wall finish
  // (`room.finishes.walls.materialName`) when no bounding wall carries a layered finish. Walls in
  // the generated building are plain (single-volume, not layered), so the layer read above is empty;
  // the room record is then the authoritative wall-finish source (a default PAINT is set per room).
  let wallFinish = wallFinishNames.size > 0 ? [...wallFinishNames].join(', ') : '—';
  if (wallFinish === '—' && room.finishes?.walls?.materialName) {
    wallFinish = room.finishes.walls.materialName;
  }

  // ── Ceiling finish ────────────────────────────────────────────────────────
  let ceilingFinish = '—';

  if (ceilingStore) {
    const allCeilings: any[] = ceilingStore.getAll?.() ?? [];

    // Pass 1: explicit room linkage
    for (const ceiling of allCeilings) {
      if (ceiling.hostRoomId === roomId || ceiling.coveredRoomIds?.includes(roomId)) {
        const layer = ceiling.layers?.find((l: any) => l.function === 'finish');
        if (layer?.name) { ceilingFinish = layer.name; break; }
        if (ceiling.finishSpec?.materialName) { ceilingFinish = ceiling.finishSpec.materialName; break; }
      }
    }

    // Pass 2: spatial fallback — same level, room centroid inside ceiling polygon
    if (ceilingFinish === '—' && centroid) {
      for (const ceiling of allCeilings) {
        if (ceiling.levelId !== levelId) continue;
        const poly: Array<{ x: number; z: number }> = ceiling.boundary?.polygon ?? [];
        if (pointInPolygon(centroid.x, centroid.z, poly)) {
          const layer = ceiling.layers?.find((l: any) => l.function === 'finish');
          if (layer?.name) { ceilingFinish = layer.name; break; }
          if (ceiling.finishSpec?.materialName) { ceilingFinish = ceiling.finishSpec.materialName; break; }
        }
      }
    }
  }
  // §RESI-WALL-CEILING-FINISH (2026-06-24) — final fallback to the ROOM's authored ceiling finish.
  if (ceilingFinish === '—' && room.finishes?.ceiling?.materialName) {
    ceilingFinish = room.finishes.ceiling.materialName;
  }

  // ── Door finish ───────────────────────────────────────────────────────────
  const doorFinishNames = new Set<string>();
  if (doorStore) {
    const boundingSet = new Set(boundingWallIds);
    const allDoors: any[] = doorStore.getAll?.() ?? [];
    for (const d of allDoors) {
      if (d.wallId && boundingSet.has(d.wallId) && d.finishMaterial) {
        doorFinishNames.add(d.finishMaterial);
      }
    }
  }
  const doorFinish = doorFinishNames.size > 0 ? [...doorFinishNames].join(', ') : '—';

  // ── Window finish ─────────────────────────────────────────────────────────
  const windowFinishNames = new Set<string>();
  if (windowStore) {
    const boundingSet = new Set(boundingWallIds);
    const allWindows: any[] = windowStore.getAll?.() ?? [];
    for (const w of allWindows) {
      if (w.wallId && boundingSet.has(w.wallId) && w.finishMaterial) {
        windowFinishNames.add(w.finishMaterial);
      }
    }
  }
  const windowFinish = windowFinishNames.size > 0 ? [...windowFinishNames].join(', ') : '—';

  // §FIX-BOUNDING-WALLS-UNDETERMINED — the OBSERVABLE difference.
  //
  // `walls`, `doors` and `windows` are each derived SOLELY through
  // `boundingWallIds`. When that relationship is undetermined, every one of the
  // three loops above iterated an empty array and produced `'—'` — a positive
  // statement ("read, nothing found") the resolver was not entitled to make.
  // They now say so instead. `floor` and `ceiling` are NOT overridden: they are
  // resolved from the floor / ceiling / slab stores and from `room.finishes`,
  // paths that never touch `boundingWallIds`, so they remain determined.
  //
  // The ROOM-AUTHORED wall fallback (`room.finishes.walls.materialName`) is the
  // one exception and it is deliberate: it is a direct read of the room record,
  // not a traversal of the missing relationship, so a room that authored its own
  // wall finish still reports it honestly even when the relationship is unknown.
  const undetermined = boundingWallsUndeterminedReason !== null;
  const authoredWallFinish = room?.finishes?.walls?.materialName;

  return {
    floor:   floorFinish,
    walls:   undetermined ? (authoredWallFinish ?? FINISH_UNDETERMINED) : wallFinish,
    ceiling: ceilingFinish,
    doors:   undetermined ? FINISH_UNDETERMINED : doorFinish,
    windows: undetermined ? FINISH_UNDETERMINED : windowFinish,
    boundingWallsUndeterminedReason,
  };
}
