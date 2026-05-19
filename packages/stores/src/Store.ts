// Store<T> — the L1 base class.
//
// Spec: `phases/PHASE-1A-Q1-M1-M3-SKELETON-RAILS.md` §S05-T1 (line 506):
//   "applyPatch(patches: Patch[]) → DirtyDiff + subscribeDirty(diff => ...)
//    → Disposer + getState()."
//
// Patterns mirrored from `src/elements/walls/WallStore.ts` (lines 75–80,
// 79+):
//   * Map<Id, T> indexed by stable string id.
//   * Object.freeze on each entry (clone-on-read = read-only contract).
//   * Listener API with explicit unsubscribe.
//
// Where we DIFFER from PRYZM 1:
//   * Mutations land via `applyPatch(immerPatches)`, not bespoke
//     `add/update/remove` methods.  Patches arrive from the
//     `@pryzm/command-bus` (handlers produce them via `produceCommand`),
//     which closes the "events first, materialise later" loop ADR-002
//     opens.
//   * We emit a per-call `DirtyDiff` (Set<Id> per kind) instead of one
//     event per element — the committer batches per tick, so the L1→L5
//     fan-out is one call regardless of the number of mutated entities.
//   * No `Object.freeze` of the inner Map — listeners receive
//     `getState()` which returns the same Map; entries are frozen but
//     identity stability of the Map matters for the bindStore hot path.

import { applyPatches, enableMapSet, enablePatches, freeze } from 'immer';
import type { DirtyDiff, DirtyListener, Disposer, Id, Patch } from './types.js';

// `enablePatches` is REQUIRED — `applyPatches()` is a plugin, gated
// behind this opt-in (Immer 10+).  `enableMapSet` is required if a
// downstream Store ever stores Map/Set values; we enable both once at
// import time so consumers don't have to.
enablePatches();
enableMapSet();

interface PatchTouchSummary {
  hadAdd: boolean;
  hadRemove: boolean;
  hadOther: boolean;
}

/** Mutable working copy of the Map handed to internal apply.  We hold
 *  one canonical Map per Store and mutate it in place — the snapshot
 *  passed to listeners is `this.state` itself (typed `ReadonlyMap`). */
export class Store<T extends object> {
  /** Stable name for this store, e.g. `'cube'`, `'wall'`, `'slab'`.
   *  Used by `attachStores()` to route per-store patches from the bus. */
  readonly storeKey: string;

  protected readonly state = new Map<Id, T>();
  protected readonly listeners = new Set<DirtyListener<T>>();

  constructor(storeKey: string) {
    if (typeof storeKey !== 'string' || storeKey.length === 0) {
      throw new Error('[Store] storeKey must be a non-empty string.');
    }
    this.storeKey = storeKey;
  }

  /** Read-only snapshot of the Store's state.  Identity is stable
   *  across calls (mutates in place per the FRAME-tick committer
   *  contract) — DO NOT MUTATE. */
  getState(): ReadonlyMap<Id, T> {
    return this.state;
  }

