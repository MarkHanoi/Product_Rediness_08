// sketchDocStore — the active sketch document (S52 D1).
//
// Holds the entity collection (points + lines), generates fresh ids,
// exposes frozen snapshots, and notifies subscribers on every
// mutation.  Pure: no THREE, no DOM, no rAF, no `(window as any)`
// (rules P2/P3/P6 enforced by a source-text test).
//
// Action surface (S52 D1):
//   • addPoint(x, z)                     → new point id
//   • addLineByPoints(p1, p2)            → new line id (reuses existing points)
//   • addLineByCoords(x1, z1, x2, z2)    → new line id (creates two points)
//   • removeEntity(id)                   → cascades: removing a point
//                                          also removes any lines that
//                                          reference it
//   • clear()                            → wipes everything, version bump
//
// The constraint-solver wiring (S52 D2/D3) reads `entities` and emits
// a `ConstraintSet` whose variables follow the
// `${pointId}-x` / `${pointId}-y` convention the solver defaults to.

import {
  makeEntityId,
  type EntityId,
  type SketchArc,
  type SketchCircle,
  type SketchEntity,
  type SketchLine,
  type SketchPoint,
} from '../sketch/entities.js';

export interface SketchDocSnapshot {
  readonly entities: readonly SketchEntity[];
  readonly pointById: Readonly<Record<EntityId, SketchPoint>>;
  readonly lineById: Readonly<Record<EntityId, SketchLine>>;
  readonly circleById: Readonly<Record<EntityId, SketchCircle>>;
  readonly arcById: Readonly<Record<EntityId, SketchArc>>;
  /** Monotonic counter — every mutation increments it. */
  readonly version: number;
}

export type SketchDocSubscriber = (snap: SketchDocSnapshot) => void;

export interface SketchDocStore {
  get(): SketchDocSnapshot;
  subscribe(fn: SketchDocSubscriber): () => void;
  addPoint(x: number, z: number): EntityId;
  addLineByPoints(p1: EntityId, p2: EntityId): EntityId;
  addLineByCoords(x1: number, z1: number, x2: number, z2: number): EntityId;
  /** Add a circle whose centre is an existing point. Throws on unknown id or non-positive radius. */
  addCircle(centerId: EntityId, radius: number): EntityId;
  /** Add a circle from raw centre coords (creates the centre point implicitly). */
  addCircleByCoords(cx: number, cz: number, radius: number): EntityId;
  /** Add an arc with explicit centre id, radius, and angles (radians, CCW). */
  addArc(centerId: EntityId, radius: number, startAngle: number, endAngle: number): EntityId;
  removeEntity(id: EntityId): void;
  clear(): void;
  /**
   * Apply a batch of point coordinate updates atomically (one
   * snapshot, one notification). Used by the solver runner to write
   * solved values back into the document. Unknown ids are ignored.
   */
  movePoints(updates: ReadonlyArray<{ pointId: EntityId | string; x: number; z: number }>): void;
}

const EMPTY_SNAPSHOT: SketchDocSnapshot = Object.freeze({
  entities: Object.freeze([]) as readonly SketchEntity[],
  pointById: Object.freeze({}) as Readonly<Record<EntityId, SketchPoint>>,
  lineById: Object.freeze({}) as Readonly<Record<EntityId, SketchLine>>,
  circleById: Object.freeze({}) as Readonly<Record<EntityId, SketchCircle>>,
  arcById: Object.freeze({}) as Readonly<Record<EntityId, SketchArc>>,
  version: 0,
});

interface RebuildInput {
  readonly points: ReadonlyArray<SketchPoint>;
  readonly lines: ReadonlyArray<SketchLine>;
  readonly circles: ReadonlyArray<SketchCircle>;
  readonly arcs: ReadonlyArray<SketchArc>;
}

