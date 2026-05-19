/**
 * ScheduleExtractor — reads element stores and produces schedule row arrays.
 *
 * Each case corresponds to a category string registered in ScheduleRegistry.
 * All window-global store references are guarded so missing stores return [].
 *
 * Disciplines:
 *   ARCHITECTURE  — Walls, Floors, Roofs, Ceilings, Rooms, Stairs
 *   OPENINGS      — Doors, Windows, CurtainWalls
 *   STRUCTURE     — Columns, Beams, Slabs
 *   INTERIOR      — Furniture, Handrails
 *   MEP           — Plumbing
 *   DATA PLATFORM — Hierarchy / Template / Programme schedules
 */

import { WallData, WindowData, DoorData } from '@pryzm/geometry-wall';
import { RoomRelationshipService } from '@pryzm/room-topology';
import { resolveRoomFinishes } from '@pryzm/core-app-model';
import { doorStore } from '@pryzm/geometry-door';
import { windowStore } from '@pryzm/geometry-window';
import { STANDARD_MATERIAL_LIBRARY } from '@pryzm/core-app-model/material-library';

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtRoom(ref: { roomNumber: string; name: string } | null): string {
  if (!ref) return '—';
  const parts: string[] = [];
  if (ref.roomNumber) parts.push(ref.roomNumber);
  if (ref.name)       parts.push(ref.name);
  return parts.length > 0 ? parts.join(' ') : '—';
}

function resolveLevel(bimManager: any, levelId: string | undefined, fallbackY = 0): string {
  if (!levelId) return fallbackYLevel(fallbackY);
  const level = bimManager?.getLevelById?.(levelId);
  if (level?.name) return level.name;
  if (levelId.length > 8) return levelId.substring(0, 8);
  return levelId || fallbackYLevel(fallbackY);
}

function fallbackYLevel(y: number): string {
  if (y < 1.5) return 'Ground Floor';
  if (y < 4.5) return 'Level 1';
  if (y < 7.5) return 'Level 2';
  return 'Unknown';
}

function polygonArea(pts: Array<{ x: number; y?: number; z?: number; [k: string]: any }>): number {
  let a = 0;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const xi = pts[i].x ?? 0, yi = pts[i].z ?? pts[i].y ?? 0;
    const xj = pts[j].x ?? 0, yj = pts[j].z ?? pts[j].y ?? 0;
    a += xi * yj - xj * yi;
  }
  return Math.abs(a / 2);
}

// ── Extractor ─────────────────────────────────────────────────────────────────

