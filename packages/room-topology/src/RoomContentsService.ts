/**
 * RoomContentsService — single canonical answer to "what is in room R?".
 *
 * Sprint J extraction (2026-05-10): moved from src/engine/subsystems/rooms/ to
 * @pryzm/room-topology. No import remapping required — all deps are same-package
 * (pointInPolygon, RoomTypes) or @pryzm/* packages already imported transitively.
 */

import { determineBoundingWalls, type BoundingWallCarrier } from '@pryzm/core-app-model';
import { pointInPolygon } from './RoomPolygonUtils';
import type { RoomData } from './RoomTypes';
import {
  readRoomsDetermined,
  type RoomStoreDetermination,
  type RoomStoreUndeterminedReason,
} from './roomStoreDetermination';
import type { BoundingWallUndeterminedReason } from '@pryzm/core-app-model';

// ─── §GR-10/GR-14 — the bounding-id READER layer of this service ─────────────
//
// THE DEFECT. `room.boundingWallIds ?? []` (and its slab / column / curtain-wall
// siblings) appeared at eleven sites in this file. Each collapsed THREE
// distinguishable facts into one value:
//   1. the room was examined and bounds ZERO walls — a real, determined answer;
//   2. the field is ABSENT because no producer ever wrote it (C79 §7.1);
//   3. the room record itself is partial or unreadable.
// C71 §4.4: "`[]` may only ever mean zero results." C78 §1.4: an absent field and
// a `?? []` are UNDETERMINED, never DETERMINED-unaffected.
//
// WHY IT TRAVELS HERE IN PARTICULAR. This service is the single canonical answer
// to "what is in room R?" and to "which room is this element in?". On case (2)
// `getContents` returned `bounding.walls: []`, `hosted.doors: []`,
// `hosted.windows: []`, `hosted.openings: []` and `totals.bounding: 0` — a
// positive claim that the room bounds nothing and hosts nothing — while
// `getRoomForElement` silently dropped every unrecorded room from its candidate
// scan and then answered *"this element belongs to no room"*. Both are the
// `FacadeOrientationService` shape (C79 §5.2.0): an absence rendered as a fact
// about the building.
//
// NO RIVAL VOCABULARY (C78 §8.1). Nothing is minted below. The wall arm IS
// core-app-model's `determineBoundingWalls`, CALLED — not re-implemented — and
// the two reason literals are the two already-pinned imports:
// `BoundingWallUndeterminedReason` ('RELATIONSHIP_NOT_RECORDED', pinned by
// `boundingWallDetermination.test.ts`) and `RoomStoreUndeterminedReason`
// ('RELATIONSHIP_NOT_READABLE', pinned by `roomStoreDetermination.test.ts`).
// `RoomContentsUndeterminedReason` is their UNION — a type alias over two
// imported literals, so a twelfth member is unrepresentable here (C75 §2.8).

/** The two C78 §8.1 members this service can produce. Both imported, never restated. */
export type RoomContentsUndeterminedReason =
  | RoomStoreUndeterminedReason
  | BoundingWallUndeterminedReason;

/**
 * A named question this service could NOT answer. Deliberately NOT `[]`-shaped:
 * its presence is the whole signal.
 *
 * Supertype of `Extract<RoomStoreDetermination, { kind: 'undetermined' }>`, so
 * the store-unreadable record flows into the same channel as the
 * relationship-unrecorded one without a second dialect.
 */
export interface RoomContentsUndetermined {
  readonly kind: 'undetermined';
  /** WHAT went unanswered, for a card / log line / tooltip to render. */
  readonly scope: string;
  readonly reason: RoomContentsUndeterminedReason;
  /** WHY, in words. Always present here — a rendered refusal must never be blank. */
  readonly detail: string;
}

/** The bounding relationship fields this service reads off a room record. */
export type BoundingIdsField =
  | 'boundingWallIds'
  | 'boundingSlabIds'
  | 'boundingColumnIds'
  | 'boundingCurtainWallIds';

const BOUNDING_FIELD_LABEL: Record<BoundingIdsField, string> = {
  boundingWallIds:        'bounding walls',
  boundingSlabIds:        'bounding slabs',
  boundingColumnIds:      'bounding columns',
  boundingCurtainWallIds: 'bounding curtain walls',
};

