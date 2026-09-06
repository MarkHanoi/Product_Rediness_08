// sketchDocStore — the active sketch document (S52 D1).
//
// Holds the entity collection, generates fresh ids, exposes frozen snapshots,
// and notifies subscribers on every mutation.  Pure: no THREE, no DOM, no rAF,
// no `(window as any)` (rules P2/P3/P6 enforced by a source-text test).
//
// The snapshot SHAPE, the projection and the cascading-delete rule live in
// `sketchDocSnapshot.ts` — split out under the §13 300-LoC cap when the
// `spline` kind landed.  This file owns MUTATION and the id counters.
//
// Action surface:
//   • addPoint / addLineByPoints / addLineByCoords
//   • addCircle / addCircleByCoords / addArc
//   • addSpline(controlPointIds)        — a cubic Bezier CHAIN, 3k+1 handles
//   • addSplineThroughPoints(pts)       — the authoring path: the points the
//                                         curve must PASS THROUGH, converted
//                                         to the one persisted form
//   • removeEntity(id)                  → cascades (see `withoutEntity`)
//   • movePoints(updates)               → the solver's write-back sink
//   • clear()
//
// The constraint-solver wiring (S52 D2/D3) reads `entities` and emits a
// `ConstraintSet` whose variables follow the `${pointId}-x` / `${pointId}-y`
// convention the solver defaults to — spline control points are ordinary
// `SketchPoint`s and are therefore inside that variable space automatically.

import {
  catmullRomToCubicBezierChainXZ,
  isCubicBezierChainLength,
  type Pt2,
} from '@pryzm/geometry-kernel';
import {
  makeEntityId,
  type EntityId,
  type SketchArc,
  type SketchCircle,
  type SketchLine,
  type SketchPoint,
  type SketchSpline,
} from '../sketch/entities.js';
import {
  buildSnapshot,
  collectionOf,
  EMPTY_SNAPSHOT,
  withoutEntity,
  type EntityCollection,
  type SketchDocSnapshot,
} from './sketchDocSnapshot.js';

export type { SketchDocSnapshot } from './sketchDocSnapshot.js';

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
  /**
   * Add a cubic Bezier chain over EXISTING points. `controlPointIds` must be
   * `3k+1` ids of known `SketchPoint`s — a chain of any other length is not a
   * shorter curve, it is not a curve, so this REFUSES rather than trimming.
   */
  addSpline(controlPointIds: readonly EntityId[]): EntityId;
  /**
   * The authoring path: the points the curve must PASS THROUGH (mm). Creates
   * every control point the chain needs and returns the spline id.
   *
   * ⛔ The Catmull-Rom conversion is `@pryzm/geometry-kernel`'s — this store
   *    computes no curve of its own. Nothing downstream ever sees a
   *    Catmull-Rom: what is stored is the ONE persisted form (C111 §9.6).
   */
  addSplineThroughPoints(through: ReadonlyArray<{ x: number; z: number }>): EntityId;
  removeEntity(id: EntityId): void;
  clear(): void;
  /**
   * Apply a batch of point coordinate updates atomically (one snapshot, one
   * notification). Used by the solver runner to write solved values back into
   * the document. Unknown ids are ignored.
   */
  movePoints(updates: ReadonlyArray<{ pointId: EntityId | string; x: number; z: number }>): void;
}

