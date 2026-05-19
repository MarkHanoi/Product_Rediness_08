// attachEventLog — wire `command-bus.PatchEmitter` to the L0 `EventLog`.
//
// Spec: `phases/PHASE-1A-Q1-M1-M3-SKELETON-RAILS.md` §S04-T3 (line 437):
//
//   "Wire `EventLog` into `command-bus.PatchEmitter` (D4, Agent A):
//    end-to-end: command → patches → event → log."
//
// The PatchEmitter (S02) is the single broadcast channel for every
// committed `EventRecord` produced by the `CommandBus`.  This helper
// subscribes the EventLog to that channel so every successful
// `executeCommand()` is durably persisted with no extra wiring at the
// call site.
//
// The chain shape matches the spec event envelope (line 437):
//   `{ commandId: ULID, seq: number, version: number,
//      patches: PatchSnapshotEntry[],
//      audit: { actorId, projectId, clientId, timestamp } }`
// — `commandId` is `EventRecord.id` (a ULID per ADR-001), `seq` and
// `version` are added by the EventLog at append time, and the rest of
// the payload travels verbatim from the bus.
//
// Concurrency model:
//   * The EventLog's single-writer queue (R1A-06 mitigation, see
//     `EventLog.ts` line 38) absorbs the burst — the listener fires
//     synchronously from the emitter; the resulting `append` promise is
//     queued and resolves out-of-band.
//   * `attachEventLog` returns BOTH the `unsubscribe()` function (so
//     callers can detach the listener) AND a `flush()` helper that
//     awaits the in-flight append queue — useful for tests that need
//     to assert on the persisted state right after `executeCommand()`.
//   * If the EventLog rejects (e.g. backend disk full), the `onError`
//     callback fires.  By default rejections are surfaced via
//     `console.error` so a missed listener doesn't silently drop data.
//
// This module is the ONLY place the L0 client knows about L2 — the
// dependency direction stays L0-clean (the L2 `EventRecord` type is
// re-exported by L0 via the shared `command-bus` package, no L0→L2
// runtime import is introduced).

import type { EventRecord } from '@pryzm/command-bus';
import type { EventLog } from './EventLog.js';
import type { PersistedEvent } from './types.js';

/** Minimal structural view of the L2 PatchEmitter — declared here so this
 *  module does NOT import from `@pryzm/command-bus` at runtime (L0 stays
 *  free of direct L2 deps; the type-only import above is erased). */
export interface PatchEmitterLike {
  subscribe(listener: (bytes: Uint8Array, record: EventRecord) => void): () => void;
}

export interface AttachOptions {
  /** Called after every successful append, with the freshly persisted event. */
  onPersisted?: (persisted: PersistedEvent) => void;
  /** Called when the EventLog rejects an append.  Defaults to `console.error`. */
  onError?: (err: unknown, record: EventRecord) => void;
}

export interface EventLogAttachment {
  /** Detach the listener.  Idempotent. */
  readonly unsubscribe: () => void;
  /**
   * Await every append that was issued before this call.  Useful in
   * tests immediately after `executeCommand()` — the listener fires
   * synchronously but the actual write is queued, so the persisted
   * state is only observable after `flush()` resolves.
   */
  readonly flush: () => Promise<void>;
}

const defaultOnError = (err: unknown, record: EventRecord): void => {
  // eslint-disable-next-line no-console
  console.error(
    `[attachEventLog] failed to append event ${record.id} (${record.type}):`,
    err,
  );
};

export function attachEventLog(
  emitter: PatchEmitterLike,
  log: EventLog,
  opts: AttachOptions = {},
): EventLogAttachment {
  const onError = opts.onError ?? defaultOnError;
  // Track every in-flight append so `flush()` is precise — the queue
  // inside EventLog is private; here we keep a parallel set of promises
  // we can `Promise.allSettled` over.
  const inflight = new Set<Promise<void>>();
  let detached = false;

  const listener = (_bytes: Uint8Array, record: EventRecord): void => {
    if (detached) return;
    const p = log
      .append(record)
      .then((persisted) => {
        opts.onPersisted?.(persisted);
      })
      .catch((err) => onError(err, record))
      .finally(() => {
        inflight.delete(p);
      });
    inflight.add(p);
  };
  const unsubscribeRaw = emitter.subscribe(listener);

  return {
    unsubscribe: () => {
      if (detached) return;
      detached = true;
      unsubscribeRaw();
    },
    flush: async () => {
      // Snapshot — `inflight` mutates as appends settle.  `allSettled`
      // because individual rejections are reported via `onError` and
      // `flush()` must not throw on a single bad append.
      while (inflight.size > 0) {
        const snapshot = [...inflight];
        await Promise.allSettled(snapshot);
      }
    },
  };
}
