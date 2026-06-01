# L0 persistence-client — S03 design doc

> Status: design ratified at S03; full IndexedDB implementation lands in
> S04 alongside ADR-004 (codec choice).
>
> Owner package: `packages/persistence-client/`.
>
> Source spec: `docs/03-execution/plans/legacy/phases/PHASE-1/1A-Q1-M1-M3-SKELETON-RAILS.md` §S03-T6..T9 (lines 374–377).

## Why this package exists

Every command that mutates project state passes through the L2
command-bus and emits an `EventRecord` (see `packages/command-bus/src/types.ts`).
The L0 persistence-client is the single owner of those events on disk.
Its responsibilities are:

1. Assign a monotonic, gap-free **sequence number** to every emitted event.
2. Serialise concurrent writes so the on-disk order matches the order in
   which `executeCommand` calls resolved (mitigates **R1A-06** —
   "concurrent IndexedDB writes corrupt the transaction"; spec line 406).
3. Persist events durably (the IDB transaction has committed) before the
   `append()` promise resolves.
4. Replay events in ascending seq order for cold-load + L3 sync.
5. Record a **checkpoint** marker advanced by the L3 sync engine once a
   range of events has been uploaded; everything `seq <= checkpoint` is
   eligible for garbage collection (S04 deliverable).

The persistence-client is **L0** — it has no dependency on THREE,
DOM-only APIs (other than IndexedDB), or any other PRYZM 2 layer except
`@pryzm/command-bus` (for the `EventRecord` type).  This is enforced by
`eslint-plugin-boundaries` in the root flat-config.

## Public API

```ts
import {
  EventLog,
  InMemoryBackend,
  IndexedDbBackend,
  JsonCodec,
  MsgpackCodec,
  type Backend,
  type Codec,
  type PersistedEvent,
} from '@pryzm/persistence-client';

const log = new EventLog(
  new IndexedDbBackend({ projectId: 'p-7' }),
);

await log.append(eventRecord);          // → PersistedEvent { seq: 1, … }
for await (const ev of log.replay(0)) {/* … */}
await log.checkpoint(1_000);            // L3 sync acks
await log.close();
```

### `EventLog.append(event) → Promise<PersistedEvent>`

- Resolves AFTER the backend reports durable commit.
- Concurrent calls are serialised via an internal single-writer queue —
  the returned promise reflects this caller's outcome, but failures do
  NOT poison the queue (later appends still execute).
- Sequence is assigned **synchronously** at call time so concurrent
  callers get unique, monotonic seq numbers regardless of resolve order.

### `EventLog.replay(fromSeq = 0) → AsyncIterable<PersistedEvent>`

- Yields events in ascending seq order.  No gaps.
- Backend snapshots the cursor at iteration start; appends issued AFTER
  iteration began MAY or MAY NOT appear (backend-defined).

### `EventLog.checkpoint(seq) → Promise<void>`

- Marks `seq` as durably synced upstream.  Strictly monotonic — backwards
  checkpoints throw `RangeError`.
- S03: the value is recorded but no GC occurs.
- S04: backends with bounded storage MAY trim events with `seq <= seq`
  ONLY after the L3 sync engine confirms the corresponding snapshot
  upload (separate ADR).

### Wire format — `PersistedEvent`

```ts
interface PersistedEvent<TPayload = unknown> {
  readonly seq: number;            // monotonic, gap-free
  readonly version: number;        // PERSISTED_EVENT_VERSION (=1)
  readonly persistedAt: string;    // ISO-8601, set at append() time
  readonly event: EventRecord<TPayload>;  // command-bus output, unchanged
}
```

The `version` field exists so future schema changes are detectable
without re-reading the entire log.  Bumping `PERSISTED_EVENT_VERSION`
requires:

1. A new ADR documenting the migration path.
2. A migration script that runs on `EventLog` construction when older
   versions are detected.
3. A bump of `IDB_DB_VERSION` so the upgrade hook fires.

## Backends

| Backend            | Status (S03) | When to use |
|--------------------|--------------|-------------|
| `InMemoryBackend`  | full impl    | Unit tests; codec spike; future S20+ replay tools. |
| `IndexedDbBackend` | sketch       | Browser persistence. Schema frozen; `idb` calls wired; ratified S04 alongside ADR-004. |

### IndexedDB schema (frozen at S03)

> **Do not change without bumping `IDB_DB_VERSION` and shipping a migration.**

```
DB:        `pryzm-eventlog-${projectId}`
Version:   1
Stores:
  events (keyPath: 'seq')
    value: PersistedEvent
  meta   (keyPath: 'key')
    record: { key: 'checkpoint', seq: number }
```

Per-project DB names mean a `clear-storage()` for project A leaves
project B untouched (mitigates the PRYZM-1 cross-project contamination
class — same family of bug as **R1A-13**).

### Single-writer queue (R1A-06 mitigation)

Both `EventLog` and `IndexedDbBackend` chain every write onto the same
promise.  This is belt-and-braces:

- IDB serialises overlapping read-write transactions on the same store
  internally, but the order is not guaranteed across concurrently
  opened transactions.
- The chained-promise design surfaces the order to callers and
  short-circuits a second `tx.objectStore.put` if the first is still in
  flight.
- Failed writes do NOT poison the queue — the queue catches the
  rejection internally so the next caller can still attempt their
  write.  The originating caller still receives the rejection.

## Codecs

| Codec         | name        | Use                                |
|---------------|-------------|-----------------------------------|
| `JsonCodec`   | `'json'`    | Comparison rung, transparent dump. |
| `MsgpackCodec`| `'msgpack'` | Wire format candidate (ADR-004).   |

The `Codec` interface is symmetric `encode` / `decode` over
`PersistedEvent`.  S03 ships JSON + MessagePack; the `apps/bench/src/benches/codec-spike.bench.ts`
benchmark records bytes-per-event, encode speed, and decode speed for
the ADR-004 draft.  S04 ratifies the choice and wires the chosen codec
into `IndexedDbBackend` (encoding to a `Uint8Array` column instead of
storing the structured-clone `PersistedEvent` directly).

## Tests

| File                                        | Coverage |
|--------------------------------------------|----------|
| `__tests__/in-memory-backend.test.ts`      | 1K-event round-trip; concurrent appends; checkpoint monotonicity; closed-after-close; backend-failure resilience. |
| `__tests__/codecs.test.ts`                 | Round-trip both codecs; empty-patches edge case; size sanity (msgpack < json). |
| `__tests__/indexed-db-backend.test.ts`     | IDB schema constants frozen; round-trip; `replay(fromSeq)` filtering; checkpoint persistence; concurrent-append ordering; integration with `EventLog`. Uses `fake-indexeddb/auto` shim because Node 20 has no native IDB. |

## References

- `docs/03-execution/plans/legacy/phases/PHASE-1/1A-Q1-M1-M3-SKELETON-RAILS.md` §S03-T6..T9 (lines 374–377)
- `docs/02-decisions/adrs/0004-msgpack-codec.md` (draft — ratified S04)
- `packages/command-bus/src/types.ts` — `EventRecord` shape
- `packages/persistence-client/src/types.ts` — public type surface