/** Which bounding list answers "is this element bounding room R?", per element type. */
const BOUNDING_FIELD_FOR_TYPE: Readonly<Record<string, BoundingIdsField>> = {
  wall:            'boundingWallIds',
  slab:            'boundingSlabIds',
  column:          'boundingColumnIds',
  curtainwall:     'boundingCurtainWallIds',
  'curtain-wall':  'boundingCurtainWallIds',
};

export type BoundingIdsDetermination =
  | {
      readonly kind: 'determined';
      /** MAY be empty — an empty DETERMINED list is a real answer: this room was
       *  examined and bounds zero elements of that kind. */
      readonly elements: readonly string[];
    }
  | RoomContentsUndetermined;

/**
 * THE discriminator. Replaces `room.boundingXIds ?? []` at every reader here.
 *
 * - a **present array** → `determined`, whatever its length;
 * - **absent / null / not an array / no room record** → `undetermined` +
 *   `RELATIONSHIP_NOT_RECORDED` (C79 §5.2.0): the field names a dependency and
 *   nothing wrote it, so zero was NOT determined.
 *
 * PURE: no store access, no I/O, no throw.
 */
export function determineBoundingIds(
  room: BoundingWallCarrier | Readonly<Record<string, unknown>> | null | undefined,
  field: BoundingIdsField,
  scopeLabel?: string,
): BoundingIdsDetermination {
  const roomId = (room as { id?: string } | null | undefined)?.id ?? 'an unidentified room';
  const scope = scopeLabel ?? `${BOUNDING_FIELD_LABEL[field]} of room ${roomId}`;
  const unrecorded =
    `room.${field} is absent — the field names a dependency that no producer wrote ` +
    `(C79 §7.1). Zero ${BOUNDING_FIELD_LABEL[field].replace('bounding ', '')} was NOT determined.`;

  // The WALL arm is core-app-model's authority, CALLED. Its `detail` is optional
  // there and total here, so the only local work is making it so.
  if (field === 'boundingWallIds') {
    const d = determineBoundingWalls(room as BoundingWallCarrier | null | undefined, scope);
    return d.kind === 'determined'
      ? { kind: 'determined', elements: d.elements }
      : { kind: 'undetermined', scope: d.scope, reason: d.reason, detail: d.detail ?? unrecorded };
  }

  if (room === null || room === undefined) {
    return {
      kind: 'undetermined', scope, reason: 'RELATIONSHIP_NOT_RECORDED',
      detail: `no room record was supplied, so ${BOUNDING_FIELD_LABEL[field]} was never read`,
    };
  }

  const raw = (room as Readonly<Record<string, unknown>>)[field];
  if (!Array.isArray(raw)) {
    return { kind: 'undetermined', scope, reason: 'RELATIONSHIP_NOT_RECORDED', detail: unrecorded };
  }
  return { kind: 'determined', elements: raw as readonly string[] };
}

/**
 * The ids, or `null` when they could not be determined.
 *
 * The migration affordance for readers whose whole use of the field is to
 * iterate or membership-test it. It is NOT a shorthand for `?? []` — returning
 * `null` where the old code returned `[]` is exactly the observable difference
 * this task exists to create.
 */
