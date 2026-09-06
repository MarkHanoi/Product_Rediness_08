// dimensionStore — the dimensions the author has PLACED, indexed by the work
// plane they annotate (lane CE-VIEWS-AND-MEASURE).
//
// A dimension belongs to exactly one view: a height dimensioned on the front
// elevation is not a thing the plan can show. `byView` is therefore part of
// the snapshot rather than a filter callers each re-derive — a derived filter
// is where "the plan renders the elevation's dimensions" bugs come from.
//
// P6 — NOTHING OUTSIDE `commands/dimension/` MAY CALL THE MUTATORS. The UI
// dispatches `dimension.place` / `dimension.remove` / `dimension.setValue`
// through the command bus, which is what puts them on the undo stack and
// emits their OTel spans. `__tests__/app/secondCompositionRoot.invariants.test.ts`
// clause 4 asserts every store the runtime exposes has a command family that
// owns its mutations; this store is registered there under `dimension.`.
//
// LAYER — L1-equivalent: pure store. No THREE, no DOM, no rAF, no
// `(window as any)`.

import type { DimensionId, LinearDimension } from '../measure/dimension.js';
import { SKETCH_VIEW_KINDS, type SketchViewKind } from '../views/viewProjection.js';

export interface DimensionSnapshot {
  readonly dimensions: readonly LinearDimension[];
  readonly byId: Readonly<Record<string, LinearDimension>>;
  /** Dimensions grouped by the view they annotate. Every view kind is a key,
   *  so a consumer never has to test for `undefined`. */
  readonly byView: Readonly<Record<SketchViewKind, readonly LinearDimension[]>>;
  readonly version: number;
}

export type DimensionSubscriber = (snap: DimensionSnapshot) => void;

export interface DimensionStore {
  get(): DimensionSnapshot;
  subscribe(fn: DimensionSubscriber): () => void;
  /** Append a dimension. Throws on duplicate id. */
  add(dim: LinearDimension): void;
  /** Replace a dimension wholesale, preserving list order. Throws if unknown. */
  replace(dim: LinearDimension): void;
  /** Remove by id. No-op when absent. */
  remove(id: DimensionId): void;
  clear(): void;
  /** Fresh, unused dimension id. */
  newId(): DimensionId;
}

function emptyByView(): Record<SketchViewKind, readonly LinearDimension[]> {
  const out = {} as Record<SketchViewKind, readonly LinearDimension[]>;
  for (const k of SKETCH_VIEW_KINDS) out[k] = Object.freeze([]);
  return out;
}

const EMPTY: DimensionSnapshot = Object.freeze({
  dimensions: Object.freeze([]) as readonly LinearDimension[],
  byId: Object.freeze({}) as Readonly<Record<string, LinearDimension>>,
  byView: Object.freeze(emptyByView()),
  version: 0,
});

function freezeDimension(d: LinearDimension): LinearDimension {
  return Object.freeze({
    id: d.id,
    kind: d.kind,
    view: d.view,
    p1: d.p1,
    p2: d.p2,
    offsetMm: d.offsetMm,
    stringRank: d.stringRank,
    drivingConstraintId: d.drivingConstraintId,
  });
}

function validate(d: LinearDimension, where: string): void {
  if (d.p1 === d.p2) {
    throw new Error(`dimensionStore.${where}: a dimension needs two distinct points.`);
  }
  if (!Number.isFinite(d.offsetMm)) {
    throw new Error(`dimensionStore.${where}: offsetMm must be finite (got ${d.offsetMm}).`);
  }
  if (!SKETCH_VIEW_KINDS.includes(d.view)) {
    throw new Error(`dimensionStore.${where}: unknown view "${String(d.view)}".`);
  }
}

export function createDimensionStore(): DimensionStore {
  let snap: DimensionSnapshot = EMPTY;
  const subscribers = new Set<DimensionSubscriber>();
  let counter = 0;

  function notify(): void {
    for (const fn of subscribers) fn(snap);
  }

  function rebuild(dimensions: readonly LinearDimension[]): void {
    const byId: Record<string, LinearDimension> = {};
    const grouped = {} as Record<SketchViewKind, LinearDimension[]>;
    for (const k of SKETCH_VIEW_KINDS) grouped[k] = [];
    for (const d of dimensions) {
      byId[d.id] = d;
      grouped[d.view].push(d);
    }
    const byView = {} as Record<SketchViewKind, readonly LinearDimension[]>;
    for (const k of SKETCH_VIEW_KINDS) byView[k] = Object.freeze(grouped[k]);
    snap = Object.freeze({
      dimensions: Object.freeze([...dimensions]),
      byId: Object.freeze(byId),
      byView: Object.freeze(byView),
      version: snap.version + 1,
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
    add(dim) {
      if (snap.byId[dim.id]) {
        throw new Error(`dimensionStore.add: duplicate id "${dim.id}".`);
      }
      validate(dim, 'add');
      rebuild([...snap.dimensions, freezeDimension(dim)]);
      notify();
    },
    replace(dim) {
      if (!snap.byId[dim.id]) {
        throw new Error(`dimensionStore.replace: unknown id "${dim.id}".`);
      }
      validate(dim, 'replace');
      const next = freezeDimension(dim);
      rebuild(snap.dimensions.map((d) => (d.id === dim.id ? next : d)));
      notify();
    },
    remove(id) {
      if (!snap.byId[id]) return;
      rebuild(snap.dimensions.filter((d) => d.id !== id));
      notify();
    },
    clear() {
      if (snap.dimensions.length === 0) return;
      snap = Object.freeze({ ...EMPTY, version: snap.version + 1 });
      notify();
    },
    newId() {
      counter += 1;
      return `dim-${counter.toString(36)}` as DimensionId;
    },
  };
}
