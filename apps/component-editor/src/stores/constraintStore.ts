// constraintStore — the active sketch constraint set (S52 D2).
//
// Holds the list of `SketchConstraint`s authored against the current
// `sketchDocStore`. A separate store (rather than living inside the
// doc store) keeps the §13 LoC cap respected and lets the solver
// runner subscribe to constraint mutations without re-running on
// every line being drawn.
//
// Variable / point / line naming convention exposed to the solver
// (matches `engine.ts` defaults so we don't have to ship explicit
// `pointVariables` / `lineEndpoints` maps in the common case):
//   • point id `pt-N` → variables `pt-N-x`, `pt-N-y`
//   • line  id `ln-N` → endpoints `pt-A`, `pt-B`
//
// LAYER — L1-equivalent. Pure: subscribe / get / set, frozen
// snapshots, no THREE, no DOM, no `(window as any)`.

import type { SketchConstraint } from '@pryzm/constraint-solver';

export type ConstraintId = string & { readonly __brand: 'SketchConstraintId' };

export interface ConstraintSnapshot {
  readonly constraints: readonly SketchConstraint[];
  readonly byId: Readonly<Record<string, SketchConstraint>>;
  /** Monotonic counter — every mutation increments it. */
  readonly version: number;
}

export type ConstraintSubscriber = (snap: ConstraintSnapshot) => void;

export interface ConstraintStore {
  get(): ConstraintSnapshot;
  subscribe(fn: ConstraintSubscriber): () => void;
  /** Append a new constraint. Throws on duplicate id. */
  add(c: SketchConstraint): void;
  /** Remove by id. No-op if missing. */
  remove(id: string): void;
  /** Wipe everything (version still bumps). */
  clear(): void;
  /** Generate a fresh, unused constraint id with the given kind prefix. */
  newId(kind: SketchConstraint['kind']): ConstraintId;
}

const EMPTY: ConstraintSnapshot = Object.freeze({
  constraints: Object.freeze([]) as readonly SketchConstraint[],
  byId: Object.freeze({}) as Readonly<Record<string, SketchConstraint>>,
  version: 0,
});

const KIND_PREFIX: Readonly<Record<SketchConstraint['kind'], string>> = {
  'distance-pp': 'cdist',
  parallel: 'cpar',
  perpendicular: 'cperp',
  'coincident-pp': 'ccoin',
  fixed: 'cfix',
};

export function createConstraintStore(): ConstraintStore {
  let snap: ConstraintSnapshot = EMPTY;
  const subscribers = new Set<ConstraintSubscriber>();
  const counters: Record<string, number> = {};

  function notify(): void {
    for (const fn of subscribers) fn(snap);
  }

  function rebuild(list: readonly SketchConstraint[]): void {
    const byId: Record<string, SketchConstraint> = {};
    for (const c of list) byId[c.id] = c;
    snap = Object.freeze({
      constraints: Object.freeze([...list]),
      byId: Object.freeze(byId),
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
    add(c) {
      if (snap.byId[c.id]) {
        throw new Error(`constraintStore.add: duplicate id "${c.id}".`);
      }
      rebuild([...snap.constraints, c]);
      notify();
    },
    remove(id) {
      if (!snap.byId[id]) return;
      rebuild(snap.constraints.filter((c) => c.id !== id));
      notify();
    },
    clear() {
      if (snap.constraints.length === 0) return;
      snap = Object.freeze({ ...EMPTY, version: snap.version + 1 });
      notify();
    },
    newId(kind) {
      const prefix = KIND_PREFIX[kind];
      const next = (counters[prefix] ?? 0) + 1;
      counters[prefix] = next;
      return `${prefix}-${next.toString(36)}` as ConstraintId;
    },
  };
}
