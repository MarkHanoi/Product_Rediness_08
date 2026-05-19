/**
 * RoomContentsService — single canonical answer to "what is in room R?".
 *
 * Sprint J extraction (2026-05-10): moved from src/engine/subsystems/rooms/ to
 * @pryzm/room-topology. No import remapping required — all deps are same-package
 * (pointInPolygon, RoomTypes) or @pryzm/* packages already imported transitively.
 */

import { pointInPolygon } from './RoomPolygonUtils';
import type { RoomData } from './RoomTypes';

export interface ElementRef {
  id: string;
  type: string;
  label: string;
}

export interface RoomContents {
  roomId: string;
  levelId: string;
  bounding: {
    walls:        ElementRef[];
    slabs:        ElementRef[];
    columns:      ElementRef[];
    curtainWalls: ElementRef[];
  };
  hosted: {
    doors:    ElementRef[];
    windows:  ElementRef[];
    openings: ElementRef[];
  };
  contained: {
    furniture:   ElementRef[];
    columns:     ElementRef[];
    plumbing:    ElementRef[];
    lighting:    ElementRef[];
    beams:       ElementRef[];
    handrails:   ElementRef[];
    stairs:      ElementRef[];
    annotations: ElementRef[];
  };
  vertical: {
    above: ElementRef[];
    below: ElementRef[];
  };
  totals: {
    bounding:  number;
    hosted:    number;
    contained: number;
    vertical:  number;
    total:     number;
  };
}

interface MinReadable<T = any> { getAll(): T[] }
interface MinRoomStore { getById(id: string): RoomData | undefined; getAll(): RoomData[]; getByLevel(levelId: string): RoomData[] }
interface MinBimManager { getLevelById(levelId: string): { id: string; name?: string; elevation?: number } | undefined; getLevels?(): Array<{ id: string; elevation?: number }> }

export interface RoomContentsServiceDeps {
  roomStore:         MinRoomStore;
  bimManager:        MinBimManager;
  wallStore?:        MinReadable;
  doorStore?:        MinReadable;
  windowStore?:      MinReadable;
  openingStore?:     MinReadable;
  slabStore?:        MinReadable;
  columnStore?:      MinReadable;
  curtainWallStore?: MinReadable;
  furnitureStore?:   MinReadable;
  plumbingStore?:    MinReadable;
  lightingStore?:    MinReadable;
  beamStore?:        MinReadable;
  handrailStore?:    MinReadable;
  stairStore?:       MinReadable;
  annotationStore?:  MinReadable;
}

export class RoomContentsService {
  constructor(private readonly deps: RoomContentsServiceDeps) {}

  attach(partial: Partial<RoomContentsServiceDeps>): void {
    Object.assign(this.deps as any, partial);
  }

  getContents(roomId: string): RoomContents | null {
    const room = this._safe(() => this.deps.roomStore.getById(roomId));
    if (!room) return null;

    const levelId = room.levelId;
    const polygon = room.boundary?.polygon ?? [];
    const bbox    = room.computed?.boundingBox;

    const contents: RoomContents = {
      roomId,
      levelId,
      bounding: {
        walls:        this._refsByIds(this._wallStore(), room.boundingWallIds ?? [], 'wall'),
        slabs:        this._slabsForRoom(room),
        columns:      this._refsByIds(this._columnStore(), room.boundingColumnIds ?? [], 'column'),
        curtainWalls: this._curtainWallsForRoom(room),
      },
      hosted: {
        doors:    this._hostedOpenings(this._doorStore(),    room.boundingWallIds ?? [], 'door'),
        windows:  this._hostedOpenings(this._windowStore(),  room.boundingWallIds ?? [], 'window'),
        openings: this._hostedOnHostId(this._openingStore(), room.boundingWallIds ?? [], 'opening'),
      },
      contained: {
        furniture:   this._containedByCentroid(this._furnitureStore(), levelId, polygon, 'furniture'),
        columns:     this._containedFreeStandingColumns(room),
        plumbing:    this._containedByCentroid(this._plumbingStore(), levelId, polygon, 'plumbing'),
        lighting:    this._containedByCentroid(this._lightingStore(), levelId, polygon, 'lighting'),
        beams:       this._containedByMidSpan(this._beamStore(),     levelId, polygon, 'beam'),
        handrails:   this._containedByCentroid(this._handrailStore(), levelId, polygon, 'handrail'),
        stairs:      this._containedByCentroid(this._stairStore(),    levelId, polygon, 'stair'),
        annotations: this._containedByCentroid(this._annotationStore(), levelId, polygon, 'annotation'),
      },
      vertical: this._verticalNeighbours(room, bbox),
      totals: { bounding: 0, hosted: 0, contained: 0, vertical: 0, total: 0 },
    };

    contents.totals.bounding  = sumLen(contents.bounding);
    contents.totals.hosted    = sumLen(contents.hosted);
    contents.totals.contained = sumLen(contents.contained);
    contents.totals.vertical  = sumLen(contents.vertical);
    contents.totals.total     = contents.totals.bounding + contents.totals.hosted +
                                contents.totals.contained + contents.totals.vertical;

    return contents;
  }

