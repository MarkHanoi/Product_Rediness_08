// L1 stores layer — public types.
//
// Spec: `phases/PHASE-1A-Q1-M1-M3-SKELETON-RAILS.md` §S05-T1 (line 506):
//   "Store<T> base class: applyPatch(patches: Patch[]) → DirtyDiff +
//    subscribeDirty(diff => ...) → Disposer + getState()."
//
// DTO-only.  No THREE imports here (the lint rule
// `pryzm/no-three-outside-committer` enforces this — `packages/stores/`
// is NOT in the allowlist).

import type { Patch } from '@pryzm/command-bus';

/** Identifier of an entity within a single Store.  Stores are keyed by
 *  string — the typed-id brands from `@pryzm/protocol` are erased to
 *  string at the Store boundary so Store<T> can be generic. */
export type Id = string;

/** Per-`applyPatch` diff handed to subscribers.  IDs are partitioned —
 *  an id appears in EXACTLY ONE of `added`, `updated`, `removed` for a
 *  given diff (an add followed by a remove inside the same call yields
 *  no entry; an add followed by a replace yields `added`).  Sets
 *  preserve insertion order which is iteration order. */
export interface DirtyDiff {
  readonly added: ReadonlySet<Id>;
  readonly updated: ReadonlySet<Id>;
  readonly removed: ReadonlySet<Id>;
}

/** Subscribers receive the diff and a snapshot of the post-state.  The
 *  snapshot is the SAME object returned by `store.getState()` until the
 *  next mutation — safe to read but DO NOT MUTATE.  Mutating the
 *  snapshot is undefined behaviour and will throw in dev (entries are
 *  frozen). */
export type DirtyListener<T> = (
  diff: DirtyDiff,
  snapshot: ReadonlyMap<Id, T>,
) => void;

/** A function that, when called, removes a previously-attached listener. */
export type Disposer = () => void;

/** Re-export the Patch shape so callers don't depend on `immer` directly. */
export type { Patch };
