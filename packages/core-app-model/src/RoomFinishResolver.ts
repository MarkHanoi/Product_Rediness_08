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

export interface ResolvedRoomFinishes {
  floor:   string;
  walls:   string;
  ceiling: string;
  doors:   string;
  windows: string;
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

  const boundingWallIds: string[] = room.boundingWallIds ?? [];
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

  // ── Wall finish ───────────────────────────────────────────────────────────
  const wallFinishNames = new Set<string>();
  for (const wid of boundingWallIds) {
    const w = wallStore?.getById?.(wid);
    if (!w?.layers) continue;
    const layer = w.layers.find((l: any) => l.function === 'finish-interior');
    if (layer?.name) wallFinishNames.add(layer.name);
  }
  const wallFinish = wallFinishNames.size > 0 ? [...wallFinishNames].join(', ') : '—';

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

  return {
    floor:   floorFinish,
    walls:   wallFinish,
    ceiling: ceilingFinish,
    doors:   doorFinish,
    windows: windowFinish,
  };
}
