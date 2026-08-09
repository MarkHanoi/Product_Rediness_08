// attachStores — bus → stores glue.
//
// Subscribes to a `PatchEmitter` and routes per-store patches to the
// matching Store<T> instance.  Returns a `detach()` Disposer so
// bootstrap teardown is one call.
//
// The CommandBus emits `EventRecord` whose `patches: PatchSnapshotEntry[]`
// is grouped by `storeKey` (the handler's `affectedStores` ordering).
// We look up `stores[entry.storeKey]` and forward `entry.forwardPatches`
// to that Store's `applyPatch()`.
//
// ── §FIX-SILENT-PATCH-DROP (L-811, 2026-08-09) ──────────────────────────────
//
// A patch whose `storeKey` has no registered Store used to be dropped in
// COMPLETE SILENCE, and the production call site (`apps/editor/src/bootstrap.ts`)
// passes no options, so silence was the live behaviour.
//
// Today the consequence is bounded but real: a command executes, the bus emits
// its patches, routing drops them, and the user's edit does nothing — with no
// error anywhere. The snapshot then faithfully serialises the state in which the
// edit did not happen, so persistence looks perfectly healthy.
//
// Under the delta persistence of ADR-0311 the same silence becomes PERMANENT,
// UNDETECTABLE DATA LOSS: the patch is written to the durable stream, dropped
// locally, and replayed by any peer that does have that store registered. The
// document diverges and nothing reports it. That is why this is a P0 blocker on
// Phase 1 (L-811) and why the guard belongs here whether or not T3 ever ships.
//
// WHY THE DEFAULT IS LOUD BUT NOT FATAL. The original silence had a genuine
// justification — "bootstrap may register stores incrementally", so a patch can
// legitimately arrive before its Store exists. Throwing by default would turn a
// benign boot ordering into a crash. So the default REPORTS each unknown key
// once, with a running count of patches dropped for it: loud enough that nobody
// can miss it, cheap enough to leave on in production, and it does not invent a
// failure where the old behaviour was legitimately tolerant.
//
// `strict: true` is the opt-in that throws, and is what the delta-persistence
// work turns on — at that point a dropped patch stops being a tolerable boot
// race and becomes corruption.
//
// Once per KEY, not once per patch: a per-patch log on a hot command is noise,
// and noise gets silenced, which is exactly how this class of defect returns.

import type { EventRecord, PatchEmitter } from '@pryzm/command-bus';
import type { Store } from './Store.js';

export interface AttachStoresOptions {
  /**
   * Called when a record references a `storeKey` we have no Store for.
   *
   * Supplying this REPLACES the default report — a caller that has taken
   * responsibility for surfacing unknown keys should not also get the built-in
   * log. Supplying nothing no longer means silence (see the header).
   */
  readonly onUnknownStore?: (storeKey: string, record: EventRecord) => void;
  /**
   * Throw on an unknown `storeKey` instead of reporting and continuing.
   *
   * ⚠ Turn this on once patches are DURABLE (ADR-0311). A delta system may not
   * drop a patch it has already committed to a stream — at that point silence is
   * not tolerance, it is divergence. Off by default so incremental bootstrap
   * ordering stays survivable.
   */
  readonly strict?: boolean;
}

export function attachStores(
  emitter: PatchEmitter,
  stores: Readonly<Record<string, Store<object>>>,
  opts: AttachStoresOptions = {},
): () => void {
  const onUnknownStore = opts.onUnknownStore;
  const strict = opts.strict === true;
  /** storeKey → patches dropped, so the report can say how much was lost. */
  const dropped = new Map<string, number>();

  const unsubscribe = emitter.subscribe((_bytes, record) => {
    for (const entry of record.patches) {
      const store = stores[entry.storeKey];
      if (store === undefined) {
        if (strict) {
          throw new Error(
            `[attachStores] §FIX-SILENT-PATCH-DROP (L-811) — no Store registered for ` +
            `'${entry.storeKey}', so ${entry.forwardPatches.length} patch(es) from ` +
            `command '${record.type}' would be DROPPED. strict mode refuses: a durable ` +
            `patch stream must not lose a patch it has already committed.`,
          );
        }
        if (onUnknownStore !== undefined) {
          onUnknownStore(entry.storeKey, record);
          continue;
        }
        const before = dropped.get(entry.storeKey) ?? 0;
        dropped.set(entry.storeKey, before + entry.forwardPatches.length);
        if (before === 0) {
          // First sighting of this key only — see the header on why not per-patch.
          console.error(
            `[attachStores] §FIX-SILENT-PATCH-DROP (L-811) — no Store registered for ` +
            `'${entry.storeKey}'. Patches from '${record.type}' are being DROPPED, so that ` +
            `command has no effect. Either register the store, or declare the correct ` +
            `\`affectedStores\` on the handler. Further drops for this key are counted, ` +
            `not logged.`,
          );
        }
        continue;
      }
      store.applyPatch(entry.forwardPatches);
    }
  });
  return unsubscribe;
}