  getRoomForElement(
    elementId: string,
    elementType?: string,
    levelIdHint?: string,
  ): { rooms: RoomData[]; primaryRoomId: string | null; relationship: 'bounding' | 'hosted' | 'contained' | 'none' } {
    const empty = { rooms: [] as RoomData[], primaryRoomId: null, relationship: 'none' as const };
    if (!elementId) return empty;

    const t = (elementType || '').toLowerCase().trim();

    if (t === 'wall' || t === 'slab' || t === 'column' || t === 'curtainwall' || t === 'curtain-wall') {
      const allRooms = this._allRooms();
      const matches: RoomData[] = [];
      for (const r of allRooms) {
        const hit =
          (t === 'wall'        && (r.boundingWallIds   ?? []).includes(elementId)) ||
          (t === 'slab'        && (r.boundingSlabIds   ?? []).includes(elementId)) ||
          (t === 'column'      && (r.boundingColumnIds ?? []).includes(elementId)) ||
          ((t === 'curtainwall' || t === 'curtain-wall') &&
            ((r as any).boundingCurtainWallIds ?? []).includes(elementId));
        if (hit) matches.push(r);
      }
      if (matches.length > 0) {
        return { rooms: matches, primaryRoomId: matches[0].id, relationship: 'bounding' };
      }
    }

    if (t === 'door' || t === 'window' || t === 'opening') {
      const hostWallId = this._resolveHostWallId(elementId, t);
      if (hostWallId) {
        const allRooms = this._allRooms();
        const matches = allRooms.filter(r => (r.boundingWallIds ?? []).includes(hostWallId));
        if (matches.length > 0) {
          return { rooms: matches, primaryRoomId: matches[0].id, relationship: 'hosted' };
        }
      }
    }

    const elementData = this._lookupElement(elementId, t);
    const xz = elementData ? elementXZ(elementData) ?? this._tryBeamMid(elementData) : null;
    const elementLevelId = (elementData as any)?.levelId ?? levelIdHint ?? null;

    if (xz) {
      const allRooms = this._allRooms();
      const matches: RoomData[] = [];
      for (const r of allRooms) {
        if (elementLevelId && r.levelId !== elementLevelId) continue;
        const polygon = r.boundary?.polygon ?? [];
        if (polygon.length < 3) continue;
        if (pointInPolygon(xz.x, xz.z, polygon)) matches.push(r);
      }
      if (matches.length > 0) {
        return { rooms: matches, primaryRoomId: matches[0].id, relationship: 'contained' };
      }
    }

    return empty;
  }

  private _allRooms(): RoomData[] {
    try {
      const fn = (this.deps.roomStore as any).getAll;
      if (typeof fn === 'function') return fn.call(this.deps.roomStore) ?? [];
    } catch { /* fall through */ }
    return [];
  }

  private _resolveHostWallId(elementId: string, type: string): string | null {
    const tryStore = (s: MinReadable | undefined): string | null => {
      if (!s) return null;
      try {
        const all = s.getAll();
        const hit = (all as any[]).find(e => e?.id === elementId);
        if (hit) return hit.wallId ?? hit.hostId ?? null;
      } catch { /* ignore */ }
      return null;
    };

    if (type === 'door')   return tryStore(this._doorStore());
    if (type === 'window') return tryStore(this._windowStore());
    if (type === 'opening') {
      const direct = tryStore(this._openingStore());
      if (direct) return direct;
      const ws = this._wallStore();
      if (ws) {
        try {
          const walls: any[] = ws.getAll();
          for (const w of walls) {
            const o = w?.openings?.find((x: any) => x.elementId === elementId || x.id === elementId);
            if (o) return w.id;
          }
        } catch { /* ignore */ }
      }
    }
    return null;
  }