export class ScheduleExtractor {
  static getRows(categoryId: string): any[] {
    const wallStore = window.wallStore // TODO(TASK-07) as WallStore;
    const bimManager = window.bimManager;

    // ── ARCHITECTURE — Walls ────────────────────────────────────────────────
    if (categoryId === 'Walls') {
      if (!wallStore) return [];
      return wallStore.getAll().map((w: WallData) => {
        const _bl0 = w.baseLine[0], _bl1 = w.baseLine[1];
        const length = Math.sqrt((_bl1.x-_bl0.x)**2 + (_bl1.y-_bl0.y)**2 + (_bl1.z-_bl0.z)**2);
        const adjRooms = RoomRelationshipService.getWallAdjacentRooms(w);
        const levelName = resolveLevel(bimManager, (w as any).levelId, 0);
        return {
          id:        w.id,
          type:      w.type || 'Wall',
          length:    length.toFixed(2),
          height:    w.height.toFixed(2),
          thickness: w.thickness.toFixed(2),
          level:     levelName,
          roomSideA: fmtRoom(adjRooms[0] ?? null),
          roomSideB: fmtRoom(adjRooms[1] ?? null),
        };
      });
    }

    // ── ARCHITECTURE — Floors ───────────────────────────────────────────────
    if (categoryId === 'Floors') {
      const floorStore = window.floorStore // TODO(TASK-07);
      if (!floorStore) return [];
      return (floorStore.getAll?.() ?? []).map((f: any, idx: number) => {
        const levelName = resolveLevel(bimManager, f.levelId);
        const polygon = f.boundary?.polygon ?? f.polygon ?? [];
        const area = f.computed?.area ?? (polygon.length >= 3 ? polygonArea(polygon) : 0);
        const thickness = (f.layers ?? []).reduce((s: number, l: any) => s + (l.thickness ?? 0), 0)
          || f.thickness || 0;
        const finish = f.finishSpec?.material || f.finishSpec?.surfaceFinish || '—';
        const rooms = (f.coveredRoomIds ?? []).length > 0
          ? `${(f.coveredRoomIds ?? []).length} room(s)` : '—';
        const slope = f.slope?.angle != null ? `${f.slope.angle.toFixed(1)}°` : '—';
        const mark = f.properties?.mark ?? `FL${String(idx + 1).padStart(3, '0')}`;
        return {
          id:         f.id,
          mark,
          label:      f.label || '—',
          level:      levelName,
          area:       area.toFixed(2),
          thickness:  thickness.toFixed(3),
          finish,
          department: f.department || '—',
          rooms,
          slope,
        };
      });
    }

    // ── ARCHITECTURE — Roofs ────────────────────────────────────────────────
    if (categoryId === 'Roofs') {
      const roofStore = window.roofStore // TODO(TASK-07);
      if (!roofStore) return [];
      return (roofStore.getAll?.() ?? []).map((r: any, idx: number) => {
        const levelName = resolveLevel(bimManager, r.levelId);
        const polygon = r.footprint?.polygon ?? r.polygon ?? [];
        const ptsNorm = polygon.map((p: any) =>
          Array.isArray(p) ? { x: p[0], z: p[1] } : { x: p.x, z: p.z ?? p.y ?? 0 });
        const area = ptsNorm.length >= 3 ? polygonArea(ptsNorm) : 0;
        const mark = r.properties?.mark ?? `RF${String(idx + 1).padStart(3, '0')}`;
        const material = r.layers?.[0]?.material || r.materialId || '—';
        return {
          id:        r.id,
          mark,
          level:     levelName,
          roofType:  r.roofType || '—',
          slope:     r.slope != null ? r.slope.toFixed(1) : '—',
          area:      area.toFixed(2),
          thickness: (r.thickness ?? 0).toFixed(3),
          overhang:  (r.overhang ?? 0).toFixed(3),
          material,
        };
      });
    }

    // ── ARCHITECTURE — Ceilings ─────────────────────────────────────────────
    if (categoryId === 'Ceilings') {
      const ceilingStore = window.ceilingStore // TODO(TASK-07);
      if (!ceilingStore) return [];
      return (ceilingStore.getAll?.() ?? []).map((c: any, idx: number) => {
        const levelName = resolveLevel(bimManager, c.levelId);
        const polygon = c.boundary?.polygon ?? [];
        const area = c.computed?.area ?? (polygon.length >= 3 ? polygonArea(polygon) : 0);
        const finish = c.finishSpec?.material || c.finishSpec?.surfaceFinish || '—';
        const rooms = (c.coveredRoomIds ?? []).length > 0
          ? `${(c.coveredRoomIds ?? []).length} room(s)` : '—';
        const mark = c.properties?.mark ?? c.ceilingNumber ?? `CG${String(idx + 1).padStart(3, '0')}`;
        const height = c.boundary?.baseOffset ?? c.baseOffset ?? 0;
        return {
          id:         c.id,
          mark,
          label:      c.label || '—',
          level:      levelName,
          area:       area.toFixed(2),
          height:     height.toFixed(3),
          finish,
          department: c.department || '—',
          rooms,
        };
      });
    }

    // ── ARCHITECTURE — Rooms ────────────────────────────────────────────────
    if (categoryId === 'Rooms') {
      const roomStore = window.roomStore // TODO(TASK-07);
      if (!wallStore || !roomStore) return [];
      const furnitureStore = window.furnitureStore // TODO(TASK-07);
      const allDoors   = wallStore.getAllDoors?.() ?? [];
      const allWindows = wallStore.getAllWindows?.() ?? [];

      const doorMarkMap = new Map<string, string>(
        allDoors.map((d: DoorData, i: number) => [
          d.id,
          doorStore.getById(d.id)?.mark ?? `D-${String(i + 1).padStart(3, '0')}`,
        ]),
      );
      const windowMarkMap = new Map<string, string>(
        allWindows.map((w: WindowData, i: number) => [
          w.id,
          windowStore.getById(w.id)?.mark ?? `W-${String(i + 1).padStart(3, '0')}`,
        ]),
      );

      return roomStore.getAll().map((r: any) => {
        const level     = bimManager?.getLevelById?.(r.levelId);
        const levelName = level?.name ?? r.levelId?.substring(0, 8) ?? '—';
        const wallCount = (r.boundingWallIds ?? []).length;
        const boundingSet = new Set<string>(r.boundingWallIds ?? []);
        const containedDoors   = allDoors.filter((d: DoorData) => d.wallId && boundingSet.has(d.wallId));
        const containedWindows = allWindows.filter((w: WindowData) => w.wallId && boundingSet.has(w.wallId));
        const doorCount   = containedDoors.length;
        const windowCount = containedWindows.length;
        const doorMarks   = containedDoors.map((d: DoorData) => doorMarkMap.get(d.id) ?? '?').join(', ') || '—';
        const windowMarks = containedWindows.map((w: WindowData) => windowMarkMap.get(w.id) ?? '?').join(', ') || '—';

        let furnitureCount = 0;
        if (furnitureStore && typeof furnitureStore.getAll === 'function') {
          const allFurniture = furnitureStore.getAll();
          furnitureCount = allFurniture.filter((f: any) => {
            const px = f.position?.x ?? 0;
            const pz = f.position?.z ?? 0;
            const ref = RoomRelationshipService.getContainingRoom(px, pz, r.levelId);
            return ref?.id === r.id;
          }).length;
        }

        const finishes = resolveRoomFinishes(r);

        return {
          id:            r.id,
          number:        r.roomNumber || '—',
          name:          r.name       || '—',
          level:         levelName,
          department:    r.department || '—',
          occupancy:     (r.occupancyType ?? '—').replace(/-/g, ' '),
          grossArea:     (r.computed?.area ?? 0).toFixed(2),
          perimeter:     (r.computed?.perimeter ?? 0).toFixed(2),
          volume:        (r.computed?.volume ?? 0).toFixed(2),
          height:        (r.boundary?.height ?? 0).toFixed(2),
          floor:         finishes.floor,
          wall:          finishes.walls,
          ceiling:       finishes.ceiling,
          doorFinish:    finishes.doors,
          windowFinish:  finishes.windows,
          doorCount,
          windowCount,
          doors:         doorMarks,
          windows:       windowMarks,
          walls:         wallCount,
          furniture:     furnitureCount,
        };
      });
    }

    // ── ARCHITECTURE — Stairs ───────────────────────────────────────────────
    if (categoryId === 'Stairs') {
      const stairStore = window.stairStore // TODO(TASK-07);
      if (!stairStore) return [];
      return (stairStore.getAll?.() ?? []).map((s: any) => {
        const baseLevelName = resolveLevel(bimManager, s.baseLevelId);
        const topLevelName  = resolveLevel(bimManager, s.topLevelId);
        const totalRisers   = s.riserCount || (s.flights ?? []).reduce((acc: number, f: any) => acc + (f.riserCount ?? 0), 0);
        const blondel       = 2 * (s.riserHeight ?? 0) + (s.treadDepth ?? 0);
        return {
          id:             s.id,
          mark:           s.properties?.mark ?? '—',
          shape:          s.shape ?? '—',
          baseLevelName,
          topLevelName,
          width:          s.width ?? 0,
          riserCount:     totalRisers,
          riserHeight:    s.riserHeight ?? 0,
          treadDepth:     s.treadDepth ?? 0,
          accessibilityType: s.accessibilityType ?? 'standard',
          fireRating:     s.fireRating ?? '—',
          blondelOk:      blondel >= 0.600 && blondel <= 0.650,
        };
      });
    }

    // ── OPENINGS — Doors ────────────────────────────────────────────────────
    if (categoryId === 'Doors') {
      if (!wallStore) return [];
      const doors = wallStore.getAllDoors();
      return doors.map((d: DoorData, idx: number) => {
        const hostWall  = d.wallId ? wallStore.getById(d.wallId) : undefined;
        const levelId   = hostWall?.levelId;
        const level     = levelId ? bimManager?.getLevelById?.(levelId) : undefined;
        const levelName = level?.name ?? resolveLevel(bimManager, levelId, d.sillHeight || 0);
        const wallRef   = d.wallId ? d.wallId.substring(0, 8) : '—';
        const rel = hostWall
          ? RoomRelationshipService.getDoorRelationships(d, hostWall)
          : { roomFrom: null, roomTo: null };
        const storedDoorMark = doorStore.getById(d.id)?.mark;
        const doorMark = storedDoorMark ?? `D-${String(idx + 1).padStart(3, '0')}`;
        return {
          id:         d.id,
          mark:       doorMark,
          type:       d.doorType === 'double' ? 'Double Door' : 'Single Door',
          width:      d.width.toFixed(3),
          height:     d.height.toFixed(3),
          sillHeight: (d.sillHeight ?? 0).toFixed(3),
          level:      levelName,
          hostWall:   wallRef,
          roomFrom:   fmtRoom(rel.roomFrom),
          roomTo:     fmtRoom(rel.roomTo),
        };
      });
    }

    // ── OPENINGS — Windows ──────────────────────────────────────────────────
    if (categoryId === 'Windows') {
      if (!wallStore) return [];
      const windows = wallStore.getAllWindows();
      return windows.map((w: WindowData, idx: number) => {
        const hostWall  = w.wallId ? wallStore.getById(w.wallId) : undefined;
        const rel = hostWall
          ? RoomRelationshipService.getWindowRelationships(w, hostWall)
          : { roomId: null, adjacentRoomId: null };
        const hostW      = hostWall as any;
        const levelId    = hostW?.levelId;
        const level      = levelId ? bimManager?.getLevelById?.(levelId) : undefined;
        const levelName  = level?.name ?? resolveLevel(bimManager, levelId, w.sillHeight || 0);
        const storedWindowMark = windowStore.getById(w.id)?.mark;
        const windowMark = storedWindowMark ?? `W-${String(idx + 1).padStart(3, '0')}`;
        return {
          mark:          windowMark,
          id:            w.id,
          name:          w.windowType === 'double' ? 'Double Window' : 'Single Window',
          width:         w.width.toFixed(2),
          height:        w.height.toFixed(2),
          sillHeight:    w.sillHeight.toFixed(2),
          level:         levelName,
          room:          fmtRoom(rel.roomId),
          adjacentRoom:  fmtRoom(rel.adjacentRoomId),
        };
      });
    }

    // ── OPENINGS — Curtain Walls ────────────────────────────────────────────
    if (categoryId === 'CurtainWalls') {
      const cwStore = window.curtainWallStore // TODO(TASK-07);
      if (!cwStore) return [];
      return (cwStore.getAll?.() ?? []).map((cw: any, idx: number) => {
        const levelName = resolveLevel(bimManager, cw.levelId);
        let length = 0;
        if (cw.baseLine && cw.baseLine[0] && cw.baseLine[1]) {
          const dx = cw.baseLine[1].x - cw.baseLine[0].x;
          const dz = cw.baseLine[1].z - cw.baseLine[0].z;
          length = Math.sqrt(dx * dx + dz * dz);
        }
        const mark = cw.properties?.mark ?? cw.id?.substring(0, 8) ?? `CW${String(idx + 1).padStart(3, '0')}`;
        return {
          id:            cw.id,
          mark,
          level:         levelName,
          length:        length.toFixed(2),
          height:        (cw.height ?? 0).toFixed(2),
          gridXSpacing:  (cw.gridXSpacing ?? 0).toFixed(3),
          gridYSpacing:  (cw.gridYSpacing ?? 0).toFixed(3),
          mullionSize:   (cw.mullionSize ?? 0).toFixed(3),
          panelThickness: (cw.panelThickness ?? 0).toFixed(3),
        };
      });
    }

    // ── STRUCTURE — Columns ─────────────────────────────────────────────────
    if (categoryId === 'Columns') {
      const columnStore = window.columnStore // TODO(TASK-07);
      if (!columnStore) return [];
      return (columnStore.getAll?.() ?? []).map((c: any, idx: number) => {
        const levelName = resolveLevel(bimManager, c.levelId, c.position?.y ?? 0);
        const mark = c.properties?.mark ?? `CL${String(idx + 1).padStart(3, '0')}`;
        return {
          id:         c.id,
          mark,
          level:      levelName,
          profile:    c.profile ?? '—',
          width:      (c.width ?? 0).toFixed(3),
          depth:      (c.depth ?? 0).toFixed(3),
          height:     (c.height ?? 0).toFixed(3),
          material:   c.materialId ?? '—',
          baseOffset: (c.baseOffset ?? 0).toFixed(3),
        };
      });
    }

    // ── STRUCTURE — Beams ───────────────────────────────────────────────────
    if (categoryId === 'Beams') {
      const beamStore = window.beamStore // TODO(TASK-07);
      if (!beamStore) return [];
      return (beamStore.getAll?.() ?? []).map((b: any, idx: number) => {
        const levelName = resolveLevel(bimManager, b.levelId);
        let span = 0;
        if (b.startPoint && b.endPoint) {
          const dx = b.endPoint.x - b.startPoint.x;
          const dy = b.endPoint.y - b.startPoint.y;
          const dz = b.endPoint.z - b.startPoint.z;
          span = Math.sqrt(dx * dx + dy * dy + dz * dz);
        }
        const mark = b.properties?.mark ?? `BM${String(idx + 1).padStart(3, '0')}`;
        return {
          id:           b.id,
          mark,
          level:        levelName,
          span:         span.toFixed(2),
          width:        (b.width ?? 0).toFixed(3),
          depth:        (b.depth ?? 0).toFixed(3),
          material:     b.material ?? '—',
          loadBearing:  b.loadBearing ? 'Yes' : 'No',
          fireRating:   b.fireRating ?? '—',
          startSupport: b.startSupportType ?? '—',
          endSupport:   b.endSupportType   ?? '—',
        };
      });
    }

    // ── STRUCTURE — Slabs ───────────────────────────────────────────────────
    if (categoryId === 'Slabs') {
      const slabStore = window.slabStore // TODO(TASK-07);
      if (!slabStore) return [];
      return (slabStore.getAll?.() ?? []).map((s: any, idx: number) => {
        const levelName = resolveLevel(bimManager, s.levelId, s.position?.y ?? 0);
        const polygon   = s.polygon ?? [];
        const area      = polygon.length >= 3 ? polygonArea(polygon) : (s.width ?? 0) * (s.depth ?? 0);
        const mark      = s.properties?.mark ?? `SB${String(idx + 1).padStart(3, '0')}`;
        return {
          id:         s.id,
          mark,
          level:      levelName,
          thickness:  (s.thickness ?? 0).toFixed(3),
          area:       area.toFixed(2),
          material:   s.materialId ?? '—',
          phase:      s.phase ?? '—',
          baseOffset: (s.baseOffset ?? 0).toFixed(3),
        };
      });
    }

    // ── INTERIOR — Furniture ────────────────────────────────────────────────
    if (categoryId === 'Furniture') {
      const furnitureStore = window.furnitureStore // TODO(TASK-07);
      if (!furnitureStore) return [];
      return (furnitureStore.getAll?.() ?? []).map((f: any, idx: number) => {
        const levelName = f.levelName || resolveLevel(bimManager, f.levelId, f.position?.y ?? 0);
        const mark = f.properties?.mark ?? `FU${String(idx + 1).padStart(3, '0')}`;

        let room = '—';
        if (f.position) {
          const ref = RoomRelationshipService.getContainingRoom(
            f.position.x ?? 0, f.position.z ?? 0, f.levelId
          );
          if (ref) room = fmtRoom(ref as any);
        }

        return {
          id:           f.id,
          mark,
          furnitureType: f.furnitureType ?? f.type ?? '—',
          level:        levelName,
          room,
          width:        (f.width ?? 0).toFixed(2),
          length:       (f.length ?? 0).toFixed(2),
          height:       (f.height ?? 0).toFixed(2),
        };
      });
    }

    // ── INTERIOR — Handrails ────────────────────────────────────────────────
    if (categoryId === 'Handrails') {
      const handrailStore = window.handrailStore // TODO(TASK-07);
      if (!handrailStore) return [];
      return (handrailStore.getAll?.() ?? []).map((h: any, idx: number) => {
        const levelName = resolveLevel(bimManager, h.levelId);
        let length = 0;
        if (h.baseLine && h.baseLine[0] && h.baseLine[1]) {
          const p0 = h.baseLine[0], p1 = h.baseLine[1];
          const dx = (p1.x ?? 0) - (p0.x ?? 0);
          const dz = (p1.z ?? p1.y ?? 0) - (p0.z ?? p0.y ?? 0);
          length = Math.sqrt(dx * dx + dz * dz);
        }
        const mark = h.properties?.mark ?? `HR${String(idx + 1).padStart(3, '0')}`;
        return {
          id:           h.id,
          mark,
          level:        levelName,
          length:       length.toFixed(2),
          height:       (h.height ?? 0).toFixed(3),
          fillType:     h.fillType     ?? '—',
          railProfile:  h.railProfile  ?? '—',
          postSpacing:  h.postSpacing  != null ? h.postSpacing.toFixed(3) : '—',
          material:     h.materialId   ?? '—',
        };
      });
    }

    // ── MEP — Plumbing Fixtures ─────────────────────────────────────────────
    if (categoryId === 'Plumbing') {
      const plumbingStore = window.plumbingStore // TODO(TASK-07);
      if (!plumbingStore) return [];
      return (plumbingStore.getAll?.() ?? []).map((p: any, idx: number) => {
        const levelName = p.levelName || resolveLevel(bimManager, p.levelId, p.position?.y ?? 0);
        let room = '—';
        if (p.position) {
          const ref = RoomRelationshipService.getContainingRoom(
            p.position.x ?? 0, p.position.z ?? 0, p.levelId
          );
          if (ref) room = fmtRoom(ref as any);
        }
        const mark = p.properties?.mark ?? `PL${String(idx + 1).padStart(3, '0')}`;
        return {
          id:          p.id,
          mark,
          fixtureType: p.fixtureType ?? '—',
          level:       levelName,
          room,
          width:       (p.width  ?? 0).toFixed(2),
          height:      (p.height ?? 0).toFixed(2),
          length:      (p.length ?? 0).toFixed(2),
        };
      });
    }

    // ── DATA PLATFORM schedules ─────────────────────────────────────────────

    if (categoryId === 'Hierarchy-Units') {
      const hs  = window.hierarchyStore // TODO(TASK-07);
      const tas = window.templateAssignmentStore // TODO(TASK-07);
      const ts  = window.templateStore // TODO(TASK-07);
      const rs  = window.roomStore // TODO(TASK-07);
      if (!hs) return [];
      const units = hs.getAll().filter((n: any) => n.type === 'unit');
      return units.map((u: any) => {
        const assignment = tas?.getForNode?.(u.id);
        const template   = assignment ? ts?.getById?.(assignment.templateId) : undefined;
        const rooms: any[] = rs ? (rs.getAll?.() ?? []).filter((r: any) => r.unitId === u.id) : [];
        const actualArea   = rooms.reduce((sum: number, r: any) => sum + (r.computed?.area ?? 0), 0);
        const parentLevel  = u.parentId ? hs.getById?.(u.parentId) : undefined;
        return {
          id:         u.id,
          name:       u.name        ?? '—',
          code:       u.code        ?? '—',
          unitType:   u.unitType    ?? '—',
          level:      parentLevel?.name ?? u.parentId?.substring(0, 8) ?? '—',
          targetArea: u.plannedData?.targetArea != null ? u.plannedData.targetArea.toFixed(2) : '—',
          actualArea: actualArea > 0 ? actualArea.toFixed(2) : '—',
          roomCount:  rooms.length,
          syncState:  u.syncState   ?? '—',
          template:   template?.name ?? '—',
        };
      });
    }

    if (categoryId === 'Hierarchy-Levels') {
      const hs = window.hierarchyStore // TODO(TASK-07);
      const rs = window.roomStore // TODO(TASK-07);
      if (!hs) return [];
      const levels = hs.getAll().filter((n: any) => n.type === 'level');
      return levels.map((l: any) => {
        const parentBuilding = l.parentId ? hs.getById?.(l.parentId) : undefined;
        const units  = hs.getAll().filter((n: any) => n.type === 'unit' && n.parentId === l.id);
        const rooms: any[] = rs ? (rs.getAll?.() ?? []).filter((r: any) => r.levelId === l.bimLevelId || r.levelId === l.id) : [];
        const actualGFA = rooms.reduce((sum: number, r: any) => sum + (r.computed?.area ?? 0), 0);
        return {
          id:          l.id,
          name:        l.name         ?? '—',
          code:        l.code         ?? '—',
          levelNumber: l.levelNumber  ?? '—',
          building:    parentBuilding?.name ?? l.parentId?.substring(0, 8) ?? '—',
          targetGFA:   l.plannedData?.targetArea != null ? l.plannedData.targetArea.toFixed(2) : '—',
          actualGFA:   actualGFA > 0 ? actualGFA.toFixed(2) : '—',
          unitCount:   units.length,
          syncState:   l.syncState    ?? '—',
        };
      });
    }

    if (categoryId === 'Hierarchy-Buildings') {
      const hs = window.hierarchyStore // TODO(TASK-07);
      if (!hs) return [];
      const buildings = hs.getAll().filter((n: any) => n.type === 'building');
      return buildings.map((b: any) => {
        const parentSite = b.parentId ? hs.getById?.(b.parentId) : undefined;
        const levels = hs.getAll().filter((n: any) => n.type === 'level' && n.parentId === b.id);
        return {
          id:          b.id,
          name:        b.name        ?? '—',
          code:        b.code        ?? '—',
          buildingUse: b.buildingUse ?? '—',
          site:        parentSite?.name ?? b.parentId?.substring(0, 8) ?? '—',
          storeys:     levels.length,
          syncState:   b.syncState   ?? '—',
        };
      });
    }

    if (categoryId === 'Rooms-WithTemplate') {
      const rs  = window.roomStore // TODO(TASK-07);
      const tas = window.templateAssignmentStore // TODO(TASK-07);
      const ts  = window.templateStore // TODO(TASK-07);
      const hs  = window.hierarchyStore // TODO(TASK-07);
      if (!rs || !tas) return [];
      return (rs.getAll?.() ?? [])
        .filter((r: any) => tas.getForNode?.(r.id) != null)
        .map((r: any) => {
          const assignment = tas.getForNode(r.id);
          const template   = assignment ? ts?.getById?.(assignment.templateId) : undefined;
          const unitNode   = r.unitId ? hs?.getById?.(r.unitId) : undefined;
          const level      = bimManager?.getLevelById?.(r.levelId);
          const syncState  = window.syncStateEngine?.recompute?.(r.id) ?? '—';
          return {
            id:         r.id,
            roomNumber: r.roomNumber ?? '—',
            name:       r.name       ?? '—',
            level:      level?.name  ?? r.levelId?.substring(0, 8) ?? '—',
            unit:       unitNode?.name ?? '—',
            area:       (r.computed?.area ?? 0).toFixed(2),
            syncState,
            template:   template?.name ?? '—',
          };
        });
    }

    if (categoryId === 'Rooms-Conflicts') {
      const rs  = window.roomStore // TODO(TASK-07);
      const tas = window.templateAssignmentStore // TODO(TASK-07);
      const ts  = window.templateStore // TODO(TASK-07);
      if (!rs) return [];
      return (rs.getAll?.() ?? [])
        .filter((r: any) => {
          if (!tas?.getForNode?.(r.id)) return false;
          const state = window.syncStateEngine?.recompute?.(r.id);
          return state === 'conflict';
        })
        .map((r: any) => {
          const assignment  = tas?.getForNode?.(r.id);
          const template    = assignment ? ts?.getById?.(assignment.templateId) : undefined;
          const level       = bimManager?.getLevelById?.(r.levelId);
          const failingReqs = template?.requirements
            ? Object.keys(template.requirements).join(', ')
            : '—';
          return {
            id:          r.id,
            name:        r.name  ?? '—',
            level:       level?.name ?? r.levelId?.substring(0, 8) ?? '—',
            template:    template?.name ?? '—',
            failingReqs,
          };
        });
    }

    if (categoryId === 'ElementCodes-All') {
      const ecs = window.elementCodeStore // TODO(TASK-07);
      if (!ecs) return [];
      return (ecs.getAll?.() ?? []).map((ec: any) => ({
        id:          ec.elementId,
        code:        ec.code,
        prefix:      ec.prefix,
        elementType: ec.elementType,
        elementId:   ec.elementId,
      }));
    }

    if (categoryId === 'Template-Compliance') {
      const ts  = window.templateStore // TODO(TASK-07);
      const tas = window.templateAssignmentStore // TODO(TASK-07);
      const hs  = window.hierarchyStore // TODO(TASK-07);
      if (!ts || !tas) return [];
      return (ts.getAll?.() ?? []).map((t: any) => {
        const assignments: any[] = tas.getByTemplate?.(t.id) ?? [];
        const assigned = assignments.length;
        let synced = 0, conflicts = 0, derived = 0;
        for (const a of assignments) {
          const nodeId = a.nodeId;
          let state: string | undefined;
          const hierarchyNode = hs?.getById?.(nodeId);
          if (hierarchyNode) {
            state = hierarchyNode.syncState;
          } else {
            state = window.syncStateEngine?.recompute?.(nodeId);
          }
          if (state === 'synced')   synced++;
          if (state === 'conflict') conflicts++;
          if (state === 'derived')  derived++;
        }
        const syncedPct = assigned > 0 ? ((synced / assigned) * 100).toFixed(0) + '%' : '—';
        return {
          id:            t.id,
          name:          t.name  ?? '—',
          scope:         t.scope ?? '—',
          assigned,
          syncedPct,
          conflictCount: conflicts,
          derivedCount:  derived,
        };
      });
    }

    if (categoryId === 'Rooms-Programme-Deviation') {
      const rs  = window.roomStore // TODO(TASK-07);
      const tas = window.templateAssignmentStore // TODO(TASK-07);
      const ts  = window.templateStore // TODO(TASK-07);
      const ecs = window.elementCodeStore // TODO(TASK-07);
      const hs  = window.hierarchyStore // TODO(TASK-07);
      if (!rs) return [];
      return (rs.getAll?.() ?? []).map((r: any) => {
        const assignment = tas?.getForNode?.(r.id);
        const template   = assignment ? ts?.getById?.(assignment.templateId) : undefined;
        const level      = bimManager?.getLevelById?.(r.levelId);
        const unit       = r.unitId ? hs?.getById?.(r.unitId) : undefined;
        const code       = ecs?.getCode?.(r.id);
        const targetArea: number | null = template?.requirements?.targetArea?.target ?? null;
        const actualArea: number = r.computed?.area ?? 0;
        let deviation = '—';
        let status = 'No template';
        if (targetArea != null && targetArea > 0) {
          const dev = ((actualArea - targetArea) / targetArea) * 100;
          deviation = `${dev >= 0 ? '+' : ''}${dev.toFixed(1)}%`;
          if (Math.abs(dev) <= 5)       status = 'Pass';
          else if (Math.abs(dev) <= 15) status = '⚠️ Warning';
          else                          status = '🔴 Fail';
        }
        return {
          name:       r.name ?? '—',
          number:     code?.code ?? r.roomNumber ?? '—',
          level:      level?.name ?? '—',
          unit:       unit?.name ?? '—',
          template:   template?.name ?? '—',
          targetArea: targetArea != null ? targetArea.toFixed(2) : '—',
          actualArea: actualArea.toFixed(2),
          deviation,
          status,
        };
      });
    }

    // ── MATERIALS LIBRARY ─────────────────────────────────────────────────────
    if (categoryId === 'Materials') {
      return STANDARD_MATERIAL_LIBRARY.map(def => {
        let colorHex = '#ffffff';
        try {
          const c = (def.params as any).color;
          if (c && typeof c.getHexString === 'function') {
            colorHex = '#' + c.getHexString();
          } else if (typeof c === 'number') {
            colorHex = '#' + c.toString(16).padStart(6, '0');
          } else if (typeof c === 'string') {
            colorHex = c.startsWith('#') ? c : `#${c}`;
          }
        } catch { /* ignore */ }
        return {
          id:           def.id,
          label:        def.label,
          category:     def.category,
          color:        colorHex,
          metalness:    ((def.params as any).metalness ?? 0).toFixed(2),
          roughness:    ((def.params as any).roughness ?? 0.5).toFixed(2),
          opacity:      ((def.params as any).opacity   ?? 1.0).toFixed(2),
          transparency: (def.params as any).transparent ? 'Yes' : 'No',
        };
      });
    }

    return [];
  }
}
