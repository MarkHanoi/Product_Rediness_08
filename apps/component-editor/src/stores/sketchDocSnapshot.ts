// sketchDocSnapshot — the snapshot SHAPE and the pure functions that build it.
//
// Split out of `sketchDocStore.ts` under the §13 `family-editor-300-loc-cap`
// gate when the `spline` kind landed: the store was at 298/300 lines and a
// fifth entity kind does not fit. The split is along the seam the gate is
// designed to expose — the store owns MUTATION and id counters, this module
// owns the immutable projection and the cascade rule, and every function here
// is pure so the cascade can be tested without a store at all.
//
// Pure: no THREE, no DOM, no rAF, no `(window as any)`.

import type {
  EntityId,
  SketchArc,
  SketchCircle,
  SketchEntity,
  SketchLine,
  SketchPoint,
  SketchSpline,
} from '../sketch/entities.js';

export interface SketchDocSnapshot {
  readonly entities: readonly SketchEntity[];
  readonly pointById: Readonly<Record<EntityId, SketchPoint>>;
  readonly lineById: Readonly<Record<EntityId, SketchLine>>;
  readonly circleById: Readonly<Record<EntityId, SketchCircle>>;
  readonly arcById: Readonly<Record<EntityId, SketchArc>>;
  readonly splineById: Readonly<Record<EntityId, SketchSpline>>;
  /** Monotonic counter — every mutation increments it. */
  readonly version: number;
}

/** The mutable-by-copy working set the store rebuilds a snapshot from. */
export interface EntityCollection {
  readonly points: ReadonlyArray<SketchPoint>;
  readonly lines: ReadonlyArray<SketchLine>;
  readonly circles: ReadonlyArray<SketchCircle>;
  readonly arcs: ReadonlyArray<SketchArc>;
  readonly splines: ReadonlyArray<SketchSpline>;
}

export const EMPTY_SNAPSHOT: SketchDocSnapshot = Object.freeze({
  entities: Object.freeze([]) as readonly SketchEntity[],
  pointById: Object.freeze({}) as Readonly<Record<EntityId, SketchPoint>>,
  lineById: Object.freeze({}) as Readonly<Record<EntityId, SketchLine>>,
  circleById: Object.freeze({}) as Readonly<Record<EntityId, SketchCircle>>,
  arcById: Object.freeze({}) as Readonly<Record<EntityId, SketchArc>>,
  splineById: Object.freeze({}) as Readonly<Record<EntityId, SketchSpline>>,
  version: 0,
});

/** Project a working set into a frozen snapshot at `version`. Entity order is
 *  points → lines → circles → arcs → splines, which is the order every prior
 *  snapshot used; splines append so no existing document's order changes. */
export function buildSnapshot(input: EntityCollection, version: number): SketchDocSnapshot {
  const pointById: Record<EntityId, SketchPoint> = {};
  const lineById: Record<EntityId, SketchLine> = {};
  const circleById: Record<EntityId, SketchCircle> = {};
  const arcById: Record<EntityId, SketchArc> = {};
  const splineById: Record<EntityId, SketchSpline> = {};
  const entities: SketchEntity[] = [];
  for (const p of input.points) { pointById[p.id] = p; entities.push(p); }
  for (const l of input.lines) { lineById[l.id] = l; entities.push(l); }
  for (const c of input.circles) { circleById[c.id] = c; entities.push(c); }
  for (const a of input.arcs) { arcById[a.id] = a; entities.push(a); }
  for (const s of input.splines) { splineById[s.id] = s; entities.push(s); }
  return Object.freeze({
    entities: Object.freeze(entities),
    pointById: Object.freeze(pointById),
    lineById: Object.freeze(lineById),
    circleById: Object.freeze(circleById),
    arcById: Object.freeze(arcById),
    splineById: Object.freeze(splineById),
    version,
  });
}

/** Read a snapshot back out as a working set. */
export function collectionOf(snap: SketchDocSnapshot): EntityCollection {
  return {
    points: Object.values(snap.pointById),
    lines: Object.values(snap.lineById),
    circles: Object.values(snap.circleById),
    arcs: Object.values(snap.arcById),
    splines: Object.values(snap.splineById),
  };
}

/**
 * CASCADING DELETE — remove `id`, and every entity that REFERENCES it.
 *
 * ⭐ A spline is dropped when ANY of its control points is, and that is not a
 *    convenience: a cubic Bézier chain needs exactly `3k+1` control points, so
 *    a chain missing one is not a shorter curve, it is not a curve. Keeping it
 *    would leave an entity the profile evaluator must refuse — the "persist
 *    something nothing can evaluate" shape C74 §4.6.3 forbids, one layer down.
 */
export function withoutEntity(input: EntityCollection, id: EntityId): EntityCollection {
  return {
    points: input.points.filter((p) => p.id !== id),
    lines: input.lines.filter((l) => l.id !== id && l.p1 !== id && l.p2 !== id),
    circles: input.circles.filter((c) => c.id !== id && c.center !== id),
    arcs: input.arcs.filter((a) => a.id !== id && a.center !== id),
    splines: input.splines.filter((s) => s.id !== id && !s.controlPoints.includes(id)),
  };
}