  private _lookupElement(elementId: string, typeHint: string): any | null {
    const sources: Array<{ t: string; s: MinReadable | undefined }> = [
      { t: 'furniture',   s: this._furnitureStore() },
      { t: 'column',      s: this._columnStore() },
      { t: 'plumbing',    s: this._plumbingStore() },
      { t: 'lighting',    s: this._lightingStore() },
      { t: 'beam',        s: this._beamStore() },
      { t: 'handrail',    s: this._handrailStore() },
      { t: 'stair',       s: this._stairStore() },
      { t: 'annotation',  s: this._annotationStore() },
      { t: 'slab',        s: this._slabStore() },
      { t: 'curtainwall', s: this._curtainWallStore() },
      { t: 'wall',        s: this._wallStore() },
    ];
    sources.sort((a, b) => (a.t === typeHint ? -1 : b.t === typeHint ? 1 : 0));
    for (const { s } of sources) {
      if (!s) continue;
      try {
        const all = s.getAll();
        const hit = (all as any[]).find(e => e?.id === elementId);
        if (hit) return hit;
      } catch { /* ignore */ }
    }
    return null;
  }

  private _tryBeamMid(e: any): { x: number; z: number } | null {
    try { return beamMidSpan(e); } catch { return null; }
  }

  getContainedElementIds(roomId: string): string[] {
    const c = this.getContents(roomId);
    if (!c) return [];
    const out: string[] = [];
    for (const bucket of [c.bounding, c.hosted, c.contained, c.vertical]) {
      for (const arr of Object.values(bucket)) {
        for (const ref of arr as ElementRef[]) out.push(ref.id);
      }
    }
    return out;
  }

  private _refsByIds(store: MinReadable | undefined, ids: string[], type: string): ElementRef[] {
    if (!store || ids.length === 0) return [];
    const set = new Set(ids);
    const all = this._safe(() => store.getAll()) ?? [];
    return all.filter((e: any) => e?.id && set.has(e.id)).map((e: any) => toRef(e, type));
  }

  private _slabsForRoom(room: RoomData): ElementRef[] {
    const slabStore = this._slabStore();
    if (!slabStore) return [];
    const declared = new Set(room.boundingSlabIds ?? []);
    const bbox = room.computed?.boundingBox;
    const all = this._safe(() => slabStore.getAll()) ?? [];

    const out: ElementRef[] = [];
    const seen = new Set<string>();
    for (const s of all as any[]) {
      if (!s?.id || seen.has(s.id)) continue;
      let take = declared.has(s.id);
      if (!take && s.levelId === room.levelId && bbox) {
        const sBox = slabBBox(s);
        if (sBox && bboxOverlap(bbox, sBox)) take = true;
      }
      if (take) {
        seen.add(s.id);
        out.push(toRef(s, 'slab'));
      }
    }
    return out;
  }

  private _curtainWallsForRoom(room: RoomData): ElementRef[] {
    const cwStore = this._curtainWallStore();
    if (!cwStore) return [];
    const polygon = room.boundary?.polygon ?? [];
    const all = this._safe(() => cwStore.getAll()) ?? [];
    const out: ElementRef[] = [];
    for (const cw of all as any[]) {
      if (!cw?.id || cw.levelId !== room.levelId) continue;
      const mid = curtainWallMidpoint(cw);
      if (mid && pointInPolygon(mid.x, mid.z, polygon)) {
        out.push(toRef(cw, 'curtainWall'));
      }
    }
    return out;
  }

  private _hostedOpenings(store: MinReadable | undefined, boundingWallIds: string[], type: string): ElementRef[] {
    if (!store || boundingWallIds.length === 0) return [];
    const wallSet = new Set(boundingWallIds);
    const all = this._safe(() => store.getAll()) ?? [];
    return all
      .filter((o: any) => o?.id && o.wallId && wallSet.has(o.wallId))
      .map((o: any) => toRef(o, type));
  }

  private _hostedOnHostId(store: MinReadable | undefined, boundingWallIds: string[], type: string): ElementRef[] {
    if (!store || boundingWallIds.length === 0) return [];
    const wallSet = new Set(boundingWallIds);
    const all = this._safe(() => store.getAll()) ?? [];
    return all
      .filter((o: any) => o?.id && o.hostId && wallSet.has(o.hostId))
      .map((o: any) => toRef(o, type));
  }