export function createSketchDocStore(): SketchDocStore {
  let snap: SketchDocSnapshot = EMPTY_SNAPSHOT;
  const subscribers = new Set<SketchDocSubscriber>();
  let pointCounter = 0;
  let lineCounter = 0;
  let circleCounter = 0;
  let arcCounter = 0;

  function notify(): void {
    for (const fn of subscribers) fn(snap);
  }

  function rebuildSnapshot(input: RebuildInput): void {
    const pointById: Record<EntityId, SketchPoint> = {};
    const lineById: Record<EntityId, SketchLine> = {};
    const circleById: Record<EntityId, SketchCircle> = {};
    const arcById: Record<EntityId, SketchArc> = {};
    const entities: SketchEntity[] = [];
    for (const p of input.points) {
      pointById[p.id] = p;
      entities.push(p);
    }
    for (const l of input.lines) {
      lineById[l.id] = l;
      entities.push(l);
    }
    for (const c of input.circles) {
      circleById[c.id] = c;
      entities.push(c);
    }
    for (const a of input.arcs) {
      arcById[a.id] = a;
      entities.push(a);
    }
    snap = Object.freeze({
      entities: Object.freeze(entities),
      pointById: Object.freeze(pointById),
      lineById: Object.freeze(lineById),
      circleById: Object.freeze(circleById),
      arcById: Object.freeze(arcById),
      version: snap.version + 1,
    });
  }

  function currentPoints(): SketchPoint[] {
    return Object.values(snap.pointById);
  }
  function currentLines(): SketchLine[] {
    return Object.values(snap.lineById);
  }
  function currentCircles(): SketchCircle[] {
    return Object.values(snap.circleById);
  }
  function currentArcs(): SketchArc[] {
    return Object.values(snap.arcById);
  }
  function rebuildAll(
    overrides: Partial<RebuildInput>,
  ): void {
    rebuildSnapshot({
      points: overrides.points ?? currentPoints(),
      lines: overrides.lines ?? currentLines(),
      circles: overrides.circles ?? currentCircles(),
      arcs: overrides.arcs ?? currentArcs(),
    });
  }

  return {
    get() {
      return snap;
    },
    subscribe(fn) {
      subscribers.add(fn);
      return () => {
        subscribers.delete(fn);
      };
    },
    addPoint(x, z) {
      if (!Number.isFinite(x) || !Number.isFinite(z)) {
        throw new Error(`sketchDocStore.addPoint: non-finite coords (x=${x}, z=${z}).`);
      }
      const id = makeEntityId('pt', pointCounter++);
      const point: SketchPoint = Object.freeze({ id, kind: 'point', x, z });
      rebuildAll({ points: [...currentPoints(), point] });
      notify();
      return id;
    },
    addLineByPoints(p1, p2) {
      if (!snap.pointById[p1] || !snap.pointById[p2]) {
        throw new Error(`sketchDocStore.addLineByPoints: unknown point id(s) "${p1}" / "${p2}".`);
      }
      if (p1 === p2) {
        throw new Error('sketchDocStore.addLineByPoints: line endpoints must differ.');
      }
      const id = makeEntityId('ln', lineCounter++);
      const line: SketchLine = Object.freeze({ id, kind: 'line', p1, p2 });
      rebuildAll({ lines: [...currentLines(), line] });
      notify();
      return id;
    },
    addLineByCoords(x1, z1, x2, z2) {
      const id1 = makeEntityId('pt', pointCounter++);
      const id2 = makeEntityId('pt', pointCounter++);
      const p1: SketchPoint = Object.freeze({ id: id1, kind: 'point', x: x1, z: z1 });
      const p2: SketchPoint = Object.freeze({ id: id2, kind: 'point', x: x2, z: z2 });
      const lineId = makeEntityId('ln', lineCounter++);
      const line: SketchLine = Object.freeze({ id: lineId, kind: 'line', p1: id1, p2: id2 });
      rebuildAll({
        points: [...currentPoints(), p1, p2],
        lines: [...currentLines(), line],
      });
      notify();
      return lineId;
    },
    addCircle(centerId, radius) {
      if (!snap.pointById[centerId]) {
        throw new Error(`sketchDocStore.addCircle: unknown centre point "${centerId}".`);
      }
      if (!Number.isFinite(radius) || radius <= 0) {
        throw new Error(`sketchDocStore.addCircle: radius must be > 0 (got ${radius}).`);
      }
      const id = makeEntityId('cir', circleCounter++);
      const circle: SketchCircle = Object.freeze({ id, kind: 'circle', center: centerId, radius });
      rebuildAll({ circles: [...currentCircles(), circle] });
      notify();
      return id;
    },
    addCircleByCoords(cx, cz, radius) {
      if (!Number.isFinite(cx) || !Number.isFinite(cz)) {
        throw new Error(`sketchDocStore.addCircleByCoords: non-finite centre (cx=${cx}, cz=${cz}).`);
      }
      if (!Number.isFinite(radius) || radius <= 0) {
        throw new Error(`sketchDocStore.addCircleByCoords: radius must be > 0 (got ${radius}).`);
      }
      const ptId = makeEntityId('pt', pointCounter++);
      const point: SketchPoint = Object.freeze({ id: ptId, kind: 'point', x: cx, z: cz });
      const circleId = makeEntityId('cir', circleCounter++);
      const circle: SketchCircle = Object.freeze({
        id: circleId, kind: 'circle', center: ptId, radius,
      });
      rebuildAll({
        points: [...currentPoints(), point],
        circles: [...currentCircles(), circle],
      });
      notify();
      return circleId;
    },
    addArc(centerId, radius, startAngle, endAngle) {
      if (!snap.pointById[centerId]) {
        throw new Error(`sketchDocStore.addArc: unknown centre point "${centerId}".`);
      }
      if (!Number.isFinite(radius) || radius <= 0) {
        throw new Error(`sketchDocStore.addArc: radius must be > 0 (got ${radius}).`);
      }
      if (!Number.isFinite(startAngle) || !Number.isFinite(endAngle)) {
        throw new Error('sketchDocStore.addArc: angles must be finite.');
      }
      const id = makeEntityId('arc', arcCounter++);
      const arc: SketchArc = Object.freeze({
        id, kind: 'arc', center: centerId, radius, startAngle, endAngle,
      });
      rebuildAll({ arcs: [...currentArcs(), arc] });
      notify();
      return id;
    },
    removeEntity(id) {
      if (
        !snap.pointById[id] &&
        !snap.lineById[id] &&
        !snap.circleById[id] &&
        !snap.arcById[id]
      ) return;
      const remainingPoints = currentPoints().filter((p) => p.id !== id);
      // Cascading delete: drop lines, circles, arcs referencing the removed point too.
      const remainingLines = currentLines().filter(
        (l) => l.id !== id && l.p1 !== id && l.p2 !== id,
      );
      const remainingCircles = currentCircles().filter(
        (c) => c.id !== id && c.center !== id,
      );
      const remainingArcs = currentArcs().filter(
        (a) => a.id !== id && a.center !== id,
      );
      rebuildSnapshot({
        points: remainingPoints,
        lines: remainingLines,
        circles: remainingCircles,
        arcs: remainingArcs,
      });
      notify();
    },
    clear() {
      if (snap.entities.length === 0) return;
      snap = Object.freeze({ ...EMPTY_SNAPSHOT, version: snap.version + 1 });
      notify();
    },
    movePoints(updates) {
      if (updates.length === 0) return;
      const byId: Record<string, { x: number; z: number }> = {};
      let touched = 0;
      for (const u of updates) {
        if (!Number.isFinite(u.x) || !Number.isFinite(u.z)) continue;
        if (!snap.pointById[u.pointId as EntityId]) continue;
        byId[u.pointId as string] = { x: u.x, z: u.z };
        touched++;
      }
      if (touched === 0) return;
      const nextPoints: SketchPoint[] = currentPoints().map((p) => {
        const upd = byId[p.id as string];
        if (!upd) return p;
        if (Math.abs(upd.x - p.x) < 1e-9 && Math.abs(upd.z - p.z) < 1e-9) return p;
        return Object.freeze({ id: p.id, kind: 'point', x: upd.x, z: upd.z });
      });
      rebuildAll({ points: nextPoints });
      notify();
    },
  };
}
