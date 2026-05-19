// Patch dispatcher — store DirtyDiff → SceneDelta[] → CommitterHost.commitBatch.
//
// Spec: `phases/PHASE-1A-Q1-M1-M3-SKELETON-RAILS.md` §S05-T4 + T5
// (lines 540-552):
//
//   T4: "CommitterHost.bindStore<T>(store, committer) → Disposable."
//   T5: "Patch dispatcher with per-tick batching: groups adds/removes/
//        updates; coalesces multiple updates to same id."
//
// Design summary:
//   • `diffToDeltas(diff, snapshot, primitiveType)` is the pure helper
//     bench + tests reuse — no batching state, just a translation.
//     Order: removes → adds → updates so the registry frees ids before
//     re-adds in the same flush (defensive against stale ids).
//   • `bindStore(store, primitiveType, host, opts?)` subscribes to the
//     store's `subscribeDirty` and ACCUMULATES touched ids into a single
//     pending Set per kind.  At flush time we look up CURRENT scene
//     presence (`host.registry.has(id)`) and CURRENT store presence
//     (`store.getState().get(id)`) — that's what coalesces N updates
//     to the same id into a SINGLE SceneDelta carrying the latest DTO.
//
//   Coalescing matrix (pre = registry.has, post = store.has):
//
//       pre  post   →  emitted delta
//       ─────────────────────────────────
//       no   no     →  (skipped — was never in scene; net no-op)
//       no   yes    →  add(post)
//       yes  no     →  remove
//       yes  yes    →  update(post)
//
//   That table is why we don't need to track per-id mutation history —
//   the snapshot at flush-time IS the truth.  An add → update → remove
//   sequence within one tick collapses to a no-op.  An add → update
//   collapses to one `add` carrying the latest DTO.
//
// Scheduling:
//   `opts.scheduleFlush` defaults to `queueMicrotask`.  The S05-D6
//   FrameScheduler integration (S06) replaces this with `scheduler.requestFrame`
//   so flushes land on the rAF tick.  Until then queueMicrotask gives
//   us the "one batch per command" semantics tests rely on.
//
// OTel:
//   `commitBatch` itself records `pryzm.scene.batch_size`.  The dispatcher
//   adds `pryzm.scene.added`, `pryzm.scene.updated`, `pryzm.scene.removed`
//   (S05-D6, line 552) by routing through `commitBatch` with attrs.
//   We use a private overload via CommitterHost.commitBatchWithAttrs.

import type { DirtyDiff, DirtyListener, Disposer, Id, Store } from '@pryzm/stores';
import type { CommitterHost, SceneDelta } from './CommitterHost.js';
import type { ElementId } from './types.js';

/** Translate a DirtyDiff + a current store snapshot into the
 *  SceneDelta list a CommitterHost can apply.  Pure — no host
 *  side-effects, no state.  Used by `bindStore.flush` and the
 *  full-pipeline bench (S05-T9). */
export function diffToDeltas<T extends object>(
  diff: DirtyDiff,
  snapshot: ReadonlyMap<Id, T>,
  primitiveType: string,
): SceneDelta[] {
  const deltas: SceneDelta[] = [];
  // Removes first — frees ids in the registry before any re-add of
  // the same id in the same batch (defensive; the partition rule
  // guarantees this can't actually happen within ONE diff, but the
  // dispatcher's accumulator can produce it across multiple diffs
  // before flush).
  for (const id of diff.removed) {
    deltas.push({ kind: 'remove', primitiveType, id: id as ElementId });
  }
  for (const id of diff.added) {
    const dto = snapshot.get(id);
    if (dto === undefined) continue; // race: added then removed before flush
    deltas.push({ kind: 'add', primitiveType, id: id as ElementId, dto });
  }
  for (const id of diff.updated) {
    const dto = snapshot.get(id);
    if (dto === undefined) continue;
    deltas.push({ kind: 'update', primitiveType, id: id as ElementId, dto });
  }
  return deltas;
}

export interface BindStoreOptions {
  /** Schedule the flush.  Default = `queueMicrotask`.  In S06 the
   *  FrameScheduler injects `(flush) => scheduler.requestFrame(flush)`. */
  readonly scheduleFlush?: (flush: () => void) => void;
  /** Awaited inside flush — the bench harness uses this for synchronous
   *  back-pressure.  Default omits the await. */
  readonly onError?: (err: unknown) => void;
}

/** Returned by bindStore — call `flush()` to drain manually (useful
 *  in tests / bench), `dispose()` to detach the listener. */
export interface BindStoreHandle {
  /** Apply any pending deltas immediately.  Idempotent — a no-op when
   *  the pending set is empty.  Returns the Promise from `commitBatch`
   *  (await for back-pressure or to surface errors). */
  flush(): Promise<void>;
  /** Detach the dirty-diff listener.  Pending deltas are NOT flushed
   *  — call `flush()` first if you need them committed before dispose. */
  dispose(): void;
}

interface PendingState {
  readonly added: Set<Id>;
  readonly updated: Set<Id>;
  readonly removed: Set<Id>;
  /** True between schedule and flush — coalesces multiple schedules. */
  scheduled: boolean;
}

/** Subscribe `host`'s commit pipeline to `store`'s dirty diffs.
 *
 *  Per-tick batching: every `subscribeDirty` callback merges its diff
 *  into the pending set; the flush is scheduled exactly once until it
 *  runs.  Multiple updates to the same id collapse to a single
 *  SceneDelta carrying the latest DTO at flush time. */
