// attachStores — bus → stores glue.
//
// Subscribes to a `PatchEmitter` and routes per-store patches to the
// matching Store<T> instance.  Returns a `detach()` Disposer so
// bootstrap teardown is one call.
//
// The CommandBus emits `EventRecord` whose `patches: PatchSnapshotEntry[]`
// is grouped by `storeKey` (the handler's `affectedStores` ordering).
// We look up `stores[entry.storeKey]` and forward `entry.forwardPatches`
// to that Store's `applyPatch()`.  Stores not present in the registry
// are silently skipped — bootstrap may register stores incrementally.

import type { EventRecord, PatchEmitter } from '@pryzm/command-bus';
import type { Store } from './Store.js';

export interface AttachStoresOptions {
  /** Called when a record references a `storeKey` we don't have a
   *  Store for.  Default: silent skip (bootstrap-friendly).  Pass a
   *  callback to surface unknown keys in dev. */
  readonly onUnknownStore?: (storeKey: string, record: EventRecord) => void;
}

export function attachStores(
  emitter: PatchEmitter,
  stores: Readonly<Record<string, Store<object>>>,
  opts: AttachStoresOptions = {},
): () => void {
  const onUnknownStore = opts.onUnknownStore;
  const unsubscribe = emitter.subscribe((_bytes, record) => {
    for (const entry of record.patches) {
      const store = stores[entry.storeKey];
      if (store === undefined) {
        if (onUnknownStore !== undefined) onUnknownStore(entry.storeKey, record);
        continue;
      }
      store.applyPatch(entry.forwardPatches);
    }
  });
  return unsubscribe;
}