  private _containedByCentroid(
    store:    MinReadable | undefined,
    levelId:  string,
    polygon:  Array<{ x: number; z: number }>,
    type:     string,
  ): ElementRef[] {
    if (!store || polygon.length < 3) return [];
    const all = this._safe(() => store.getAll()) ?? [];
    const out: ElementRef[] = [];
    for (const e of all as any[]) {
      if (!e?.id) continue;
      if (e.levelId && e.levelId !== levelId) continue;
      const p = elementXZ(e);
      if (!p) continue;
      if (pointInPolygon(p.x, p.z, polygon)) out.push(toRef(e, type));
    }
    return out;
  }

  private _containedByMidSpan(
    store:    MinReadable | undefined,
    levelId:  string,
    polygon:  Array<{ x: number; z: number }>,
    type:     string,
  ): ElementRef[] {
    if (!store || polygon.length < 3) return [];
    const all = this._safe(() => store.getAll()) ?? [];
    const out: ElementRef[] = [];
    for (const e of all as any[]) {
      if (!e?.id) continue;
      if (e.levelId && e.levelId !== levelId) continue;
      const mid = beamMidSpan(e);
      if (!mid) continue;
      if (pointInPolygon(mid.x, mid.z, polygon)) out.push(toRef(e, type));
    }
    return out;
  }

  private _containedFreeStandingColumns(room: RoomData): ElementRef[] {
    const columnStore = this._columnStore();
    if (!columnStore) return [];
    const polygon = room.boundary?.polygon ?? [];
    if (polygon.length < 3) return [];
    const declared = new Set(room.boundingColumnIds ?? []);
    const all = this._safe(() => columnStore.getAll()) ?? [];
    const out: ElementRef[] = [];
    for (const c of all as any[]) {
      if (!c?.id) continue;
      if (declared.has(c.id)) continue;
      if (c.levelId && c.levelId !== room.levelId) continue;
      const p = elementXZ(c);
      if (!p) continue;
      if (pointInPolygon(p.x, p.z, polygon)) out.push(toRef(c, 'column'));
    }
    return out;
  }

  private _verticalNeighbours(
    room: RoomData,
    bbox: RoomData['computed']['boundingBox'] | undefined,
  ): { above: ElementRef[]; below: ElementRef[] } {
    if (!bbox) return { above: [], below: [] };

    const levels = this._safe(() => this.deps.bimManager.getLevels?.()) ?? [];
    if (levels.length === 0) return { above: [], below: [] };

    const ordered = [...levels].sort((a, b) => (a.elevation ?? 0) - (b.elevation ?? 0));
    const idx = ordered.findIndex(l => l.id === room.levelId);
    const above: ElementRef[] = [];
    const below: ElementRef[] = [];
    if (idx === -1) return { above, below };

    const collect = (lvlId: string, target: ElementRef[]) => {
      const rooms = this._safe(() => this.deps.roomStore.getByLevel(lvlId)) ?? [];
      for (const r of rooms) {
        const otherBox = r.computed?.boundingBox;
        if (otherBox && bboxOverlap(bbox, otherBox)) target.push(toRef(r, 'room'));
      }
    };

    if (idx + 1 < ordered.length) collect(ordered[idx + 1].id, above);
    if (idx - 1 >= 0)             collect(ordered[idx - 1].id, below);
    return { above, below };
  }

  private _wallStore():        MinReadable | undefined { return this.deps.wallStore        ?? (typeof window !== 'undefined' ? (window as any).wallStore        : undefined); }
  private _doorStore():        MinReadable | undefined { return this.deps.doorStore        ?? (typeof window !== 'undefined' ? (window as any).doorStore        : undefined); }
  private _windowStore():      MinReadable | undefined { return this.deps.windowStore      ?? (typeof window !== 'undefined' ? (window as any).windowStore      : undefined); }
  private _openingStore():     MinReadable | undefined { return this.deps.openingStore     ?? (typeof window !== 'undefined' ? (window as any).openingStore     : undefined); }
  private _slabStore():        MinReadable | undefined { return this.deps.slabStore        ?? (typeof window !== 'undefined' ? (window as any).slabStore        : undefined); }
  private _columnStore():      MinReadable | undefined { return this.deps.columnStore      ?? (typeof window !== 'undefined' ? (window as any).columnStore      : undefined); }
  private _curtainWallStore(): MinReadable | undefined { return this.deps.curtainWallStore ?? (typeof window !== 'undefined' ? (window as any).curtainWallStore : undefined); }
  private _furnitureStore():   MinReadable | undefined { return this.deps.furnitureStore   ?? (typeof window !== 'undefined' ? (window as any).furnitureStore   : undefined); }
  private _plumbingStore():    MinReadable | undefined { return this.deps.plumbingStore    ?? (typeof window !== 'undefined' ? (window as any).plumbingStore    : undefined); }
  private _lightingStore():    MinReadable | undefined { return this.deps.lightingStore    ?? (typeof window !== 'undefined' ? (window as any).lightingStore    : undefined); }
  private _beamStore():        MinReadable | undefined { return this.deps.beamStore        ?? (typeof window !== 'undefined' ? (window as any).beamStore        : undefined); }
  private _handrailStore():    MinReadable | undefined { return this.deps.handrailStore    ?? (typeof window !== 'undefined' ? (window as any).handrailStore    : undefined); }
  private _stairStore():       MinReadable | undefined { return this.deps.stairStore       ?? (typeof window !== 'undefined' ? (window as any).stairStore       : undefined); }
  private _annotationStore():  MinReadable | undefined { return this.deps.annotationStore  ?? (typeof window !== 'undefined' ? (window as any).annotationStore  : undefined); }