export function bindStore<T extends object>(
  store: Store<T>,
  primitiveType: string,
  host: CommitterHost,
  opts: BindStoreOptions = {},
): BindStoreHandle {
  const schedule = opts.scheduleFlush ?? defaultSchedule;
  const onError = opts.onError;
  const pending: PendingState = {
    added: new Set(),
    updated: new Set(),
    removed: new Set(),
    scheduled: false,
  };
  let disposed = false;
  // Tracks the in-flight `doFlush()` promise.  Set on entry, cleared on
  // settle (resolve or reject).  `flush()` chains a new pass onto this
  // chain so callers always await the COMPLETE drain — this is what
  // makes the SYNC_SCHEDULE + explicit `await handle.flush()` test path
  // observably correct (S05-T7 100-cube smoke).
  let inFlight: Promise<void> | null = null;

  const listener: DirtyListener<T> = (diff) => {
    mergeDiff(pending, diff);
    if (!pending.scheduled) {
      pending.scheduled = true;
      schedule(() => {
        // The handle below also flips `scheduled` back to false; if we
        // were disposed between schedule and run, just clear and bail.
        if (disposed) {
          pending.scheduled = false;
          pending.added.clear();
          pending.updated.clear();
          pending.removed.clear();
          return;
        }
        void runFlush().catch((err) => {
          if (onError) onError(err);
          else throw err;
        });
      });
    }
  };

  const unsubscribe: Disposer = store.subscribeDirty(listener);

  /** Internal: run a single flush pass, recording it on `inFlight` so
   *  the next caller can chain onto it instead of racing past it.
   *
   *  Critical detail: when no flush is in flight, `doFlush()` is
   *  invoked DIRECTLY (not through `Promise.resolve().then(...)`).
   *  That preserves the OLD invariant that the synchronous prefix of
   *  doFlush — including the first `applyDelta(...)` call inside the
   *  awaited `commitBatchWithCounts(...)` loop — runs BEFORE the
   *  schedule callback returns.  Tests that call SYNC_SCHEDULE +
   *  `applyPatch([oneDelta])` and immediately read `registry.has(id)`
   *  rely on that sync-prefix landing in the registry.
   *
   *  When a flush IS in flight, we chain — that's what fixes the S05-T7
   *  100-cube smoke + S05-T9 full-pipeline bench: a SYNC_SCHEDULE
   *  inline-fired flush is still suspended on its 100 awaited
   *  `applyDelta` microtasks when the test calls `await handle.flush()`,
   *  and the chained pass forces the await to drain the prior pass to
   *  completion before resolving. */
  function runFlush(): Promise<void> {
    let next: Promise<void>;
    if (inFlight === null) {
      // Fast path — invoke directly so the sync prefix runs inline.
      next = doFlush();
    } else {
      next = inFlight.then(() => doFlush());
    }
    inFlight = next;
    // When this pass settles, clear `inFlight` ONLY if no later pass
    // has chained on top.  Settle = resolve OR reject — we don't want a
    // failed flush to block subsequent ones (the caller already
    // received the error via the awaited promise / `onError`).
    next.finally(() => {
      if (inFlight === next) inFlight = null;
    });
    return next;
  }

  async function doFlush(): Promise<void> {
    pending.scheduled = false;
    if (pending.added.size === 0 && pending.updated.size === 0 && pending.removed.size === 0) {
      return;
    }
    // Snapshot then clear — listener calls during the await mustn't
    // mutate the in-flight diff.
    const drained: DirtyDiff = {
      added: new Set(pending.added),
      updated: new Set(pending.updated),
      removed: new Set(pending.removed),
    };
    pending.added.clear();
    pending.updated.clear();
    pending.removed.clear();
    const snapshot = store.getState();
    const deltas = diffToDeltas(drained, snapshot, primitiveType);
    if (deltas.length === 0) return;
    await host.commitBatchWithCounts(deltas, {
      'pryzm.scene.added': drained.added.size,
      'pryzm.scene.updated': drained.updated.size,
      'pryzm.scene.removed': drained.removed.size,
    });
  }

  return {
    flush: () => runFlush(),
    dispose: () => {
      if (disposed) return;
      disposed = true;
      unsubscribe();
    },
  };
}

function mergeDiff(pending: PendingState, diff: DirtyDiff): void {
  // Folding rules across diffs (NOT within one diff — that's already
  // partitioned by Store.applyPatch):
  //
  //   pending\incoming   add        update     remove
  //   ─────────────────────────────────────────────────
  //   (none)         →   added      updated    removed
  //   added          →   added      added      (cancel: drop from added)
  //   updated        →   updated    updated    removed (drop from updated)
  //   removed        →   updated    removed    removed
  //
  // The "added → remove → cancel" path is the one that turns a
  // create-then-undo pair into a no-op at flush.
  for (const id of diff.removed) {
    if (pending.added.has(id)) {
      pending.added.delete(id);
      // Cancel: no scene delta needed — net unchanged.
    } else {
      pending.updated.delete(id);
      pending.removed.add(id);
    }
  }
  for (const id of diff.added) {
    if (pending.removed.has(id)) {
      // remove → re-add ⇒ collapses to update at flush time.
      pending.removed.delete(id);
      pending.updated.add(id);
    } else {
      pending.added.add(id);
    }
  }
  for (const id of diff.updated) {
    // If the id was just added pending, keep it as add; else mark updated.
    if (!pending.added.has(id) && !pending.removed.has(id)) {
      pending.updated.add(id);
    }
  }
}

function defaultSchedule(flush: () => void): void {
  queueMicrotask(flush);
}
