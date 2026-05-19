// selectionStore — the active sketch selection (S52 D3).
//
// Holds an ordered, deduped list of `EntityId`s. Tools and commands
// read it to decide what to operate on (e.g. "add coincident
// constraint between selection[0] and selection[1]"). Selection
// order matters for the constraint commands — the user clicks the
// reference entity first, then the target.
//
// LAYER — L1-equivalent. Pure: subscribe / get / set, frozen
// snapshots, no THREE, no DOM, no `(window as any)`.

import type { EntityId } from '../sketch/entities.js';

export interface SelectionSnapshot {
  /** Ordered, deduped list of selected entity ids. */
  readonly ids: readonly EntityId[];
  /** Monotonic counter — every mutation increments it. */
  readonly version: number;
}

export type SelectionSubscriber = (snap: SelectionSnapshot) => void;

export interface SelectionStore {
  get(): SelectionSnapshot;
  subscribe(fn: SelectionSubscriber): () => void;
  /** Replace the entire selection with `ids` (deduped, order preserved). */
  set(ids: readonly EntityId[]): void;
  /** Append `id` to the selection if not already present. */
  add(id: EntityId): void;
  /** Toggle `id` — adds when missing, removes when present. */
  toggle(id: EntityId): void;
  /** Remove `id` from the selection. */
  remove(id: EntityId): void;
  /** Drop everything. */
  clear(): void;
  /** Convenience: is `id` in the current selection? */
  has(id: EntityId): boolean;
}

const EMPTY_SNAPSHOT: SelectionSnapshot = Object.freeze({
  ids: Object.freeze([]) as readonly EntityId[],
  version: 0,
});

function dedupe(ids: readonly EntityId[]): EntityId[] {
  const seen = new Set<EntityId>();
  const out: EntityId[] = [];
  for (const id of ids) {
    if (!seen.has(id)) {
      seen.add(id);
      out.push(id);
    }
  }
  return out;
}

export function createSelectionStore(): SelectionStore {
  let snap: SelectionSnapshot = EMPTY_SNAPSHOT;
  const subscribers = new Set<SelectionSubscriber>();

  function notify(): void {
    for (const fn of subscribers) fn(snap);
  }

  function commit(ids: EntityId[]): void {
    snap = Object.freeze({
      ids: Object.freeze([...ids]),
      version: snap.version + 1,
    });
    notify();
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
    set(ids) {
      const next = dedupe(ids);
      const same =
        next.length === snap.ids.length &&
        next.every((id, i) => id === snap.ids[i]);
      if (same) return;
      commit(next);
    },
    add(id) {
      if (snap.ids.includes(id)) return;
      commit([...snap.ids, id]);
    },
    toggle(id) {
      if (snap.ids.includes(id)) {
        commit(snap.ids.filter((x) => x !== id));
      } else {
        commit([...snap.ids, id]);
      }
    },
    remove(id) {
      if (!snap.ids.includes(id)) return;
      commit(snap.ids.filter((x) => x !== id));
    },
    clear() {
      if (snap.ids.length === 0) return;
      commit([]);
    },
    has(id) {
      return snap.ids.includes(id);
    },
  };
}