export function boundingIdsOrUnknown(
  room: BoundingWallCarrier | Readonly<Record<string, unknown>> | null | undefined,
  field: BoundingIdsField,
): readonly string[] | null {
  const d = determineBoundingIds(room, field);
  return d.kind === 'determined' ? d.elements : null;
}

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
    /**
     * §GR-10/GR-14 — is `total` an EXACT count, or a floor?
     *
     * `false` whenever {@link RoomContents.undetermined} is non-empty: at least
     * one relationship was never recorded, so the counts above are "at least N",
     * not "N". A caller that renders a bare number without reading this is
     * publishing an unknown as a fact.
     */
    exact:     boolean;
  };
  /**
   * §GR-10/GR-14 — the questions this answer could NOT settle. ABSENT when
   * everything was determined; never `[]`-shaped, because an empty array here
   * would reintroduce exactly the ambiguity the field exists to remove.
   *
   * READ IT BEFORE RENDERING AN EMPTY BUCKET. A `boundingWallIds` record here
   * means `bounding.walls` AND all three `hosted.*` buckets are undetermined —
   * doors, windows and openings are found THROUGH the bounding walls, so an
   * unrecorded wall list silently empties them too.
   */
  undetermined?: readonly RoomContentsUndetermined[];
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

    // ─── §GR-10/GR-14 — every bounding relationship is DETERMINED once, here ──
    // Taken before any bucket is built, so an unrecorded field is RECORDED as a
    // known-unknown instead of being silently spent as an empty id list at three
    // or four different call sites.
    const undetermined: RoomContentsUndetermined[] = [];
    const read = (field: BoundingIdsField): readonly string[] | null => {
      const d = determineBoundingIds(room, field, `${BOUNDING_FIELD_LABEL[field]} of room ${roomId}`);
      if (d.kind === 'determined') return d.elements;
      undetermined.push(d);
      return null;
    };
    const wallIds   = read('boundingWallIds');
    const columnIds = read('boundingColumnIds');
    const slabIds   = read('boundingSlabIds');

    const contents: RoomContents = {
      roomId,
      levelId,
      bounding: {
        walls:        this._refsByIds(this._wallStore(), wallIds, 'wall'),
        slabs:        this._slabsForRoom(room, slabIds),
        columns:      this._refsByIds(this._columnStore(), columnIds, 'column'),
        curtainWalls: this._curtainWallsForRoom(room),
      },
      hosted: {
        doors:    this._hostedOpenings(this._doorStore(),    wallIds, 'door'),
        windows:  this._hostedOpenings(this._windowStore(),  wallIds, 'window'),
        openings: this._hostedOnHostId(this._openingStore(), wallIds, 'opening'),
      },
      contained: {
        furniture:   this._containedByCentroid(this._furnitureStore(), levelId, polygon, 'furniture'),
        columns:     this._containedFreeStandingColumns(room, columnIds),
        plumbing:    this._containedByCentroid(this._plumbingStore(), levelId, polygon, 'plumbing'),
        lighting:    this._containedByCentroid(this._lightingStore(), levelId, polygon, 'lighting'),
        beams:       this._containedByMidSpan(this._beamStore(),     levelId, polygon, 'beam'),
        handrails:   this._containedByCentroid(this._handrailStore(), levelId, polygon, 'handrail'),
        stairs:      this._containedByCentroid(this._stairStore(),    levelId, polygon, 'stair'),
        annotations: this._containedByCentroid(this._annotationStore(), levelId, polygon, 'annotation'),
      },
      vertical: this._verticalNeighbours(room, bbox),
      totals: { bounding: 0, hosted: 0, contained: 0, vertical: 0, total: 0, exact: true },
    };

    contents.totals.bounding  = sumLen(contents.bounding);
    contents.totals.hosted    = sumLen(contents.hosted);
    contents.totals.contained = sumLen(contents.contained);
    contents.totals.vertical  = sumLen(contents.vertical);
    contents.totals.total     = contents.totals.bounding + contents.totals.hosted +
                                contents.totals.contained + contents.totals.vertical;

    // The counts above are a FLOOR, not a census, whenever anything went
    // unanswered. `undetermined` stays ABSENT when nothing did — an empty array
    // would be the same ambiguity in a new costume.
    contents.totals.exact = undetermined.length === 0;
    if (undetermined.length > 0) contents.undetermined = undetermined;

    return contents;
  }

  /**
   * Which room(s) is this element in?
   *
   * §GR-10/GR-14 — the result carries an OPTIONAL `undetermined`. Read it:
   * `{ rooms: [], relationship: 'none' }` alone has always been ambiguous, and
   * `undetermined` is the field that resolves it. It now covers BOTH ways this
   * answer can fail to be authoritative:
   *
   *   · `undetermined` ABSENT  → every room was read AND examined, and this
   *                              element genuinely belongs to the rooms listed
   *                              (an empty list means no room). A real answer.
   *   · `RELATIONSHIP_NOT_READABLE` → the room store could not be read at all.
   *                              The empty `rooms` says NOTHING about the
   *                              building and must not be rendered as "no room".
   *   · `RELATIONSHIP_NOT_RECORDED` → the store was read, but one or more rooms
   *                              carry NO recorded bounding-id list for this
   *                              element type. Those rooms could be neither
   *                              confirmed nor denied, so `rooms` is a SUBSET,
   *                              not a census — including when it is empty, and
   *                              including when it is non-empty.
   *
   * That third case is the one this service used to deny outright: an unrecorded
   * room failed `.includes()` exactly like a room that had been examined and
   * ruled out, and the caller was told "belongs to no room" either way.
   *
   * The field is optional and additive, so every existing caller keeps compiling
   * and keeps its current behaviour — but a caller that wants the truth can now
   * obtain it, which it could not before at any price.
   */
  getRoomForElement(
    elementId: string,
    elementType?: string,
    levelIdHint?: string,
  ): {
    rooms: RoomData[];
    primaryRoomId: string | null;
    relationship: 'bounding' | 'hosted' | 'contained' | 'none';
    /** Present ONLY when the answer could not be fully determined. Never `[]`-shaped. */
    undetermined?: RoomContentsUndetermined;
  } {
    const empty = { rooms: [] as RoomData[], primaryRoomId: null, relationship: 'none' as const };
    if (!elementId) return empty;

    // Taken ONCE, before any branch: every branch below funnels into the same
    // `empty`, so classifying at the end would have to guess which branch ran.
    const determination = this.roomsDetermination();
    const unreadable = determination.kind === 'undetermined'
      ? { ...empty, undetermined: determination }
      : null;
    if (unreadable) return unreadable;

    const t = (elementType || '').toLowerCase().trim();

    // Rooms that carried NO recorded bounding list for this element type. They
    // were not scanned — they were UNSCANNABLE — and they are named rather than
    // silently counted as a "no" (C78 §1.4).
    const unexamined: string[] = [];
    /** Attach the doubt, if any, to whatever answer was reached. */
    const withDoubt = <R extends { rooms: RoomData[] }>(answer: R): R => {
      const doubt = boundingDoubt(unexamined);
      return doubt === null ? answer : { ...answer, undetermined: doubt };
    };

    if (t === 'wall' || t === 'slab' || t === 'column' || t === 'curtainwall' || t === 'curtain-wall') {
      const field = BOUNDING_FIELD_FOR_TYPE[t]!;
      const allRooms = this._allRooms();
      const matches: RoomData[] = [];
      for (const r of allRooms) {
        const ids = boundingIdsOrUnknown(r as unknown as Readonly<Record<string, unknown>>, field);
        if (ids === null) { unexamined.push(r.id); continue; }
        if (ids.includes(elementId)) matches.push(r);
      }
      if (matches.length > 0) {
        return withDoubt({ rooms: matches, primaryRoomId: matches[0].id, relationship: 'bounding' as const });
      }
    }

    if (t === 'door' || t === 'window' || t === 'opening') {
      const hostWallId = this._resolveHostWallId(elementId, t);
      if (hostWallId) {
        const allRooms = this._allRooms();
        const matches: RoomData[] = [];
        for (const r of allRooms) {
          const ids = boundingIdsOrUnknown(r, 'boundingWallIds');
          if (ids === null) { unexamined.push(r.id); continue; }
          if (ids.includes(hostWallId)) matches.push(r);
        }
        if (matches.length > 0) {
          return withDoubt({ rooms: matches, primaryRoomId: matches[0].id, relationship: 'hosted' as const });
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
        return withDoubt({ rooms: matches, primaryRoomId: matches[0].id, relationship: 'contained' as const });
      }
    }

    // THE SITE THIS WHOLE CHANGE EXISTS FOR. Reaching here used to mean, flatly,
    // "this element belongs to no room" — whether every room had been examined
    // and ruled out, or some had never recorded the relationship at all.
    return withDoubt(empty);
  }

  /**
   * §GR-10/GR-14 — the DETERMINED room-store read. See
   * `roomStoreDetermination.ts` for why this exists: the previous body of
   * `_allRooms()` returned `[]` for three distinguishable cases (no rooms /
   * store has no `getAll` / `getAll` threw) and `getRoomForElement` rendered all
   * three as *"this element belongs to no room"*.
   *
   * Public because the distinction is worthless if only this class can see it —
   * an unreadable store is a fact a caller may need to surface.
   */
  roomsDetermination(): RoomStoreDetermination {
    return readRoomsDetermined(this.deps.roomStore, 'RoomContentsService.roomStore.getAll');
  }

  /**
   * The rooms, or `[]`.
   *
   * ⚠ RETAINED DELIBERATELY, and it is NOT the defect. The internal callers
   * below iterate and filter; for them "no rooms" and "unreadable" genuinely
   * lead to the same loop body. The defect was that the distinction was
   * DESTROYED here and therefore unavailable to anyone. It is now preserved in
   * {@link roomsDetermination} and reported by `getRoomForElement`, and this
   * accessor is a narrowing of that value rather than a second, rival read.
   */
  private _allRooms(): RoomData[] {
    const d = this.roomsDetermination();
    return d.kind === 'determined' ? (d.rooms as RoomData[]) : [];
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

  /**
   * `ids === null` means the id list was NEVER RECORDED, not "zero ids". The
   * bucket is still `[]` — there is nothing to look up — but the caller is told
   * why through `RoomContents.undetermined`, which is the distinction that was
   * destroyed here before (compare `_allRooms()` below: same reasoning).
   */
  private _refsByIds(store: MinReadable | undefined, ids: readonly string[] | null, type: string): ElementRef[] {
    if (!store || ids === null || ids.length === 0) return [];
    const set = new Set(ids);
    const all = this._safe(() => store.getAll()) ?? [];
    return all.filter((e: any) => e?.id && set.has(e.id)).map((e: any) => toRef(e, type));
  }

  /**
   * @param declaredSlabIds `null` = the declared list was never recorded. Slabs
   * are ALSO found by geometric overlap below, so this degrades to overlap-only
   * rather than claiming zero — and `RoomContents.undetermined` carries the fact
   * that the declared half of the answer was unavailable.
   */
  private _slabsForRoom(room: RoomData, declaredSlabIds: readonly string[] | null): ElementRef[] {
    const slabStore = this._slabStore();
    if (!slabStore) return [];
    const declared = new Set<string>(declaredSlabIds === null ? [] : declaredSlabIds);
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

  /** @param boundingWallIds `null` = never recorded — see {@link _refsByIds}. */
  private _hostedOpenings(store: MinReadable | undefined, boundingWallIds: readonly string[] | null, type: string): ElementRef[] {
    if (!store || boundingWallIds === null || boundingWallIds.length === 0) return [];
    const wallSet = new Set(boundingWallIds);
    const all = this._safe(() => store.getAll()) ?? [];
    return all
      .filter((o: any) => o?.id && o.wallId && wallSet.has(o.wallId))
      .map((o: any) => toRef(o, type));
  }

  /** @param boundingWallIds `null` = never recorded — see {@link _refsByIds}. */
  private _hostedOnHostId(store: MinReadable | undefined, boundingWallIds: readonly string[] | null, type: string): ElementRef[] {
    if (!store || boundingWallIds === null || boundingWallIds.length === 0) return [];
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

  /**
   * @param declaredColumnIds `null` = the declared BOUNDING column list was never
   * recorded. `declared` is used here as an EXCLUSION set — free-standing means
   * "geometrically inside AND not declared bounding" — so an unknown set makes
   * this bucket OVER-inclusive: bounding columns are reported as free-standing
   * because nothing said they were bounding. That is the honest degradation
   * (an over-report a caller is warned about beats a silent under-report), and
   * `RoomContents.undetermined` is what does the warning.
   */
  private _containedFreeStandingColumns(room: RoomData, declaredColumnIds: readonly string[] | null): ElementRef[] {
    const columnStore = this._columnStore();
    if (!columnStore) return [];
    const polygon = room.boundary?.polygon ?? [];
    if (polygon.length < 3) return [];
    const declared = new Set<string>(declaredColumnIds === null ? [] : declaredColumnIds);
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

/**
 * The doubt an unexamined-room set casts over a `getRoomForElement` answer, or
 * `null` when there is none.
 *
 * `null` — not an empty record — is the "no doubt" value ON PURPOSE: an
 * always-present `undetermined` whose emptiness meant "fine" would rebuild the
 * exact ambiguity this module removes, one level up.
 */
export function boundingDoubt(unexaminedRoomIds: readonly string[]): RoomContentsUndetermined | null {
  if (unexaminedRoomIds.length === 0) return null;
  const shown = unexaminedRoomIds.slice(0, 8).join(', ');
  const more = unexaminedRoomIds.length > 8 ? `, +${unexaminedRoomIds.length - 8} more` : '';
  return {
    kind: 'undetermined',
    reason: 'RELATIONSHIP_NOT_RECORDED',
    scope: `bounding relationship of ${unexaminedRoomIds.length} room(s)`,
    detail:
      `${unexaminedRoomIds.length} room(s) carry no recorded bounding-id list for this element ` +
      `type (${shown}${more}), so they could be neither confirmed nor denied. The \`rooms\` list ` +
      `is a SUBSET, not a census — an empty one is NOT a statement that this element belongs to ` +
      `no room (C71 §4.4, C78 §1.4).`,
  };
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