  /** Subscribe to per-`applyPatch` dirty diffs.  Returns a function
   *  that, when called, removes the listener.  Idempotent — calling
   *  the disposer twice is safe. */
  subscribeDirty(listener: DirtyListener<T>): Disposer {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /** Apply a batch of Immer patches against the Store's state and emit
   *  the resulting `DirtyDiff` to every subscriber.  Returns the diff
   *  for callers that want to react inline (the committer host
   *  forwards it into `commitBatch()`).
   *
   *  Patch path convention (matches `produceCommand(ctx.stores.<key>, …)`):
   *    * `[id]`            — root-level add / replace / remove of an entity
   *    * `[id, ...subPath]` — nested mutation of an entity
   *
   *  The diff is computed by COMPARING THE STATE BEFORE AND AFTER the
   *  patch application — not by trusting the patch op alone — so a
   *  patch that adds-then-removes the same id within one call yields
   *  no diff entry (correct: the post-state is unchanged).  Likewise
   *  an add followed by a nested replace lands as `added` (the entity
   *  was absent before, present after — its history doesn't matter to
   *  the committer). */
  applyPatch(patches: readonly Patch[]): DirtyDiff {
    if (patches.length === 0) {
      return EMPTY_DIFF;
    }

    // 1) Snapshot WHICH ids existed before, plus per-id object identity
    //    for `replace`-detection on root.  We do NOT clone the entries
    //    themselves — immer.applyPatches returns fresh references for
    //    the entities it touches, so identity != identity ⇒ updated.
    const before = new Map<Id, T>(this.state);
    const touched = new Map<Id, PatchTouchSummary>();
    for (const p of patches) {
      const id = p.path[0];
      if (typeof id !== 'string' || id.length === 0) {
        // Defensive: a patch with an empty path would target the Map
        // itself, which is not a supported mutation shape.  We throw
        // so the bug surfaces at the source rather than silently
        // mis-attributing the change.
        throw new Error(
          `[Store:${this.storeKey}] received patch with non-string root path: ${JSON.stringify(p.path)}`,
        );
      }
      const summary = touched.get(id) ?? { hadAdd: false, hadRemove: false, hadOther: false };
      if (p.path.length === 1) {
        if (p.op === 'add') summary.hadAdd = true;
        else if (p.op === 'remove') summary.hadRemove = true;
        else summary.hadOther = true;
      } else {
        summary.hadOther = true;
      }
      touched.set(id, summary);
    }

    // 2) Build a Record<Id, T> view of the Map for immer.applyPatches
    //    (immer doesn't apply paths against Map keys), then write the
    //    result back into the canonical Map.
    const recordView: Record<Id, T> = Object.fromEntries(this.state);
    const next = applyPatches(recordView, patches as Patch[]);

    // 3) Reconcile the canonical Map with `next`.  We iterate `next`
    //    once for adds/updates and once over `before` for removes, so
    //    the work is O(touched + before) — already minimal.
    const added = new Set<Id>();
    const updated = new Set<Id>();
    const removed = new Set<Id>();
    for (const [id, summary] of touched) {
      const wasPresent = before.has(id);
      const isPresent = Object.prototype.hasOwnProperty.call(next, id) && next[id] !== undefined;
      if (!wasPresent && isPresent) {
        added.add(id);
        this.state.set(id, freeze(next[id], true) as T);
      } else if (wasPresent && !isPresent) {
        removed.add(id);
        this.state.delete(id);
      } else if (wasPresent && isPresent) {
        // Updated only if the patch actually touched the entity.
        // (`touched` ALWAYS contains a summary here since we built
        // `touched` from `patches`.)
        if (summary.hadAdd || summary.hadOther) {
          updated.add(id);
          this.state.set(id, freeze(next[id], true) as T);
        } else if (summary.hadRemove) {
          // Defensive: a root `remove` followed by a re-`add` of the
          // same id would land here only if `before` and `next` agree
          // — practically a no-op, omit from the diff.
        }
      }
      // absent → absent: omitted from the diff.
    }

    if (added.size === 0 && updated.size === 0 && removed.size === 0) {
      return EMPTY_DIFF;
    }
    const diff: DirtyDiff = { added, updated, removed };
    // Notify subscribers.  We snapshot the listener set so a listener
    // that unsubscribes mid-iteration doesn't perturb the loop.
    for (const listener of [...this.listeners]) {
      listener(diff, this.state);
    }
    return diff;
  }

  /** Number of entities currently in the Store. */
  size(): number {
    return this.state.size;
  }

  /** Wholesale clear used by tests + bootstrap reset.  Notifies
   *  subscribers as a single `removed`-only diff. */
  clear(): void {
    if (this.state.size === 0) return;
    const removed = new Set<Id>(this.state.keys());
    this.state.clear();
    const diff: DirtyDiff = { added: EMPTY_SET, updated: EMPTY_SET, removed };
    for (const listener of [...this.listeners]) {
      listener(diff, this.state);
    }
  }
}

const EMPTY_SET: ReadonlySet<Id> = Object.freeze(new Set<Id>());
const EMPTY_DIFF: DirtyDiff = Object.freeze({
  added: EMPTY_SET,
  updated: EMPTY_SET,
  removed: EMPTY_SET,
});