  private _safe<T>(fn: () => T): T | undefined {
    try { return fn(); } catch { return undefined; }
  }
}

function toRef(e: any, type: string): ElementRef {
  const label =
    (typeof e.name === 'string' && e.name.trim()) ||
    (typeof e.roomNumber === 'string' && e.roomNumber) ||
    (typeof e.tag === 'string' && e.tag) ||
    (typeof e.mark === 'string' && e.mark) ||
    `${type}:${String(e.id ?? '?').slice(0, 8)}`;
  return { id: String(e.id), type, label: String(label) };
}

function elementXZ(e: any): { x: number; z: number } | null {
  if (e?.position && typeof e.position.x === 'number' && typeof e.position.z === 'number') {
    return { x: e.position.x, z: e.position.z };
  }
  if (typeof e?.x === 'number' && typeof e?.z === 'number') return { x: e.x, z: e.z };
  return null;
}

function curtainWallMidpoint(cw: any): { x: number; z: number } | null {
  if (cw?.baseLine?.[0] && cw?.baseLine?.[1]) {
    return {
      x: (cw.baseLine[0].x + cw.baseLine[1].x) / 2,
      z: (cw.baseLine[0].z + cw.baseLine[1].z) / 2,
    };
  }
  if (cw?.startPoint && cw?.endPoint) {
    return {
      x: (cw.startPoint.x + cw.endPoint.x) / 2,
      z: (cw.startPoint.z + cw.endPoint.z) / 2,
    };
  }
  return null;
}

function beamMidSpan(b: any): { x: number; z: number } | null {
  if (b?.startPoint && b?.endPoint) {
    return {
      x: (b.startPoint.x + b.endPoint.x) / 2,
      z: (b.startPoint.z + b.endPoint.z) / 2,
    };
  }
  return elementXZ(b);
}

function slabBBox(s: any): { minX: number; minZ: number; maxX: number; maxZ: number } | null {
  if (Array.isArray(s?.polygon) && s.polygon.length >= 3) {
    let minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity;
    for (const p of s.polygon) {
      const x = p.x ?? 0;
      const z = p.y ?? p.z ?? 0;
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
    }
    if (Number.isFinite(minX) && Number.isFinite(minZ)) {
      const ox = s.position?.x ?? 0;
      const oz = s.position?.z ?? 0;
      return { minX: minX + ox, minZ: minZ + oz, maxX: maxX + ox, maxZ: maxZ + oz };
    }
  }
  if (typeof s?.width === 'number' && typeof s?.depth === 'number') {
    const cx = s.position?.x ?? 0;
    const cz = s.position?.z ?? 0;
    return {
      minX: cx - s.width / 2, maxX: cx + s.width / 2,
      minZ: cz - s.depth / 2, maxZ: cz + s.depth / 2,
    };
  }
  return null;
}

function bboxOverlap(
  a: { minX: number; minZ: number; maxX: number; maxZ: number },
  b: { minX: number; minZ: number; maxX: number; maxZ: number },
): boolean {
  return !(a.maxX < b.minX || a.minX > b.maxX || a.maxZ < b.minZ || a.minZ > b.maxZ);
}

function sumLen(group: Record<string, ElementRef[]>): number {
  let n = 0;
  for (const arr of Object.values(group)) n += arr.length;
  return n;
}