export function createSketchDocStore(): SketchDocStore {
  let snap: SketchDocSnapshot = EMPTY_SNAPSHOT;
  const subscribers = new Set<SketchDocSubscriber>();
  const counters = { pt: 0, ln: 0, cir: 0, arc: 0, spl: 0 };

  function notify(): void {
    for (const fn of subscribers) fn(snap);
  }

  /** Commit a working set as the next snapshot and notify. */
  function commit(next: EntityCollection): void {
    snap = buildSnapshot(next, snap.version + 1);
    notify();
  }

  function withOverrides(overrides: Partial<EntityCollection>): EntityCollection {
    return { ...collectionOf(snap), ...overrides };
  }

  function newPoint(x: number, z: number): SketchPoint {
    return Object.freeze({ id: makeEntityId('pt', counters.pt++), kind: 'point', x, z });
  }

  function requireFinite(where: string, ...values: number[]): void {
    for (const v of values) {
      if (!Number.isFinite(v)) {
        throw new Error(`sketchDocStore.${where}: non-finite value (${v}).`);
      }
    }
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
      requireFinite('addPoint', x, z);
      const point = newPoint(x, z);
      commit(withOverrides({ points: [...collectionOf(snap).points, point] }));
      return point.id;
    },
    addLineByPoints(p1, p2) {
      if (!snap.pointById[p1] || !snap.pointById[p2]) {
        throw new Error(`sketchDocStore.addLineByPoints: unknown point id(s) "${p1}" / "${p2}".`);
      }
      if (p1 === p2) {
        throw new Error('sketchDocStore.addLineByPoints: line endpoints must differ.');
      }
      const id = makeEntityId('ln', counters.ln++);
      const line: SketchLine = Object.freeze({ id, kind: 'line', p1, p2 });
      commit(withOverrides({ lines: [...collectionOf(snap).lines, line] }));
      return id;
    },
    addLineByCoords(x1, z1, x2, z2) {
      requireFinite('addLineByCoords', x1, z1, x2, z2);
      const p1 = newPoint(x1, z1);
      const p2 = newPoint(x2, z2);
      const id = makeEntityId('ln', counters.ln++);
      const line: SketchLine = Object.freeze({ id, kind: 'line', p1: p1.id, p2: p2.id });
      const cur = collectionOf(snap);
      commit(withOverrides({ points: [...cur.points, p1, p2], lines: [...cur.lines, line] }));
      return id;
    },
    addCircle(centerId, radius) {
      if (!snap.pointById[centerId]) {
        throw new Error(`sketchDocStore.addCircle: unknown centre point "${centerId}".`);
      }
      if (!Number.isFinite(radius) || radius <= 0) {
        throw new Error(`sketchDocStore.addCircle: radius must be > 0 (got ${radius}).`);
      }
      const id = makeEntityId('cir', counters.cir++);
      const circle: SketchCircle = Object.freeze({ id, kind: 'circle', center: centerId, radius });
      commit(withOverrides({ circles: [...collectionOf(snap).circles, circle] }));
      return id;
    },
    addCircleByCoords(cx, cz, radius) {
      requireFinite('addCircleByCoords', cx, cz);
      if (!Number.isFinite(radius) || radius <= 0) {
        throw new Error(`sketchDocStore.addCircleByCoords: radius must be > 0 (got ${radius}).`);
      }
      const centre = newPoint(cx, cz);
      const id = makeEntityId('cir', counters.cir++);
      const circle: SketchCircle = Object.freeze({ id, kind: 'circle', center: centre.id, radius });
      const cur = collectionOf(snap);
      commit(withOverrides({ points: [...cur.points, centre], circles: [...cur.circles, circle] }));
      return id;
    },
    addArc(centerId, radius, startAngle, endAngle) {
      if (!snap.pointById[centerId]) {
        throw new Error(`sketchDocStore.addArc: unknown centre point "${centerId}".`);
      }
      if (!Number.isFinite(radius) || radius <= 0) {
        throw new Error(`sketchDocStore.addArc: radius must be > 0 (got ${radius}).`);
      }
      requireFinite('addArc', startAngle, endAngle);
      const id = makeEntityId('arc', counters.arc++);
      const arc: SketchArc = Object.freeze({
        id, kind: 'arc', center: centerId, radius, startAngle, endAngle,
      });
      commit(withOverrides({ arcs: [...collectionOf(snap).arcs, arc] }));
      return id;
    },
    addSpline(controlPointIds) {
      if (!isCubicBezierChainLength(controlPointIds.length)) {
        throw new Error(
          `sketchDocStore.addSpline: a cubic Bezier chain needs 3k+1 control points (4, 7, 10, …); got ${controlPointIds.length}.`,
        );
      }
      for (const id of controlPointIds) {
        if (!snap.pointById[id]) {
          throw new Error(`sketchDocStore.addSpline: unknown control point "${id}".`);
        }
      }
      const id = makeEntityId('spl', counters.spl++);
      const spline: SketchSpline = Object.freeze({
        id, kind: 'spline', degree: 3, controlPoints: Object.freeze([...controlPointIds]),
      });
      commit(withOverrides({ splines: [...collectionOf(snap).splines, spline] }));
      return id;
    },
    addSplineThroughPoints(through) {
      if (through.length < 2) {
        throw new Error(
          `sketchDocStore.addSplineThroughPoints: need at least 2 through-points; got ${through.length}.`,
        );
      }
      for (const p of through) requireFinite('addSplineThroughPoints', p.x, p.z);
      const chain: Pt2[] = catmullRomToCubicBezierChainXZ(
        through.map((p): Pt2 => [p.x, p.z]),
      );
      const created = chain.map((c) => newPoint(c[0], c[1]));
      const id = makeEntityId('spl', counters.spl++);
      const spline: SketchSpline = Object.freeze({
        id, kind: 'spline', degree: 3,
        controlPoints: Object.freeze(created.map((p) => p.id)),
      });
      const cur = collectionOf(snap);
      commit(withOverrides({
        points: [...cur.points, ...created],
        splines: [...cur.splines, spline],
      }));
      return id;
    },
    removeEntity(id) {
      if (
        !snap.pointById[id] && !snap.lineById[id] && !snap.circleById[id] &&
        !snap.arcById[id] && !snap.splineById[id]
      ) return;
      commit(withoutEntity(collectionOf(snap), id));
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
      const nextPoints: SketchPoint[] = collectionOf(snap).points.map((p) => {
        const upd = byId[p.id as string];
        if (!upd) return p;
        if (Math.abs(upd.x - p.x) < 1e-9 && Math.abs(upd.z - p.z) < 1e-9) return p;
        return Object.freeze({ id: p.id, kind: 'point', x: upd.x, z: upd.z });
      });
      commit(withOverrides({ points: nextPoints }));
    },
  };
}
